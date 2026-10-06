import { MATERIAL_UNVERIFIED_MESSAGE, buildMaterialDrafts } from './order-materials';
import {
  assertWorkshopHasNoPriceFields,
  renderCombinedPrintHtml,
  renderCustomerPrintHtml,
  renderWorkshopPrintHtml,
  type CustomerPrintModel,
  type WorkshopPrintModel,
} from './order-print';

const customer = (): CustomerPrintModel => ({
  documentDateText: '06.01.2026',
  customerName: 'Müşteri A',
  customerAddress: '',
  taxOffice: '',
  customerPhone: '',
  taxNumber: '',
  lines: [
    {
      lineNo: 1,
      productNameText: '9MM 8*220 DÜZ PERVAZ',
      quantity: '400',
      unitText: 'ADET',
      discountRate: '0',
      unitPrice: '0',
      lineAmount: '0',
    },
    {
      lineNo: 2,
      productNameText: '12MM 8*220 DÜZ PERVAZ',
      quantity: '1500',
      unitText: 'ADET',
      discountRate: '10',
      unitPrice: '12.345',
      lineAmount: '18517.5',
    },
  ],
  grossTotal: '18517.5',
  discountAmount: '1851.75',
  netTotal: '16665.75',
  vatLabel: 'KDV %20',
  vatAmount: '3333.15',
  grandTotal: '19998.9',
});

const workshopSample = (): WorkshopPrintModel => ({
  orderNumber: 'SP-000001',
  documentDateText: '06.01.2026',
  lines: [
    {
      lineNo: 1,
      productNameText: '9MM 8*220 DÜZ PERVAZ',
      productKindText: 'Pervaz / Düz Pervaz',
      sizeText: '80×2200 mm',
      thicknessText: '9 mm',
      decorText: null,
      productionNote: 'Uzun üretim notu: sol yön, özel kanal, müşteri tesliminden önce kontrol',
      quantity: '400',
      unitText: 'ADET',
      materialMessage: MATERIAL_UNVERIFIED_MESSAGE,
    },
  ],
  materials: [
    {
      source: 'MANUAL',
      lineNo: 1,
      materialNameText: 'MDF 18 mm',
      thicknessMm: '18',
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
      surfaceType: 'ZIMPARALI',
      quantity: '3',
      pieceQuantity: '3',
      sheetQuantity: null,
      rawMaterialId: null,
      componentRole: 'MANUEL',
      unitText: 'ADET',
      note: null,
      unverified: false,
    },
  ],
});

