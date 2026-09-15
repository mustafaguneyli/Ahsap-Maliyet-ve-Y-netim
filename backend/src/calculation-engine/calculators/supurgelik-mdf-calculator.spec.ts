import { BadRequestException } from '@nestjs/common';
import {
  SupurgelikMdfCalculator,
  type SupurgelikMdfInput,
} from './supurgelik-mdf-calculator';

describe('SupurgelikMdfCalculator', () => {
  const calculator = new SupurgelikMdfCalculator();
  const input: SupurgelikMdfInput = {
    productCode: 'DUZ_SUPURGELIK',
    thicknessMm: 12,
    widthMm: 120,
    lengthMm: 2800,
    rawMaterial: {
      code: 'MDF-12-2100X2800-ZIMPARALI',
      thicknessMm: '12',
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
    },
    sheetPrice: {
      priceType: 'CARD_INSTALLMENT',
      amount: '2185',
    },
    productionYield: {
      netQty: 16,
      scope: 'GENERIC',
    },
    extraCosts: [
      { code: 'CUTTING', name: 'Kesim', amount: '4' },
      { code: 'LABOR', name: 'İşçilik', amount: '12' },
    ],
    pricing: { profitRate: '20', source: 'GROUP_PRICING_SETTING' },
  };

  it('Decimal MDF maliyetine ortak ek maliyetleri ekler', () => {
    const result = calculator.calculate(input);

    expect(result).toEqual({
      productCode: 'DUZ_SUPURGELIK',
      thicknessMm: 12,
      widthMm: 120,
      lengthMm: 2800,
      rawMaterial: input.rawMaterial,
      sheetPrice: { priceType: 'CARD_INSTALLMENT', amount: '2185' },
      productionYield: {
        netQty: 16,
        scope: 'GENERIC',
        productId: null,
        productScoped: false,
      },
      mdfUnitCost: '136.5625',
      extraCosts: [
        { code: 'CUTTING', name: 'Kesim', amount: '4' },
        { code: 'LABOR', name: 'İşçilik', amount: '12' },
      ],
      extraCostsTotal: '16',
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
    expect(result).not.toHaveProperty('salePrice');
  });

  it('ara tam TL yuvarlaması yapmaz', () => {
    const result = calculator.calculate({
      ...input,
      thicknessMm: 10,
      widthMm: 150,
      rawMaterial: {
        ...input.rawMaterial,
        code: 'MDF-10-2100X2800-ZIMPARALI',
        thicknessMm: '10',
      },
      sheetPrice: { priceType: 'CARD_INSTALLMENT', amount: '1880' },
      productionYield: { netQty: 13, scope: 'GENERIC' },
    });

    expect(result.mdfUnitCost).toBe('144.6153846153846153846153846');
    expect(result.extraCostsTotal).toBe('16');
    expect(result.productionCost).toBe('160.6153846153846153846153846');
    expect(result.pricing).toEqual({
      profitRate: '20',
      source: 'GROUP_PRICING_SETTING',
      profitAmount: '32.12307692307692307692307692',
      priceBeforeRounding: '192.7384615384615384615384615',
      roundedBaseSalePrice: '193',
      publishedCashPrice: '193',
    });
  });

  it('ortak maliyetleri ara yuvarlama yapmadan Decimal olarak toplar', () => {
    const result = calculator.calculate({
      ...input,
      extraCosts: [
        { code: 'CUTTING', name: 'Kesim', amount: '4.125' },
        { code: 'LABOR', name: 'İşçilik', amount: '12.375' },
      ],
    });

    expect(result.mdfUnitCost).toBe('136.5625');
    expect(result.extraCostsTotal).toBe('16.5');
    expect(result.productionCost).toBe('153.0625');
  });

  it('geçersiz NET, fiyat tipi, fiyat ve malzeme kalınlığını reddeder', () => {
    expect(() =>
      calculator.calculate({
        ...input,
        productionYield: { netQty: 0, scope: 'GENERIC' },
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      calculator.calculate({
        ...input,
        sheetPrice: { priceType: 'CASH' as 'CARD_INSTALLMENT', amount: '2185' },
      }),
    ).toThrow('CARD_INSTALLMENT');
    expect(() =>
      calculator.calculate({
        ...input,
        sheetPrice: { priceType: 'CARD_INSTALLMENT', amount: '-1' },
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      calculator.calculate({
        ...input,
        rawMaterial: { ...input.rawMaterial, thicknessMm: '14' },
      }),
    ).toThrow('beklenen 12 mm');
    expect(() =>
      calculator.calculate({
        ...input,
        extraCosts: [{ code: 'CUTTING', name: 'Kesim', amount: '-1' }],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      calculator.calculate({
        ...input,
        extraCosts: [
          { code: 'CUTTING', name: 'Kesim', amount: '4' },
          { code: 'CUTTING', name: 'Kesim', amount: '5' },
        ],
      }),
    ).toThrow('duplicate');
  });

  it.each([
    'DUZ_PP_SARMA_SUPURGELIK',
    'DEKORATIF_PP_SARMA_SUPURGELIK',
  ] as const)('%s için PP maliyeti yokken nakit fiyat uydurmaz', (productCode) => {
    const result = calculator.calculate({
      ...input,
      productCode,
      pricing:
        productCode === 'DEKORATIF_PP_SARMA_SUPURGELIK'
          ? {
              profitRate: '20',
              source: 'GROUP_PRICING_SETTING',
              decorativeRate: '25',
              decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
            }
          : { profitRate: '20', source: 'GROUP_PRICING_SETTING' },
      ppWrappingCost: null,
    });

    expect(result.mdfUnitCost).toBe('136.5625');
    expect(result.extraCostsTotal).toBe('16');
    expect(result.productionCost).toBe('152.5625');
    expect(result.pricing).toMatchObject({
      profitRate: '20',
      baseProductionCost: '152.5625',
      ppWrappingCost: null,
      ppProductionCost: null,
      profitAmount: null,
      publishedCashPrice: null,
      statusCode: 'PP_WRAPPING_COST_MISSING',
    });
    if (productCode === 'DUZ_PP_SARMA_SUPURGELIK') {
      expect(result.pricing).not.toHaveProperty('decorativeRate');
    }
  });

  it('Düz PP 12/120 için wrapping 80 ile nakit 280 üretir', () => {
    const result = calculator.calculate({
      ...input,
      productCode: 'DUZ_PP_SARMA_SUPURGELIK',
      ppWrappingCost: '80',
    });

    expect(result.productionCost).toBe('152.5625');
    expect(result.pricing).toEqual({
      profitRate: '20',
      source: 'GROUP_PRICING_SETTING',
      baseProductionCost: '152.5625',
      ppWrappingCost: '80',
      ppProductionCost: '232.5625',
      profitAmount: '46.5125',
      priceBeforeRounding: '279.075',
      roundedBaseSalePrice: '280',
      publishedCashPrice: '280',
      statusCode: null,
    });
    expect(result.pricing).not.toHaveProperty('decorativeRate');
  });

  it('Dekoratif PP 12/120 wrapping 80 ve %25 ile final 350 üretir', () => {
    const result = calculator.calculate({
      ...input,
      productCode: 'DEKORATIF_PP_SARMA_SUPURGELIK',
      ppWrappingCost: '80',
      pricing: {
        profitRate: '20',
        source: 'GROUP_PRICING_SETTING',
        decorativeRate: '25',
        decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
      },
    });

    expect(result.productionCost).toBe('152.5625');
    expect(result.pricing).toMatchObject({
      baseProductionCost: '152.5625',
      ppWrappingCost: '80',
      ppProductionCost: '232.5625',
      profitAmount: '46.5125',
      roundedBaseSalePrice: '280',
      basePublishedCashPrice: '280',
      decorativeRate: '25',
      publishedCashPrice: '350',
      statusCode: null,
    });
  });

  it('PP_WRAPPING ortak extraCosts içinde kabul edilmez', () => {
    expect(() =>
      calculator.calculate({
        ...input,
        productCode: 'DUZ_PP_SARMA_SUPURGELIK',
        extraCosts: [
          ...input.extraCosts,
          { code: 'PP_WRAPPING', name: 'PP Sarma', amount: '80' },
        ],
        ppWrappingCost: '80',
      }),
    ).toThrow('ortak ek maliyet toplamına katılamaz');
  });

  it('normal ürünlere PP wrapping uygulanamaz', () => {
    expect(() =>
      calculator.calculate({
        ...input,
        ppWrappingCost: '80',
      }),
    ).toThrow('yalnız PP');
  });

  it.each(['0', '-1'])('PP wrapping tutarı %s reddedilir', (amount) => {
    expect(() =>
      calculator.calculate({
        ...input,
        productCode: 'DUZ_PP_SARMA_SUPURGELIK',
        ppWrappingCost: amount,
      }),
    ).toThrow(BadRequestException);
  });

  it('yalnız normal baz girdisini dekoratif nihai fiyat için yeterli saymaz', () => {
    expect(() =>
      calculator.calculate({
        ...input,
        productCode: 'DEKORATIF_SUPURGELIK',
      }),
    ).toThrow('pricing girdisi eksik');
  });

  it.each([
    {
      thicknessMm: 12,
      sheetPrice: '2185',
      rate: '25',
      productionCost: '152.5625',
      base: '184',
      decorativeAmount: '46',
      beforeFinalRoundup: '230',
      final: '230',
    },
    {
      thicknessMm: 14,
      sheetPrice: '2625',
      rate: '25',
      productionCost: '180.0625',
      base: '217',
      decorativeAmount: '54.25',
      beforeFinalRoundup: '271.25',
      final: '272',
    },
    {
      thicknessMm: 18,
      sheetPrice: '2800',
      rate: '45',
      productionCost: '191',
      base: '230',
      decorativeAmount: '103.5',
      beforeFinalRoundup: '333.5',
      final: '334',
    },
  ])(
    '$thicknessMm mm dekoratif oranını ilk ROUNDUP sonrası uygular ve final ROUNDUP yapar',
    (scenario) => {
      const result = calculator.calculate({
        ...input,
        productCode: 'DEKORATIF_SUPURGELIK',
        thicknessMm: scenario.thicknessMm,
        rawMaterial: {
          ...input.rawMaterial,
          code: `MDF-${scenario.thicknessMm}-2100X2800-ZIMPARALI`,
          thicknessMm: String(scenario.thicknessMm),
        },
        sheetPrice: {
          priceType: 'CARD_INSTALLMENT',
          amount: scenario.sheetPrice,
        },
        pricing: {
          profitRate: '20',
          source: 'GROUP_PRICING_SETTING',
          decorativeRate: scenario.rate,
          decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
        },
      });

      expect(result.productionCost).toBe(scenario.productionCost);
      expect(result.pricing).toMatchObject({
        profitRate: '20',
        roundedBaseSalePrice: scenario.base,
        basePublishedCashPrice: scenario.base,
        decorativeRate: scenario.rate,
        decorativeAmount: scenario.decorativeAmount,
        priceBeforeDecorativeRounding: scenario.beforeFinalRoundup,
        publishedCashPrice: scenario.final,
        statusCode: null,
      });
    },
  );

  it('oranı doğrulanmamış dekoratif kalınlıkta baz hesabı korur, nihai fiyat uydurmaz', () => {
    const result = calculator.calculate({
      ...input,
      productCode: 'DEKORATIF_SUPURGELIK',
      thicknessMm: 8,
      rawMaterial: {
        ...input.rawMaterial,
        code: 'MDF-8-2100X2800-ZIMPARALI',
        thicknessMm: '8',
      },
      pricing: {
        profitRate: '20',
        source: 'GROUP_PRICING_SETTING',
        decorativeRate: null,
        decorativeRateSource: null,
      },
    });

    expect(result.productionCost).toBe('152.5625');
    expect(result.pricing).toMatchObject({
      basePublishedCashPrice: '184',
      decorativeRate: null,
      decorativeAmount: null,
      priceBeforeDecorativeRounding: null,
      publishedCashPrice: null,
      statusCode: 'DECORATIVE_RATE_MISSING',
    });
  });

  it('dekoratif modifier productionCost değerini değiştirmez', () => {
    const normal = calculator.calculate(input);
    const decorative = calculator.calculate({
      ...input,
      productCode: 'DEKORATIF_SUPURGELIK',
      pricing: {
        profitRate: '20',
        source: 'GROUP_PRICING_SETTING',
        decorativeRate: '25',
        decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
      },
    });

    expect(decorative.mdfUnitCost).toBe(normal.mdfUnitCost);
    expect(decorative.extraCostsTotal).toBe(normal.extraCostsTotal);
    expect(decorative.productionCost).toBe(normal.productionCost);
    if (
      decorative.pricing == null ||
      normal.pricing == null ||
      !('roundedBaseSalePrice' in decorative.pricing) ||
      !('roundedBaseSalePrice' in normal.pricing)
    ) {
      throw new Error('Normal ve dekoratif pricing sonucu bekleniyor.');
    }
    expect(decorative.pricing.roundedBaseSalePrice).toBe(
      normal.pricing.roundedBaseSalePrice,
    );
  });

  it('eksik, geçersiz ve negatif profitRate değerlerini reddeder', () => {
    expect(() => calculator.calculate({ ...input, pricing: undefined })).toThrow(
      'profitRate',
    );
    expect(() =>
      calculator.calculate({
        ...input,
        pricing: { profitRate: 'abc', source: 'GROUP_PRICING_SETTING' },
      }),
    ).toThrow('geçersiz');
    expect(() =>
      calculator.calculate({
        ...input,
        pricing: { profitRate: '-1', source: 'GROUP_PRICING_SETTING' },
      }),
    ).toThrow('negatif');
  });

  it('geçersiz dekoratif oranı ve eksik oran kaynağını reddeder', () => {
    expect(() =>
      calculator.calculate({
        ...input,
        productCode: 'DEKORATIF_SUPURGELIK',
        pricing: {
          profitRate: '20',
          source: 'GROUP_PRICING_SETTING',
          decorativeRate: '-1',
          decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
        },
      }),
    ).toThrow('negatif');
    expect(() =>
      calculator.calculate({
        ...input,
        productCode: 'DEKORATIF_SUPURGELIK',
        pricing: {
          profitRate: '20',
          source: 'GROUP_PRICING_SETTING',
          decorativeRate: '25',
          decorativeRateSource: null,
        },
      }),
    ).toThrow('oran kaynağı eksik');
  });
});
