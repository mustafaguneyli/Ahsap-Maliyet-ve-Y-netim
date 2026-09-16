import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { decimalToPrisma, toDecimal } from '../../common/decimal/decimal.util';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CITA_PRODUCT_GROUP_SEED } from '../products/cita-product-seed';
import { assertCitaPublishedPriceBand } from './cita-published-price-band.validation';

const BAND_ENTITY_TYPE = 'CitaPublishedPriceBand';

export type CitaPublishedPriceBandItem = {
  id: string;
  minWidthMm: number;
  maxWidthMm: number;
  displayName: string;
  cashPrice: string;
  cardPrice: string;
  thicknessMm: number[];
  isActive: boolean;
};

export type CitaPublishedPriceBandsResponse = {
  productGroupCode: 'CITA';
  productGroupName: string;
  items: CitaPublishedPriceBandItem[];
};

export type ReplaceCitaPublishedPriceBandInput = {
  minWidthMm: number;
  maxWidthMm: number;
  cashPrice: string;
  cardPrice: string;
};

export type UpdateCitaPublishedPriceBandPricesInput = {
  cashPrice: string;
  cardPrice: string;
};

@Injectable()
export class CitaPublishedPriceBandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listActive(now: Date = new Date()): Promise<CitaPublishedPriceBandsResponse> {
    const group = await this.prisma.productGroup.findUnique({
      where: { code: CITA_PRODUCT_GROUP_SEED.code },
    });
    if (!group?.isActive) {
      throw new NotFoundException('Ürün grubu bulunamadı: CITA');
    }

    const rows = await this.prisma.citaPublishedPriceBand.findMany({
      where: {
        productGroupId: group.id,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      include: { thicknesses: { orderBy: { thicknessMm: 'asc' } } },
      orderBy: [{ minWidthMm: 'asc' }, { effectiveFrom: 'desc' }],
    });

    const seen = new Set<string>();
    const items: CitaPublishedPriceBandItem[] = [];
    for (const row of rows) {
      const key = `${row.minWidthMm}-${row.maxWidthMm}`;
      if (seen.has(key)) {
        throw new BadRequestException(
          `CITA ${row.minWidthMm}-${row.maxWidthMm} mm için birden fazla geçerli yayınlanmış fiyat bandı bulundu.`,
        );
      }
      seen.add(key);
      items.push(toItem(row));
    }

    return {
      productGroupCode: 'CITA',
      productGroupName: group.name,
      items,
    };
  }

