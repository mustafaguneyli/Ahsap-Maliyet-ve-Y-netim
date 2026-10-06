import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MaterialPriceType } from '@prisma/client';
import { toDecimal } from '../../common/decimal/decimal.util';
import { calculateCitaProductionCost } from '../../calculation-engine/calculators/cita-production-calculator';
import { CitaRawMaterialPriceMissingException } from './cita-mdf.errors';
import { CitaMdfService, resolveCitaMaterialPriceType } from './cita-mdf.service';
import { CitaProductionService } from './cita-production.service';
import type { CitaNetResult } from './cita-net.service';
import { CitaListQueryDto, CitaNetQueryDto } from './dto/cita-net-query.dto';
import { OrderQuoteDto } from './dto/order-quote.dto';
import {
  attachCitaClassifiedPricing,
  attachCitaListPricing,
} from './cita-list-pricing';
import { CITA_PUBLISHED_PRICE_BAND_SEEDS } from '../pricing/cita-published-price-band-data';

const NOW = new Date('2026-09-16T12:00:00.000Z');
const MATERIAL = 'MDF-14-2100X2800-ZIMPARALI';
const CASH = '2000';
const CARD = '2500';

function netResult(widthMm: string, netQty: number, source: CitaNetResult['source']): CitaNetResult {
  return {
    productCode: 'CITA',
    thicknessMm: '14',
    widthMm,
    lengthMm: '2800',
    rawMaterial: {
      code: MATERIAL,
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
    },
    bladeAllowanceMm: 4,
    countSideMm: 2100,
    effectiveCutPitchMm: String(Number(widthMm) + 4),
    netQty,
    source,
  };
}

function priceRow(priceType: MaterialPriceType, amount: string) {
  return {
    id: `price-${priceType}`,
    priceType,
    price: { toString: () => amount },
    effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
    effectiveTo: null,
    isActive: true,
  };
}

function buildMdfService(prices: ReturnType<typeof priceRow>[]) {
  const citaNetService = {
    resolveNet: jest.fn().mockImplementation((query: { widthMm: string }) =>
      Promise.resolve(
        query.widthMm === '35'
          ? netResult('35', 53, 'CALCULATED_CUT_RULE')
          : netResult('40', 47, 'MASTER'),
      ),
    ),
  };
  const prisma = {
    rawMaterial: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'mdf-14',
        code: MATERIAL,
        isActive: true,
        thicknessMm: { toString: () => '14' },
        sheetWidthMm: 2100,
        sheetLengthMm: 2800,
        prices,
      }),
    },
  };
  return {
    service: new CitaMdfService(citaNetService as never, prisma as never),
    prisma,
  };
}

const BOTH_PRICES = [
  priceRow(MaterialPriceType.CASH, CASH),
  priceRow(MaterialPriceType.CARD_INSTALLMENT, CARD),
];

function productionService(mdf: CitaMdfService) {
  const extraCostsService = {
    listForProductGroup: jest.fn().mockResolvedValue({
      items: [
        { typeCode: 'CUTTING', amount: '250' },
        { typeCode: 'LABOR', amount: '10' },
      ],
    }),
  };
  return new CitaProductionService(mdf, extraCostsService as never);
}

const BANDS = CITA_PUBLISHED_PRICE_BAND_SEEDS.map((seed) => ({
  minWidthMm: seed.minWidthMm,
  maxWidthMm: seed.maxWidthMm,
  cashPrice: seed.cashPrice,
  cardPrice: seed.cardPrice,
  thicknessMm: [...seed.thicknessMm],
  isActive: true,
  effectiveTo: null,
}));

