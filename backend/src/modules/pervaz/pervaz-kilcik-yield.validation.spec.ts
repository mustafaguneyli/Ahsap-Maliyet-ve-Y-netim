import { BadRequestException } from '@nestjs/common';
import { assertKilcikTypeAllowedForThickness } from './kilcik-type.rules';
import { assertPervazKilcikYield } from './pervaz-kilcik-yield.validation';

describe('assertKilcikTypeAllowedForThickness', () => {
  it('9/12/16 mm STANDARD ve WIDE kabul eder', () => {
    for (const thickness of [9, 12, 16]) {
      expect(() => assertKilcikTypeAllowedForThickness(thickness, 'STANDARD')).not.toThrow();
      expect(() => assertKilcikTypeAllowedForThickness(thickness, 'WIDE')).not.toThrow();
    }
  });

  it('14 mm ve 18 mm yalnız WIDE kabul eder', () => {
    expect(() => assertKilcikTypeAllowedForThickness(14, 'WIDE')).not.toThrow();
    expect(() => assertKilcikTypeAllowedForThickness(18, 'WIDE')).not.toThrow();
    expect(() => assertKilcikTypeAllowedForThickness(14, 'STANDARD')).toThrow(BadRequestException);
    expect(() => assertKilcikTypeAllowedForThickness(18, 'STANDARD')).toThrow(BadRequestException);
  });
});

describe('assertPervazKilcikYield', () => {
  const valid = {
    productId: 'p-ayarli',
    productIsActive: true,
    productGroupCode: 'PERVAZ',
    pervazThicknessMm: 14,
    source: 'EXCEL_MASTER' as const,
    kilcikTypeCode: 'WIDE',
    kilcikTypeIsActive: true,
    rawMaterialId: 'rm-4mm',
    rawMaterialIsActive: true,
    pieceLengthMm: 2200,
    netQty: 62,
  };

  it('doğrulanmış 14 mm WIDE 220 boy kaydını kabul eder', () => {
    expect(() => assertPervazKilcikYield(valid)).not.toThrow();
  });

  it('EXCEL_MASTER kilcikType olmadan oluşturulabilir', () => {
    expect(() =>
      assertPervazKilcikYield({
        ...valid,
        kilcikTypeCode: null,
        kilcikTypeIsActive: undefined,
        pervazThicknessMm: 16,
        netQty: 56,
        excelCutWidthMm: 50,
      }),
    ).not.toThrow();
  });

  it('16 mm Excel 50 mm profilini STANDARD/WIDE diye uydurmaz; tipsiz EXCEL_MASTER yeter', () => {
    expect(() =>
      assertPervazKilcikYield({
        productId: 'p-ayarli',
        productIsActive: true,
        productGroupCode: 'PERVAZ',
        pervazThicknessMm: 16,
        source: 'EXCEL_MASTER',
        rawMaterialId: 'rm-4mm',
        rawMaterialIsActive: true,
        pieceLengthMm: 2200,
        netQty: 56,
        excelCutWidthMm: 50,
      }),
    ).not.toThrow();
  });

  it('MANUAL_VERIFIED tipsiz reddeder', () => {
    expect(() =>
      assertPervazKilcikYield({
        ...valid,
        source: 'MANUAL_VERIFIED',
        kilcikTypeCode: null,
      }),
    ).toThrow(BadRequestException);
  });

  it('12 mm WIDE Excel kesim eni 55 mm kabul eder', () => {
    expect(() =>
      assertPervazKilcikYield({
        productId: 'p-genis',
        productIsActive: true,
        productGroupCode: 'PERVAZ',
        pervazThicknessMm: 12,
        source: 'EXCEL_MASTER',
        kilcikTypeCode: 'WIDE',
        kilcikTypeIsActive: true,
        rawMaterialId: 'rm-4mm',
        rawMaterialIsActive: true,
        pieceLengthMm: 2300,
        netQty: 40,
        excelCutWidthMm: 55,
      }),
    ).not.toThrow();
  });

  it('excelCutWidthMm kalınlık profiliyle uyuşmazsa reddeder', () => {
    expect(() =>
      assertPervazKilcikYield({
        ...valid,
        kilcikTypeCode: null,
        excelCutWidthMm: 43,
      }),
    ).toThrow(BadRequestException);
  });

  it('18 mm WIDE aynı boyda farklı NET kabul eder (bağlam product+kalınlık)', () => {
    expect(() =>
      assertPervazKilcikYield({
        ...valid,
        pervazThicknessMm: 18,
        netQty: 50,
      }),
    ).not.toThrow();
  });

  it('netQty <= 0 reddeder', () => {
    expect(() => assertPervazKilcikYield({ ...valid, netQty: 0 })).toThrow(BadRequestException);
  });

  it('pasif ürün reddeder', () => {
    expect(() => assertPervazKilcikYield({ ...valid, productIsActive: false })).toThrow(
      BadRequestException,
    );
  });

  it('pasif kılçık tipi reddeder', () => {
    expect(() => assertPervazKilcikYield({ ...valid, kilcikTypeIsActive: false })).toThrow(
      BadRequestException,
    );
  });

  it('pasif ham madde reddeder', () => {
    expect(() => assertPervazKilcikYield({ ...valid, rawMaterialIsActive: false })).toThrow(
      BadRequestException,
    );
  });

  it('14 mm + STANDARD reddeder', () => {
    expect(() =>
      assertPervazKilcikYield({ ...valid, kilcikTypeCode: 'STANDARD' }),
    ).toThrow(BadRequestException);
  });

  it('PERVAZ dışı ürün grubunu reddeder', () => {
    expect(() =>
      assertPervazKilcikYield({ ...valid, productGroupCode: 'door_frame' }),
    ).toThrow(BadRequestException);
  });
});
