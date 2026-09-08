/**
 * Pervaz Excel golden fixture — source of truth.
 * Production DB kullanılmaz. Fiyatlar / NET / masraf / oranlar fixture’dadır;
 * production code içinde hardcode edilmez.
 */

export type PervazExcelGoldenExtraCosts = {
  cutting: string;
  glue: string;
  labor: string;
};

export const PERVAZ_EXCEL_GOLDEN_INPUTS = {
  extras: {
    cutting: '4',
    glue: '4',
    labor: '4',
  } satisfies PervazExcelGoldenExtraCosts,
  extraTotal: '12',
  kilcikRawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
  kilcikSheetPrice: '1050',
  defaultProfitRate: '15',
  cardFixedSurchargeAmount: '2',
} as const;

export type AyarliPervazExcelGoldenRow = {
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  mainRawMaterial: string;
  mainSheetPrice: string;
  mainNet: number;
  kilcikSheetPrice: string;
  kilcikNet: number;
  cutting: string;
  glue: string;
  labor: string;
  profitRate: string;
  adjustmentAmount: string | null;
  cardSaleEnabled: boolean;
  cardFixedSurchargeAmount: string;
  expectedTotalMdfCost: string;
  expectedProductionCost: string;
  expectedPriceBeforeRounding: string;
  expectedRoundedCash: string;
  expectedPublishedCash: string;
  expectedCardPrice: string | null;
};

export type DekoratifPervazExcelGoldenRow = {
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  mainRawMaterial: string;
  mainSheetPrice: string;
  mainNet: number;
  kilcikSheetPrice: string;
  kilcikNet: number;
  cutting: string;
  glue: string;
  labor: string;
  profitRate: string;
  decorativePremiumRate: string;
  expectedTotalMdfCost: string;
  expectedProductionCost: string;
  expectedPriceBeforeRounding: string;
  expectedRoundedCash: string;
  expectedPublishedCash: string;
  expectedCardPrice: string;
};

export type DekoratifGenisKilcikExcelGoldenRow = {
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  mainRawMaterial: string;
  mainSheetPrice: string;
  mainNet: number;
  kilcikSheetPrice: string;
  kilcikNet: number;
  cutting: string;
  glue: string;
  labor: string;
  profitRate: string;
  decorativePremiumRate: string;
  expectedTotalMdfCost: string;
  expectedProductionCost: string;
  expectedPriceBeforeRounding: string;
  expectedRoundedCash: string;
  expectedPublishedCash: string;
  cardSaleAvailable: false;
  expectedCardPrice: null;
};

const E = PERVAZ_EXCEL_GOLDEN_INPUTS.extras;
const KILCIK = PERVAZ_EXCEL_GOLDEN_INPUTS.kilcikSheetPrice;
const SURCHARGE = PERVAZ_EXCEL_GOLDEN_INPUTS.cardFixedSurchargeAmount;

function ayarli(
  row: Omit<
    AyarliPervazExcelGoldenRow,
    'kilcikSheetPrice' | 'cutting' | 'glue' | 'labor' | 'cardFixedSurchargeAmount'
  >,
): AyarliPervazExcelGoldenRow {
  return {
    ...row,
    kilcikSheetPrice: KILCIK,
    cutting: E.cutting,
    glue: E.glue,
    labor: E.labor,
    cardFixedSurchargeAmount: SURCHARGE,
  };
}

function dekoratif(
  row: Omit<
    DekoratifPervazExcelGoldenRow,
    'kilcikSheetPrice' | 'cutting' | 'glue' | 'labor' | 'profitRate'
  >,
): DekoratifPervazExcelGoldenRow {
  return {
    ...row,
    kilcikSheetPrice: KILCIK,
    cutting: E.cutting,
    glue: E.glue,
    labor: E.labor,
    profitRate: PERVAZ_EXCEL_GOLDEN_INPUTS.defaultProfitRate,
  };
}

