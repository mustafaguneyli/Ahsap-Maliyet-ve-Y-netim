/**
 * PostgreSQL → Firestore kopya. Kaynak silinmez, truncate yok.
 * Belge kimliği mevcut UUID. Para Decimal string.
 */
import * as fs from 'fs';
import * as path from 'path';
import { initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  writeBatch,
} from 'firebase/firestore';
import { Prisma, PrismaClient } from '@prisma/client';
import { FIRESTORE_COLLECTIONS } from '../src/firebase/firestore.collections';

const CHUNK = 400;

type TableSpec = {
  collection: string;
  load: (prisma: PrismaClient) => Promise<Array<{ id: string } & Record<string, unknown>>>;
};

function serializeValue(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  if (value === null) {
    return null;
  }
  if (value instanceof Prisma.Decimal) {
    return value.toString();
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = serializeValue(value);
  }
  return out;
}

function snapshotValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return serializeValue(value);
}

const TABLES: TableSpec[] = [
  { collection: FIRESTORE_COLLECTIONS.productGroups, load: (p) => p.productGroup.findMany() },
  { collection: FIRESTORE_COLLECTIONS.products, load: (p) => p.product.findMany() },
  { collection: FIRESTORE_COLLECTIONS.productSizes, load: (p) => p.productSize.findMany() },
  { collection: FIRESTORE_COLLECTIONS.rawMaterials, load: (p) => p.rawMaterial.findMany() },
  { collection: FIRESTORE_COLLECTIONS.rawMaterialPrices, load: (p) => p.rawMaterialPrice.findMany() },
  { collection: FIRESTORE_COLLECTIONS.productionYields, load: (p) => p.productionYield.findMany() },
  { collection: FIRESTORE_COLLECTIONS.kilcikTypes, load: (p) => p.kilcikType.findMany() },
  {
    collection: FIRESTORE_COLLECTIONS.pervazKilcikYields,
    load: (p) => p.pervazKilcikYield.findMany(),
  },
  { collection: FIRESTORE_COLLECTIONS.recipes, load: (p) => p.recipe.findMany() },
  { collection: FIRESTORE_COLLECTIONS.recipeItems, load: (p) => p.recipeItem.findMany() },
  { collection: FIRESTORE_COLLECTIONS.extraCostTypes, load: (p) => p.extraCostType.findMany() },
  { collection: FIRESTORE_COLLECTIONS.extraCostValues, load: (p) => p.extraCostValue.findMany() },
  { collection: FIRESTORE_COLLECTIONS.pricingSettings, load: (p) => p.pricingSetting.findMany() },
  {
    collection: FIRESTORE_COLLECTIONS.pricingThicknessModifiers,
    load: (p) => p.pricingThicknessModifier.findMany(),
  },
  {
    collection: FIRESTORE_COLLECTIONS.pricingRowExceptions,
    load: (p) => p.pricingRowException.findMany(),
  },
  { collection: FIRESTORE_COLLECTIONS.priceOverrides, load: (p) => p.priceOverride.findMany() },
  {
    collection: FIRESTORE_COLLECTIONS.productPricingOverrides,
    load: (p) => p.productPricingOverride.findMany(),
  },
  {
    collection: FIRESTORE_COLLECTIONS.citaPublishedPriceBands,
    load: (p) => p.citaPublishedPriceBand.findMany(),
  },
  {
    collection: FIRESTORE_COLLECTIONS.citaPublishedPriceBandThicknesses,
    load: (p) => p.citaPublishedPriceBandThickness.findMany(),
  },
  { collection: FIRESTORE_COLLECTIONS.orderDocuments, load: (p) => p.orderDocument.findMany() },
  { collection: FIRESTORE_COLLECTIONS.orderLines, load: (p) => p.orderLine.findMany() },
  {
    collection: FIRESTORE_COLLECTIONS.orderMaterialLines,
    load: (p) => p.orderMaterialLine.findMany(),
  },
  { collection: FIRESTORE_COLLECTIONS.auditEvents, load: (p) => p.auditEvent.findMany() },
];

async function writeCollection(
  db: ReturnType<typeof getFirestore>,
  collectionName: string,
  rows: Array<{ id: string } & Record<string, unknown>>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const row of slice) {
      if (!row.id) {
        throw new Error(`${collectionName} satırında id yok.`);
      }
      batch.set(doc(db, collectionName, row.id), serializeRow(row));
    }
    await batch.commit();
  }
}

async function countCollection(
  db: ReturnType<typeof getFirestore>,
  collectionName: string,
): Promise<number> {
  const snap = await getDocs(collection(db, collectionName));
  return snap.size;
}

async function main(): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const apiKey = process.env.FIREBASE_API_KEY?.trim();
  if (!projectId || !apiKey) {
    throw new Error('FIREBASE_PROJECT_ID ve FIREBASE_API_KEY backend/.env içinde olmalı.');
  }

  const prisma = new PrismaClient();
  const app = initializeApp({
    apiKey,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
  });
  const db = getFirestore(app);

  const report: Array<Record<string, unknown>> = [];
  const snapshot: Record<string, unknown[]> = {};

  try {
    for (const table of TABLES) {
      const rows = await table.load(prisma);
      snapshot[table.collection] = rows.map((row) => {
        const plain: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          plain[key] = snapshotValue(value);
        }
        return plain;
      });

      await writeCollection(db, table.collection, rows);
      const firestoreCount = await countCollection(db, table.collection);
      const ok = firestoreCount === rows.length;
      report.push({
        collection: table.collection,
        postgres: rows.length,
        firestore: firestoreCount,
        ok,
      });
      console.log(
        `${ok ? 'OK' : 'FAIL'} ${table.collection} pg=${rows.length} fs=${firestoreCount}`,
      );
      if (!ok) {
        throw new Error(`${table.collection} sayısı eşleşmedi; PostgreSQL dokunulmadı.`);
      }
    }
  } finally {
    const secretsDir = path.join(__dirname, '..', 'secrets');
    fs.mkdirSync(secretsDir, { recursive: true });
    fs.writeFileSync(
      path.join(secretsDir, 'firestore-pg-snapshot.json'),
      JSON.stringify({ at: new Date().toISOString(), snapshot }, null, 2),
    );
    fs.writeFileSync(
      path.join(secretsDir, 'firestore-migrate-report.json'),
      JSON.stringify({ at: new Date().toISOString(), report }, null, 2),
    );
    await prisma.$disconnect();
  }

  const failed = report.filter((row) => row.ok !== true);
  if (failed.length) {
    process.exitCode = 1;
    console.error('EKSİK KOPYA', failed);
    return;
  }
  console.log('KOPYA TAMAM. PostgreSQL silinmedi.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
