import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { decimalToPrisma, toDecimal } from '../../common/decimal/decimal.util';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { assertPricingSetting } from './pricing-setting.validation';
import { UpdateProductPricingSettingDto } from './dto/update-product-pricing-setting.dto';
import { UpdateAyarliPervazPricingSettingDto } from './dto/update-ayarli-pervaz-pricing-setting.dto';

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
  cardMarkupRate: string;
  isActive: boolean;
};

export type AyarliPervazPricingSettingResponse = {
  productGroupCode: 'PERVAZ';
  productCode: 'AYARLI_PERVAZ';
  productName: string;
  settingId: string;
  vatRate: null;
  profitRate: string;
  cardMarkupRate: null;
  cardFixedSurchargeAmount: string | null;
  isActive: boolean;
};

export type PervazPricingSettingResponse = Omit<
  AyarliPervazPricingSettingResponse,
  'productCode'
> & {
  productCode: (typeof PERVAZ_PRODUCT_CODES)[number];
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

    const { product, setting } = await this.requireActiveProductSetting(normalized);

    return this.toResponse(product, setting);
  }

  /**
   * Aktif PricingSetting'i kapatır (isActive=false), yeni aktif kayıt oluşturur.
   * Overwrite yok; audit aynı transaction içinde.
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
    const cardMarkupRate = toDecimal(dto.cardMarkupRate);
    if (vatRate.isNegative()) {
      throw new BadRequestException('KDV oranı negatif olamaz.');
    }
    if (profitRate.isNegative()) {
      throw new BadRequestException('Kâr oranı negatif olamaz.');
    }
    if (cardMarkupRate.isNegative()) {
      throw new BadRequestException('Kredi kartı farkı negatif olamaz.');
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

      assertPricingSetting({
        productGroupId: null,
        productId: product.id,
        vatRate: vatRate.toString(),
        profitRate: profitRate.toString(),
        cardMarkupRate: cardMarkupRate.toString(),
        cardFixedSurchargeAmount: null,
        productIsActive: product.isActive,
      });

      const current = await tx.pricingSetting.findFirst({
        where: {
          productId: product.id,
          productGroupId: null,
          isActive: true,
        },
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
          cardMarkupRate: decimalToPrisma(cardMarkupRate),
          cardFixedSurchargeAmount: null,
          isActive: true,
        },
      });

      await this.auditService.record(
        {
          entityType: PRICING_ENTITY_TYPE,
          entityId: created.id,
          action: 'CREATE',
          fieldName: 'vatRate,profitRate,cardMarkupRate',
          oldValue: current
            ? `vat=${current.vatRate?.toString() ?? 'null'};profit=${current.profitRate?.toString() ?? 'null'};card=${current.cardMarkupRate?.toString() ?? 'null'}`
            : null,
          newValue: `vat=${vatRate.toFixed(4)};profit=${profitRate.toFixed(4)};card=${cardMarkupRate.toFixed(4)}`,
          reason: `Kapı Kasası fiyatlandırma güncellemesi (${normalized})`,
        },
        tx,
      );

      return { product, setting: created };
    });

    return this.toResponse(result.product, result.setting);
  }

  async getAyarliPervazProductSetting(): Promise<AyarliPervazPricingSettingResponse> {
    const { product, setting } = await this.requireAyarliPervazProductSetting();
    return this.toAyarliPervazResponse(product, setting);
  }

  async getPervazProductSetting(
    productCode: string,
  ): Promise<PervazPricingSettingResponse> {
    const normalized = productCode.trim().toUpperCase();
    this.assertPervazProductCode(normalized);
    const { product, setting } =
      await this.requirePervazProductSetting(normalized);
    return this.toPervazResponse(product, setting);
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
      if (nextCardFixed != null && toDecimal(nextCardFixed).isNegative()) {
        throw new BadRequestException('Kart/taksit sabit farkı negatif olamaz.');
      }
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
          reason: `Pervaz fiyatlandırma güncellemesi (${normalized})`,
        },
        tx,
      );
      return { product, setting: created };
    });

    return this.toPervazResponse(result.product, result.setting);
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
      cardMarkupRate: null,
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
    if (setting.cardMarkupRate == null) {
      throw new NotFoundException(
        `${productCode} için kredi kartı farkı (cardMarkupRate) tanımlı değil.`,
      );
    }

    return { product, setting };
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
      cardMarkupRate: null,
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
  ): ProductPricingSettingResponse {
    if (
      setting.vatRate == null ||
      setting.profitRate == null ||
      setting.cardMarkupRate == null
    ) {
      throw new NotFoundException(
        `${product.code} için vatRate/profitRate/cardMarkupRate eksik PricingSetting kaydı.`,
      );
    }

    return {
      productGroupCode: 'door_frame',
      productCode: product.code,
      productName: product.name,
      settingId: setting.id,
      vatRate: setting.vatRate.toString(),
      profitRate: setting.profitRate.toString(),
      cardMarkupRate: setting.cardMarkupRate.toString(),
      isActive: setting.isActive,
    };
  }
}