function genis(
  row: Omit<
    DekoratifGenisKilcikExcelGoldenRow,
    | 'kilcikSheetPrice'
    | 'cutting'
    | 'glue'
    | 'labor'
    | 'profitRate'
    | 'decorativePremiumRate'
    | 'cardSaleAvailable'
    | 'expectedCardPrice'
    | 'mainRawMaterial'
    | 'mainSheetPrice'
    | 'kilcikNet'
    | 'thicknessMm'
    | 'widthMm'
  >,
): DekoratifGenisKilcikExcelGoldenRow {
  return {
    thicknessMm: 12,
    widthMm: 90,
    mainRawMaterial: 'MDF-12-2200X2800-ZIMPARALI',
    mainSheetPrice: '2475',
    kilcikNet: 40,
    kilcikSheetPrice: KILCIK,
    cutting: E.cutting,
    glue: E.glue,
    labor: E.labor,
    profitRate: PERVAZ_EXCEL_GOLDEN_INPUTS.defaultProfitRate,
    decorativePremiumRate: '30',
    cardSaleAvailable: false,
    expectedCardPrice: null,
    ...row,
  };
}

/** Excel AYARLI PERVAZ — 20 doğrulanmış satır. */
export const AYARLI_PERVAZ_EXCEL_GOLDEN_ROWS: AyarliPervazExcelGoldenRow[] = [
  ayarli({
    thicknessMm: 9,
    widthMm: 70,
    lengthMm: 2200,
    mainRawMaterial: 'MDF-9-2200X2800-ZIMPARALI',
    mainSheetPrice: '1880',
    mainNet: 40,
    kilcikNet: 66,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: true,
    expectedTotalMdfCost: '62.90909090909090909090909091',
    expectedProductionCost: '74.90909090909090909090909091',
    expectedPriceBeforeRounding: '86.14545454545454545454545455',
    expectedRoundedCash: '87',
    expectedPublishedCash: '87',
    expectedCardPrice: '89',
  }),
  ayarli({
    thicknessMm: 9,
    widthMm: 80,
    lengthMm: 2200,
    mainRawMaterial: 'MDF-9-2200X2800-ZIMPARALI',
    mainSheetPrice: '1880',
    mainNet: 35,
    kilcikNet: 66,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: true,
    expectedTotalMdfCost: '69.62337662337662337662337662',
    expectedProductionCost: '81.62337662337662337662337662',
    expectedPriceBeforeRounding: '93.86688311688311688311688311',
    expectedRoundedCash: '94',
    expectedPublishedCash: '94',
    expectedCardPrice: '96',
  }),
  ayarli({
    thicknessMm: 9,
    widthMm: 80,
    lengthMm: 2300,
    mainRawMaterial: 'MDF-9-2200X2800-ZIMPARALI',
    mainSheetPrice: '1880',
    mainNet: 27,
    kilcikNet: 52,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: false,
    expectedTotalMdfCost: '89.82193732193732193732193732',
    expectedProductionCost: '101.8219373219373219373219373',
    expectedPriceBeforeRounding: '117.0952279202279202279202279',
    expectedRoundedCash: '118',
    expectedPublishedCash: '118',
    expectedCardPrice: null,
  }),
  ayarli({
    thicknessMm: 9,
    widthMm: 90,
    lengthMm: 2200,
    mainRawMaterial: 'MDF-9-2200X2800-ZIMPARALI',
    mainSheetPrice: '1880',
    mainNet: 31,
    kilcikNet: 66,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: true,
    expectedTotalMdfCost: '76.55425219941348973607038123',
    expectedProductionCost: '88.55425219941348973607038123',
    expectedPriceBeforeRounding: '101.8373900293255131964809384',
    expectedRoundedCash: '102',
    expectedPublishedCash: '102',
    expectedCardPrice: '104',
  }),
  ayarli({
    thicknessMm: 9,
    widthMm: 90,
    lengthMm: 2500,
    mainRawMaterial: 'MDF-9-2200X2800-ZIMPARALI',
    mainSheetPrice: '1880',
    mainNet: 24,
    kilcikNet: 52,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: true,
    expectedTotalMdfCost: '98.52564102564102564102564102',
    expectedProductionCost: '110.525641025641025641025641',
    expectedPriceBeforeRounding: '127.1044871794871794871794872',
    expectedRoundedCash: '128',
    expectedPublishedCash: '128',
    expectedCardPrice: '130',
  }),
  ayarli({
    thicknessMm: 9,
    widthMm: 100,
    lengthMm: 2200,
    mainRawMaterial: 'MDF-9-2200X2800-ZIMPARALI',
    mainSheetPrice: '1880',
    mainNet: 28,
    kilcikNet: 66,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: true,
    expectedTotalMdfCost: '83.05194805194805194805194805',
    expectedProductionCost: '95.05194805194805194805194805',
    expectedPriceBeforeRounding: '109.3097402597402597402597403',
    expectedRoundedCash: '110',
    expectedPublishedCash: '110',
    expectedCardPrice: '112',
  }),
  ayarli({
    thicknessMm: 9,
    widthMm: 100,
    lengthMm: 2550,
    mainRawMaterial: 'MDF-9-2200X2800-ZIMPARALI',
    mainSheetPrice: '1880',
    mainNet: 22,
    kilcikNet: 52,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: false,
    expectedTotalMdfCost: '105.6468531468531468531468531',
    expectedProductionCost: '117.6468531468531468531468531',
    expectedPriceBeforeRounding: '135.2938811188811188811188811',
    expectedRoundedCash: '136',
    expectedPublishedCash: '136',
    expectedCardPrice: null,
  }),
  ayarli({
    thicknessMm: 9,
    widthMm: 120,
    lengthMm: 2200,
    mainRawMaterial: 'MDF-9-2200X2800-ZIMPARALI',
    mainSheetPrice: '1880',
    mainNet: 23,
    kilcikNet: 66,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: false,
    expectedTotalMdfCost: '97.64822134387351778656126482',
    expectedProductionCost: '109.6482213438735177865612648',
    expectedPriceBeforeRounding: '126.0954545454545454545454545',
    expectedRoundedCash: '127',
    expectedPublishedCash: '127',
    expectedCardPrice: null,
  }),
  ayarli({
    thicknessMm: 12,
    widthMm: 70,
    lengthMm: 2200,
    mainRawMaterial: 'MDF-12-2200X2800-ZIMPARALI',
    mainSheetPrice: '2475',
    mainNet: 40,
    kilcikNet: 66,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: true,
    expectedTotalMdfCost: '77.78409090909090909090909091',
    expectedProductionCost: '89.78409090909090909090909091',
    expectedPriceBeforeRounding: '103.2517045454545454545454546',
    expectedRoundedCash: '104',
    expectedPublishedCash: '104',
    expectedCardPrice: '106',
  }),
  ayarli({
    thicknessMm: 12,
    widthMm: 80,
    lengthMm: 2200,
    mainRawMaterial: 'MDF-12-2200X2800-ZIMPARALI',
    mainSheetPrice: '2475',
    mainNet: 35,
    kilcikNet: 66,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: true,
    expectedTotalMdfCost: '86.62337662337662337662337662',
    expectedProductionCost: '98.62337662337662337662337662',
    expectedPriceBeforeRounding: '113.4168831168831168831168831',
    expectedRoundedCash: '114',
    expectedPublishedCash: '114',
    expectedCardPrice: '116',
  }),
  ayarli({
    thicknessMm: 12,
    widthMm: 90,
    lengthMm: 2200,
    mainRawMaterial: 'MDF-12-2200X2800-ZIMPARALI',
    mainSheetPrice: '2475',
    mainNet: 31,
    kilcikNet: 66,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: true,
    expectedTotalMdfCost: '95.74780058651026392961876833',
    expectedProductionCost: '107.7478005865102639296187683',
    expectedPriceBeforeRounding: '123.9099706744868035190615836',
    expectedRoundedCash: '124',
    expectedPublishedCash: '124',
    expectedCardPrice: '126',
  }),
  ayarli({
    thicknessMm: 12,
    widthMm: 100,
    lengthMm: 2200,
    mainRawMaterial: 'MDF-12-2200X2800-ZIMPARALI',
    mainSheetPrice: '2475',
    mainNet: 28,
    kilcikNet: 66,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: true,
    expectedTotalMdfCost: '104.3019480519480519480519481',
    expectedProductionCost: '116.3019480519480519480519481',
    expectedPriceBeforeRounding: '133.7472402597402597402597403',
    expectedRoundedCash: '134',
    expectedPublishedCash: '134',
    expectedCardPrice: '136',
  }),
  ayarli({
    thicknessMm: 12,
    widthMm: 100,
    lengthMm: 2500,
    mainRawMaterial: 'MDF-12-2100X2800-ZIMPARALI',
    mainSheetPrice: '2185',
    mainNet: 22,
    kilcikNet: 52,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: true,
    expectedTotalMdfCost: '119.5104895104895104895104895',
    expectedProductionCost: '131.5104895104895104895104895',
    expectedPriceBeforeRounding: '151.2370629370629370629370629',
    expectedRoundedCash: '152',
    expectedPublishedCash: '152',
    expectedCardPrice: '154',
  }),
  ayarli({
    thicknessMm: 14,
    widthMm: 100,
    lengthMm: 2200,
    mainRawMaterial: 'MDF-14-2100X2800-ZIMPARALI',
    mainSheetPrice: '2625',
    mainNet: 21,
    kilcikNet: 62,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: false,
    expectedTotalMdfCost: '141.935483870967741935483871',
    expectedProductionCost: '153.935483870967741935483871',
    expectedPriceBeforeRounding: '177.0258064516129032258064517',
    expectedRoundedCash: '178',
    expectedPublishedCash: '178',
    expectedCardPrice: null,
  }),
  ayarli({
    thicknessMm: 14,
    widthMm: 100,
    lengthMm: 2500,
    mainRawMaterial: 'MDF-14-2100X2800-ZIMPARALI',
    mainSheetPrice: '2625',
    mainNet: 21,
    kilcikNet: 48,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: false,
    expectedTotalMdfCost: '146.875',
    expectedProductionCost: '158.875',
    expectedPriceBeforeRounding: '182.70625',
    expectedRoundedCash: '183',
    expectedPublishedCash: '183',
    expectedCardPrice: null,
  }),
  ayarli({
    thicknessMm: 16,
    widthMm: 100,
    lengthMm: 2200,
    mainRawMaterial: 'MDF-16-2100X2800-ZIMPARALI',
    mainSheetPrice: '3000',
    mainNet: 21,
    kilcikNet: 56,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: false,
    expectedTotalMdfCost: '161.6071428571428571428571429',
    expectedProductionCost: '173.6071428571428571428571429',
    expectedPriceBeforeRounding: '199.6482142857142857142857143',
    expectedRoundedCash: '200',
    expectedPublishedCash: '200',
    expectedCardPrice: null,
  }),
  ayarli({
    thicknessMm: 16,
    widthMm: 100,
    lengthMm: 2500,
    mainRawMaterial: 'MDF-16-2100X2800-ZIMPARALI',
    mainSheetPrice: '3000',
    mainNet: 21,
    kilcikNet: 44,
    profitRate: '20',
    adjustmentAmount: null,
    cardSaleEnabled: false,
    expectedTotalMdfCost: '166.7207792207792207792207793',
    expectedProductionCost: '178.7207792207792207792207793',
    expectedPriceBeforeRounding: '214.4649350649350649350649352',
    expectedRoundedCash: '215',
    expectedPublishedCash: '215',
    expectedCardPrice: null,
  }),
  ayarli({
    thicknessMm: 18,
    widthMm: 100,
    lengthMm: 2200,
    mainRawMaterial: 'MDF-18-2200X2800-ZIMPARALI',
    mainSheetPrice: '3400',
    mainNet: 28,
    kilcikNet: 50,
    profitRate: '15',
    adjustmentAmount: '1',
    cardSaleEnabled: true,
    expectedTotalMdfCost: '142.4285714285714285714285714',
    expectedProductionCost: '154.4285714285714285714285714',
    expectedPriceBeforeRounding: '177.5928571428571428571428571',
    expectedRoundedCash: '178',
    expectedPublishedCash: '179',
    expectedCardPrice: '181',
  }),
  ayarli({
    thicknessMm: 18,
    widthMm: 80,
    lengthMm: 2200,
    mainRawMaterial: 'MDF-18-2200X2800-ZIMPARALI',
    mainSheetPrice: '3400',
    mainNet: 35,
    kilcikNet: 50,
    profitRate: '15',
    adjustmentAmount: '1',
    cardSaleEnabled: false,
    expectedTotalMdfCost: '118.1428571428571428571428571',
    expectedProductionCost: '130.1428571428571428571428571',
    expectedPriceBeforeRounding: '149.6642857142857142857142857',
    expectedRoundedCash: '150',
    expectedPublishedCash: '151',
    expectedCardPrice: null,
  }),
  ayarli({
    thicknessMm: 18,
    widthMm: 100,
    lengthMm: 2500,
    mainRawMaterial: 'MDF-18-2200X2800-ZIMPARALI',
    mainSheetPrice: '3400',
    mainNet: 21,
    kilcikNet: 40,
    profitRate: '15',
    adjustmentAmount: null,
    cardSaleEnabled: true,
    expectedTotalMdfCost: '188.1547619047619047619047619',
    expectedProductionCost: '200.1547619047619047619047619',
    expectedPriceBeforeRounding: '230.1779761904761904761904762',
    expectedRoundedCash: '231',
    expectedPublishedCash: '231',
    expectedCardPrice: '233',
  }),
];

