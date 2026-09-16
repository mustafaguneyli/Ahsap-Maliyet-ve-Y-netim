import { BadRequestException } from '@nestjs/common';
import { CITA_EXTRA_COST_MISSING } from '../../calculation-engine/calculators/cita-production-calculator';
import {
  CITA_NET_FORBIDDEN_MATERIAL_CODES,
  CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM,
} from '../../calculation-engine/calculators/cita-net-calculator';
import { CITA_STANDARD_FALLBACK_NET } from '../products/cita-cut-rule.fixture';
import { CITA_PRODUCTION_YIELD_SEEDS } from '../production-yields/cita-yield-seed-data';
import { CITA_PUBLISHED_PRICE_BAND_SEEDS } from '../pricing/cita-published-price-band-data';
import { CITA_PUBLISHED_PRICE_MISSING } from '../pricing/cita-published-price-band-data';
import { CitaListService } from './cita-list.service';
import {
  CITA_RAW_MATERIAL_PRICE_MISSING,
  CitaRawMaterialPriceMissingException,
} from './cita-mdf.errors';

const NOW = new Date('2026-09-16T12:00:00.000Z');
const GROUP = { id: 'cita-group', code: 'CITA', name: 'Çıta', isActive: true };
const PRODUCT = { id: 'cita-product', code: 'CITA', name: 'Çıta', isActive: true };

function netQtyForWidth(widthMm: number): number {
  const row = CITA_STANDARD_FALLBACK_NET.find((item) => item.widthMm === widthMm);
  if (!row) {
    throw new Error(`Standart CITA NET yok: ${widthMm}`);
  }
  return row.netQty;
}

function masterRow(
  row: { materialCode: string; pieceWidthMm: number; pieceLengthMm: number; netQty: number },
  index: number,
  overrides: {
    productId?: string | null;
    isActive?: boolean;
    materialIsActive?: boolean;
    materialCode?: string;
  } = {},
) {
  const thicknessMm = /MDF-(\d+(?:\.\d+)?)-/.exec(
    overrides.materialCode ?? row.materialCode,
  )?.[1];
  if (!thicknessMm) {
    throw new Error(`Test ham madde kalınlığı okunamadı: ${row.materialCode}`);
  }
  return {
    id: `yield-${index}`,
    productId: overrides.productId === undefined ? PRODUCT.id : overrides.productId,
    rawMaterialId: `material-${index}`,
    pieceWidthMm: row.pieceWidthMm,
    pieceLengthMm: row.pieceLengthMm,
    netQty: row.netQty,
    isActive: overrides.isActive ?? true,
    createdAt: new Date(`2026-01-01T00:00:${String(index).padStart(2, '0')}.000Z`),
    rawMaterial: {
      code: overrides.materialCode ?? row.materialCode,
      thicknessMm,
      isActive: overrides.materialIsActive ?? true,
    },
  };
}

function publishedBandRows() {
  return CITA_PUBLISHED_PRICE_BAND_SEEDS.map((seed, index) => ({
    id: `band-${index}`,
    productGroupId: GROUP.id,
    minWidthMm: seed.minWidthMm,
    maxWidthMm: seed.maxWidthMm,
    cashPrice: { toString: () => seed.cashPrice },
    cardPrice: { toString: () => seed.cardPrice },
    isActive: true,
    effectiveFrom: NOW,
    effectiveTo: null,
    thicknesses: seed.thicknessMm.map((thicknessMm) => ({ thicknessMm })),
  }));
}

function createPrisma(rows: ReturnType<typeof masterRow>[]) {
  return {
    productGroup: { findUnique: jest.fn().mockResolvedValue(GROUP) },
    product: { findUnique: jest.fn().mockResolvedValue(PRODUCT) },
    productionYield: { findMany: jest.fn().mockResolvedValue(rows) },
    citaPublishedPriceBand: {
      findMany: jest.fn().mockResolvedValue(publishedBandRows()),
    },
  };
}

function extraCostMissingResult(query: {
  thicknessMm: string;
  widthMm: string;
  lengthMm: string;
}) {
  const thickness = Number(query.thicknessMm);
  const width = Number(query.widthMm);
  const code =
    CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM[
      thickness as keyof typeof CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM
    ];
  return {
    productCode: 'CITA',
    thicknessMm: query.thicknessMm,
    widthMm: query.widthMm,
    lengthMm: query.lengthMm,
    rawMaterial: {
      code,
      thicknessMm: query.thicknessMm,
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
    },
    cut: {
      bladeAllowanceMm: 4,
      countSideMm: 2100,
      effectiveCutPitchMm: String(width + 4),
    },
    productionYield: {
      netQty: netQtyForWidth(width),
      source: 'MASTER' as const,
    },
    sheetPrice: { priceType: 'CARD_INSTALLMENT' as const, amount: '1000' },
    mdfUnitCost: '10',
    extraCosts: [],
    extraCostsTotal: null,
    productionCost: null,
    extraCostsAvailable: false,
    missingExtraCosts: ['CUTTING', 'LABOR'] as Array<'CUTTING' | 'LABOR'>,
    statusCode: CITA_EXTRA_COST_MISSING,
  };
}

