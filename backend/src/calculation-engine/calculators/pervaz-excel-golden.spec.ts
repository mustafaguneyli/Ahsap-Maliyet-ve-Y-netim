import { readFileSync } from 'fs';
import { join } from 'path';
import {
  roundUpToWholeTl,
  toDecimal,
} from '../../common/decimal/decimal.util';
import { PervazQtyService } from '../../modules/pervaz/pervaz-qty.service';
import {
  resolveKilcikExcelQty,
  resolvePervazPieceQty,
} from '../../modules/pervaz/pervaz-qty-resolver';
import { AyarliPervazMdfCalculator } from './ayarli-pervaz-mdf-calculator';
import { DekoratifPervazCalculator } from './dekoratif-pervaz-calculator';
import {
  AYARLI_PERVAZ_EXCEL_GOLDEN_ROWS,
  type AyarliPervazExcelGoldenRow,
  DEKORATIF_GENIS_KILCIK_EXCEL_GOLDEN_ROWS,
  type DekoratifGenisKilcikExcelGoldenRow,
  DEKORATIF_PERVAZ_EXCEL_GOLDEN_ROWS,
  type DekoratifPervazExcelGoldenRow,
  PERVAZ_EXCEL_GOLDEN_COUNTS,
  PERVAZ_EXCEL_GOLDEN_INPUTS,
} from './fixtures/pervaz-excel-golden.fixture';

const INTERMEDIATE_ABS_EPS = toDecimal('1e-9');
const INTERMEDIATE_REL_EPS = toDecimal('1e-12');

function decimalsClose(actual: string, expected: string): boolean {
  const a = toDecimal(actual);
  const e = toDecimal(expected);
  const diff = a.minus(e).abs();
  if (diff.lte(INTERMEDIATE_ABS_EPS)) return true;
  const scale = e.abs().eq(0) ? toDecimal(1) : e.abs();
  return diff.div(scale).lte(INTERMEDIATE_REL_EPS);
}

function rowLabel(
  row: { thicknessMm: number; widthMm: number; lengthMm: number },
): string {
  return `${row.thicknessMm} mm ${row.widthMm / 10}×${row.lengthMm / 10}`;
}

function failMsg(
  product: string,
  row: { thicknessMm: number; widthMm: number; lengthMm: number },
  field: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
): string {
  return (
    `Pervaz golden uyuşmazlığı: ${product} ${rowLabel(row)} alan=${field} ` +
    `excel=${expected} sistem=${actual}`
  );
}

function assertClose(
  product: string,
  row: { thicknessMm: number; widthMm: number; lengthMm: number },
  field: string,
  actual: string,
  expected: string,
): void {
  if (!decimalsClose(actual, expected)) {
    throw new Error(failMsg(product, row, field, expected, actual));
  }
}

function assertExact(
  product: string,
  row: { thicknessMm: number; widthMm: number; lengthMm: number },
  field: string,
  actual: string | number | boolean | null,
  expected: string | number | boolean | null,
): void {
  if (String(actual) !== String(expected)) {
    throw new Error(failMsg(product, row, field, expected, actual));
  }
}

function extraCosts(row: { cutting: string; glue: string; labor: string }) {
  return { cutting: row.cutting, glue: row.glue, labor: row.labor };
}

function kilcikPart(netQty: number) {
  return {
    rawMaterialCode: PERVAZ_EXCEL_GOLDEN_INPUTS.kilcikRawMaterialCode,
    sheetPriceType: 'CARD_INSTALLMENT' as const,
    sheetPrice: PERVAZ_EXCEL_GOLDEN_INPUTS.kilcikSheetPrice,
    netQty,
    yieldSource: 'EXCEL_MASTER' as const,
  };
}

