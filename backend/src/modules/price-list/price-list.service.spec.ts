import { CalculatorType } from '@prisma/client';
import {
  PRICE_LIST_REASON_LABELS,
  toMissingReasons,
} from './price-list-missing-reasons';
import { PriceListService } from './price-list.service';

describe('toMissingReasons', () => {
  it('kodları Türkçe display metne çevirir ve tekrarlamaz', () => {
    expect(
      toMissingReasons([
        'RAW_MATERIAL_PRICE_MISSING',
        'PRODUCTION_YIELD_MISSING',
        'RAW_MATERIAL_PRICE_MISSING',
        'Aktif MDF fiyatı bulunamadı: MDF-8 / CARD_INSTALLMENT',
      ]),
    ).toEqual([
      PRICE_LIST_REASON_LABELS.RAW_MATERIAL_PRICE_MISSING,
      PRICE_LIST_REASON_LABELS.PRODUCTION_YIELD_MISSING,
    ]);
  });
});

describe('PriceListService', () => {
  const now = new Date('2026-10-06T12:00:00.000Z');

  function build(overrides?: {
    door?: unknown;
    pervaz?: unknown;
    deko?: unknown;
    kilcik?: unknown;
    supurgelik?: unknown;
    cita?: unknown;
    generic?: unknown;
    groups?: unknown;
  }) {
    const prisma = {
      productGroup: {
        findMany: jest.fn().mockResolvedValue(
          overrides?.groups ?? [
            {
              code: 'door_frame',
              name: 'Kapı Kasası',
              calculatorType: CalculatorType.DOOR_FRAME,
              products: [
                { id: 'p34', code: '34_MM', name: '34 MM Kapı Kasası', isActive: true },
                { id: 'p30', code: '30_MM', name: '30 MM Kapı Kasası', isActive: true },
              ],
            },
            {
              code: 'PERVAZ',
              name: 'Pervaz',
              calculatorType: CalculatorType.PERVAZ,
              products: [
                { id: 'pp', code: 'AYARLI_PERVAZ', name: 'Ayarlı Pervaz', isActive: true },
                { id: 'pd', code: 'DEKORATIF_PERVAZ', name: 'Dekoratif Pervaz', isActive: true },
                {
                  id: 'pk',
                  code: 'DEKORATIF_PERVAZ_GENIS_KILCIK',
                  name: 'Dekoratif Geniş Kılçık',
                  isActive: true,
                },
              ],
            },
            {
              code: 'SUPURGELIK',
              name: 'Süpürgelik',
              calculatorType: CalculatorType.SUPURGELIK,
              products: [
                { id: 'sd', code: 'DUZ_SUPURGELIK', name: 'Düz Süpürgelik', isActive: true },
                {
                  id: 'sdek',
                  code: 'DEKORATIF_SUPURGELIK',
                  name: 'Dekoratif Süpürgelik',
                  isActive: true,
                },
                {
                  id: 'spp',
                  code: 'DUZ_PP_SARMA_SUPURGELIK',
                  name: 'Düz PP Sarma Süpürgelik',
                  isActive: true,
                },
                {
                  id: 'sdepp',
                  code: 'DEKORATIF_PP_SARMA_SUPURGELIK',
                  name: 'Dekoratif PP Sarma Süpürgelik',
                  isActive: true,
                },
              ],
            },
            {
              code: 'CITA',
              name: 'Çıta',
              calculatorType: CalculatorType.CITA,
              products: [{ id: 'pcita', code: 'CITA', name: 'Çıta', isActive: true }],
            },
            {
              code: 'GENERIC_X',
              name: 'Özel Seri',
              calculatorType: CalculatorType.GENERIC_RECIPE,
              products: [{ id: 'pg', code: 'GX', name: 'Generic', isActive: true }],
            },
            {
              code: 'KAPI_IMALATI',
              name: 'Kapı İmalatı',
              calculatorType: CalculatorType.DOOR_BUILD,
              products: [],
            },
          ],
        ),
      },
      productSize: {
        findMany: jest.fn().mockResolvedValue([
          { id: 's-10', widthMm: 100, lengthMm: 2100 },
          { id: 's-70', widthMm: 70, lengthMm: 2200 },
          { id: 's-cita-10', widthMm: 10, lengthMm: 2800 },
        ]),
      },
    };
    const costCalculationService = {
      getDoorFrameMdfCosts: jest.fn().mockImplementation((variant: string) => {
        if (overrides?.door) return Promise.resolve(overrides.door);
        if (variant === '34_MM') {
          return Promise.resolve({
            rows: [
              {
                displayName: '10×210',
                productSizeId: 's-10',
                pricing: {
                  profitRate: '20',
                  publishedCashPrice: '325',
                  publishedCardPrice: '390',
                  cashSalePrice: '325',
                  cardSalePrice: '390',
                },
              },
              {
                displayName: '12×210',
                productSizeId: 's-12',
                pricing: {
                  profitRate: '30',
                  publishedCashPrice: '380',
                  publishedCardPrice: '456',
                  cashSalePrice: '380',
                  cardSalePrice: '456',
                },
              },
            ],
          });
        }
        return Promise.resolve({
          rows: [
            {
              displayName: '10×210',
              productSizeId: 's-10-30',
              pricing: {
                profitRate: '20',
                publishedCashPrice: '310',
                publishedCardPrice: '372',
                cashSalePrice: '310',
                cardSalePrice: '372',
              },
            },
          ],
        });
      }),
      getAyarliPervazMdfCosts: jest.fn().mockResolvedValue(
        overrides?.pervaz ?? {
          rows: [
            {
              widthMm: 70,
              lengthMm: 2200,
              thicknessMm: 9,
              pricing: {
                profitRate: '15',
                publishedSalePrice: '87',
                cardSalePrice: '91.35',
                cardStatusCode: null,
                cardStatusMessage: null,
              },
            },
            {
              widthMm: 80,
              lengthMm: 2300,
              thicknessMm: 9,
              pricing: {
                profitRate: '15',
                publishedSalePrice: '118',
                cardSalePrice: null,
                cardStatusCode: 'CARD_MARKUP_RATE_MISSING',
                cardStatusMessage: 'Kart/taksit oranı tanımlı değil',
              },
            },
          ],
        },
      ),
      getDekoratifPervazCosts: jest.fn().mockResolvedValue(
        overrides?.deko ?? { rows: [] },
      ),
      getDekoratifGenisKilcikCosts: jest.fn().mockResolvedValue(
        overrides?.kilcik ?? { rows: [] },
      ),
      getSupurgelikMdfCosts: jest.fn().mockImplementation((query: { productCode: string }) => {
        if (overrides?.supurgelik) return Promise.resolve(overrides.supurgelik);
        if (query.productCode === 'DUZ_SUPURGELIK') {
          return Promise.resolve({
            rows: [
              {
                widthMm: 80,
                lengthMm: 2800,
                thicknessMm: 8,
                priceAvailable: true,
                errorCode: null,
                errorMessage: null,
                pricing: {
                  publishedCashPrice: '97',
                  publishedCardPrice: '102',
                  profitRate: '20',
                  statusCode: null,
                  cardStatusCode: null,
                  cardStatusMessage: null,
                },
              },
              {
                widthMm: 90,
                lengthMm: 2800,
                thicknessMm: 8,
                priceAvailable: false,
                errorCode: 'RAW_MATERIAL_PRICE_MISSING',
                errorMessage: 'Aktif MDF fiyatı bulunamadı: MDF-8 / CARD_INSTALLMENT',
                pricing: { publishedCashPrice: null, publishedCardPrice: null, statusCode: null },
              },
            ],
          });
        }
        if (query.productCode === 'DEKORATIF_SUPURGELIK') {
          return Promise.resolve({
            rows: [
              {
                widthMm: 80,
                lengthMm: 2800,
                thicknessMm: 8,
                priceAvailable: true,
                errorCode: 'DECORATIVE_RATE_MISSING',
                errorMessage: 'Doğrulanmış Süpürgelik dekoratif oranı bulunamadı: 8 mm',
                pricing: {
                  publishedCashPrice: null,
                  publishedCardPrice: null,
                  statusCode: 'DECORATIVE_RATE_MISSING',
                  profitRate: '20',
                },
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    };
    const citaListService = {
      listProductionCosts: jest.fn().mockResolvedValue(
        overrides?.cita ?? {
          rows: [
            {
              thicknessMm: '12',
              widthMm: '10',
              lengthMm: '2800',
              statusCode: null,
              pricing: {
                pricingAvailable: true,
                publishedCashPrice: '115',
                publishedCardPrice: null,
                profitRate: '15',
                statusCode: null,
                cardStatusCode: 'CARD_MARKUP_RATE_MISSING',
                cardStatusMessage: 'Kart/taksit oranı tanımlı değil',
              },
            },
            {
              thicknessMm: '12',
              widthMm: '20',
              lengthMm: '2800',
              statusCode: null,
              pricing: {
                pricingAvailable: false,
                publishedCashPrice: null,
                publishedCardPrice: null,
                profitRate: '15',
                statusCode: 'CITA_PUBLISHED_PRICE_MISSING',
                cardStatusCode: null,
                cardStatusMessage: null,
              },
            },
            {
              thicknessMm: '10',
              widthMm: '10',
              lengthMm: '2800',
              statusCode: 'RAW_MATERIAL_PRICE_MISSING',
              pricing: {
                pricingAvailable: false,
                publishedCashPrice: null,
                publishedCardPrice: null,
                statusCode: 'CITA_PUBLISHED_PRICE_MISSING',
              },
            },
          ],
        },
      ),
    };
    const genericRecipeService = {
      listCostRows: jest.fn().mockResolvedValue(
        overrides?.generic ?? {
          rows: [
            {
              status: 'OK',
              productId: 'pg',
              productCode: 'GX',
              productName: 'Generic',
              sizeId: 's-g',
              displayName: '10×100 cm',
              widthMm: 100,
              lengthMm: 1000,
              missingSources: [],
              pricing: {
                profitRate: '20',
                cashSalePrice: '50',
                cardSalePrice: '55',
                cardStatusCode: null,
                cardStatusMessage: null,
              },
            },
            {
              status: 'MISSING_SOURCE',
              productId: 'pg',
              productCode: 'GX',
              productName: 'Generic',
              sizeId: 's-g2',
              displayName: '12×100 cm',
              widthMm: 120,
              lengthMm: 1000,
              missingSources: [
                'MDF-X için CARD_INSTALLMENT alış fiyatı yok.',
                'MDF-X için NET (ProductionYield) zorunlu.',
              ],
              pricing: null,
            },
          ],
        },
      ),
    };
    const service = new PriceListService(
      prisma as never,
      costCalculationService as never,
      citaListService as never,
      genericRecipeService as never,
    );
    return { service, prisma, costCalculationService, citaListService };
  }

  it('fiyatı tam ürün calculator nakit/kartını olduğu gibi taşır; formül üretmez', async () => {
    const { service, costCalculationService } = build();
    const result = await service.getPriceList(now);
    const door = result.groups.find((group) => group.productGroupCode === 'door_frame')!;
    const ten = door.products[0].subsections[0].rows.find((row) =>
      row.displayName.startsWith('10×'),
    )!;
    const twelve = door.products[0].subsections[0].rows.find((row) =>
      row.displayName.startsWith('12×'),
    )!;
    expect(ten.cashSalePrice).toBe('325');
    expect(ten.cardSalePrice).toBe('390');
    expect(ten.cashStatus).toBe('CALCULATED');
    expect(twelve.cashSalePrice).toBe('380');
    expect(twelve.profitRate).toBe('30');
    expect(costCalculationService.getDoorFrameMdfCosts).toHaveBeenCalledWith(
      '34_MM',
      now,
      'CARD_INSTALLMENT',
    );
    expect(result.groups.some((group) => group.productGroupCode === 'KAPI_IMALATI')).toBe(
      false,
    );

    const pervaz = result.groups.find((g) => g.productGroupCode === 'PERVAZ')!;
    const seven = pervaz.products[0].subsections[0].rows[0];
    expect(seven.cashSalePrice).toBe('87');
    expect(seven.cardSalePrice).toBe('91.35');
    expect(seven.productSizeId).toBe('s-70');
    expect(seven.cashStatus).toBe('CALCULATED');

    const sup = result.groups.find((g) => g.productGroupCode === 'SUPURGELIK')!;
    const duz = sup.products[0].subsections[0].rows[0];
    expect(duz.cashSalePrice).toBe('97');
    expect(duz.cardSalePrice).toBe('102');

    const generic = result.groups.find((g) => g.productGroupCode === 'GENERIC_X')!;
    expect(generic.products[0].subsections[0].rows[0].cashSalePrice).toBe('50');
  });

  it('MDF fiyatı eksik → nakit ve kart MISSING_SOURCE, doğru Türkçe neden', async () => {
    const { service } = build();
    const result = await service.getPriceList(now);
    const missing = result.groups
      .find((g) => g.productGroupCode === 'SUPURGELIK')!
      .products[0].subsections[0].rows.find((row) => row.cashSalePrice == null)!;
    expect(missing.cashSalePrice).toBeNull();
    expect(missing.cardSalePrice).toBeNull();
    expect(missing.status).toBe('MISSING_SOURCE');
    expect(missing.cashMissingReasons).toEqual([
      PRICE_LIST_REASON_LABELS.RAW_MATERIAL_PRICE_MISSING,
    ]);
  });

  it('NET eksik → doğru neden', async () => {
    const { service } = build();
    const result = await service.getPriceList(now);
    const genericMissing = result.groups
      .find((g) => g.productGroupCode === 'GENERIC_X')!
      .products[0].subsections[0].rows.find((row) => row.status === 'MISSING_SOURCE')!;
    expect(genericMissing.cashMissingReasons).toEqual([
      PRICE_LIST_REASON_LABELS.RAW_MATERIAL_PRICE_MISSING,
      PRICE_LIST_REASON_LABELS.PRODUCTION_YIELD_MISSING,
    ]);
    expect(genericMissing.cardMissingReasons).toEqual(
      genericMissing.cashMissingReasons,
    );
  });

  it('kart oranı eksik → nakit korunur, kart reason', async () => {
    const { service } = build();
    const result = await service.getPriceList(now);
    const pervaz = result.groups.find((g) => g.productGroupCode === 'PERVAZ')!;
    const cardMissing = pervaz.products[0].subsections[0].rows[1];
    expect(cardMissing.cashSalePrice).toBe('118');
    expect(cardMissing.cashStatus).toBe('CALCULATED');
    expect(cardMissing.status).toBe('CALCULATED');
    expect(cardMissing.cardSalePrice).toBeNull();
    expect(cardMissing.cardStatus).toBe('MISSING_SOURCE');
    expect(cardMissing.cardMissingReasons).toEqual([
      PRICE_LIST_REASON_LABELS.CARD_MARKUP_MISSING,
    ]);

    const citaRows = result.groups
      .find((g) => g.productGroupCode === 'CITA')!
      .products[0].subsections.flatMap((section) => section.rows);
    const cashOnly = citaRows.find((row) => row.cashSalePrice === '115')!;
    expect(cashOnly.cashStatus).toBe('CALCULATED');
    expect(cashOnly.cardStatus).toBe('MISSING_SOURCE');
    expect(cashOnly.cardMissingReasons).toEqual([
      PRICE_LIST_REASON_LABELS.CARD_MARKUP_MISSING,
    ]);
  });

  it('yayınlanmış satış fiyatı eksik → doğru neden; 0 TL yazmaz', async () => {
    const { service } = build();
    const result = await service.getPriceList(now);
    const citaRows = result.groups
      .find((g) => g.productGroupCode === 'CITA')!
      .products[0].subsections.flatMap((section) => section.rows);
    const missing = citaRows.find((row) => row.displayName.startsWith('2×'))!;
    expect(missing.cashSalePrice).toBeNull();
    expect(missing.status).toBe('MISSING_SOURCE');
    expect(missing.cashMissingReasons).toEqual([
      PRICE_LIST_REASON_LABELS.PUBLISHED_PRICE_MISSING,
    ]);
  });

  it('yayın fiyatı ve MDF birlikte eksikse iki neden gösterir', async () => {
    const { service } = build();
    const result = await service.getPriceList(now);
    const cita = result.groups.find((g) => g.productGroupCode === 'CITA')!;
    const both = cita.products[0].subsections
      .flatMap((section) => section.rows)
      .find((row) => row.thicknessLabel === '10 mm')!;
    expect(both.cashSalePrice).toBeNull();
    expect(both.cashMissingReasons).toEqual([
      PRICE_LIST_REASON_LABELS.PUBLISHED_PRICE_MISSING,
      PRICE_LIST_REASON_LABELS.RAW_MATERIAL_PRICE_MISSING,
    ]);
  });

  it('iki eksik kaynak → iki neden, tekrar yok', async () => {
    const { service } = build();
    const result = await service.getPriceList(now);
    const genericMissing = result.groups
      .find((g) => g.productGroupCode === 'GENERIC_X')!
      .products[0].subsections[0].rows.find((row) => row.status === 'MISSING_SOURCE')!;
    expect(genericMissing.missingReasons).toHaveLength(2);
  });

  it('ProductPricingOverride / ölçü kârı yalnız ilgili satırın calculator fiyatını taşır', async () => {
    const { service } = build();
    const result = await service.getPriceList(now);
    const rows = result.groups.find((g) => g.productGroupCode === 'door_frame')!
      .products[0].subsections[0].rows;
    expect(rows[0].profitRate).toBe('20');
    expect(rows[0].cashSalePrice).toBe('325');
    expect(rows[1].profitRate).toBe('30');
    expect(rows[1].cashSalePrice).toBe('380');
  });

  it('calculator satış fiyatı varsa Hesaplanamıyor/MISSING_SOURCE üretmez', async () => {
    const { service } = build();
    const result = await service.getPriceList(now);
    for (const group of result.groups) {
      for (const product of group.products) {
        for (const section of product.subsections) {
          for (const row of section.rows) {
            if (row.cashSalePrice) {
              expect(row.cashStatus).toBe('CALCULATED');
              expect(row.status).toBe('CALCULATED');
              expect(row.cashMissingReasons).toEqual([]);
            }
          }
        }
      }
    }
  });
});
