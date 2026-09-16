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
import { CITA_EXTRA_COST_TYPE_ORDER } from './cita-extra-cost';
import { PERVAZ_EXTRA_COST_TYPE_ORDER } from './pervaz-extra-cost-seed';
import { SUPURGELIK_EXTRA_COST_TYPE_ORDER, SUPURGELIK_PP_WRAPPING_TYPE_CODE, SUPURGELIK_PP_WRAPPING_TYPE_NAME, SUPURGELIK_UPDATABLE_EXTRA_COST_TYPE_ORDER } from './supurgelik-extra-cost-seed';

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

export type ExtraCostProductGroupCode =
  | 'door_frame'
  | 'PERVAZ'
  | 'SUPURGELIK'
  | 'CITA';

function extraCostTypeOrderForGroup(
  productGroupCode: string,
): readonly string[] {
  if (productGroupCode === 'door_frame') {
    return DOOR_FRAME_EXTRA_COST_TYPE_ORDER;
  }
  if (productGroupCode === 'PERVAZ') {
    return PERVAZ_EXTRA_COST_TYPE_ORDER;
  }
  if (productGroupCode === 'SUPURGELIK') {
    return SUPURGELIK_EXTRA_COST_TYPE_ORDER;
  }
  if (productGroupCode === 'CITA') {
    return CITA_EXTRA_COST_TYPE_ORDER;
  }
  throw new BadRequestException(
    'productGroup şu an yalnızca door_frame, PERVAZ, SUPURGELIK veya CITA olabilir.',
  );
}