function calculateAyarli(row: AyarliPervazExcelGoldenRow, overrides?: {
  extraCosts?: { cutting: string; glue: string; labor: string };
  profitRate?: string;
  cardFixedSurchargeAmount?: string;
}) {
  return new AyarliPervazMdfCalculator().calculate({
    productCode: 'AYARLI_PERVAZ',
    thicknessMm: row.thicknessMm,
    widthMm: row.widthMm,
    lengthMm: row.lengthMm,
    mainPiece: {
      rawMaterialCode: row.mainRawMaterial,
      sheetPriceType: 'CARD_INSTALLMENT',
      sheetPrice: row.mainSheetPrice,
      netQty: row.mainNet,
      yieldSource: 'EXCEL_MASTER',
    },
    kilcik: kilcikPart(row.kilcikNet),
    extraCosts: overrides?.extraCosts ?? extraCosts(row),
    profitRate: overrides?.profitRate ?? row.profitRate,
    adjustmentAmount: row.adjustmentAmount,
    cardFixedSurchargeAmount:
      overrides?.cardFixedSurchargeAmount ?? row.cardFixedSurchargeAmount,
    cardSaleEnabled: row.cardSaleEnabled,
  });
}

function calculateDekoratif(row: DekoratifPervazExcelGoldenRow, overrides?: {
  extraCosts?: { cutting: string; glue: string; labor: string };
  profitRate?: string;
  cardFixedSurchargeAmount?: string;
}) {
  return new DekoratifPervazCalculator().calculate({
    productCode: 'DEKORATIF_PERVAZ',
    thicknessMm: row.thicknessMm,
    widthMm: row.widthMm,
    lengthMm: row.lengthMm,
    mainPiece: {
      rawMaterialCode: row.mainRawMaterial,
      sheetPriceType: 'CARD_INSTALLMENT',
      sheetPrice: row.mainSheetPrice,
      netQty: row.mainNet,
      yieldSource: 'EXCEL_MASTER',
    },
    kilcik: kilcikPart(row.kilcikNet),
    extraCosts: overrides?.extraCosts ?? extraCosts(row),
    profitRate: overrides?.profitRate ?? row.profitRate,
    decorativePremiumRate: row.decorativePremiumRate,
    cardFixedSurchargeAmount:
      overrides?.cardFixedSurchargeAmount ??
      PERVAZ_EXCEL_GOLDEN_INPUTS.cardFixedSurchargeAmount,
  });
}

function calculateGenis(row: DekoratifGenisKilcikExcelGoldenRow) {
  return new DekoratifPervazCalculator().calculate({
    productCode: 'DEKORATIF_PERVAZ_GENIS_KILCIK',
    thicknessMm: row.thicknessMm,
    widthMm: row.widthMm,
    lengthMm: row.lengthMm,
    mainPiece: {
      rawMaterialCode: row.mainRawMaterial,
      sheetPriceType: 'CARD_INSTALLMENT',
      sheetPrice: row.mainSheetPrice,
      netQty: row.mainNet,
      yieldSource: 'EXCEL_MASTER',
    },
    kilcik: kilcikPart(row.kilcikNet),
    extraCosts: extraCosts(row),
    profitRate: row.profitRate,
    decorativePremiumRate: row.decorativePremiumRate,
  });
}

