import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PricingSettingsService } from '../pricing/pricing-settings.service';

/**
 * Test-only. CITA group cardMarkupRate yazar.
 * Çağıran transaction rollback etmezse kayıt kalır.
 */
export async function setCitaCardMarkupRate(
  tx: Prisma.TransactionClient,
  cardMarkupRate: string,
): Promise<void> {
  const pricing = new PricingSettingsService(
    {
      $transaction: async <T>(
        fn: (client: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> => fn(tx),
      productGroup: tx.productGroup,
      pricingSetting: tx.pricingSetting,
    } as never,
    new AuditService(tx as never),
  );
  await pricing.replaceCitaGroupSetting({
    productGroup: 'CITA',
    cardMarkupRate,
  });
}

export async function citaCardMarkupRateSnapshot(
  prisma: {
    productGroup: Prisma.TransactionClient['productGroup'];
    pricingSetting: Prisma.TransactionClient['pricingSetting'];
  },
): Promise<string> {
  const group = await prisma.productGroup.findUnique({ where: { code: 'CITA' } });
  if (!group) {
    return '[]';
  }
  const rows = await prisma.pricingSetting.findMany({
    where: { productGroupId: group.id },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      productId: true,
      isActive: true,
      cardMarkupRate: true,
    },
  });
  return JSON.stringify(
    rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      isActive: row.isActive,
      cardMarkupRate: row.cardMarkupRate?.toString() ?? null,
    })),
  );
}
