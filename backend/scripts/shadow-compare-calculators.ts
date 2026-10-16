/**
 * Postgres mode vs Firestore mode calculator shadow comparison.
 * Aynı frozen `now`. Fark varsa CUTOVER YAPMA.
 */
import * as fs from 'fs';
import * as path from 'path';
import { initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import Decimal from 'decimal.js';
import { Test } from '@nestjs/testing';
import { CalculatorType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { DataStoreConfig } from '../src/data-store/data-store.config';
import { FirestoreDocumentStore } from '../src/data-store/firestore.document-store';
import { MemoryDocumentStore } from '../src/data-store/memory.document-store';
import { decodeDocument } from '../src/data-store/firestore-codec';
import { CATALOG_PRELOAD_COLLECTIONS } from '../src/data-store/firestore-catalog-cache';
import { FIRESTORE_COLLECTIONS } from '../src/firebase/firestore.collections';
import { CostCalculationService } from '../src/modules/cost-calculation/cost-calculation.service';
import { CitaListService } from '../src/modules/cost-calculation/cita-list.service';
import { GenericRecipeService } from '../src/modules/cost-calculation/generic-recipe.service';
import { OrderQuoteService } from '../src/modules/cost-calculation/order-quote.service';
import { PriceListService } from '../src/modules/price-list/price-list.service';
import { DoorBuildService } from '../src/modules/door-build/door-build.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPURGELIK_PRODUCT_CODES } from '../src/calculation-engine/calculators/supurgelik-mdf-calculator';
import { CITA_NET_PRODUCT_CODE } from '../src/calculation-engine/calculators/cita-net-calculator';
import {
  DOOR_LEAF_VERIFIED_SHEET_LENGTH_MM,
  DOOR_LEAF_VERIFIED_SHEET_WIDTH_MM,
} from '../src/calculation-engine/calculators/door-leaf-surface-yield';

const IGNORE_KEYS = new Set(['asOf', 'timestamp', 'generatedAt', 'calculatedAt']);
const SORT_FIELDS = [
  'productGroupCode',
  'productCode',
  'code',
  'productId',
  'thicknessMm',
  'widthMm',
  'widthCm',
  'lengthMm',
  'lengthCm',
  'displayName',
  'thicknessLabel',
  'sizeLabel',
  'widthLabel',
  'label',
  'name',
  'id',
] as const;
const NOW = new Date('2026-10-07T12:00:00.000Z');
const REPORT_PATH = path.join(__dirname, '../secrets/shadow-compare-report.json');

type Diff = { path: string; postgres: unknown; firestore: unknown };
type Capture =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

function padNums(value: unknown): string {
  if (value == null) {
    return '';
  }
  return String(value).replace(/\d+(?:\.\d+)?/g, (part) => part.padStart(16, '0'));
}

function rowSortKey(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const row = value as Record<string, unknown>;
  return SORT_FIELDS.map((field) => padNums(row[field])).join('|');
}

function isSortableRowArray(value: unknown[]): boolean {
  return (
    value.length > 1 &&
    value.every((item) => item != null && typeof item === 'object' && !Array.isArray(item)) &&
    value.some((item) =>
      SORT_FIELDS.some((field) => (item as Record<string, unknown>)[field] != null),
    )
  );
}

function sortedRows<T>(rows: T[]): T[] {
  if (!isSortableRowArray(rows as unknown[])) {
    return rows;
  }
  return [...rows].sort((a, b) => rowSortKey(a).localeCompare(rowSortKey(b), 'en'));
}

function firstMeasureRow<T>(rows: T[] | undefined): T | undefined {
  if (!rows?.length) {
    return undefined;
  }
  return sortedRows(rows)[0];
}

function asDecimal(value: unknown): Decimal | null {
  if (value == null || typeof value === 'boolean' || typeof value === 'object') {
    return null;
  }
  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
    return null;
  }
  try {
    return new Decimal(text);
  } catch {
    return null;
  }
}

function compareValue(pg: unknown, fs: unknown, trail: string, diffs: Diff[]): void {
  if (pg === fs) {
    return;
  }
  if (pg instanceof Date && fs instanceof Date) {
    if (pg.getTime() !== fs.getTime()) {
      diffs.push({ path: trail, postgres: pg.toISOString(), firestore: fs.toISOString() });
    }
    return;
  }
  const pgDec = asDecimal(pg);
  const fsDec = asDecimal(fs);
  if (pgDec && fsDec) {
    if (!pgDec.equals(fsDec)) {
      diffs.push({ path: trail, postgres: pgDec.toString(), firestore: fsDec.toString() });
    }
    return;
  }
  if (Array.isArray(pg) && Array.isArray(fs)) {
    if (pg.length !== fs.length) {
      diffs.push({ path: `${trail}.length`, postgres: pg.length, firestore: fs.length });
      return;
    }
    const left = sortedRows(pg);
    const right = sortedRows(fs);
    for (let i = 0; i < left.length; i += 1) {
      compareValue(left[i], right[i], `${trail}[${i}]`, diffs);
    }
    return;
  }
  if (pg && fs && typeof pg === 'object' && typeof fs === 'object') {
    const keys = new Set([...Object.keys(pg as object), ...Object.keys(fs as object)]);
    for (const key of keys) {
      if (IGNORE_KEYS.has(key)) {
        continue;
      }
      compareValue(
        (pg as Record<string, unknown>)[key],
        (fs as Record<string, unknown>)[key],
        trail ? `${trail}.${key}` : key,
        diffs,
      );
    }
    return;
  }
  diffs.push({ path: trail, postgres: pg ?? null, firestore: fs ?? null });
}

async function capture(fn: () => Promise<unknown>): Promise<Capture> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

function compareCaptures(label: string, pg: Capture, fs: Capture, diffs: Diff[]): void {
  if (!pg.ok || !fs.ok) {
    if (!pg.ok && !fs.ok && pg.error === fs.error) {
      return;
    }
    diffs.push({
      path: label,
      postgres: pg.ok ? 'ok' : pg.error,
      firestore: fs.ok ? 'ok' : fs.error,
    });
    return;
  }
  compareValue(pg.value, fs.value, label, diffs);
}

async function hydrateMemoryFromFirestore(): Promise<MemoryDocumentStore> {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const apiKey = process.env.FIREBASE_API_KEY?.trim();
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN?.trim();
  const appId = process.env.FIREBASE_APP_ID?.trim();
  if (!projectId || !apiKey) {
    throw new Error('FIREBASE_PROJECT_ID ve FIREBASE_API_KEY shadow için gerekli.');
  }
  const app = initializeApp({
    apiKey,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    projectId,
    appId: appId || 'shadow-compare',
  });
  const db = getFirestore(app);
  const store = new MemoryDocumentStore();
  for (const name of CATALOG_PRELOAD_COLLECTIONS) {
    const snap = await getDocs(collection(db, name));
    const bucket = store.bucket(name);
    for (const doc of snap.docs) {
      const raw = { id: doc.id, ...doc.data() };
      bucket.set(doc.id, decodeDocument(raw as Record<string, unknown>));
    }
  }
  return store;
}

type CalcBundle = {
  prisma: PrismaService;
  cost: CostCalculationService;
  cita: CitaListService;
  generic: GenericRecipeService;
  quote: OrderQuoteService;
  priceList: PriceListService;
  doorBuild: DoorBuildService;
};

async function runSuite(label: string, services: CalcBundle): Promise<Map<string, Capture>> {
  const out = new Map<string, Capture>();
  const { prisma, cost, cita, generic, quote, priceList, doorBuild } = services;

  out.set(
    'door-frame/34_MM',
    await capture(() => cost.getDoorFrameMdfCosts('34_MM', NOW, 'CARD_INSTALLMENT')),
  );
  out.set(
    'door-frame/30_MM',
    await capture(() => cost.getDoorFrameMdfCosts('30_MM', NOW, 'CARD_INSTALLMENT')),
  );
  out.set(
    'pervaz/ayarli',
    await capture(() => cost.getAyarliPervazMdfCosts(NOW, 'CARD_INSTALLMENT')),
  );
  out.set(
    'pervaz/dekoratif',
    await capture(() => cost.getDekoratifPervazCosts(NOW, 'CARD_INSTALLMENT')),
  );
  out.set(
    'pervaz/dekoratif-genis-kilcik',
    await capture(() => cost.getDekoratifGenisKilcikCosts(NOW, 'CARD_INSTALLMENT')),
  );
  for (const code of SUPURGELIK_PRODUCT_CODES) {
    out.set(
      `supurgelik/${code}`,
      await capture(() =>
        cost.getSupurgelikMdfCosts(
          { productCode: code, materialPriceType: 'CARD_INSTALLMENT' },
          NOW,
        ),
      ),
    );
  }
  out.set(
    'cita/list',
    await capture(() => cita.listProductionCosts(NOW, 'CARD_INSTALLMENT')),
  );

  const genericGroups = await prisma.productGroup.findMany({
    where: { calculatorType: CalculatorType.GENERIC_RECIPE, isActive: true },
    select: { code: true },
    orderBy: { code: 'asc' },
  });
  for (const group of genericGroups) {
    out.set(
      `generic/${group.code}`,
      await capture(() => generic.listCostRows(group.code, 'CARD_INSTALLMENT', NOW)),
    );
  }

  out.set('price-list', await capture(() => priceList.getPriceList(NOW)));

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, code: true, productGroup: { select: { code: true } } },
  });
  const byCode = new Map(products.map((row) => [row.code, row]));

  const doorFrame = out.get('door-frame/34_MM');
  if (doorFrame?.ok) {
    const body = doorFrame.value as {
      productId: string;
      rows: Array<{ widthCm: number; lengthCm: number }>;
    };
    const row = firstMeasureRow(body.rows);
    if (row) {
      out.set(
        'order-quote/door_frame',
        await capture(() =>
          quote.quote({
            productId: body.productId,
            quantity: 1,
            widthMm: String(row.widthCm * 10),
            lengthMm: String(row.lengthCm * 10),
            materialPriceType: 'CARD_INSTALLMENT',
          }),
        ),
      );
    }
  }

  const ayarli = out.get('pervaz/ayarli');
  const ayarliProduct = byCode.get('AYARLI_PERVAZ');
  if (ayarli?.ok && ayarliProduct) {
    const body = ayarli.value as {
      rows: Array<{ thicknessMm: unknown; widthMm: unknown; lengthMm: unknown }>;
    };
    const row = firstMeasureRow(body.rows);
    if (row) {
      out.set(
        'order-quote/pervaz',
        await capture(() =>
          quote.quote({
            productId: ayarliProduct.id,
            quantity: 1,
            thicknessMm: String(row.thicknessMm),
            widthMm: String(row.widthMm),
            lengthMm: String(row.lengthMm),
            materialPriceType: 'CARD_INSTALLMENT',
          }),
        ),
      );
    }
  }

  const supurgelik = out.get('supurgelik/DUZ_SUPURGELIK');
  const supurgelikProduct = byCode.get('DUZ_SUPURGELIK');
  if (supurgelik?.ok && supurgelikProduct) {
    const body = supurgelik.value as {
      rows: Array<{ thicknessMm: unknown; widthMm: unknown; lengthMm: unknown }>;
    };
    const row = firstMeasureRow(body.rows);
    if (row) {
      out.set(
        'order-quote/supurgelik',
        await capture(() =>
          quote.quote({
            productId: supurgelikProduct.id,
            quantity: 1,
            thicknessMm: String(row.thicknessMm),
            widthMm: String(row.widthMm),
            lengthMm: String(row.lengthMm),
            materialPriceType: 'CARD_INSTALLMENT',
          }),
        ),
      );
    }
  }

  const citaList = out.get('cita/list');
  const citaProduct = byCode.get(CITA_NET_PRODUCT_CODE);
  if (citaList?.ok && citaProduct) {
    const body = citaList.value as {
      rows: Array<{ thicknessMm: unknown; widthMm: unknown; lengthMm: unknown }>;
    };
    const row = firstMeasureRow(body.rows);
    if (row) {
      out.set(
        'order-quote/cita',
        await capture(() =>
          quote.quote({
            productId: citaProduct.id,
            quantity: 1,
            thicknessMm: String(row.thicknessMm),
            widthMm: String(row.widthMm),
            lengthMm: String(row.lengthMm),
            materialPriceType: 'CARD_INSTALLMENT',
          }),
        ),
      );
    }
  }

  for (const group of genericGroups) {
    const genericList = out.get(`generic/${group.code}`);
    if (!genericList?.ok) {
      continue;
    }
    const body = genericList.value as {
      rows: Array<{ productId?: string; productCode: string; widthMm: number; lengthMm: number }>;
    };
    const row = firstMeasureRow(body.rows);
    const product =
      (row?.productId ? products.find((item) => item.id === row.productId) : null) ??
      byCode.get(row?.productCode ?? '');
    if (!row || !product) {
      continue;
    }
    out.set(
      `order-quote/generic/${group.code}`,
      await capture(() =>
        quote.quote({
          productId: product.id,
          quantity: 1,
          widthMm: String(row.widthMm),
          lengthMm: String(row.lengthMm),
          materialPriceType: 'CARD_INSTALLMENT',
        }),
      ),
    );
  }

  const surface = await prisma.rawMaterial.findFirst({
    where: {
      isActive: true,
      sheetWidthMm: DOOR_LEAF_VERIFIED_SHEET_WIDTH_MM,
      sheetLengthMm: DOOR_LEAF_VERIFIED_SHEET_LENGTH_MM,
      code: { startsWith: 'MDF-' },
    },
    orderBy: { code: 'asc' },
  });
  if (surface) {
    out.set(
      'door-build/fixture',
      await capture(() =>
        doorBuild.quote(
          {
            doorHeightMm: 2100,
            doorWidthMm: 900,
            quantity: 2,
            surfaceRawMaterialId: surface.id,
            materialPriceType: 'CARD_INSTALLMENT',
            frame: {
              productCode: '34_MM',
              widthMm: 100,
              lengthMm: 2100,
              totalBoyQuantity: '2.5',
            },
            sideTrims: {
              productCode: 'AYARLI_PERVAZ',
              thicknessMm: '12',
              widthMm: '100',
              lengthMm: '2200',
            },
            header: {
              productCode: 'AYARLI_PERVAZ',
              thicknessMm: '12',
              widthMm: '100',
              lengthMm: '2200',
            },
            manualCostLines: [],
            profitRate: '20',
            vatRate: '20',
            cardMarkupRate: '10',
          },
          NOW,
        ),
      ),
    );
  } else {
    out.set('door-build/fixture', {
      ok: false,
      error: `${DOOR_LEAF_VERIFIED_SHEET_WIDTH_MM}×${DOOR_LEAF_VERIFIED_SHEET_LENGTH_MM} MDF bulunamadı.`,
    });
  }

  void label;
  return out;
}

