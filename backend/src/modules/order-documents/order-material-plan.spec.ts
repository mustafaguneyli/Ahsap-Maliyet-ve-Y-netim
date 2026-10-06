import {
  doorFrameMaterialCodes,
  duplicateMaterialWarnings,
  materialIdentityKey,
  planComponents,
  planPieceAndSheet,
} from './order-material-plan';
import { renderWorkshopPrintHtml, type WorkshopPrintModel } from './order-print';

describe('malzeme planı', () => {
  it('34 mm kasada 22 mm ana ve ölçüye göre 12 mm ikinci parçayı seçer', () => {
    const standard = doorFrameMaterialCodes('34_MM', 100, 2100);
    const wide = doorFrameMaterialCodes('34_MM', 140, 2200);
    const thin = doorFrameMaterialCodes('30_MM', 100, 2100);
    expect(standard).toEqual([
      { role: 'ANA_PARCA', materialCode: 'MDF-22-2100X2800-ZIMPARALI' },
      { role: 'IKINCI_PARCA', materialCode: 'MDF-12-2100X2800-ZIMPARALI' },
    ]);
    expect(wide?.[1].materialCode).toBe('MDF-12-2200X2800-ZIMPARALI');
    expect(thin?.[0].materialCode).toBe('MDF-18-2100X2800-ZIMPARALI');
  });

  it('parça adedini siparişle çarpar, tabakayı NET ile yukarı yuvarlar', () => {
    const exact = planPieceAndSheet({ orderQuantity: '26', piecesPerUnit: '1', netQty: 26 });
    const over = planPieceAndSheet({ orderQuantity: '10', piecesPerUnit: '2', netQty: 26 });
    const missing = planPieceAndSheet({ orderQuantity: '4', piecesPerUnit: '1', netQty: null });
    expect(exact.pieceQuantity.toFixed()).toBe('26');
    expect(exact.sheetQuantity?.toFixed()).toBe('1');
    expect(over.pieceQuantity.toFixed()).toBe('20');
    expect(over.sheetQuantity?.toFixed()).toBe('1');
    expect(missing.pieceQuantity.toFixed()).toBe('4');
    expect(missing.sheetQuantity).toBeNull();
  });

  it('27 parçada ikinci tabakayı ister ve eksik reçetede 0 yazmaz', () => {
    const sheets = planPieceAndSheet({ orderQuantity: '27', piecesPerUnit: '1', netQty: 26 });
    expect(sheets.sheetQuantity?.toFixed()).toBe('2');
    const missing = planComponents({
      lineNo: 3,
      orderQuantity: '5',
      components: null,
      unverifiedName: 'Serbest ürün',
    });
    expect(missing[0].unverified).toBe(true);
    expect(missing[0].quantity).toBeNull();
    expect(missing[0].pieceQuantity).toBeNull();
    expect(missing[0].sheetQuantity).toBeNull();
    expect(missing[0].note).toBe('Malzeme miktarı doğrulanamadı.');
  });

  it('aynı kimliği uyarır, farklı kalınlık veya tabakayı ayırır', () => {
    const shared = {
      materialNameText: 'MDF',
      thicknessMm: '22',
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
      surfaceType: 'ZIMPARALI',
      rawMaterialId: 'a',
    };
    const otherSheet = { ...shared, sheetWidthMm: 2200, rawMaterialId: 'b' };
    expect(duplicateMaterialWarnings([shared, shared])).toHaveLength(1);
    expect(duplicateMaterialWarnings([shared, otherSheet])).toHaveLength(0);
    expect(materialIdentityKey(shared)).not.toBe(materialIdentityKey(otherSheet));
  });

  it('atölye özetinde aynı MDF toplanır, farklı MDF ayrı kalır ve fiyat sızmaz', () => {
    const workshop: WorkshopPrintModel = {
      orderNumber: 'SP-000009',
      documentDateText: null,
      lines: [
        {
          lineNo: 1,
          productNameText: '34 MM Kasa',
          productKindText: 'Kapı Kasası',
          sizeText: '100×2100 mm',
          thicknessText: null,
          decorText: null,
          productionNote: null,
          quantity: '10',
          unitText: 'ADET',
          materialMessage: null,
        },
      ],
      materials: [
        row('a', 'MDF 22 mm', '22', 2100, '10', '1', 'ANA_PARCA'),
        row('a', 'MDF 22 mm', '22', 2100, '4', '1', 'ANA_PARCA'),
        row('b', 'MDF 12 mm', '12', 2100, '10', null, 'IKINCI_PARCA'),
      ],
    };
    const html = renderWorkshopPrintHtml(workshop);
    expect(html).toContain('Ürün bazlı malzeme listesi');
    expect(html).toContain('Malzeme özeti');
    expect(html).toContain('>14<');
    expect(html).toContain('MDF 12 mm');
    expect(html).not.toContain('₺');
    expect(html).not.toContain('BİRİM FİYATI');
    expect(html).not.toContain('cashPrice');
    expect(html).not.toContain('KDV');
    expect(html).not.toContain('İSKONTO');
  });
});

function row(
  id: string,
  name: string,
  thickness: string,
  sheetWidth: number,
  pieces: string,
  sheets: string | null,
  role: string,
) {
  return {
    source: 'RECIPE' as const,
    lineNo: 1,
    rawMaterialId: id,
    componentRole: role,
    materialNameText: name,
    thicknessMm: thickness,
    sheetWidthMm: sheetWidth,
    sheetLengthMm: 2800,
    surfaceType: 'ZIMPARALI',
    quantity: pieces,
    pieceQuantity: pieces,
    sheetQuantity: sheets,
    unitText: 'ADET',
    note: null,
    unverified: false,
  };
}
