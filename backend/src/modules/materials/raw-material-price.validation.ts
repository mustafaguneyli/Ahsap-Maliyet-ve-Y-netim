import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MaterialPriceType } from '@prisma/client';

/**
 * Yeni ya da güncellenen bir fiyat döneminin mevcut kayıtlarla çakışıp çakışmadığını kontrol eder.
 *
 * Çakışma tanımı: iki dönem [A_from, A_to] ve [B_from, B_to] çakışıyor ise
 *   A_from < B_to_or_inf  AND  B_from < A_to_or_inf
 *
 * Bu fonksiyon AYNI transaction içinde çağrılmalıdır ki
 * eş zamanlı eklemeler de yakalanabilsin (SELECT FOR UPDATE ya da serializable isolation).
 *
 * Açık dönem (effectiveTo = null) → +∞ olarak ele alınır.
 */
export async function assertNoPriceOverlap(
  prisma: PrismaService,
  params: {
    rawMaterialId: string;
    priceType: MaterialPriceType;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    /** Güncelleme durumunda mevcut kaydın id'si; çakışma sorgusundan hariç tutulur. */
    excludeId?: string;
  },
): Promise<void> {
  const { rawMaterialId, priceType, effectiveFrom, effectiveTo, excludeId } = params;

  // Potansiyel çakışan kayıtları bul.
  // Çakışma koşulu: existing.effective_from < params.effectiveTo_or_inf
  //                AND params.effectiveFrom < existing.effective_to_or_inf
  //
  // Prisma'da "IS NULL → +inf" mantığını raw SQL ile ifade ediyoruz.
  const overlapping = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM raw_material_prices
    WHERE raw_material_id  = ${rawMaterialId}::uuid
      AND price_type       = ${priceType}::"MaterialPriceType"
      AND is_active        = true
      ${excludeId ? prisma.$queryRaw`AND id <> ${excludeId}::uuid` : prisma.$queryRaw``}
      AND effective_from < COALESCE(${effectiveTo ?? null}::timestamptz, 'infinity'::timestamptz)
      AND COALESCE(effective_to::timestamptz, 'infinity'::timestamptz) > ${effectiveFrom}::timestamptz
    LIMIT 1
  `;

  if (overlapping.length > 0) {
    throw new BadRequestException(
      `Bu ham madde (${rawMaterialId}) + fiyat tipi (${priceType}) kombinasyonu için ` +
        `belirtilen dönem, mevcut aktif bir fiyat dönemi ile çakışıyor. ` +
        `Yeni dönem eklemeden önce mevcut dönemi kapatın (effectiveTo ayarlayın).`,
    );
  }
}