/** Excel DEKORATİF PERVAZ — 6 doğrulanmış satır. 12/14 mm %50, 18 mm %75. */
export const DEKORATIF_PERVAZ_EXCEL_GOLDEN_ROWS: DekoratifPervazExcelGoldenRow[] = [
  dekoratif({
    thicknessMm: 12,
    widthMm: 100,
    lengthMm: 2200,
    mainRawMaterial: 'MDF-12-2200X2800-ZIMPARALI',
    mainSheetPrice: '2475',
    mainNet: 28,
    kilcikNet: 66,
    decorativePremiumRate: '50',
    expectedTotalMdfCost: '104.3019480519480519480519481',
    expectedProductionCost: '116.3019480519480519480519481',
    expectedPriceBeforeRounding: '200.6208603896103896103896105',
    expectedRoundedCash: '201',
    expectedPublishedCash: '201',
    expectedCardPrice: '203',
  }),
  dekoratif({
    thicknessMm: 12,
    widthMm: 100,
    lengthMm: 2500,
    mainRawMaterial: 'MDF-12-2200X2800-ZIMPARALI',
    mainSheetPrice: '2475',
    mainNet: 22,
    kilcikNet: 52,
    decorativePremiumRate: '50',
    expectedTotalMdfCost: '132.6923076923076923076923077',
    expectedProductionCost: '144.6923076923076923076923077',
    expectedPriceBeforeRounding: '249.5942307692307692307692309',
    expectedRoundedCash: '250',
    expectedPublishedCash: '250',
    expectedCardPrice: '252',
  }),
  dekoratif({
    thicknessMm: 14,
    widthMm: 100,
    lengthMm: 2200,
    mainRawMaterial: 'MDF-14-2100X2800-ZIMPARALI',
    mainSheetPrice: '2625',
    mainNet: 21,
    kilcikNet: 62,
    decorativePremiumRate: '50',
    expectedTotalMdfCost: '141.935483870967741935483871',
    expectedProductionCost: '153.935483870967741935483871',
    expectedPriceBeforeRounding: '265.5387096774193548387096776',
    expectedRoundedCash: '266',
    expectedPublishedCash: '266',
    expectedCardPrice: '268',
  }),
  dekoratif({
    thicknessMm: 14,
    widthMm: 100,
    lengthMm: 2500,
    mainRawMaterial: 'MDF-14-2100X2800-ZIMPARALI',
    mainSheetPrice: '2625',
    mainNet: 21,
    kilcikNet: 48,
    decorativePremiumRate: '50',
    expectedTotalMdfCost: '146.875',
    expectedProductionCost: '158.875',
    expectedPriceBeforeRounding: '274.059375',
    expectedRoundedCash: '275',
    expectedPublishedCash: '275',
    expectedCardPrice: '277',
  }),
  dekoratif({
    thicknessMm: 18,
    widthMm: 100,
    lengthMm: 2200,
    mainRawMaterial: 'MDF-18-2200X2800-ZIMPARALI',
    mainSheetPrice: '3400',
    mainNet: 28,
    kilcikNet: 50,
    decorativePremiumRate: '75',
    expectedTotalMdfCost: '142.4285714285714285714285714',
    expectedProductionCost: '154.4285714285714285714285714',
    expectedPriceBeforeRounding: '310.7874999999999999999999999',
    expectedRoundedCash: '311',
    expectedPublishedCash: '311',
    expectedCardPrice: '313',
  }),
  dekoratif({
    thicknessMm: 18,
    widthMm: 100,
    lengthMm: 2500,
    mainRawMaterial: 'MDF-18-2100X2800-ZIMPARALI',
    mainSheetPrice: '2800',
    mainNet: 21,
    kilcikNet: 40,
    decorativePremiumRate: '75',
    expectedTotalMdfCost: '159.5833333333333333333333333',
    expectedProductionCost: '171.5833333333333333333333333',
    expectedPriceBeforeRounding: '345.3114583333333333333333333',
    expectedRoundedCash: '346',
    expectedPublishedCash: '346',
    expectedCardPrice: '348',
  }),
];

