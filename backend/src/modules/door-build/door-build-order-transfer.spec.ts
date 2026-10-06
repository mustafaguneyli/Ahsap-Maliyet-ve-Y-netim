import {
  buildDoorBuildOrderUpsert,
  buildDoorBuildWorkshopPreview,
  DOOR_BUILD_DRAFT_ORDER_NUMBER,
  materialDraftToManualMaterials,
} from './door-build-order-transfer';
import type { DoorBuildMaterialDraftLine } from '../../calculation-engine/calculators/door-build-quote';
import { assertWorkshopHasNoPriceFields } from '../order-documents/order-print';

function surfaceLine(
  overrides?: Partial<DoorBuildMaterialDraftLine>,
): DoorBuildMaterialDraftLine {
  return {
    role: 'YUZAY_MDF',
    label: 'MDF yüzeyi',
    productCode: null,
    productName: null,
    sizeLabel: '210×90',
    thicknessMm: '16',
    quantity: '2',
    pieceQuantity: '6',
    sheetQuantity: '2',
    unitText: 'TABAKA',
    rawMaterialId: 'rm-1',
    rawMaterialCode: 'MDF-16',
    rawMaterialName: '16 mm Zımparalı MDF',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'ZIMPARALI',
    unverified: false,
    note: 'Yüzey adedi 6; tam tabaka 2.',
    ...overrides,
  };
}

function quoteSource(materialDraft: DoorBuildMaterialDraftLine[]) {
  return {
    doorHeightMm: 2100,
    doorWidthMm: 900,
    doorSizeLabelCm: '210×90',
    quantity: 3,
    widthCoefficient: '1',
    widthCoefficientStatus: 'RESOLVED' as const,
    rawMaterial: {
      id: 'rm-1',
      name: '16 mm Zımparalı MDF',
      thicknessMm: '16',
      surfaceType: 'ZIMPARALI',
    },
    frame: { status: 'RESOLVED', displayName: '34 MM MDF Kasa 10×210' },
    sideTrims: { status: 'RESOLVED', displayName: 'Ayarlı Pervaz' },
    header: { status: 'RESOLVED', displayName: 'Başlık' },
    materialDraft,
    missingSources: [] as string[],
  };
}