describe('Pervaz Excel golden regression (DB yok)', () => {
  it('ortak masraf 4+4+4=12 ve kılçık CARD 1050 fixture source-of-truth', () => {
    const extras = PERVAZ_EXCEL_GOLDEN_INPUTS.extras;
    expect(
      toDecimal(extras.cutting)
        .plus(extras.glue)
        .plus(extras.labor)
        .toFixed(),
    ).toBe(PERVAZ_EXCEL_GOLDEN_INPUTS.extraTotal);
    expect(PERVAZ_EXCEL_GOLDEN_INPUTS.kilcikSheetPrice).toBe('1050');
  });

  it(`AYARLI ${PERVAZ_EXCEL_GOLDEN_COUNTS.ayarli} satır Excel nakit/kart zincirini üretir`, () => {
    expect(AYARLI_PERVAZ_EXCEL_GOLDEN_ROWS).toHaveLength(
      PERVAZ_EXCEL_GOLDEN_COUNTS.ayarli,
    );

    for (const golden of AYARLI_PERVAZ_EXCEL_GOLDEN_ROWS) {
      const actual = calculateAyarli(golden);
      const product = 'AYARLI_PERVAZ';

      assertExact(product, golden, 'mainNet', actual.mainPiece.netQty, golden.mainNet);
      assertExact(product, golden, 'kilcikNet', actual.kilcik.netQty, golden.kilcikNet);
      assertExact(
        product,
        golden,
        'mainRawMaterial',
        actual.mainPiece.rawMaterialCode,
        golden.mainRawMaterial,
      );
      assertExact(
        product,
        golden,
        'mainSheetPrice',
        actual.mainPiece.sheetPrice,
        golden.mainSheetPrice,
      );
      assertExact(
        product,
        golden,
        'kilcikSheetPrice',
        actual.kilcik.sheetPrice,
        golden.kilcikSheetPrice,
      );
      assertExact(product, golden, 'cutting', actual.extraCosts.cutting, golden.cutting);
      assertExact(product, golden, 'glue', actual.extraCosts.glue, golden.glue);
      assertExact(product, golden, 'labor', actual.extraCosts.labor, golden.labor);
      assertExact(
        product,
        golden,
        'extraTotal',
        actual.extraCosts.total,
        PERVAZ_EXCEL_GOLDEN_INPUTS.extraTotal,
      );
      assertExact(product, golden, 'profitRate', actual.pricing.profitRate, golden.profitRate);
      assertExact(
        product,
        golden,
        'adjustmentAmount',
        actual.pricing.adjustmentAmount,
        golden.adjustmentAmount,
      );
      assertClose(
        product,
        golden,
        'totalMdfCost',
        actual.totalMdfCost,
        golden.expectedTotalMdfCost,
      );
      assertClose(
        product,
        golden,
        'productionCost',
        actual.productionCost,
        golden.expectedProductionCost,
      );
      assertClose(
        product,
        golden,
        'priceBeforeRounding',
        actual.pricing.priceBeforeRounding,
        golden.expectedPriceBeforeRounding,
      );
      assertExact(
        product,
        golden,
        'roundedCash',
        actual.pricing.roundedSalePrice,
        golden.expectedRoundedCash,
      );
      assertExact(
        product,
        golden,
        'publishedCash',
        actual.pricing.publishedSalePrice,
        golden.expectedPublishedCash,
      );
      assertExact(
        product,
        golden,
        'cardSaleEnabled',
        actual.pricing.cardSaleAvailable,
        golden.cardSaleEnabled,
      );
      assertExact(
        product,
        golden,
        'cardSalePrice',
        actual.pricing.cardSalePrice,
        golden.expectedCardPrice,
      );
    }
  });

  it('16 mm 10×250 kâr %20; 18 mm 10×220 ve 8×220 adjustment +1 fixture’da açık', () => {
    const specialProfit = AYARLI_PERVAZ_EXCEL_GOLDEN_ROWS.find(
      (r) => r.thicknessMm === 16 && r.widthMm === 100 && r.lengthMm === 2500,
    );
    const adjTen = AYARLI_PERVAZ_EXCEL_GOLDEN_ROWS.find(
      (r) => r.thicknessMm === 18 && r.widthMm === 100 && r.lengthMm === 2200,
    );
    const adjEight = AYARLI_PERVAZ_EXCEL_GOLDEN_ROWS.find(
      (r) => r.thicknessMm === 18 && r.widthMm === 80 && r.lengthMm === 2200,
    );
    expect(specialProfit?.profitRate).toBe('20');
    expect(adjTen?.adjustmentAmount).toBe('1');
    expect(adjEight?.adjustmentAmount).toBe('1');
    expect(adjTen?.cardSaleEnabled).toBe(true);
    expect(adjEight?.cardSaleEnabled).toBe(false);
  });
});

