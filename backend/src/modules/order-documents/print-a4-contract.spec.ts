import * as fs from 'fs';
import * as path from 'path';
import { renderCombinedPrintHtml } from './order-print';
import { buildDoorBuildWorkshopPreview } from '../door-build/door-build-order-transfer';

describe('Print/PDF A4 — store-agnostic', () => {
  it('sipariş combined, fiyat listesi ve DoorBuild A4 üretir; Prisma import etmez', () => {
    const orderPrint = fs.readFileSync(path.join(__dirname, 'order-print.ts'), 'utf8');
    const priceListPage = fs.readFileSync(
      path.join(__dirname, '../../../../frontend/src/pages/price-list-page.tsx'),
      'utf8',
    );
    const doorBuildTransfer = fs.readFileSync(
      path.join(__dirname, '../door-build/door-build-order-transfer.ts'),
      'utf8',
    );

    expect(orderPrint).not.toMatch(/from '@prisma\/client'|PrismaClient|DATA_STORE/);
    expect(doorBuildTransfer).not.toMatch(/from '@prisma\/client'|PrismaClient|DATA_STORE/);
    expect(priceListPage).toContain('@page { size: A4 portrait;');

    const combined = renderCombinedPrintHtml(
      {
        documentDateText: '07.10.2026',
        customerName: 'A4 Test',
        customerAddress: '',
        taxOffice: '',
        customerPhone: '',
        taxNumber: '',
        lines: [
          {
            lineNo: 1,
            productNameText: 'Test',
            quantity: '1',
            unitText: 'ADET',
            discountRate: '0',
            unitPrice: '10',
            lineAmount: '10',
          },
        ],
        grossTotal: '10',
        discountAmount: '0',
        netTotal: '10',
        vatLabel: 'KDV %0',
        vatAmount: '0',
        grandTotal: '10',
      },
      {
        orderNumber: 'SP-000001',
        documentDateText: '07.10.2026',
        lines: [
          {
            lineNo: 1,
            productNameText: 'Test',
            productKindText: 'Generic',
            sizeText: '80×2100 mm',
            thicknessText: null,
            decorText: null,
            productionNote: null,
            quantity: '1',
            unitText: 'ADET',
            materialMessage: null,
          },
        ],
        materials: [],
      },
    );
    expect(combined).toContain('@page { size: A4 portrait;');

    const workshop = buildDoorBuildWorkshopPreview({
      quote: {
        doorHeightMm: 2100,
        doorWidthMm: 900,
        doorSizeLabelCm: '210×90',
        quantity: 1,
        widthCoefficient: '1',
        widthCoefficientStatus: 'RESOLVED',
        rawMaterial: {
          id: 'rm-1',
          name: '16 mm Zımparalı MDF',
          thicknessMm: '16',
          surfaceType: 'ZIMPARALI',
        },
        frame: { status: 'NOT_SELECTED' },
        sideTrims: { status: 'NOT_SELECTED' },
        header: { status: 'NOT_SELECTED' },
        materialDraft: [
          {
            role: 'YUZAY_MDF',
            label: 'MDF yüzeyi',
            productCode: null,
            productName: null,
            sizeLabel: '210×90',
            thicknessMm: '16',
            quantity: '1',
            pieceQuantity: '2',
            sheetQuantity: '1',
            unitText: 'TABAKA',
            rawMaterialId: 'rm-1',
            rawMaterialCode: 'MDF-16',
            rawMaterialName: '16 mm Zımparalı MDF',
            sheetWidthMm: 2100,
            sheetLengthMm: 2800,
            surfaceType: 'ZIMPARALI',
            unverified: false,
            note: null,
          },
        ],
        missingSources: [],
      },
    });
    expect(workshop.html).toContain('@page { size: A4 portrait;');
  });
});
