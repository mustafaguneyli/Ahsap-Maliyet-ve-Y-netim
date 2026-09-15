import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PricingModifierType } from '@prisma/client';
import { decimalToPrisma, toDecimal } from '../../common/decimal/decimal.util';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSupurgelikDecorativeRateDto } from './dto/update-supurgelik-decorative-rate.dto';
import { assertPricingThicknessModifier } from './pricing-thickness-modifier.validation';
import {
  SUPURGELIK_MANAGED_DECORATIVE_THICKNESSES,
  isSupurgelikManagedDecorativeThickness,
} from './supurgelik-decorative-thicknesses';

const MODIFIER_ENTITY_TYPE = 'PricingThicknessModifier';

export type SupurgelikDecorativeRateItem = {
  modifierId: string;
  thicknessMm: (typeof SUPURGELIK_MANAGED_DECORATIVE_THICKNESSES)[number];
  rate: string;
  isActive: boolean;
};

export type SupurgelikDecorativeRatesResponse = {
  productGroupCode: 'SUPURGELIK';
  productGroupName: string;
  items: SupurgelikDecorativeRateItem[];
};

@Injectable()
export class PricingThicknessModifiersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listSupurgelikDecorativeRates(
    productGroup: string,
    now: Date = new Date(),
  ): Promise<SupurgelikDecorativeRatesResponse> {
    if (productGroup !== 'SUPURGELIK') {
      throw new BadRequestException(
        'productGroup şu an yalnızca SUPURGELIK olabilir.',
      );
    }

    const group = await this.prisma.productGroup.findUnique({
      where: { code: 'SUPURGELIK' },
    });
    if (!group?.isActive) {
      throw new NotFoundException('Ürün grubu bulunamadı: SUPURGELIK');
    }

    const rows = await this.prisma.pricingThicknessModifier.findMany({
      where: {
        productGroupId: group.id,
        modifierType: PricingModifierType.DECORATIVE,
        thicknessMm: { in: [...SUPURGELIK_MANAGED_DECORATIVE_THICKNESSES] },
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: [{ thicknessMm: 'asc' }, { effectiveFrom: 'desc' }],
    });

    const byThickness = new Map<number, (typeof rows)[number]>();
    for (const row of rows) {
      if (byThickness.has(row.thicknessMm)) {
        throw new BadRequestException(
          `SUPURGELIK ${row.thicknessMm} mm için birden fazla geçerli dekoratif oran bulundu.`,
        );
      }
      byThickness.set(row.thicknessMm, row);
    }

    const items: SupurgelikDecorativeRateItem[] = [];
    for (const thicknessMm of SUPURGELIK_MANAGED_DECORATIVE_THICKNESSES) {
      const row = byThickness.get(thicknessMm);
      if (!row) continue;
      items.push({
        modifierId: row.id,
        thicknessMm,
        rate: toDecimal(row.rate.toString()).toString(),
        isActive: row.isActive,
      });
    }

    return {
      productGroupCode: 'SUPURGELIK',
      productGroupName: group.name,
      items,
    };
  }

  /**
   * SUPURGELIK 12/14/18 mm dekoratif oranı sürümlemesi.
   * 8/9/10 mm kayıt oluşturmaz. Same-value no-op. Audit aynı transaction içindedir.
   */
  async replaceSupurgelikDecorativeRate(
    dto: UpdateSupurgelikDecorativeRateDto,
    now: Date = new Date(),
  ): Promise<SupurgelikDecorativeRatesResponse> {
    if (dto.productGroup !== 'SUPURGELIK') {
      throw new BadRequestException(
        'productGroup Süpürgelik için SUPURGELIK olmalıdır.',
      );
    }
    if (!isSupurgelikManagedDecorativeThickness(dto.thicknessMm)) {
      throw new BadRequestException(
        'Dekoratif oran yalnız 12, 14 veya 18 mm için güncellenebilir.',
      );
    }

    let rate;
    try {
      rate = toDecimal(dto.rate);
    } catch {
      throw new BadRequestException('Dekoratif oran geçerli bir Decimal olmalıdır.');
    }
    if (!rate.isFinite() || rate.lte(0)) {
      throw new BadRequestException('Dekoratif oran 0’dan büyük olmalıdır.');
    }

    await this.prisma.$transaction(async (tx) => {
      const group = await tx.productGroup.findUnique({
        where: { code: 'SUPURGELIK' },
      });
      if (!group?.isActive) {
        throw new NotFoundException('Ürün grubu bulunamadı: SUPURGELIK');
      }

      const active = await tx.pricingThicknessModifier.findMany({
        where: {
          productGroupId: group.id,
          modifierType: PricingModifierType.DECORATIVE,
          thicknessMm: dto.thicknessMm,
          isActive: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
      });
      if (active.length > 1) {
        throw new BadRequestException(
          `SUPURGELIK ${dto.thicknessMm} mm için birden fazla geçerli dekoratif oran bulundu.`,
        );
      }
      const current = active[0] ?? null;
      if (
        current != null &&
        toDecimal(current.rate.toString()).equals(rate)
      ) {
        return;
      }

      assertPricingThicknessModifier({
        productGroupId: group.id,
        modifierType: PricingModifierType.DECORATIVE,
        thicknessMm: dto.thicknessMm,
        rate: rate.toString(),
        effectiveFrom: now,
        effectiveTo: null,
        productGroupIsActive: group.isActive,
      });

      if (current) {
        await tx.pricingThicknessModifier.update({
          where: { id: current.id },
          data: { isActive: false },
        });
        await this.auditService.record(
          {
            entityType: MODIFIER_ENTITY_TYPE,
            entityId: current.id,
            action: 'UPDATE',
            fieldName: 'isActive',
            oldValue: 'true',
            newValue: 'false',
            reason: `Yeni dekoratif oran için eski aktif kayıt kapatıldı (SUPURGELIK ${dto.thicknessMm} mm)`,
          },
          tx,
        );
      }

      const created = await tx.pricingThicknessModifier.create({
        data: {
          productGroupId: group.id,
          modifierType: PricingModifierType.DECORATIVE,
          thicknessMm: dto.thicknessMm,
          rate: decimalToPrisma(rate),
          isActive: true,
          effectiveFrom: now,
          effectiveTo: null,
        },
      });
      await this.auditService.record(
        {
          entityType: MODIFIER_ENTITY_TYPE,
          entityId: created.id,
          action: 'CREATE',
          fieldName: 'rate',
          oldValue: current?.rate.toString() ?? null,
          newValue: rate.toFixed(4),
          reason: `Süpürgelik dekoratif oranı güncellemesi (${dto.thicknessMm} mm)`,
        },
        tx,
      );
    });

    return this.listSupurgelikDecorativeRates(dto.productGroup, now);
  }
}
