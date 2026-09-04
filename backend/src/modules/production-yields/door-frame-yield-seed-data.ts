import { PrismaClient } from '@prisma/client';

/**
 * Kapı Kasası doğrulanmış NET adet master datası.
 * Kaynak: Excel 34 MM / 30 MM MDF KASA FİYATI HESAPLAMA NET sütunları.
 * ProductionYieldCalculator sonucu ile çelişirse Excel değeri korunur.
 */

export type DoorFrameYieldSeedRow = {
  materialCode: string;
  pieceWidthMm: number;
  pieceLengthMm: number;
  netQty: number;
  source: '34MM' | '30MM' | '34MM+30MM';
};

const cm = (value: number): number => value * 10;

const M22 = 'MDF-22-2100X2800-ZIMPARALI';
const M18 = 'MDF-18-2100X2800-ZIMPARALI';
const M12_210 = 'MDF-12-2100X2800-ZIMPARALI';
const M12_220 = 'MDF-12-2200X2800-ZIMPARALI';

/** 34 mm: 22 mm ana parça NET adetleri */
const FRAME_34_PRIMARY_22: Array<{ wCm: number; lCm: number; net: number }> = [
  { wCm: 10, lCm: 210, net: 26 },
  { wCm: 11, lCm: 210, net: 24 },
  { wCm: 12, lCm: 210, net: 22 },
  { wCm: 13, lCm: 210, net: 20 },
  { wCm: 14, lCm: 210, net: 19 },
  { wCm: 14, lCm: 220, net: 14 },
  { wCm: 14, lCm: 230, net: 14 },
  { wCm: 15, lCm: 210, net: 18 },
  { wCm: 15, lCm: 215, net: 13 },
  { wCm: 16, lCm: 210, net: 17 },
  { wCm: 16, lCm: 235, net: 13 },
  { wCm: 17, lCm: 210, net: 16 },
  { wCm: 18, lCm: 210, net: 15 },
  { wCm: 19, lCm: 210, net: 14 },
  { wCm: 20, lCm: 210, net: 13 },
  { wCm: 20, lCm: 230, net: 10 },
  { wCm: 21, lCm: 210, net: 13 },
  { wCm: 22, lCm: 210, net: 12 },
  { wCm: 22, lCm: 215, net: 9 },
  { wCm: 23, lCm: 210, net: 11 },
  { wCm: 24, lCm: 210, net: 11 },
  { wCm: 25, lCm: 210, net: 10 },
  { wCm: 30, lCm: 210, net: 9 },
  { wCm: 35, lCm: 210, net: 7 },
];

/**
 * 34 mm: 12 mm ikinci parça.
 * 14×220, 14×230, 15×215 → 12 MM MDF 220×280
 * diğerleri → 12 MM MDF 210×280
 */
const FRAME_34_SECONDARY_12: Array<{
  wCm: number;
  lCm: number;
  net: number;
  sheet220: boolean;
}> = [
  { wCm: 10, lCm: 210, net: 46, sheet220: false },
  { wCm: 11, lCm: 210, net: 40, sheet220: false },
  { wCm: 12, lCm: 210, net: 35, sheet220: false },
  { wCm: 13, lCm: 210, net: 31, sheet220: false },
  { wCm: 14, lCm: 210, net: 28, sheet220: false },
  { wCm: 14, lCm: 220, net: 22, sheet220: true },
  { wCm: 14, lCm: 230, net: 21, sheet220: true },
  { wCm: 15, lCm: 210, net: 25, sheet220: false },
  { wCm: 15, lCm: 215, net: 19, sheet220: true },
  { wCm: 16, lCm: 210, net: 23, sheet220: false },
  { wCm: 16, lCm: 235, net: 17, sheet220: false },
  { wCm: 17, lCm: 210, net: 21, sheet220: false },
  { wCm: 18, lCm: 210, net: 20, sheet220: false },
  { wCm: 19, lCm: 210, net: 18, sheet220: false },
  { wCm: 20, lCm: 210, net: 17, sheet220: false },
  { wCm: 20, lCm: 230, net: 13, sheet220: false },
  { wCm: 21, lCm: 210, net: 16, sheet220: false },
  { wCm: 22, lCm: 210, net: 15, sheet220: false },
  { wCm: 22, lCm: 215, net: 11, sheet220: false },
  { wCm: 23, lCm: 210, net: 14, sheet220: false },
  { wCm: 24, lCm: 210, net: 14, sheet220: false },
  { wCm: 25, lCm: 210, net: 13, sheet220: false },
  { wCm: 30, lCm: 210, net: 10, sheet220: false },
  { wCm: 35, lCm: 210, net: 9, sheet220: false },
];

/** 30 mm: 18 mm ana parça */
const FRAME_30_PRIMARY_18: Array<{ wCm: number; lCm: number; net: number }> = [
  { wCm: 10, lCm: 210, net: 26 },
  { wCm: 12, lCm: 210, net: 22 },
  { wCm: 14, lCm: 210, net: 19 },
  { wCm: 16, lCm: 210, net: 16 },
  { wCm: 18, lCm: 210, net: 15 },
  { wCm: 20, lCm: 210, net: 13 },
  { wCm: 22, lCm: 210, net: 12 },
  { wCm: 24, lCm: 210, net: 11 },
];

