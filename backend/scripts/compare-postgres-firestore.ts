/**
 * PostgreSQL ↔ Firestore READ-ONLY parity.
 * Yazmaz, silmez, DATA_STORE değiştirmez, CUTOVER yapmaz.
 */
import * as fs from 'fs';
import * as path from 'path';
import { initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { Prisma, PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import { FIRESTORE_COLLECTIONS } from '../src/firebase/firestore.collections';
import { DATA_STORE_MODEL_MAP } from '../src/data-store/data-store.mapping';

type CountExpectation = { exact?: number; min?: number };

const EXPECTED_COUNTS: Record<string, CountExpectation> = {
  [FIRESTORE_COLLECTIONS.productGroups]: { exact: 6 },
  [FIRESTORE_COLLECTIONS.products]: { exact: 12 },
  [FIRESTORE_COLLECTIONS.productSizes]: { exact: 36 },
  [FIRESTORE_COLLECTIONS.rawMaterials]: { exact: 23 },
  [FIRESTORE_COLLECTIONS.rawMaterialPrices]: { exact: 61 },
  [FIRESTORE_COLLECTIONS.productionYields]: { exact: 195 },
  [FIRESTORE_COLLECTIONS.kilcikTypes]: { exact: 2 },
  [FIRESTORE_COLLECTIONS.pervazKilcikYields]: { exact: 20 },
  [FIRESTORE_COLLECTIONS.recipes]: { exact: 1 },
  [FIRESTORE_COLLECTIONS.recipeItems]: { exact: 1 },
  [FIRESTORE_COLLECTIONS.extraCostTypes]: { exact: 5 },
  [FIRESTORE_COLLECTIONS.extraCostValues]: { exact: 18 },
  [FIRESTORE_COLLECTIONS.pricingSettings]: { exact: 15 },
  [FIRESTORE_COLLECTIONS.pricingThicknessModifiers]: { exact: 3 },
  [FIRESTORE_COLLECTIONS.pricingRowExceptions]: { exact: 22 },
  [FIRESTORE_COLLECTIONS.priceOverrides]: { exact: 4 },
  [FIRESTORE_COLLECTIONS.productPricingOverrides]: { exact: 8 },
  [FIRESTORE_COLLECTIONS.citaPublishedPriceBands]: { exact: 6 },
  [FIRESTORE_COLLECTIONS.citaPublishedPriceBandThicknesses]: { exact: 19 },
  [FIRESTORE_COLLECTIONS.orderDocuments]: { exact: 8 },
  [FIRESTORE_COLLECTIONS.orderLines]: { exact: 9 },
  [FIRESTORE_COLLECTIONS.orderMaterialLines]: { exact: 22 },
  [FIRESTORE_COLLECTIONS.auditEvents]: { min: 187 },
};

const LOADERS: Record<string, (prisma: PrismaClient) => Promise<Array<{ id: string } & Record<string, unknown>>>> = {
  [FIRESTORE_COLLECTIONS.productGroups]: (p) => p.productGroup.findMany(),
  [FIRESTORE_COLLECTIONS.products]: (p) => p.product.findMany(),
  [FIRESTORE_COLLECTIONS.productSizes]: (p) => p.productSize.findMany(),
  [FIRESTORE_COLLECTIONS.rawMaterials]: (p) => p.rawMaterial.findMany(),
  [FIRESTORE_COLLECTIONS.rawMaterialPrices]: (p) => p.rawMaterialPrice.findMany(),
  [FIRESTORE_COLLECTIONS.productionYields]: (p) => p.productionYield.findMany(),
  [FIRESTORE_COLLECTIONS.kilcikTypes]: (p) => p.kilcikType.findMany(),
  [FIRESTORE_COLLECTIONS.pervazKilcikYields]: (p) => p.pervazKilcikYield.findMany(),
  [FIRESTORE_COLLECTIONS.recipes]: (p) => p.recipe.findMany(),
  [FIRESTORE_COLLECTIONS.recipeItems]: (p) => p.recipeItem.findMany(),
  [FIRESTORE_COLLECTIONS.extraCostTypes]: (p) => p.extraCostType.findMany(),
  [FIRESTORE_COLLECTIONS.extraCostValues]: (p) => p.extraCostValue.findMany(),
  [FIRESTORE_COLLECTIONS.pricingSettings]: (p) => p.pricingSetting.findMany(),
  [FIRESTORE_COLLECTIONS.pricingThicknessModifiers]: (p) => p.pricingThicknessModifier.findMany(),
  [FIRESTORE_COLLECTIONS.pricingRowExceptions]: (p) => p.pricingRowException.findMany(),
  [FIRESTORE_COLLECTIONS.priceOverrides]: (p) => p.priceOverride.findMany(),
  [FIRESTORE_COLLECTIONS.productPricingOverrides]: (p) => p.productPricingOverride.findMany(),
  [FIRESTORE_COLLECTIONS.citaPublishedPriceBands]: (p) => p.citaPublishedPriceBand.findMany(),
  [FIRESTORE_COLLECTIONS.citaPublishedPriceBandThicknesses]: (p) =>
    p.citaPublishedPriceBandThickness.findMany(),
  [FIRESTORE_COLLECTIONS.orderDocuments]: (p) => p.orderDocument.findMany(),
  [FIRESTORE_COLLECTIONS.orderLines]: (p) => p.orderLine.findMany(),
  [FIRESTORE_COLLECTIONS.orderMaterialLines]: (p) => p.orderMaterialLine.findMany(),
  [FIRESTORE_COLLECTIONS.auditEvents]: (p) => p.auditEvent.findMany(),
};

function canonicalize(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  if (value === null) {
    return null;
  }
  if (value instanceof Prisma.Decimal || value instanceof Decimal) {
    return new Decimal(value.toString()).toString();
  }
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate(): Date }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      return new Decimal(String(value)).toString();
    }
    return value;
  }
  if (typeof value === 'string') {
    if (/^-?\d+(\.\d+)?$/.test(value) && value.includes('.')) {
      return new Decimal(value).toString();
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function hashRow(row: Record<string, unknown>): string {
  return JSON.stringify(canonicalize(row));
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

  const countReport: Array<Record<string, unknown>> = [];
  const valueDiffs: Array<Record<string, unknown>> = [];
  let masterMismatch = false;

  try {
    for (const mapping of DATA_STORE_MODEL_MAP) {
      const collectionName = mapping.collection;
      const load = LOADERS[collectionName];
      if (!load) {
        throw new Error(`Loader yok: ${collectionName}`);
      }
      const pgRows = await load(prisma);
      const fsSnap = await getDocs(collection(db, collectionName));
      const fsRows = fsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
      const expected = EXPECTED_COUNTS[collectionName];
      const isAudit = collectionName === FIRESTORE_COLLECTIONS.auditEvents;
      const countOk = pgRows.length === fsRows.length;
      const expectedOk = expected?.exact != null
        ? pgRows.length === expected.exact
        : expected?.min != null
          ? pgRows.length >= expected.min
          : true;
      if (!countOk && !isAudit) {
        masterMismatch = true;
      }
      countReport.push({
        collection: collectionName,
        postgres: pgRows.length,
        firestore: fsRows.length,
        expected: expected?.exact ?? `>=${expected?.min ?? '?'}`,
        countParity: countOk,
        expectedParity: expectedOk,
        auditGrowthIgnored: isAudit && !countOk,
      });
      console.log(
        `${countOk ? 'COUNT_OK' : isAudit ? 'COUNT_AUDIT' : 'COUNT_FAIL'} ${collectionName} pg=${pgRows.length} fs=${fsRows.length}`,
      );

      const pgById = new Map(pgRows.map((row) => [String(row.id), row]));
      const fsById = new Map(fsRows.map((row) => [String(row.id), row]));
      for (const id of new Set([...pgById.keys(), ...fsById.keys()])) {
        const pg = pgById.get(id);
        const fs = fsById.get(id);
        if (!pg) {
          valueDiffs.push({ collection: collectionName, id, kind: 'missing-in-postgres' });
          if (!isAudit) masterMismatch = true;
          continue;
        }
        if (!fs) {
          valueDiffs.push({ collection: collectionName, id, kind: 'missing-in-firestore' });
          if (!isAudit) masterMismatch = true;
          continue;
        }
        const pgHash = hashRow(pg);
        const fsHash = hashRow(fs);
        if (pgHash !== fsHash) {
          const pgCanon = canonicalize(pg) as Record<string, unknown>;
          const fsCanon = canonicalize(fs) as Record<string, unknown>;
          const fields: Array<{ field: string; postgres: unknown; firestore: unknown }> = [];
          for (const key of new Set([...Object.keys(pgCanon), ...Object.keys(fsCanon)])) {
            if (JSON.stringify(pgCanon[key]) !== JSON.stringify(fsCanon[key])) {
              fields.push({ field: key, postgres: pgCanon[key], firestore: fsCanon[key] });
            }
          }
          valueDiffs.push({ collection: collectionName, id, kind: 'value-mismatch', fields });
          if (!isAudit) masterMismatch = true;
        }
      }
    }
  } finally {
    const outDir = path.join(__dirname, '..', 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    const report = {
      at: new Date().toISOString(),
      readOnly: true,
      cutover: masterMismatch ? 'CUTOVER YAPMA' : 'COUNT+VALUE PARITY OK (cutover ayrı onay)',
      counts: countReport,
      valueDiffCount: valueDiffs.length,
      valueDiffs: valueDiffs.slice(0, 500),
    };
    fs.writeFileSync(path.join(outDir, 'firestore-parity-report.json'), JSON.stringify(report, null, 2));
    await prisma.$disconnect();
  }

  if (masterMismatch) {
    console.error('CUTOVER YAPMA: master veri count/value parity başarısız.');
    process.exitCode = 1;
    return;
  }
  console.log('READ-ONLY PARITY OK. Audit farkı hata sayılmaz. CUTOVER yapılmadı.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
