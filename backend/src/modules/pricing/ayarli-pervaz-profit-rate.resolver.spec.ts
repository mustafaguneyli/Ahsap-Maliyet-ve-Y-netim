import { NotFoundException } from '@nestjs/common';
import {
  resolveAyarliPervazAdjustment,
  resolveAyarliPervazProfitRate,
  selectCurrentEffectivePeriod,
} from './ayarli-pervaz-profit-rate.resolver';

const now = new Date('2026-09-08T12:00:00.000Z');
const from = new Date('2026-03-01T00:00:00.000Z');

const productSetting15 = {
  isActive: true,
  profitRate: { toString: () => '15' },
};

describe('selectCurrentEffectivePeriod', () => {
  it('gelecek dönemli kaydı seçmez; açık dönemi seçer', () => {
    const selected = selectCurrentEffectivePeriod(
      [
        {
          id: 'old',
          isActive: true,
          effectiveFrom: from,
          effectiveTo: new Date('2026-12-01T00:00:00.000Z'),
          profitRate: '20',
        },
        {
          id: 'future',
          isActive: true,
          effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
          effectiveTo: null,
          profitRate: '25',
        },
      ],
      now,
    );
    expect(selected?.id).toBe('old');
  });

  it('effectiveTo == now olan dönemi seçmez; isActive false kaydı yok sayar', () => {
    const selected = selectCurrentEffectivePeriod(
      [
        {
          id: 'ending-now',
          isActive: true,
          effectiveFrom: from,
          effectiveTo: now,
          profitRate: '20',
        },
        {
          id: 'inactive',
          isActive: false,
          effectiveFrom: from,
          effectiveTo: null,
          profitRate: '25',
        },
      ],
      now,
    );
    expect(selected).toBeNull();
  });
});

describe('resolveAyarliPervazProfitRate', () => {
  it('exception profitRate NULL ise product PricingSetting %15 kullanılır', () => {
    const resolved = resolveAyarliPervazProfitRate({
      now,
      rowExceptions: [
        {
          isActive: true,
          effectiveFrom: from,
          effectiveTo: null,
          profitRate: null,
        },
      ],
      productSettings: [productSetting15],
    });
    expect(resolved).toEqual({ profitRate: '15', source: 'PRODUCT_PRICING_SETTING' });
  });

  it('row exception profitRate product default’u ezer', () => {
    const resolved = resolveAyarliPervazProfitRate({
      now,
      rowExceptions: [
        {
          isActive: true,
          effectiveFrom: from,
          effectiveTo: null,
          profitRate: { toString: () => '20' },
        },
      ],
      productSettings: [productSetting15],
    });
    expect(resolved).toEqual({ profitRate: '20', source: 'ROW_EXCEPTION' });
  });

  it('product default 17 olsa da row %20 kalır; exception yoksa %17', () => {
    const setting17 = { isActive: true, profitRate: { toString: () => '17' } };
    const special = resolveAyarliPervazProfitRate({
      now,
      rowExceptions: [
        {
          isActive: true,
          effectiveFrom: from,
          effectiveTo: null,
          profitRate: { toString: () => '20' },
        },
      ],
      productSettings: [setting17],
    });
    const normal = resolveAyarliPervazProfitRate({
      now,
      rowExceptions: [],
      productSettings: [setting17],
    });
    expect(special).toEqual({ profitRate: '20', source: 'ROW_EXCEPTION' });
    expect(normal).toEqual({ profitRate: '17', source: 'PRODUCT_PRICING_SETTING' });
  });

  it('süresi bitmiş veya henüz başlamamış row exception default’u ezmez', () => {
    const expired = resolveAyarliPervazProfitRate({
      now,
      rowExceptions: [
        {
          isActive: true,
          effectiveFrom: from,
          effectiveTo: new Date('2026-06-01T00:00:00.000Z'),
          profitRate: { toString: () => '20' },
        },
      ],
      productSettings: [productSetting15],
    });
    const future = resolveAyarliPervazProfitRate({
      now,
      rowExceptions: [
        {
          isActive: true,
          effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
          effectiveTo: null,
          profitRate: { toString: () => '20' },
        },
      ],
      productSettings: [productSetting15],
    });
    expect(expired).toEqual({ profitRate: '15', source: 'PRODUCT_PRICING_SETTING' });
    expect(future).toEqual({ profitRate: '15', source: 'PRODUCT_PRICING_SETTING' });
  });

  it('hiç profitRate yoksa sessiz default yok, açık hata', () => {
    expect(() =>
      resolveAyarliPervazProfitRate({
        now,
        rowExceptions: [
          {
            isActive: true,
            effectiveFrom: from,
            effectiveTo: null,
            profitRate: null,
          },
        ],
        productSettings: [{ isActive: true, profitRate: null }],
      }),
    ).toThrow(NotFoundException);
  });
});

describe('resolveAyarliPervazAdjustment', () => {
  it('aktif exception adjustmentAmount NOT NULL → ROW_EXCEPTION', () => {
    expect(
      resolveAyarliPervazAdjustment({
        now,
        rowExceptions: [
          {
            isActive: true,
            effectiveFrom: from,
            effectiveTo: null,
            adjustmentAmount: { toString: () => '1' },
          },
        ],
      }),
    ).toEqual({ adjustmentAmount: '1', source: 'ROW_EXCEPTION' });
  });

  it('exception profitRate dolu olsa da adjustment NULL ise NONE', () => {
    expect(
      resolveAyarliPervazAdjustment({
        now,
        rowExceptions: [
          {
            isActive: true,
            effectiveFrom: from,
            effectiveTo: null,
            adjustmentAmount: null,
          },
        ],
      }),
    ).toEqual({ adjustmentAmount: null, source: 'NONE' });
  });

  it('kayıt yoksa veya dönem dışıysa NONE; sahte 0 yok', () => {
    expect(resolveAyarliPervazAdjustment({ now, rowExceptions: [] })).toEqual({
      adjustmentAmount: null,
      source: 'NONE',
    });
    expect(
      resolveAyarliPervazAdjustment({
        now,
        rowExceptions: [
          {
            isActive: true,
            effectiveFrom: from,
            effectiveTo: new Date('2026-06-01T00:00:00.000Z'),
            adjustmentAmount: { toString: () => '1' },
          },
        ],
      }),
    ).toEqual({ adjustmentAmount: null, source: 'NONE' });
  });
});
