/**
 * PG ↔ Firestore ID/adet/lookup doğrulaması. Yazmaz, eksik CASH/CARD doldurmaz.
 */
import { initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { MaterialPriceType, PrismaClient } from '@prisma/client';
import { FIRESTORE_COLLECTIONS } from '../src/firebase/firestore.collections';
import { findActiveProductionYield, selectCurrentMaterialPriceFromDocs } from '../src/data-store/firestore-lookups';
import { resolveRecipeWithItems, type RecipeDoc, type RecipeItemDoc } from '../src/data-store/firestore-recipe';
import { selectCurrentMaterialPrice } from '../src/modules/cost-calculation/current-material-price';

const EXPECTED = {
  auditEvents: 187,
  productionYields: 195,
  rawMaterialPrices: 61,
  recipes: 1,
  recipeItems: 1,
} as const;

function openFirestore() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const apiKey = process.env.FIREBASE_API_KEY?.trim();
  if (!projectId || !apiKey) {
    throw new Error('FIREBASE_PROJECT_ID ve FIREBASE_API_KEY gerekli.');
  }
  const app = initializeApp({
    apiKey,
    projectId,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  });
  return getFirestore(app);
}

async function loadFs(
  db: ReturnType<typeof getFirestore>,
  name: string,
): Promise<Array<Record<string, unknown>>> {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const db = openFirestore();
    const [pgAudit, pgYields, pgPrices, pgRecipes, pgItems, fsAudit, fsYields, fsPrices, fsRecipes, fsItems] =
      await Promise.all([
        prisma.auditEvent.count(),
        prisma.productionYield.findMany(),
        prisma.rawMaterialPrice.findMany(),
        prisma.recipe.findMany(),
        prisma.recipeItem.findMany(),
        loadFs(db, FIRESTORE_COLLECTIONS.auditEvents),
        loadFs(db, FIRESTORE_COLLECTIONS.productionYields),
        loadFs(db, FIRESTORE_COLLECTIONS.rawMaterialPrices),
        loadFs(db, FIRESTORE_COLLECTIONS.recipes),
        loadFs(db, FIRESTORE_COLLECTIONS.recipeItems),
      ]);

    const now = new Date();
    const checks: string[] = [];

    if (pgAudit !== EXPECTED.auditEvents || fsAudit.length !== EXPECTED.auditEvents) {
      checks.push(`audit adet sapması pg=${pgAudit} fs=${fsAudit.length}`);
    }
    if (pgYields.length !== EXPECTED.productionYields || fsYields.length !== EXPECTED.productionYields) {
      checks.push(`NET adet sapması pg=${pgYields.length} fs=${fsYields.length}`);
    }
    if (pgPrices.length !== EXPECTED.rawMaterialPrices || fsPrices.length !== EXPECTED.rawMaterialPrices) {
      checks.push(`fiyat adet sapması pg=${pgPrices.length} fs=${fsPrices.length}`);
    }
    if (pgRecipes.length !== EXPECTED.recipes || fsRecipes.length !== EXPECTED.recipes) {
      checks.push(`reçete adet sapması pg=${pgRecipes.length} fs=${fsRecipes.length}`);
    }
    if (pgItems.length !== EXPECTED.recipeItems || fsItems.length !== EXPECTED.recipeItems) {
      checks.push(`reçete satırı sapması pg=${pgItems.length} fs=${fsItems.length}`);
    }

    const fsYieldIds = new Set(fsYields.map((row) => String(row.id)));
    for (const row of pgYields) {
      if (!fsYieldIds.has(row.id)) {
        checks.push(`NET id kayıp: ${row.id}`);
      }
      const found = findActiveProductionYield(
        fsYields.map((doc) => ({
          id: String(doc.id),
          rawMaterialId: String(doc.rawMaterialId),
          productId: (doc.productId as string | null) ?? null,
          pieceWidthMm: Number(doc.pieceWidthMm),
          pieceLengthMm: Number(doc.pieceLengthMm),
          netQty: Number(doc.netQty),
          isActive: doc.isActive === true,
        })),
        {
          rawMaterialId: row.rawMaterialId,
          pieceWidthMm: row.pieceWidthMm,
          pieceLengthMm: row.pieceLengthMm,
          productId: row.productId,
        },
      );
      if (row.isActive && found?.netQty !== row.netQty) {
        checks.push(`NET lookup sapması ${row.id}`);
      }
    }

    const materialIds = [...new Set(pgPrices.map((row) => row.rawMaterialId))];
    for (const materialId of materialIds) {
      const pgOf = pgPrices.filter((row) => row.rawMaterialId === materialId);
      const fsOf = fsPrices.filter((row) => row.rawMaterialId === materialId);
      for (const priceType of [MaterialPriceType.CASH, MaterialPriceType.CARD_INSTALLMENT]) {
        const pgCurrent = selectCurrentMaterialPrice(pgOf, priceType, now);
        const fsCurrent = selectCurrentMaterialPriceFromDocs(fsOf, priceType, now);
        if ((pgCurrent?.id ?? null) !== (fsCurrent?.id ?? null)) {
          checks.push(`fiyat lookup sapması ${materialId} ${priceType}`);
        }
      }
    }

    for (const recipe of pgRecipes) {
      const resolved = resolveRecipeWithItems(
        fsRecipes as unknown as RecipeDoc[],
        fsItems as unknown as RecipeItemDoc[],
        recipe.productId,
        recipe.productSizeId,
      );
      if (recipe.isActive && resolved?.recipe.id !== recipe.id) {
        checks.push(`reçete ilişki sapması ${recipe.id}`);
      }
    }

    if (checks.length) {
      throw new Error(checks.slice(0, 20).join('; '));
    }
    console.log(
      JSON.stringify({
        ok: true,
        audit: fsAudit.length,
        yields: fsYields.length,
        prices: fsPrices.length,
        recipes: fsRecipes.length,
        recipeItems: fsItems.length,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'verify failed');
  process.exitCode = 1;
});
