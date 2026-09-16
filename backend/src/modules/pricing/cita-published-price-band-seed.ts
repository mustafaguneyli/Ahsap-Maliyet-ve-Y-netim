import { AuditAction, PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { toDecimal } from '../../common/decimal/decimal.util';
import { CITA_PRODUCT_GROUP_SEED } from '../products/cita-product-seed';
import {
  CITA_PUBLISHED_PRICE_BAND_SEEDS,
  sameCitaPublishedThicknessSet,
} from './cita-published-price-band-data';
import {
  assertCitaPublishedPriceBand,
  citaPublishedWidthRangesOverlap,
} from './cita-published-price-band.validation';

const EFFECTIVE_FROM = new Date('2026-03-01T00:00:00.000Z');
const BAND_ENTITY_TYPE = 'CitaPublishedPriceBand';

export type CitaPublishedPriceBandSeedReport = {
  created: number;
  unchanged: number;
  conflicts: Array<{
    minWidthMm: number;
    maxWidthMm: number;
    existingCashPrice: string;
    existingCardPrice: string;
    seedCashPrice: string;
    seedCardPrice: string;
    existingThicknessMm: number[];
    seedThicknessMm: number[];
  }>;
  duplicateActiveBands: Array<{ minWidthMm: number; maxWidthMm: number }>;
  overlappingActiveBands: Array<{
    minWidthMm: number;
    maxWidthMm: number;
    overlappingMinWidthMm: number;
    overlappingMaxWidthMm: number;
  }>;
  missingProductGroup: boolean;
  inactiveHistoryPreserved: boolean;
  totalExpected: number;
};

/**
 * Yalnız eksik CITA yayınlanmış fiyat bantlarını oluşturur.
 * Mevcut aktif kullanıcı değerini kapatmaz/değiştirmez; farklıysa conflict raporlar.
 */
export async function seedCitaPublishedPriceBands(
  prisma: PrismaClient,
): Promise<CitaPublishedPriceBandSeedReport> {
  return prisma.$transaction(async (tx) => {
    const report: CitaPublishedPriceBandSeedReport = {
      created: 0,
      unchanged: 0,
      conflicts: [],
      duplicateActiveBands: [],
      overlappingActiveBands: [],
      missingProductGroup: false,
      inactiveHistoryPreserved: true,
      totalExpected: CITA_PUBLISHED_PRICE_BAND_SEEDS.length,
    };

    const group = await tx.productGroup.findUnique({
      where: { code: CITA_PRODUCT_GROUP_SEED.code },
    });
    if (!group?.isActive) {
      report.missingProductGroup = true;
      return report;
    }

    const inactiveBefore = await tx.citaPublishedPriceBand.count({
      where: { productGroupId: group.id, isActive: false },
    });

    const activeRows = await tx.citaPublishedPriceBand.findMany({
      where: {
        productGroupId: group.id,
        isActive: true,
        effectiveTo: null,
      },
      include: { thicknesses: true },
    });

    for (const seed of CITA_PUBLISHED_PRICE_BAND_SEEDS) {
      const matching = activeRows.filter(
        (row) =>
          row.minWidthMm === seed.minWidthMm &&
          row.maxWidthMm === seed.maxWidthMm,
      );
      if (matching.length > 1) {
        report.duplicateActiveBands.push({
          minWidthMm: seed.minWidthMm,
          maxWidthMm: seed.maxWidthMm,
        });
        continue;
      }

      const overlapping = activeRows.filter(
        (row) =>
          !(
            row.minWidthMm === seed.minWidthMm &&
            row.maxWidthMm === seed.maxWidthMm
          ) &&
          citaPublishedWidthRangesOverlap(row, seed),
      );
      if (overlapping.length > 0) {
        for (const row of overlapping) {
          report.overlappingActiveBands.push({
            minWidthMm: seed.minWidthMm,
            maxWidthMm: seed.maxWidthMm,
            overlappingMinWidthMm: row.minWidthMm,
            overlappingMaxWidthMm: row.maxWidthMm,
          });
        }
        continue;
      }

      const active = matching[0];
      if (active) {
        const existingThicknessMm = active.thicknesses.map(
          (row) => row.thicknessMm,
        );
        const pricesMatch =
          toDecimal(active.cashPrice.toString()).equals(seed.cashPrice) &&
          toDecimal(active.cardPrice.toString()).equals(seed.cardPrice);
        const thicknessesMatch = sameCitaPublishedThicknessSet(
          existingThicknessMm,
          seed.thicknessMm,
        );
        if (pricesMatch && thicknessesMatch) {
          report.unchanged += 1;
        } else {
          report.conflicts.push({
            minWidthMm: seed.minWidthMm,
            maxWidthMm: seed.maxWidthMm,
            existingCashPrice: active.cashPrice.toString(),
            existingCardPrice: active.cardPrice.toString(),
            seedCashPrice: seed.cashPrice,
            seedCardPrice: seed.cardPrice,
            existingThicknessMm: [...existingThicknessMm].sort((a, b) => a - b),
            seedThicknessMm: [...seed.thicknessMm],
          });
        }
        continue;
      }

      assertCitaPublishedPriceBand({
        productGroupId: group.id,
        minWidthMm: seed.minWidthMm,
        maxWidthMm: seed.maxWidthMm,
        cashPrice: seed.cashPrice,
        cardPrice: seed.cardPrice,
        thicknessMm: seed.thicknessMm,
        effectiveFrom: EFFECTIVE_FROM,
        effectiveTo: null,
        productGroupIsActive: group.isActive,
      });

      const created = await tx.citaPublishedPriceBand.create({
        data: {
          productGroupId: group.id,
          minWidthMm: seed.minWidthMm,
          maxWidthMm: seed.maxWidthMm,
          cashPrice: new Decimal(seed.cashPrice),
          cardPrice: new Decimal(seed.cardPrice),
          isActive: true,
          effectiveFrom: EFFECTIVE_FROM,
          effectiveTo: null,
          thicknesses: {
            create: seed.thicknessMm.map((thicknessMm) => ({ thicknessMm })),
          },
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: BAND_ENTITY_TYPE,
          entityId: created.id,
          action: AuditAction.CREATE,
          fieldName: 'cashPrice',
          oldValue: null,
          newValue: toDecimal(seed.cashPrice).toFixed(4),
          reason: `Çıta yayınlanmış fiyat bandı seed (${seed.minWidthMm}-${seed.maxWidthMm} mm, kart=${seed.cardPrice})`,
          actor: 'local-admin',
        },
      });
      await tx.auditEvent.create({
        data: {
          entityType: BAND_ENTITY_TYPE,
          entityId: created.id,
          action: AuditAction.CREATE,
          fieldName: 'cardPrice',
          oldValue: null,
          newValue: toDecimal(seed.cardPrice).toFixed(4),
          reason: `Çıta yayınlanmış fiyat bandı seed (${seed.minWidthMm}-${seed.maxWidthMm} mm, nakit=${seed.cashPrice})`,
          actor: 'local-admin',
        },
      });
      report.created += 1;
    }

    const inactiveAfter = await tx.citaPublishedPriceBand.count({
      where: { productGroupId: group.id, isActive: false },
    });
    report.inactiveHistoryPreserved = inactiveAfter === inactiveBefore;
    return report;
  });
}
