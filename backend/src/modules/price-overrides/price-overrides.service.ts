import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { decimalToPrisma, toDecimal } from '../../common/decimal/decimal.util';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertDoorFramePriceOverrideDto } from './dto/upsert-door-frame-price-override.dto';

const OVERRIDE_ENTITY_TYPE = 'PriceOverride';
const DOOR_FRAME_PRODUCT_CODES = ['34_MM', '30_MM'] as const;

export type DoorFramePriceOverrideResponse = {
  productGroupCode: string;
  productCode: string;
  widthCm: number;
  lengthCm: number;
  displayName: string;
  overrideId: string | null;
  cashPrice: string | null;
  reason: string | null;
  isActive: boolean;
};

@Injectable()
export class PriceOverridesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async upsertDoorFrameOverride(
    productCode: string,
    sizeKey: string,
    dto: UpsertDoorFramePriceOverrideDto,
  ): Promise<DoorFramePriceOverrideResponse> {
    const normalized = productCode.trim().toUpperCase();
    this.assertDoorFrameProductCode(normalized);
    if (dto.productGroup !== 'door_frame') {
      throw new BadRequestException('productGroup şu an yalnızca door_frame olabilir.');
    }

    const { widthCm, lengthCm } = this.parseSizeKey(sizeKey);
    const cashPrice = toDecimal(dto.cashPrice);
    if (!cashPrice.isFinite() || cashPrice.lte(0)) {
      throw new BadRequestException('Nakit satış fiyatı 0\'dan büyük olmalıdır.');
    }

    const reason = dto.reason?.trim() ? dto.reason.trim() : null;

    const result = await this.prisma.$transaction(async (tx) => {
      const { product, productSize } = await this.requireProductAndSize(
        tx,
        normalized,
        widthCm,
        lengthCm,
      );

      const current = await tx.priceOverride.findFirst({
        where: {
          productId: product.id,
          productSizeId: productSize.id,
          isActive: true,
        },
      });

      if (current) {
        await tx.priceOverride.update({
          where: { id: current.id },
          data: { isActive: false },
        });
        await this.auditService.record(
          {
            entityType: OVERRIDE_ENTITY_TYPE,
            entityId: current.id,
            action: 'UPDATE',
            fieldName: 'isActive',
            oldValue: 'true',
            newValue: 'false',
            reason: `Yeni nakit override için eski kayıt kapatıldı (${normalized} ${widthCm}x${lengthCm})`,
          },
          tx,
        );
      }

      const created = await tx.priceOverride.create({
        data: {
          productId: product.id,
          productSizeId: productSize.id,
          cashPrice: decimalToPrisma(cashPrice),
          reason,
          isActive: true,
        },
      });

      await this.auditService.record(
        {
          entityType: OVERRIDE_ENTITY_TYPE,
          entityId: created.id,
          action: 'CREATE',
          fieldName: 'cashPrice',
          oldValue: current ? current.cashPrice.toString() : null,
          newValue: cashPrice.toFixed(),
          reason: reason ?? `Kapı Kasası nakit override (${normalized} ${widthCm}x${lengthCm})`,
        },
        tx,
      );

      return { product, productSize, created };
    });

    return {
      productGroupCode: 'door_frame',
      productCode: result.product.code,
      widthCm,
      lengthCm,
      displayName: result.productSize.displayName,
      overrideId: result.created.id,
      cashPrice: result.created.cashPrice.toString(),
      reason: result.created.reason,
      isActive: result.created.isActive,
    };
  }

  async deactivateDoorFrameOverride(
    productCode: string,
    sizeKey: string,
  ): Promise<DoorFramePriceOverrideResponse> {
    const normalized = productCode.trim().toUpperCase();
    this.assertDoorFrameProductCode(normalized);
    const { widthCm, lengthCm } = this.parseSizeKey(sizeKey);

    const result = await this.prisma.$transaction(async (tx) => {
      const { product, productSize } = await this.requireProductAndSize(
        tx,
        normalized,
        widthCm,
        lengthCm,
      );

      const current = await tx.priceOverride.findFirst({
        where: {
          productId: product.id,
          productSizeId: productSize.id,
          isActive: true,
        },
      });
      if (!current) {
        throw new NotFoundException(
          `${normalized} ${widthCm}x${lengthCm} için aktif nakit override yok.`,
        );
      }

      const updated = await tx.priceOverride.update({
        where: { id: current.id },
        data: { isActive: false },
      });

      await this.auditService.record(
        {
          entityType: OVERRIDE_ENTITY_TYPE,
          entityId: current.id,
          action: 'UPDATE',
          fieldName: 'isActive',
          oldValue: 'true',
          newValue: 'false',
          reason: `Formül fiyatına dönüş (${normalized} ${widthCm}x${lengthCm})`,
        },
        tx,
      );

      return { product, productSize, updated };
    });

    return {
      productGroupCode: 'door_frame',
      productCode: result.product.code,
      widthCm,
      lengthCm,
      displayName: result.productSize.displayName,
      overrideId: null,
      cashPrice: null,
      reason: null,
      isActive: false,
    };
  }

  private assertDoorFrameProductCode(code: string): void {
    if (!(DOOR_FRAME_PRODUCT_CODES as readonly string[]).includes(code)) {
      throw new BadRequestException(
        `productCode Kapı Kasası için geçersiz: ${code}. Beklenen: ${DOOR_FRAME_PRODUCT_CODES.join(', ')}`,
      );
    }
  }

  private parseSizeKey(sizeKey: string): { widthCm: number; lengthCm: number } {
    const normalized = sizeKey.trim().toLowerCase().replace('×', 'x');
    const match = /^(\d+)x(\d+)$/.exec(normalized);
    if (!match) {
      throw new BadRequestException(
        `Ölçü geçersiz: ${sizeKey}. Beklenen biçim: 10x210`,
      );
    }
    const widthCm = Number(match[1]);
    const lengthCm = Number(match[2]);
    if (!Number.isInteger(widthCm) || !Number.isInteger(lengthCm) || widthCm <= 0 || lengthCm <= 0) {
      throw new BadRequestException(`Ölçü geçersiz: ${sizeKey}.`);
    }
    return { widthCm, lengthCm };
  }

  private async requireProductAndSize(
    tx: Prisma.TransactionClient,
    productCode: string,
    widthCm: number,
    lengthCm: number,
  ) {
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
          code: productCode,
        },
      },
    });
    if (!product || !product.isActive) {
      throw new NotFoundException(`Kapı Kasası ürünü bulunamadı: ${productCode}`);
    }

    const productSize = await tx.productSize.findUnique({
      where: {
        widthMm_lengthMm: {
          widthMm: widthCm * 10,
          lengthMm: lengthCm * 10,
        },
      },
    });
    if (!productSize) {
      throw new NotFoundException(
        `Kapı Kasası ölçüsü bulunamadı: ${widthCm}x${lengthCm}`,
      );
    }

    return { product, productSize };
  }
}
