import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MaterialPriceType } from '@prisma/client';
import { roundUpToWholeTl, toDecimal } from '../../common/decimal/decimal.util';
import { CostCalculationService } from './cost-calculation.service';
import { PervazQtyService } from '../pervaz/pervaz-qty.service';

describe('CostCalculationService AYARLI_PERVAZ MDF', () => {
  const now = new Date('2026-09-07T12:00:00.000Z');

  function price(type: MaterialPriceType, amount: string, id: string) {
    return {
      id,
      priceType: type,
      price: { toString: () => amount },
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      effectiveTo: null,
      isActive: true,
    };
  }

  const main9 = {
    id: 'mat-9',
    code: 'MDF-9-2200X2800-ZIMPARALI',
    name: '09 MM MDF 220×280',
    thicknessMm: { toString: () => '9' },
    sheetWidthMm: 2200,
    sheetLengthMm: 2800,
    isActive: true,
    prices: [
      price(MaterialPriceType.CASH, '1600', 'p9-cash'),
      price(MaterialPriceType.CARD_INSTALLMENT, '1880', 'p9-card'),
    ],
  };

  const main12_210 = {
    id: 'mat-12-210',
    code: 'MDF-12-2100X2800-ZIMPARALI',
    name: '12 MM MDF 210×280',
    thicknessMm: { toString: () => '12' },
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    isActive: true,
    prices: [
      price(MaterialPriceType.CASH, '1885', 'p12-210-cash'),
      price(MaterialPriceType.CARD_INSTALLMENT, '2185', 'p12-210-card'),
    ],
  };

  const main12_220 = {
    id: 'mat-12-220',
    code: 'MDF-12-2200X2800-ZIMPARALI',
    name: '12 MM MDF 220×280',
    thicknessMm: { toString: () => '12' },
    sheetWidthMm: 2200,
    sheetLengthMm: 2800,
    isActive: true,
    prices: [
      price(MaterialPriceType.CASH, '2100', 'p12-220-cash'),
      price(MaterialPriceType.CARD_INSTALLMENT, '2475', 'p12-220-card'),
    ],
  };

  const main18 = {
    id: 'mat-18',
    code: 'MDF-18-2200X2800-ZIMPARALI',
    name: '18 MM MDF 220×280',
    thicknessMm: { toString: () => '18' },
    sheetWidthMm: 2200,
    sheetLengthMm: 2800,
    isActive: true,
    prices: [
      price(MaterialPriceType.CASH, '2900', 'p18-cash'),
      price(MaterialPriceType.CARD_INSTALLMENT, '3400', 'p18-card'),
    ],
  };

  const kilcik4 = {
    id: 'mat-4',
    code: 'MDF-4-2200X2800-ZIMPARALI',
    name: '04 MM MDF 220×280',
    thicknessMm: { toString: () => '4' },
    sheetWidthMm: 2200,
    sheetLengthMm: 2800,
    isActive: true,
    prices: [
      price(MaterialPriceType.CASH, '900', 'p4-cash'),
      price(MaterialPriceType.CARD_INSTALLMENT, '1050', 'p4-card'),
    ],
  };

  function pervazExtraList(cutting = '4') {
    return {
      productGroupCode: 'PERVAZ',
      productGroupName: 'Pervaz',
      asOf: now.toISOString(),
      items: [
        {
          typeId: 't-cut',
          typeCode: 'CUTTING',
          typeName: 'Kesim',
          valueId: 'v-cut',
          amount: cutting,
          effectiveFrom: now.toISOString(),
          effectiveTo: null,
        },
        {
          typeId: 't-glue',
          typeCode: 'GLUE',
          typeName: 'Tutkal',
          valueId: 'v-glue',
          amount: '4',
          effectiveFrom: now.toISOString(),
          effectiveTo: null,
        },
        {
          typeId: 't-labor',
          typeCode: 'LABOR',
          typeName: 'İşçilik',
          valueId: 'v-labor',
          amount: '4',
          effectiveFrom: now.toISOString(),
          effectiveTo: null,
        },
      ],
      totalAmount: toDecimal(cutting).plus('4').plus('4').toString(),
    };
  }

  const defaultProductSetting = {
    isActive: true,
    profitRate: { toString: () => '15' },
    cardFixedSurchargeAmount: { toString: () => '2' },
  };

  const exceptionFrom = new Date('2026-03-01T00:00:00.000Z');

  function buildService(opts: {
    mainYields: Array<{ rawMaterial: typeof main9; netQty: number; pieceWidthMm: number; pieceLengthMm: number }>;
    kilcikMasterNetQty: number | null;
    thicknessMaterials?: unknown[];
    extraList?: ReturnType<typeof pervazExtraList>;
    rowExceptions?: Array<{
      isActive: boolean;
      effectiveFrom: Date;
      effectiveTo: Date | null;
      profitRate: { toString(): string } | null;
      adjustmentAmount: { toString(): string } | null;
      cardSaleEnabled?: boolean | null;
    }>;
    productSettings?: Array<{
      isActive: boolean;
      profitRate: { toString(): string } | null;
      cardFixedSurchargeAmount?: { toString(): string } | null;
    }>;
    groupSettings?: Array<{ isActive: boolean; profitRate: { toString(): string } | null }>;
    globalSettings?: Array<{ isActive: boolean; profitRate: { toString(): string } | null }>;
  }) {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g-pervaz',
          code: 'PERVAZ',
          name: 'Pervaz',
          isActive: true,
        }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p-ayarli',
          code: 'AYARLI_PERVAZ',
          isActive: true,
        }),
        update: jest.fn(),
      },
      productionYield: {
        findMany: jest.fn().mockResolvedValue(
          opts.mainYields.map((y) => ({
            netQty: y.netQty,
            pieceWidthMm: y.pieceWidthMm,
            pieceLengthMm: y.pieceLengthMm,
            isActive: true,
            rawMaterial: y.rawMaterial,
          })),
        ),
        findFirst: jest.fn().mockImplementation(
          ({
            where,
          }: {
            where: { rawMaterialId: string; pieceWidthMm: number; pieceLengthMm: number };
          }) => {
            const y = opts.mainYields.find(
              (row) =>
                row.rawMaterial.id === where.rawMaterialId &&
                row.pieceWidthMm === where.pieceWidthMm &&
                row.pieceLengthMm === where.pieceLengthMm,
            );
            return Promise.resolve(y ? { netQty: y.netQty } : null);
          },
        ),
        create: jest.fn(),
        update: jest.fn(),
      },
      pervazKilcikYield: {
        findFirst: jest.fn().mockResolvedValue(
          opts.kilcikMasterNetQty == null ? null : { netQty: opts.kilcikMasterNetQty },
        ),
        create: jest.fn(),
      },
      rawMaterial: {
        findUnique: jest.fn().mockResolvedValue(kilcik4),
        findMany: jest.fn().mockResolvedValue(opts.thicknessMaterials ?? []),
      },
      pricingRowException: {
        findMany: jest.fn().mockResolvedValue(opts.rowExceptions ?? []),
      },
      pricingSetting: {
        findMany: jest.fn().mockImplementation(
          ({
            where,
          }: {
            where: { productId?: string | null; productGroupId?: string | null };
          }) => {
            if (where.productId != null) {
              return Promise.resolve(opts.productSettings ?? [defaultProductSetting]);
            }
            if (where.productGroupId != null) {
              return Promise.resolve(opts.groupSettings ?? []);
            }
            return Promise.resolve(opts.globalSettings ?? []);
          },
        ),
      },
    };

    const extraCostsService = {
      listForProductGroup: jest.fn().mockResolvedValue(opts.extraList ?? pervazExtraList()),
    };
    const qtyService = new PervazQtyService(prisma as never);
    const service = new CostCalculationService(
      prisma as never,
      extraCostsService as never,
      qtyService,
    );
    return { service, prisma, extraCostsService };
  }

  it('CARD_INSTALLMENT kullanır; CASH 900/1600 yansımaz', async () => {
    const { service } = buildService({
      mainYields: [
        { rawMaterial: main9, netQty: 40, pieceWidthMm: 70, pieceLengthMm: 2200 },
      ],
      kilcikMasterNetQty: 66,
    });

    const result = await service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 9, widthMm: 70, lengthMm: 2200 },
      now,
    );

    expect(result.priceType).toBe(MaterialPriceType.CARD_INSTALLMENT);
    expect(result.mainPiece.sheetPriceType).toBe('CARD_INSTALLMENT');
    expect(result.kilcik.sheetPriceType).toBe('CARD_INSTALLMENT');
    expect(result.mainPiece.sheetPrice).toBe('1880');
    expect(result.kilcik.sheetPrice).toBe('1050');
    expect(result.mainPiece.sheetPrice).not.toBe('1600');
    expect(result.kilcik.sheetPrice).not.toBe('900');
    expect(result.mainPiece.yieldSource).toBe('EXCEL_MASTER');
    expect(result.kilcik.yieldSource).toBe('EXCEL_MASTER');
    expect(result.kilcik.netQty).toBe(66);
    expect(result.totalMdfCost).toBe(
      toDecimal(result.mainPiece.unitCost).plus(toDecimal(result.kilcik.unitCost)).toFixed(),
    );
    expect(result.extraCosts.cutting).toBe('4');
    expect(result.extraCosts.glue).toBe('4');
    expect(result.extraCosts.labor).toBe('4');
    expect(toDecimal(result.extraCosts.total).equals(toDecimal('12'))).toBe(true);
    expect(
      toDecimal(result.productionCost).equals(
        toDecimal(result.totalMdfCost).plus(toDecimal(result.extraCosts.total)),
      ),
    ).toBe(true);
    expect(result.productionCost.startsWith('74.90909')).toBe(true);
    expect(result.pricing.profitRate).toBe('15');
    expect(result.pricing.profitRateSource).toBe('PRODUCT_PRICING_SETTING');
    expect(result.pricing.profitAmount.startsWith('11.23636')).toBe(true);
    expect(result.pricing.priceBeforeRounding.startsWith('86.14545')).toBe(true);
    expect(
      toDecimal(result.pricing.profitAmount).equals(
        toDecimal(result.productionCost).times('15').div('100'),
      ),
    ).toBe(true);
    expect(result.pricing).not.toHaveProperty('vatRate');
    expect(result.pricing.roundedSalePrice).toBe('87');
    expect(result.pricing.publishedSalePrice).toBe('87');
    expect(result.pricing.adjustmentAmount).toBeNull();
    expect(result.pricing.adjustmentSource).toBe('NONE');
    expect(result.pricing).not.toHaveProperty('finalSalePrice');
    expect(result.pricing.cardSaleAvailable).toBe(false);
    expect(result.pricing.cardSalePrice).toBeNull();
  });

  it('12 mm 10×250 ProductionYield master: 2100 tabaka ve NET 22', async () => {
    const { service } = buildService({
      mainYields: [
        { rawMaterial: main12_210, netQty: 22, pieceWidthMm: 100, pieceLengthMm: 2500 },
      ],
      kilcikMasterNetQty: 52,
    });

    const result = await service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 12, widthMm: 100, lengthMm: 2500 },
      now,
    );

    expect(result.mainPiece.rawMaterialCode).toBe('MDF-12-2100X2800-ZIMPARALI');
    expect(result.mainPiece.netQty).toBe(22);
    expect(result.mainPiece.yieldSource).toBe('EXCEL_MASTER');
    expect(result.kilcik.netQty).toBe(52);
    expect(result.kilcik.yieldSource).toBe('EXCEL_MASTER');
  });

  it('18 mm 10×250 ana NET 21; 14/220 kılçık 62; 16/250 kılçık 44; 18/220 kılçık 50', async () => {
    const eighteen = await buildService({
      mainYields: [
        { rawMaterial: main18, netQty: 21, pieceWidthMm: 100, pieceLengthMm: 2500 },
      ],
      kilcikMasterNetQty: 40,
    }).service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 18, widthMm: 100, lengthMm: 2500 },
      now,
    );
    expect(eighteen.mainPiece.netQty).toBe(21);
    expect(eighteen.kilcik.netQty).toBe(40);

    const k14 = await buildService({
      mainYields: [
        {
          rawMaterial: {
            ...main9,
            id: 'mat-14',
            code: 'MDF-14-2100X2800-ZIMPARALI',
            sheetWidthMm: 2100,
            prices: [
              price(MaterialPriceType.CASH, '2225', 'p14-c'),
              price(MaterialPriceType.CARD_INSTALLMENT, '2625', 'p14-k'),
            ],
          },
          netQty: 21,
          pieceWidthMm: 100,
          pieceLengthMm: 2200,
        },
      ],
      kilcikMasterNetQty: 62,
    }).service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 14, widthMm: 100, lengthMm: 2200 },
      now,
    );
    expect(k14.kilcik.netQty).toBe(62);
    expect(k14.kilcik.unitCost.startsWith('16.9354838709677419354')).toBe(true);

    const k16 = await buildService({
      mainYields: [
        {
          rawMaterial: {
            ...main9,
            id: 'mat-16',
            code: 'MDF-16-2100X2800-ZIMPARALI',
            sheetWidthMm: 2100,
            prices: [
              price(MaterialPriceType.CASH, '2550', 'p16-c'),
              price(MaterialPriceType.CARD_INSTALLMENT, '3000', 'p16-k'),
            ],
          },
          netQty: 21,
          pieceWidthMm: 100,
          pieceLengthMm: 2500,
        },
      ],
      kilcikMasterNetQty: 44,
    }).service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 16, widthMm: 100, lengthMm: 2500 },
      now,
    );
    expect(k16.kilcik.netQty).toBe(44);

    const k18 = await buildService({
      mainYields: [
        { rawMaterial: main18, netQty: 28, pieceWidthMm: 100, pieceLengthMm: 2200 },
      ],
      kilcikMasterNetQty: 50,
    }).service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 18, widthMm: 100, lengthMm: 2200 },
      now,
    );
    expect(k18.kilcik.netQty).toBe(50);
    expect(k18.kilcik.unitCost).toBe('21');
  });

  it('master olmayan 9 mm 70×2800 CALCULATED_EXCEL_RULE kullanır ve DB yazmaz', async () => {
    const { service, prisma } = buildService({
      mainYields: [],
      kilcikMasterNetQty: null,
      thicknessMaterials: [main9],
    });

    const result = await service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 9, widthMm: 70, lengthMm: 2800 },
      now,
    );

    expect(result.mainPiece.yieldSource).toBe('CALCULATED_EXCEL_RULE');
    expect(result.kilcik.yieldSource).toBe('CALCULATED_EXCEL_RULE');
    expect(result.kilcik.netQty).toBe(52);
    expect(prisma.productionYield.create).not.toHaveBeenCalled();
    expect(prisma.pervazKilcikYield.create).not.toHaveBeenCalled();
  });

  it('12 mm master yok ve iki tabaka varsa ham madde tahmin etmez', async () => {
    const { service } = buildService({
      mainYields: [],
      kilcikMasterNetQty: null,
      thicknessMaterials: [main12_210, main12_220],
    });

    await expect(
      service.getAyarliPervazMdfCost(
        { productCode: 'AYARLI_PERVAZ', thicknessMm: 12, widthMm: 70, lengthMm: 2800 },
        now,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PERVAZ ExtraCostValue DB’den okunur; OTHER hesaba girmez', async () => {
    const extraList = {
      ...pervazExtraList(),
      items: [
        ...pervazExtraList().items,
        {
          typeId: 't-other',
          typeCode: 'OTHER',
          typeName: 'Diğer',
          valueId: 'v-other',
          amount: '99',
          effectiveFrom: now.toISOString(),
          effectiveTo: null,
        },
      ],
    };
    const { service, extraCostsService } = buildService({
      mainYields: [
        { rawMaterial: main9, netQty: 40, pieceWidthMm: 70, pieceLengthMm: 2200 },
      ],
      kilcikMasterNetQty: 66,
      extraList,
    });

    const result = await service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 9, widthMm: 70, lengthMm: 2200 },
      now,
    );

    expect(extraCostsService.listForProductGroup).toHaveBeenCalledWith('PERVAZ', now);
    expect(result.extraCosts).not.toHaveProperty('other');
    expect(toDecimal(result.extraCosts.total).equals(toDecimal('12'))).toBe(true);
    expect(result.productionCost.startsWith('74.90909')).toBe(true);
  });

  it('CUTTING 4→6 simülasyonunda productionCost +2; yield/ürün satırı update edilmez', async () => {
    const before = await buildService({
      mainYields: [
        { rawMaterial: main9, netQty: 40, pieceWidthMm: 70, pieceLengthMm: 2200 },
      ],
      kilcikMasterNetQty: 66,
      extraList: pervazExtraList('4'),
    }).service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 9, widthMm: 70, lengthMm: 2200 },
      now,
    );

    const { service, prisma } = buildService({
      mainYields: [
        { rawMaterial: main9, netQty: 40, pieceWidthMm: 70, pieceLengthMm: 2200 },
      ],
      kilcikMasterNetQty: 66,
      extraList: pervazExtraList('6'),
    });

    const after = await service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 9, widthMm: 70, lengthMm: 2200 },
      now,
    );

    expect(after.extraCosts.cutting).toBe('6');
    expect(toDecimal(after.extraCosts.total).equals(toDecimal('14'))).toBe(true);
    expect(after.totalMdfCost).toBe(before.totalMdfCost);
    expect(
      toDecimal(after.productionCost).minus(toDecimal(before.productionCost)).equals(toDecimal(2)),
    ).toBe(true);
    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(prisma.productionYield.update).not.toHaveBeenCalled();
    expect(prisma.productionYield.create).not.toHaveBeenCalled();
    expect(prisma.pervazKilcikYield.create).not.toHaveBeenCalled();
  });

  it('eksik LABOR aktif kaydı açık hata verir; 0 kabul etmez', async () => {
    const extraList = pervazExtraList();
    extraList.items = extraList.items.filter((item) => item.typeCode !== 'LABOR');

    const { service } = buildService({
      mainYields: [
        { rawMaterial: main9, netQty: 40, pieceWidthMm: 70, pieceLengthMm: 2200 },
      ],
      kilcikMasterNetQty: 66,
      extraList,
    });

    await expect(
      service.getAyarliPervazMdfCost(
        { productCode: 'AYARLI_PERVAZ', thicknessMm: 9, widthMm: 70, lengthMm: 2200 },
        now,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('16/100/2500 aktif row exception %20 kullanır', async () => {
    const { service } = buildService({
      mainYields: [
        {
          rawMaterial: {
            ...main9,
            id: 'mat-16',
            code: 'MDF-16-2100X2800-ZIMPARALI',
            sheetWidthMm: 2100,
            prices: [
              price(MaterialPriceType.CASH, '2550', 'p16-c'),
              price(MaterialPriceType.CARD_INSTALLMENT, '3000', 'p16-k'),
            ],
          },
          netQty: 21,
          pieceWidthMm: 100,
          pieceLengthMm: 2500,
        },
      ],
      kilcikMasterNetQty: 44,
      rowExceptions: [
        {
          isActive: true,
          effectiveFrom: exceptionFrom,
          effectiveTo: null,
          profitRate: { toString: () => '20' },
          adjustmentAmount: null,
        },
      ],
    });

    const result = await service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 16, widthMm: 100, lengthMm: 2500 },
      now,
    );

    expect(result.productionCost.startsWith('178.72077')).toBe(true);
    expect(result.pricing.profitRate).toBe('20');
    expect(result.pricing.profitRateSource).toBe('ROW_EXCEPTION');
    expect(
      toDecimal(result.pricing.profitAmount).equals(
        toDecimal(result.productionCost).times('20').div('100'),
      ),
    ).toBe(true);
    expect(
      toDecimal(result.pricing.priceBeforeRounding).equals(
        toDecimal(result.productionCost).plus(toDecimal(result.pricing.profitAmount)),
      ),
    ).toBe(true);
    expect(result.pricing.priceBeforeRounding.startsWith('214.46493')).toBe(true);
    expect(result.pricing.roundedSalePrice).toBe('215');
    expect(result.pricing.publishedSalePrice).toBe('215');
    expect(result.pricing.adjustmentAmount).toBeNull();
    expect(result.pricing.adjustmentSource).toBe('NONE');
    expect(result.pricing.roundedSalePrice).toBe(
      roundUpToWholeTl(result.pricing.priceBeforeRounding).toFixed(),
    );
  });

  it('18 mm 10×220: ROUNDUP sonrası +1 → published 179; profit/productionCost değişmez', async () => {
    const { service } = buildService({
      mainYields: [
        { rawMaterial: main18, netQty: 28, pieceWidthMm: 100, pieceLengthMm: 2200 },
      ],
      kilcikMasterNetQty: 50,
      rowExceptions: [
        {
          isActive: true,
          effectiveFrom: exceptionFrom,
          effectiveTo: null,
          profitRate: null,
          adjustmentAmount: { toString: () => '1' },
          cardSaleEnabled: true,
        },
      ],
    });

    const result = await service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 18, widthMm: 100, lengthMm: 2200 },
      now,
    );

    expect(result.pricing.profitRate).toBe('15');
    expect(result.pricing.profitRateSource).toBe('PRODUCT_PRICING_SETTING');
    expect(result.pricing.adjustmentAmount).toBe('1');
    expect(
      toDecimal(result.pricing.priceBeforeRounding).equals(
        toDecimal(result.productionCost).times('115').div('100'),
      ),
    ).toBe(true);
    expect(
      toDecimal(result.pricing.priceBeforeRounding).equals(
        toDecimal(result.productionCost).times('115').div('100').plus(1),
      ),
    ).toBe(false);
    expect(result.pricing.priceBeforeRounding.startsWith('177.5928')).toBe(true);
    expect(result.pricing.roundedSalePrice).toBe('178');
    expect(result.pricing.adjustmentAmount).toBe('1');
    expect(result.pricing.adjustmentSource).toBe('ROW_EXCEPTION');
    expect(result.pricing.publishedSalePrice).toBe('179');
    expect(result.pricing.cardSaleAvailable).toBe(true);
    expect(result.pricing.cardPricingType).toBe('FIXED_SURCHARGE');
    expect(result.pricing.cardFixedSurchargeAmount).toBe('2');
    expect(result.pricing.cardSalePrice).toBe('181');
    expect(result.pricing.cardSalePrice).not.toBe('180');
    expect(
      toDecimal(result.pricing.publishedSalePrice).equals(
        toDecimal(result.pricing.roundedSalePrice).plus('1'),
      ),
    ).toBe(true);
    expect(
      toDecimal(result.pricing.profitAmount).equals(
        toDecimal(result.productionCost).times('15').div('100'),
      ),
    ).toBe(true);
  });

  it('18 mm 8×220: ROUNDUP 150 + adjustment 1 → published 151', async () => {
    const { service } = buildService({
      mainYields: [
        { rawMaterial: main18, netQty: 35, pieceWidthMm: 80, pieceLengthMm: 2200 },
      ],
      kilcikMasterNetQty: 50,
      rowExceptions: [
        {
          isActive: true,
          effectiveFrom: exceptionFrom,
          effectiveTo: null,
          profitRate: null,
          adjustmentAmount: { toString: () => '1' },
        },
      ],
    });

    const result = await service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 18, widthMm: 80, lengthMm: 2200 },
      now,
    );

    expect(result.pricing.profitRate).toBe('15');
    expect(result.pricing.adjustmentAmount).toBe('1');
    expect(result.pricing.adjustmentSource).toBe('ROW_EXCEPTION');
    expect(result.pricing.roundedSalePrice).toBe('150');
    expect(result.pricing.publishedSalePrice).toBe('151');
    expect(result.pricing.cardSaleAvailable).toBe(false);
    expect(result.pricing.cardSalePrice).toBeNull();
    expect(
      toDecimal(result.pricing.roundedSalePrice).equals(
        roundUpToWholeTl(result.pricing.priceBeforeRounding),
      ),
    ).toBe(true);
  });

  it('product default 15→17: normal satır %17, 16/100/2500 %20 kalır; DB fiyat satırı yazılmaz', async () => {
    const setting17 = [{ isActive: true, profitRate: { toString: () => '17' } }];
    const { service: normalService, prisma: normalPrisma } = buildService({
      mainYields: [
        { rawMaterial: main9, netQty: 40, pieceWidthMm: 70, pieceLengthMm: 2200 },
      ],
      kilcikMasterNetQty: 66,
      productSettings: setting17,
    });
    const normal = await normalService.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 9, widthMm: 70, lengthMm: 2200 },
      now,
    );
    expect(normal.pricing.profitRate).toBe('17');
    expect(normal.pricing.profitRateSource).toBe('PRODUCT_PRICING_SETTING');
    expect(normal.pricing.roundedSalePrice).toBe(
      roundUpToWholeTl(normal.pricing.priceBeforeRounding).toFixed(),
    );
    expect(normal.pricing.roundedSalePrice).not.toBe('87');
    expect(normal.pricing.publishedSalePrice).toBe(normal.pricing.roundedSalePrice);
    expect(normal.pricing.adjustmentSource).toBe('NONE');
    expect(
      toDecimal(normal.pricing.profitAmount).equals(
        toDecimal(normal.productionCost).times('17').div('100'),
      ),
    ).toBe(true);

    const { service: specialService, prisma: specialPrisma } = buildService({
      mainYields: [
        {
          rawMaterial: {
            ...main9,
            id: 'mat-16',
            code: 'MDF-16-2100X2800-ZIMPARALI',
            sheetWidthMm: 2100,
            prices: [
              price(MaterialPriceType.CASH, '2550', 'p16-c'),
              price(MaterialPriceType.CARD_INSTALLMENT, '3000', 'p16-k'),
            ],
          },
          netQty: 21,
          pieceWidthMm: 100,
          pieceLengthMm: 2500,
        },
      ],
      kilcikMasterNetQty: 44,
      productSettings: setting17,
      rowExceptions: [
        {
          isActive: true,
          effectiveFrom: exceptionFrom,
          effectiveTo: null,
          profitRate: { toString: () => '20' },
          adjustmentAmount: null,
        },
      ],
    });
    const special = await specialService.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 16, widthMm: 100, lengthMm: 2500 },
      now,
    );
    expect(special.pricing.profitRate).toBe('20');
    expect(special.pricing.profitRateSource).toBe('ROW_EXCEPTION');
    expect(special.pricing.roundedSalePrice).toBe('215');
    expect(special.pricing.publishedSalePrice).toBe('215');
    expect(special.pricing.adjustmentAmount).toBeNull();
    expect(special.pricing.adjustmentSource).toBe('NONE');
    expect(normalPrisma.product.update).not.toHaveBeenCalled();
    expect(normalPrisma.productionYield.update).not.toHaveBeenCalled();
    expect(specialPrisma.product.update).not.toHaveBeenCalled();
    expect(specialPrisma.productionYield.update).not.toHaveBeenCalled();
  });

  it('ek maliyet değişince ROUNDUP yenilenir; +1 mutlak 179’a dondurulmaz', async () => {
    const yields = {
      mainYields: [
        { rawMaterial: main18, netQty: 28, pieceWidthMm: 100, pieceLengthMm: 2200 },
      ] as const,
      kilcikMasterNetQty: 50,
      rowExceptions: [
        {
          isActive: true,
          effectiveFrom: exceptionFrom,
          effectiveTo: null,
          profitRate: null,
          adjustmentAmount: { toString: () => '1' },
        },
      ],
    };

    const before = await buildService({
      mainYields: [...yields.mainYields],
      kilcikMasterNetQty: yields.kilcikMasterNetQty,
      rowExceptions: yields.rowExceptions,
      extraList: pervazExtraList('4'),
    }).service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 18, widthMm: 100, lengthMm: 2200 },
      now,
    );
    expect(before.pricing.roundedSalePrice).toBe('178');
    expect(before.pricing.publishedSalePrice).toBe('179');

    const after = await buildService({
      mainYields: [...yields.mainYields],
      kilcikMasterNetQty: yields.kilcikMasterNetQty,
      rowExceptions: yields.rowExceptions,
      extraList: pervazExtraList('6'),
    }).service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 18, widthMm: 100, lengthMm: 2200 },
      now,
    );

    expect(toDecimal(after.productionCost).minus(toDecimal(before.productionCost)).equals(2)).toBe(
      true,
    );
    expect(after.pricing.publishedSalePrice).not.toBe('179');
    expect(after.pricing.adjustmentAmount).toBe('1');
    expect(
      toDecimal(after.pricing.publishedSalePrice).equals(
        toDecimal(after.pricing.roundedSalePrice).plus('1'),
      ),
    ).toBe(true);
  });

  it('geçerli profitRate yoksa sessiz default yok', async () => {
    const { service } = buildService({
      mainYields: [
        { rawMaterial: main9, netQty: 40, pieceWidthMm: 70, pieceLengthMm: 2200 },
      ],
      kilcikMasterNetQty: 66,
      productSettings: [{ isActive: true, profitRate: null }],
    });

    await expect(
      service.getAyarliPervazMdfCost(
        { productCode: 'AYARLI_PERVAZ', thicknessMm: 9, widthMm: 70, lengthMm: 2200 },
        now,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('süresi bitmiş row exception %20 default %15’i ezmez', async () => {
    const { service } = buildService({
      mainYields: [
        {
          rawMaterial: {
            ...main9,
            id: 'mat-16',
            code: 'MDF-16-2100X2800-ZIMPARALI',
            sheetWidthMm: 2100,
            prices: [
              price(MaterialPriceType.CASH, '2550', 'p16-c'),
              price(MaterialPriceType.CARD_INSTALLMENT, '3000', 'p16-k'),
            ],
          },
          netQty: 21,
          pieceWidthMm: 100,
          pieceLengthMm: 2500,
        },
      ],
      kilcikMasterNetQty: 44,
      rowExceptions: [
        {
          isActive: true,
          effectiveFrom: exceptionFrom,
          effectiveTo: new Date('2026-06-01T00:00:00.000Z'),
          profitRate: { toString: () => '20' },
          adjustmentAmount: null,
        },
      ],
    });

    const result = await service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 16, widthMm: 100, lengthMm: 2500 },
      now,
    );
    expect(result.pricing.profitRate).toBe('15');
    expect(result.pricing.profitRateSource).toBe('PRODUCT_PRICING_SETTING');
  });

  it('cardSaleEnabled=true satırda kart = nakit + 2', async () => {
    const { service } = buildService({
      mainYields: [
        { rawMaterial: main9, netQty: 40, pieceWidthMm: 70, pieceLengthMm: 2200 },
      ],
      kilcikMasterNetQty: 66,
      rowExceptions: [
        {
          isActive: true,
          effectiveFrom: exceptionFrom,
          effectiveTo: null,
          profitRate: null,
          adjustmentAmount: null,
          cardSaleEnabled: true,
        },
      ],
    });
    const result = await service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 9, widthMm: 70, lengthMm: 2200 },
      now,
    );
    expect(result.pricing.publishedSalePrice).toBe('87');
    expect(result.pricing.cardSaleAvailable).toBe(true);
    expect(result.pricing.cardSalePrice).toBe('89');
    expect(result.pricing).not.toHaveProperty('cardMarkupRate');
  });

  it('cardFixed 2→3 yalnız kartı değiştirir; nakit aynı kalır', async () => {
    const yields = {
      mainYields: [
        { rawMaterial: main18, netQty: 28, pieceWidthMm: 100, pieceLengthMm: 2200 },
      ],
      kilcikMasterNetQty: 50,
      rowExceptions: [
        {
          isActive: true,
          effectiveFrom: exceptionFrom,
          effectiveTo: null,
          profitRate: null,
          adjustmentAmount: { toString: () => '1' },
          cardSaleEnabled: true,
        },
      ],
    };
    const two = await buildService({
      ...yields,
      productSettings: [
        {
          isActive: true,
          profitRate: { toString: () => '15' },
          cardFixedSurchargeAmount: { toString: () => '2' },
        },
      ],
    }).service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 18, widthMm: 100, lengthMm: 2200 },
      now,
    );
    const three = await buildService({
      ...yields,
      productSettings: [
        {
          isActive: true,
          profitRate: { toString: () => '15' },
          cardFixedSurchargeAmount: { toString: () => '3' },
        },
      ],
    }).service.getAyarliPervazMdfCost(
      { productCode: 'AYARLI_PERVAZ', thicknessMm: 18, widthMm: 100, lengthMm: 2200 },
      now,
    );
    expect(two.pricing.publishedSalePrice).toBe('179');
    expect(three.pricing.publishedSalePrice).toBe('179');
    expect(two.pricing.cardSalePrice).toBe('181');
    expect(three.pricing.cardSalePrice).toBe('182');
  });
});
