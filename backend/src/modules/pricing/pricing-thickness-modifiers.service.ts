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

const MODIFIER_ENTITY_TYPE = 'PricingThicknessModifier';

export type SupurgelikDecorativeRateItem = {
  modifierId: string | null;
  thicknessMm: number;
  rate: string | null;
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

    const catalogThicknesses = await this.listSupurgelikCatalogThicknesses();
    const thicknesses = new Set<number>([
      ...catalogThicknesses,
      ...byThickness.keys(),
    ]);
    const items = [...thicknesses]
      .sort((left, right) => left - right)
      .map((thicknessMm) => {
        const row = byThickness.get(thicknessMm);
        if (!row) {
          return {
            modifierId: null,
            thicknessMm,
            rate: null,
            isActive: false,
          };
        }
        return {
          modifierId: row.id,
          thicknessMm,
          rate: toDecimal(row.rate.toString()).toString(),
          isActive: row.isActive,
        };
      });

    return {
      productGroupCode: 'SUPURGELIK',
      productGroupName: group.name,
      items,
    };
  }

  /**
   * SUPURGELIK grup + kalınlık dekoratif oranı sürümlemesi.
   * Katalogda görünen eksik kalınlıklar (ör. 8/10 mm) için yeni kayıt açılabilir.
   * Same-value no-op. Audit aynı transaction içindedir.
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
    if (!Number.isInteger(dto.thicknessMm) || dto.thicknessMm <= 0) {
      throw new BadRequestException(
        'thicknessMm pozitif tam sayı (mm) olmalıdır.',
      );
    }

    let rate;
    try {
      rate = toDecimal(dto.rate);
    } catch {
      throw new BadRequestException('Dekoratif oran geçerli bir Decimal olmalıdır.');
    }
    if (!rate.isFinite() || rate.isNegative()) {
      throw new BadRequestException('Dekoratif oran negatif olamaz.');
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

  /**
   * Süpürgelik listesinde görünen kalınlıklar: generic ProductionYield + ProductSize.
   * Kapı Kasası / Çıta / Pervaz kalınlıkları sızmaz.
   */
  private async listSupurgelikCatalogThicknesses(): Promise<number[]> {
    const productSizes = await this.prisma.productSize.findMany({
      select: { widthMm: true, lengthMm: true },
    });
    const productSizeKeys = new Set(
      productSizes.map((size) => `${size.widthMm}|${size.lengthMm}`),
    );
    const yields = await this.prisma.productionYield.findMany({
      where: {
        productId: null,
        isActive: true,
        rawMaterial: { isActive: true },
      },
      include: { rawMaterial: true },
    });

    const thicknesses = new Set<number>();
    for (const row of yields) {
      if (
        row.productId !== null ||
        !row.isActive ||
        !row.rawMaterial.isActive ||
        row.pieceLengthMm !== row.rawMaterial.sheetLengthMm ||
        !productSizeKeys.has(`${row.pieceWidthMm}|${row.pieceLengthMm}`)
      ) {
        continue;
      }
      const thicknessMm = Number(row.rawMaterial.thicknessMm.toString());
      if (!Number.isInteger(thicknessMm) || thicknessMm <= 0) {
        throw new BadRequestException(
          `${row.rawMaterial.code} için geçersiz Süpürgelik kalınlığı: ${row.rawMaterial.thicknessMm.toString()}`,
        );
      }
      thicknesses.add(thicknessMm);
    }
    return [...thicknesses];
  }
}
