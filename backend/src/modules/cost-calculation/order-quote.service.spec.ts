import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CITA_EXTRA_COST_MISSING } from '../../calculation-engine/calculators/cita-production-calculator';
import { CITA_PUBLISHED_PRICE_MISSING } from '../pricing/cita-published-price-band-data';
import { OrderQuoteService } from './order-quote.service';
import { multiplyUnitByQuantity } from './order-quote';

describe('multiplyUnitByQuantity', () => {
  it('145 × 40 = 5800 (Number kullanmaz)', () => {
    expect(multiplyUnitByQuantity('145', 40)).toBe('5800');
  });

  it('174 × 40 = 6960', () => {
    expect(multiplyUnitByQuantity('174', 40)).toBe('6960');
  });
});

describe('OrderQuoteService', () => {
  const citaProduct = {
    id: 'cita-id',
    code: 'CITA',
    name: 'Çıta',
    productGroup: { code: 'CITA', name: 'Çıta' },
  };
  const doorProduct = {
    id: 'door-id',
    code: '34_MM',
    name: '34 MM MDF Kasa',
    productGroup: { code: 'door_frame', name: 'Kapı Kasası' },
  };

  function buildService(overrides?: {
    product?: typeof citaProduct | typeof doorProduct | null;
    citaRow?: unknown;
    doorRows?: unknown[];
    pervazRows?: unknown[];
    supurgelikRows?: unknown[];
    citaError?: unknown;
    doorError?: unknown;
  }) {
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue(
          overrides && 'product' in overrides ? overrides.product : citaProduct,
        ),
      },
    };
    const costCalculationService = {
      getDoorFrameMdfCosts: overrides?.doorError
        ? jest.fn().mockRejectedValue(overrides.doorError)
        : jest.fn().mockResolvedValue({ rows: overrides?.doorRows ?? [] }),
      getAyarliPervazMdfCosts: jest
        .fn()
        .mockResolvedValue({ rows: overrides?.pervazRows ?? [] }),
      getDekoratifPervazCosts: jest.fn().mockResolvedValue({ rows: [] }),
      getDekoratifGenisKilcikCosts: jest.fn().mockResolvedValue({ rows: [] }),
      getSupurgelikMdfCosts: jest
        .fn()
        .mockResolvedValue({ rows: overrides?.supurgelikRows ?? [] }),
    };
    const citaProductionService = {
      getQuotedProductionCost: overrides?.citaError
        ? jest.fn().mockRejectedValue(overrides.citaError)
        : jest.fn().mockResolvedValue(overrides?.citaRow ?? null),
    };

    return {
      service: new OrderQuoteService(
        prisma as never,
        costCalculationService as never,
        citaProductionService as never,
      ),
      citaProductionService,
      costCalculationService,
    };
  }

  it('Çıta 14 mm 4×280 / 40 adet: birim×40, nakit 5800, kart 6960', async () => {
    const { service, citaProductionService } = buildService({
      citaRow: {
        productionCost: '67.14',
        statusCode: null,
        missingExtraCosts: [],
        pricing: {
          publishedCashPrice: '145',
          publishedCardPrice: '174',
          statusCode: null,
        },
      },
    });

    const result = await service.quote({
      productId: 'cita-id',
      quantity: 40,
      thicknessMm: '14',
      widthMm: '40',
      lengthMm: '2800',
    });

    expect(citaProductionService.getQuotedProductionCost).toHaveBeenCalledWith({
      thicknessMm: '14',
      widthMm: '40',
      lengthMm: '2800',
    });
    expect(result.unitProductionCost).toBe('67.14');
    expect(result.totalProductionCost).toBe('2685.6');
    expect(result.unitCashPrice).toBe('145');
    expect(result.totalCashPrice).toBe('5800');
    expect(result.unitCardPrice).toBe('174');
    expect(result.totalCardPrice).toBe('6960');
    expect(result.salePriceAvailable).toBe(true);
  });

  it('Çıta custom 3,5 cm mevcut calculator’a 35 mm gider', async () => {
    const { service, citaProductionService } = buildService({
      citaRow: {
        productionCost: '50.50',
        statusCode: null,
        missingExtraCosts: [],
        pricing: {
          publishedCashPrice: '145',
          publishedCardPrice: '174',
          statusCode: null,
        },
      },
    });

    const result = await service.quote({
      productId: 'cita-id',
      quantity: 40,
      thicknessMm: '14',
      widthMm: '35',
      lengthMm: '2800',
    });

    expect(citaProductionService.getQuotedProductionCost).toHaveBeenCalledWith({
      thicknessMm: '14',
      widthMm: '35',
      lengthMm: '2800',
    });
    expect(result.totalCashPrice).toBe('5800');
    expect(result.totalCardPrice).toBe('6960');
    expect(result.sizeLabel).toBe('14 mm · 3,5×280 cm');
  });

  it('satış fiyatı yoksa üretim maliyeti yine hesaplanır', async () => {
    const { service } = buildService({
      citaRow: {
        productionCost: '80.00',
        statusCode: null,
        missingExtraCosts: [],
        pricing: {
          publishedCashPrice: null,
          publishedCardPrice: null,
          statusCode: CITA_PUBLISHED_PRICE_MISSING,
        },
      },
    });

    const result = await service.quote({
      productId: 'cita-id',
      quantity: 40,
      thicknessMm: '22',
      widthMm: '40',
      lengthMm: '2800',
    });

    expect(result.productionCostAvailable).toBe(true);
    expect(result.totalProductionCost).toBe('3200');
    expect(result.salePriceAvailable).toBe(false);
    expect(result.salePriceMessage).toBe('Satış fiyatı tanımlı değil');
  });

  it('eksik kaynakta 0 TL uydurmaz', async () => {
    const { service } = buildService({
      citaRow: {
        productionCost: null,
        statusCode: CITA_EXTRA_COST_MISSING,
        missingExtraCosts: ['CUTTING', 'LABOR'],
        pricing: {
          publishedCashPrice: '145',
          publishedCardPrice: '174',
          statusCode: null,
        },
      },
    });

    const result = await service.quote({
      productId: 'cita-id',
      quantity: 40,
      thicknessMm: '14',
      widthMm: '40',
      lengthMm: '2800',
    });

    expect(result.productionCostAvailable).toBe(false);
    expect(result.unitProductionCost).toBeNull();
    expect(result.totalProductionCost).toBeNull();
    expect(result.missingMessages.join(' ')).toMatch(/Kesim/);
  });

  it('Kapı Kasası birim maliyeti × 100; 2 ile çarpmaz', async () => {
    const { service, costCalculationService } = buildService({
      product: doorProduct,
      doorRows: [
        {
          widthCm: 10,
          lengthCm: 210,
          productionCost: '655.12',
          pricing: {
            publishedCashPrice: '900',
            publishedCardPrice: '1080',
          },
        },
      ],
    });

    const result = await service.quote({
      productId: 'door-id',
      quantity: 100,
      widthMm: '100',
      lengthMm: '2100',
    });

    expect(costCalculationService.getDoorFrameMdfCosts).toHaveBeenCalledWith('34_MM');
    expect(result.unitProductionCost).toBe('655.12');
    expect(result.totalProductionCost).toBe('65512');
    expect(result.totalCashPrice).toBe('90000');
  });

  it('Pervaz seçilen ölçü × adet', async () => {
    const { service } = buildService({
      product: {
        id: 'pervaz-id',
        code: 'AYARLI_PERVAZ',
        name: 'Ayarlı Pervaz',
        productGroup: { code: 'PERVAZ', name: 'Pervaz' },
      },
      pervazRows: [
        {
          thicknessMm: 12,
          widthMm: 90,
          lengthMm: 2200,
          productionCost: '41.20',
          pricing: {
            publishedSalePrice: '55',
            cardSaleAvailable: true,
            cardSalePrice: '57',
          },
        },
      ],
    });

    const result = await service.quote({
      productId: 'pervaz-id',
      quantity: 100,
      thicknessMm: '12',
      widthMm: '90',
      lengthMm: '2200',
    });

    expect(result.totalProductionCost).toBe('4120');
    expect(result.totalCashPrice).toBe('5500');
    expect(result.totalCardPrice).toBe('5700');
  });

  it('Süpürgelik seçilen ölçü × adet', async () => {
    const { service } = buildService({
      product: {
        id: 'sup-id',
        code: 'DUZ_SUPURGELIK',
        name: 'Düz Süpürgelik',
        productGroup: { code: 'SUPURGELIK', name: 'Süpürgelik' },
      },
      supurgelikRows: [
        {
          thicknessMm: 8,
          widthMm: 80,
          lengthMm: 2800,
          productionCost: '22.50',
          errorCode: null,
          pricing: { publishedCashPrice: '35' },
        },
      ],
    });

    const result = await service.quote({
      productId: 'sup-id',
      quantity: 100,
      thicknessMm: '8',
      widthMm: '80',
      lengthMm: '2800',
    });

    expect(result.totalProductionCost).toBe('2250');
    expect(result.totalCashPrice).toBe('3500');
  });

  it('geçersiz ölçü BadRequest üretir', async () => {
    const { service } = buildService({
      product: doorProduct,
      doorRows: [],
    });

    await expect(
      service.quote({
        productId: 'door-id',
        quantity: 100,
        widthMm: '100',
        lengthMm: '2100',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('eksik Kapı Kasası kaynağını 0 yapmaz', async () => {
    const { service } = buildService({
      product: doorProduct,
      doorError: new NotFoundException(
        'Kapı Kasası için şu an geçerli ek maliyet bulunamadı: CUTTING',
      ),
    });

    const result = await service.quote({
      productId: 'door-id',
      quantity: 100,
      widthMm: '100',
      lengthMm: '2100',
    });

    expect(result.productionCostAvailable).toBe(false);
    expect(result.totalProductionCost).toBeNull();
    expect(result.missingMessages[0]).toMatch(/Kesim/);
  });
});
