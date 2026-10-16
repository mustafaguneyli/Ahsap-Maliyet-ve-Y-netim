import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { currentCatalogCache, withCatalogCache } from '../../data-store/firestore-catalog-cache';
import { DataStoreConfig } from '../../data-store/data-store.config';
import type { StoreTransaction } from '../../data-store/document-store';
import { FirestoreDocumentStore } from '../../data-store/firestore.document-store';
import { CheckConstraintError, UniqueConstraintError } from '../../data-store/store-errors';
import { FIRESTORE_COLLECTIONS } from '../../firebase/firestore.collections';
import { decimalToPrisma, toDecimal } from '../../common/decimal/decimal.util';
import { AuditService, DEFAULT_AUDIT_ACTOR } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { parseOptionalCardMarkupRate } from '../../calculation-engine/pricing/percent-card-sale';
import {
  loadCardMarkupRate,
  resolveCardMarkupRateWithProductFallback,
  resolveGroupCardMarkupRate,
} from './card-markup-rate.resolver';
import { UpdateProductPricingSettingDto } from './dto/update-product-pricing-setting.dto';
import { UpdateAyarliPervazPricingSettingDto } from './dto/update-ayarli-pervaz-pricing-setting.dto';
import { UpdateCitaPricingSettingDto } from './dto/update-cita-pricing-setting.dto';
import { UpdateSupurgelikPricingSettingDto } from './dto/update-supurgelik-pricing-setting.dto';
import { UpdateGroupCardMarkupRateDto } from './dto/update-group-card-markup-rate.dto';
import { UpdateDoorBuildPricingSettingDto } from './dto/update-door-build-pricing-setting.dto';
import { assertPricingSetting } from './pricing-setting.validation';
import {
  DOOR_BUILD_PRODUCT_GROUP_CODE,
  DOOR_BUILD_PRODUCT_GROUP_NAME,
  seedDoorBuildProductGroup,
} from '../products/door-build-product-group-seed';

const PRICING_ENTITY_TYPE = 'PricingSetting';
const DOOR_FRAME_PRODUCT_CODES = ['34_MM', '30_MM'] as const;
const PERVAZ_PRODUCT_CODES = [
  'AYARLI_PERVAZ',
  'DEKORATIF_PERVAZ',
  'DEKORATIF_PERVAZ_GENIS_KILCIK',
] as const;

export type ProductPricingSettingResponse = {
  productGroupCode: string;
  productCode: string;
  productName: string;
  settingId: string;
  vatRate: string;
  profitRate: string;
  cardMarkupRate: string | null;
  groupCardMarkupRate: string | null;
  productCardMarkupRate: string | null;
  isActive: boolean;
};

export type AyarliPervazPricingSettingResponse = {
  productGroupCode: 'PERVAZ';
  productCode: 'AYARLI_PERVAZ';
  productName: string;
  settingId: string;
  vatRate: null;
  profitRate: string;
  cardMarkupRate: string | null;
  cardFixedSurchargeAmount: string | null;
  isActive: boolean;
};

export type PervazPricingSettingResponse = Omit<
  AyarliPervazPricingSettingResponse,
  'productCode'
> & {
  productCode: (typeof PERVAZ_PRODUCT_CODES)[number];
};

export type SupurgelikPricingSettingResponse = {
  productGroupCode: 'SUPURGELIK';
  productGroupName: string;
  settingId: string;
  vatRate: string | null;
  profitRate: string;
  cardMarkupRate: string | null;
  cardFixedSurchargeAmount: string | null;
  isActive: boolean;
};

export type GroupCardMarkupRateItem = {
  productGroupCode: string;
  productGroupName: string;
  cardMarkupRate: string | null;
  /** Kapı Kasası ürün kaydındaki legacy oran. Grup oranı değildir. */
  productCardMarkupRate: string | null;
};

export type CitaPricingSettingResponse = {
  productGroupCode: 'CITA';
  productGroupName: string;
  settingId: string | null;
  cardMarkupRate: string | null;
  isActive: boolean;
};

export type DoorBuildPricingSettingResponse = {
  productGroupCode: 'KAPI_IMALATI';
  productGroupName: string;
  settingId: string | null;
  vatRate: string | null;
  profitRate: string | null;
  cardMarkupRate: string | null;
  isActive: boolean;
};

