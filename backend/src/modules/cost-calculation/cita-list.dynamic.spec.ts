import { Prisma, PrismaClient } from '@prisma/client';
import { toDecimal } from '../../common/decimal/decimal.util';
import { CITA_EXTRA_COST_MISSING } from '../../calculation-engine/calculators/cita-production-calculator';
import { CITA_NET_FORBIDDEN_MATERIAL_CODES } from '../../calculation-engine/calculators/cita-net-calculator';
import { AuditService } from '../audit/audit.service';
import { ExtraCostsService } from '../extra-costs/extra-costs.service';
import { CitaListService } from './cita-list.service';
import { CitaMdfService } from './cita-mdf.service';
import { CitaNetService } from './cita-net.service';
import { CitaProductionService } from './cita-production.service';

const ROLLBACK = new Error('ROLLBACK_CITA_LIST_DYNAMIC_TEST');
const OTHER_GROUP_CODES = ['door_frame', 'PERVAZ', 'SUPURGELIK'] as const;

function extraCostsServiceForTx(tx: Prisma.TransactionClient) {
  return new ExtraCostsService(
    {
      $transaction: async <T>(
        fn: (client: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> => fn(tx),
      productGroup: tx.productGroup,
      extraCostType: tx.extraCostType,
      extraCostValue: tx.extraCostValue,
    } as never,
    new AuditService(tx as never),
  );
}

function listServiceForTx(tx: Prisma.TransactionClient) {
  const extras = extraCostsServiceForTx(tx);
  const net = new CitaNetService(tx as never);
  const mdf = new CitaMdfService(net, tx as never);
  const production = new CitaProductionService(mdf, extras);
  return {
    extras,
    production,
    list: new CitaListService(tx as never, production, net),
  };
}

async function productScopedYieldCount(
  prisma: PrismaClient | Prisma.TransactionClient,
  groupCode: string,
): Promise<number> {
  const group = await prisma.productGroup.findUnique({ where: { code: groupCode } });
  if (!group) {
    return 0;
  }
  const products = await prisma.product.findMany({
    where: { productGroupId: group.id },
    select: { id: true },
  });
  if (products.length === 0) {
    return 0;
  }
  return prisma.productionYield.count({
    where: { productId: { in: products.map((product) => product.id) } },
  });
}

async function citaExtraCostValueCount(
  prisma: PrismaClient | Prisma.TransactionClient,
): Promise<number> {
  const group = await prisma.productGroup.findUnique({ where: { code: 'CITA' } });
  if (!group) {
    return 0;
  }
  return prisma.extraCostValue.count({
    where: { productGroupId: group.id },
  });
}

async function citaProductId(prisma: PrismaClient): Promise<string> {
  const group = await prisma.productGroup.findUnique({ where: { code: 'CITA' } });
  const product = group
    ? await prisma.product.findUnique({
        where: {
          productGroupId_code: {
            productGroupId: group.id,
            code: 'CITA',
          },
        },
      })
    : null;
  if (!product) {
    throw new Error('Aktif CITA ürünü bulunamadı.');
  }
  return product.id;
}

describe('CITA list DB-driven MASTER (yazmaz, ExtraCost rollback)', () => {
  const prisma = new PrismaClient();
  const net = new CitaNetService(prisma as never);
  const production = new CitaProductionService(
    new CitaMdfService(net, prisma as never),
    new ExtraCostsService(prisma as never, new AuditService(prisma as never)),
  );
  const service = new CitaListService(prisma as never, production, net);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('56 aktif CITA MASTER satırını sıralı döner; ExtraCost yoksa productionCost null', async () => {
    expect(await citaExtraCostValueCount(prisma)).toBe(0);

    const productId = await citaProductId(prisma);
    const citaYields = await prisma.productionYield.findMany({
      where: { productId, isActive: true },
    });
    expect(citaYields).toHaveLength(56);

    const countsBefore = {
      productSize: await prisma.productSize.count(),
      productionYield: await prisma.productionYield.count(),
      recipe: await prisma.recipe.count(),
      extraCostValue: await prisma.extraCostValue.count(),
      otherYields: await Promise.all(
        OTHER_GROUP_CODES.map(async (code) => ({
          code,
          count: await productScopedYieldCount(prisma, code),
        })),
      ),
    };

    const listed = await service.listProductionCosts();

    expect(listed.productCode).toBe('CITA');
    expect(listed.verifiedMeasureCount).toBe(56);
    expect(listed.rows).toHaveLength(56);
    expect(listed.rows.every((row) => row.productionYield.source === 'MASTER')).toBe(
      true,
    );
    expect(
      listed.rows.some((row) => row.productionYield.source === 'CALCULATED_CUT_RULE'),
    ).toBe(false);
    expect(
      listed.rows.some((row) => [35, 47, 65].includes(Number(row.widthMm))),
    ).toBe(false);
    expect(
      listed.rows.some((row) =>
        (CITA_NET_FORBIDDEN_MATERIAL_CODES as readonly string[]).includes(
          row.rawMaterial.code,
        ),
      ),
    ).toBe(false);
    expect(
      listed.rows
        .filter((row) => row.thicknessMm === '18' || row.thicknessMm === '18.00')
        .every((row) => row.rawMaterial.code === 'MDF-18-2100X2800-ZIMPARALI'),
    ).toBe(true);
    expect(
      listed.rows
        .filter((row) => row.thicknessMm === '22' || row.thicknessMm === '22.00')
        .every((row) => row.rawMaterial.code === 'MDF-22-2100X2800-ZIMPARALI'),
    ).toBe(true);

    const keys = listed.rows.map(
      (row) => `${row.thicknessMm}|${row.widthMm}|${row.lengthMm}`,
    );
    expect(new Set(keys).size).toBe(56);
    expect(keys).toEqual([...keys].sort((a, b) => {
      const [ta, wa, la] = a.split('|').map(Number);
      const [tb, wb, lb] = b.split('|').map(Number);
      return ta - tb || wa - wb || la - lb;
    }));

    const find = (thicknessMm: string, widthMm: string) =>
      listed.rows.find(
        (row) =>
          toDecimal(row.thicknessMm).eq(thicknessMm) &&
          toDecimal(row.widthMm).eq(widthMm),
      );

    expect(find('10', '10')?.productionYield).toEqual({ netQty: 150, source: 'MASTER' });
    expect(find('14', '40')?.productionYield).toEqual({ netQty: 47, source: 'MASTER' });
    expect(find('18', '80')?.productionYield).toEqual({ netQty: 25, source: 'MASTER' });
    expect(find('30', '60')?.productionYield).toEqual({ netQty: 32, source: 'MASTER' });

    expect(listed.rows.every((row) => row.statusCode === CITA_EXTRA_COST_MISSING)).toBe(
      true,
    );
    expect(listed.rows.every((row) => row.productionCost === null)).toBe(true);
    expect(listed.rows.every((row) => row.extraCostsTotal === null)).toBe(true);
    expect(listed.rows.every((row) => row.mdfUnitCost != null)).toBe(true);
    expect(
      listed.rows.every(
        (row) =>
          row.missingExtraCosts.includes('CUTTING') &&
          row.missingExtraCosts.includes('LABOR'),
      ),
    ).toBe(true);

    const custom = await production.getProductionCost({
      thicknessMm: '14',
      widthMm: '35',
      lengthMm: '2800',
    });
    expect(custom.productionYield).toEqual({
      netQty: 53,
      source: 'CALCULATED_CUT_RULE',
    });

    const afterCustom = await service.listProductionCosts();
    expect(afterCustom.rows).toHaveLength(56);
    expect(
      afterCustom.rows.some((row) => toDecimal(row.widthMm).eq(35)),
    ).toBe(false);

    expect(await prisma.productSize.count()).toBe(countsBefore.productSize);
    expect(await prisma.productionYield.count()).toBe(countsBefore.productionYield);
    expect(await prisma.recipe.count()).toBe(countsBefore.recipe);
    expect(await prisma.extraCostValue.count()).toBe(countsBefore.extraCostValue);
    expect(await citaExtraCostValueCount(prisma)).toBe(0);
    for (const before of countsBefore.otherYields) {
      expect(await productScopedYieldCount(prisma, before.code)).toBe(before.count);
    }
  });

  it('geçici CUTTING+LABOR ile 56 satır productionCost hesaplar ve rollback eder', async () => {
    expect(await citaExtraCostValueCount(prisma)).toBe(0);

    try {
      await prisma.$transaction(async (tx) => {
        const { extras, list } = listServiceForTx(tx);
        const asOf = new Date().toISOString().slice(0, 10);

        await extras.updateValue('CUTTING', {
          productGroup: 'CITA',
          amount: '5',
          effectiveFrom: asOf,
        });
        await extras.updateValue('LABOR', {
          productGroup: 'CITA',
          amount: '10',
          effectiveFrom: asOf,
        });

        const listed = await list.listProductionCosts();
        expect(listed.rows).toHaveLength(56);
        expect(
          listed.rows.every((row) => row.productionYield.source === 'MASTER'),
        ).toBe(true);
        expect(listed.rows.every((row) => row.extraCostsTotal === '15')).toBe(true);
        expect(listed.rows.every((row) => row.statusCode === null)).toBe(true);
        expect(
          listed.rows.every(
            (row) =>
              row.productionCost ===
              toDecimal(row.mdfUnitCost!).plus(15).toFixed(),
          ),
        ).toBe(true);

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    expect(await citaExtraCostValueCount(prisma)).toBe(0);
  });
});
