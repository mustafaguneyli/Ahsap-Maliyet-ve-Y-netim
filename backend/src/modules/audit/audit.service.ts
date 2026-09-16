import { Injectable } from '@nestjs/common';
import { AuditAction, AuditEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const DEFAULT_AUDIT_ACTOR = 'local-admin';

export type AuditEventListItem = {
  id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  actor: string;
  createdAt: string;
  summary: string;
};

export type AuditWriteInput = {
  entityType: string;
  entityId: string;
  action: AuditAction;
  /** CREATE / DELETE için null olabilir. */
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  /** Phase 1: varsayılan local-admin */
  actor?: string;
};

/**
 * Prisma transaction client veya kök PrismaService.
 * Kritik değişikliklerde audit insert için aynı tx geçirilmelidir.
 */
export type AuditDbClient = Prisma.TransactionClient | PrismaService;

/**
 * Append-only audit yazıcı.
 *
 * Kullanım (kritik değişiklik ile aynı transaction):
 *
 *   await this.prisma.$transaction(async (tx) => {
 *     await tx.rawMaterialPrice.create({ data: ... });
 *     await this.auditService.record({ ... }, tx);
 *   });
 *
 * - Asıl değişiklik başarısız → audit commit edilmez
 * - Audit insert başarısız → transaction rollback → kritik değişiklik de yazılmaz
 *
 * UPDATE / DELETE API'si yoktur; audit kayıtları sonradan değiştirilmez.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditWriteInput, tx?: AuditDbClient): Promise<AuditEvent> {
    const db = tx ?? this.prisma;

    return db.auditEvent.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        fieldName: input.fieldName ?? null,
        oldValue: input.oldValue ?? null,
        newValue: input.newValue ?? null,
        reason: input.reason ?? null,
        actor: input.actor ?? DEFAULT_AUDIT_ACTOR,
      },
    });
  }

  async listRecent(limit: number): Promise<{ items: AuditEventListItem[] }> {
    const events = await this.prisma.auditEvent.findMany({
      where: {
        NOT: { fieldName: 'effectiveTo' },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const summaries = await this.buildSummaries(events);

    return {
      items: events.map((event) => ({
        id: event.id,
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        fieldName: event.fieldName,
        oldValue: event.oldValue,
        newValue: event.newValue,
        reason: event.reason,
        actor: event.actor,
        createdAt: event.createdAt.toISOString(),
        summary: summaries.get(event.id) ?? fallbackSummary(event),
      })),
    };
  }

  private async buildSummaries(
    events: AuditEvent[],
  ): Promise<Map<string, string>> {
    const summaries = new Map<string, string>();
    const idsByType = groupEntityIds(events);

    const [prices, extraValues, bands, materials] = await Promise.all([
      idsByType.RawMaterialPrice.length
        ? this.prisma.rawMaterialPrice.findMany({
            where: { id: { in: idsByType.RawMaterialPrice } },
            include: { rawMaterial: { select: { name: true, thicknessMm: true } } },
          })
        : [],
      idsByType.ExtraCostValue.length
        ? this.prisma.extraCostValue.findMany({
            where: { id: { in: idsByType.ExtraCostValue } },
            include: { extraCostType: { select: { name: true } } },
          })
        : [],
      idsByType.CitaPublishedPriceBand.length
        ? this.prisma.citaPublishedPriceBand.findMany({
            where: { id: { in: idsByType.CitaPublishedPriceBand } },
            select: { id: true, minWidthMm: true, maxWidthMm: true },
          })
        : [],
      idsByType.RawMaterial.length
        ? this.prisma.rawMaterial.findMany({
            where: { id: { in: idsByType.RawMaterial } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const priceById = new Map(prices.map((item) => [item.id, item]));
    const extraById = new Map(extraValues.map((item) => [item.id, item]));
    const bandById = new Map(bands.map((item) => [item.id, item]));
    const materialById = new Map(materials.map((item) => [item.id, item]));

    for (const event of events) {
      summaries.set(
        event.id,
        summarizeEvent(event, {
          priceById,
          extraById,
          bandById,
          materialById,
        }),
      );
    }

    return summaries;
  }
}

function groupEntityIds(events: AuditEvent[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {
    RawMaterialPrice: [],
    ExtraCostValue: [],
    CitaPublishedPriceBand: [],
    RawMaterial: [],
  };
  for (const event of events) {
    groups[event.entityType]?.push(event.entityId);
  }
  return groups;
}

function summarizeEvent(
  event: AuditEvent,
  lookups: {
    priceById: Map<
      string,
      {
        priceType: string;
        rawMaterial: { name: string; thicknessMm: { toString(): string } };
      }
    >;
    extraById: Map<string, { extraCostType: { name: string } }>;
    bandById: Map<string, { minWidthMm: number; maxWidthMm: number }>;
    materialById: Map<string, { name: string }>;
  },
): string {
  if (event.entityType === 'RawMaterialPrice') {
    const price = lookups.priceById.get(event.entityId);
    if (price) {
      const thickness = formatThicknessMm(price.rawMaterial.thicknessMm.toString());
      const kind =
        price.priceType === 'CARD_INSTALLMENT' ? 'kart' : 'nakit';
      return `${thickness} mm MDF ${kind} fiyatı güncellendi`;
    }
  }

  if (event.entityType === 'ExtraCostValue') {
    const value = lookups.extraById.get(event.entityId);
    if (value) {
      return `${value.extraCostType.name} maliyeti güncellendi`;
    }
  }

  if (event.entityType === 'CitaPublishedPriceBand') {
    const band = lookups.bandById.get(event.entityId);
    if (band) {
      const fromCm = formatCmFromMm(band.minWidthMm);
      const toCm = formatCmFromMm(band.maxWidthMm);
      return `Çıta ${fromCm}–${toCm} cm yayınlanmış satış fiyatı güncellendi`;
    }
  }

  if (event.entityType === 'RawMaterial') {
    const material = lookups.materialById.get(event.entityId);
    if (material) {
      return event.action === 'CREATE'
        ? `${material.name} eklendi`
        : `${material.name} güncellendi`;
    }
  }

  if (event.entityType === 'ProductionYield') {
    return 'NET üretim adedi güncellendi';
  }

  if (event.entityType === 'PricingSetting') {
    return 'Fiyatlandırma ayarı güncellendi';
  }

  if (event.entityType === 'PricingThicknessModifier') {
    return 'Dekoratif fark güncellendi';
  }

  if (event.entityType === 'PriceOverride') {
    return 'Satış fiyatı override güncellendi';
  }

  return fallbackSummary(event);
}

function fallbackSummary(event: AuditEvent): string {
  if (event.reason && event.reason.trim().length > 0) {
    return event.reason;
  }
  if (event.action === 'CREATE') {
    return 'Yeni kayıt oluşturuldu';
  }
  if (event.action === 'DELETE') {
    return 'Kayıt silindi';
  }
  return 'Kayıt güncellendi';
}

function formatThicknessMm(value: string): string {
  return value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function formatCmFromMm(mm: number): string {
  const cm = mm / 10;
  return Number.isInteger(cm) ? String(cm) : String(cm);
}