describe('Ayarlı Pervaz kart golden', () => {
  const enabled = AYARLI_PERVAZ_EXCEL_GOLDEN_ROWS.filter((r) => r.cardSaleEnabled);
  const unlisted = AYARLI_PERVAZ_EXCEL_GOLDEN_ROWS.filter((r) => !r.cardSaleEnabled);

  it(`FİYAT LİSTESİ ${PERVAZ_EXCEL_GOLDEN_COUNTS.ayarliCardEnabled} kartlı satır: nakit + 2, ikinci ROUNDUP yok`, () => {
    expect(enabled).toHaveLength(PERVAZ_EXCEL_GOLDEN_COUNTS.ayarliCardEnabled);

    for (const golden of enabled) {
      const actual = calculateAyarli(golden);
      expect(actual.pricing.cardSaleAvailable).toBe(true);
      expect(actual.pricing.cardPricingType).toBe('FIXED_SURCHARGE');
      expect(actual.pricing.cardFixedSurchargeAmount).toBe(
        PERVAZ_EXCEL_GOLDEN_INPUTS.cardFixedSurchargeAmount,
      );
      expect(actual.pricing.cardSalePrice).toBe(
        toDecimal(golden.expectedPublishedCash)
          .plus(PERVAZ_EXCEL_GOLDEN_INPUTS.cardFixedSurchargeAmount)
          .toFixed(),
      );
      expect(actual.pricing.cardSalePrice).toBe(golden.expectedCardPrice);
      expect(actual.pricing.cardSalePrice).toBe(
        toDecimal(actual.pricing.publishedSalePrice).plus('2').toFixed(),
      );
    }
  });

  it(`liste dışı ${PERVAZ_EXCEL_GOLDEN_COUNTS.ayarliCardUnlisted} satır: cardSaleAvailable=false, cardSalePrice=null`, () => {
    expect(unlisted).toHaveLength(PERVAZ_EXCEL_GOLDEN_COUNTS.ayarliCardUnlisted);
    for (const golden of unlisted) {
      const actual = calculateAyarli(golden);
      expect(golden.expectedCardPrice).toBeNull();
      expect(actual.pricing.cardSaleAvailable).toBe(false);
      expect(actual.pricing.cardSalePrice).toBeNull();
    }
  });

  it('18 mm 10×220: ROUNDUP 178 + adjustment 1 → nakit 179 → kart 181', () => {
    const golden = AYARLI_PERVAZ_EXCEL_GOLDEN_ROWS.find(
      (r) => r.thicknessMm === 18 && r.widthMm === 100 && r.lengthMm === 2200,
    );
    expect(golden).toBeDefined();
    const actual = calculateAyarli(golden!);
    expect(actual.pricing.roundedSalePrice).toBe('178');
    expect(actual.pricing.adjustmentAmount).toBe('1');
    expect(actual.pricing.publishedSalePrice).toBe('179');
    expect(actual.pricing.cardSalePrice).toBe('181');
    expect(toDecimal(actual.pricing.publishedSalePrice).plus('2').toFixed()).toBe(
      '181',
    );
  });
});

describe('Dekoratif Pervaz golden', () => {
  it(`${PERVAZ_EXCEL_GOLDEN_COUNTS.dekoratif} satır: %15 kâr, 12/14 %50, 18 %75, nakit+2 kart`, () => {
    expect(DEKORATIF_PERVAZ_EXCEL_GOLDEN_ROWS).toHaveLength(
      PERVAZ_EXCEL_GOLDEN_COUNTS.dekoratif,
    );
    expect(DEKORATIF_PERVAZ_EXCEL_GOLDEN_ROWS.map((r) => r.expectedPublishedCash)).toEqual(
      ['201', '250', '266', '275', '311', '346'],
    );
    expect(DEKORATIF_PERVAZ_EXCEL_GOLDEN_ROWS.map((r) => r.expectedCardPrice)).toEqual(
      ['203', '252', '268', '277', '313', '348'],
    );

    for (const golden of DEKORATIF_PERVAZ_EXCEL_GOLDEN_ROWS) {
      const actual = calculateDekoratif(golden);
      const product = 'DEKORATIF_PERVAZ';
      const expectedPremium = golden.thicknessMm === 18 ? '75' : '50';

      assertExact(product, golden, 'mainNet', actual.mainPiece.netQty, golden.mainNet);
      assertExact(product, golden, 'kilcikNet', actual.kilcik.netQty, golden.kilcikNet);
      assertExact(product, golden, 'profitRate', actual.pricing.profitRate, '15');
      assertExact(
        product,
        golden,
        'decorativePremiumRate',
        actual.pricing.decorativePremiumRate,
        expectedPremium,
      );
      assertClose(
        product,
        golden,
        'totalMdfCost',
        actual.totalMdfCost,
        golden.expectedTotalMdfCost,
      );
      assertClose(
        product,
        golden,
        'productionCost',
        actual.productionCost,
        golden.expectedProductionCost,
      );
      assertExact(
        product,
        golden,
        'extraTotal',
        actual.extraCosts.total,
        PERVAZ_EXCEL_GOLDEN_INPUTS.extraTotal,
      );
      assertClose(
        product,
        golden,
        'priceBeforeRounding',
        actual.pricing.priceBeforeRounding,
        golden.expectedPriceBeforeRounding,
      );
      assertExact(
        product,
        golden,
        'publishedCash',
        actual.pricing.publishedSalePrice,
        golden.expectedPublishedCash,
      );
      assertExact(
        product,
        golden,
        'cardSalePrice',
        actual.pricing.cardSalePrice,
        golden.expectedCardPrice,
      );
      expect(actual.pricing.cardSaleAvailable).toBe(true);
      expect(actual.pricing.cardSalePrice).toBe(
        toDecimal(actual.pricing.publishedSalePrice).plus('2').toFixed(),
      );
    }
  });
});