@Injectable()
export class PricingSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Optional() private readonly dataStore?: DataStoreConfig,
    @Optional() private readonly firestoreStore?: FirestoreDocumentStore,
  ) {}

  async getDoorFrameProductSetting(
    productCode: string,
  ): Promise<ProductPricingSettingResponse> {
    const normalized = productCode.trim().toUpperCase();
    this.assertDoorFrameProductCode(normalized);
    if (this.dataStore?.isFirestore() && this.firestoreStore) {
      return withCatalogCache(this.firestoreStore, () =>
        this.getDoorFrameProductSettingFromCache(normalized),
      );
    }

    const { product, setting, group } = await this.requireActiveProductSetting(normalized);
    const groupRate = await this.readStoredGroupCardRate(this.prisma, group.id);

    return {
      ...this.toResponse(product, setting, groupRate),
    };
  }

  async getSupurgelikGroupSetting(): Promise<SupurgelikPricingSettingResponse> {
    if (this.dataStore?.isFirestore() && this.firestoreStore) {
      return withCatalogCache(this.firestoreStore, () => this.getSupurgelikGroupSettingFromCache());
    }
    const { group, setting } = await this.requireSupurgelikGroupSetting();
    return this.toSupurgelikResponse(group, setting);
  }

  async getCitaGroupSetting(): Promise<CitaPricingSettingResponse> {
    if (this.dataStore?.isFirestore() && this.firestoreStore) {
      return withCatalogCache(this.firestoreStore, () => this.getCitaGroupSettingFromCache());
    }
    const group = await this.prisma.productGroup.findUnique({
      where: { code: 'CITA' },
    });
    if (!group?.isActive) {
      throw new NotFoundException('Ürün grubu bulunamadı: CITA');
    }
    const settings = await this.prisma.pricingSetting.findMany({
      where: {
        productGroupId: group.id,
        productId: null,
        isActive: true,
      },
    });
    if (settings.length > 1) {
      throw new BadRequestException(
        'CITA için birden fazla aktif group-scope PricingSetting bulundu.',
      );
    }
    const setting = settings[0] ?? null;
    return {
      productGroupCode: 'CITA',
      productGroupName: group.name,
      settingId: setting?.id ?? null,
      cardMarkupRate: setting?.cardMarkupRate?.toString() ?? null,
      isActive: setting?.isActive ?? false,
    };
  }

  async replaceCitaGroupSetting(
    dto: UpdateCitaPricingSettingDto,
  ): Promise<CitaPricingSettingResponse> {
    if (dto.productGroup !== 'CITA') {
      throw new BadRequestException('productGroup Çıta için CITA olmalıdır.');
    }
    const cardMarkupRate = this.parseNonNegativeRate(
      dto.cardMarkupRate,
      'Kart / taksit farkı',
    );
    if (this.isFirestoreMode()) {
      return this.runFirestoreWrite(async () => {
        const group = this.requireActiveGroupFromCache('CITA');
        const upserted = await this.upsertGroupCardMarkupRateOnFirestore(
          { id: String(group.id), isActive: true, code: 'CITA' },
          cardMarkupRate,
          'Çıta kart/taksit oranı güncellemesi',
        );
        return {
          productGroupCode: 'CITA' as const,
          productGroupName: String(group.name),
          settingId: upserted.settingId,
          cardMarkupRate: upserted.rate,
          isActive: true,
        };
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const group = await tx.productGroup.findUnique({
        where: { code: 'CITA' },
      });
      if (!group?.isActive) {
        throw new NotFoundException('Ürün grubu bulunamadı: CITA');
      }
      const upserted = await this.upsertGroupCardMarkupRate(
        tx,
        group,
        cardMarkupRate,
        'Çıta kart/taksit oranı güncellemesi',
      );
      return { group, rate: upserted.rate, settingId: upserted.settingId };
    });

    return {
      productGroupCode: 'CITA',
      productGroupName: result.group.name,
      settingId: result.settingId,
      cardMarkupRate: result.rate,
      isActive: true,
    };
  }

  /**
   * Aktif ürün gruplarının group-scope cardMarkupRate listesi.
   * Ürün kaydındaki legacy oran burada kaynak değildir.
   */
  async listGroupCardMarkupRates(): Promise<{ items: GroupCardMarkupRateItem[] }> {
    if (this.dataStore?.isFirestore() && this.firestoreStore) {
      return withCatalogCache(this.firestoreStore, () => this.listGroupCardMarkupRatesFromCache());
    }
    const groups = await this.prisma.productGroup.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    const items: GroupCardMarkupRateItem[] = [];
    for (const group of groups) {
      const settings = await this.prisma.pricingSetting.findMany({
        where: {
          productGroupId: group.id,
          productId: null,
          isActive: true,
        },
      });
      const cardMarkupRate = resolveGroupCardMarkupRate(settings);
      items.push({
        productGroupCode: group.code,
        productGroupName: group.name,
        cardMarkupRate,
        productCardMarkupRate:
          group.code === 'door_frame'
            ? await this.readDoorFrameProductCardRate(group.id)
            : null,
      });
    }
    return { items };
  }

  /**
   * Group-scope kart oranını versionlar. Kâr, KDV ve nakit fiyat yazılmaz.
   * Same-value no-op. Audit upsert ile aynı transaction içindedir.
   */
  async replaceGroupCardMarkupRate(
    dto: UpdateGroupCardMarkupRateDto,
  ): Promise<GroupCardMarkupRateItem> {
    const code = dto.productGroup.trim();
    const cardMarkupRate = this.parseNonNegativeRate(
      dto.cardMarkupRate,
      'Kart / taksit farkı',
    );
    if (this.isFirestoreMode()) {
      return this.runFirestoreWrite(async () =>
        this.replaceGroupCardMarkupRateOnFirestore(code, cardMarkupRate),
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const group = await tx.productGroup.findUnique({
        where: { code },
      });
      if (!group?.isActive) {
        throw new NotFoundException(`Ürün grubu bulunamadı: ${code}`);
      }
      const upserted = await this.upsertGroupCardMarkupRate(
        tx,
        group,
        cardMarkupRate,
        `${group.name} kart/taksit oranı güncellemesi`,
      );
      return {
        productGroupCode: group.code,
        productGroupName: group.name,
        cardMarkupRate: upserted.rate,
        productCardMarkupRate:
          group.code === 'door_frame'
            ? await this.readDoorFrameProductCardRate(group.id)
            : null,
      };
    });

    return result;
  }

  /**
   * SUPURGELIK group-scope profitRate sürümlemesi. Diğer mevcut alanlar korunur;
   * bu endpoint KDV veya kart kuralı icat etmez. Audit aynı transaction içindedir.
   */
  async replaceSupurgelikGroupSetting(
    dto: UpdateSupurgelikPricingSettingDto,
  ): Promise<SupurgelikPricingSettingResponse> {
    if (dto.productGroup !== 'SUPURGELIK') {
      throw new BadRequestException(
        'productGroup Süpürgelik için SUPURGELIK olmalıdır.',
      );
    }
    let profitRate;
    try {
      profitRate = toDecimal(dto.profitRate);
    } catch {
      throw new BadRequestException('Kâr oranı geçerli bir Decimal olmalıdır.');
    }
    if (!profitRate.isFinite() || profitRate.lte(0)) {
      throw new BadRequestException('Kâr oranı 0’dan büyük olmalıdır.');
    }
    const requestedCardRate =
      dto.cardMarkupRate != null && dto.cardMarkupRate !== ''
        ? this.parseNonNegativeRate(dto.cardMarkupRate, 'Kart / taksit farkı')
        : null;
    if (this.isFirestoreMode()) {
      return this.runFirestoreWrite(() =>
        this.replaceSupurgelikGroupSettingOnFirestore(profitRate, requestedCardRate),
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const group = await tx.productGroup.findUnique({
        where: { code: 'SUPURGELIK' },
      });
      if (!group?.isActive) {
        throw new NotFoundException('Ürün grubu bulunamadı: SUPURGELIK');
      }

      const active = await tx.pricingSetting.findMany({
        where: {
          productGroupId: group.id,
          productId: null,
          isActive: true,
        },
      });
      if (active.length > 1) {
        throw new BadRequestException(
          'SUPURGELIK için birden fazla aktif group-scope PricingSetting bulundu.',
        );
      }
      const current = active[0] ?? null;
      const nextCardRate =
        requestedCardRate ??
        (current?.cardMarkupRate != null
          ? toDecimal(current.cardMarkupRate.toString())
          : null);
      const profitUnchanged =
        current?.profitRate != null &&
        toDecimal(current.profitRate.toString()).equals(profitRate);
      const cardUnchanged = this.ratesEqual(
        current?.cardMarkupRate?.toString() ?? null,
        nextCardRate,
      );
      if (profitUnchanged && cardUnchanged) {
        return { group, setting: current };
      }

      assertPricingSetting({
        productGroupId: group.id,
        productId: null,
        vatRate: current?.vatRate?.toString() ?? null,
        profitRate: profitRate.toString(),
        cardMarkupRate: nextCardRate?.toString() ?? null,
        cardFixedSurchargeAmount:
          nextCardRate != null
            ? null
            : current?.cardFixedSurchargeAmount?.toString() ?? null,
        productGroupIsActive: group.isActive,
      });

      if (current) {
        await tx.pricingSetting.update({
          where: { id: current.id },
          data: { isActive: false },
        });
        await this.auditService.record(
          {
            entityType: PRICING_ENTITY_TYPE,
            entityId: current.id,
            action: 'UPDATE',
            fieldName: 'isActive',
            oldValue: 'true',
            newValue: 'false',
            reason: 'Yeni PricingSetting için eski aktif kayıt kapatıldı (SUPURGELIK)',
          },
          tx,
        );
      }

      const created = await tx.pricingSetting.create({
        data: {
          productGroupId: group.id,
          productId: null,
          vatRate: current?.vatRate ?? null,
          profitRate: decimalToPrisma(profitRate),
          cardMarkupRate:
            nextCardRate == null ? null : decimalToPrisma(nextCardRate),
          cardFixedSurchargeAmount:
            nextCardRate != null ? null : current?.cardFixedSurchargeAmount ?? null,
          isActive: true,
        },
      });
      await this.auditService.record(
        {
          entityType: PRICING_ENTITY_TYPE,
          entityId: created.id,
          action: 'CREATE',
          fieldName: cardUnchanged
            ? 'profitRate'
            : profitUnchanged
              ? 'cardMarkupRate'
              : 'profitRate,cardMarkupRate',
          oldValue: current
            ? `profit=${current.profitRate?.toString() ?? 'null'};card=${current.cardMarkupRate?.toString() ?? 'null'}`
            : null,
          newValue: `profit=${profitRate.toFixed(4)};card=${nextCardRate?.toFixed(4) ?? 'null'}`,
          reason: 'Süpürgelik group-scope fiyatlandırma güncellemesi',
        },
        tx,
      );

      return { group, setting: created };
    });

    return this.toSupurgelikResponse(result.group, result.setting);
  }

  /**
   * Product-level vat/profit versionlanır. Kart oranı group-scope’tadır.
   * Same-value no-op. Audit aynı transaction içindedir.
   */
  async replaceDoorFrameProductSetting(
    productCode: string,
    dto: UpdateProductPricingSettingDto,
  ): Promise<ProductPricingSettingResponse> {
    const normalized = productCode.trim().toUpperCase();
    this.assertDoorFrameProductCode(normalized);

    if (dto.productGroup !== 'door_frame') {
      throw new BadRequestException('productGroup şu an yalnızca door_frame olabilir.');
    }

    const vatRate = toDecimal(dto.vatRate);
    const profitRate = toDecimal(dto.profitRate);
    const requestedCardRate =
      dto.cardMarkupRate != null && dto.cardMarkupRate !== ''
        ? this.parseNonNegativeRate(dto.cardMarkupRate, 'Kredi kartı farkı')
        : null;
    if (vatRate.isNegative()) {
      throw new BadRequestException('KDV oranı negatif olamaz.');
    }
    if (profitRate.isNegative()) {
      throw new BadRequestException('Kâr oranı negatif olamaz.');
    }
    if (this.isFirestoreMode()) {
      return this.runFirestoreWrite(() =>
        this.replaceDoorFrameProductSettingOnFirestore(
          normalized,
          vatRate,
          profitRate,
          requestedCardRate,
        ),
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const group = await tx.productGroup.findUnique({
        where: { code: 'door_frame' },
      });
      if (!group || !group.isActive) {
        throw new NotFoundException('Ürün grubu bulunamadı: door_frame');
      }

      const product = await tx.product.findUnique({
        where: {
          productGroupId_code: {
            productGroupId: group.id,
            code: normalized,
          },
        },
      });
      if (!product || !product.isActive) {
        throw new NotFoundException(`Kapı Kasası ürünü bulunamadı: ${normalized}`);
      }

      const current = await tx.pricingSetting.findFirst({
        where: {
          productId: product.id,
          productGroupId: null,
          isActive: true,
        },
      });
      const groupCard = requestedCardRate
        ? await this.upsertGroupCardMarkupRate(
            tx,
            group,
            requestedCardRate,
            `Kapı Kasası kart/taksit oranı güncellemesi (${normalized})`,
            current?.cardMarkupRate?.toString() ?? null,
          )
        : { rate: null, changed: false, settingId: null };
      const storedGroupRate = await this.readStoredGroupCardRate(tx, group.id);

      const productUnchanged =
        current?.vatRate != null &&
        current.profitRate != null &&
        toDecimal(current.vatRate.toString()).equals(vatRate) &&
        toDecimal(current.profitRate.toString()).equals(profitRate);

      if (productUnchanged && !groupCard.changed) {
        return {
          product,
          setting: current,
          groupRate: storedGroupRate,
        };
      }

      if (productUnchanged || current == null) {
        if (productUnchanged) {
          return {
            product,
            setting: current,
            groupRate: storedGroupRate,
          };
        }
      }

      assertPricingSetting({
        productGroupId: null,
        productId: product.id,
        vatRate: vatRate.toString(),
        profitRate: profitRate.toString(),
        cardMarkupRate: current?.cardMarkupRate?.toString() ?? null,
        cardFixedSurchargeAmount: null,
        productIsActive: product.isActive,
      });

      if (current) {
        await tx.pricingSetting.update({
          where: { id: current.id },
          data: { isActive: false },
        });

        await this.auditService.record(
          {
            entityType: PRICING_ENTITY_TYPE,
            entityId: current.id,
            action: 'UPDATE',
            fieldName: 'isActive',
            oldValue: 'true',
            newValue: 'false',
            reason: `Yeni PricingSetting için eski aktif kayıt kapatıldı (${normalized})`,
          },
          tx,
        );
      }

      const created = await tx.pricingSetting.create({
        data: {
          productGroupId: null,
          productId: product.id,
          vatRate: decimalToPrisma(vatRate),
          profitRate: decimalToPrisma(profitRate),
          cardMarkupRate: current?.cardMarkupRate ?? null,
          cardFixedSurchargeAmount: null,
          isActive: true,
        },
      });

      await this.auditService.record(
        {
          entityType: PRICING_ENTITY_TYPE,
          entityId: created.id,
          action: 'CREATE',
          fieldName: 'vatRate,profitRate',
          oldValue: current
            ? `vat=${current.vatRate?.toString() ?? 'null'};profit=${current.profitRate?.toString() ?? 'null'}`
            : null,
          newValue: `vat=${vatRate.toFixed(4)};profit=${profitRate.toFixed(4)}`,
          reason: `Kapı Kasası fiyatlandırma güncellemesi (${normalized})`,
        },
        tx,
      );

      return { product, setting: created, groupRate: storedGroupRate };
    });

    return this.toResponse(result.product, result.setting, result.groupRate);
  }

  async getAyarliPervazProductSetting(): Promise<AyarliPervazPricingSettingResponse> {
    const { product, setting } = await this.requireAyarliPervazProductSetting();
    const groupRate = await loadCardMarkupRate(this.prisma, 'PERVAZ');
    return this.toAyarliPervazResponse(product, setting, groupRate);
  }

  async getPervazProductSetting(
    productCode: string,
  ): Promise<PervazPricingSettingResponse> {
    const normalized = productCode.trim().toUpperCase();
    this.assertPervazProductCode(normalized);
    if (this.dataStore?.isFirestore() && this.firestoreStore) {
      return withCatalogCache(this.firestoreStore, () =>
        this.getPervazProductSettingFromCache(normalized),
      );
    }
    const { product, setting } =
      await this.requirePervazProductSetting(normalized);
    const groupRate = await loadCardMarkupRate(this.prisma, 'PERVAZ');
    return this.toPervazResponse(product, setting, groupRate);
  }

  async replacePervazProductSetting(
    productCode: string,
    dto: UpdateAyarliPervazPricingSettingDto,
  ): Promise<PervazPricingSettingResponse> {
    const normalized = productCode.trim().toUpperCase();
    this.assertPervazProductCode(normalized);
    if (dto.productGroup !== 'PERVAZ') {
      throw new BadRequestException('productGroup Pervaz için PERVAZ olmalıdır.');
    }
    const profitRate = toDecimal(dto.profitRate);
    if (profitRate.isNegative()) {
      throw new BadRequestException('Kâr oranı negatif olamaz.');
    }
    const requestedCardRate =
      dto.cardMarkupRate != null && dto.cardMarkupRate !== ''
        ? this.parseNonNegativeRate(dto.cardMarkupRate, 'Kart / taksit farkı')
        : null;
    if (
      normalized === 'DEKORATIF_PERVAZ_GENIS_KILCIK' &&
      dto.cardFixedSurchargeAmount != null &&
      dto.cardFixedSurchargeAmount !== ''
    ) {
      throw new BadRequestException(
        'DEKORATIF_PERVAZ_GENIS_KILCIK için doğrulanmış kart fiyatı bulunmuyor.',
      );
    }
    if (this.isFirestoreMode()) {
      return this.runFirestoreWrite(() =>
        this.replacePervazProductSettingOnFirestore(normalized, profitRate, requestedCardRate),
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const group = await tx.productGroup.findUnique({
        where: { code: 'PERVAZ' },
      });
      if (!group?.isActive) {
        throw new NotFoundException('Ürün grubu bulunamadı: PERVAZ');
      }
      const product = await tx.product.findUnique({
        where: {
          productGroupId_code: {
            productGroupId: group.id,
            code: normalized,
          },
        },
      });
      if (!product?.isActive) {
        throw new NotFoundException(`Pervaz ürünü bulunamadı: ${normalized}`);
      }

      const groupCard =
        requestedCardRate == null
          ? {
              rate: resolveGroupCardMarkupRate(
                await tx.pricingSetting.findMany({
                  where: {
                    productGroupId: group.id,
                    productId: null,
                    isActive: true,
                  },
                }),
              ),
              changed: false,
            }
          : await this.upsertGroupCardMarkupRate(
              tx,
              group,
              requestedCardRate,
              `Pervaz kart/taksit oranı güncellemesi (${normalized})`,
            );

      const current = await tx.pricingSetting.findFirst({
        where: {
          productId: product.id,
          productGroupId: null,
          isActive: true,
        },
      });
      const preservedCardFixed = current?.cardFixedSurchargeAmount?.toString() ?? null;
      const profitUnchanged =
        current?.profitRate != null &&
        toDecimal(current.profitRate.toString()).equals(profitRate);
      if (profitUnchanged) {
        return {
          product,
          setting: current,
          groupRate: groupCard.rate,
        };
      }
      assertPricingSetting({
        productGroupId: null,
        productId: product.id,
        vatRate: null,
        profitRate: profitRate.toString(),
        cardMarkupRate: null,
        cardFixedSurchargeAmount: preservedCardFixed,
        productIsActive: product.isActive,
      });
      if (current) {
        await tx.pricingSetting.update({
          where: { id: current.id },
          data: { isActive: false },
        });
        await this.auditService.record(
          {
            entityType: PRICING_ENTITY_TYPE,
            entityId: current.id,
            action: 'UPDATE',
            fieldName: 'isActive',
            oldValue: 'true',
            newValue: 'false',
            reason: `Yeni PricingSetting için eski aktif kayıt kapatıldı (${normalized})`,
          },
          tx,
        );
      }
      const created = await tx.pricingSetting.create({
        data: {
          productGroupId: null,
          productId: product.id,
          vatRate: null,
          profitRate: decimalToPrisma(profitRate),
          cardMarkupRate: null,
          cardFixedSurchargeAmount:
            preservedCardFixed == null
              ? null
              : decimalToPrisma(toDecimal(preservedCardFixed)),
          isActive: true,
        },
      });
      await this.auditService.record(
        {
          entityType: PRICING_ENTITY_TYPE,
          entityId: created.id,
          action: 'CREATE',
          fieldName: 'profitRate',
          oldValue: current
            ? `profit=${current.profitRate?.toString() ?? 'null'}`
            : null,
          newValue: `profit=${profitRate.toFixed(4)}`,
          reason: `Pervaz fiyatlandırma güncellemesi (${normalized})`,
        },
        tx,
      );
      return { product, setting: created, groupRate: groupCard.rate };
    });

    return this.toPervazResponse(
      result.product,
      result.setting,
      result.groupRate,
    );
  }

  /**
   * Ayarlı Pervaz aktif product-level PricingSetting kaydını versioned değiştirir.
   * KDV ve cardMarkupRate NULL kalır; cardFixedSurchargeAmount DTO’da varsa güncellenir, yoksa korunur.
   */
  async replaceAyarliPervazProductSetting(
    dto: UpdateAyarliPervazPricingSettingDto,
  ): Promise<AyarliPervazPricingSettingResponse> {
    if (dto.productGroup !== 'PERVAZ') {
      throw new BadRequestException('productGroup Ayarlı Pervaz için PERVAZ olmalıdır.');
    }
    const profitRate = toDecimal(dto.profitRate);
    if (profitRate.isNegative()) {
      throw new BadRequestException('Kâr oranı negatif olamaz.');
    }
    if (this.isFirestoreMode()) {
      return this.runFirestoreWrite(() =>
        this.replaceAyarliPervazProductSettingOnFirestore(dto, profitRate),
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const group = await tx.productGroup.findUnique({
        where: { code: 'PERVAZ' },
      });
      if (!group || !group.isActive) {
        throw new NotFoundException('Ürün grubu bulunamadı: PERVAZ');
      }

      const product = await tx.product.findUnique({
        where: {
          productGroupId_code: {
            productGroupId: group.id,
            code: 'AYARLI_PERVAZ',
          },
        },
      });
      if (!product || !product.isActive) {
        throw new NotFoundException('Pervaz ürünü bulunamadı: AYARLI_PERVAZ');
      }

      const current = await tx.pricingSetting.findFirst({
        where: {
          productId: product.id,
          productGroupId: null,
          isActive: true,
        },
      });
      const preservedCardFixed = current?.cardFixedSurchargeAmount?.toString() ?? null;
      const nextCardFixed =
        dto.cardFixedSurchargeAmount != null && dto.cardFixedSurchargeAmount !== ''
          ? toDecimal(dto.cardFixedSurchargeAmount).toString()
          : preservedCardFixed;
      assertPricingSetting({
        productGroupId: null,
        productId: product.id,
        vatRate: null,
        profitRate: profitRate.toString(),
        cardMarkupRate: null,
        cardFixedSurchargeAmount: nextCardFixed,
        productIsActive: product.isActive,
      });
      if (current) {
        await tx.pricingSetting.update({
          where: { id: current.id },
          data: { isActive: false },
        });
        await this.auditService.record(
          {
            entityType: PRICING_ENTITY_TYPE,
            entityId: current.id,
            action: 'UPDATE',
            fieldName: 'isActive',
            oldValue: 'true',
            newValue: 'false',
            reason: 'Yeni PricingSetting için eski aktif kayıt kapatıldı (AYARLI_PERVAZ)',
          },
          tx,
        );
      }

      const created = await tx.pricingSetting.create({
        data: {
          productGroupId: null,
          productId: product.id,
          vatRate: null,
          profitRate: decimalToPrisma(profitRate),
          cardMarkupRate: null,
          cardFixedSurchargeAmount:
            nextCardFixed == null ? null : decimalToPrisma(toDecimal(nextCardFixed)),
          isActive: true,
        },
      });
      await this.auditService.record(
        {
          entityType: PRICING_ENTITY_TYPE,
          entityId: created.id,
          action: 'CREATE',
          fieldName:
            nextCardFixed === preservedCardFixed
              ? 'profitRate'
              : 'profitRate,cardFixedSurchargeAmount',
          oldValue: current
            ? `profit=${current.profitRate?.toString() ?? 'null'};cardFixed=${preservedCardFixed ?? 'null'}`
            : null,
          newValue: `profit=${profitRate.toFixed(4)};cardFixed=${nextCardFixed ?? 'null'}`,
          reason: 'Ayarlı Pervaz fiyatlandırma güncellemesi',
        },
        tx,
      );

      return { product, setting: created };
    });

    return this.toAyarliPervazResponse(result.product, result.setting);
  }

  private assertDoorFrameProductCode(code: string): void {
    if (!(DOOR_FRAME_PRODUCT_CODES as readonly string[]).includes(code)) {
      throw new BadRequestException(
        `productCode Kapı Kasası için geçersiz: ${code}. Beklenen: ${DOOR_FRAME_PRODUCT_CODES.join(', ')}`,
      );
    }
  }

  private assertPervazProductCode(code: string): asserts code is PervazPricingSettingResponse['productCode'] {
    if (!(PERVAZ_PRODUCT_CODES as readonly string[]).includes(code)) {
      throw new BadRequestException(
        `productCode Pervaz için geçersiz: ${code}. Beklenen: ${PERVAZ_PRODUCT_CODES.join(', ')}`,
      );
    }
  }

  private async requireSupurgelikGroupSetting() {
    const group = await this.prisma.productGroup.findUnique({
      where: { code: 'SUPURGELIK' },
    });
    if (!group?.isActive) {
      throw new NotFoundException('Ürün grubu bulunamadı: SUPURGELIK');
    }
    const settings = await this.prisma.pricingSetting.findMany({
      where: {
        productGroupId: group.id,
        productId: null,
        isActive: true,
      },
    });
    if (settings.length > 1) {
      throw new BadRequestException(
        'SUPURGELIK için birden fazla aktif group-scope PricingSetting bulundu.',
      );
    }
    const setting = settings[0];
    if (setting?.profitRate == null) {
      throw new NotFoundException(
        'SUPURGELIK için aktif group-scope profitRate bulunamadı.',
      );
    }
    return { group, setting };
  }

  private toSupurgelikResponse(
    group: { name: string },
    setting: {
      id: string;
      vatRate: { toString(): string } | null;
      profitRate: { toString(): string } | null;
      cardMarkupRate: { toString(): string } | null;
      cardFixedSurchargeAmount: { toString(): string } | null;
      isActive: boolean;
    },
  ): SupurgelikPricingSettingResponse {
    if (setting.profitRate == null) {
      throw new NotFoundException('SUPURGELIK için profitRate eksik.');
    }
    return {
      productGroupCode: 'SUPURGELIK',
      productGroupName: group.name,
      settingId: setting.id,
      vatRate: setting.vatRate?.toString() ?? null,
      profitRate: setting.profitRate.toString(),
      cardMarkupRate: setting.cardMarkupRate?.toString() ?? null,
      cardFixedSurchargeAmount:
        setting.cardFixedSurchargeAmount?.toString() ?? null,
      isActive: setting.isActive,
    };
  }

  private async requirePervazProductSetting(productCode: string) {
    const group = await this.prisma.productGroup.findUnique({
      where: { code: 'PERVAZ' },
    });
    if (!group?.isActive) {
      throw new NotFoundException('Ürün grubu bulunamadı: PERVAZ');
    }
    const product = await this.prisma.product.findUnique({
      where: {
        productGroupId_code: {
          productGroupId: group.id,
          code: productCode,
        },
      },
    });
    if (!product?.isActive) {
      throw new NotFoundException(`Pervaz ürünü bulunamadı: ${productCode}`);
    }
    const setting = await this.prisma.pricingSetting.findFirst({
      where: {
        productId: product.id,
        productGroupId: null,
        isActive: true,
      },
    });
    if (!setting?.profitRate) {
      throw new NotFoundException(
        `${productCode} için aktif product-level profitRate bulunamadı.`,
      );
    }
    return { product, setting };
  }

  private toPervazResponse(
    product: { code: string; name: string },
    setting: {
      id: string;
      profitRate: { toString(): string } | null;
      cardFixedSurchargeAmount?: { toString(): string } | null;
      isActive: boolean;
    },
    groupCardMarkupRate?: string | null,
  ): PervazPricingSettingResponse {
    this.assertPervazProductCode(product.code);
    if (setting.profitRate == null) {
      throw new NotFoundException(`${product.code} için profitRate eksik.`);
    }
    return {
      productGroupCode: 'PERVAZ',
      productCode: product.code,
      productName: product.name,
      settingId: setting.id,
      vatRate: null,
      profitRate: setting.profitRate.toString(),
      cardMarkupRate: groupCardMarkupRate ?? null,
      cardFixedSurchargeAmount: setting.cardFixedSurchargeAmount?.toString() ?? null,
      isActive: setting.isActive,
    };
  }

  private async requireActiveProductSetting(productCode: string) {
    const group = await this.prisma.productGroup.findUnique({
      where: { code: 'door_frame' },
    });
    if (!group || !group.isActive) {
      throw new NotFoundException('Ürün grubu bulunamadı: door_frame');
    }

    const product = await this.prisma.product.findUnique({
      where: {
        productGroupId_code: {
          productGroupId: group.id,
          code: productCode,
        },
      },
    });
    if (!product || !product.isActive) {
      throw new NotFoundException(`Kapı Kasası ürünü bulunamadı: ${productCode}`);
    }

    const setting = await this.prisma.pricingSetting.findFirst({
      where: {
        productId: product.id,
        productGroupId: null,
        isActive: true,
      },
    });
    if (!setting) {
      throw new NotFoundException(
        `${productCode} için aktif Product-level PricingSetting bulunamadı.`,
      );
    }
    if (setting.vatRate == null) {
      throw new NotFoundException(`${productCode} için KDV oranı (vatRate) tanımlı değil.`);
    }
    if (setting.profitRate == null) {
      throw new NotFoundException(`${productCode} için kâr oranı (profitRate) tanımlı değil.`);
    }

    return { product, setting, group };
  }

  private async requireAyarliPervazProductSetting() {
    const group = await this.prisma.productGroup.findUnique({
      where: { code: 'PERVAZ' },
    });
    if (!group || !group.isActive) {
      throw new NotFoundException('Ürün grubu bulunamadı: PERVAZ');
    }
    const product = await this.prisma.product.findUnique({
      where: {
        productGroupId_code: {
          productGroupId: group.id,
          code: 'AYARLI_PERVAZ',
        },
      },
    });
    if (!product || !product.isActive) {
      throw new NotFoundException('Pervaz ürünü bulunamadı: AYARLI_PERVAZ');
    }
    const setting = await this.prisma.pricingSetting.findFirst({
      where: {
        productId: product.id,
        productGroupId: null,
        isActive: true,
      },
    });
    if (!setting || setting.profitRate == null) {
      throw new NotFoundException(
        'AYARLI_PERVAZ için aktif product-level profitRate bulunamadı.',
      );
    }
    return { product, setting };
  }

  private toAyarliPervazResponse(
    product: { name: string },
    setting: {
      id: string;
      profitRate: { toString(): string } | null;
      cardFixedSurchargeAmount?: { toString(): string } | null;
      isActive: boolean;
    },
    groupCardMarkupRate?: string | null,
  ): AyarliPervazPricingSettingResponse {
    if (setting.profitRate == null) {
      throw new NotFoundException('AYARLI_PERVAZ için profitRate eksik.');
    }
    return {
      productGroupCode: 'PERVAZ',
      productCode: 'AYARLI_PERVAZ',
      productName: product.name,
      settingId: setting.id,
      vatRate: null,
      profitRate: setting.profitRate.toString(),
      cardMarkupRate: groupCardMarkupRate ?? null,
      cardFixedSurchargeAmount: setting.cardFixedSurchargeAmount?.toString() ?? null,
      isActive: setting.isActive,
    };
  }

  private getDoorFrameProductSettingFromCache(
    productCode: string,
  ): ProductPricingSettingResponse {
    const cache = currentCatalogCache();
    if (!cache) {
      throw new NotFoundException('Ürün grubu bulunamadı: door_frame');
    }
    const group = cache.groupByCode('door_frame');
    if (!group) {
      throw new NotFoundException('Ürün grubu bulunamadı: door_frame');
    }
    const product = cache.productByGroupAndCode(String(group.id), productCode);
    if (!product) {
      throw new NotFoundException(`Kapı Kasası ürünü bulunamadı: ${productCode}`);
    }
    const settingRows = cache.pricingSettings({
      productId: String(product.id),
      productGroupId: null,
    });
    const setting = settingRows[0];
    if (!setting) {
      throw new NotFoundException(
        `${productCode} için aktif Product-level PricingSetting bulunamadı.`,
      );
    }
    const groupRate = resolveGroupCardMarkupRate(
      cache.pricingSettings({ productGroupId: String(group.id), productId: null }).map((row) => ({
        isActive: row.isActive === true,
        productGroupId: row.productGroupId == null ? null : String(row.productGroupId),
        productId: row.productId == null ? null : String(row.productId),
        cardMarkupRate: row.cardMarkupRate == null ? null : String(row.cardMarkupRate),
      })),
    );
    return this.toResponse(
      { code: String(product.code), name: String(product.name) },
      {
        id: String(setting.id),
        vatRate: setting.vatRate == null ? null : { toString: () => String(setting.vatRate) },
        profitRate: setting.profitRate == null ? null : { toString: () => String(setting.profitRate) },
        cardMarkupRate:
          setting.cardMarkupRate == null ? null : { toString: () => String(setting.cardMarkupRate) },
        isActive: setting.isActive === true,
      },
      groupRate,
    );
  }

  private getSupurgelikGroupSettingFromCache(): SupurgelikPricingSettingResponse {
    const cache = currentCatalogCache();
    const group = cache?.groupByCode('SUPURGELIK');
    if (!group) {
      throw new NotFoundException('Ürün grubu bulunamadı: SUPURGELIK');
    }
    const settings = cache!.pricingSettings({
      productGroupId: String(group.id),
      productId: null,
    });
    if (settings.length > 1) {
      throw new BadRequestException(
        'SUPURGELIK için birden fazla aktif group-scope PricingSetting bulundu.',
      );
    }
    const setting = settings[0];
    if (setting?.profitRate == null) {
      throw new NotFoundException('SUPURGELIK için aktif group-scope profitRate bulunamadı.');
    }
    return this.toSupurgelikResponse(
      { name: String(group.name) },
      {
        id: String(setting.id),
        vatRate: setting.vatRate == null ? null : { toString: () => String(setting.vatRate) },
        profitRate: { toString: () => String(setting.profitRate) },
        cardMarkupRate:
          setting.cardMarkupRate == null ? null : { toString: () => String(setting.cardMarkupRate) },
        cardFixedSurchargeAmount:
          setting.cardFixedSurchargeAmount == null
            ? null
            : { toString: () => String(setting.cardFixedSurchargeAmount) },
        isActive: setting.isActive === true,
      },
    );
  }

  private getCitaGroupSettingFromCache(): CitaPricingSettingResponse {
    const cache = currentCatalogCache();
    const group = cache?.groupByCode('CITA');
    if (!group?.isActive) {
      throw new NotFoundException('Ürün grubu bulunamadı: CITA');
    }
    const settings = cache!.pricingSettings({
      productGroupId: String(group.id),
      productId: null,
    });
    if (settings.length > 1) {
      throw new BadRequestException(
        'CITA için birden fazla aktif group-scope PricingSetting bulundu.',
      );
    }
    const setting = settings[0] ?? null;
    return {
      productGroupCode: 'CITA',
      productGroupName: String(group.name),
      settingId: setting ? String(setting.id) : null,
      cardMarkupRate: setting?.cardMarkupRate == null ? null : String(setting.cardMarkupRate),
      isActive: setting?.isActive === true,
    };
  }

  private getPervazProductSettingFromCache(
    productCode: PervazPricingSettingResponse['productCode'],
  ): PervazPricingSettingResponse {
    const cache = currentCatalogCache();
    const group = cache?.groupByCode('PERVAZ');
    if (!group) {
      throw new NotFoundException('Ürün grubu bulunamadı: PERVAZ');
    }
    const product = cache!.productByGroupAndCode(String(group.id), productCode);
    if (!product) {
      throw new NotFoundException(`Pervaz ürünü bulunamadı: ${productCode}`);
    }
    const settings = cache!.pricingSettings({
      productId: String(product.id),
      productGroupId: null,
    });
    const setting = settings[0];
    if (!setting?.profitRate) {
      throw new NotFoundException(`${productCode} için aktif product-level profitRate bulunamadı.`);
    }
    const groupRate = resolveGroupCardMarkupRate(
      cache!.pricingSettings({ productGroupId: String(group.id), productId: null }).map((row) => ({
        isActive: row.isActive === true,
        cardMarkupRate: row.cardMarkupRate == null ? null : String(row.cardMarkupRate),
      })),
    );
    return this.toPervazResponse(
      { code: String(product.code), name: String(product.name) },
      {
        id: String(setting.id),
        profitRate: { toString: () => String(setting.profitRate) },
        cardFixedSurchargeAmount:
          setting.cardFixedSurchargeAmount == null
            ? null
            : { toString: () => String(setting.cardFixedSurchargeAmount) },
        isActive: setting.isActive === true,
      },
      groupRate,
    );
  }

  private getDoorBuildGroupSettingFromCache(): DoorBuildPricingSettingResponse {
    const cache = currentCatalogCache();
    const group = cache?.groupByCode(DOOR_BUILD_PRODUCT_GROUP_CODE);
    if (!group) {
      return {
        productGroupCode: 'KAPI_IMALATI',
        productGroupName: DOOR_BUILD_PRODUCT_GROUP_NAME,
        settingId: null,
        vatRate: null,
        profitRate: null,
        cardMarkupRate: null,
        isActive: false,
      };
    }
    const settings = cache!.pricingSettings({
      productGroupId: String(group.id),
      productId: null,
    });
    if (settings.length > 1) {
      throw new BadRequestException(
        'KAPI_IMALATI için birden fazla aktif group-scope PricingSetting bulundu.',
      );
    }
    const setting = settings[0] ?? null;
    return {
      productGroupCode: 'KAPI_IMALATI',
      productGroupName: String(group.name),
      settingId: setting ? String(setting.id) : null,
      vatRate: setting?.vatRate == null ? null : String(setting.vatRate),
      profitRate: setting?.profitRate == null ? null : String(setting.profitRate),
      cardMarkupRate: setting?.cardMarkupRate == null ? null : String(setting.cardMarkupRate),
      isActive: group.isActive === true && (setting?.isActive === true),
    };
  }

  private listGroupCardMarkupRatesFromCache(): { items: GroupCardMarkupRateItem[] } {
    const cache = currentCatalogCache();
    if (!cache) {
      return { items: [] };
    }
    const groups = cache
      .activeGroups()
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr'));
    const items: GroupCardMarkupRateItem[] = groups.map((group) => {
      const settings = cache.pricingSettings({
        productGroupId: String(group.id),
        productId: null,
      });
      const cardMarkupRate = resolveGroupCardMarkupRate(
        settings.map((row) => ({
          isActive: row.isActive === true,
          cardMarkupRate: row.cardMarkupRate == null ? null : String(row.cardMarkupRate),
        })),
      );
      let productCardMarkupRate: string | null = null;
      if (group.code === 'door_frame') {
        const products = cache.productsByGroup(String(group.id));
        for (const product of products) {
          const productSettings = cache.pricingSettings({
            productId: String(product.id),
            productGroupId: null,
          });
          productCardMarkupRate = resolveCardMarkupRateWithProductFallback([], productSettings.map((row) => ({
            isActive: row.isActive === true,
            cardMarkupRate: row.cardMarkupRate == null ? null : String(row.cardMarkupRate),
          })));
          if (productCardMarkupRate) break;
        }
      }
      return {
        productGroupCode: String(group.code),
        productGroupName: String(group.name),
        cardMarkupRate,
        productCardMarkupRate,
      };
    });
    return { items };
  }

  private toResponse(
    product: { code: string; name: string },
    setting: {
      id: string;
      vatRate: { toString(): string } | null;
      profitRate: { toString(): string } | null;
      cardMarkupRate: { toString(): string } | null;
      isActive: boolean;
    },
    groupCardMarkupRate?: string | null,
  ): ProductPricingSettingResponse {
    if (setting.vatRate == null || setting.profitRate == null) {
      throw new NotFoundException(
        `${product.code} için vatRate/profitRate eksik PricingSetting kaydı.`,
      );
    }

    return {
      productGroupCode: 'door_frame',
      productCode: product.code,
      productName: product.name,
      settingId: setting.id,
      vatRate: setting.vatRate.toString(),
      profitRate: setting.profitRate.toString(),
      cardMarkupRate:
        groupCardMarkupRate ?? setting.cardMarkupRate?.toString() ?? null,
      groupCardMarkupRate: groupCardMarkupRate ?? null,
      productCardMarkupRate: setting.cardMarkupRate?.toString() ?? null,
      isActive: setting.isActive,
    };
  }

  private async readStoredGroupCardRate(db: any, groupId: string): Promise<string | null> {
    const settings = await db.pricingSetting.findMany({
      where: {
        productGroupId: groupId,
        productId: null,
        isActive: true,
      },
    });
    return resolveGroupCardMarkupRate(
      settings as Parameters<typeof resolveGroupCardMarkupRate>[0],
    );
  }

  /** Kapı Kasası ürün kayıtlarındaki tek ortak legacy oran. Farklıysa null. */
  private async readDoorFrameProductCardRate(groupId: string): Promise<string | null> {
    const products = await this.prisma.product.findMany({
      where: { productGroupId: groupId, isActive: true },
    });
    if (products.length === 0) {
      return null;
    }
    const settings = await this.prisma.pricingSetting.findMany({
      where: {
        productId: { in: products.map((product) => product.id) },
        productGroupId: null,
        isActive: true,
      },
    });
    const rates = new Set<string>();
    for (const setting of settings) {
      const rate = parseOptionalCardMarkupRate(setting.cardMarkupRate?.toString() ?? null);
      if (rate != null) {
        rates.add(rate.toFixed());
      }
    }
    if (rates.size !== 1) {
      return null;
    }
    return [...rates][0] ?? null;
  }

  private parseNonNegativeRate(raw: unknown, label: string) {
    let normalized = raw;
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) {
        throw new BadRequestException(`${label} geçerli bir Decimal olmalıdır.`);
      }
      normalized = String(raw);
    }
    if (typeof normalized !== 'string') {
      throw new BadRequestException(`${label} geçerli bir Decimal olmalıdır.`);
    }
    let rate;
    try {
      rate = toDecimal(normalized);
    } catch {
      throw new BadRequestException(`${label} geçerli bir Decimal olmalıdır.`);
    }
    if (!rate.isFinite()) {
      throw new BadRequestException(`${label} geçerli bir Decimal olmalıdır.`);
    }
    if (rate.isNegative()) {
      throw new BadRequestException(`${label} negatif olamaz.`);
    }
    return rate;
  }

  private ratesEqual(
    existing: string | null | undefined,
    next: ReturnType<typeof toDecimal> | null,
  ): boolean {
    if (existing == null || existing === '') {
      return next == null;
    }
    if (next == null) {
      return false;
    }
    return toDecimal(existing).equals(next);
  }

  /**
   * Group-scope cardMarkupRate version'ı. Same-value no-op.
   * fallbackRate (ör. Kapı Kasası ürün kaydı) aynıysa group satırı oluşturulmaz.
   */
  private async upsertGroupCardMarkupRate(
    // Prisma transaction client; unit test mock'ları da bu imzayı sağlar.
    tx: any,
    group: { id: string; isActive: boolean; code: string },
    rate: ReturnType<typeof toDecimal>,
    reason: string,
    fallbackRate?: string | null,
  ): Promise<{ rate: string; changed: boolean; settingId: string | null }> {
    const active = await tx.pricingSetting.findMany({
      where: {
        productGroupId: group.id,
        productId: null,
        isActive: true,
      },
    });
    if (active.length > 1) {
      throw new BadRequestException(
        `${group.code} için birden fazla aktif group-scope PricingSetting bulundu.`,
      );
    }
    const current = active[0] ?? null;
    if (
      current?.cardMarkupRate != null &&
      toDecimal(current.cardMarkupRate.toString()).equals(rate)
    ) {
      return {
        rate: rate.toFixed(),
        changed: false,
        settingId: current.id,
      };
    }
    if (
      current?.cardMarkupRate == null &&
      fallbackRate != null &&
      fallbackRate !== '' &&
      toDecimal(fallbackRate).equals(rate)
    ) {
      return { rate: rate.toFixed(), changed: false, settingId: current?.id ?? null };
    }

    assertPricingSetting({
      productGroupId: group.id,
      productId: null,
      vatRate: current?.vatRate?.toString() ?? null,
      profitRate: current?.profitRate?.toString() ?? null,
      cardMarkupRate: rate.toString(),
      cardFixedSurchargeAmount: null,
      productGroupIsActive: group.isActive,
    });

    if (current) {
      await tx.pricingSetting.update({
        where: { id: current.id },
        data: { isActive: false },
      });
      await this.auditService.record(
        {
          entityType: PRICING_ENTITY_TYPE,
          entityId: current.id,
          action: 'UPDATE',
          fieldName: 'isActive',
          oldValue: 'true',
          newValue: 'false',
          reason: `Yeni PricingSetting için eski aktif kayıt kapatıldı (${group.code})`,
        },
        tx,
      );
    }

    const created = await tx.pricingSetting.create({
      data: {
        productGroupId: group.id,
        productId: null,
        vatRate: current?.vatRate ?? null,
        profitRate: current?.profitRate ?? null,
        cardMarkupRate: decimalToPrisma(rate),
        cardFixedSurchargeAmount: null,
        isActive: true,
      },
    });
    await this.auditService.record(
      {
        entityType: PRICING_ENTITY_TYPE,
        entityId: created.id,
        action: 'CREATE',
        fieldName: 'cardMarkupRate',
        oldValue: current?.cardMarkupRate?.toString() ?? fallbackRate ?? null,
        newValue: rate.toFixed(4),
        reason,
      },
      tx,
    );

    return { rate: rate.toFixed(), changed: true, settingId: created.id };
  }

  /**
   * Kapı İmalatı group-scope kâr / KDV / kart oranı.
   * Oran yoksa null döner; başka gruptan kopyalamaz.
   */
  async getDoorBuildGroupSetting(): Promise<DoorBuildPricingSettingResponse> {
    if (this.dataStore?.isFirestore() && this.firestoreStore) {
      return withCatalogCache(this.firestoreStore, () => this.getDoorBuildGroupSettingFromCache());
    }
    const group = await this.prisma.productGroup.findUnique({
      where: { code: DOOR_BUILD_PRODUCT_GROUP_CODE },
    });
    if (!group) {
      return {
        productGroupCode: 'KAPI_IMALATI',
        productGroupName: DOOR_BUILD_PRODUCT_GROUP_NAME,
        settingId: null,
        vatRate: null,
        profitRate: null,
        cardMarkupRate: null,
        isActive: false,
      };
    }
    const settings = await this.prisma.pricingSetting.findMany({
      where: {
        productGroupId: group.id,
        productId: null,
        isActive: true,
      },
    });
    if (settings.length > 1) {
      throw new BadRequestException(
        'KAPI_IMALATI için birden fazla aktif group-scope PricingSetting bulundu.',
      );
    }
    const setting = settings[0] ?? null;
    return {
      productGroupCode: 'KAPI_IMALATI',
      productGroupName: group.name,
      settingId: setting?.id ?? null,
      vatRate: setting?.vatRate?.toString() ?? null,
      profitRate: setting?.profitRate?.toString() ?? null,
      cardMarkupRate: setting?.cardMarkupRate?.toString() ?? null,
      isActive: group.isActive && (setting?.isActive ?? false),
    };
  }

  /**
   * Kapı İmalatı oran sürümlemesi. Aynı değerlerde yeni sürüm açılmaz.
   * 0 kâr / 0 KDV / 0 kart kabul. Audit aynı transaction içinde.
   */
  async replaceDoorBuildGroupSetting(
    dto: UpdateDoorBuildPricingSettingDto,
  ): Promise<DoorBuildPricingSettingResponse> {
    if (dto.productGroup !== 'KAPI_IMALATI') {
      throw new BadRequestException(
        'productGroup Kapı İmalatı için KAPI_IMALATI olmalıdır.',
      );
    }
    const profitRate = this.parseNonNegativeRate(dto.profitRate, 'Kâr oranı');
    const vatRate = this.parseNonNegativeRate(dto.vatRate, 'KDV oranı');
    const cardMarkupRate =
      dto.cardMarkupRate != null && dto.cardMarkupRate !== ''
        ? this.parseNonNegativeRate(dto.cardMarkupRate, 'Kart / taksit oranı')
        : null;
    if (this.isFirestoreMode()) {
      return this.runFirestoreWrite(() =>
        this.replaceDoorBuildGroupSettingOnFirestore(profitRate, vatRate, cardMarkupRate),
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await seedDoorBuildProductGroup(tx as never);
      const group = await tx.productGroup.findUnique({
        where: { code: DOOR_BUILD_PRODUCT_GROUP_CODE },
      });
      if (!group?.isActive) {
        throw new NotFoundException('Ürün grubu bulunamadı: KAPI_IMALATI');
      }

      const active = await tx.pricingSetting.findMany({
        where: {
          productGroupId: group.id,
          productId: null,
          isActive: true,
        },
      });
      if (active.length > 1) {
        throw new BadRequestException(
          'KAPI_IMALATI için birden fazla aktif group-scope PricingSetting bulundu.',
        );
      }
      const current = active[0] ?? null;
      const profitUnchanged = this.ratesEqual(
        current?.profitRate?.toString() ?? null,
        profitRate,
      );
      const vatUnchanged = this.ratesEqual(
        current?.vatRate?.toString() ?? null,
        vatRate,
      );
      const cardUnchanged = this.ratesEqual(
        current?.cardMarkupRate?.toString() ?? null,
        cardMarkupRate,
      );
      if (profitUnchanged && vatUnchanged && cardUnchanged && current) {
        return { group, setting: current };
      }

      assertPricingSetting({
        productGroupId: group.id,
        productId: null,
        vatRate: vatRate.toString(),
        profitRate: profitRate.toString(),
        cardMarkupRate: cardMarkupRate?.toString() ?? null,
        cardFixedSurchargeAmount: null,
        productGroupIsActive: group.isActive,
      });

      if (current) {
        await tx.pricingSetting.update({
          where: { id: current.id },
          data: { isActive: false },
        });
        await this.auditService.record(
          {
            entityType: PRICING_ENTITY_TYPE,
            entityId: current.id,
            action: 'UPDATE',
            fieldName: 'isActive',
            oldValue: 'true',
            newValue: 'false',
            reason:
              'Yeni PricingSetting için eski aktif kayıt kapatıldı (KAPI_IMALATI)',
          },
          tx,
        );
      }

      const created = await tx.pricingSetting.create({
        data: {
          productGroupId: group.id,
          productId: null,
          vatRate: decimalToPrisma(vatRate),
          profitRate: decimalToPrisma(profitRate),
          cardMarkupRate:
            cardMarkupRate != null ? decimalToPrisma(cardMarkupRate) : null,
          cardFixedSurchargeAmount: null,
          isActive: true,
        },
      });
      await this.auditService.record(
        {
          entityType: PRICING_ENTITY_TYPE,
          entityId: created.id,
          action: 'CREATE',
          fieldName: 'profitRate,vatRate,cardMarkupRate',
          oldValue: current
            ? `profit=${current.profitRate?.toString() ?? 'null'};vat=${current.vatRate?.toString() ?? 'null'};card=${current.cardMarkupRate?.toString() ?? 'null'}`
            : null,
          newValue: `profit=${profitRate.toFixed()};vat=${vatRate.toFixed()};card=${cardMarkupRate?.toFixed() ?? 'null'}`,
          reason: 'Kapı İmalatı group-scope PricingSetting oluşturuldu',
        },
        tx,
      );
      return { group, setting: created };
    });

    return {
      productGroupCode: 'KAPI_IMALATI',
      productGroupName: result.group.name,
      settingId: result.setting!.id,
      vatRate: result.setting!.vatRate?.toString() ?? null,
      profitRate: result.setting!.profitRate?.toString() ?? null,
      cardMarkupRate: result.setting!.cardMarkupRate?.toString() ?? null,
      isActive: true,
    };
  }

  private isFirestoreMode(): boolean {
    return Boolean(this.dataStore?.isFirestore() && this.firestoreStore);
  }

  private rethrowStore(error: unknown): never {
    if (error instanceof UniqueConstraintError) {
      throw new ConflictException(error.message);
    }
    if (error instanceof CheckConstraintError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }

  private async runFirestoreWrite<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await withCatalogCache(this.firestoreStore, fn);
    } catch (error) {
      this.rethrowStore(error);
    }
  }

  private requireActiveGroupFromCache(code: string): Record<string, unknown> {
    const cache = currentCatalogCache();
    const group = cache?.groupByCode(code);
    if (!group || group.isActive !== true) {
      throw new NotFoundException(`Ürün grubu bulunamadı: ${code}`);
    }
    return group;
  }

  private moneyText(value: unknown): string | null {
    if (value == null || value === '') {
      return null;
    }
    return String(value);
  }

  private uniqueActiveGroupSettings(groupId: string, code: string): Record<string, unknown>[] {
    const cache = currentCatalogCache();
    const rows = cache?.pricingSettings({ productGroupId: groupId, productId: null }) ?? [];
    if (rows.length > 1) {
      throw new BadRequestException(
        `${code} için birden fazla aktif group-scope PricingSetting bulundu.`,
      );
    }
    return rows;
  }

  private groupCardRateFromCache(groupId: string): string | null {
    return resolveGroupCardMarkupRate(
      this.uniqueActiveGroupSettings(groupId, groupId).map((row) => ({
        isActive: row.isActive === true,
        cardMarkupRate: this.moneyText(row.cardMarkupRate),
      })),
    );
  }

  private doorFrameProductCardRateFromCache(groupId: string): string | null {
    const cache = currentCatalogCache();
    if (!cache) {
      return null;
    }
    const products = cache.productsByGroup(groupId);
    const rates = new Set<string>();
    for (const product of products) {
      const settings = cache.pricingSettings({
        productId: String(product.id),
        productGroupId: null,
      });
      for (const setting of settings) {
        const rate = parseOptionalCardMarkupRate(this.moneyText(setting.cardMarkupRate));
        if (rate != null) {
          rates.add(rate.toFixed());
        }
      }
    }
    if (rates.size !== 1) {
      return null;
    }
    return [...rates][0] ?? null;
  }

  private async writePricingAudit(
    tx: StoreTransaction,
    input: {
      entityId: string;
      action: 'CREATE' | 'UPDATE';
      fieldName: string;
      oldValue: string | null;
      newValue: string | null;
      reason: string;
    },
  ): Promise<void> {
    const store = this.firestoreStore!;
    const auditId = store.createId();
    await tx.upsert(FIRESTORE_COLLECTIONS.auditEvents, auditId, {
      id: auditId,
      entityType: PRICING_ENTITY_TYPE,
      entityId: input.entityId,
      action: input.action,
      fieldName: input.fieldName,
      oldValue: input.oldValue,
      newValue: input.newValue,
      reason: input.reason,
      actor: DEFAULT_AUDIT_ACTOR,
    });
  }

  private async replaceGroupCardMarkupRateOnFirestore(
    code: string,
    cardMarkupRate: ReturnType<typeof toDecimal>,
  ): Promise<GroupCardMarkupRateItem> {
    const group = this.requireActiveGroupFromCache(code);
    const upserted = await this.upsertGroupCardMarkupRateOnFirestore(
      { id: String(group.id), isActive: true, code },
      cardMarkupRate,
      `${String(group.name)} kart/taksit oranı güncellemesi`,
    );
    return {
      productGroupCode: String(group.code),
      productGroupName: String(group.name),
      cardMarkupRate: upserted.rate,
      productCardMarkupRate:
        code === 'door_frame' ? this.doorFrameProductCardRateFromCache(String(group.id)) : null,
    };
  }

  private async upsertGroupCardMarkupRateOnFirestore(
    group: { id: string; isActive: boolean; code: string },
    rate: ReturnType<typeof toDecimal>,
    reason: string,
    fallbackRate?: string | null,
    tx?: StoreTransaction,
  ): Promise<{ rate: string; changed: boolean; settingId: string | null }> {
    const active = this.uniqueActiveGroupSettings(group.id, group.code);
    const current = active[0] ?? null;
    const currentRate = this.moneyText(current?.cardMarkupRate);
    if (currentRate != null && toDecimal(currentRate).equals(rate)) {
      return { rate: rate.toFixed(), changed: false, settingId: String(current!.id) };
    }
    if (
      currentRate == null &&
      fallbackRate != null &&
      fallbackRate !== '' &&
      toDecimal(fallbackRate).equals(rate)
    ) {
      return { rate: rate.toFixed(), changed: false, settingId: current ? String(current.id) : null };
    }

    assertPricingSetting({
      productGroupId: group.id,
      productId: null,
      vatRate: this.moneyText(current?.vatRate),
      profitRate: this.moneyText(current?.profitRate),
      cardMarkupRate: rate.toString(),
      cardFixedSurchargeAmount: null,
      productGroupIsActive: group.isActive,
    });

    const write = async (inner: StoreTransaction) => {
      const store = this.firestoreStore!;
      if (current) {
        await inner.upsert(FIRESTORE_COLLECTIONS.pricingSettings, String(current.id), {
          ...current,
          isActive: false,
        });
        await this.writePricingAudit(inner, {
          entityId: String(current.id),
          action: 'UPDATE',
          fieldName: 'isActive',
          oldValue: 'true',
          newValue: 'false',
          reason: `Yeni PricingSetting için eski aktif kayıt kapatıldı (${group.code})`,
        });
      }
      const createdId = store.createId();
      await inner.upsert(FIRESTORE_COLLECTIONS.pricingSettings, createdId, {
        id: createdId,
        productGroupId: group.id,
        productId: null,
        vatRate: current?.vatRate ?? null,
        profitRate: current?.profitRate ?? null,
        cardMarkupRate: rate.toFixed(4),
        cardFixedSurchargeAmount: null,
        isActive: true,
      });
      await this.writePricingAudit(inner, {
        entityId: createdId,
        action: 'CREATE',
        fieldName: 'cardMarkupRate',
        oldValue: currentRate ?? fallbackRate ?? null,
        newValue: rate.toFixed(4),
        reason,
      });
      return { rate: rate.toFixed(), changed: true, settingId: createdId };
    };

    if (tx) {
      return write(tx);
    }
    return this.firestoreStore!.runTransaction(write);
  }

  private async deactivatePricingSettingOnFirestore(
    tx: StoreTransaction,
    current: Record<string, unknown>,
    reason: string,
  ): Promise<void> {
    await tx.upsert(FIRESTORE_COLLECTIONS.pricingSettings, String(current.id), {
      ...current,
      isActive: false,
    });
    await this.writePricingAudit(tx, {
      entityId: String(current.id),
      action: 'UPDATE',
      fieldName: 'isActive',
      oldValue: 'true',
      newValue: 'false',
      reason,
    });
  }

  private async replaceSupurgelikGroupSettingOnFirestore(
    profitRate: ReturnType<typeof toDecimal>,
    requestedCardRate: ReturnType<typeof toDecimal> | null,
  ): Promise<SupurgelikPricingSettingResponse> {
    const group = this.requireActiveGroupFromCache('SUPURGELIK');
    const current = this.uniqueActiveGroupSettings(String(group.id), 'SUPURGELIK')[0] ?? null;
    const nextCardRate =
      requestedCardRate ??
      (this.moneyText(current?.cardMarkupRate) != null
        ? toDecimal(this.moneyText(current?.cardMarkupRate)!)
        : null);
    const profitUnchanged =
      this.moneyText(current?.profitRate) != null &&
      toDecimal(this.moneyText(current?.profitRate)!).equals(profitRate);
    const cardUnchanged = this.ratesEqual(this.moneyText(current?.cardMarkupRate), nextCardRate);
    if (profitUnchanged && cardUnchanged && current) {
      return this.toSupurgelikResponse(
        { name: String(group.name) },
        {
          id: String(current.id),
          vatRate: this.asRateBox(current.vatRate),
          profitRate: this.asRateBox(current.profitRate),
          cardMarkupRate: this.asRateBox(current.cardMarkupRate),
          cardFixedSurchargeAmount: this.asRateBox(current.cardFixedSurchargeAmount),
          isActive: true,
        },
      );
    }

    assertPricingSetting({
      productGroupId: String(group.id),
      productId: null,
      vatRate: this.moneyText(current?.vatRate),
      profitRate: profitRate.toString(),
      cardMarkupRate: nextCardRate?.toString() ?? null,
      cardFixedSurchargeAmount:
        nextCardRate != null ? null : this.moneyText(current?.cardFixedSurchargeAmount),
      productGroupIsActive: true,
    });

    const createdId = await this.firestoreStore!.runTransaction(async (tx) => {
      if (current) {
        await this.deactivatePricingSettingOnFirestore(
          tx,
          current,
          'Yeni PricingSetting için eski aktif kayıt kapatıldı (SUPURGELIK)',
        );
      }
      const id = this.firestoreStore!.createId();
      await tx.upsert(FIRESTORE_COLLECTIONS.pricingSettings, id, {
        id,
        productGroupId: String(group.id),
        productId: null,
        vatRate: current?.vatRate ?? null,
        profitRate: profitRate.toFixed(4),
        cardMarkupRate: nextCardRate == null ? null : nextCardRate.toFixed(4),
        cardFixedSurchargeAmount:
          nextCardRate != null ? null : (current?.cardFixedSurchargeAmount ?? null),
        isActive: true,
      });
      await this.writePricingAudit(tx, {
        entityId: id,
        action: 'CREATE',
        fieldName: cardUnchanged
          ? 'profitRate'
          : profitUnchanged
            ? 'cardMarkupRate'
            : 'profitRate,cardMarkupRate',
        oldValue: current
          ? `profit=${this.moneyText(current.profitRate) ?? 'null'};card=${this.moneyText(current.cardMarkupRate) ?? 'null'}`
          : null,
        newValue: `profit=${profitRate.toFixed(4)};card=${nextCardRate?.toFixed(4) ?? 'null'}`,
        reason: 'Süpürgelik group-scope fiyatlandırma güncellemesi',
      });
      return id;
    });

    return this.toSupurgelikResponse(
      { name: String(group.name) },
      {
        id: createdId,
        vatRate: this.asRateBox(current?.vatRate),
        profitRate: { toString: () => profitRate.toString() },
        cardMarkupRate: nextCardRate == null ? null : { toString: () => nextCardRate.toString() },
        cardFixedSurchargeAmount:
          nextCardRate != null ? null : this.asRateBox(current?.cardFixedSurchargeAmount),
        isActive: true,
      },
    );
  }

  private async replaceDoorFrameProductSettingOnFirestore(
    productCode: string,
    vatRate: ReturnType<typeof toDecimal>,
    profitRate: ReturnType<typeof toDecimal>,
    requestedCardRate: ReturnType<typeof toDecimal> | null,
  ): Promise<ProductPricingSettingResponse> {
    const cache = currentCatalogCache();
    const group = this.requireActiveGroupFromCache('door_frame');
    const product = cache?.productByGroupAndCode(String(group.id), productCode);
    if (!product || product.isActive !== true) {
      throw new NotFoundException(`Kapı Kasası ürünü bulunamadı: ${productCode}`);
    }
    const current =
      cache?.pricingSettings({ productId: String(product.id), productGroupId: null })[0] ?? null;
    const store = this.firestoreStore!;

    const result = await store.runTransaction(async (tx) => {
      const groupCard = requestedCardRate
        ? await this.upsertGroupCardMarkupRateOnFirestore(
            { id: String(group.id), isActive: true, code: 'door_frame' },
            requestedCardRate,
            `Kapı Kasası kart/taksit oranı güncellemesi (${productCode})`,
            this.moneyText(current?.cardMarkupRate),
            tx,
          )
        : { rate: this.groupCardRateFromCache(String(group.id)), changed: false, settingId: null };
      const storedGroupRate = requestedCardRate ? groupCard.rate : groupCard.rate;
      const productUnchanged =
        this.moneyText(current?.vatRate) != null &&
        this.moneyText(current?.profitRate) != null &&
        toDecimal(this.moneyText(current?.vatRate)!).equals(vatRate) &&
        toDecimal(this.moneyText(current?.profitRate)!).equals(profitRate);
      if (productUnchanged && current && !groupCard.changed) {
        return { setting: current, groupRate: storedGroupRate };
      }
      if (productUnchanged && current) {
        return { setting: current, groupRate: storedGroupRate };
      }

      assertPricingSetting({
        productGroupId: null,
        productId: String(product.id),
        vatRate: vatRate.toString(),
        profitRate: profitRate.toString(),
        cardMarkupRate: this.moneyText(current?.cardMarkupRate),
        cardFixedSurchargeAmount: null,
        productIsActive: true,
      });

      if (current) {
        await this.deactivatePricingSettingOnFirestore(
          tx,
          current,
          `Yeni PricingSetting için eski aktif kayıt kapatıldı (${productCode})`,
        );
      }
      const createdId = store.createId();
      const created = {
        id: createdId,
        productGroupId: null,
        productId: String(product.id),
        vatRate: vatRate.toFixed(4),
        profitRate: profitRate.toFixed(4),
        cardMarkupRate: current?.cardMarkupRate ?? null,
        cardFixedSurchargeAmount: null,
        isActive: true,
      };
      await tx.upsert(FIRESTORE_COLLECTIONS.pricingSettings, createdId, created);
      await this.writePricingAudit(tx, {
        entityId: createdId,
        action: 'CREATE',
        fieldName: 'vatRate,profitRate',
        oldValue: current
          ? `vat=${this.moneyText(current.vatRate) ?? 'null'};profit=${this.moneyText(current.profitRate) ?? 'null'}`
          : null,
        newValue: `vat=${vatRate.toFixed(4)};profit=${profitRate.toFixed(4)}`,
        reason: `Kapı Kasası fiyatlandırma güncellemesi (${productCode})`,
      });
      return { setting: created, groupRate: storedGroupRate };
    });

    return this.toResponse(
      { code: String(product.code), name: String(product.name) },
      {
        id: String(result.setting.id),
        vatRate: this.asRateBox(result.setting.vatRate) ?? { toString: () => vatRate.toString() },
        profitRate:
          this.asRateBox(result.setting.profitRate) ?? { toString: () => profitRate.toString() },
        cardMarkupRate: this.asRateBox(result.setting.cardMarkupRate),
        isActive: true,
      },
      result.groupRate,
    );
  }

  private async replacePervazProductSettingOnFirestore(
    productCode: PervazPricingSettingResponse['productCode'],
    profitRate: ReturnType<typeof toDecimal>,
    requestedCardRate: ReturnType<typeof toDecimal> | null,
  ): Promise<PervazPricingSettingResponse> {
    const cache = currentCatalogCache();
    const group = this.requireActiveGroupFromCache('PERVAZ');
    const product = cache?.productByGroupAndCode(String(group.id), productCode);
    if (!product || product.isActive !== true) {
      throw new NotFoundException(`Pervaz ürünü bulunamadı: ${productCode}`);
    }
    const current =
      cache?.pricingSettings({ productId: String(product.id), productGroupId: null })[0] ?? null;
    const store = this.firestoreStore!;

    const result = await store.runTransaction(async (tx) => {
      const groupCard =
        requestedCardRate == null
          ? {
              rate: this.groupCardRateFromCache(String(group.id)),
              changed: false,
            }
          : await this.upsertGroupCardMarkupRateOnFirestore(
              { id: String(group.id), isActive: true, code: 'PERVAZ' },
              requestedCardRate,
              `Pervaz kart/taksit oranı güncellemesi (${productCode})`,
              undefined,
              tx,
            );
      const preservedCardFixed = this.moneyText(current?.cardFixedSurchargeAmount);
      const profitUnchanged =
        this.moneyText(current?.profitRate) != null &&
        toDecimal(this.moneyText(current?.profitRate)!).equals(profitRate);
      if (profitUnchanged && current) {
        return { setting: current, groupRate: groupCard.rate };
      }
      assertPricingSetting({
        productGroupId: null,
        productId: String(product.id),
        vatRate: null,
        profitRate: profitRate.toString(),
        cardMarkupRate: null,
        cardFixedSurchargeAmount: preservedCardFixed,
        productIsActive: true,
      });
      if (current) {
        await this.deactivatePricingSettingOnFirestore(
          tx,
          current,
          `Yeni PricingSetting için eski aktif kayıt kapatıldı (${productCode})`,
        );
      }
      const createdId = store.createId();
      const created = {
        id: createdId,
        productGroupId: null,
        productId: String(product.id),
        vatRate: null,
        profitRate: profitRate.toFixed(4),
        cardMarkupRate: null,
        cardFixedSurchargeAmount: current?.cardFixedSurchargeAmount ?? null,
        isActive: true,
      };
      await tx.upsert(FIRESTORE_COLLECTIONS.pricingSettings, createdId, created);
      await this.writePricingAudit(tx, {
        entityId: createdId,
        action: 'CREATE',
        fieldName: 'profitRate',
        oldValue: current ? `profit=${this.moneyText(current.profitRate) ?? 'null'}` : null,
        newValue: `profit=${profitRate.toFixed(4)}`,
        reason: `Pervaz fiyatlandırma güncellemesi (${productCode})`,
      });
      return { setting: created, groupRate: groupCard.rate };
    });

    return this.toPervazResponse(
      { code: String(product.code), name: String(product.name) },
      {
        id: String(result.setting.id),
        profitRate:
          this.asRateBox(result.setting.profitRate) ?? { toString: () => profitRate.toString() },
        cardFixedSurchargeAmount: this.asRateBox(result.setting.cardFixedSurchargeAmount),
        isActive: true,
      },
      result.groupRate,
    );
  }

  private async replaceAyarliPervazProductSettingOnFirestore(
    dto: UpdateAyarliPervazPricingSettingDto,
    profitRate: ReturnType<typeof toDecimal>,
  ): Promise<AyarliPervazPricingSettingResponse> {
    const cache = currentCatalogCache();
    const group = this.requireActiveGroupFromCache('PERVAZ');
    const product = cache?.productByGroupAndCode(String(group.id), 'AYARLI_PERVAZ');
    if (!product || product.isActive !== true) {
      throw new NotFoundException('Pervaz ürünü bulunamadı: AYARLI_PERVAZ');
    }
    const current =
      cache?.pricingSettings({ productId: String(product.id), productGroupId: null })[0] ?? null;
    const preservedCardFixed = this.moneyText(current?.cardFixedSurchargeAmount);
    const nextCardFixed =
      dto.cardFixedSurchargeAmount != null && dto.cardFixedSurchargeAmount !== ''
        ? toDecimal(dto.cardFixedSurchargeAmount).toString()
        : preservedCardFixed;
    assertPricingSetting({
      productGroupId: null,
      productId: String(product.id),
      vatRate: null,
      profitRate: profitRate.toString(),
      cardMarkupRate: null,
      cardFixedSurchargeAmount: nextCardFixed,
      productIsActive: true,
    });
    const createdId = await this.firestoreStore!.runTransaction(async (tx) => {
      if (current) {
        await this.deactivatePricingSettingOnFirestore(
          tx,
          current,
          'Yeni PricingSetting için eski aktif kayıt kapatıldı (AYARLI_PERVAZ)',
        );
      }
      const id = this.firestoreStore!.createId();
      await tx.upsert(FIRESTORE_COLLECTIONS.pricingSettings, id, {
        id,
        productGroupId: null,
        productId: String(product.id),
        vatRate: null,
        profitRate: profitRate.toFixed(4),
        cardMarkupRate: null,
        cardFixedSurchargeAmount: nextCardFixed,
        isActive: true,
      });
      await this.writePricingAudit(tx, {
        entityId: id,
        action: 'CREATE',
        fieldName:
          nextCardFixed === preservedCardFixed ? 'profitRate' : 'profitRate,cardFixedSurchargeAmount',
        oldValue: current
          ? `profit=${this.moneyText(current.profitRate) ?? 'null'};cardFixed=${preservedCardFixed ?? 'null'}`
          : null,
        newValue: `profit=${profitRate.toFixed(4)};cardFixed=${nextCardFixed ?? 'null'}`,
        reason: 'Ayarlı Pervaz fiyatlandırma güncellemesi',
      });
      return id;
    });
    const groupRate = this.groupCardRateFromCache(String(group.id));
    return this.toAyarliPervazResponse(
      { name: String(product.name) },
      {
        id: createdId,
        profitRate: { toString: () => profitRate.toString() },
        cardFixedSurchargeAmount:
          nextCardFixed == null ? null : { toString: () => nextCardFixed },
        isActive: true,
      },
      groupRate,
    );
  }

  private async replaceDoorBuildGroupSettingOnFirestore(
    profitRate: ReturnType<typeof toDecimal>,
    vatRate: ReturnType<typeof toDecimal>,
    cardMarkupRate: ReturnType<typeof toDecimal> | null,
  ): Promise<DoorBuildPricingSettingResponse> {
    const group = this.requireActiveGroupFromCache(DOOR_BUILD_PRODUCT_GROUP_CODE);
    const current =
      this.uniqueActiveGroupSettings(String(group.id), DOOR_BUILD_PRODUCT_GROUP_CODE)[0] ?? null;
    const profitUnchanged = this.ratesEqual(this.moneyText(current?.profitRate), profitRate);
    const vatUnchanged = this.ratesEqual(this.moneyText(current?.vatRate), vatRate);
    const cardUnchanged = this.ratesEqual(this.moneyText(current?.cardMarkupRate), cardMarkupRate);
    if (profitUnchanged && vatUnchanged && cardUnchanged && current) {
      return {
        productGroupCode: 'KAPI_IMALATI',
        productGroupName: String(group.name),
        settingId: String(current.id),
        vatRate: this.moneyText(current.vatRate),
        profitRate: this.moneyText(current.profitRate),
        cardMarkupRate: this.moneyText(current.cardMarkupRate),
        isActive: true,
      };
    }

    assertPricingSetting({
      productGroupId: String(group.id),
      productId: null,
      vatRate: vatRate.toString(),
      profitRate: profitRate.toString(),
      cardMarkupRate: cardMarkupRate?.toString() ?? null,
      cardFixedSurchargeAmount: null,
      productGroupIsActive: true,
    });

    const createdId = await this.firestoreStore!.runTransaction(async (tx) => {
      if (current) {
        await this.deactivatePricingSettingOnFirestore(
          tx,
          current,
          'Yeni PricingSetting için eski aktif kayıt kapatıldı (KAPI_IMALATI)',
        );
      }
      const id = this.firestoreStore!.createId();
      await tx.upsert(FIRESTORE_COLLECTIONS.pricingSettings, id, {
        id,
        productGroupId: String(group.id),
        productId: null,
        vatRate: vatRate.toFixed(4),
        profitRate: profitRate.toFixed(4),
        cardMarkupRate: cardMarkupRate != null ? cardMarkupRate.toFixed(4) : null,
        cardFixedSurchargeAmount: null,
        isActive: true,
      });
      await this.writePricingAudit(tx, {
        entityId: id,
        action: 'CREATE',
        fieldName: 'profitRate,vatRate,cardMarkupRate',
        oldValue: current
          ? `profit=${this.moneyText(current.profitRate) ?? 'null'};vat=${this.moneyText(current.vatRate) ?? 'null'};card=${this.moneyText(current.cardMarkupRate) ?? 'null'}`
          : null,
        newValue: `profit=${profitRate.toFixed()};vat=${vatRate.toFixed()};card=${cardMarkupRate?.toFixed() ?? 'null'}`,
        reason: 'Kapı İmalatı group-scope PricingSetting oluşturuldu',
      });
      return id;
    });

    return {
      productGroupCode: 'KAPI_IMALATI',
      productGroupName: String(group.name),
      settingId: createdId,
      vatRate: vatRate.toString(),
      profitRate: profitRate.toString(),
      cardMarkupRate: cardMarkupRate?.toString() ?? null,
      isActive: true,
    };
  }

  private asRateBox(value: unknown): { toString(): string } | null {
    const text = this.moneyText(value);
    return text == null ? null : { toString: () => text };
  }
}