  /**
   * Aktif açık bandı kapatır, aynı thickness kapsamıyla yeni dönem açar.
   * Same-value no-op. Audit aynı transaction içindedir.
   */
  async replaceBand(
    dto: ReplaceCitaPublishedPriceBandInput,
    now: Date = new Date(),
  ): Promise<CitaPublishedPriceBandsResponse> {
    let cashPrice;
    let cardPrice;
    try {
      cashPrice = toDecimal(dto.cashPrice);
      cardPrice = toDecimal(dto.cardPrice);
    } catch {
      throw new BadRequestException(
        'Yayınlanmış nakit/kart fiyatı geçerli bir Decimal olmalıdır.',
      );
    }
    if (!cashPrice.isFinite() || cashPrice.lte(0)) {
      throw new BadRequestException('cashPrice 0’dan büyük olmalıdır.');
    }
    if (!cardPrice.isFinite() || cardPrice.lte(0)) {
      throw new BadRequestException('cardPrice 0’dan büyük olmalıdır.');
    }

    await this.prisma.$transaction(async (tx) => {
      const group = await tx.productGroup.findUnique({
        where: { code: CITA_PRODUCT_GROUP_SEED.code },
      });
      if (!group?.isActive) {
        throw new NotFoundException('Ürün grubu bulunamadı: CITA');
      }

      const active = await tx.citaPublishedPriceBand.findMany({
        where: {
          productGroupId: group.id,
          minWidthMm: dto.minWidthMm,
          maxWidthMm: dto.maxWidthMm,
          isActive: true,
          effectiveTo: null,
        },
        include: { thicknesses: { orderBy: { thicknessMm: 'asc' } } },
      });
      if (active.length > 1) {
        throw new BadRequestException(
          `CITA ${dto.minWidthMm}-${dto.maxWidthMm} mm için birden fazla açık yayınlanmış fiyat bandı bulundu.`,
        );
      }
      const current = active[0] ?? null;
      if (current == null) {
        throw new NotFoundException(
          `CITA ${dto.minWidthMm}-${dto.maxWidthMm} mm yayınlanmış fiyat bandı bulunamadı.`,
        );
      }
      if (
        toDecimal(current.cashPrice.toString()).equals(cashPrice) &&
        toDecimal(current.cardPrice.toString()).equals(cardPrice)
      ) {
        return;
      }

      const thicknessMm = current.thicknesses.map((row) => row.thicknessMm);
      assertCitaPublishedPriceBand({
        productGroupId: group.id,
        minWidthMm: dto.minWidthMm,
        maxWidthMm: dto.maxWidthMm,
        cashPrice: cashPrice.toString(),
        cardPrice: cardPrice.toString(),
        thicknessMm,
        effectiveFrom: now,
        effectiveTo: null,
        productGroupIsActive: group.isActive,
      });

      if (now.getTime() <= current.effectiveFrom.getTime()) {
        throw new BadRequestException(
          'Yeni geçerlilik tarihi, mevcut açık dönemin başlangıcından sonra olmalıdır.',
        );
      }

      await tx.citaPublishedPriceBand.update({
        where: { id: current.id },
        data: { effectiveTo: now },
      });
      await this.auditService.record(
        {
          entityType: BAND_ENTITY_TYPE,
          entityId: current.id,
          action: 'UPDATE',
          fieldName: 'effectiveTo',
          oldValue: null,
          newValue: now.toISOString(),
          reason: `Yeni Çıta yayınlanmış fiyat bandı için mevcut dönem kapatıldı (${dto.minWidthMm}-${dto.maxWidthMm} mm)`,
        },
        tx,
      );

      const created = await tx.citaPublishedPriceBand.create({
        data: {
          productGroupId: group.id,
          minWidthMm: dto.minWidthMm,
          maxWidthMm: dto.maxWidthMm,
          cashPrice: decimalToPrisma(cashPrice),
          cardPrice: decimalToPrisma(cardPrice),
          isActive: true,
          effectiveFrom: now,
          effectiveTo: null,
          thicknesses: {
            create: thicknessMm.map((value) => ({ thicknessMm: value })),
          },
        },
      });
      await this.auditService.record(
        {
          entityType: BAND_ENTITY_TYPE,
          entityId: created.id,
          action: 'CREATE',
          fieldName: 'cashPrice',
          oldValue: current.cashPrice.toString(),
          newValue: cashPrice.toFixed(4),
          reason: `Çıta yayınlanmış nakit fiyat güncellemesi (${dto.minWidthMm}-${dto.maxWidthMm} mm)`,
        },
        tx,
      );
      await this.auditService.record(
        {
          entityType: BAND_ENTITY_TYPE,
          entityId: created.id,
          action: 'CREATE',
          fieldName: 'cardPrice',
          oldValue: current.cardPrice.toString(),
          newValue: cardPrice.toFixed(4),
          reason: `Çıta yayınlanmış kart fiyat güncellemesi (${dto.minWidthMm}-${dto.maxWidthMm} mm)`,
        },
        tx,
      );
    });

    return this.listActive(now);
  }

  /**
   * PATCH /:id yalnızca nakit/kart günceller.
   * min/max en ve thickness kapsamı istek gövdesinden alınmaz.
   */
  async updateActiveBandPrices(
    id: string,
    dto: UpdateCitaPublishedPriceBandPricesInput,
    now: Date = new Date(),
  ): Promise<CitaPublishedPriceBandsResponse> {
    const current = await this.prisma.citaPublishedPriceBand.findUnique({
      where: { id },
    });
    if (current == null) {
      throw new NotFoundException('Çıta yayınlanmış fiyat bandı bulunamadı.');
    }
    if (!current.isActive || current.effectiveTo != null) {
      throw new BadRequestException(
        'Yalnız açık aktif yayınlanmış fiyat bandı güncellenebilir.',
      );
    }

    return this.replaceBand(
      {
        minWidthMm: current.minWidthMm,
        maxWidthMm: current.maxWidthMm,
        cashPrice: dto.cashPrice,
        cardPrice: dto.cardPrice,
      },
      now,
    );
  }
}

function toItem(row: {
  id: string;
  minWidthMm: number;
  maxWidthMm: number;
  cashPrice: { toString(): string };
  cardPrice: { toString(): string };
  isActive: boolean;
  thicknesses: Array<{ thicknessMm: number }>;
}): CitaPublishedPriceBandItem {
  return {
    id: row.id,
    minWidthMm: row.minWidthMm,
    maxWidthMm: row.maxWidthMm,
    displayName: `${row.minWidthMm / 10}–${row.maxWidthMm / 10} cm`,
    cashPrice: toDecimal(row.cashPrice.toString()).toString(),
    cardPrice: toDecimal(row.cardPrice.toString()).toString(),
    thicknessMm: row.thicknesses.map((item) => item.thicknessMm),
    isActive: row.isActive,
  };
}
