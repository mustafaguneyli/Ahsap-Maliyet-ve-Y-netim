import { NotFoundException } from '@nestjs/common';
import { MaterialPriceType } from '@prisma/client';
import { toDecimal } from '../../common/decimal/decimal.util';
import { CostCalculationService } from './cost-calculation.service';

describe('CostCalculationService fiyat yayılımı', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');

  const material22 = {
    id: 'mat-22',
    code: 'MDF-22-2100X2800-ZIMPARALI',
    name: '22 MM MDF',
    thicknessMm: { toString: () => '22' },
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    isActive: true,
    prices: [
      {
        id: 'p22-old',
        priceType: MaterialPriceType.CARD_INSTALLMENT,
        price: { toString: () => '4400' },
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-09-04T00:00:00.000Z'),
        isActive: true,
      },
      {
        id: 'p22-new',
        priceType: MaterialPriceType.CARD_INSTALLMENT,
        price: { toString: () => '4700' },
        effectiveFrom: new Date('2026-09-04T00:00:00.000Z'),
        effectiveTo: null,
        isActive: true,
      },
    ],
  };

  const material12 = {
    id: 'mat-12',
    code: 'MDF-12-2100X2800-ZIMPARALI',
    name: '12 MM MDF',
    thicknessMm: { toString: () => '12' },
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    isActive: true,
    prices: [
      {
        id: 'p12',
        priceType: MaterialPriceType.CARD_INSTALLMENT,
        price: { toString: () => '2185' },
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        effectiveTo: null,
        isActive: true,
      },
    ],
  };

  const material12_220 = {
    ...material12,
    id: 'mat-12-220',
    code: 'MDF-12-2200X2800-ZIMPARALI',
    sheetWidthMm: 2200,
  };

  function extraCostsList(cutting = '8') {
    return {
      productGroupCode: 'door_frame',
      productGroupName: 'Kapı Kasası',
      asOf: now.toISOString(),
      items: [
        { typeId: 't-cut', typeCode: 'CUTTING', typeName: 'Kesim', valueId: 'v-cut', amount: cutting, effectiveFrom: now.toISOString(), effectiveTo: null },
        { typeId: 't-glue', typeCode: 'GLUE', typeName: 'Tutkal', valueId: 'v-glue', amount: '3.5', effectiveFrom: now.toISOString(), effectiveTo: null },
        { typeId: 't-labor', typeCode: 'LABOR', typeName: 'İşçilik', valueId: 'v-labor', amount: '17', effectiveFrom: now.toISOString(), effectiveTo: null },
        { typeId: 't-other', typeCode: 'OTHER', typeName: 'Diğer', valueId: 'v-other', amount: '5', effectiveFrom: now.toISOString(), effectiveTo: null },
      ],
      totalAmount: cutting === '8' ? '33.5' : '35.5',
    };
  }

  function buildService(
    materials: unknown[],
    extraList = extraCostsList(),
    vatRate: string | null = '0',
    profitRate: string | null = '20',
    cardMarkupRate: string | null = '20',
    cashOverrides: Array<{ widthMm: number; lengthMm: number; cashPrice: string }> = [],
    sizeProfitOverrides: Array<{
      widthMm: number;
      lengthMm: number;
      profitRate: string;
    }> = [],
  ) {
    const productSetting =
      vatRate == null
        ? null
        : {
            id: 'ps-34',
            productId: 'p34',
            productGroupId: null,
            vatRate: { toString: () => vatRate },
            profitRate: profitRate == null ? null : { toString: () => profitRate },
            cardMarkupRate:
              cardMarkupRate == null ? null : { toString: () => cardMarkupRate },
            isActive: true,
          };
    const sizeRows = (
      sizeProfitOverrides.length > 0 ? sizeProfitOverrides : cashOverrides
    ).map((row, index) => ({
      id: `sz-${index}`,
      widthMm: row.widthMm,
      lengthMm: row.lengthMm,
    }));
    const prisma = {
      rawMaterial: {
        findMany: jest.fn().mockResolvedValue(materials),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      productionYield: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g1',
          code: 'door_frame',
          isActive: true,
        }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p34',
          code: '34_MM',
          isActive: true,
        }),
      },
      pricingSetting: {
        findFirst: jest.fn().mockResolvedValue(productSetting),
        findMany: jest.fn().mockImplementation(
          ({
            where,
          }: {
            where: { productId?: string | null; productGroupId?: string | null };
          }) => {
            if (where.productId === 'p34') {
              return Promise.resolve(productSetting ? [productSetting] : []);
            }
            return Promise.resolve([]);
          },
        ),
      },
      productSize: {
        findMany: jest.fn().mockResolvedValue(sizeRows),
      },
      priceOverride: {
        findMany: jest.fn().mockResolvedValue(
          cashOverrides.map((o, i) => ({
            id: `ov-${i}`,
            productId: 'p34',
            productSizeId: `sz-${i}`,
            cashPrice: { toString: () => o.cashPrice },
            reason: '2026-4',
            isActive: true,
          })),
        ),
      },
      productPricingOverride: {
        findMany: jest.fn().mockResolvedValue(
          sizeProfitOverrides.map((row, index) => ({
            id: `po-${index}`,
            productId: 'p34',
            productSizeId: `sz-${index}`,
            profitRate: { toString: () => row.profitRate },
            isActive: true,
            effectiveFrom: now,
            effectiveTo: null,
          })),
        ),
      },
    };

    const sizes = [
      [10, 210], [11, 210], [12, 210], [13, 210], [14, 210], [14, 220], [14, 230],
      [15, 210], [15, 215], [16, 210], [16, 235], [17, 210], [18, 210], [19, 210],
      [20, 210], [20, 230], [21, 210], [22, 210], [22, 215], [23, 210], [24, 210],
      [25, 210], [30, 210], [35, 210],
    ];
    const yields: Array<{
      rawMaterialId: string;
      pieceWidthMm: number;
      pieceLengthMm: number;
      netQty: number;
      isActive: boolean;
    }> = [];
    for (const [w, l] of sizes) {
      yields.push({
        rawMaterialId: 'mat-22',
        pieceWidthMm: w * 10,
        pieceLengthMm: l * 10,
        netQty: 26,
        isActive: true,
      });
      const secondaryId =
        (w === 14 && (l === 220 || l === 230)) || (w === 15 && l === 215)
          ? 'mat-12-220'
          : 'mat-12';
      yields.push({
        rawMaterialId: secondaryId,
        pieceWidthMm: w * 10,
        pieceLengthMm: l * 10,
        netQty: 46,
        isActive: true,
      });
    }
    prisma.productionYield.findMany.mockResolvedValue(yields);

    const extraCostsService = {
      listForProductGroup: jest.fn().mockResolvedValue(extraList),
    };

    return new CostCalculationService(
      prisma as never,
      extraCostsService as never,
      { resolvePervazPiece: jest.fn(), resolveKilcik: jest.fn() } as never,
    );
  }

  it('22mm 4400→4700 sonrası 10×210 22mm maliyeti değişir, 12mm değişmez', async () => {
    const service = buildService([material22, material12, material12_220]);
    const result = await service.getDoorFrameMdfCosts('34_MM', now);
    const row = result.rows.find((r) => r.displayName === '10×210')!;
    const p22 = row.parts.find((p) => p.thicknessMm === '22')!;
    const p12 = row.parts.find((p) => p.thicknessMm === '12')!;

    expect(p22.sheetPrice).toBe('4700');
    expect(p22.unitCost.startsWith('180.7692307692307692307')).toBe(true); // 4700/26
    expect(p12.sheetPrice).toBe('2185');
    expect(p12.unitCost).toBe('47.5');
    expect(row.mdfCost.startsWith('228.2692307692307692307')).toBe(true); // 180.769... + 47.5

    // Eski fiyat geçmişi material22.prices içinde korunuyor (DB mock); seçim yeni fiyat
    expect(material22.prices.some((p) => p.price.toString() === '4400')).toBe(true);
    expect(material22.prices.some((p) => p.price.toString() === '4700')).toBe(true);
  });

  it('gelecek tarihli 4700 fiyatı bugünkü hesaba yansımaz', async () => {
    const materials = [
      {
        ...material22,
        prices: [
          {
            id: 'p22-current',
            priceType: MaterialPriceType.CARD_INSTALLMENT,
            price: { toString: () => '4400' },
            effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
            effectiveTo: new Date('2026-12-01T00:00:00.000Z'),
            isActive: true,
          },
          {
            id: 'p22-future',
            priceType: MaterialPriceType.CARD_INSTALLMENT,
            price: { toString: () => '4700' },
            effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
            effectiveTo: null,
            isActive: true,
          },
        ],
      },
      material12,
      material12_220,
    ];
    const service = buildService(materials);
    const result = await service.getDoorFrameMdfCosts('34_MM', now);
    const row = result.rows.find((r) => r.displayName === '10×210')!;
    const p22 = row.parts.find((p) => p.thicknessMm === '22')!;

    expect(p22.sheetPrice).toBe('4400');
    expect(p22.unitCost.startsWith('169.2307692307692307692')).toBe(true);
  });

  it('CUTTING 8→10 sonrası tüm satırlarda productionCost +2 değişir', async () => {
    const materials = [material22, material12, material12_220];
    const before = await buildService(materials, extraCostsList('8')).getDoorFrameMdfCosts(
      '34_MM',
      now,
    );
    const after = await buildService(materials, extraCostsList('10')).getDoorFrameMdfCosts(
      '34_MM',
      now,
    );

    const beforeRow = before.rows.find((r) => r.displayName === '10×210')!;
    const afterRow = after.rows.find((r) => r.displayName === '10×210')!;

    expect(before.extraCosts.cutting).toBe('8');
    expect(after.extraCosts.cutting).toBe('10');
    expect(afterRow.extraCosts.total).toBe('35.5');
    expect(afterRow.mdfCost).toBe(beforeRow.mdfCost);
    expect(
      toDecimal(afterRow.productionCost).minus(toDecimal(beforeRow.productionCost)).toString(),
    ).toBe('2');

    for (const row of after.rows) {
      const prev = before.rows.find((r) => r.displayName === row.displayName)!;
      expect(
        toDecimal(row.productionCost).minus(toDecimal(prev.productionCost)).toString(),
      ).toBe('2');
    }
  });

  it('34_MM vatRate 0 iken vatAmount 0 ve costWithVat = productionCost', async () => {
    const result = await buildService(
      [material22, material12, material12_220],
      extraCostsList(),
      '0',
    ).getDoorFrameMdfCosts('34_MM', now);
    const row = result.rows.find((r) => r.displayName === '10×210')!;
    expect(result.vatRate).toBe('0');
    expect(row.pricing.vatRate).toBe('0');
    expect(row.pricing.vatAmount).toBe('0');
    expect(row.pricing.costWithVat).toBe(row.productionCost);
  });

  it('vatRate 0→10 olunca costWithVat productionCost * 1.1 olur, satır UPDATE edilmez', async () => {
    const materials = [material22, material12, material12_220];
    const zero = await buildService(materials, extraCostsList(), '0').getDoorFrameMdfCosts(
      '34_MM',
      now,
    );
    const ten = await buildService(materials, extraCostsList(), '10').getDoorFrameMdfCosts(
      '34_MM',
      now,
    );
    const a = zero.rows.find((r) => r.displayName === '10×210')!;
    const b = ten.rows.find((r) => r.displayName === '10×210')!;
    expect(a.productionCost).toBe(b.productionCost);
    expect(
      toDecimal(b.pricing.costWithVat)
        .minus(toDecimal(a.productionCost).times('1.1'))
        .abs()
        .isZero(),
    ).toBe(true);
  });

  it('PricingSetting yoksa sessiz 0 kabul etmez', async () => {
    await expect(
      buildService([material22, material12, material12_220], extraCostsList(), null).getDoorFrameMdfCosts(
        '34_MM',
        now,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('34_MM profitRate 20 iken kâr costWithVat üzerinden hesaplanır', async () => {
    const result = await buildService(
      [material22, material12, material12_220],
      extraCostsList(),
      '0',
      '20',
    ).getDoorFrameMdfCosts('34_MM', now);
    const row = result.rows.find((r) => r.displayName === '10×210')!;
    expect(result.profitRate).toBe('20');
    expect(row.pricing.profitRate).toBe('20');
    expect(
      toDecimal(row.pricing.profitAmount)
        .minus(toDecimal(row.pricing.costWithVat).times('20').div('100'))
        .abs()
        .isZero(),
    ).toBe(true);
    expect(
      toDecimal(row.pricing.priceBeforeRounding)
        .minus(toDecimal(row.pricing.costWithVat).plus(toDecimal(row.pricing.profitAmount)))
        .abs()
        .isZero(),
    ).toBe(true);
  });

  it('A/B) aynı üründe 10×210 %20 ve 12×210 %30 ayrı kâr/satış üretir', async () => {
    const result = await buildService(
      [material22, material12, material12_220],
      extraCostsList(),
      '0',
      '15',
      '20',
      [],
      [
        { widthMm: 100, lengthMm: 2100, profitRate: '20' },
        { widthMm: 120, lengthMm: 2100, profitRate: '30' },
      ],
    ).getDoorFrameMdfCosts('34_MM', now);
    const ten = result.rows.find((r) => r.displayName === '10×210')!;
    const twelve = result.rows.find((r) => r.displayName === '12×210')!;
    expect(ten.pricing.profitRate).toBe('20');
    expect(twelve.pricing.profitRate).toBe('30');
    expect(ten.pricing.profitRateSource).toBe('SIZE_OVERRIDE');
    expect(twelve.pricing.profitRateSource).toBe('SIZE_OVERRIDE');
    expect(
      toDecimal(ten.pricing.profitAmount)
        .minus(toDecimal(ten.pricing.costWithVat).times('20').div('100'))
        .abs()
        .isZero(),
    ).toBe(true);
    expect(
      toDecimal(twelve.pricing.profitAmount)
        .minus(toDecimal(twelve.pricing.costWithVat).times('30').div('100'))
        .abs()
        .isZero(),
    ).toBe(true);
    expect(ten.pricing.priceBeforeRounding).not.toBe(twelve.pricing.priceBeforeRounding);
  });

  it('profitRate 20→25 olunca priceBeforeRounding değişir, satır UPDATE edilmez', async () => {
    const materials = [material22, material12, material12_220];
    const twenty = await buildService(materials, extraCostsList(), '0', '20').getDoorFrameMdfCosts(
      '34_MM',
      now,
    );
    const twentyFive = await buildService(materials, extraCostsList(), '0', '25').getDoorFrameMdfCosts(
      '34_MM',
      now,
    );
    const a = twenty.rows.find((r) => r.displayName === '10×210')!;
    const b = twentyFive.rows.find((r) => r.displayName === '10×210')!;
    expect(a.pricing.costWithVat).toBe(b.pricing.costWithVat);
    expect(a.pricing.priceBeforeRounding).not.toBe(b.pricing.priceBeforeRounding);
    expect(
      toDecimal(b.pricing.priceBeforeRounding)
        .minus(toDecimal(a.pricing.costWithVat).times('1.25'))
        .abs()
        .isZero(),
    ).toBe(true);
  });

  it('profitRate yoksa sessiz varsayım yapmaz', async () => {
    await expect(
      buildService(
        [material22, material12, material12_220],
        extraCostsList(),
        '0',
        null,
      ).getDoorFrameMdfCosts('34_MM', now),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cardMarkupRate yoksa nakit durur, kart null olur; 0 uydurulmaz', async () => {
    const result = await buildService(
      [material22, material12, material12_220],
      extraCostsList(),
      '0',
      '20',
      null,
    ).getDoorFrameMdfCosts('34_MM', now);
    const row = result.rows.find((r) => r.displayName === '10×210')!;
    expect(row.pricing.cashSalePrice).toBeTruthy();
    expect(row.pricing.publishedCashPrice).toBe(row.pricing.cashSalePrice);
    expect(row.pricing.publishedCardPrice).toBeNull();
    expect(row.pricing.cardSalePrice).toBeNull();
    expect(result.cardMarkupRate).toBeNull();
  });

  it('cardMarkupRate 20→25 olunca nakit aynı, kart fiyatı değişir', async () => {
    const materials = [material22, material12, material12_220];
    const twenty = await buildService(
      materials,
      extraCostsList(),
      '0',
      '20',
      '20',
    ).getDoorFrameMdfCosts('34_MM', now);
    const twentyFive = await buildService(
      materials,
      extraCostsList(),
      '0',
      '20',
      '25',
    ).getDoorFrameMdfCosts('34_MM', now);
    const a = twenty.rows.find((r) => r.displayName === '10×210')!;
    const b = twentyFive.rows.find((r) => r.displayName === '10×210')!;
    expect(a.pricing.cashSalePrice).toBe(b.pricing.cashSalePrice);
    expect(a.pricing.cardSalePrice).not.toBe(b.pricing.cardSalePrice);
    expect(resultCardTimes(a.pricing.cashSalePrice, '1.25')).toBe(b.pricing.cardPriceBeforeRounding);
  });

  it('10×210 override: calculated 301 kalır, published 300 / kart 360', async () => {
    const materials = [
      {
        ...material22,
        prices: [
          {
            id: 'p22-current',
            priceType: MaterialPriceType.CARD_INSTALLMENT,
            price: { toString: () => '4400' },
            effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
            effectiveTo: null,
            isActive: true,
          },
        ],
      },
      material12,
      material12_220,
    ];
    const result = await buildService(
      materials,
      extraCostsList(),
      '0',
      '20',
      '20',
      [{ widthMm: 100, lengthMm: 2100, cashPrice: '300' }],
    ).getDoorFrameMdfCosts('34_MM', now);
    const row = result.rows.find((r) => r.displayName === '10×210')!;
    expect(row.pricing.cashSalePrice).toBe('301');
    expect(row.pricing.calculatedCashPrice).toBe('301');
    expect(row.pricing.roundedSalePrice).toBe('301');
    expect(row.pricing.publishedCashPrice).toBe('300');
    expect(row.pricing.publishedCardPrice).toBe('360');
    expect(row.pricing.cashOverride?.cashPrice).toBe('300');
    const noOverride = result.rows.find((r) => r.displayName === '12×210')!;
    expect(noOverride.pricing.publishedCashPrice).toBe(noOverride.pricing.calculatedCashPrice);
  });

  it('iki MDF parçası aynı seçili alış türünü kullanır; eksik tür diğerine düşmez', async () => {
    const both = (
      material: typeof material22,
      cash: string,
      card: string,
    ) => ({
      ...material,
      prices: [
        {
          id: `${material.id}-cash`,
          priceType: MaterialPriceType.CASH,
          price: { toString: () => cash },
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
        {
          id: `${material.id}-card`,
          priceType: MaterialPriceType.CARD_INSTALLMENT,
          price: { toString: () => card },
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
      ],
    });
    const materials = [
      both(material22, '2000', '2500'),
      both(material12, '2000', '2500'),
      both(material12_220, '1800', '2500'),
    ];
    const service = buildService(materials);
    const cash = await service.getDoorFrameMdfCosts('34_MM', now, 'CASH');
    const card = await service.getDoorFrameMdfCosts('34_MM', now);

    const cashRow = cash.rows.find((row) => row.displayName === '10×210')!;
    const cardRow = card.rows.find((row) => row.displayName === '10×210')!;
    const wide = cash.rows.find((row) => row.displayName === '14×220')!;

    expect(cash.materialPriceType).toBe('CASH');
    expect(card.priceType).toBe(MaterialPriceType.CARD_INSTALLMENT);
    expect(cashRow.parts.map((part) => part.sheetPrice)).toEqual(['2000', '2000']);
    expect(cashRow.parts.map((part) => part.rawMaterialCode)).toEqual([
      'MDF-22-2100X2800-ZIMPARALI',
      'MDF-12-2100X2800-ZIMPARALI',
    ]);
    expect(cardRow.parts.every((part) => part.sheetPrice === '2500')).toBe(true);
    expect(wide.parts.map((part) => part.rawMaterialCode)).toEqual([
      'MDF-22-2100X2800-ZIMPARALI',
      'MDF-12-2200X2800-ZIMPARALI',
    ]);
    expect(wide.parts.map((part) => part.sheetPrice)).toEqual(['2000', '1800']);
    expect(cashRow.parts.map((part) => part.netQty)).toEqual(
      cardRow.parts.map((part) => part.netQty),
    );
    expect(cashRow.extraCosts).toEqual(cardRow.extraCosts);

    const missingCash = buildService([
      both(material22, '2000', '2500'),
      { ...both(material12, '2000', '2500'), prices: both(material12, '2000', '2500').prices.filter((price) => price.priceType === MaterialPriceType.CARD_INSTALLMENT) },
      both(material12_220, '1800', '2500'),
    ]);
    await expect(missingCash.getDoorFrameMdfCosts('34_MM', now, 'CASH')).rejects.toThrow(
      'MDF-12-2100X2800-ZIMPARALI için şu an geçerli CASH alış fiyatı bulunamadı.',
    );
  });

  it('12 mm planlanmış nakit fiyatı geçiş anında değişir, kart fiyatı aynı kalır', async () => {
    const twelve = {
      ...material12,
      prices: [
        {
          id: 'cash-1885-closed',
          priceType: MaterialPriceType.CASH,
          price: { toString: () => '1885' },
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: new Date('2026-09-04T00:00:00.000Z'),
          isActive: true,
        },
        {
          id: 'cash-2000',
          priceType: MaterialPriceType.CASH,
          price: { toString: () => '2000' },
          effectiveFrom: new Date('2026-09-04T00:00:00.000Z'),
          effectiveTo: new Date('2026-10-04T00:00:00.000Z'),
          isActive: true,
        },
        {
          id: 'cash-1885-open',
          priceType: MaterialPriceType.CASH,
          price: { toString: () => '1885' },
          effectiveFrom: new Date('2026-10-04T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
        {
          id: 'card-2185',
          priceType: MaterialPriceType.CARD_INSTALLMENT,
          price: { toString: () => '2185' },
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
      ],
    };
    const priced = (
      material: typeof material22,
      cash: string,
      card: string,
    ) => ({
      ...material,
      prices: [
        {
          id: `${material.id}-cash`,
          priceType: MaterialPriceType.CASH,
          price: { toString: () => cash },
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
        {
          id: `${material.id}-card`,
          priceType: MaterialPriceType.CARD_INSTALLMENT,
          price: { toString: () => card },
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
      ],
    });
    const service = buildService([
      priced(material22, '3750', '4400'),
      twelve,
      priced(material12_220, '2100', '2475'),
    ]);
    const sheet = async (
      instant: string,
      priceType?: 'CASH',
    ) => {
      const result = await service.getDoorFrameMdfCosts(
        '34_MM',
        new Date(instant),
        priceType,
      );
      return result.rows
        .find((row) => row.displayName === '10×210')!
        .parts.find((part) => part.thicknessMm === '12')!.sheetPrice;
    };

    expect(await sheet('2026-10-03T23:59:59.999Z', 'CASH')).toBe('2000');
    expect(await sheet('2026-10-04T00:00:00.000Z', 'CASH')).toBe('1885');
    expect(await sheet('2026-10-04T00:00:00.001Z', 'CASH')).toBe('1885');
    expect(await sheet('2026-10-03T23:59:59.999Z')).toBe('2185');
    expect(await sheet('2026-10-04T00:00:00.000Z')).toBe('2185');
    expect(await sheet('2026-10-04T00:00:00.001Z')).toBe('2185');
  });

  it('yalnız değişen alış türünün tabaka fiyatını günceller', async () => {
    const priced = (
      material: typeof material22,
      cash: string,
      card: string,
    ) => ({
      ...material,
      prices: [
        {
          id: `${material.id}-cash`,
          priceType: MaterialPriceType.CASH,
          price: { toString: () => cash },
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
        {
          id: `${material.id}-card`,
          priceType: MaterialPriceType.CARD_INSTALLMENT,
          price: { toString: () => card },
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
      ],
    });
    const load = (cash12: string, card12: string) =>
      buildService([
        priced(material22, '3750', '4400'),
        priced(material12, cash12, card12),
        priced(material12_220, '2100', '2475'),
      ]);
    const quote = async (
      service: CostCalculationService,
      priceType?: 'CASH',
    ) => service.getDoorFrameMdfCosts('34_MM', now, priceType);
    const sheet12 = (
      result: Awaited<ReturnType<CostCalculationService['getDoorFrameMdfCosts']>>,
    ) =>
      result.rows
        .find((row) => row.displayName === '10×210')!
        .parts.find((part) => part.thicknessMm === '12')!.sheetPrice;

    const baseCash = await quote(load('2000', '2185'), 'CASH');
    const raisedCash = await quote(load('2100', '2185'), 'CASH');
    const baseCard = await quote(load('2000', '2185'));
    const raisedCard = await quote(load('2000', '2300'));

    expect(sheet12(baseCash)).toBe('2000');
    expect(sheet12(raisedCash)).toBe('2100');
    expect(sheet12(baseCard)).toBe('2185');
    expect(sheet12(raisedCard)).toBe('2300');
    expect(sheet12(await quote(load('2100', '2185')))).toBe('2185');
    expect(sheet12(await quote(load('2000', '2300'), 'CASH'))).toBe('2000');
    const baseRow = baseCash.rows.find((row) => row.displayName === '10×210')!;
    const raisedRow = raisedCash.rows.find((row) => row.displayName === '10×210')!;
    expect(baseRow.parts.map((part) => part.netQty)).toEqual(
      raisedRow.parts.map((part) => part.netQty),
    );
    expect(baseCash.extraCosts).toEqual(raisedCash.extraCosts);
    expect(baseCard.extraCosts).toEqual(raisedCard.extraCosts);
    expect(baseCash.profitRate).toBe(raisedCard.profitRate);
    expect(baseCash.cardMarkupRate).toBe(raisedCard.cardMarkupRate);
  });
});

function resultCardTimes(cash: string, factor: string): string {
  return toDecimal(cash).times(factor).toFixed();
}