import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { decimalToPrisma, toDecimal } from '../../common/decimal/decimal.util';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { parseOptionalCardMarkupRate } from '../../calculation-engine/pricing/percent-card-sale';
import { loadCardMarkupRate, resolveGroupCardMarkupRate } from './card-markup-rate.resolver';
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
  ) {}

  async getDoorFrameProductSetting(
    productCode: string,
  ): Promise<ProductPricingSettingResponse> {
    const normalized = productCode.trim().toUpperCase();
    this.assertDoorFrameProductCode(normalized);

    const { product, setting, group } = await this.requireActiveProductSetting(normalized);
    const groupRate = await this.readStoredGroupCardRate(this.prisma, group.id);

    return {
      ...this.toResponse(product, setting, groupRate),
    };
  }

  async getSupurgelikGroupSetting(): Promise<SupurgelikPricingSettingResponse> {
    const { group, setting } = await this.requireSupurgelikGroupSetting();
    return this.toSupurgelikResponse(group, setting);
  }

  async getCitaGroupSetting(): Promise<CitaPricingSettingResponse> {
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

  private parseNonNegativeRate(raw: string, label: string) {
    let rate;
    try {
      rate = toDecimal(raw);
    } catch {
      throw new BadRequestException(`${label} geçerli bir Decimal olmalıdır.`);
    }
    if (!rate.isFinite() || rate.isNegative()) {
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
}
