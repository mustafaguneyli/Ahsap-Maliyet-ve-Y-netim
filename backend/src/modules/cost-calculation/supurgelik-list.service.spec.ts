import { BadRequestException } from '@nestjs/common';
import { MaterialPriceType, PricingModifierType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  SUPURGELIK_PRODUCT_CODES,
  type SupurgelikProductCode,
} from '../../calculation-engine/calculators/supurgelik-mdf-calculator';
import { CostCalculationService } from './cost-calculation.service';

const NOW = new Date('2026-09-10T12:00:00.000Z');
const THICKNESSES = [8, 9, 10, 12, 14, 18] as const;
const WIDTHS = [80, 90, 100, 120, 150] as const;
const PRICES: Record<number, string | null> = {
  8: '1620',
  9: null,
  10: '1880',
  12: '2185',
  14: '2625',
  18: '2800',
};

function extraCostsResponse(cutting = '4', labor = '12') {
  return {
    productGroupCode: 'SUPURGELIK',
    productGroupName: 'Süpürgelik',
    asOf: NOW.toISOString(),
    items: [
      {
        typeId: 'type-CUTTING',
        typeCode: 'CUTTING',
        typeName: 'Kesim',
        valueId: 'value-CUTTING',
        amount: cutting,
        effectiveFrom: '2026-03-01T00:00:00.000Z',
        effectiveTo: null,
      },
      {
        typeId: 'type-LABOR',
        typeCode: 'LABOR',
        typeName: 'İşçilik',
        valueId: 'value-LABOR',
        amount: labor,
        effectiveFrom: '2026-03-01T00:00:00.000Z',
        effectiveTo: null,
      },
    ],
    totalAmount: new Decimal(cutting).plus(labor).toFixed(),
  };
}

function netQty(thicknessMm: number, widthMm: number): number {
  if ([12, 14, 18].includes(thicknessMm) && widthMm === 120) return 16;
  return ({ 80: 25, 90: 22, 100: 20, 120: 17, 150: 13 } as const)[
    widthMm as keyof { 80: 25; 90: 22; 100: 20; 120: 17; 150: 13 }
  ];
}

function master(
  thicknessMm: number,
  widthMm: number,
  options: {
    id?: string;
    productId?: string | null;
    pieceLengthMm?: number;
    sheetLengthMm?: number;
    isActive?: boolean;
    materialIsActive?: boolean;
  } = {},
) {
  const price = PRICES[thicknessMm];
  const pieceLengthMm = options.pieceLengthMm ?? 2800;
  return {
    id: options.id ?? `yield-${thicknessMm}-${widthMm}-${pieceLengthMm}`,
    productId: options.productId ?? null,
    rawMaterialId: `material-${thicknessMm}-${widthMm}`,
    pieceWidthMm: widthMm,
    pieceLengthMm,
    netQty: netQty(thicknessMm, widthMm),
    isActive: options.isActive ?? true,
    rawMaterial: {
      id: `material-${thicknessMm}-${widthMm}`,
      code: `MDF-${thicknessMm}-2100X2800-ZIMPARALI`,
      name: `${thicknessMm} MM MDF`,
      thicknessMm: new Decimal(thicknessMm),
      sheetWidthMm: 2100,
      sheetLengthMm: options.sheetLengthMm ?? 2800,
      surfaceType: 'Zımparalı',
      supplierName: 'DEMPAŞ',
      isActive: options.materialIsActive ?? true,
      prices:
        price == null
          ? []
          : [
              {
                id: `price-${thicknessMm}`,
                priceType: MaterialPriceType.CARD_INSTALLMENT,
                price: new Decimal(price),
                effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
                effectiveTo: null,
                isActive: true,
              },
            ],
    },
  };
}

type Master = ReturnType<typeof master>;

function standardMatrix(): Master[] {
  const rows = THICKNESSES.flatMap((thicknessMm) =>
    WIDTHS.map((widthMm) => master(thicknessMm, widthMm)),
  );
  return [
    ...rows.filter((_, index) => index % 2 === 0).reverse(),
    ...rows.filter((_, index) => index % 2 === 1).reverse(),
  ];
}

