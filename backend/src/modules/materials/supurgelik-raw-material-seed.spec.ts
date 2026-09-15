import { Decimal } from '@prisma/client/runtime/library';
import {
  SUPURGELIK_9MM_RAW_MATERIAL_SEED,
  seedSupurgelik9MmRawMaterial,
} from './supurgelik-raw-material-seed';

describe('seedSupurgelik9MmRawMaterial', () => {
  function buildPrisma(existing: Record<string, unknown> | null) {
    const tx = {
      rawMaterial: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'rm-9-2100', ...data }),
        ),
        update: jest.fn(),
      },
      auditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    return { prisma, tx };
  }

  it('fiyat oluşturmadan doğrulanmış fiziksel masterı ve audit kaydını oluşturur', async () => {
    const { prisma, tx } = buildPrisma(null);

    const report = await seedSupurgelik9MmRawMaterial(prisma as never);

    expect(report).toEqual({ created: 1, reused: 0, conflicts: [] });
    expect(tx.rawMaterial.create).toHaveBeenCalledWith({
      data: {
        ...SUPURGELIK_9MM_RAW_MATERIAL_SEED,
        thicknessMm: expect.any(Decimal),
      },
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: 'RawMaterial',
        entityId: 'rm-9-2100',
        action: 'CREATE',
      }),
    });
    expect(tx).not.toHaveProperty('rawMaterialPrice');
    expect(SUPURGELIK_9MM_RAW_MATERIAL_SEED).not.toHaveProperty('cashPrice');
    expect(SUPURGELIK_9MM_RAW_MATERIAL_SEED).not.toHaveProperty('cardPrice');
  });

  it('aynı fiziksel masterı ikinci çalıştırmada reuse eder ve değiştirmez', async () => {
    const { prisma, tx } = buildPrisma({
      id: 'rm-9-2100',
      ...SUPURGELIK_9MM_RAW_MATERIAL_SEED,
      name: 'Kullanıcı tarafından değiştirilmiş ad',
      supplierName: null,
      thicknessMm: new Decimal(9),
    });

    const report = await seedSupurgelik9MmRawMaterial(prisma as never);

    expect(report).toEqual({ created: 0, reused: 1, conflicts: [] });
    expect(tx.rawMaterial.create).not.toHaveBeenCalled();
    expect(tx.rawMaterial.update).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('aynı kod farklı fiziksel özelliklerdeyse overwrite etmeden conflict raporlar', async () => {
    const { prisma, tx } = buildPrisma({
      id: 'rm-conflict',
      ...SUPURGELIK_9MM_RAW_MATERIAL_SEED,
      thicknessMm: new Decimal(9),
      sheetWidthMm: 2200,
    });

    const report = await seedSupurgelik9MmRawMaterial(prisma as never);

    expect(report).toEqual({
      created: 0,
      reused: 0,
      conflicts: [
        {
          code: 'MDF-9-2100X2800-ZIMPARALI',
          reason: 'PHYSICAL_PROPERTIES_MISMATCH',
        },
      ],
    });
    expect(tx.rawMaterial.create).not.toHaveBeenCalled();
    expect(tx.rawMaterial.update).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });
});
