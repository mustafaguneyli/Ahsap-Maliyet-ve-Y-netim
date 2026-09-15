import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MaterialPriceType, PricingModifierType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import type { SupurgelikProductCode } from '../../calculation-engine/calculators/supurgelik-mdf-calculator';
import { toDecimal } from '../../common/decimal/decimal.util';
import { CostCalculationService } from './cost-calculation.service';

const NOW = new Date('2026-09-10T12:00:00.000Z');

function wrappingResponse(amount: string | null = null) {
  return {
    productGroupCode: 'SUPURGELIK',
    productGroupName: 'Süpürgelik',
    asOf: NOW.toISOString(),
    items: [
      {
        typeId: 'type-PP_WRAPPING',
        typeCode: 'PP_WRAPPING',
        typeName: 'PP Sarma',
        valueId: amount == null ? null : 'value-PP_WRAPPING',
        amount,
        effectiveFrom: amount == null ? null : '2026-09-14T00:00:00.000Z',
        effectiveTo: null,
      },
    ],
    totalAmount: amount ?? '',
  };
}

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

function cardPrice(amount: string): {
  id: string;
  priceType: MaterialPriceType;
  price: Decimal;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
} {
  return {
    id: `card-${amount}`,
    priceType: MaterialPriceType.CARD_INSTALLMENT,
    price: new Decimal(amount),
    effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
    effectiveTo: null,
    isActive: true,
  };
}

function master(
  thicknessMm: number,
  widthMm: number,
  netQty: number,
  price: string,
) {
  return {
    id: `yield-${thicknessMm}-${widthMm}`,
    productId: null,
    rawMaterialId: `material-${thicknessMm}`,
    pieceWidthMm: widthMm,
    pieceLengthMm: 2800,
    netQty,
    isActive: true,
    rawMaterial: {
      id: `material-${thicknessMm}`,
      code: `MDF-${thicknessMm}-2100X2800-ZIMPARALI`,
      name: `${thicknessMm} MM MDF`,
      thicknessMm: new Decimal(thicknessMm),
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
      surfaceType: 'Zımparalı',
      supplierName: 'DEMPAŞ',
      isActive: true,
      prices: [cardPrice(price)],
    },
  };
}

