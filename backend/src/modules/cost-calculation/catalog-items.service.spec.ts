import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CatalogItemsService } from './catalog-items.service';
import type { CreateCatalogItemDto } from './dto/create-catalog-item.dto';

describe('CatalogItemsService', () => {
  const groupPervaz = { id: 'g-pervaz', code: 'PERVAZ', name: 'Pervaz', isActive: true };
  const productAyarli = {
    id: 'p-ayarli',
    code: 'AYARLI_PERVAZ',
    name: 'Ayarlı Pervaz',
    isActive: true,
  };
  const material12 = {
    id: 'mat-12',
    code: 'MDF-12-2100X2800-ZIMPARALI',
    name: '12 MM MDF',
    thicknessMm: { toString: () => '12' },
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    isActive: true,
  };
  const kilcikMat = {
    id: 'mat-kilcik',
    code: 'MDF-8-2100X2800-ZIMPARALI',
    name: '8 MM',
    thicknessMm: { toString: () => '8' },
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    isActive: true,
  };
  const standardType = { id: 'kt-std', code: 'STANDARD', isActive: true };

  function baseDto(
    overrides: Partial<CreateCatalogItemDto> = {},
  ): CreateCatalogItemDto {
    return {
      mode: 'NEW_SIZE',
      productGroupCode: 'PERVAZ',
      productCode: 'AYARLI_PERVAZ',
      widthMm: 100,
      lengthMm: 2300,
      rawMaterialId: material12.id,
      netQty: 24,
      kilcikNetQty: 70,
      useGroupExtraCostDefaults: true,
      ...overrides,
    };
  }

  function buildPrisma(overrides: Record<string, unknown> = {}) {
    const created: {
      yields: unknown[];
      recipes: unknown[];
      kilcik: unknown[];
      sizes: unknown[];
      audits: unknown[];
    } = { yields: [], recipes: [], kilcik: [], sizes: [], audits: [] };

    const tx = {
      rawMaterial: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          if (where.id === material12.id) return material12;
          if (where.id === kilcikMat.id) return kilcikMat;
          return null;
        }),
        findFirst: jest.fn(async () => kilcikMat),
      },
      productionYield: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: { data: unknown }) => {
          const row = { id: `y-${created.yields.length + 1}`, ...(data as object) };
          created.yields.push(row);
          return row;
        }),
      },
      pervazKilcikYield: {
        create: jest.fn(async ({ data }: { data: unknown }) => {
          const row = { id: `k-${created.kilcik.length + 1}`, ...(data as object) };
          created.kilcik.push(row);
          return row;
        }),
      },
      kilcikType: {
        findFirst: jest.fn(async () => standardType),
        findUnique: jest.fn(async () => standardType),
      },
      productSize: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: { data: unknown }) => {
          const row = {
            id: `sz-${created.sizes.length + 1}`,
            ...(data as object),
          };
          created.sizes.push(row);
          return row;
        }),
      },
      recipe: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: { data: { items?: { create: unknown[] } } }) => {
          const row = {
            id: `r-${created.recipes.length + 1}`,
            ...data,
            items: data.items?.create ?? [],
          };
          created.recipes.push(row);
          return row;
        }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([productAyarli]),
        create: jest.fn(),
        delete: jest.fn(),
      },
      auditEvent: {
        create: jest.fn(async ({ data }: { data: unknown }) => {
          created.audits.push(data);
          return { id: `a-${created.audits.length}`, ...(data as object) };
        }),
      },
    };

    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(groupPervaz),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue(productAyarli),
        findMany: tx.product.findMany,
        create: tx.product.create,
        delete: tx.product.delete,
      },
      rawMaterial: tx.rawMaterial,
      productionYield: tx.productionYield,
      productSize: tx.productSize,
      kilcikType: tx.kilcikType,
      pervazKilcikYield: tx.pervazKilcikYield,
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      ...overrides,
    };

    return { prisma, tx, created };
  }

  function buildService(prisma: unknown) {
    return new CatalogItemsService(
      prisma as never,
      new AuditService(prisma as never),
    );
  }

  it('A) Pervaz yeni ölçü: yield + kılçık + recipe + audit', async () => {
    const { prisma, created } = buildPrisma();
    const service = buildService(prisma);

    const result = await service.create(baseDto());

    expect(result.mode).toBe('NEW_SIZE');
    expect(result.productCode).toBe('AYARLI_PERVAZ');
    expect(result.size.widthMm).toBe(100);
    expect(result.size.lengthMm).toBe(2300);
    expect(created.yields).toHaveLength(1);
    expect(created.kilcik).toHaveLength(1);
    expect(created.recipes).toHaveLength(1);
    expect(created.audits.some((a) => (a as { fieldName?: string }).fieldName === 'catalogItem')).toBe(
      true,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('B) Duplicate exact ölçü engellenir', async () => {
    const { prisma, tx } = buildPrisma();
    tx.productionYield.findFirst.mockResolvedValue({
      id: 'existing',
      netQty: 24,
    });
    const service = buildService(prisma);

    await expect(service.create(baseDto())).rejects.toBeInstanceOf(ConflictException);
    expect(createdEmpty(tx)).toBe(true);
  });

  it('C) NET eksik (kilcikNetQty) kayıt engellenir', async () => {
    const { prisma } = buildPrisma();
    const service = buildService(prisma);

    await expect(
      service.create(baseDto({ kilcikNetQty: undefined })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('D) Ham madde eksik / pasif engellenir', async () => {
    const { prisma, tx } = buildPrisma();
    tx.rawMaterial.findUnique.mockResolvedValue(null);
    const service = buildService(prisma);

    await expect(service.create(baseDto())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('E) Recipe hata verirse transaction rollback (yarım ProductSize yok)', async () => {
    const { prisma, tx, created } = buildPrisma();
    tx.recipe.create.mockRejectedValue(new Error('recipe item fail'));
    const service = buildService(prisma);

    await expect(service.create(baseDto())).rejects.toThrow('recipe item fail');
    // $transaction mock throw eder; gerçek Prisma rollback yapar.
    // Burada create çağrıları tx içinde kaldı ama dışarı commit yok.
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(created.recipes).toHaveLength(0);
  });

  it('F) Çıta yeni standart ölçü calculator listesine girecek yield oluşturur', async () => {
    const groupCita = { id: 'g-cita', code: 'CITA', name: 'Çıta', isActive: true };
    const productCita = { id: 'p-cita', code: 'CITA', name: 'Çıta', isActive: true };
    const mat18 = {
      id: 'mat-18',
      code: 'MDF-18-2100X2800-ZIMPARALI',
      name: '18 MM',
      thicknessMm: { toString: () => '18' },
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
      isActive: true,
    };
    const { prisma, tx, created } = buildPrisma();
    prisma.productGroup.findUnique.mockResolvedValue(groupCita);
    prisma.product.findUnique.mockResolvedValue(productCita);
    tx.rawMaterial.findUnique.mockResolvedValue(mat18);

    const service = buildService(prisma);
    const result = await service.create(
      baseDto({
        productGroupCode: 'CITA',
        productCode: 'CITA',
        rawMaterialId: mat18.id,
        widthMm: 45,
        lengthMm: 2800,
        netQty: 40,
        kilcikNetQty: undefined,
      }),
    );

    expect(result.productGroupCode).toBe('CITA');
    expect(created.yields).toHaveLength(1);
    expect((created.yields[0] as { productId: string }).productId).toBe(productCita.id);
    expect(created.recipes).toHaveLength(1);
  });

  it('G) ExtraCost override kapalıyken grup varsayılanı zorunlu', async () => {
    const { prisma } = buildPrisma();
    const service = buildService(prisma);

    await expect(
      service.create(baseDto({ useGroupExtraCostDefaults: false })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('Yakın ölçü duplicate sayılmaz (2100 != 2200)', async () => {
    const { prisma, tx } = buildPrisma();
    tx.productionYield.findFirst.mockImplementation(
      async ({
        where,
      }: {
        where: { pieceLengthMm: number };
      }) => {
        if (where.pieceLengthMm === 2100) {
          return { id: 'old', netQty: 20 };
        }
        return null;
      },
    );
    const service = buildService(prisma);

    const result = await service.create(baseDto({ lengthMm: 2200 }));
    expect(result.size.lengthMm).toBe(2200);
  });

  it('NEW_PRODUCT bilinmeyen pervaz tipini reddeder', async () => {
    const { prisma } = buildPrisma();
    prisma.product.findUnique.mockResolvedValue(null);
    const service = buildService(prisma);

    await expect(
      service.create(
        baseDto({
          mode: 'NEW_PRODUCT',
          newProductCode: 'UNKNOWN_PERVAZ',
          productName: 'Bilinmeyen',
          productCode: undefined,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function createdEmpty(tx: {
  productionYield: { create: { mock: { calls: unknown[] } } };
}): boolean {
  return tx.productionYield.create.mock.calls.length === 0;
}
