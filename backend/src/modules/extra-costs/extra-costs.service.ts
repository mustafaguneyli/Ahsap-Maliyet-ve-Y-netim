import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { decimalToPrisma, toDecimal } from '../../common/decimal/decimal.util';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { assertExtraCostValueScope } from './extra-cost-value.validation';
import { selectCurrentExtraCostValue } from './current-extra-cost-value';
import { UpdateExtraCostValueDto } from './dto/update-extra-cost-value.dto';

const VALUE_ENTITY_TYPE = 'ExtraCostValue';

/** Kapı Kasası ek maliyet tipleri — ekran sırası. */
export const DOOR_FRAME_EXTRA_COST_TYPE_ORDER = [
  'CUTTING',
  'GLUE',
  'LABOR',
  'OTHER',
] as const;

export type DoorFrameExtraCostTypeCode =
  (typeof DOOR_FRAME_EXTRA_COST_TYPE_ORDER)[number];

export type ExtraCostListItem = {
  typeId: string;
  typeCode: string;
  typeName: string;
  valueId: string | null;
  amount: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export type ExtraCostListResponse = {
  productGroupCode: string;
  productGroupName: string;
  asOf: string;
  items: ExtraCostListItem[];
  /** Decimal toplam; frontend Number ile toplam üretmez. */
  totalAmount: string;
};

@Injectable()
export class ExtraCostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listForProductGroup(
    productGroupCode: string,
    now: Date = new Date(),
  ): Promise<ExtraCostListResponse> {
    if (productGroupCode !== 'door_frame') {
      throw new BadRequestException('productGroup şu an yalnızca door_frame olabilir.');
    }

    const group = await this.prisma.productGroup.findUnique({
      where: { code: productGroupCode },
    });
    if (!group || !group.isActive) {
      throw new NotFoundException(`Ürün grubu bulunamadı: ${productGroupCode}`);
    }

    const types = await this.prisma.extraCostType.findMany({
      where: {
        code: { in: [...DOOR_FRAME_EXTRA_COST_TYPE_ORDER] },
        isActive: true,
      },
      include: {
        values: {
          where: {
            productGroupId: group.id,
            productId: null,
            isActive: true,
          },
          orderBy: { effectiveFrom: 'desc' },
        },
      },
    });

    const typeByCode = new Map(types.map((t) => [t.code, t]));
    let total = toDecimal(0);
    const items: ExtraCostListItem[] = [];

    for (const code of DOOR_FRAME_EXTRA_COST_TYPE_ORDER) {
      const type = typeByCode.get(code);
      if (!type) {
        throw new NotFoundException(`Ek maliyet tipi bulunamadı: ${code}`);
      }

      const current = selectCurrentExtraCostValue(type.values, now);
      if (current) {
        total = total.plus(toDecimal(current.amount.toString()));
      }

      items.push({
        typeId: type.id,
        typeCode: type.code,
        typeName: type.name,
        valueId: current?.id ?? null,
        amount: current ? current.amount.toString() : null,
        effectiveFrom: current ? current.effectiveFrom.toISOString() : null,
        effectiveTo: current?.effectiveTo ? current.effectiveTo.toISOString() : null,
      });
    }

    return {
      productGroupCode: group.code,
      productGroupName: group.name,
      asOf: now.toISOString(),
      items,
      totalAmount: total.toString(),
    };
  }

  /**
   * Mevcut açık dönemi kapatır, yeni ExtraCostValue oluşturur.
   * Eski kayıt overwrite edilmez; audit aynı transaction içinde yazılır.
   */
  async updateValue(
    typeCode: string,
    dto: UpdateExtraCostValueDto,
  ): Promise<ExtraCostListResponse> {
    const normalizedCode = typeCode.trim().toUpperCase();
    if (
      !(DOOR_FRAME_EXTRA_COST_TYPE_ORDER as readonly string[]).includes(normalizedCode)
    ) {
      throw new BadRequestException(
        `typeCode Kapı Kasası için geçersiz: ${typeCode}. Beklenen: ${DOOR_FRAME_EXTRA_COST_TYPE_ORDER.join(', ')}`,
      );
    }

    const amount = toDecimal(dto.amount);
    if (amount.isNegative()) {
      throw new BadRequestException('Ek maliyet tutarı negatif olamaz.');
    }

    let effectiveFrom = this.parseEffectiveFromDate(dto.effectiveFrom);

    await this.prisma.$transaction(async (tx) => {
      const group = await tx.productGroup.findUnique({
        where: { code: dto.productGroup },
      });
      if (!group || !group.isActive) {
        throw new NotFoundException(`Ürün grubu bulunamadı: ${dto.productGroup}`);
      }

      const type = await tx.extraCostType.findUnique({
        where: { code: normalizedCode },
      });
      if (!type || !type.isActive) {
        throw new NotFoundException(`Ek maliyet tipi bulunamadı: ${normalizedCode}`);
      }

      assertExtraCostValueScope({
        productGroupId: group.id,
        productId: null,
        amount: amount.toString(),
        effectiveFrom,
        effectiveTo: null,
        productGroupIsActive: group.isActive,
      });

      const open = await tx.extraCostValue.findFirst({
        where: {
          extraCostTypeId: type.id,
          productGroupId: group.id,
          productId: null,
          isActive: true,
          effectiveTo: null,
        },
      });

      if (open) {
        // Aynı takvim gününde ikinci güncelleme: YYYY-MM-DD gece yarısı eski dönemle çakışmasın.
        if (effectiveFrom.getTime() <= open.effectiveFrom.getTime()) {
          const now = new Date();
          if (now.getTime() > open.effectiveFrom.getTime()) {
            effectiveFrom = now;
          }
        }

        if (effectiveFrom <= open.effectiveFrom) {
          throw new BadRequestException(
            'Yeni geçerlilik tarihi, mevcut açık dönemin başlangıcından sonra olmalıdır.',
          );
        }

        await tx.extraCostValue.update({
          where: { id: open.id },
          data: { effectiveTo: effectiveFrom },
        });

        await this.auditService.record(
          {
            entityType: VALUE_ENTITY_TYPE,
            entityId: open.id,
            action: 'UPDATE',
            fieldName: 'effectiveTo',
            oldValue: null,
            newValue: effectiveFrom.toISOString(),
            reason: 'Yeni ek maliyet dönemi için mevcut dönem kapatıldı',
          },
          tx,
        );
      }

      const created = await tx.extraCostValue.create({
        data: {
          extraCostTypeId: type.id,
          productGroupId: group.id,
          productId: null,
          amount: decimalToPrisma(amount),
          effectiveFrom,
          effectiveTo: null,
          isActive: true,
        },
      });

      await this.auditService.record(
        {
          entityType: VALUE_ENTITY_TYPE,
          entityId: created.id,
          action: 'CREATE',
          fieldName: 'amount',
          oldValue: open ? open.amount.toString() : null,
          newValue: amount.toFixed(4),
          reason: `Kapı Kasası ek maliyet güncellemesi (${normalizedCode})`,
        },
        tx,
      );
    });

    return this.listForProductGroup(dto.productGroup);
  }

  private parseEffectiveFromDate(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) {
      throw new BadRequestException('Geçerlilik tarihi YYYY-MM-DD formatında olmalıdır.');
    }
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Geçerlilik tarihi geçersiz.');
    }
    return date;
  }
}