function buildService(
  rows: ReturnType<typeof masterRow>[],
  productionImpl?: (query: {
    thicknessMm: string;
    widthMm: string;
    lengthMm: string;
  }) => Promise<unknown>,
) {
  const prisma = createPrisma(rows);
  const citaProductionService = {
    getProductionCost: jest.fn().mockImplementation(
      productionImpl ??
        (async (query: { thicknessMm: string; widthMm: string; lengthMm: string }) =>
          extraCostMissingResult(query)),
    ),
  };
  const citaNetService = {
    resolveNet: jest.fn(),
  };
  const service = new CitaListService(
    prisma as never,
    citaProductionService as never,
    citaNetService as never,
  );
  return { service, prisma, citaProductionService, citaNetService };
}

describe('CitaListService', () => {
  it('aktif CITA MASTER kayıtlarını DB’den keşfeder, 56 satır döner ve sıralar', async () => {
    const { service, prisma, citaProductionService } = buildService(
      [...CITA_PRODUCTION_YIELD_SEEDS]
        .reverse()
        .map((row, index) => masterRow(row, index)),
    );

    const result = await service.listProductionCosts(NOW);

    expect(prisma.productionYield.findMany).toHaveBeenCalledWith({
      where: {
        productId: PRODUCT.id,
        isActive: true,
        rawMaterial: { isActive: true },
      },
      include: { rawMaterial: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(result.productCode).toBe('CITA');
    expect(result.verifiedMeasureCount).toBe(56);
    expect(result.rows).toHaveLength(56);
    expect(citaProductionService.getProductionCost).toHaveBeenCalledTimes(56);
    expect(citaProductionService.getProductionCost).toHaveBeenNthCalledWith(
      1,
      { thicknessMm: '10', widthMm: '10', lengthMm: '2800' },
      NOW,
    );
    expect(result.rows.every((row) => row.productionYield.source === 'MASTER')).toBe(
      true,
    );
    expect(
      result.rows.some((row) => row.productionYield.source === 'CALCULATED_CUT_RULE'),
    ).toBe(false);
    expect(result.rows.map((row) => Number(row.thicknessMm))).toEqual(
      CITA_PRODUCTION_YIELD_SEEDS.map((row) =>
        Number(/MDF-(\d+)-/.exec(row.materialCode)?.[1]),
      ),
    );
    expect(result.rows.map((row) => Number(row.widthMm))).toEqual(
      CITA_PRODUCTION_YIELD_SEEDS.map((row) => row.pieceWidthMm),
    );

    const find = (
      thicknessMm: string,
      widthMm: string,
    ) => result.rows.find((row) => row.thicknessMm === thicknessMm && row.widthMm === widthMm);

    expect(find('10', '10')?.productionYield.netQty).toBe(150);
    expect(find('14', '40')?.productionYield.netQty).toBe(47);
    expect(find('18', '80')?.productionYield.netQty).toBe(25);
    expect(find('30', '60')?.productionYield.netQty).toBe(32);

    expect(
      result.rows
        .filter((row) => row.thicknessMm === '18')
        .every((row) => row.rawMaterial.code === 'MDF-18-2100X2800-ZIMPARALI'),
    ).toBe(true);
    expect(
      result.rows
        .filter((row) => row.thicknessMm === '22')
        .every((row) => row.rawMaterial.code === 'MDF-22-2100X2800-ZIMPARALI'),
    ).toBe(true);
    expect(
      result.rows.some((row) =>
        (CITA_NET_FORBIDDEN_MATERIAL_CODES as readonly string[]).includes(
          row.rawMaterial.code,
        ),
      ),
    ).toBe(false);
    expect([...new Set(result.rows.map((row) => row.rawMaterial.code))].sort()).toEqual(
      Object.values(CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM),
    );
    expect(result.rows.every((row) => row.statusCode === CITA_EXTRA_COST_MISSING)).toBe(
      true,
    );
    expect(result.rows.every((row) => row.productionCost === null)).toBe(true);
    expect(result.rows.every((row) => row.mdfUnitCost === '10')).toBe(true);
    expect(
      result.rows.every(
        (row) =>
          row.missingExtraCosts.includes('CUTTING') &&
          row.missingExtraCosts.includes('LABOR'),
      ),
    ).toBe(true);

    const priced = result.rows.filter((row) => row.pricing.pricingAvailable);
    const missingPrice = result.rows.filter((row) => !row.pricing.pricingAvailable);
    expect(priced).toHaveLength(26);
    expect(missingPrice).toHaveLength(30);
    expect(
      missingPrice.every(
        (row) =>
          row.pricing.statusCode === CITA_PUBLISHED_PRICE_MISSING &&
          row.pricing.publishedCashPrice === null &&
          row.pricing.publishedCardPrice === null,
      ),
    ).toBe(true);

    const findPrice = (thicknessMm: string, widthMm: string) =>
      find(thicknessMm, widthMm)?.pricing;
    expect(findPrice('12', '10')).toEqual({
      pricingAvailable: true,
      priceBand: { minWidthMm: 10, maxWidthMm: 20 },
      publishedCashPrice: '115',
      publishedCardPrice: '138',
      statusCode: null,
    });
    expect(findPrice('12', '30')).toMatchObject({
      publishedCashPrice: '145',
      publishedCardPrice: '174',
    });
    expect(findPrice('14', '50')).toMatchObject({
      publishedCashPrice: '185',
      publishedCardPrice: '222',
    });
    expect(findPrice('16', '80')).toMatchObject({
      publishedCashPrice: '215',
      publishedCardPrice: '258',
    });
    expect(findPrice('18', '50')).toMatchObject({
      publishedCashPrice: '185',
      publishedCardPrice: '222',
    });
    expect(findPrice('18', '10')?.statusCode).toBe(CITA_PUBLISHED_PRICE_MISSING);
    expect(findPrice('18', '30')?.statusCode).toBe(CITA_PUBLISHED_PRICE_MISSING);
    expect(findPrice('18', '70')?.statusCode).toBe(CITA_PUBLISHED_PRICE_MISSING);
    expect(
      result.rows
        .filter((row) => ['10', '22', '30'].includes(row.thicknessMm))
        .every((row) => row.pricing.statusCode === CITA_PUBLISHED_PRICE_MISSING),
    ).toBe(true);
    expect(result.rows.every((row) => row.statusCode === CITA_EXTRA_COST_MISSING)).toBe(
      true,
    );
  });

  it('MASTER yoksa hardcoded kalınlık/en matrisi üretmez', async () => {
    const { service, citaProductionService } = buildService([]);

    const result = await service.listProductionCosts(NOW);

    expect(result.verifiedMeasureCount).toBe(0);
    expect(result.rows).toEqual([]);
    expect(citaProductionService.getProductionCost).not.toHaveBeenCalled();
  });

  it('inactive, pasif malzeme ve başka productId MASTER satırlarını listelemez', async () => {
    const base = CITA_PRODUCTION_YIELD_SEEDS[0];
    const { service, citaProductionService } = buildService([
      masterRow(base, 0),
      masterRow(base, 1, { productId: 'other-product' }),
      masterRow(base, 2, { productId: null }),
      masterRow({ ...base, pieceWidthMm: 35 }, 3, { isActive: false }),
      masterRow({ ...base, pieceWidthMm: 47 }, 4, { materialIsActive: false }),
    ]);

    const result = await service.listProductionCosts(NOW);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      thicknessMm: '10',
      widthMm: '10',
      lengthMm: '2800',
    });
    expect(citaProductionService.getProductionCost).toHaveBeenCalledTimes(1);
    expect(result.rows.some((row) => Number(row.widthMm) === 35)).toBe(false);
  });

  it('aynı kalınlık+en+boy için birden fazla aktif MASTER varsa sessiz seçmez', async () => {
    const base = CITA_PRODUCTION_YIELD_SEEDS[0];
    const { service } = buildService([
      masterRow(base, 0),
      masterRow(base, 1),
    ]);

    await expect(service.listProductionCosts(NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('18 mm NEOPAN ve 22 mm UI-TEST MASTER ham maddesini reddeder', async () => {
    const eighteen = CITA_PRODUCTION_YIELD_SEEDS.find(
      (row) =>
        row.materialCode === 'MDF-18-2100X2800-ZIMPARALI' && row.pieceWidthMm === 10,
    )!;
    const { service: neopanService } = buildService([
      masterRow(eighteen, 0, {
        materialCode: 'MDF-18-2100X2800-ZIMPARALI-NEOPAN',
      }),
    ]);
    await expect(neopanService.listProductionCosts(NOW)).rejects.toThrow(
      /MDF-18-2100X2800-ZIMPARALI/,
    );

    const twentyTwo = CITA_PRODUCTION_YIELD_SEEDS.find(
      (row) =>
        row.materialCode === 'MDF-22-2100X2800-ZIMPARALI' && row.pieceWidthMm === 10,
    )!;
    const { service: uiTestService } = buildService([
      masterRow(twentyTwo, 0, { materialCode: 'MDF-22-UI-TEST' }),
    ]);
    await expect(uiTestService.listProductionCosts(NOW)).rejects.toThrow(
      /MDF-22-2100X2800-ZIMPARALI/,
    );
  });

  it('MDF fiyatı eksik satırı RAW_MATERIAL_PRICE_MISSING yapar; diğer satırlar kalır', async () => {
    const rows = CITA_PRODUCTION_YIELD_SEEDS.map((row, index) =>
      masterRow(row, index),
    );
    const { service, citaProductionService, citaNetService } = buildService(
      rows,
      async (query) => {
        if (query.thicknessMm === '16') {
          throw new CitaRawMaterialPriceMissingException(
            'MDF-16-2100X2800-ZIMPARALI',
          );
        }
        return extraCostMissingResult(query);
      },
    );
    citaNetService.resolveNet.mockImplementation(async (query) => ({
      productCode: 'CITA',
      thicknessMm: query.thicknessMm,
      widthMm: query.widthMm,
      lengthMm: query.lengthMm,
      rawMaterial: {
        code: 'MDF-16-2100X2800-ZIMPARALI',
        sheetWidthMm: 2100,
        sheetLengthMm: 2800,
      },
      bladeAllowanceMm: 4,
      countSideMm: 2100,
      effectiveCutPitchMm: String(Number(query.widthMm) + 4),
      netQty: netQtyForWidth(Number(query.widthMm)),
      source: 'MASTER',
    }));

    const result = await service.listProductionCosts(NOW);

    expect(result.rows).toHaveLength(56);
    const missing = result.rows.filter((row) => row.thicknessMm === '16');
    const others = result.rows.filter((row) => row.thicknessMm !== '16');
    expect(missing).toHaveLength(8);
    expect(
      missing.every(
        (row) =>
          row.statusCode === CITA_RAW_MATERIAL_PRICE_MISSING &&
          row.productionCost === null &&
          row.mdfUnitCost === null &&
          row.productionYield.source === 'MASTER',
      ),
    ).toBe(true);
    expect(
      missing.every(
        (row) =>
          row.pricing.pricingAvailable === true &&
          row.pricing.publishedCashPrice != null &&
          row.pricing.publishedCardPrice != null,
      ),
    ).toBe(true);
    expect(others.every((row) => row.statusCode === CITA_EXTRA_COST_MISSING)).toBe(
      true,
    );
    expect(citaProductionService.getProductionCost).toHaveBeenCalledTimes(56);
    expect(citaNetService.resolveNet).toHaveBeenCalledTimes(8);
  });

  it('CUTTING+LABOR varsa productionCost hesaplanmış satırları döner', async () => {
    const { service } = buildService(
      CITA_PRODUCTION_YIELD_SEEDS.slice(0, 1).map((row, index) =>
        masterRow(row, index),
      ),
      async (query) => ({
        ...extraCostMissingResult(query),
        extraCosts: [
          { code: 'CUTTING', amount: '5' },
          { code: 'LABOR', amount: '10' },
        ],
        extraCostsTotal: '15',
        productionCost: '25',
        extraCostsAvailable: true,
        missingExtraCosts: [],
        statusCode: null,
      }),
    );

    const result = await service.listProductionCosts(NOW);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].extraCostsTotal).toBe('15');
    expect(result.rows[0].productionCost).toBe('25');
    expect(result.rows[0].statusCode).toBeNull();
  });

  it('pipeline CALCULATED_CUT_RULE dönerse listeye almaz', async () => {
    const { service } = buildService(
      CITA_PRODUCTION_YIELD_SEEDS.slice(0, 1).map((row, index) =>
        masterRow(row, index),
      ),
      async (query) => ({
        ...extraCostMissingResult(query),
        productionYield: { netQty: 150, source: 'CALCULATED_CUT_RULE' },
      }),
    );

    await expect(service.listProductionCosts(NOW)).rejects.toThrow(/MASTER/);
  });
});