describe('baskı projeksiyonları', () => {
  it('müşteri formunda tek A4 nüsha, firma bilgisi ve toplam vardır', () => {
    const html = renderCustomerPrintHtml(customer());
    expect(html).toContain('ZİRVE AHŞAP');
    expect(html).toContain('FEVZİ ÇAKMAK MAH. EHLİBEYT SK.NO 26 KARATAY / KONYA');
    expect(html).toContain('TEL. : 0551 119 72 80');
    expect(html).toContain('SİPARİŞ / TALEP FORMU  D.T:06.01.2026');
    expect(html).toContain('BİRİM FİYATI');
    expect(html).toContain('GENEL TOPLAM');
    expect(html).toContain('İSKONTO');
    expect(html).toContain('ARA TOPLAM');
    expect(html).toContain('KDV %20');
    expect(html).toContain('YENİ TOPLAM');
    expect(html.split('9MM 8*220 DÜZ PERVAZ')).toHaveLength(2);
    expect(html.split('19.998,90 TL')).toHaveLength(2);
    expect(html).toContain('@page { size: A4 portrait;');
    expect(html).toContain('data-section="customer"');
    expect(html).not.toContain('data-copy="2"');
    expect(html.split('class="sheet"')).toHaveLength(2);
    expect(html).not.toContain('SP-');
    expect(html).not.toContain('transform:');
    expect(html).not.toContain('scale(');
  });

  it('uzun müşteri adı tek nüshada tam durur', () => {
    const model = customer();
    model.customerName = 'UZUN MÜŞTERİ ÜNVANI VE TİCARET LİMİTED ŞİRKETİ KARATAY';
    model.customerAddress =
      'FEVZİ ÇAKMAK MAHALLESİ EHLİBEYT SOKAK NO 26 KARATAY KONYA EK ADRES SATIRI';
    const html = renderCustomerPrintHtml(model);
    expect(html.split(model.customerName)).toHaveLength(2);
    expect(html.split(model.customerAddress)).toHaveLength(2);
    expect(html).toContain('overflow-wrap: anywhere');
    expect(html).not.toContain('SP-');
  });

  it('8 satır tek içerik sayfasında tek A4 müşteri nüshası üretir', () => {
    const model = customer();
    model.lines = Array.from({ length: 8 }, (_, index) => ({
      lineNo: index + 1,
      productNameText: `UZUN ÜRÜN ADI ${index + 1} KAPİ KASASI 34 MM 10x210 ÖZEL KESİM`,
      quantity: '2',
      unitText: 'ADET',
      discountRate: '0',
      unitPrice: '10',
      lineAmount: '20',
    }));
    model.grossTotal = '160';
    model.discountAmount = '0';
    model.netTotal = '160';
    model.vatAmount = '32';
    model.grandTotal = '192';
    const html = renderCustomerPrintHtml(model);
    expect(html.split('class="sheet"')).toHaveLength(2);
    expect(html.split('192,00 TL')).toHaveLength(2);
    expect(html.split('UZUN ÜRÜN ADI 8')).toHaveLength(2);
    expect(html).toContain('overflow-wrap: anywhere');
    expect(html).toContain('break-inside: avoid');
  });

  it('11 satırda müşteri devam sayfası açar (çift nüsha yok)', () => {
    const model = customer();
    model.lines = Array.from({ length: 11 }, (_, index) => ({
      lineNo: index + 1,
      productNameText: `UZUN ÜRÜN ADI ${index + 1} KAPİ KASASI 34 MM 10x210 ÖZEL KESİM`,
      quantity: '2',
      unitText: 'ADET',
      discountRate: '0',
      unitPrice: '10',
      lineAmount: '20',
    }));
    model.grossTotal = '220';
    model.discountAmount = '0';
    model.netTotal = '220';
    model.vatAmount = '44';
    model.grandTotal = '264';
    const html = renderCustomerPrintHtml(model);
    expect(html.split('class="sheet"')).toHaveLength(3);
    expect(html.split('264,00 TL')).toHaveLength(2);
    expect(html.split('UZUN ÜRÜN ADI 11')).toHaveLength(2);
    expect(html.split('UZUN ÜRÜN ADI 1 ')).toHaveLength(2);
  });

  it('12 satırda devam sayfası açar ve satır adını kesmez', () => {
    const model = customer();
    model.lines = Array.from({ length: 12 }, (_, index) => ({
      lineNo: index + 1,
      productNameText: `URUN-${index + 1}-UZUN-AD`,
      quantity: '1',
      unitText: 'ADET',
      discountRate: '0',
      unitPrice: '10',
      lineAmount: '10',
    }));
    const html = renderCustomerPrintHtml(model);
    expect(html.split('class="sheet"')).toHaveLength(3);
    expect(html).toContain('URUN-12-UZUN-AD');
    expect(html.split('URUN-12-UZUN-AD')).toHaveLength(2);
  });

  it('24 satırda üç müşteri içerik sayfası üretir', () => {
    const model = customer();
    model.lines = Array.from({ length: 24 }, (_, index) => ({
      lineNo: index + 1,
      productNameText: `URUN-${index + 1}-UZUN-AD`,
      quantity: '1',
      unitText: 'ADET',
      discountRate: '12.5',
      unitPrice: '10.25',
      lineAmount: '10.25',
    }));
    const html = renderCustomerPrintHtml(model);
    expect(html.split('class="sheet"')).toHaveLength(4);
    expect(html.split('URUN-24-UZUN-AD')).toHaveLength(2);
    expect(html).toContain('@page { size: A4 portrait;');
  });

  it('atölye çıktısı A4’tür ve fiyat alanları yoktur', () => {
    const workshop = workshopSample();
    assertWorkshopHasNoPriceFields(workshop);
    const html = renderWorkshopPrintHtml(workshop);
    expect(html).toContain('@page { size: A4 portrait;');
    expect(html).toContain('SP-000001');
    expect(html).toContain('9MM 8*220 DÜZ PERVAZ');
    expect(html).toContain('400');
    expect(html).toContain(
      'Uzun üretim notu: sol yön, özel kanal, müşteri tesliminden önce kontrol',
    );
    expect(html).toContain('MDF 18 mm');
    expect(html).toContain('Manuel');
    expect(html).toContain('Malzeme miktarı doğrulanamadı');
    expect(html).not.toContain('12.345');
    expect(html).not.toContain('18517.5');
    expect(html).not.toContain('₺');
    expect(html).not.toContain('BİRİM FİYATI');
    expect(html).not.toContain('İSKONTO');
    expect(html).not.toContain('KDV');
    expect(html).not.toContain('GENEL TOPLAM');
    expect(html).not.toContain('ARA TOPLAM');
    expect(html).not.toContain('YENİ TOPLAM');
    expect(html).not.toContain('maliyet');
    expect(html).not.toContain('kâr');
    expect(html).not.toContain('FİRMA');
    expect(html).not.toContain('transform:');
    expect(html).not.toContain('scale(');
  });

  it('combined kısa sipariş: tek A4, müşteri → cut-gap → üretim; üretimde fiyat yok', () => {
    const html = renderCombinedPrintHtml(customer(), workshopSample());
    expect(html).toContain('@page { size: A4 portrait;');
    expect(html).not.toContain('@page { size: A5 portrait;');
    expect(html).not.toContain('transform:');
    expect(html).not.toContain('scale(');
    expect(html).toContain('class="sheet a4-combined"');
    expect(html).toContain('class="a4-customer"');
    expect(html).toContain('class="cut-gap"');
    expect(html).toContain('class="a4-workshop"');
    expect(html).toContain('data-section="customer"');
    expect(html).toContain('data-section="workshop"');
    expect(html).toContain('ÜRETİM FORMU');
    expect(html).toContain('BİRİM FİYATI');
    expect(html).toContain('SP-000001');

    const customerIdx = html.indexOf('data-section="customer"');
    const cutGapIdx = html.indexOf('class="cut-gap"');
    const workshopIdx = html.indexOf('data-section="workshop"');
    expect(customerIdx).toBeGreaterThan(-1);
    expect(cutGapIdx).toBeGreaterThan(customerIdx);
    expect(workshopIdx).toBeGreaterThan(cutGapIdx);

    const workshopPart = html.slice(workshopIdx);
    expect(workshopPart).toContain('ÜRETİM FORMU');
    expect(workshopPart).not.toMatch(/BİRİM FİYATI|GENEL TOPLAM|İSKONTO|YENİ TOPLAM/i);
    expect(workshopPart).not.toMatch(/\d+[.,]\d{2}\s*TL/);
  });

  it('combined uzun sipariş: devam sayfalarında müşteri sonra üretim; A4', () => {
    const model = customer();
    model.lines = Array.from({ length: 11 }, (_, index) => ({
      lineNo: index + 1,
      productNameText: `URUN-${index + 1}`,
      quantity: '1',
      unitText: 'ADET',
      discountRate: '0',
      unitPrice: '10',
      lineAmount: '10',
    }));
    const html = renderCombinedPrintHtml(model, workshopSample());
    expect(html).toContain('@page { size: A4 portrait;');
    expect(html).not.toContain('class="sheet a4-combined"');
    expect(html).not.toContain('class="cut-gap"');
    const customerIdx = html.indexOf('data-section="customer"');
    const workshopIdx = html.indexOf('data-section="workshop"');
    expect(customerIdx).toBeGreaterThan(-1);
    expect(workshopIdx).toBeGreaterThan(customerIdx);
    const workshopPart = html.slice(workshopIdx);
    expect(workshopPart).not.toMatch(/BİRİM FİYATI|GENEL TOPLAM|İSKONTO|YENİ TOPLAM/i);
    expect(workshopPart).not.toMatch(/\d+[.,]\d{2}\s*TL/);
  });

  it('reçete miktarını sipariş adediyle çarpar, NET adede bölmez', () => {
    const drafts = buildMaterialDrafts({
      lines: [
        {
          lineNo: 1,
          productNameText: '34 MM MDF Kasa',
          quantity: '4',
          recipeItems: [
            {
              quantity: '1',
              rawMaterialId: 'a',
              materialName: 'MDF 22',
              thicknessMm: '22',
              sheetWidthMm: 2100,
              sheetLengthMm: 2800,
              surfaceType: 'ZIMPARALI',
            },
            {
              quantity: '1',
              rawMaterialId: 'b',
              materialName: 'MDF 12',
              thicknessMm: '12',
              sheetWidthMm: 2100,
              sheetLengthMm: 2800,
              surfaceType: 'ZIMPARALI',
            },
          ],
        },
        {
          lineNo: 2,
          productNameText: 'Serbest',
          quantity: '2',
          recipeItems: null,
        },
      ],
      manual: [
        {
          lineNo: 2,
          materialNameText: 'Tutkal',
          quantity: '0,5',
          unitText: 'KG',
        },
      ],
    });

    expect(drafts[0].quantity).toBe('4');
    expect(drafts[0].materialNameText).toBe('MDF 22');
    expect(drafts[1].quantity).toBe('4');
    expect(drafts[1].materialNameText).toBe('MDF 12');
    expect(drafts[0].note).toContain('NET adede bölünmedi');
    expect(drafts[2].unverified).toBe(true);
    expect(drafts[2].quantity).toBeNull();
    expect(drafts[3].source).toBe('MANUAL');
    expect(drafts[3].quantity).toBe('0.5');
  });
});
