import { PrismaClient } from '@prisma/client';
import { toDecimal } from '../../common/decimal/decimal.util';
import {
  AYARLI_PERVAZ_CARD_SALE_ENABLED_SEEDS,
  AYARLI_PERVAZ_CARD_SALE_UNLISTED_MEASURES,
} from './ayarli-pervaz-card-sale-enabled-seed';
import { DEKORATIF_PERVAZ_PREMIUM_SEEDS } from './dekoratif-pervaz-pricing-seed';
import { DEKORATIF_GENIS_KILCIK_PREMIUM_SEEDS } from './dekoratif-genis-kilcik-pricing-seed';

function keyOf(row: { thicknessMm: number; widthMm: number; lengthMm: number }) {
  return `${row.thicknessMm}/${row.widthMm}/${row.lengthMm}`;
}

describe('Pervaz kart fiyatlandırma master (DB seed)', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function activeProductSetting(groupCode: string, productCode: string) {
    const group = await prisma.productGroup.findUnique({ where: { code: groupCode } });
    if (!group) {
      throw new Error(`Grup yok: ${groupCode}`);
    }
    const product = await prisma.product.findUnique({
      where: {
        productGroupId_code: { productGroupId: group.id, code: productCode },
      },
    });
    if (!product) {
      throw new Error(`Ürün yok: ${productCode}`);
    }
    const setting = await prisma.pricingSetting.findFirst({
      where: { productId: product.id, productGroupId: null, isActive: true },
    });
    return { product, setting };
  }

  it('DoorFrame: cardMarkupRate=20, cardFixedSurchargeAmount=NULL', async () => {
    for (const code of ['34_MM', '30_MM'] as const) {
      const { setting } = await activeProductSetting('door_frame', code);
      expect(setting).toBeTruthy();
      expect(setting?.cardMarkupRate != null).toBe(true);
      expect(toDecimal(setting!.cardMarkupRate!.toString()).equals('20')).toBe(true);
      expect(setting?.cardFixedSurchargeAmount).toBeNull();
    }
  });

  it('AYARLI_PERVAZ: cardMarkupRate=NULL, cardFixedSurchargeAmount=2, profit korunur', async () => {
    const { setting } = await activeProductSetting('PERVAZ', 'AYARLI_PERVAZ');
    expect(setting).toBeTruthy();
    expect(setting?.cardMarkupRate).toBeNull();
    expect(setting?.cardFixedSurchargeAmount != null).toBe(true);
    expect(toDecimal(setting!.cardFixedSurchargeAmount!.toString()).equals('2')).toBe(
      true,
    );
    expect(setting?.profitRate != null).toBe(true);
    expect(toDecimal(setting!.profitRate!.toString()).equals('15')).toBe(true);
    expect(setting?.vatRate).toBeNull();
  });

  it('DEKORATIF_PERVAZ: cardMarkupRate=NULL, cardFixedSurchargeAmount=2', async () => {
    const { setting } = await activeProductSetting('PERVAZ', 'DEKORATIF_PERVAZ');
    expect(setting).toBeTruthy();
    expect(setting?.cardMarkupRate).toBeNull();
    expect(setting?.cardFixedSurchargeAmount != null).toBe(true);
    expect(toDecimal(setting!.cardFixedSurchargeAmount!.toString()).equals('2')).toBe(
      true,
    );
    expect(setting?.profitRate != null).toBe(true);
    expect(toDecimal(setting!.profitRate!.toString()).equals('15')).toBe(true);
  });

  it('DEKORATIF_PERVAZ_GENIS_KILCIK: doğrulanmış cardFixedSurchargeAmount yok', async () => {
    const { setting } = await activeProductSetting(
      'PERVAZ',
      'DEKORATIF_PERVAZ_GENIS_KILCIK',
    );
    expect(setting).toBeTruthy();
    expect(setting?.cardFixedSurchargeAmount).toBeNull();
    expect(setting?.cardMarkupRate).toBeNull();
  });

  it('Ayarlı FİYAT LİSTESİ 12 satır cardSaleEnabled=true; liste dışı 8 uydurulmaz', async () => {
    const { product } = await activeProductSetting('PERVAZ', 'AYARLI_PERVAZ');
    const rows = await prisma.pricingRowException.findMany({
      where: { productId: product.id, isActive: true, effectiveTo: null },
    });
    const enabled = new Set(
      rows.filter((row) => row.cardSaleEnabled === true).map(keyOf),
    );
    expect(enabled.size).toBe(12);
    for (const seed of AYARLI_PERVAZ_CARD_SALE_ENABLED_SEEDS) {
      expect(enabled.has(keyOf(seed))).toBe(true);
    }
    for (const unlisted of AYARLI_PERVAZ_CARD_SALE_UNLISTED_MEASURES) {
      expect(enabled.has(keyOf(unlisted))).toBe(false);
      const row = rows.find(
        (item) =>
          item.thicknessMm === unlisted.thicknessMm &&
          item.widthMm === unlisted.widthMm &&
          item.lengthMm === unlisted.lengthMm,
      );
      expect(row?.cardSaleEnabled === true).toBe(false);
    }
  });

  it('Dekoratif 6 satır product-level kart kapsamındadır; Geniş Kılçık kart dışı kalır', async () => {
    const dekoratif = await activeProductSetting('PERVAZ', 'DEKORATIF_PERVAZ');
    const genis = await activeProductSetting('PERVAZ', 'DEKORATIF_PERVAZ_GENIS_KILCIK');
    const dekRows = await prisma.pricingRowException.findMany({
      where: { productId: dekoratif.product.id, isActive: true, effectiveTo: null },
    });
    const genisRows = await prisma.pricingRowException.findMany({
      where: { productId: genis.product.id, isActive: true, effectiveTo: null },
    });
    const dekKeys = new Set(dekRows.map(keyOf));
    expect(DEKORATIF_PERVAZ_PREMIUM_SEEDS).toHaveLength(6);
    for (const seed of DEKORATIF_PERVAZ_PREMIUM_SEEDS) {
      expect(dekKeys.has(keyOf(seed))).toBe(true);
    }
    expect(dekRows.every((row) => row.cardSaleEnabled !== true)).toBe(true);
    expect(dekoratif.setting?.cardFixedSurchargeAmount != null).toBe(true);

    expect(DEKORATIF_GENIS_KILCIK_PREMIUM_SEEDS).toHaveLength(2);
    expect(genisRows.every((row) => row.cardSaleEnabled !== true)).toBe(true);
    expect(genis.setting?.cardFixedSurchargeAmount).toBeNull();
  });
});