describe('Dekoratif Geniş Kılçık golden', () => {
  it(`${PERVAZ_EXCEL_GOLDEN_COUNTS.genisKilcik} satır: %30 fark, NET 24/23, kart yok`, () => {
    expect(DEKORATIF_GENIS_KILCIK_EXCEL_GOLDEN_ROWS).toHaveLength(
      PERVAZ_EXCEL_GOLDEN_COUNTS.genisKilcik,
    );

    const row220 = DEKORATIF_GENIS_KILCIK_EXCEL_GOLDEN_ROWS.find(
      (r) => r.lengthMm === 2200,
    )!;
    const row230 = DEKORATIF_GENIS_KILCIK_EXCEL_GOLDEN_ROWS.find(
      (r) => r.lengthMm === 2300,
    )!;
    expect(row220.mainNet).toBe(24);
    expect(row220.kilcikNet).toBe(40);
    expect(row220.expectedPublishedCash).toBe('212');
    expect(row230.mainNet).toBe(23);
    expect(row230.kilcikNet).toBe(40);
    expect(row230.expectedPublishedCash).toBe('219');

    for (const golden of DEKORATIF_GENIS_KILCIK_EXCEL_GOLDEN_ROWS) {
      const actual = calculateGenis(golden);
      const product = 'DEKORATIF_PERVAZ_GENIS_KILCIK';
      assertExact(product, golden, 'mainNet', actual.mainPiece.netQty, golden.mainNet);
      assertExact(product, golden, 'kilcikNet', actual.kilcik.netQty, golden.kilcikNet);
      assertExact(product, golden, 'profitRate', actual.pricing.profitRate, '15');
      assertExact(
        product,
        golden,
        'decorativePremiumRate',
        actual.pricing.decorativePremiumRate,
        '30',
      );
      expect(['50', '75']).not.toContain(actual.pricing.decorativePremiumRate);
      assertClose(
        product,
        golden,
        'totalMdfCost',
        actual.totalMdfCost,
        golden.expectedTotalMdfCost,
      );
      assertClose(
        product,
        golden,
        'productionCost',
        actual.productionCost,
        golden.expectedProductionCost,
      );
      assertExact(
        product,
        golden,
        'publishedCash',
        actual.pricing.publishedSalePrice,
        golden.expectedPublishedCash,
      );
      expect(actual.pricing.cardSaleAvailable).toBe(false);
      expect(actual.pricing.cardSalePrice).toBeNull();
    }
  });
});