function updatableExtraCostCodes(productGroupCode: string): readonly string[] {
  if (productGroupCode === 'SUPURGELIK') {
    return SUPURGELIK_UPDATABLE_EXTRA_COST_TYPE_ORDER;
  }
  return extraCostTypeOrderForGroup(productGroupCode);
}

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
    const typeOrder = extraCostTypeOrderForGroup(productGroupCode);

    const group = await this.prisma.productGroup.findUnique({
      where: { code: productGroupCode },
    });
    if (!group || !group.isActive) {
      throw new NotFoundException(`Ürün grubu bulunamadı: ${productGroupCode}`);
    }

    const types = await this.prisma.extraCostType.findMany({
      where: {
        code: { in: [...typeOrder] },
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

    for (const code of typeOrder) {
      const type = typeByCode.get(code);
      if (!type) {
        throw new NotFoundException(`Ek maliyet tipi bulunamadı: ${code}`);
      }

      if (productGroupCode === 'SUPURGELIK' || productGroupCode === 'CITA') {
        const currentCandidates = type.values.filter(
          (value) =>
            value.isActive &&
            value.effectiveFrom.getTime() <= now.getTime() &&
            (value.effectiveTo == null || value.effectiveTo.getTime() > now.getTime()),
        );
        if (currentCandidates.length > 1) {
          throw new BadRequestException(
            `${productGroupCode} / ${code} için aynı anda geçerli birden fazla aktif ExtraCostValue bulundu.`,
          );
        }
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
   * SUPURGELIK group-scope PP_WRAPPING. Değer yoksa amount=null; 0 uydurulmaz.
   */
  async getSupurgelikPpWrapping(
    now: Date = new Date(),
  ): Promise<ExtraCostListResponse> {
    const group = await this.prisma.productGroup.findUnique({
      where: { code: 'SUPURGELIK' },
    });
    if (!group || !group.isActive) {
      throw new NotFoundException('Ürün grubu bulunamadı: SUPURGELIK');
    }

    const type = await this.ensurePpWrappingType();
    const values = await this.prisma.extraCostValue.findMany({
      where: {
        extraCostTypeId: type.id,
        productGroupId: group.id,
        productId: null,
        isActive: true,
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const currentCandidates = values.filter(
      (value) =>
        value.isActive &&
        value.effectiveFrom.getTime() <= now.getTime() &&
        (value.effectiveTo == null || value.effectiveTo.getTime() > now.getTime()),
    );
    if (currentCandidates.length > 1) {
      throw new BadRequestException(
        'SUPURGELIK / PP_WRAPPING için aynı anda geçerli birden fazla aktif ExtraCostValue bulundu.',
      );
    }

    const current = selectCurrentExtraCostValue(values, now);
    const item: ExtraCostListItem = {
      typeId: type.id,
      typeCode: type.code,
      typeName: type.name,
      valueId: current?.id ?? null,
      amount: current ? current.amount.toString() : null,
      effectiveFrom: current ? current.effectiveFrom.toISOString() : null,
      effectiveTo: current?.effectiveTo ? current.effectiveTo.toISOString() : null,
    };

    return {
      productGroupCode: group.code,
      productGroupName: group.name,
      asOf: now.toISOString(),
      items: [item],
      totalAmount: current ? current.amount.toString() : '',
    };
  }

  private async ensurePpWrappingType(): Promise<{
    id: string;
    code: string;
    name: string;
    isActive: boolean;
  }> {
    const existing = await this.prisma.extraCostType.findUnique({
      where: { code: SUPURGELIK_PP_WRAPPING_TYPE_CODE },
    });
    if (existing?.isActive) {
      return existing;
    }
    if (existing && !existing.isActive) {
      throw new NotFoundException(
        `Ek maliyet tipi bulunamadı: ${SUPURGELIK_PP_WRAPPING_TYPE_CODE}`,
      );
    }
    return this.prisma.extraCostType.create({
      data: {
        code: SUPURGELIK_PP_WRAPPING_TYPE_CODE,
        name: SUPURGELIK_PP_WRAPPING_TYPE_NAME,
        isActive: true,
      },
    });
  }

  /**
   * Mevcut açık dönemi kapatır, yeni ExtraCostValue oluşturur.
   * Eski kayıt overwrite edilmez; audit aynı transaction içinde yazılır.
   */
  async updateValue(
    typeCode: string,
    dto: UpdateExtraCostValueDto,
  ): Promise<ExtraCostListResponse> {
    const typeOrder = updatableExtraCostCodes(dto.productGroup);
    const normalizedCode = typeCode.trim().toUpperCase();
    if (!typeOrder.includes(normalizedCode)) {
      throw new BadRequestException(
        `typeCode ${dto.productGroup} için geçersiz: ${typeCode}. Beklenen: ${typeOrder.join(', ')}.`,
      );
    }

    let amount: ReturnType<typeof toDecimal>;
    try {
      amount = toDecimal(dto.amount);
    } catch {
      throw new BadRequestException('Ek maliyet tutarı geçerli bir Decimal olmalıdır.');
    }
    if (!amount.isFinite() || amount.lte(0)) {
      throw new BadRequestException('Ek maliyet tutarı 0’dan büyük olmalıdır.');
    }

    let effectiveFrom = this.parseEffectiveFromDate(dto.effectiveFrom);

    await this.prisma.$transaction(async (tx) => {
      const group = await tx.productGroup.findUnique({
        where: { code: dto.productGroup },
      });
      if (!group || !group.isActive) {
        throw new NotFoundException(`Ürün grubu bulunamadı: ${dto.productGroup}`);
      }

      const type =
        (await tx.extraCostType.findUnique({
          where: { code: normalizedCode },
        })) ??
        (normalizedCode === SUPURGELIK_PP_WRAPPING_TYPE_CODE
          ? await tx.extraCostType.create({
              data: {
                code: SUPURGELIK_PP_WRAPPING_TYPE_CODE,
                name: SUPURGELIK_PP_WRAPPING_TYPE_NAME,
                isActive: true,
              },
            })
          : null);
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
        if (toDecimal(open.amount.toString()).equals(amount)) {
          return;
        }

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
          reason: `Ek maliyet güncellemesi (${dto.productGroup} / ${normalizedCode})`,
        },
        tx,
      );
    });

    if (normalizedCode === SUPURGELIK_PP_WRAPPING_TYPE_CODE) {
      return this.getSupurgelikPpWrapping();
    }

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