/** 30 mm: 12 mm ikinci parça (210×280; 34 mm ile ortak) */
const FRAME_30_SECONDARY_12: Array<{ wCm: number; lCm: number; net: number }> = [
  { wCm: 10, lCm: 210, net: 46 },
  { wCm: 12, lCm: 210, net: 35 },
  { wCm: 14, lCm: 210, net: 28 },
  { wCm: 16, lCm: 210, net: 23 },
  { wCm: 18, lCm: 210, net: 20 },
  { wCm: 20, lCm: 210, net: 17 },
  { wCm: 22, lCm: 210, net: 15 },
  { wCm: 24, lCm: 210, net: 14 },
];

function yieldKey(materialCode: string, pieceWidthMm: number, pieceLengthMm: number): string {
  return `${materialCode}|${pieceWidthMm}|${pieceLengthMm}`;
}

/**
 * Ortak 12 mm kayıtlarını tekilleştirir; çelişen Excel satırlarını yakalar.
 */
export function buildDoorFrameYieldSeedRows(): {
  rows: DoorFrameYieldSeedRow[];
  sourceConflicts: string[];
} {
  const map = new Map<string, DoorFrameYieldSeedRow>();
  const sourceConflicts: string[] = [];

  const upsert = (
    materialCode: string,
    wCm: number,
    lCm: number,
    netQty: number,
    source: DoorFrameYieldSeedRow['source'],
  ): void => {
    const pieceWidthMm = cm(wCm);
    const pieceLengthMm = cm(lCm);
    const key = yieldKey(materialCode, pieceWidthMm, pieceLengthMm);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { materialCode, pieceWidthMm, pieceLengthMm, netQty, source });
      return;
    }
    if (existing.netQty !== netQty) {
      sourceConflicts.push(
        `${materialCode} ${wCm}x${lCm}: mevcut kaynak ${existing.netQty}, yeni ${netQty}`,
      );
      return;
    }
    if (existing.source !== source && !existing.source.includes('+')) {
      existing.source = '34MM+30MM';
    }
  };

  for (const row of FRAME_34_PRIMARY_22) {
    upsert(M22, row.wCm, row.lCm, row.net, '34MM');
  }
  for (const row of FRAME_34_SECONDARY_12) {
    upsert(row.sheet220 ? M12_220 : M12_210, row.wCm, row.lCm, row.net, '34MM');
  }
  for (const row of FRAME_30_PRIMARY_18) {
    upsert(M18, row.wCm, row.lCm, row.net, '30MM');
  }
  for (const row of FRAME_30_SECONDARY_12) {
    upsert(M12_210, row.wCm, row.lCm, row.net, '30MM');
  }

  return { rows: [...map.values()], sourceConflicts };
}

export type YieldSeedReport = {
  created: number;
  unchanged: number;
  conflicts: Array<{
    materialCode: string;
    pieceWidthMm: number;
    pieceLengthMm: number;
    excelNetQty: number;
    existingNetQty: number;
  }>;
  missingMaterials: string[];
  totalExpected: number;
};

export async function seedDoorFrameProductionYields(
  prisma: PrismaClient,
): Promise<YieldSeedReport> {
  const { rows, sourceConflicts } = buildDoorFrameYieldSeedRows();
  if (sourceConflicts.length > 0) {
    throw new Error(
      `Kapı kasası NET seed kaynak çelişkisi:\n${sourceConflicts.join('\n')}`,
    );
  }

  const report: YieldSeedReport = {
    created: 0,
    unchanged: 0,
    conflicts: [],
    missingMaterials: [],
    totalExpected: rows.length,
  };

  const materialCache = new Map<string, string>();

  for (const row of rows) {
    let materialId = materialCache.get(row.materialCode);
    if (!materialId) {
      const material = await prisma.rawMaterial.findUnique({
        where: { code: row.materialCode },
      });
      if (!material) {
        report.missingMaterials.push(row.materialCode);
        continue;
      }
      materialId = material.id;
      materialCache.set(row.materialCode, materialId);
    }

    const active = await prisma.productionYield.findFirst({
      where: {
        rawMaterialId: materialId,
        pieceWidthMm: row.pieceWidthMm,
        pieceLengthMm: row.pieceLengthMm,
        isActive: true,
      },
    });

    if (active) {
      if (active.netQty === row.netQty) {
        report.unchanged += 1;
      } else {
        report.conflicts.push({
          materialCode: row.materialCode,
          pieceWidthMm: row.pieceWidthMm,
          pieceLengthMm: row.pieceLengthMm,
          excelNetQty: row.netQty,
          existingNetQty: active.netQty,
        });
      }
      continue;
    }

    await prisma.productionYield.create({
      data: {
        rawMaterialId: materialId,
        pieceWidthMm: row.pieceWidthMm,
        pieceLengthMm: row.pieceLengthMm,
        netQty: row.netQty,
        isActive: true,
      },
    });
    report.created += 1;
  }

  return report;
}