describe('master > fallback regression', () => {
  it('12 mm Ayarlı 10×250 master NET 22 geometrik 21’i ezer', () => {
    const result = resolvePervazPieceQty({
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
      pieceWidthMm: 100,
      pieceLengthMm: 2500,
      masterNetQty: 22,
    });
    expect(result.calculatedQty).toBe(21);
    expect(result.netQty).toBe(22);
    expect(result.source).toBe('EXCEL_MASTER');
  });

  it('18 mm Ayarlı 10×250 master NET 21 geometrik 22’yi ezer', () => {
    const result = resolvePervazPieceQty({
      sheetWidthMm: 2200,
      sheetLengthMm: 2800,
      pieceWidthMm: 100,
      pieceLengthMm: 2500,
      masterNetQty: 21,
    });
    expect(result.calculatedQty).toBe(22);
    expect(result.netQty).toBe(21);
    expect(result.source).toBe('EXCEL_MASTER');
  });

  it('Geniş Kılçık 9×230 master NET 23 geometrik 24’ü ezer', () => {
    const result = resolvePervazPieceQty({
      sheetWidthMm: 2200,
      sheetLengthMm: 2800,
      pieceWidthMm: 90,
      pieceLengthMm: 2300,
      masterNetQty: 23,
    });
    expect(result.calculatedQty).toBe(24);
    expect(result.netQty).toBe(23);
    expect(result.source).toBe('EXCEL_MASTER');
  });

  it('PervazKilcikYield EXCEL_MASTER CALCULATED_EXCEL_RULE’un önüne geçer', () => {
    const result = resolveKilcikExcelQty({
      sheetWidthMm: 2200,
      sheetLengthMm: 2800,
      pervazThicknessMm: 18,
      pieceLengthMm: 2200,
      masterNetQty: 50,
    });
    expect(result.source).toBe('EXCEL_MASTER');
    expect(result.netQty).toBe(50);
  });

  it('master yoksa CALCULATED_EXCEL_RULE çalışır', () => {
    const main = resolvePervazPieceQty({
      sheetWidthMm: 2200,
      sheetLengthMm: 2800,
      pieceWidthMm: 70,
      pieceLengthMm: 2300,
    });
    expect(main.source).toBe('CALCULATED_EXCEL_RULE');
    expect(main.netQty).toBe(31);

    const kilcik = resolveKilcikExcelQty({
      sheetWidthMm: 2200,
      sheetLengthMm: 2800,
      pervazThicknessMm: 9,
      pieceLengthMm: 2200,
    });
    expect(kilcik.source).toBe('CALCULATED_EXCEL_RULE');
    expect(kilcik.netQty).toBe(66);
  });

  it('fallback otomatik DB kaydı oluşturmaz', async () => {
    const prisma = {
      productionYield: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      pervazKilcikYield: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    const service = new PervazQtyService(prisma as never);

    const main = await service.resolvePervazPiece({
      rawMaterialId: 'rm-12-210',
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
      pieceWidthMm: 100,
      pieceLengthMm: 2500,
    });
    expect(main.source).toBe('CALCULATED_EXCEL_RULE');
    expect(prisma.productionYield.create).not.toHaveBeenCalled();

    const kilcik = await service.resolveKilcik({
      productId: 'p-ayarli',
      pervazThicknessMm: 9,
      pieceLengthMm: 2300,
    });
    expect(kilcik.source).toBe('CALCULATED_EXCEL_RULE');
    expect(prisma.pervazKilcikYield.create).not.toHaveBeenCalled();
  });
});

describe('dinamik ExtraCost / PricingSetting / kart farkı', () => {
  const baseline = AYARLI_PERVAZ_EXCEL_GOLDEN_ROWS[0];
  const specialProfit = AYARLI_PERVAZ_EXCEL_GOLDEN_ROWS.find(
    (r) => r.thicknessMm === 16 && r.widthMm === 100 && r.lengthMm === 2500,
  )!;
  const cardRow = AYARLI_PERVAZ_EXCEL_GOLDEN_ROWS.find(
    (r) => r.thicknessMm === 18 && r.widthMm === 100 && r.lengthMm === 2200,
  )!;
  const unlisted = AYARLI_PERVAZ_EXCEL_GOLDEN_ROWS.find(
    (r) => r.thicknessMm === 9 && r.widthMm === 80 && r.lengthMm === 2300,
  )!;

  it('CUTTING 4→6 productionCost +2; nakit/kart runtime yeniden hesaplanır', () => {
    const before = calculateAyarli(baseline);
    const after = calculateAyarli(baseline, {
      extraCosts: { cutting: '6', glue: '4', labor: '4' },
    });
    expect(
      toDecimal(after.productionCost).minus(before.productionCost).toFixed(),
    ).toBe('2');
    expect(after.pricing.publishedSalePrice).not.toBe(before.pricing.publishedSalePrice);
    expect(after.pricing.cardSalePrice).not.toBe(before.pricing.cardSalePrice);
    expect(
      toDecimal(after.pricing.cardSalePrice!).minus(after.pricing.publishedSalePrice).toFixed(),
    ).toBe('2');
  });

  it('profitRate 15→17 normal satırı değiştirir; 16 mm 10×250 %20 kalır', () => {
    const normalBefore = calculateAyarli(baseline);
    const normalAfter = calculateAyarli(baseline, { profitRate: '17' });
    expect(normalBefore.pricing.profitRate).toBe('15');
    expect(normalAfter.pricing.profitRate).toBe('17');
    expect(normalAfter.pricing.publishedSalePrice).not.toBe(
      normalBefore.pricing.publishedSalePrice,
    );

    const special = calculateAyarli(specialProfit, { profitRate: specialProfit.profitRate });
    expect(special.pricing.profitRate).toBe('20');
    expect(special.pricing.publishedSalePrice).toBe('215');
  });

  it('kart farkı 2→3: nakit aynı, kartlı +1, kapsam dışı null', () => {
    const cashSame = calculateAyarli(cardRow, { cardFixedSurchargeAmount: '3' });
    const listedTwo = calculateAyarli(cardRow);
    expect(cashSame.pricing.publishedSalePrice).toBe(listedTwo.pricing.publishedSalePrice);
    expect(cashSame.pricing.publishedSalePrice).toBe('179');
    expect(listedTwo.pricing.cardSalePrice).toBe('181');
    expect(cashSame.pricing.cardSalePrice).toBe('182');

    const stillNull = calculateAyarli(unlisted, { cardFixedSurchargeAmount: '3' });
    expect(stillNull.pricing.publishedSalePrice).toBe('118');
    expect(stillNull.pricing.cardSaleAvailable).toBe(false);
    expect(stillNull.pricing.cardSalePrice).toBeNull();
  });
});

describe('ROUNDUP regression (ortak helper)', () => {
  it('100.0001 → 101; matematiksel tam sayıya çok yakın residue yanlış +1 üretmez', () => {
    expect(roundUpToWholeTl('100.0001').toString()).toBe('101');
    expect(roundUpToWholeTl('100.00000000000000000001').toString()).toBe('100');
  });
});

describe('PervazCostTable UI smoke (mevcut kaynak, yeni özellik yok)', () => {
  const tableSrc = readFileSync(
    join(__dirname, '../../../../frontend/src/components/pervaz-cost-table.tsx'),
    'utf8',
  );
  const pageSrc = readFileSync(
    join(__dirname, '../../../../frontend/src/pages/cost-calculation-page.tsx'),
    'utf8',
  );

  it('Fiyat grouped header colSpan=7; ayarlı/dekoratif 7 alt kolon', () => {
    expect(tableSrc).toContain('<th colSpan={7}>Fiyat</th>');
    expect(tableSrc).toContain('<th colSpan={4}>Masraflar</th>');
    expect(tableSrc).toContain('<th colSpan={2}>Ana MDF</th>');
    expect(tableSrc).toContain('<th colSpan={2}>Kılçık</th>');
    expect(tableSrc).toContain('Nakit Satış');
    expect(tableSrc).toContain('Kart/Taksit');
    expect(tableSrc).toContain('Yuvarlanmış');
    expect(tableSrc).toContain('Düzeltme');
    expect(tableSrc).toContain('Dek. Fark %');
    expect(tableSrc).toContain('Dek. Fark ₺');
  });

  it('Pervaz tablosu yalnız PERVAZ grubunda; Kapı Kasası ayrı kalır', () => {
    expect(pageSrc).toContain("productGroup === 'PERVAZ'");
    expect(pageSrc).toContain('<PervazCostTable');
    expect(pageSrc).toContain("pervazProduct === 'AYARLI_PERVAZ'");
    expect(pageSrc).toContain('door_frame');
    expect(pageSrc).toContain('Kapı Kasası');
  });
});