/**
 * Excel DEKORATİF PERVAZ GENİŞ KILÇIK — 2 satır.
 * 9×230 ana NET = 23 (Excel master; geometrik 24 kullanılmaz).
 * decorativePremiumRate = 30; normal Dekoratif 50/75 sızmaz.
 * Kart yok.
 */
export const DEKORATIF_GENIS_KILCIK_EXCEL_GOLDEN_ROWS: DekoratifGenisKilcikExcelGoldenRow[] =
  [
    genis({
      lengthMm: 2200,
      mainNet: 24,
      expectedTotalMdfCost: '129.375',
      expectedProductionCost: '141.375',
      expectedPriceBeforeRounding: '211.355625',
      expectedRoundedCash: '212',
      expectedPublishedCash: '212',
    }),
    genis({
      lengthMm: 2300,
      mainNet: 23,
      expectedTotalMdfCost: '133.8586956521739130434782609',
      expectedProductionCost: '145.8586956521739130434782609',
      expectedPriceBeforeRounding: '218.05875',
      expectedRoundedCash: '219',
      expectedPublishedCash: '219',
    }),
  ];

export const PERVAZ_EXCEL_GOLDEN_COUNTS = {
  ayarli: 20,
  ayarliCardEnabled: 12,
  ayarliCardUnlisted: 8,
  dekoratif: 6,
  genisKilcik: 2,
} as const;