describe('Çıta MDF alış türü', () => {
  it('parametre yoksa CARD_INSTALLMENT kullanır', () => {
    expect(resolveCitaMaterialPriceType(undefined)).toBe('CARD_INSTALLMENT');
    expect(resolveCitaMaterialPriceType(null)).toBe('CARD_INSTALLMENT');
    expect(resolveCitaMaterialPriceType('')).toBe('CARD_INSTALLMENT');
  });

  it('geçersiz alış türünü reddeder', () => {
    expect(() => resolveCitaMaterialPriceType('NAKIT')).toThrow(BadRequestException);
  });

  it.each([
    ['40', 47, 'MASTER' as const],
    ['35', 53, 'CALCULATED_CUT_RULE' as const],
  ])(
    '14 mm / %s mm NET %s için CASH ve CARD aynı NET, kesim ve işçiliği kullanır',
    async (widthMm, netQty, source) => {
      const { service, prisma } = buildMdfService(BOTH_PRICES);
      const production = productionService(service);
      const base = { thicknessMm: '14', widthMm, lengthMm: '2800' };

      const cash = await production.getProductionCost(
        { ...base, materialPriceType: 'CASH' },
        NOW,
      );
      const card = await production.getProductionCost(base, NOW);

      expect(prisma.rawMaterial.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            prices: expect.objectContaining({
              where: expect.objectContaining({ priceType: 'CASH' }),
            }),
          }),
        }),
      );
      expect(cash.materialPriceType).toBe('CASH');
      expect(cash.sheetPrice).toEqual({ priceType: 'CASH', amount: CASH });
      expect(cash.mdfUnitCost).toBe(toDecimal(CASH).div(String(netQty)).toFixed());
      expect(card.materialPriceType).toBe('CARD_INSTALLMENT');
      expect(card.sheetPrice).toEqual({
        priceType: 'CARD_INSTALLMENT',
        amount: CARD,
      });
      expect(card.mdfUnitCost).toBe(toDecimal(CARD).div(String(netQty)).toFixed());
      expect(cash.productionYield).toEqual({ netQty, source });
      expect(card.productionYield).toEqual({ netQty, source });
      expect(cash.cuttingBatchCost).toBe('250');
      expect(card.cuttingBatchCost).toBe('250');
      expect(cash.cuttingUnitCost).toBe(card.cuttingUnitCost);
      expect(cash.cuttingUnitCost).toBe(toDecimal('250').div('250').toFixed());
      expect(cash.extraCosts).toEqual(card.extraCosts);
      expect(cash.productionCost).toBe(
        toDecimal(cash.mdfUnitCost).plus(cash.extraCostsTotal!).toFixed(),
      );
      expect(card.productionCost).toBe(
        toDecimal(card.mdfUnitCost).plus(card.extraCostsTotal!).toFixed(),
      );
      expect(cash.productionCost).not.toBe(card.productionCost);
    },
  );

  it('14/40 ve 14/35 yayın nakdi 145 kalır; kart satış alış türünden bağımsız yüzde ile gelir', async () => {
    const { service } = buildMdfService(BOTH_PRICES);
    const production = productionService(service);
    const cash40 = await production.getProductionCost(
      {
        thicknessMm: '14',
        widthMm: '40',
        lengthMm: '2800',
        materialPriceType: 'CASH',
      },
      NOW,
    );
    const card40 = await production.getProductionCost(
      { thicknessMm: '14', widthMm: '40', lengthMm: '2800' },
      NOW,
    );
    const cash35 = await production.getProductionCost(
      {
        thicknessMm: '14',
        widthMm: '35',
        lengthMm: '2800',
        materialPriceType: 'CASH',
      },
      NOW,
    );
    const card35 = await production.getProductionCost(
      { thicknessMm: '14', widthMm: '35', lengthMm: '2800' },
      NOW,
    );

    for (const row of [cash40, card40]) {
      const priced = attachCitaListPricing(row, BANDS, '20');
      expect(priced.pricing.publishedCashPrice).toBe('145');
      expect(priced.pricing.publishedCardPrice).toBe('174');
    }
    for (const row of [cash35, card35]) {
      const priced = attachCitaClassifiedPricing(row, BANDS, '20');
      expect(priced.pricing.publishedCashPrice).toBe('145');
      expect(priced.pricing.publishedCardPrice).toBe('174');
    }
  });

  it('CASH yoksa kart fiyatına düşmez', async () => {
    const { service } = buildMdfService([
      priceRow(MaterialPriceType.CARD_INSTALLMENT, CARD),
    ]);
    await expect(
      service.getMdfCost(
        {
          thicknessMm: '14',
          widthMm: '40',
          lengthMm: '2800',
          materialPriceType: 'CASH',
        },
        NOW,
      ),
    ).rejects.toMatchObject({
      errorCode: 'RAW_MATERIAL_PRICE_MISSING',
      materialPriceType: 'CASH',
      message: `Aktif MDF fiyatı bulunamadı: ${MATERIAL} / CASH`,
    });
  });

  it('CARD yoksa peşin fiyata düşmez', async () => {
    const { service } = buildMdfService([priceRow(MaterialPriceType.CASH, CASH)]);
    await expect(
      service.getMdfCost(
        { thicknessMm: '14', widthMm: '40', lengthMm: '2800' },
        NOW,
      ),
    ).rejects.toBeInstanceOf(CitaRawMaterialPriceMissingException);
    await expect(
      service.getMdfCost(
        { thicknessMm: '14', widthMm: '40', lengthMm: '2800' },
        NOW,
      ),
    ).rejects.toMatchObject({
      materialPriceType: 'CARD_INSTALLMENT',
      message: `Aktif MDF fiyatı bulunamadı: ${MATERIAL} / CARD_INSTALLMENT`,
    });
  });

  it('query DTO geçersiz materialPriceType değerini reddeder', async () => {
    const quote = await validate(
      plainToInstance(CitaNetQueryDto, {
        thicknessMm: '14',
        widthMm: '40',
        lengthMm: '2800',
        materialPriceType: 'PEŞİN',
      }),
    );
    const list = await validate(
      plainToInstance(CitaListQueryDto, { materialPriceType: 'PEŞİN' }),
    );
    const order = await validate(
      plainToInstance(OrderQuoteDto, {
        productId: '11111111-1111-4111-8111-111111111111',
        quantity: 1,
        widthMm: '40',
        lengthMm: '2800',
        materialPriceType: 'PEŞİN',
      }),
    );
    expect(quote.some((item) => item.property === 'materialPriceType')).toBe(true);
    expect(list.some((item) => item.property === 'materialPriceType')).toBe(true);
    expect(order.some((item) => item.property === 'materialPriceType')).toBe(true);
  });

  it('calculator ara yuvarlama yapmadan seçilen tutarı böler', () => {
    const result = calculateCitaProductionCost({
      mdf: {
        productCode: 'CITA',
        thicknessMm: '14',
        widthMm: '40',
        lengthMm: '2800',
        rawMaterial: {
          code: MATERIAL,
          thicknessMm: '14',
          sheetWidthMm: 2100,
          sheetLengthMm: 2800,
        },
        cut: {
          bladeAllowanceMm: 4,
          countSideMm: 2100,
          effectiveCutPitchMm: '44',
        },
        productionYield: { netQty: 47, source: 'MASTER' },
        materialPriceType: 'CASH',
        sheetPrice: { priceType: 'CASH', amount: CASH },
        mdfUnitCost: toDecimal(CASH).div('47').toFixed(),
      },
      extraCosts: [
        { code: 'CUTTING', amount: '250' },
        { code: 'LABOR', amount: '10' },
      ],
    });
    expect(result.mdfUnitCost).toBe(toDecimal('2000').div('47').toFixed());
    expect(result.cuttingUnitCost).toBe('1');
    expect(result.mdfUnitCost).not.toBe('42.55');
  });
});
