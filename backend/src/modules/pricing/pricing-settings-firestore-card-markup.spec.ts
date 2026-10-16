import { BadRequestException, NotFoundException } from '@nestjs/common';
import { applyPercentCardSale } from '../../calculation-engine/pricing/percent-card-sale';
import { applyPervazPercentCardSale } from '../../calculation-engine/calculators/pervaz-card-sale';
import { MemoryDocumentStore } from '../../data-store/memory.document-store';
import { FIRESTORE_COLLECTIONS } from '../../firebase/firestore.collections';
import { transformDecimalString } from './pricing-setting.validation';
import { PricingSettingsService } from './pricing-settings.service';

describe('Firestore group cardMarkupRate yazımı', () => {
  async function seed() {
    const store = new MemoryDocumentStore();
    const pervazId = store.createId();
    const citaId = store.createId();
    const supuId = store.createId();
    const doorId = store.createId();
    const genericId = store.createId();
    const supuSettingId = store.createId();
    const doorProductId = store.createId();
    const doorSettingId = store.createId();

    await store.upsert(FIRESTORE_COLLECTIONS.productGroups, pervazId, {
      id: pervazId,
      code: 'PERVAZ',
      name: 'Pervaz',
      isActive: true,
    });
    await store.upsert(FIRESTORE_COLLECTIONS.productGroups, citaId, {
      id: citaId,
      code: 'CITA',
      name: 'Çıta',
      isActive: true,
    });
    await store.upsert(FIRESTORE_COLLECTIONS.productGroups, supuId, {
      id: supuId,
      code: 'SUPURGELIK',
      name: 'Süpürgelik',
      isActive: true,
    });
    await store.upsert(FIRESTORE_COLLECTIONS.productGroups, doorId, {
      id: doorId,
      code: 'door_frame',
      name: 'Kapı Kasası',
      isActive: true,
    });
    await store.upsert(FIRESTORE_COLLECTIONS.productGroups, genericId, {
      id: genericId,
      code: 'FS_GENERIC_CARD',
      name: 'Generic Kart Test',
      isActive: true,
    });
    await store.upsert(FIRESTORE_COLLECTIONS.pricingSettings, supuSettingId, {
      id: supuSettingId,
      productGroupId: supuId,
      productId: null,
      profitRate: '20.0000',
      vatRate: null,
      cardMarkupRate: '5.0000',
      cardFixedSurchargeAmount: null,
      isActive: true,
    });
    await store.upsert(FIRESTORE_COLLECTIONS.products, doorProductId, {
      id: doorProductId,
      productGroupId: doorId,
      code: '34_MM',
      name: '34 MM MDF Kasa',
      isActive: true,
    });
    await store.upsert(FIRESTORE_COLLECTIONS.pricingSettings, doorSettingId, {
      id: doorSettingId,
      productGroupId: null,
      productId: doorProductId,
      vatRate: '10.0000',
      profitRate: '20.0000',
      cardMarkupRate: '20.0000',
      cardFixedSurchargeAmount: null,
      isActive: true,
    });

    const service = new PricingSettingsService(
      { $transaction: jest.fn().mockRejectedValue(new Error('prisma-should-not-run')) } as never,
      { record: jest.fn() } as never,
      { isFirestore: () => true } as never,
      store as never,
    );

    return { store, service, pervazId, citaId, supuId, genericId, supuSettingId };
  }

  it('transformDecimalString number/"20"/"20,5" normalize eder', () => {
    expect(transformDecimalString({ value: 20 })).toBe('20');
    expect(transformDecimalString({ value: '20' })).toBe('20');
    expect(transformDecimalString({ value: ' 20,5 ' })).toBe('20.5');
    expect(transformDecimalString({ value: 0 })).toBe('0');
    expect(transformDecimalString({ value: Number.NaN })).toBe('NaN');
    expect(transformDecimalString({ value: '' })).toBe('');
  });

  it('Pervaz %20 yazar, no-op ikinci kayıt audit spam yapmaz, diğer gruplar durur', async () => {
    const { store, service, pervazId, supuSettingId } = await seed();

    const created = await service.replaceGroupCardMarkupRate({
      productGroup: 'PERVAZ',
      cardMarkupRate: '20',
    });
    const same = await service.replaceGroupCardMarkupRate({
      productGroup: 'PERVAZ',
      cardMarkupRate: '20',
    });

    expect(created.cardMarkupRate).toBe('20');
    expect(same.cardMarkupRate).toBe('20');

    const settings = await store.list(FIRESTORE_COLLECTIONS.pricingSettings);
    const pervazActive = settings.filter(
      (row) => row.productGroupId === pervazId && row.isActive === true,
    );
    expect(pervazActive).toHaveLength(1);
    expect(pervazActive[0].cardMarkupRate).toBe('20.0000');
    expect(pervazActive[0].productId).toBeNull();

    const audits = await store.list(FIRESTORE_COLLECTIONS.auditEvents);
    const cardAudits = audits.filter((row) => row.fieldName === 'cardMarkupRate');
    expect(cardAudits).toHaveLength(1);
    expect(cardAudits[0].oldValue).toBeNull();
    expect(cardAudits[0].newValue).toBe('20.0000');

    const supu = await store.getById(FIRESTORE_COLLECTIONS.pricingSettings, supuSettingId);
    expect(supu?.cardMarkupRate).toBe('5.0000');
    expect(supu?.isActive).toBe(true);

    const pervazCard = applyPervazPercentCardSale({
      publishedCashPrice: '87',
      cardMarkupRate: created.cardMarkupRate,
      cardSaleAvailable: true,
    });
    expect(pervazCard.cardSalePrice).toBe('104.4');
  });

  it('Çıta %20 yalnız Çıta grubuna uygulanır; published nakit band kartı formülle üretir', async () => {
    const { store, service, citaId, pervazId } = await seed();

    const result = await service.replaceCitaGroupSetting({
      productGroup: 'CITA',
      cardMarkupRate: '20',
    });
    expect(result.cardMarkupRate).toBe('20');

    const settings = await store.list(FIRESTORE_COLLECTIONS.pricingSettings);
    expect(
      settings.filter((row) => row.productGroupId === citaId && row.isActive === true),
    ).toHaveLength(1);
    expect(
      settings.filter((row) => row.productGroupId === pervazId && row.isActive === true),
    ).toHaveLength(0);

    const cards = ['115', '145', '185', '215'].map(
      (cash) =>
        applyPercentCardSale({
          cashPrice: cash,
          cardMarkupRate: result.cardMarkupRate,
          rounding: 'none',
        }).cardSalePrice,
    );
    expect(cards).toEqual(['138', '174', '222', '258']);
  });

  it('generic grup cardMarkupRate günceller; geçersiz grup 404', async () => {
    const { store, service, genericId } = await seed();

    const result = await service.replaceGroupCardMarkupRate({
      productGroup: 'FS_GENERIC_CARD',
      cardMarkupRate: '12.5',
    });
    expect(result.cardMarkupRate).toBe('12.5');
    const settings = await store.list(FIRESTORE_COLLECTIONS.pricingSettings);
    const generic = settings.find(
      (row) => row.productGroupId === genericId && row.isActive === true,
    );
    expect(generic?.cardMarkupRate).toBe('12.5000');

    await expect(
      service.replaceGroupCardMarkupRate({
        productGroup: 'YOK_GRUP',
        cardMarkupRate: '20',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('aktif kaydı kapatıp yeni sürüm açar; duplicate aktif oluşturmaz', async () => {
    const { store, service, citaId } = await seed();
    await service.replaceGroupCardMarkupRate({
      productGroup: 'CITA',
      cardMarkupRate: '10',
    });
    await service.replaceGroupCardMarkupRate({
      productGroup: 'CITA',
      cardMarkupRate: '20',
    });

    const settings = await store.list(FIRESTORE_COLLECTIONS.pricingSettings);
    const citaRows = settings.filter((row) => row.productGroupId === citaId);
    expect(citaRows.filter((row) => row.isActive === true)).toHaveLength(1);
    expect(citaRows.filter((row) => row.isActive === false)).toHaveLength(1);
    expect(citaRows.find((row) => row.isActive === true)?.cardMarkupRate).toBe('20.0000');
  });

  it('negatif oranı Prisma/Firestore yazmadan 400 döner', async () => {
    const { service } = await seed();
    await expect(
      service.replaceGroupCardMarkupRate({
        productGroup: 'PERVAZ',
        cardMarkupRate: '-5',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