function pickServices(moduleRef: { get: <T>(token: new (...args: never[]) => T) => T }): CalcBundle {
  return {
    prisma: moduleRef.get(PrismaService),
    cost: moduleRef.get(CostCalculationService),
    cita: moduleRef.get(CitaListService),
    generic: moduleRef.get(GenericRecipeService),
    quote: moduleRef.get(OrderQuoteService),
    priceList: moduleRef.get(PriceListService),
    doorBuild: moduleRef.get(DoorBuildService),
  };
}

async function main(): Promise<void> {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  const memory = await hydrateMemoryFromFirestore();
  const pgModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
  await pgModule.init();
  const fsModule = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DataStoreConfig)
    .useValue({
      name: 'firestore',
      isFirestore: () => true,
      isPostgres: () => false,
    })
    .overrideProvider(FirestoreDocumentStore)
    .useValue(memory)
    .compile();
  await fsModule.init();

  try {
    const pgResults = await runSuite('postgres', pickServices(pgModule));
    const fsResults = await runSuite('firestore', pickServices(fsModule));
    const diffs: Diff[] = [];
    const labels = new Set([...pgResults.keys(), ...fsResults.keys()]);
    for (const label of labels) {
      const pg = pgResults.get(label) ?? { ok: false as const, error: 'eksik' };
      const fsCap = fsResults.get(label) ?? { ok: false as const, error: 'eksik' };
      compareCaptures(label, pg, fsCap, diffs);
    }
    const report = {
      passed: diffs.length === 0,
      comparedAt: new Date().toISOString(),
      frozenNow: NOW.toISOString(),
      scenarios: [...labels].sort(),
      diffCount: diffs.length,
      diffs: diffs.slice(0, 80),
      firestoreCollections: Object.values(FIRESTORE_COLLECTIONS).length,
      cutover: diffs.length === 0 ? 'parity-ok' : 'CUTOVER YAPMA',
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    if (diffs.length > 0) {
      console.error(`SHADOW FAIL: ${diffs.length} fark. CUTOVER YAPMA.`);
      for (const diff of diffs.slice(0, 20)) {
        console.error(`  ${diff.path}`);
        console.error(`    postgres: ${JSON.stringify(diff.postgres)}`);
        console.error(`    firestore: ${JSON.stringify(diff.firestore)}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`SHADOW OK: ${labels.size} senaryo Decimal/canonical eşit.`);
  } finally {
    await pgModule.close();
    await fsModule.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
