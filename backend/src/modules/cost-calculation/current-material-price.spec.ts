import { MaterialPriceType } from '@prisma/client';
import { selectCurrentMaterialPrice } from './current-material-price';

describe('selectCurrentMaterialPrice', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');

  it('açık aktif fiyatı seçer', () => {
    const selected = selectCurrentMaterialPrice(
      [
        {
          id: 'p1',
          priceType: MaterialPriceType.CARD_INSTALLMENT,
          price: { toString: () => '4400' },
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
      ],
      MaterialPriceType.CARD_INSTALLMENT,
      now,
    );
    expect(selected?.price.toString()).toBe('4400');
  });

  it('eski kapanmış fiyat yerine yeni açık fiyatı seçer (4400→4700)', () => {
    const selected = selectCurrentMaterialPrice(
      [
        {
          id: 'old',
          priceType: MaterialPriceType.CARD_INSTALLMENT,
          price: { toString: () => '4400' },
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: new Date('2026-09-04T00:00:00.000Z'),
          isActive: true,
        },
        {
          id: 'new',
          priceType: MaterialPriceType.CARD_INSTALLMENT,
          price: { toString: () => '4700' },
          effectiveFrom: new Date('2026-09-04T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
      ],
      MaterialPriceType.CARD_INSTALLMENT,
      now,
    );
    expect(selected?.id).toBe('new');
    expect(selected?.price.toString()).toBe('4700');
  });

  it('gelecek tarihli fiyatı bugüne yansıtmaz', () => {
    const selected = selectCurrentMaterialPrice(
      [
        {
          id: 'current',
          priceType: MaterialPriceType.CARD_INSTALLMENT,
          price: { toString: () => '4400' },
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: new Date('2026-12-01T00:00:00.000Z'),
          isActive: true,
        },
        {
          id: 'future',
          priceType: MaterialPriceType.CARD_INSTALLMENT,
          price: { toString: () => '4700' },
          effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
      ],
      MaterialPriceType.CARD_INSTALLMENT,
      now,
    );
    expect(selected?.id).toBe('current');
    expect(selected?.price.toString()).toBe('4400');
  });

  it('12 mm planlanmış nakit fiyatını geçiş anından önce uygulamaz', () => {
    const prices = [
      {
        id: 'cash-1885-closed',
        priceType: MaterialPriceType.CASH,
        price: { toString: () => '1885' },
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-09-04T00:00:00.000Z'),
        isActive: true,
      },
      {
        id: 'cash-2000',
        priceType: MaterialPriceType.CASH,
        price: { toString: () => '2000' },
        effectiveFrom: new Date('2026-09-04T00:00:00.000Z'),
        effectiveTo: new Date('2026-10-04T00:00:00.000Z'),
        isActive: true,
      },
      {
        id: 'cash-1885-open',
        priceType: MaterialPriceType.CASH,
        price: { toString: () => '1885' },
        effectiveFrom: new Date('2026-10-04T00:00:00.000Z'),
        effectiveTo: null,
        isActive: true,
      },
      {
        id: 'card-2185',
        priceType: MaterialPriceType.CARD_INSTALLMENT,
        price: { toString: () => '2185' },
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        effectiveTo: null,
        isActive: true,
      },
    ];
    const before = new Date('2026-10-03T23:59:59.999Z');
    const at = new Date('2026-10-04T00:00:00.000Z');
    const after = new Date('2026-10-04T00:00:00.001Z');

    expect(
      selectCurrentMaterialPrice(prices, MaterialPriceType.CASH, before)?.id,
    ).toBe('cash-2000');
    expect(
      selectCurrentMaterialPrice(prices, MaterialPriceType.CASH, at)?.id,
    ).toBe('cash-1885-open');
    expect(
      selectCurrentMaterialPrice(prices, MaterialPriceType.CASH, after)?.id,
    ).toBe('cash-1885-open');
    for (const instant of [before, at, after]) {
      expect(
        selectCurrentMaterialPrice(
          prices,
          MaterialPriceType.CARD_INSTALLMENT,
          instant,
        )?.price.toString(),
      ).toBe('2185');
    }
  });

  it('CASH fiyatını CARD seçiminde kullanmaz', () => {
    const selected = selectCurrentMaterialPrice(
      [
        {
          id: 'cash',
          priceType: MaterialPriceType.CASH,
          price: { toString: () => '3750' },
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
      ],
      MaterialPriceType.CARD_INSTALLMENT,
      now,
    );
    expect(selected).toBeNull();
  });
});