function buildService(
  candidates: Master[],
  productSizes: Array<{ widthMm: number; lengthMm: number }> = WIDTHS.map(
    (widthMm) => ({ widthMm, lengthMm: 2800 }),
  ),
) {
  const prisma = {
    productGroup: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'group-supurgelik',
        code: 'SUPURGELIK',
        name: 'Süpürgelik',
        isActive: true,
      }),
    },
    product: {
      findUnique: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve({
          id: `product-${where.productGroupId_code.code}`,
          code: where.productGroupId_code.code,
          name: 'Süpürgelik ürünü',
          isActive: true,
        }),
      ),
    },
    productSize: {
      findMany: jest.fn().mockResolvedValue(productSizes),
    },
    productionYield: {
      findMany: jest.fn().mockImplementation(({ where }) => {
        if (where.pieceWidthMm === undefined) {
          // Discovery query filtrelerini Prisma normalde uygular. Bilinçli olarak tüm
          // fixture'ları döndürmek, service'in savunmacı ayrımını da test eder.
          return Promise.resolve(candidates);
        }
        return Promise.resolve(
          candidates.filter(
            (row) =>
              row.productId === null &&
              row.isActive &&
              row.rawMaterial.isActive &&
              row.pieceWidthMm === where.pieceWidthMm &&
              row.pieceLengthMm === where.pieceLengthMm &&
              row.rawMaterial.thicknessMm.equals(String(where.rawMaterial.thicknessMm)),
          ),
        );
      }),
    },
    pricingSetting: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'pricing-supurgelik',
          productGroupId: 'group-supurgelik',
          productId: null,
          profitRate: new Decimal('20'),
          isActive: true,
        },
      ]),
    },
    pricingThicknessModifier: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'decorative-12',
          productGroupId: 'group-supurgelik',
          modifierType: PricingModifierType.DECORATIVE,
          thicknessMm: 12,
          rate: new Decimal('25'),
          isActive: true,
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: null,
        },
        {
          id: 'decorative-14',
          productGroupId: 'group-supurgelik',
          modifierType: PricingModifierType.DECORATIVE,
          thicknessMm: 14,
          rate: new Decimal('25'),
          isActive: true,
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: null,
        },
        {
          id: 'decorative-18',
          productGroupId: 'group-supurgelik',
          modifierType: PricingModifierType.DECORATIVE,
          thicknessMm: 18,
          rate: new Decimal('45'),
          isActive: true,
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: null,
        },
      ]),
    },
  };

  const extraCostsService = {
    listForProductGroup: jest.fn().mockResolvedValue(extraCostsResponse()),
    getSupurgelikPpWrapping: jest.fn().mockResolvedValue({
      productGroupCode: 'SUPURGELIK',
      productGroupName: 'Süpürgelik',
      asOf: NOW.toISOString(),
      items: [
        {
          typeId: 'type-PP_WRAPPING',
          typeCode: 'PP_WRAPPING',
          typeName: 'PP Sarma',
          valueId: null,
          amount: null,
          effectiveFrom: null,
          effectiveTo: null,
        },
      ],
      totalAmount: '',
    }),
  };

  return {
    prisma,
    extraCostsService,
    service: new CostCalculationService(
      prisma as never,
      extraCostsService as never,
      {} as never,
    ),
  };
}