describe('door-build-order-transfer', () => {
  it('210×90 / 3 kapı yüzey tabakasını aktarır; fiyat alanı eklemez', () => {
    const draft: DoorBuildMaterialDraftLine[] = [
      surfaceLine(),
      surfaceLine({
        role: 'FRAME',
        label: 'Kapı kasası',
        productName: '34 MM MDF Kasa',
        sizeLabel: '10×210',
        quantity: '3',
        pieceQuantity: '3',
        sheetQuantity: null,
        unitText: 'ADET',
        rawMaterialId: null,
        rawMaterialCode: null,
        rawMaterialName: null,
        sheetWidthMm: null,
        sheetLengthMm: null,
        surfaceType: null,
        note: 'Kasa birimi',
      }),
      surfaceLine({
        role: 'SIDE_TRIM',
        label: 'Yan pervaz',
        productName: 'Ayarlı Pervaz',
        quantity: '6',
        pieceQuantity: '6',
        sheetQuantity: null,
        unitText: 'ADET',
        rawMaterialId: null,
        note: 'Kapı başına 2 yan pervaz.',
      }),
      surfaceLine({
        role: 'HEADER',
        label: 'Başlık',
        productName: 'Ayarlı Pervaz',
        quantity: '3',
        pieceQuantity: '3',
        sheetQuantity: null,
        unitText: 'ADET',
        rawMaterialId: null,
        note: 'Kapı başına 1 başlık.',
      }),
      surfaceLine({
        role: 'MANUAL_PHYSICAL',
        label: 'Manuel malzeme',
        quantity: '4',
        pieceQuantity: '4',
        sheetQuantity: null,
        unitText: 'ADET',
        rawMaterialId: null,
        rawMaterialName: 'Pres contası',
        note: 'Üretim notu',
      }),
    ];

    const { upsert, warnings } = buildDoorBuildOrderUpsert({
      quote: quoteSource(draft),
      unitPrice: '1500',
      discountRate: '0',
      vatRate: '20',
      customerName: 'Test Müşteri',
      salePriceSource: 'MANUAL',
    });

    expect(warnings).toEqual([]);
    expect(upsert.lines).toHaveLength(1);
    expect(upsert.lines[0].kind).toBe('FREE_TEXT');
    expect(upsert.lines[0].unitPrice).toBe('1500');
    expect(upsert.lines[0].priceSource).toBe('ENTERED');
    expect(upsert.manualMaterials).toHaveLength(5);
    expect(upsert.manualMaterials.every((m) => m.lineNo === 1)).toBe(true);
    expect(upsert.manualMaterials.map((m) => m.componentRole)).toEqual([
      'YUZAY_MDF',
      'FRAME',
      'SIDE_TRIM',
      'HEADER',
      'MANUAL_PHYSICAL',
    ]);
    expect(upsert.manualMaterials[0].sheetQuantity).toBe('2');
    expect(upsert.manualMaterials[0].pieceQuantity).toBe('6');
    expect(
      upsert.manualMaterials.filter((m) => m.componentRole === 'YUZAY_MDF'),
    ).toHaveLength(1);
  });

  it('doğrulanmamış miktarı 0 uydurmaz; uyarıya yazar', () => {
    const draft = [
      surfaceLine({ quantity: '1', pieceQuantity: '2', sheetQuantity: '1' }),
      surfaceLine({
        role: 'FRAME',
        label: 'Kapı kasası',
        quantity: null,
        pieceQuantity: null,
        unverified: true,
        note: 'Katalog ölçüsü yok',
        rawMaterialId: null,
        rawMaterialName: null,
      }),
    ];
    const { manuals, skippedUnverified } = materialDraftToManualMaterials(draft);
    expect(manuals).toHaveLength(1);
    expect(skippedUnverified.some((m) => /Katalog/.test(m))).toBe(true);
  });

  it('taslak A5 sipariş numarası TASLAK olur ve fiyat sızdırmaz', () => {
    const { model, html } = buildDoorBuildWorkshopPreview({
      quote: quoteSource([surfaceLine()]),
    });
    expect(model.orderNumber).toBe(DOOR_BUILD_DRAFT_ORDER_NUMBER);
    assertWorkshopHasNoPriceFields(model);
    expect(html).toContain('TASLAK');
    expect(html).toContain('ÜRETİM FORMU');
    expect(html).toContain('En Katsayısı: x1');
    expect(html).not.toMatch(/1500|sheetPrice|unitPrice|KDV|İskonto|Genel Toplam/i);
    expect(html).toContain('16 mm Zımparalı MDF');
    expect(model.lines[0].materialMessage).toBeNull();
  });

  it('sipariş snapshot en katsayısını korur; malzeme adedi çarpılmaz', () => {
    const draft = [
      surfaceLine(),
      surfaceLine({
        role: 'SIDE_TRIM',
        label: 'Yan pervaz',
        quantity: '12',
        pieceQuantity: '12',
        sheetQuantity: null,
        unitText: 'ADET',
        rawMaterialId: null,
        note: '4 adet/kapı',
      }),
    ];
    const quote = {
      ...quoteSource(draft),
      widthCoefficient: '1.5',
      doorWidthMm: 1500,
    };
    const { upsert } = buildDoorBuildOrderUpsert({
      quote,
      unitPrice: '1500',
      discountRate: '0',
      vatRate: '20',
      customerName: 'Test',
      salePriceSource: 'MANUAL',
    });
    expect(upsert.lines[0].productionNote).toMatch(/En katsayısı: x1\.5/);
    expect(upsert.lines[0].productionNote).toMatch(/En: 1500 mm/);
    expect(upsert.lines[0].productionNote!.length).toBeLessThanOrEqual(400);
    expect(upsert.lines[0].widthMm).toBe('1500');
    const side = upsert.manualMaterials.find(
      (m) => m.componentRole === 'SIDE_TRIM',
    );
    expect(side?.quantity).toBe('12');
  });
});
