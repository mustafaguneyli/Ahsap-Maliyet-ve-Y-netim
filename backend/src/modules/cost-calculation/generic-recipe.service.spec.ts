import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { AuditAction, CalculatorType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { GenericRecipeService } from './generic-recipe.service';
import type { CreateCatalogItemDto } from './dto/create-catalog-item.dto';

describe('GenericRecipeService catalog save', () => {
  function build() {
    const created: {
      groups: unknown[];
      products: unknown[];
      sizes: unknown[];
      recipes: unknown[];
      yields: unknown[];
      extras: unknown[];
      audits: unknown[];
    } = {
      groups: [],
      products: [],
      sizes: [],
      recipes: [],
      yields: [],
      extras: [],
      audits: [],
    };

    const material = {
      id: 'mat-18',
      code: 'MDF-18-2100X2800-ZIMPARALI',
      name: '18 MM MDF',
      priceBasis: 'SHEET',
      isActive: true,
      thicknessMm: { toString: () => '18' },
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
      prices: [
        {
          id: 'p1',
          priceType: 'CARD_INSTALLMENT',
          price: { toString: () => '2400' },
          effectiveFrom: new Date('2020-01-01'),
          effectiveTo: null,
          isActive: true,
        },
      ],
    };

    const tx = {
      productGroup: {
        create: jest.fn(async ({ data }: { data: unknown }) => {
          const row = { id: 'g1', ...(data as object) };
          created.groups.push(row);
          return row;
        }),
        findUnique: jest.fn(),
      },
      product: {
        create: jest.fn(async ({ data }: { data: unknown }) => {
          const row = { id: 'p1', unit: 'ADET', ...(data as object) };
          created.products.push(row);
          return row;
        }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      productSize: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: { data: unknown }) => {
          const row = { id: 'sz1', ...(data as object) };
          created.sizes.push(row);
          return row;
        }),
      },
      recipe: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: { data: { items?: { create: unknown[] } } }) => {
          if (failRecipe) throw new Error('recipe item fail');
          const row = { id: 'r1', ...data };
          created.recipes.push(row);
          return row;
        }),
      },
      rawMaterial: {
        findUnique: jest.fn(async () => material),
      },
      productionYield: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn(async ({ data }: { data: unknown }) => {
          const row = { id: `y${created.yields.length + 1}`, ...(data as object) };
          created.yields.push(row);
          return row;
        }),
      },
      extraCostType: {
        findFirst: jest.fn(async ({ where }: { where: { code: string } }) => ({
          id: `t-${where.code}`,
          code: where.code,
          name: where.code,
          isActive: true,
        })),
      },
      extraCostValue: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: { data: unknown }) => {
          const row = { id: `e${created.extras.length + 1}`, ...(data as object) };
          created.extras.push(row);
          return row;
        }),
        update: jest.fn(),
      },
      pricingSetting: {
        findFirst: jest.fn().mockResolvedValue({
          vatRate: { toString: () => '0' },
          profitRate: { toString: () => '20' },
          cardMarkupRate: { toString: () => '20' },
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditEvent: {
        create: jest.fn(async ({ data }: { data: unknown }) => {
          created.audits.push(data);
          return { id: `a${created.audits.length}`, ...(data as object) };
        }),
      },
    };

    let failRecipe = false;
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      product: { findUnique: jest.fn().mockResolvedValue(null) },
      rawMaterial: tx.rawMaterial,
      productionYield: tx.productionYield,
      pricingSetting: tx.pricingSetting,
      recipe: tx.recipe,
      extraCostValue: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      productPricingOverride: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      setFailRecipe(value: boolean) {
        failRecipe = value;
      },
    };

    const service = new GenericRecipeService(
      prisma as never,
      new AuditService(prisma as never),
    );
    return { service, prisma, tx, created, material };
  }

  const baseItems = [
    {
      rawMaterialId: 'mat-18',
      calculationMode: 'PER_SHEET_YIELD' as const,
      quantity: '1',
      newNetQty: 24,
      pieceWidthMm: 100,
      pieceLengthMm: 2100,
      sortOrder: 1,
    },
  ];

  it('A/B) NEW_GROUP + ürün + ölçü + recipe + extras', async () => {
    const { service, created } = build();
    const dto: CreateCatalogItemDto = {
      mode: 'NEW_GROUP',
      newGroupCode: 'MUTFAK_PROFILLERI',
      newGroupName: 'Mutfak Profilleri',
      newProductCode: 'X_PROFIL',
      productName: 'X Profil',
      productUnit: 'ADET',
      widthMm: 100,
      lengthMm: 2100,
      recipeItems: baseItems,
      extraCosts: [
        {
          typeCode: 'CUTTING',
          amount: '5',
          calculationMode: 'FIXED',
          scope: 'PRODUCT',
        },
        {
          typeCode: 'LABOR',
          amount: '10',
          calculationMode: 'FIXED',
          scope: 'PRODUCT',
        },
      ],
    };

    const result = await service.saveCatalog(dto);
    expect(result.mode).toBe('NEW_GROUP');
    expect(created.groups).toHaveLength(1);
    expect((created.groups[0] as { calculatorType: string }).calculatorType).toBe(
      CalculatorType.GENERIC_RECIPE,
    );
    expect(created.products).toHaveLength(1);
    expect(created.recipes).toHaveLength(1);
    expect(created.yields).toHaveLength(1);
    expect(created.extras).toHaveLength(2);
    expect(created.audits.length).toBeGreaterThan(0);
  });

  it('F) duplicate product+size Conflict', async () => {
    const { service, tx, prisma } = build();
    prisma.productGroup.findUnique.mockResolvedValue({
      id: 'g1',
      code: 'MUTFAK_PROFILLERI',
      name: 'Mutfak',
      calculatorType: CalculatorType.GENERIC_RECIPE,
      isActive: true,
    });
    tx.product.findUnique = jest.fn().mockResolvedValue({
      id: 'p1',
      code: 'X_PROFIL',
      name: 'X',
      unit: 'ADET',
      isActive: true,
    });
    // saveNewProduct path uses prisma.product.findUnique for existing product
    prisma.product.findUnique.mockResolvedValue({
      id: 'p1',
      code: 'X_PROFIL',
      isActive: true,
    });

    await expect(
      service.saveCatalog({
        mode: 'NEW_PRODUCT',
        productGroupCode: 'MUTFAK_PROFILLERI',
        newProductCode: 'X_PROFIL',
        productName: 'X',
        widthMm: 100,
        lengthMm: 2100,
        recipeItems: baseItems,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('G) recipe hata → transaction throw (yarım commit yok)', async () => {
    const { service, prisma } = build();
    prisma.setFailRecipe(true);
    await expect(
      service.saveCatalog({
        mode: 'NEW_GROUP',
        newGroupCode: 'MUTFAK_PROFILLERI',
        newGroupName: 'Mutfak',
        newProductCode: 'X_PROFIL',
        productName: 'X',
        widthMm: 100,
        lengthMm: 2100,
        recipeItems: baseItems,
      }),
    ).rejects.toThrow('recipe item fail');
  });

  it('H) preview missing price → MISSING_SOURCE', async () => {
    const { service, tx } = build();
    tx.rawMaterial.findUnique.mockResolvedValue({
      id: 'mat-18',
      code: 'MDF-18',
      name: '18',
      priceBasis: 'SHEET',
      isActive: true,
      thicknessMm: { toString: () => '18' },
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
      prices: [],
    });
    const preview = await service.preview({
      widthMm: 100,
      lengthMm: 2100,
      recipeItems: baseItems,
      productGroupCode: 'MUTFAK',
      productGroupName: 'Mutfak',
      productCode: 'X',
      productName: 'X',
    });
    expect(preview.status).toBe('MISSING_SOURCE');
    expect(preview.productionCost).toBeNull();
  });

  it('reserved group code reddeder', async () => {
    const { service } = build();
    await expect(
      service.saveCatalog({
        mode: 'NEW_GROUP',
        newGroupCode: 'PERVAZ',
        newGroupName: 'Pervaz',
        newProductCode: 'X',
        productName: 'X',
        widthMm: 100,
        lengthMm: 2100,
        recipeItems: baseItems,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('listCostRows product ExtraCost group ile aynı typeCode’da double-count yapmaz', async () => {
    const { service, prisma } = build();
    const now = new Date('2026-01-01T00:00:00.000Z');
    const group = {
      id: 'g1',
      code: 'MUTFAK',
      name: 'Mutfak',
      calculatorType: CalculatorType.GENERIC_RECIPE,
      isActive: true,
      products: [
        {
          id: 'p1',
          code: 'X',
          name: 'X',
          unit: 'ADET',
          isActive: true,
          recipes: [
            {
              id: 'r1',
              isActive: true,
              productSizeId: 's1',
              productSize: {
                widthMm: 100,
                lengthMm: 2100,
                displayName: '10x210',
              },
              items: [
                {
                  sortOrder: 0,
                  rawMaterialId: 'mat-18',
                  quantity: { toString: () => '1' },
                  calculationMode: 'PER_SHEET_YIELD',
                  quantityUnit: null,
                  wasteRate: null,
                  productionYieldId: 'y1',
                  rawMaterial: {
                    id: 'mat-18',
                    code: 'MDF-18',
                    name: '18',
                    priceBasis: 'SHEET',
                    isActive: true,
                    prices: [
                      {
                        id: 'price-1',
                        priceType: 'CASH',
                        price: { toString: () => '3500' },
                        effectiveFrom: new Date('2020-01-01'),
                        effectiveTo: null,
                        isActive: true,
                      },
                    ],
                  },
                  productionYield: { netQty: 30, isActive: true },
                },
              ],
            },
          ],
        },
      ],
    };
    prisma.productGroup.findUnique.mockResolvedValue(group);
    prisma.pricingSetting.findFirst.mockResolvedValue(null);
    prisma.extraCostValue.findMany.mockResolvedValue([
      {
        productId: null,
        productGroupId: 'g1',
        amount: { toString: () => '99' },
        calculationMode: 'FIXED',
        extraCostType: { code: 'LABOR', name: 'İşçilik', isActive: true },
      },
      {
        productId: 'p1',
        productGroupId: null,
        amount: { toString: () => '10' },
        calculationMode: 'FIXED',
        extraCostType: { code: 'LABOR', name: 'İşçilik', isActive: true },
      },
    ]);

    const result = await service.listCostRows('MUTFAK', 'CASH', now);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.productionCost).toBe(
      '126.6666666666666666666666667',
    );
    expect(result.rows[0]!.extraCostTotal).toBe('10');
  });
});

describe('GenericRecipeService deactivate', () => {
  function buildDeactivate() {
    const audits: unknown[] = [];
    const genericGroup = {
      id: 'g1',
      code: 'MUTFAK',
      name: 'Mutfak',
      calculatorType: CalculatorType.GENERIC_RECIPE,
      isActive: true,
    };
    const specialGroup = {
      id: 'g-special',
      code: 'PERVAZ',
      name: 'Pervaz',
      calculatorType: CalculatorType.PERVAZ,
      isActive: true,
    };

    const tx = {
      recipe: {
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: { isActive: boolean } }) => ({
          id: where.id,
          ...data,
        })),
      },
      product: {
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: { isActive: boolean } }) => ({
          id: where.id,
          ...data,
        })),
      },
      productGroup: {
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: { isActive: boolean } }) => ({
          id: where.id,
          ...data,
        })),
      },
      auditEvent: {
        create: jest.fn(async ({ data }: { data: unknown }) => {
          audits.push(data);
          return { id: `a${audits.length}`, ...(data as object) };
        }),
      },
    };

    const prisma = {
      recipe: {
        findUnique: jest.fn(),
      },
      product: {
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      productGroup: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    const service = new GenericRecipeService(
      prisma as never,
      new AuditService(prisma as never),
    );
    return { service, prisma, tx, audits, genericGroup, specialGroup };
  }

  it('A) generic ölçü (Recipe) soft-deactivate + audit', async () => {
    const { service, prisma, tx, audits, genericGroup } = buildDeactivate();
    prisma.recipe.findUnique.mockResolvedValue({
      id: 'r1',
      isActive: true,
      productId: 'p1',
      productSizeId: 's1',
      product: { id: 'p1', productGroup: genericGroup },
      productSize: { id: 's1', widthMm: 100, lengthMm: 2100 },
    });

    const result = await service.deactivateCatalogItem({
      target: 'SIZE',
      recipeId: 'r1',
    });
    expect(result.changed).toBe(true);
    expect(tx.recipe.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { isActive: false },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      entityType: 'Recipe',
      action: AuditAction.UPDATE,
      fieldName: 'isActive',
      oldValue: 'true',
      newValue: 'false',
    });
  });

  it('B) generic ürün soft-deactivate', async () => {
    const { service, prisma, tx, audits, genericGroup } = buildDeactivate();
    prisma.product.findUnique.mockResolvedValue({
      id: 'p1',
      isActive: true,
      productGroup: genericGroup,
    });

    const result = await service.deactivateCatalogItem({
      target: 'PRODUCT',
      productId: 'p1',
    });
    expect(result.changed).toBe(true);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { isActive: false },
    });
    expect(audits).toHaveLength(1);
  });

  it('D) special ürün kaldırma reddedilir', async () => {
    const { service, prisma, specialGroup } = buildDeactivate();
    prisma.product.findUnique.mockResolvedValue({
      id: 'p-special',
      isActive: true,
      productGroup: specialGroup,
    });

    await expect(
      service.deactivateCatalogItem({
        target: 'PRODUCT',
        productId: 'p-special',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('E) zaten pasif kayıt no-op, audit spam yok', async () => {
    const { service, prisma, tx, audits, genericGroup } = buildDeactivate();
    prisma.recipe.findUnique.mockResolvedValue({
      id: 'r1',
      isActive: false,
      productId: 'p1',
      productSizeId: 's1',
      product: { id: 'p1', productGroup: genericGroup },
      productSize: { id: 's1' },
    });

    const result = await service.deactivateCatalogItem({
      target: 'SIZE',
      recipeId: 'r1',
    });
    expect(result.changed).toBe(false);
    expect(tx.recipe.update).not.toHaveBeenCalled();
    expect(audits).toHaveLength(0);
  });

  it('F) aktif ürünü olan generic grup reddedilir', async () => {
    const { service, prisma, genericGroup } = buildDeactivate();
    prisma.productGroup.findUnique.mockResolvedValue(genericGroup);
    prisma.product.count.mockResolvedValue(2);

    await expect(
      service.deactivateCatalogItem({
        target: 'GROUP',
        productGroupCode: 'MUTFAK',
      }),
    ).rejects.toThrow('Önce gruptaki aktif ürünleri kaldırın');
  });

  it('F2) aktif ürünü olmayan generic grup soft-deactivate', async () => {
    const { service, prisma, tx, audits, genericGroup } = buildDeactivate();
    prisma.productGroup.findUnique.mockResolvedValue(genericGroup);
    prisma.product.count.mockResolvedValue(0);

    const result = await service.deactivateCatalogItem({
      target: 'GROUP',
      productGroupCode: 'MUTFAK',
    });
    expect(result.changed).toBe(true);
    expect(tx.productGroup.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { isActive: false },
    });
    expect(audits).toHaveLength(1);
  });
});

// silence unused AuditAction import warning in some TS configs
void AuditAction;