describe('CostCalculationService.getSupurgelikMdfCosts', () => {
  it.each(SUPURGELIK_PRODUCT_CODES)(
    '%s için aynı DB-driven 30 satırlık temel listeyi döndürür',
    async (productCode: SupurgelikProductCode) => {
      const { prisma, service, extraCostsService } = buildService(standardMatrix());

      const result = await service.getSupurgelikMdfCosts({ productCode }, NOW);

      expect(result.productCode).toBe(productCode);
      expect(result.masterCount).toBe(30);
      expect(result.rowCount).toBe(30);
      expect(result.rows).toHaveLength(30);
      expect(result.rows.every((row) => row.productCode === productCode)).toBe(true);
      expect(result.rows.every((row) => row.extraCostsTotal === '16')).toBe(true);
      expect(result.rows.every((row) => 'pricing' in row)).toBe(true);
      expect(prisma.pricingSetting.findMany).toHaveBeenCalledTimes(1);
      if (productCode === 'DEKORATIF_SUPURGELIK' || productCode === 'DEKORATIF_PP_SARMA_SUPURGELIK') {
        expect(prisma.pricingThicknessModifier.findMany).toHaveBeenCalledTimes(1);
      } else {
        expect(prisma.pricingThicknessModifier.findMany).not.toHaveBeenCalled();
      }
      if (
        productCode === 'DUZ_PP_SARMA_SUPURGELIK' ||
        productCode === 'DEKORATIF_PP_SARMA_SUPURGELIK'
      ) {
        expect(
          result.rows
            .filter((row) => row.thicknessMm !== 9)
            .every(
              (row) =>
                row.pricing != null &&
                row.pricing.publishedCashPrice === null &&
                'statusCode' in row.pricing &&
                row.pricing.statusCode === 'PP_WRAPPING_COST_MISSING',
            ),
        ).toBe(true);
        expect(extraCostsService.getSupurgelikPpWrapping).toHaveBeenCalledTimes(1);
      } else {
        expect(extraCostsService.getSupurgelikPpWrapping).not.toHaveBeenCalled();
      }
      expect(extraCostsService.listForProductGroup).toHaveBeenCalledTimes(1);
      expect(extraCostsService.listForProductGroup).toHaveBeenCalledWith(
        'SUPURGELIK',
        NOW,
      );
    },
  );

  it('thickness, width ve length sırasını deterministik tutar', async () => {
    const { service } = buildService(standardMatrix());

    const result = await service.getSupurgelikMdfCosts(
      { productCode: 'DUZ_SUPURGELIK' },
      NOW,
    );

    expect(
      result.rows.map((row) => `${row.thicknessMm}/${row.widthMm}/${row.lengthMm}`),
    ).toEqual(
      THICKNESSES.flatMap((thicknessMm) =>
        WIDTHS.map((widthMm) => `${thicknessMm}/${widthMm}/2800`),
      ),
    );
  });

  it('9 mm satırlarını fiyat eksik bilgisiyle listeler; diğer satırlar hesaplanır', async () => {
    const { service } = buildService(standardMatrix());

    const result = await service.getSupurgelikMdfCosts(
      { productCode: 'DUZ_SUPURGELIK' },
      NOW,
    );
    const missing = result.rows.filter((row) => row.thicknessMm === 9);
    const available = result.rows.filter((row) => row.thicknessMm !== 9);

    expect(missing).toHaveLength(5);
    for (const row of missing) {
      expect(row.priceAvailable).toBe(false);
      expect(row.sheetPrice).toBeNull();
      expect(row.mdfUnitCost).toBeNull();
      expect(row.extraCosts).toEqual([
        { code: 'CUTTING', name: 'Kesim', amount: '4' },
        { code: 'LABOR', name: 'İşçilik', amount: '12' },
      ]);
      expect(row.extraCostsTotal).toBe('16');
      expect(row.productionCost).toBeNull();
      expect(row).toMatchObject({
        pricing: {
          profitRate: '20',
          source: 'GROUP_PRICING_SETTING',
          profitAmount: null,
          priceBeforeRounding: null,
          roundedBaseSalePrice: null,
          publishedCashPrice: null,
        },
      });
      expect(row.errorCode).toBe('RAW_MATERIAL_PRICE_MISSING');
      expect(row.rawMaterial.code).toBe('MDF-9-2100X2800-ZIMPARALI');
    }
    expect(available).toHaveLength(25);
    expect(available.every((row) => row.priceAvailable)).toBe(true);

    expect(
      result.rows.find((row) => row.thicknessMm === 8 && row.widthMm === 80),
    ).toMatchObject({
      productionYield: { netQty: 25, productId: null },
      mdfUnitCost: '64.8',
      extraCostsTotal: '16',
      productionCost: '80.8',
    });
    expect(
      result.rows.find((row) => row.thicknessMm === 12 && row.widthMm === 120),
    ).toMatchObject({
      productionYield: { netQty: 16, productId: null },
      mdfUnitCost: '136.5625',
      productionCost: '152.5625',
      pricing: {
        profitRate: '20',
        source: 'GROUP_PRICING_SETTING',
        profitAmount: '30.5125',
        priceBeforeRounding: '183.075',
        roundedBaseSalePrice: '184',
        publishedCashPrice: '184',
      },
    });
    expect(
      result.rows.find((row) => row.thicknessMm === 18 && row.widthMm === 100),
    ).toMatchObject({
      productionYield: { netQty: 20, productId: null },
      mdfUnitCost: '140',
      productionCost: '156',
    });
  });

  it('9 mm ExtraCost 4→5 sonrası da MDF yokken productionCost null kalır', async () => {
    const { extraCostsService, service } = buildService(standardMatrix());
    extraCostsService.listForProductGroup.mockResolvedValue(extraCostsResponse('5', '12'));

    const result = await service.getSupurgelikMdfCosts(
      { productCode: 'DUZ_SUPURGELIK' },
      NOW,
    );
    const missing = result.rows.filter((row) => row.thicknessMm === 9);
    const twelveBy120 = result.rows.find(
      (row) => row.thicknessMm === 12 && row.widthMm === 120,
    );

    expect(missing).toHaveLength(5);
    for (const row of missing) {
      expect(row.mdfUnitCost).toBeNull();
      expect(row.extraCostsTotal).toBe('17');
      expect(row.productionCost).toBeNull();
      expect(row.pricing?.publishedCashPrice).toBeNull();
      expect(row.errorCode).toBe('RAW_MATERIAL_PRICE_MISSING');
    }
    expect(twelveBy120).toMatchObject({
      mdfUnitCost: '136.5625',
      extraCostsTotal: '17',
      productionCost: '153.5625',
      pricing: { publishedCashPrice: '185' },
    });
  });

  it('profitRate 21 olsa da 9 mm MDF yokken productionCost/nakit null kalır', async () => {
    const { prisma, service } = buildService(standardMatrix());
    prisma.pricingSetting.findMany.mockResolvedValue([
      {
        id: 'pricing-supurgelik',
        productGroupId: 'group-supurgelik',
        productId: null,
        profitRate: new Decimal('21'),
        isActive: true,
      },
    ]);

    const result = await service.getSupurgelikMdfCosts(
      { productCode: 'DUZ_SUPURGELIK' },
      NOW,
    );
    const missing = result.rows.filter((row) => row.thicknessMm === 9);
    const twelveBy120 = result.rows.find(
      (row) => row.thicknessMm === 12 && row.widthMm === 120,
    );

    expect(missing).toHaveLength(5);
    for (const row of missing) {
      expect(row.mdfUnitCost).toBeNull();
      expect(row.extraCostsTotal).toBe('16');
      expect(row.productionCost).toBeNull();
      expect(row.pricing).toMatchObject({
        profitRate: '21',
        profitAmount: null,
        publishedCashPrice: null,
      });
      expect(row.errorCode).toBe('RAW_MATERIAL_PRICE_MISSING');
    }
    expect(twelveBy120).toMatchObject({
      productionCost: '152.5625',
      pricing: {
        profitRate: '21',
        publishedCashPrice: '185',
      },
    });
  });

  it('9 mm ilk CARD_INSTALLMENT fiyatı geldikten sonra aynı NET masterlarıyla beş satırı hesaplar', async () => {
    const candidates = standardMatrix();
    const { service } = buildService(candidates);
    const netBefore = candidates
      .filter((row) => row.rawMaterial.thicknessMm.equals(9))
      .map((row) => row.netQty);

    const before = await service.getSupurgelikMdfCosts(
      { productCode: 'DUZ_SUPURGELIK' },
      NOW,
    );
    expect(
      before.rows.filter(
        (row) =>
          row.thicknessMm === 9 &&
          row.errorCode === 'RAW_MATERIAL_PRICE_MISSING',
      ),
    ).toHaveLength(5);

    for (const row of candidates.filter((candidate) =>
      candidate.rawMaterial.thicknessMm.equals(9),
    )) {
      row.rawMaterial.prices.push({
        id: 'price-9-card',
        priceType: MaterialPriceType.CARD_INSTALLMENT,
        price: new Decimal('1900'),
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        effectiveTo: null,
        isActive: true,
      });
    }

    const after = await service.getSupurgelikMdfCosts(
      { productCode: 'DUZ_SUPURGELIK' },
      NOW,
    );
    const calculatedNineMm = after.rows.filter((row) => row.thicknessMm === 9);

    expect(calculatedNineMm).toHaveLength(5);
    expect(calculatedNineMm.every((row) => row.priceAvailable)).toBe(true);
    expect(
      calculatedNineMm.every(
        (row) =>
          row.sheetPrice?.amount === '1900' &&
          row.mdfUnitCost != null &&
          row.productionCost != null &&
          row.errorCode === null,
      ),
    ).toBe(true);
    expect(
      candidates
        .filter((row) => row.rawMaterial.thicknessMm.equals(9))
        .map((row) => row.netQty),
    ).toEqual(netBefore);
  });

  it('DEKORATIF_SUPURGELIK toplu response metadata’sıyla 30 satırı kesintisiz döndürür', async () => {
    const { service } = buildService(standardMatrix());

    const result = await service.getSupurgelikMdfCosts(
      { productCode: 'DEKORATIF_SUPURGELIK' },
      NOW,
    );

    expect(result).toMatchObject({
      productCode: 'DEKORATIF_SUPURGELIK',
      masterCount: 30,
      rowCount: 30,
    });
    expect(result.rows).toHaveLength(30);
  });

  it('dekoratif fiyatı thickness-scoped DB oranıyla hesaplar; doğrulanmamış oranları uydurmaz', async () => {
    const { service } = buildService(standardMatrix());

    const result = await service.getSupurgelikMdfCosts(
      { productCode: 'DEKORATIF_SUPURGELIK' },
      NOW,
    );

    expect(result.masterCount).toBe(30);
    expect(result.rowCount).toBe(30);
    expect(result.rows).toHaveLength(30);
    expect(
      result.rows.find((row) => row.thicknessMm === 12 && row.widthMm === 120),
    ).toMatchObject({
      productionCost: '152.5625',
      pricing: {
        profitRate: '20',
        basePublishedCashPrice: '184',
        decorativeRate: '25',
        decorativeAmount: '46',
        priceBeforeDecorativeRounding: '230',
        publishedCashPrice: '230',
        statusCode: null,
      },
      errorCode: null,
    });
    expect(
      result.rows.find((row) => row.thicknessMm === 14 && row.widthMm === 120),
    ).toMatchObject({
      productionCost: '180.0625',
      pricing: {
        basePublishedCashPrice: '217',
        decorativeRate: '25',
        priceBeforeDecorativeRounding: '271.25',
        publishedCashPrice: '272',
      },
      errorCode: null,
    });
    expect(
      result.rows.find((row) => row.thicknessMm === 18 && row.widthMm === 120),
    ).toMatchObject({
      productionCost: '191',
      pricing: {
        basePublishedCashPrice: '230',
        decorativeRate: '45',
        priceBeforeDecorativeRounding: '333.5',
        publishedCashPrice: '334',
      },
      errorCode: null,
    });

    for (const thicknessMm of [8, 10]) {
      const rows = result.rows.filter((row) => row.thicknessMm === thicknessMm);
      expect(rows).toHaveLength(5);
      expect(
        rows.every(
          (row) =>
            row.pricing != null &&
            'decorativeRate' in row.pricing &&
            row.pricing.decorativeRate === null &&
            row.pricing.publishedCashPrice === null &&
            row.errorCode === 'DECORATIVE_RATE_MISSING',
        ),
      ).toBe(true);
    }
    const missingMdfPriceRows = result.rows.filter((row) => row.thicknessMm === 9);
    expect(missingMdfPriceRows).toHaveLength(5);
    expect(
      missingMdfPriceRows.every(
        (row) =>
          row.pricing != null &&
          'decorativeRate' in row.pricing &&
          row.pricing.decorativeRate === null &&
          row.pricing.publishedCashPrice === null &&
          row.errorCode === 'RAW_MATERIAL_PRICE_MISSING',
      ),
    ).toBe(true);
  });

  it.each([
    'DUZ_PP_SARMA_SUPURGELIK',
    'DEKORATIF_PP_SARMA_SUPURGELIK',
  ] as const)(
    '%s için temel maliyeti korur, PP sarma eksikliğini satır bazında işaretler',
    async (productCode) => {
      const { service } = buildService(standardMatrix());

      const result = await service.getSupurgelikMdfCosts({ productCode }, NOW);
      const missingMdfPriceRows = result.rows.filter(
        (row) => row.thicknessMm === 9,
      );
      const costAvailableRows = result.rows.filter(
        (row) => row.thicknessMm !== 9,
      );

      expect(result.rows).toHaveLength(30);
      expect(costAvailableRows).toHaveLength(25);
      expect(
        costAvailableRows.every(
          (row) =>
            row.productionCost != null &&
            row.pricing != null &&
            row.pricing.publishedCashPrice === null &&
            row.errorCode === 'PP_WRAPPING_COST_MISSING',
        ),
      ).toBe(true);

      expect(missingMdfPriceRows).toHaveLength(5);
      expect(
        missingMdfPriceRows.every(
          (row) =>
            row.productionCost === null &&
            row.pricing != null &&
            row.pricing.publishedCashPrice === null &&
            row.errorCode === 'RAW_MATERIAL_PRICE_MISSING',
        ),
      ).toBe(true);
    },
  );

  it('inactive, product-scoped, DoorFrame ve ProductSize dışı kayıtları listelemez', async () => {
    const valid = master(8, 80);
    const inactiveYield = master(8, 90, { isActive: false });
    const inactiveMaterial = master(8, 100, { materialIsActive: false });
    const productScoped = master(8, 120, { productId: 'pervaz-product' });
    const doorFrame = master(12, 100, {
      id: 'door-frame-yield',
      pieceLengthMm: 2100,
      sheetLengthMm: 2800,
    });
    const noProductSize = master(8, 150);
    const { service } = buildService(
      [valid, inactiveYield, inactiveMaterial, productScoped, doorFrame, noProductSize],
      [{ widthMm: 80, lengthMm: 2800 }, { widthMm: 100, lengthMm: 2100 }],
    );

    const result = await service.getSupurgelikMdfCosts(
      { productCode: 'DUZ_SUPURGELIK' },
      NOW,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ thicknessMm: 8, widthMm: 80 });
  });

  it('aynı thickness/width/length için duplicate aktif masterı reddeder', async () => {
    const first = master(12, 120, { id: 'first' });
    const duplicate = master(12, 120, { id: 'duplicate' });
    duplicate.rawMaterial.id = 'other-material';
    duplicate.rawMaterial.code = 'MDF-12-2100X2800-ZIMPARALI-DUPLICATE';
    const { service } = buildService([first, duplicate]);

    await expect(
      service.getSupurgelikMdfCosts({ productCode: 'DUZ_SUPURGELIK' }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('DB masterı olmayan teorik kombinasyonu üretmez', async () => {
    const { service } = buildService(
      [master(8, 80), master(12, 120)],
      [
        ...WIDTHS.map((widthMm) => ({ widthMm, lengthMm: 2800 })),
        { widthMm: 170, lengthMm: 2800 },
      ],
    );

    const result = await service.getSupurgelikMdfCosts(
      { productCode: 'DUZ_SUPURGELIK' },
      NOW,
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows.some((row) => row.widthMm === 170)).toBe(false);
  });
});
