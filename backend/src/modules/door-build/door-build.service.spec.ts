import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MaterialPriceType } from '@prisma/client';
import { toDecimal } from '../../common/decimal/decimal.util';
import { DoorBuildService } from './door-build.service';

describe('DoorBuildService', () => {
  const now = new Date('2026-09-29T10:00:00.000Z');

  function material(overrides?: {
    prices?: Array<{
      id: string;
      priceType: MaterialPriceType;
      price: { toString(): string };
      effectiveFrom: Date;
      effectiveTo: Date | null;
      isActive: boolean;
    }>;
  }) {
    return {
      id: 'rm-1',
      code: 'MDF-16-2100X2800-ZIMPARALI',
      name: '16 mm Zımparalı MDF',
      thicknessMm: { toString: () => '16' },
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
      surfaceType: 'ZIMPARALI',
      isActive: true,
      prices: overrides?.prices ?? [
        {
          id: 'p-card',
          priceType: MaterialPriceType.CARD_INSTALLMENT,
          price: { toString: () => '3000' },
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
        {
          id: 'p-cash',
          priceType: MaterialPriceType.CASH,
          price: { toString: () => '2700' },
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
      ],
    };
  }

  function createService(opts?: {
    material?: unknown;
    frameRows?: Array<{
      widthCm: number;
      lengthCm: number;
      productionCost: string;
    }>;
    pervazRows?: Array<{
      thicknessMm: number | string;
      widthMm: number | string;
      lengthMm: number | string;
      productionCost: string;
    }>;
    frameError?: Error;
    pervazError?: Error;
  }) {
    const prisma = {
      rawMaterial: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            opts && Object.prototype.hasOwnProperty.call(opts, 'material')
              ? opts.material
              : material(),
          ),
      },
    };
    const costCalculationService = {
      getDoorFrameMdfCosts: jest.fn().mockImplementation(async () => {
        if (opts?.frameError) throw opts.frameError;
        return {
          rows: opts?.frameRows ?? [
            { widthCm: 10, lengthCm: 210, productionCost: '400' },
          ],
        };
      }),
      getAyarliPervazMdfCosts: jest.fn().mockImplementation(async () => {
        if (opts?.pervazError) throw opts.pervazError;
        return {
          rows: opts?.pervazRows ?? [
            {
              thicknessMm: 12,
              widthMm: 100,
              lengthMm: 2200,
              productionCost: '80',
            },
          ],
        };
      }),
      getDekoratifPervazCosts: jest.fn().mockResolvedValue({ rows: [] }),
      getDekoratifGenisKilcikCosts: jest.fn().mockResolvedValue({ rows: [] }),
    };
    return {
      service: new DoorBuildService(
        prisma as never,
        costCalculationService as never,
      ),
      costCalculationService,
    };
  }

  it('kasa: katalog productionCost × totalBoyQuantity; kapı adediyle çarpılmaz; 750 yok', async () => {
    const { service, costCalculationService } = createService();
    const result = await service.quote(
      {
        doorHeightMm: 2100,
        doorWidthMm: 900,
        quantity: 2,
        surfaceRawMaterialId: 'rm-1',
        materialPriceType: 'CARD_INSTALLMENT',
        frame: {
          productCode: '34_MM',
          widthMm: 100,
          lengthMm: 2100,
          totalBoyQuantity: '2.5',
        },
        sideTrims: {
          productCode: 'AYARLI_PERVAZ',
          thicknessMm: '12',
          widthMm: '100',
          lengthMm: '2200',
        },
        header: {
          productCode: 'AYARLI_PERVAZ',
          thicknessMm: '12',
          widthMm: '100',
          lengthMm: '2200',
        },
        manualCostLines: [],
      },
      now,
    );

    expect(costCalculationService.getDoorFrameMdfCosts).toHaveBeenCalledWith(
      '34_MM',
      now,
      'CARD_INSTALLMENT',
    );
    expect(result.frame.status).toBe('RESOLVED');
    expect(result.frame.unitProductionCost).toBe('400');
    expect(result.frame.totalBoyQuantity).toBe('2.5');
    expect(result.frame.totalCost).toBe('1000'); // 400 × 2.5
    expect(result.frame.lineTotal).toBe('1000');
    expect(result.frame.totalCost).not.toBe('750');
    expect(result.frame.totalCost).not.toBe('2000'); // quantity 2 ile çarpılmaz
    expect(result.frame.ruleSource).toBeNull();
    expect(result.frame.costPerDoor).toBeNull();
    expect(result.frame.pricePerBoy).toBeNull();
    expect(result.sale.status).toBe('NOT_COMPUTED');
  });

  it('farklı katalog productionCost kasa toplamını değiştirir', async () => {
    const { service: serviceA } = createService({
      frameRows: [{ widthCm: 10, lengthCm: 210, productionCost: '400' }],
    });
    const { service: serviceB } = createService({
      frameRows: [{ widthCm: 10, lengthCm: 210, productionCost: '520' }],
    });
    const quoteInput = {
      doorHeightMm: 2100,
      doorWidthMm: 900,
      quantity: 1,
      surfaceRawMaterialId: 'rm-1',
      frame: {
        productCode: '34_MM' as const,
        widthMm: 100,
        lengthMm: 2100,
        totalBoyQuantity: '2.5',
      },
      manualCostLines: [] as [],
    };
    const a = await serviceA.quote(quoteInput, now);
    const b = await serviceB.quote(quoteInput, now);
    expect(a.frame.totalCost).toBe('1000');
    expect(b.frame.totalCost).toBe('1300'); // 520 × 2.5
    expect(a.frame.totalCost).not.toBe('750');
    expect(b.frame.totalCost).not.toBe('750');
    expect(b.frame.totalCost).not.toBe('950');
  });

  it('yan pervaz 4/kapı; istemci piecesPerDoor yok sayılır', async () => {
    const { service } = createService();
    const result = await service.quote(
      {
        doorHeightMm: 2100,
        doorWidthMm: 900,
        quantity: 2,
        surfaceRawMaterialId: 'rm-1',
        sideTrims: {
          productCode: 'AYARLI_PERVAZ',
          thicknessMm: '12',
          widthMm: '100',
          lengthMm: '2200',
          piecesPerDoor: 99,
        },
        header: {
          productCode: 'AYARLI_PERVAZ',
          thicknessMm: '12',
          widthMm: '100',
          lengthMm: '2200',
        },
        manualCostLines: [],
      },
      now,
    );
    expect(result.sideTrims.status).toBe('RESOLVED');
    expect(result.sideTrims.piecesPerDoor).toBe(4);
    expect(result.sideTrims.totalPieces).toBe('8');
    expect(result.sideTrims.lineTotal).toBe('640'); // 80 × 4 × 2
    expect(result.header.status).toBe('RESOLVED');
    expect(result.header.piecesPerDoor).toBe(1);
    expect(result.header.totalPieces).toBe('2');
    expect(result.header.lineTotal).toBe('160'); // 80 × 1 × 2
  });

  it('eksik kasa katalog ölçüsünde UNRESOLVED; yakın ölçüye düşmez', async () => {
    const { service } = createService({
      frameRows: [{ widthCm: 10, lengthCm: 210, productionCost: '400' }],
    });
    const result = await service.quote(
      {
        doorHeightMm: 2100,
        doorWidthMm: 900,
        quantity: 1,
        surfaceRawMaterialId: 'rm-1',
        frame: {
          productCode: '34_MM',
          widthMm: 999,
          lengthMm: 2100,
          totalBoyQuantity: '2.5',
        },
        manualCostLines: [],
      },
      now,
    );
    expect(result.frame.status).toBe('UNRESOLVED');
    expect(result.frame.lineTotal).toBeNull();
    expect(result.frame.totalCost).toBeNull();
    expect(result.totalAllocatedMdfCost).toBe('2000');
    expect(result.allSelectedComponentsResolved).toBe(false);
    expect(result.missingSources.join(' ')).toMatch(
      /katalog ölçüsü bulunamadı|otomatik/i,
    );
  });

  it('eksik pervaz masterında yakın ölçüye atamaz', async () => {
    const { service } = createService({
      pervazRows: [
        {
          thicknessMm: 12,
          widthMm: 100,
          lengthMm: 2200,
          productionCost: '80',
        },
      ],
    });
    const result = await service.quote(
      {
        doorHeightMm: 2100,
        doorWidthMm: 900,
        quantity: 1,
        surfaceRawMaterialId: 'rm-1',
        sideTrims: {
          productCode: 'AYARLI_PERVAZ',
          thicknessMm: '12',
          widthMm: '100',
          lengthMm: '2800',
          piecesPerDoor: 1,
        },
        manualCostLines: [],
      },
      now,
    );
    expect(result.sideTrims.status).toBe('UNRESOLVED');
    expect(result.sideTrims.lineTotal).toBeNull();
    expect(result.missingSources.join(' ')).toMatch(/katalogda yok|otomatik/i);
  });

  it('yüzey MDF + en katsayısı: 210×90 ve 250×90', async () => {
    const { service } = createService();
    const r210 = await service.quote(
      {
        doorHeightMm: 2100,
        doorWidthMm: 900,
        quantity: 1,
        surfaceRawMaterialId: 'rm-1',
        manualCostLines: [],
      },
      now,
    );
    expect(r210.unitMdfSurfaceCost).toBe('2000');
    expect(r210.totalFaces).toBe(2);
    expect(r210.requiredFullSheets).toBe(1);
    expect(r210.widthCoefficient).toBe('1');
    expect(r210.widthAdjustedSubtotal).toBe('2000');

    const r250 = await service.quote(
      {
        doorHeightMm: 2500,
        doorWidthMm: 900,
        quantity: 1,
        surfaceRawMaterialId: 'rm-1',
        manualCostLines: [],
      },
      now,
    );
    expect(r250.unitMdfSurfaceCost).toBe('3000');
    expect(r250.totalFaces).toBe(2);
    expect(r250.requiredFullSheets).toBe(1);
    expect(r250.widthCoefficient).toBe('1');
    expect(r250.widthAdjustedSubtotal).toBe('3000');
  });

  it('materialDraft FRAME quantity = totalBoyQuantity BOY; notta 750/950/TL yok', async () => {
    const { service } = createService();
    const result = await service.quote(
      {
        doorHeightMm: 2100,
        doorWidthMm: 900,
        quantity: 3,
        surfaceRawMaterialId: 'rm-1',
        frame: {
          productCode: '34_MM',
          widthMm: 100,
          lengthMm: 2100,
          totalBoyQuantity: '2.5',
        },
        manualCostLines: [],
      },
      now,
    );
    expect(result.materialDraft.every((l) => !('sheetPrice' in l))).toBe(true);
    const frameDraft = result.materialDraft.find((l) => l.role === 'FRAME');
    expect(frameDraft?.quantity).toBe('2.5');
    expect(frameDraft?.unitText).toBe('BOY');
    expect(frameDraft?.note ?? '').toMatch(/2\.5 boy/i);
    expect(frameDraft?.note ?? '').not.toMatch(/750|950|TL/i);
    expect(result.frame.totalCost).toBe('1000');
  });

  it('kâr/KDV yoksa satış otomatik uygulanmaz', async () => {
    const { service } = createService();
    const result = await service.quote(
      {
        doorHeightMm: 2100,
        doorWidthMm: 900,
        quantity: 1,
        surfaceRawMaterialId: 'rm-1',
        frame: {
          productCode: '34_MM',
          widthMm: 100,
          lengthMm: 2100,
          totalBoyQuantity: '2.5',
        },
        manualCostLines: [],
      },
      now,
    );
    expect(result.partialSubtotalLabel).toMatch(/Üretim Maliyeti/i);
    expect(result.partialSubtotalLabel).not.toMatch(/Nihai/i);
    expect(result.sale.status).toBe('NOT_COMPUTED');
    expect(result.sale.cashSale).toBeNull();
    expect(result.sale.cardSale).toBeNull();
    expect(result.sale.profitAmount).toBeNull();
  });

  it('CASH alış türünü bileşen çağrılarına aktarır', async () => {
    const { service, costCalculationService } = createService();
    await service.quote(
      {
        doorHeightMm: 2100,
        doorWidthMm: 900,
        quantity: 1,
        surfaceRawMaterialId: 'rm-1',
        materialPriceType: 'CASH',
        frame: {
          productCode: '30_MM',
          widthMm: 100,
          lengthMm: 2100,
          totalBoyQuantity: '2.5',
        },
        manualCostLines: [],
      },
      now,
    );
    expect(costCalculationService.getDoorFrameMdfCosts).toHaveBeenCalledWith(
      '30_MM',
      now,
      'CASH',
    );
    expect(costCalculationService.getAyarliPervazMdfCosts).not.toHaveBeenCalled();
  });

  it('katalog başlığı + Uzun Başlık manuel giderini reddeder', async () => {
    const { service } = createService();
    await expect(
      service.quote(
        {
          doorHeightMm: 2100,
          doorWidthMm: 900,
          quantity: 1,
          surfaceRawMaterialId: 'rm-1',
          header: {
            productCode: 'AYARLI_PERVAZ',
            thicknessMm: '12',
            widthMm: '100',
            lengthMm: '2200',
          },
          manualCostLines: [
            {
              code: 'UZUN_BASLIK',
              included: true,
              amount: '50',
              scope: 'PER_DOOR',
            },
          ],
        },
        now,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('eksik CARD fiyatında CASH’e geçmez', async () => {
    const { service } = createService({
      material: material({
        prices: [
          {
            id: 'p-cash',
            priceType: MaterialPriceType.CASH,
            price: { toString: () => '2700' },
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
            effectiveTo: null,
            isActive: true,
          },
        ],
      }),
    });
    await expect(
      service.quote(
        {
          doorHeightMm: 2100,
          doorWidthMm: 900,
          quantity: 1,
          surfaceRawMaterialId: 'rm-1',
          materialPriceType: 'CARD_INSTALLMENT',
          manualCostLines: [],
        },
        now,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('malzeme yoksa NotFound', async () => {
    const { service } = createService({ material: null });
    await expect(
      service.quote(
        {
          doorHeightMm: 2100,
          doorWidthMm: 900,
          quantity: 1,
          surfaceRawMaterialId: 'missing',
          manualCostLines: [],
        },
        now,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('CASH yüzey birim maliyeti Decimal korunur', async () => {
    const { service } = createService();
    const result = await service.quote(
      {
        doorHeightMm: 2100,
        doorWidthMm: 900,
        quantity: 1,
        surfaceRawMaterialId: 'rm-1',
        materialPriceType: 'CASH',
        manualCostLines: [],
      },
      now,
    );
    expect(result.unitMdfSurfaceCost).toBe(
      toDecimal('2700').times(2).div(3).toFixed(),
    );
  });

  it('210×90 / 3 kapı → 6 yüzey / 2 tabaka; manuel fiziksel ekler', async () => {
    const { service } = createService();
    const result = await service.quote(
      {
        doorHeightMm: 2100,
        doorWidthMm: 900,
        quantity: 3,
        surfaceRawMaterialId: 'rm-1',
        manualCostLines: [],
        physicalMaterials: [
          {
            materialNameText: 'Pres contası',
            quantity: '2',
            unitText: 'ADET',
            note: 'Fiziksel',
          },
        ],
      },
      now,
    );
    expect(result.totalFaces).toBe(6);
    expect(result.requiredFullSheets).toBe(2);
    expect(result.materialDraft.some((l) => l.role === 'MANUAL_PHYSICAL')).toBe(
      true,
    );
    expect(
      result.materialDraft.find((l) => l.role === 'YUZAY_MDF')?.rawMaterialId,
    ).toBe('rm-1');
  });

  it('sipariş taslağı MANUAL seçimi olmadan birim fiyat yazmaz; CASH öneriyi kullanır', async () => {
    const { service } = createService();
    const draft = await service.toOrderDraft(
      {
        quote: {
          doorHeightMm: 2100,
          doorWidthMm: 900,
          quantity: 1,
          surfaceRawMaterialId: 'rm-1',
          manualCostLines: [],
          profitRate: '20',
          vatRate: '10',
          cardMarkupRate: '20',
        },
        salePriceSource: 'CASH',
        vatRate: '20',
        customerName: 'Aktarım Test',
      },
      now,
    );
    // surface 2000 × 1.2 × 1.1 = 2640
    expect(draft.upsert.lines[0].unitPrice).toBe('2640');
    expect(draft.salePriceSource).toBe('CASH');
    expect(draft.suggestedCashSale).toBe('2640');
    expect(draft.suggestedCardSale).toBe('3168');
    expect(draft.upsert.manualMaterials.every((m) => m.lineNo === 1)).toBe(true);
    expect(
      draft.upsert.manualMaterials.filter((m) => m.componentRole === 'YUZAY_MDF'),
    ).toHaveLength(1);
  });

  it('MANUAL satış kaynağı unitPrice ister', async () => {
    const { service } = createService();
    const draft = await service.toOrderDraft(
      {
        quote: {
          doorHeightMm: 2100,
          doorWidthMm: 900,
          quantity: 1,
          surfaceRawMaterialId: 'rm-1',
          manualCostLines: [],
        },
        salePriceSource: 'MANUAL',
        unitPrice: '1200',
        vatRate: '20',
        customerName: 'Aktarım Test',
      },
      now,
    );
    expect(draft.upsert.lines[0].unitPrice).toBe('1200');
  });

  it('quote nakit/kart satış kırılımı Decimal', async () => {
    const { service } = createService();
    const result = await service.quote(
      {
        doorHeightMm: 2100,
        doorWidthMm: 900,
        quantity: 1,
        surfaceRawMaterialId: 'rm-1',
        manualCostLines: [
          {
            code: 'ISKELET',
            included: true,
            amount: '8000',
            scope: 'ORDER_TOTAL',
          },
        ],
        profitRate: '20',
        vatRate: '10',
        cardMarkupRate: '20',
      },
      now,
    );
    // surface 2000 + manual 8000 = 10000 ×1
    expect(result.widthAdjustedSubtotal).toBe('10000');
    expect(result.sale.status).toBe('COMPUTED');
    expect(result.sale.profitAmount).toBe('2000');
    expect(result.sale.beforeVat).toBe('12000');
    expect(result.sale.vatAmount).toBe('1200');
    expect(result.sale.cashSale).toBe('13200');
    expect(result.sale.cardSale).toBe('15840');
  });

  it('workshop preview TASLAK ve fiyat sızdırmaz', async () => {
    const { service } = createService();
    const preview = await service.workshopPreview(
      {
        doorHeightMm: 2100,
        doorWidthMm: 900,
        quantity: 1,
        surfaceRawMaterialId: 'rm-1',
        manualCostLines: [],
      },
      now,
    );
    expect(preview.orderNumber).toBe('TASLAK');
    expect(preview.isDraft).toBe(true);
    expect(preview.html).not.toMatch(/sheetPrice|unitPrice|partialSubtotal/i);
  });

  it('210×120 quote: yüzey 3/tabaka çözülür, en x1.5', async () => {
    const { service } = createService();
    const result = await service.quote(
      {
        doorHeightMm: 2100,
        doorWidthMm: 1200,
        quantity: 3,
        surfaceRawMaterialId: 'rm-1',
        manualCostLines: [],
      },
      now,
    );
    expect(result.surfaceStatus).toBe('RESOLVED');
    expect(result.facesPerSheet).toBe(3);
    expect(result.facesPerDoor).toBe(2);
    expect(result.totalFaces).toBe(6);
    expect(result.requiredFullSheets).toBe(2);
    expect(result.unusedFaces).toBe(0);
    expect(result.unitMdfSurfaceCost).not.toBeNull();
    expect(result.widthCoefficient).toBe('1.5');
    expect(result.surfaceMessage).toBeNull();
    const surfaceDraft = result.materialDraft.find((l) => l.role === 'YUZAY_MDF');
    expect(surfaceDraft?.quantity).toBe('2');
    expect(surfaceDraft?.sheetQuantity).toBe('2');
    expect(surfaceDraft?.unverified).toBe(false);
  });
});