function buildService(
  rows: ReturnType<typeof master>[],
  currentExtraCosts: () => ReturnType<typeof extraCostsResponse> = () =>
    extraCostsResponse(),
  currentPricingSettings: () => Array<{
    id: string;
    productGroupId: string;
    productId: null;
    profitRate: Decimal | null;
    isActive: boolean;
  }> = () => [
    {
      id: 'pricing-supurgelik',
      productGroupId: 'group-supurgelik',
      productId: null,
      profitRate: new Decimal('20'),
      isActive: true,
    },
  ],
  currentPpWrapping: () => ReturnType<typeof wrappingResponse> = () =>
    wrappingResponse(null),
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
    productionYield: {
      findMany: jest.fn().mockResolvedValue(rows),
    },
    pricingSetting: {
      findMany: jest.fn().mockImplementation(() =>
        Promise.resolve(currentPricingSettings()),
      ),
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
    listForProductGroup: jest.fn().mockImplementation(() =>
      Promise.resolve(currentExtraCosts()),
    ),
    getSupurgelikPpWrapping: jest.fn().mockImplementation(() =>
      Promise.resolve(currentPpWrapping()),
    ),
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

describe('CostCalculationService.getSupurgelikMdfCost', () => {
  it.each([
    [12, 120, 16, '2185', '136.5625', '184'],
    [14, 120, 16, '2625', '164.0625', '217'],
    [18, 100, 20, '2800', '140', '188'],
    [8, 80, 25, '1620', '64.8', '97'],
    [10, 150, 13, '1880', '144.6153846153846153846153846', '193'],
  ])(
    '%i mm / %i×2800 için DB MASTER NET=%i kullanır',
    async (thicknessMm, widthMm, netQty, price, expectedUnitCost, expectedCash) => {
      const { prisma, service } = buildService([
        master(thicknessMm, widthMm, netQty, price),
      ]);

      const result = await service.getSupurgelikMdfCost(
        {
          productCode: 'DUZ_SUPURGELIK',
          thicknessMm,
          widthMm,
          lengthMm: 2800,
        },
        NOW,
      );

      expect(result.productionYield).toEqual({
        netQty,
        scope: 'GENERIC',
        productId: null,
        productScoped: false,
      });
      expect(result.sheetPrice).toEqual({
        priceType: 'CARD_INSTALLMENT',
        amount: price,
      });
      expect(result.mdfUnitCost).toBe(expectedUnitCost);
      expect(result.extraCosts).toEqual([
        { code: 'CUTTING', name: 'Kesim', amount: '4' },
        { code: 'LABOR', name: 'İşçilik', amount: '12' },
      ]);
      expect(result.extraCostsTotal).toBe('16');
      expect(toDecimal(result.productionCost).minus(result.mdfUnitCost).toFixed()).toBe('16');
      expect(result.pricing).toMatchObject({
        profitRate: '20',
        source: 'GROUP_PRICING_SETTING',
        roundedBaseSalePrice: expectedCash,
        publishedCashPrice: expectedCash,
      });
      expect(prisma.productionYield.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            productId: null,
            isActive: true,
            pieceWidthMm: widthMm,
            pieceLengthMm: 2800,
            rawMaterial: expect.objectContaining({
              isActive: true,
              thicknessMm,
            }),
          }),
        }),
      );
    },
  );

  it('dört ürün aynı generic master ve temel calculatorı reuse eder', async () => {
    const { prisma, service } = buildService([master(12, 120, 16, '2185')]);
    const codes: SupurgelikProductCode[] = [
      'DUZ_SUPURGELIK',
      'DEKORATIF_SUPURGELIK',
      'DUZ_PP_SARMA_SUPURGELIK',
      'DEKORATIF_PP_SARMA_SUPURGELIK',
    ];

    const results = [];
    for (const productCode of codes) {
      results.push(
        await service.getSupurgelikMdfCost(
          { productCode, thicknessMm: 12, widthMm: 120, lengthMm: 2800 },
          NOW,
        ),
      );
    }

    expect(results.map((row) => row.productCode)).toEqual(codes);
    expect(new Set(results.map((row) => row.mdfUnitCost))).toEqual(new Set(['136.5625']));
    expect(new Set(results.map((row) => row.extraCostsTotal))).toEqual(new Set(['16']));
    expect(new Set(results.map((row) => row.productionCost))).toEqual(
      new Set(['152.5625']),
    );
    expect(results[0].pricing?.publishedCashPrice).toBe('184');
    expect(results[1].pricing).toMatchObject({
      basePublishedCashPrice: '184',
      decorativeRate: '25',
      publishedCashPrice: '230',
    });
    expect(results[2].pricing).toMatchObject({
      baseProductionCost: '152.5625',
      ppWrappingCost: null,
      ppProductionCost: null,
      publishedCashPrice: null,
      statusCode: 'PP_WRAPPING_COST_MISSING',
    });
    expect(results[3].pricing).toMatchObject({
      baseProductionCost: '152.5625',
      ppWrappingCost: null,
      ppProductionCost: null,
      publishedCashPrice: null,
      statusCode: 'PP_WRAPPING_COST_MISSING',
    });
    expect(prisma.pricingSetting.findMany).toHaveBeenCalledTimes(4);
    expect(prisma.pricingThicknessModifier.findMany).toHaveBeenCalledTimes(2);
    expect(
      prisma.productionYield.findMany.mock.calls.every(
        ([arg]) => arg.where.productId === null,
      ),
    ).toBe(true);
  });

  it('CUTTING 5 + LABOR 12 dört ürüne ortak +1 yansır; Düz 185, PP kuralı yok', async () => {
    const { service } = buildService(
      [master(12, 120, 16, '2185')],
      () => extraCostsResponse('5', '12'),
    );
    const codes: SupurgelikProductCode[] = [
      'DUZ_SUPURGELIK',
      'DEKORATIF_SUPURGELIK',
      'DUZ_PP_SARMA_SUPURGELIK',
      'DEKORATIF_PP_SARMA_SUPURGELIK',
    ];

    const results = [];
    for (const productCode of codes) {
      results.push(
        await service.getSupurgelikMdfCost(
          { productCode, thicknessMm: 12, widthMm: 120, lengthMm: 2800 },
          NOW,
        ),
      );
    }

    expect(new Set(results.map((row) => row.mdfUnitCost))).toEqual(new Set(['136.5625']));
    expect(new Set(results.map((row) => row.extraCostsTotal))).toEqual(new Set(['17']));
    expect(new Set(results.map((row) => row.productionCost))).toEqual(new Set(['153.5625']));
    expect(results[0].pricing?.publishedCashPrice).toBe('185');
    expect(results[1].pricing).toMatchObject({
      basePublishedCashPrice: '185',
      decorativeRate: '25',
      publishedCashPrice: '232',
    });
    expect(results[2].pricing).toMatchObject({
      statusCode: 'PP_WRAPPING_COST_MISSING',
      publishedCashPrice: null,
    });
    expect(results[3].pricing).toMatchObject({
      statusCode: 'PP_WRAPPING_COST_MISSING',
      publishedCashPrice: null,
    });
  });

  it('profitRate 21 yalnız pricing’i değiştirir; dekoratif base 185, PP kuralı yok', async () => {
    const { prisma, service } = buildService(
      [master(12, 120, 16, '2185')],
      () => extraCostsResponse(),
      () => [
        {
          id: 'pricing-supurgelik',
          productGroupId: 'group-supurgelik',
          productId: null,
          profitRate: new Decimal('21'),
          isActive: true,
        },
      ],
    );
    const codes: SupurgelikProductCode[] = [
      'DUZ_SUPURGELIK',
      'DEKORATIF_SUPURGELIK',
      'DUZ_PP_SARMA_SUPURGELIK',
      'DEKORATIF_PP_SARMA_SUPURGELIK',
    ];

    const results = [];
    for (const productCode of codes) {
      results.push(
        await service.getSupurgelikMdfCost(
          { productCode, thicknessMm: 12, widthMm: 120, lengthMm: 2800 },
          NOW,
        ),
      );
    }

    expect(new Set(results.map((row) => row.mdfUnitCost))).toEqual(new Set(['136.5625']));
    expect(new Set(results.map((row) => row.extraCostsTotal))).toEqual(new Set(['16']));
    expect(new Set(results.map((row) => row.productionCost))).toEqual(new Set(['152.5625']));
    expect(results[0].pricing).toMatchObject({
      profitRate: '21',
      profitAmount: '32.038125',
      priceBeforeRounding: '184.600625',
      publishedCashPrice: '185',
    });
    expect(results[1].pricing).toMatchObject({
      profitRate: '21',
      basePublishedCashPrice: '185',
      decorativeRate: '25',
      publishedCashPrice: '232',
    });
    expect(results[2].pricing).toMatchObject({
      statusCode: 'PP_WRAPPING_COST_MISSING',
      publishedCashPrice: null,
    });
    expect(results[3].pricing).toMatchObject({
      statusCode: 'PP_WRAPPING_COST_MISSING',
      publishedCashPrice: null,
    });
    expect(
      prisma.pricingSetting.findMany.mock.calls.every(
        ([arg]) => arg.where.productId === null,
      ),
    ).toBe(true);
  });

  it('PP wrapping 80 yalnız PP ürünlerinin nakit fiyatını üretir; normal ürünler değişmez', async () => {
    const { service, extraCostsService } = buildService(
      [master(12, 120, 16, '2185')],
      () => extraCostsResponse(),
      undefined,
      () => wrappingResponse('80'),
    );
    const codes: SupurgelikProductCode[] = [
      'DUZ_SUPURGELIK',
      'DEKORATIF_SUPURGELIK',
      'DUZ_PP_SARMA_SUPURGELIK',
      'DEKORATIF_PP_SARMA_SUPURGELIK',
    ];

    const results = [];
    for (const productCode of codes) {
      results.push(
        await service.getSupurgelikMdfCost(
          { productCode, thicknessMm: 12, widthMm: 120, lengthMm: 2800 },
          NOW,
        ),
      );
    }

    expect(results[0].pricing?.publishedCashPrice).toBe('184');
    expect(results[1].pricing).toMatchObject({
      publishedCashPrice: '230',
      decorativeRate: '25',
    });
    expect(results[2].pricing).toMatchObject({
      baseProductionCost: '152.5625',
      ppWrappingCost: '80',
      ppProductionCost: '232.5625',
      profitAmount: '46.5125',
      publishedCashPrice: '280',
      statusCode: null,
    });
    expect(results[3].pricing).toMatchObject({
      baseProductionCost: '152.5625',
      ppWrappingCost: '80',
      ppProductionCost: '232.5625',
      basePublishedCashPrice: '280',
      decorativeRate: '25',
      publishedCashPrice: '350',
      statusCode: null,
    });
    expect(new Set(results.map((row) => row.productionCost))).toEqual(
      new Set(['152.5625']),
    );
    expect(extraCostsService.getSupurgelikPpWrapping).toHaveBeenCalledTimes(2);
  });

  it('inactive yieldı sorgu dışında tutar ve MASTER yok hatası verir', async () => {
    const { prisma, service } = buildService([]);

    await expect(
      service.getSupurgelikMdfCost(
        {
          productCode: 'DUZ_SUPURGELIK',
          thicknessMm: 12,
          widthMm: 120,
          lengthMm: 2800,
        },
        NOW,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.productionYield.findMany.mock.calls[0][0].where.isActive).toBe(true);
  });

  it('aynı bağlamda birden fazla aktif generic yield varsa açık hata verir', async () => {
    const first = master(12, 120, 16, '2185');
    const second = {
      ...master(12, 120, 17, '2200'),
      id: 'yield-duplicate',
      rawMaterial: {
        ...master(12, 120, 17, '2200').rawMaterial,
        id: 'material-duplicate',
        code: 'MDF-12-2100X2800-ZIMPARALI-DUPLICATE',
      },
    };
    const { service } = buildService([first, second]);

    await expect(
      service.getSupurgelikMdfCost(
        {
          productCode: 'DUZ_SUPURGELIK',
          thicknessMm: 12,
          widthMm: 120,
          lengthMm: 2800,
        },
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aktif fiyatı effective tarihleriyle DB satırlarından seçer', async () => {
    const row = master(12, 120, 16, '1');
    row.rawMaterial.prices = [
      {
        ...cardPrice('2100'),
        id: 'expired',
        effectiveTo: new Date('2026-09-01T00:00:00.000Z'),
      },
      cardPrice('2185'),
      {
        ...cardPrice('9999'),
        id: 'future',
        effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
      },
    ];
    const { service } = buildService([row]);

    const result = await service.getSupurgelikMdfCost(
      {
        productCode: 'DUZ_SUPURGELIK',
        thicknessMm: 12,
        widthMm: 120,
        lengthMm: 2800,
      },
      NOW,
    );

    expect(result.sheetPrice.amount).toBe('2185');
    expect(result.mdfUnitCost).toBe('136.5625');
  });

  it('ortak gider X→X+1 olduğunda yalnız toplam ve productionCost +1 değişir', async () => {
    let cutting = '4';
    const { prisma, service, extraCostsService } = buildService(
      [master(12, 120, 16, '2185')],
      () => extraCostsResponse(cutting, '12'),
    );

    const before = await service.getSupurgelikMdfCost(
      {
        productCode: 'DUZ_SUPURGELIK',
        thicknessMm: 12,
        widthMm: 120,
        lengthMm: 2800,
      },
      NOW,
    );
    cutting = '5';
    const after = await service.getSupurgelikMdfCost(
      {
        productCode: 'DUZ_SUPURGELIK',
        thicknessMm: 12,
        widthMm: 120,
        lengthMm: 2800,
      },
      NOW,
    );

    expect(before.mdfUnitCost).toBe('136.5625');
    expect(after.mdfUnitCost).toBe(before.mdfUnitCost);
    expect(before.extraCostsTotal).toBe('16');
    expect(after.extraCostsTotal).toBe('17');
    expect(before.productionCost).toBe('152.5625');
    expect(after.productionCost).toBe('153.5625');
    expect(before.pricing?.publishedCashPrice).toBe('184');
    expect(after.pricing?.publishedCashPrice).toBe('185');
    expect(extraCostsService.listForProductGroup).toHaveBeenCalledTimes(2);
    expect(prisma.productionYield.findMany).toHaveBeenCalledTimes(2);
    expect('updateMany' in prisma.productionYield).toBe(false);
    expect('updateMany' in prisma.product).toBe(false);
  });

  it('profitRate X→X+1 olduğunda yalnız pricing sonuçlarını request anında değiştirir', async () => {
    let profitRate = '20';
    const { prisma, service, extraCostsService } = buildService(
      [master(12, 120, 16, '2185')],
      () => extraCostsResponse(),
      () => [
        {
          id: 'pricing-supurgelik',
          productGroupId: 'group-supurgelik',
          productId: null,
          profitRate: new Decimal(profitRate),
          isActive: true,
        },
      ],
    );

    const before = await service.getSupurgelikMdfCost(
      {
        productCode: 'DUZ_SUPURGELIK',
        thicknessMm: 12,
        widthMm: 120,
        lengthMm: 2800,
      },
      NOW,
    );
    profitRate = '21';
    const after = await service.getSupurgelikMdfCost(
      {
        productCode: 'DUZ_SUPURGELIK',
        thicknessMm: 12,
        widthMm: 120,
        lengthMm: 2800,
      },
      NOW,
    );

    expect(after.mdfUnitCost).toBe(before.mdfUnitCost);
    expect(after.extraCostsTotal).toBe(before.extraCostsTotal);
    expect(after.productionCost).toBe(before.productionCost);
    expect(before.pricing).toMatchObject({
      profitRate: '20',
      profitAmount: '30.5125',
      publishedCashPrice: '184',
    });
    expect(after.pricing).toMatchObject({
      profitRate: '21',
      profitAmount: '32.038125',
      publishedCashPrice: '185',
    });
    expect(prisma.pricingSetting.findMany).toHaveBeenCalledTimes(2);
    expect(extraCostsService.listForProductGroup).toHaveBeenCalledTimes(2);
    expect('updateMany' in prisma.productionYield).toBe(false);
    expect('updateMany' in prisma.product).toBe(false);
  });

  it('inactive/eksik ve duplicate aktif group pricing contextlerini açıkça reddeder', async () => {
    const row = master(12, 120, 16, '2185');
    const missing = buildService([row], undefined, () => []);
    await expect(
      missing.service.getSupurgelikMdfCost(
        {
          productCode: 'DUZ_SUPURGELIK',
          thicknessMm: 12,
          widthMm: 120,
          lengthMm: 2800,
        },
        NOW,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const setting = {
      id: 'pricing-supurgelik',
      productGroupId: 'group-supurgelik',
      productId: null,
      profitRate: new Decimal('20'),
      isActive: true,
    };
    const duplicate = buildService([row], undefined, () => [setting, setting]);
    await expect(
      duplicate.service.getSupurgelikMdfCost(
        {
          productCode: 'DUZ_SUPURGELIK',
          thicknessMm: 12,
          widthMm: 120,
          lengthMm: 2800,
        },
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('9 mm 2100×2800 fiyatı yoksa 0 veya 2200×2800 fallback kullanmaz', async () => {
    const row = master(9, 120, 17, '1880');
    row.rawMaterial.prices = [];
    const { prisma, service } = buildService([row]);

    await expect(
      service.getSupurgelikMdfCost(
        {
          productCode: 'DUZ_SUPURGELIK',
          thicknessMm: 9,
          widthMm: 120,
          lengthMm: 2800,
        },
        NOW,
      ),
    ).rejects.toThrow(
      'Aktif MDF fiyatı bulunamadı: MDF-9-2100X2800-ZIMPARALI / CARD_INSTALLMENT',
    );
    expect(prisma.productionYield.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.productionYield.findMany.mock.calls[0][0].where).toMatchObject({
      productId: null,
      rawMaterial: { thicknessMm: 9 },
    });
  });
});
