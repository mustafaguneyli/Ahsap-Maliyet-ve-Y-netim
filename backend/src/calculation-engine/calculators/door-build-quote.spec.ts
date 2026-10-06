import {
  assertNoPriceLeakage,
  applyDoorBuildWidthCoefficient,
  buildDoorBuildMaterialPreview,
  calculateDoorBuildQuote,
  DOOR_BUILD_MATERIAL_PREVIEW_FORBIDDEN_KEYS,
  DOOR_BUILD_SURFACE_RULE_MISSING_MESSAGE,
  DOOR_BUILD_WIDTH_COEFF_MISSING_MESSAGE,
  DOOR_FRAME_CATALOG_UNIT_MEANING,
  normalizeManualCostLines,
  resolveDoorBuildWidthCoefficient,
} from './door-build-quote';
import { resolveDoorLeafSurfaceRule } from './door-leaf-surface-yield';
import { toDecimal } from '../../common/decimal/decimal.util';

describe('DoorBuildQuote calculator', () => {
  const sheetPrice = '3000';

  it('210×90 / 1 yüzey hesabı korunur', () => {
    const result = calculateDoorBuildQuote({
      doorHeightMm: 2100,
      doorWidthMm: 900,
      quantity: 1,
      sheetPrice,
      manualCostLines: [],
    });
    expect(result.unitMdfSurfaceCost).toBe('2000');
    expect(result.surface!.requiredFullSheets).toBe(1);
    expect(result.frame.status).toBe('NOT_SELECTED');
    expect(result.widthCoefficient).toBe('1');
    expect(result.widthAdjustedSubtotal).toBe(
      result.baseSubtotalBeforeWidthCoefficient,
    );
  });

  it('250×90 / 1 yüzey hesabı korunur (katsayıdan bağımsız)', () => {
    const result = calculateDoorBuildQuote({
      doorHeightMm: 2500,
      doorWidthMm: 900,
      quantity: 1,
      sheetPrice,
      manualCostLines: [],
    });
    expect(result.unitMdfSurfaceCost).toBe('3000');
    expect(result.surface!.rule.facesPerSheet).toBe(2);
    expect(result.surface!.rule.facesPerDoor).toBe(2);
    expect(result.widthCoefficient).toBe('1');
  });

  it('kasa: productionCost × totalBoyQuantity; kapı adediyle çarpılmaz; 750/950 yok', () => {
    const result = calculateDoorBuildQuote({
      doorHeightMm: 2100,
      doorWidthMm: 900,
      quantity: 3,
      sheetPrice,
      manualCostLines: [],
      frame: { unitProductionCost: '400', totalBoyQuantity: '2.5' },
    });
    expect(result.frame.status).toBe('RESOLVED');
    if (result.frame.status !== 'RESOLVED') return;
    expect(result.frame.unitMeaning).toBe(DOOR_FRAME_CATALOG_UNIT_MEANING);
    expect(result.frame.unitProductionCost).toBe('400');
    expect(result.frame.unitsPerDoor).toBe('2.5');
    expect(result.frame.lineTotal).toBe('1000'); // 400 × 2.5 — not ×3 doors
    expect(result.partialSubtotal).toBe('7000'); // 2000*3 + 1000
  });

  it('farklı kasa birim maliyeti toplamı değiştirir', () => {
    const a = calculateDoorBuildQuote({
      doorHeightMm: 2100,
      doorWidthMm: 900,
      quantity: 1,
      sheetPrice,
      manualCostLines: [],
      frame: { unitProductionCost: '400', totalBoyQuantity: '2.5' },
    });
    const b = calculateDoorBuildQuote({
      doorHeightMm: 2100,
      doorWidthMm: 900,
      quantity: 1,
      sheetPrice,
      manualCostLines: [],
      frame: { unitProductionCost: '520', totalBoyQuantity: '2.5' },
    });
    expect(a.frame.lineTotal).toBe('1000');
    expect(b.frame.lineTotal).toBe('1300');
    expect(a.frame.lineTotal).not.toBe('750');
    expect(b.frame.lineTotal).not.toBe('750');
    expect(a.frame.lineTotal).not.toBe('950');
  });

  it('kasa belirsizken maliyet 0 sayılmaz; unresolved mesajı kalır', () => {
    const result = calculateDoorBuildQuote({
      doorHeightMm: 2100,
      doorWidthMm: 900,
      quantity: 1,
      sheetPrice,
      manualCostLines: [],
      frameUnresolvedMessage: 'Toplam kasa miktarı (boy) girilmelidir.',
    });
    expect(result.frame.status).toBe('UNRESOLVED');
    expect(result.frame.lineTotal).toBeNull();
    expect(result.partialSubtotal).toBe('2000');
    expect(result.allSelectedComponentsResolved).toBe(false);
    expect(result.missingSources.length).toBeGreaterThan(0);
  });

  it('yan pervaz ve başlık ayrı satırlar; calculator piecesPerDoor girdisini kullanır', () => {
    const result = calculateDoorBuildQuote({
      doorHeightMm: 2100,
      doorWidthMm: 900,
      quantity: 3,
      sheetPrice,
      manualCostLines: [],
      sideTrims: { unitProductionCost: '50', piecesPerDoor: 4 },
      header: { unitProductionCost: '40', piecesPerDoor: 1 },
    });
    expect(result.sideTrims.status).toBe('RESOLVED');
    expect(result.header.status).toBe('RESOLVED');
    if (result.sideTrims.status === 'RESOLVED') {
      expect(result.sideTrims.lineTotal).toBe('600'); // 50*4*3
    }
    if (result.header.status === 'RESOLVED') {
      expect(result.header.lineTotal).toBe('120'); // 40*1*3
    }
    const codes = result.componentCostBreakdown.map((c) => c.code);
    expect(codes).toEqual([
      'SURFACE_MDF',
      'FRAME',
      'SIDE_TRIMS',
      'HEADER',
      'MANUAL',
    ]);
  });

  it('resolveDoorBuildWidthCoefficient: 1000/1700/2300 sınırları', () => {
    expect(resolveDoorBuildWidthCoefficient(1000).widthCoefficient).toBe('1');
    expect(resolveDoorBuildWidthCoefficient(1001).widthCoefficient).toBe('1.5');
    expect(resolveDoorBuildWidthCoefficient(1700).widthCoefficient).toBe('1.5');
    expect(resolveDoorBuildWidthCoefficient(1701).widthCoefficient).toBe('2');
    expect(resolveDoorBuildWidthCoefficient(2300).widthCoefficient).toBe('2');
    const over = resolveDoorBuildWidthCoefficient(2301);
    expect(over.status).toBe('UNRESOLVED');
    expect(over.widthCoefficient).toBeNull();
    expect(over.message).toBe(DOOR_BUILD_WIDTH_COEFF_MISSING_MESSAGE);
  });

  it('applyDoorBuildWidthCoefficient: 4000 × 1 / 1.5 / 2', () => {
    expect(applyDoorBuildWidthCoefficient('4000', '1')).toBe('4000');
    expect(applyDoorBuildWidthCoefficient('4000', '1.5')).toBe('6000');
    expect(applyDoorBuildWidthCoefficient('4000', '2')).toBe('8000');
  });

  it('en katsayısı fiziksel yüzey/tabaka ve draft miktarını değiştirmez', () => {
    const base = calculateDoorBuildQuote({
      doorHeightMm: 2100,
      doorWidthMm: 900,
      quantity: 3,
      sheetPrice,
      manualCostLines: [],
      sideTrims: { unitProductionCost: '10', piecesPerDoor: 4 },
      header: { unitProductionCost: '20', piecesPerDoor: 1 },
    });
    expect(base.surface!.totalFaces).toBe(6);
    expect(base.surface!.requiredFullSheets).toBe(2);
    expect(base.sideTrims.unitsPerDoor).toBe('4');
    expect(base.header.unitsPerDoor).toBe('1');
    expect(base.baseSubtotalBeforeWidthCoefficient).toBe(
      base.widthAdjustedSubtotal,
    );
    expect(applyDoorBuildWidthCoefficient('4000', '1.5')).toBe('6000');
    expect(applyDoorBuildWidthCoefficient('4000', '2')).toBe('8000');
  });

  it('yan pervaz adedi değişince toplam değişir', () => {
    const one = calculateDoorBuildQuote({
      doorHeightMm: 2100,
      doorWidthMm: 900,
      quantity: 1,
      sheetPrice,
      manualCostLines: [],
      sideTrims: { unitProductionCost: '10', piecesPerDoor: 1 },
    });
    const two = calculateDoorBuildQuote({
      doorHeightMm: 2100,
      doorWidthMm: 900,
      quantity: 1,
      sheetPrice,
      manualCostLines: [],
      sideTrims: { unitProductionCost: '10', piecesPerDoor: 2 },
    });
    expect(one.sideTrims.lineTotal).toBe('10');
    expect(two.sideTrims.lineTotal).toBe('20');
  });

  it('PER_DOOR / ORDER_TOTAL ve seçilmemiş / açık 0 korunur', () => {
    const result = calculateDoorBuildQuote({
      doorHeightMm: 2100,
      doorWidthMm: 900,
      quantity: 2,
      sheetPrice,
      manualCostLines: [
        { code: 'ISKELET', included: true, amount: '100', scope: 'PER_DOOR' },
        { code: 'PRES', included: true, amount: '0', scope: 'ORDER_TOTAL' },
        { code: 'CNC', included: false, scope: 'PER_DOOR' },
      ],
    });
    expect(result.manualCostsTotal).toBe('200');
    const cnc = result.manualCosts.find((c) => c.code === 'CNC')!;
    expect(cnc.included).toBe(false);
    expect(cnc.lineTotal).toBeNull();
  });

  it('aynı gider kodunu iki kez reddeder', () => {
    expect(() =>
      normalizeManualCostLines([
        { code: 'CNC', included: false, scope: 'PER_DOOR' },
        { code: 'CNC', included: true, amount: '10', scope: 'PER_DOOR' },
      ]),
    ).toThrow(/iki kez/);
  });

  it('birim maliyette ara yuvarlama yapmaz', () => {
    const rule = resolveDoorLeafSurfaceRule(2100, 900);
    const unit = toDecimal('1000').times(2).div(3);
    expect(
      toDecimal(
        calculateDoorBuildQuote({
          doorHeightMm: 2100,
          doorWidthMm: 900,
          quantity: 1,
          sheetPrice: '1000',
          manualCostLines: [],
        }).unitMdfSurfaceCost!,
      ).equals(unit),
    ).toBe(true);
    void rule;
  });

  it('210×120: yüzey 3/tabaka, en x1.5; fiziksel yüzey en ile değişmez', () => {
    const result = calculateDoorBuildQuote({
      doorHeightMm: 2100,
      doorWidthMm: 1200,
      quantity: 2,
      sheetPrice: '3000',
      manualCostLines: [],
      frame: { unitProductionCost: '400', totalBoyQuantity: '2.5' },
    });
    expect(result.surfaceStatus).toBe('RESOLVED');
    expect(result.surface!.rule.facesPerSheet).toBe(3);
    expect(result.surface!.rule.facesPerDoor).toBe(2);
    expect(result.surface!.totalFaces).toBe(4);
    expect(result.surface!.requiredFullSheets).toBe(2);
    expect(result.surface!.unusedFaces).toBe(2);
    expect(result.unitMdfSurfaceCost).toBe('2000');
    expect(result.totalAllocatedMdfCost).toBe('4000');
    expect(result.surfaceMessage).toBeNull();
    expect(result.widthCoefficient).toBe('1.5');
    expect(result.widthCoefficientStatus).toBe('RESOLVED');
    expect(result.componentCostBreakdown[0].status).toBe('RESOLVED');
    // yüzey 4000 + kasa 1000 = 5000; ×1.5 = 7500
    expect(result.baseSubtotalBeforeWidthCoefficient).toBe('5000');
    expect(result.widthAdjustedSubtotal).toBe('7500');
    expect(result.frame.lineTotal).not.toBe('750');
  });

  it('210×180: yüzey 3/tabaka, en x2', () => {
    const result = calculateDoorBuildQuote({
      doorHeightMm: 2100,
      doorWidthMm: 1800,
      quantity: 1,
      sheetPrice: '3000',
      manualCostLines: [],
    });
    expect(result.surface!.rule.facesPerSheet).toBe(3);
    expect(result.widthCoefficient).toBe('2');
    expect(result.unitMdfSurfaceCost).toBe('2000');
    expect(result.baseSubtotalBeforeWidthCoefficient).toBe('2000');
    expect(result.widthAdjustedSubtotal).toBe('4000');
  });

  it('250×120: yüzey 2/tabaka, en x1.5', () => {
    const result = calculateDoorBuildQuote({
      doorHeightMm: 2500,
      doorWidthMm: 1200,
      quantity: 3,
      sheetPrice: '3000',
      manualCostLines: [],
    });
    expect(result.surface!.rule.facesPerSheet).toBe(2);
    expect(result.surface!.totalFaces).toBe(6);
    expect(result.surface!.requiredFullSheets).toBe(3);
    expect(result.widthCoefficient).toBe('1.5');
    expect(result.unitMdfSurfaceCost).toBe('3000');
    expect(result.totalAllocatedMdfCost).toBe('9000');
    expect(result.widthAdjustedSubtotal).toBe('13500');
  });

  it('boy 250.1: yüzey unresolved; en ayrı', () => {
    const result = calculateDoorBuildQuote({
      doorHeightMm: 2501,
      doorWidthMm: 900,
      quantity: 1,
      sheetPrice: '3000',
      manualCostLines: [],
    });
    expect(result.surfaceStatus).toBe('UNRESOLVED');
    expect(result.surface).toBeNull();
    expect(result.surfaceMessage).toBe(DOOR_BUILD_SURFACE_RULE_MISSING_MESSAGE);
    expect(result.widthCoefficient).toBe('1');
  });

  it('en matrisi: yüzey boya bağlı, katsayı ene bağlı', () => {
    const cases: Array<{
      h: number;
      w: number;
      faces: number;
      coeff: string;
    }> = [
      { h: 2100, w: 900, faces: 3, coeff: '1' },
      { h: 2100, w: 1000, faces: 3, coeff: '1' },
      { h: 2100, w: 1200, faces: 3, coeff: '1.5' },
      { h: 2100, w: 1700, faces: 3, coeff: '1.5' },
      { h: 2100, w: 1800, faces: 3, coeff: '2' },
      { h: 2100, w: 2300, faces: 3, coeff: '2' },
      { h: 2500, w: 900, faces: 2, coeff: '1' },
      { h: 2500, w: 1200, faces: 2, coeff: '1.5' },
      { h: 2500, w: 1800, faces: 2, coeff: '2' },
    ];
    for (const c of cases) {
      const result = calculateDoorBuildQuote({
        doorHeightMm: c.h,
        doorWidthMm: c.w,
        quantity: 1,
        sheetPrice,
        manualCostLines: [],
      });
      expect(result.surface!.rule.facesPerSheet).toBe(c.faces);
      expect(result.surface!.rule.facesPerDoor).toBe(2);
      expect(result.widthCoefficient).toBe(c.coeff);
    }
  });

  it('malzeme önizlemesinde fiyat alanı yoktur', () => {
    const rule = resolveDoorLeafSurfaceRule(2100, 900);
    const preview = buildDoorBuildMaterialPreview({
      rule,
      quantity: 3,
      totalFaces: 6,
      requiredFullSheets: 2,
      rawMaterial: {
        id: 'rm-1',
        code: 'MDF-18-2100X2800-ZIMPARALI',
        name: '18 mm Zımparalı',
        thicknessMm: '18',
        sheetWidthMm: 2100,
        sheetLengthMm: 2800,
        surfaceType: 'ZIMPARALI',
      },
    });
    for (const key of DOOR_BUILD_MATERIAL_PREVIEW_FORBIDDEN_KEYS) {
      expect(preview).not.toHaveProperty(key);
    }
    expect(() =>
      assertNoPriceLeakage({
        materialDraft: [{ role: 'YUZAY_MDF', sheetPrice: '1' }],
      }),
    ).toThrow(/fiyat alanı/);
  });
});
