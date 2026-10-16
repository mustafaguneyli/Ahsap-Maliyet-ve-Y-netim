import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CalculatorType, MaterialPriceType, ProductUnit } from '@prisma/client';
import type { GenericRecipeItemInput } from '../calculation-engine/calculators/generic-recipe-calculator';
import { FIRESTORE_COLLECTIONS } from '../firebase/firestore.collections';
import type {
  CreateCatalogItemDto,
  GenericExtraCostDto,
  GenericRecipeItemDto,
} from '../modules/cost-calculation/dto/create-catalog-item.dto';
import type { DeactivateCatalogItemDto } from '../modules/cost-calculation/dto/deactivate-catalog-item.dto';
import { resolveCostMaterialPrice } from '../modules/cost-calculation/current-material-price';
import { materialPriceRowFromFirestore } from './firestore-lookups';
import { copyRecipeItemsDeep, resolveRecipeWithItems } from './firestore-recipe';
import {
  selectExtraCostsByPrecedence,
  type ExtraCostPrecedenceRow,
} from './extra-cost-precedence';
import { resolveProfitRateFromFirestoreDocs } from './firestore-profit-catalog';
import { UniqueConstraintError, CheckConstraintError } from './store-errors';
import type { DocumentStore, StoreTransaction } from './document-store';

const RESERVED_GROUP_CODES = new Set([
  'door_frame',
  'PERVAZ',
  'SUPURGELIK',
  'CITA',
  'KAPI_IMALATI',
]);

const SPECIAL_CALCULATORS = new Set<string>([
  CalculatorType.DOOR_FRAME,
  CalculatorType.PERVAZ,
  CalculatorType.SUPURGELIK,
  CalculatorType.CITA,
  CalculatorType.DOOR_BUILD,
]);

function asPriceBasis(value: unknown): GenericRecipeItemInput['priceBasis'] {
  if (value === 'SHEET' || value === 'UNIT' || value === 'METER' || value === 'SQUARE_METER') {
    return value;
  }
  throw new BadRequestException(`Ham madde priceBasis geçersiz: ${String(value)}`);
}

function displayNameCm(widthMm: number, lengthMm: number, override?: string): string {
  if (override?.trim()) return override.trim();
  return `${widthMm / 10}×${lengthMm / 10}`;
}

function rethrowStore(error: unknown): never {
  if (error instanceof UniqueConstraintError) {
    throw new ConflictException(error.message);
  }
  if (error instanceof CheckConstraintError) {
    throw new BadRequestException(error.message);
  }
  throw error;
}

async function writeAudit(
  store: DocumentStore,
  tx: StoreTransaction,
  input: {
    entityType: string;
    entityId: string;
    action: string;
    fieldName?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
    reason?: string | null;
  },
): Promise<void> {
  const id = store.createId();
  await tx.upsert(FIRESTORE_COLLECTIONS.auditEvents, id, {
    id,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    fieldName: input.fieldName ?? null,
    oldValue: input.oldValue ?? null,
    newValue: input.newValue ?? null,
    reason: input.reason ?? null,
    actor: 'local-admin',
  });
}

export type GenericRecipeGraphItem = {
  sortOrder: number;
  rawMaterialId: string;
  quantity: { toString(): string };
  calculationMode: GenericRecipeItemDto['calculationMode'] | null;
  quantityUnit: string | null;
  wasteRate: { toString(): string } | null;
  productionYieldId: string | null;
  rawMaterial: {
    id: string;
    code: string;
    name: string;
    priceBasis: GenericRecipeItemInput['priceBasis'];
    isActive: boolean;
    prices: ReturnType<typeof materialPriceRowFromFirestore>[];
  };
  productionYield: { netQty: number; isActive: boolean } | null;
};

export type GenericRecipeGraph = {
  group: { id: string; code: string; name: string; calculatorType: CalculatorType; isActive: boolean };
  products: Array<{
    id: string;
    code: string;
    name: string;
    unit: ProductUnit;
    isActive: boolean;
    recipes: Array<{
      id: string;
      productSizeId: string;
      productSize: { id: string; widthMm: number; lengthMm: number; displayName: string };
      items: GenericRecipeGraphItem[];
    }>;
  }>;
};

/**
 * GENERIC_RECIPE katalog kalıcılığı. Calculator iş kuralına dokunmaz.
 */
export class GenericRecipeFirestoreRepository {
  constructor(private readonly store: DocumentStore) {}

  private async listDocs(collection: (typeof FIRESTORE_COLLECTIONS)[keyof typeof FIRESTORE_COLLECTIONS]) {
    const { currentCatalogCache, CATALOG_PRELOAD_COLLECTIONS } = await import('./firestore-catalog-cache');
    const cache = currentCatalogCache();
    if (cache && (CATALOG_PRELOAD_COLLECTIONS as readonly string[]).includes(collection)) {
      return cache.collection(collection as (typeof CATALOG_PRELOAD_COLLECTIONS)[number]);
    }
    return this.store.list(collection);
  }

  async loadActiveGenericGroup(productGroupCode: string): Promise<GenericRecipeGraph> {
    const groups = await this.listDocs(FIRESTORE_COLLECTIONS.productGroups);
    const group = groups.find((row) => row.code === productGroupCode);
    if (!group || group.isActive !== true) {
      throw new NotFoundException(`Aktif ürün grubu bulunamadı: ${productGroupCode}`);
    }
    if (group.calculatorType !== CalculatorType.GENERIC_RECIPE) {
      throw new BadRequestException(
        `${productGroupCode} GENERIC_RECIPE değil (calculatorType=${group.calculatorType}).`,
      );
    }
    const [products, sizes, recipes, items, materials, prices, yields] = await Promise.all([
      this.listDocs(FIRESTORE_COLLECTIONS.products),
      this.listDocs(FIRESTORE_COLLECTIONS.productSizes),
      this.listDocs(FIRESTORE_COLLECTIONS.recipes),
      this.listDocs(FIRESTORE_COLLECTIONS.recipeItems),
      this.listDocs(FIRESTORE_COLLECTIONS.rawMaterials),
      this.listDocs(FIRESTORE_COLLECTIONS.rawMaterialPrices),
      this.listDocs(FIRESTORE_COLLECTIONS.productionYields),
    ]);
    const groupProducts = products.filter(
      (row) => row.productGroupId === group.id && row.isActive === true,
    );
    return {
      group: {
        id: String(group.id),
        code: String(group.code),
        name: String(group.name),
        calculatorType: group.calculatorType as CalculatorType,
        isActive: true,
      },
      products: groupProducts.map((product) => {
        const productRecipes = recipes.filter(
          (row) => row.productId === product.id && row.isActive === true,
        );
        return {
          id: String(product.id),
          code: String(product.code),
          name: String(product.name),
          unit: (product.unit as ProductUnit) ?? ProductUnit.ADET,
          isActive: true,
          recipes: productRecipes.flatMap((recipe) => {
            const size = sizes.find((row) => row.id === recipe.productSizeId);
            if (!size) {
              return [];
            }
            const recipeItems = items
              .filter((row) => row.recipeId === recipe.id)
              .slice()
              .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
            return [
              {
                id: String(recipe.id),
                productSizeId: String(recipe.productSizeId),
                productSize: {
                  id: String(size.id),
                  widthMm: Number(size.widthMm),
                  lengthMm: Number(size.lengthMm),
                  displayName: String(size.displayName),
                },
                items: recipeItems.map((item) => {
                  const material = materials.find((row) => row.id === item.rawMaterialId);
                  if (!material) {
                    throw new BadRequestException('Reçete ham maddesi bulunamadı.');
                  }
                  const yieldRow = item.productionYieldId
                    ? yields.find((row) => row.id === item.productionYieldId)
                    : null;
                  return {
                    sortOrder: Number(item.sortOrder),
                    rawMaterialId: String(item.rawMaterialId),
                    quantity: { toString: () => String(item.quantity) },
                    calculationMode: (item.calculationMode as GenericRecipeItemDto['calculationMode']) ?? null,
                    quantityUnit: item.quantityUnit == null ? null : String(item.quantityUnit),
                    wasteRate:
                      item.wasteRate == null || item.wasteRate === ''
                        ? null
                        : { toString: () => String(item.wasteRate) },
                    productionYieldId:
                      item.productionYieldId == null ? null : String(item.productionYieldId),
                    rawMaterial: {
                      id: String(material.id),
                      code: String(material.code),
                      name: String(material.name),
                      priceBasis: asPriceBasis(material.priceBasis),
                      isActive: material.isActive === true,
                      prices: prices
                        .filter((price) => price.rawMaterialId === material.id)
                        .map(materialPriceRowFromFirestore),
                    },
                    productionYield: yieldRow
                      ? { netQty: Number(yieldRow.netQty), isActive: yieldRow.isActive === true }
                      : null,
                  };
                }),
              },
            ];
          }),
        };
      }),
    };
  }

  async loadExtras(
    productGroupId: string,
    productId: string | null,
    now: Date,
  ) {
    const [values, types] = await Promise.all([
      this.listDocs(FIRESTORE_COLLECTIONS.extraCostValues),
      this.listDocs(FIRESTORE_COLLECTIONS.extraCostTypes),
    ]);
    const typeById = new Map(types.map((row) => [String(row.id), row]));
    const rows: ExtraCostPrecedenceRow[] = values.map((value) => {
      const type = typeById.get(String(value.extraCostTypeId));
      return {
        id: String(value.id),
        extraCostTypeId: String(value.extraCostTypeId),
        typeCode: String(type?.code ?? ''),
        typeName: String(type?.name ?? ''),
        typeIsActive: type?.isActive === true,
        productGroupId: value.productGroupId == null ? null : String(value.productGroupId),
        productId: value.productId == null ? null : String(value.productId),
        amount: String(value.amount),
        calculationMode: value.calculationMode as ExtraCostPrecedenceRow['calculationMode'],
        effectiveFrom: value.effectiveFrom instanceof Date
          ? value.effectiveFrom
          : new Date(String(value.effectiveFrom)),
        effectiveTo:
          value.effectiveTo == null
            ? null
            : value.effectiveTo instanceof Date
              ? value.effectiveTo
              : new Date(String(value.effectiveTo)),
        isActive: value.isActive === true,
      };
    });
    return selectExtraCostsByPrecedence(rows, { productGroupId, productId, now });
  }

  async loadGroupPricing(productGroupId: string) {
    const settings = await this.listDocs(FIRESTORE_COLLECTIONS.pricingSettings);
    const groupSetting = settings.find(
      (row) =>
        row.isActive === true &&
        row.productGroupId === productGroupId &&
        (row.productId == null || row.productId === ''),
    );
    const globalSetting = settings.find(
      (row) =>
        row.isActive === true &&
        (row.productGroupId == null || row.productGroupId === '') &&
        (row.productId == null || row.productId === ''),
    );
    const chosen = groupSetting ?? globalSetting;
    return {
      vatRate: chosen?.vatRate == null || chosen.vatRate === '' ? null : String(chosen.vatRate),
      profitRate: chosen?.profitRate == null || chosen.profitRate === '' ? null : String(chosen.profitRate),
      cardMarkupRate:
        chosen?.cardMarkupRate == null || chosen.cardMarkupRate === ''
          ? null
          : String(chosen.cardMarkupRate),
    };
  }

  async resolveProductProfit(
    productId: string,
    productGroupId: string,
    productSizeId: string,
    productCode: string,
    now: Date,
  ) {
    const [overrides, settings] = await Promise.all([
      this.listDocs(FIRESTORE_COLLECTIONS.productPricingOverrides),
      this.listDocs(FIRESTORE_COLLECTIONS.pricingSettings),
    ]);
    return resolveProfitRateFromFirestoreDocs({
      productId,
      productGroupId,
      productSizeId,
      productCode,
      now,
      overrides,
      settings,
      required: false,
    });
  }

  async resolvePreviewItems(
    items: GenericRecipeItemDto[],
    now: Date,
    materialPriceType: MaterialPriceType,
  ): Promise<GenericRecipeItemInput[]> {
    const [materials, prices, yields] = await Promise.all([
      this.listDocs(FIRESTORE_COLLECTIONS.rawMaterials),
      this.listDocs(FIRESTORE_COLLECTIONS.rawMaterialPrices),
      this.listDocs(FIRESTORE_COLLECTIONS.productionYields),
    ]);
    return items.map((item, index) => {
      const material = materials.find((row) => row.id === item.rawMaterialId && row.isActive === true);
      if (!material) {
        throw new BadRequestException(
          'Aktif ham madde seçilmelidir. Yoksa Ham Maddeler ekranından tanımlayın.',
        );
      }
      const priceRows = prices
        .filter((row) => row.rawMaterialId === material.id)
        .map(materialPriceRowFromFirestore);
      const price = resolveCostMaterialPrice(priceRows, now);
      let netQty: number | null = null;
      if (item.productionYieldId) {
        const y = yields.find((row) => row.id === item.productionYieldId);
        if (!y || y.isActive !== true) {
          throw new BadRequestException('ProductionYield aktif değil.');
        }
        netQty = Number(y.netQty);
      } else if (item.newNetQty != null) {
        netQty = item.newNetQty;
      }
      return {
        sortOrder: item.sortOrder ?? index + 1,
        rawMaterialId: String(material.id),
        rawMaterialCode: String(material.code),
        rawMaterialName: String(material.name),
        priceBasis: asPriceBasis(material.priceBasis),
        unitPrice: price ? price.price.toString() : null,
        calculationMode: item.calculationMode,
        quantity: item.quantity,
        quantityUnit: item.quantityUnit,
        wasteRate: item.wasteRate,
        netQty,
        productionYieldId: item.productionYieldId,
      };
    });
  }

  async copyRecipeItems(productId: string, fromSizeId: string): Promise<GenericRecipeItemDto[]> {
    const [recipes, items] = await Promise.all([
      this.listDocs(FIRESTORE_COLLECTIONS.recipes),
      this.listDocs(FIRESTORE_COLLECTIONS.recipeItems),
    ]);
    const resolved = resolveRecipeWithItems(
      recipes.map((row) => ({
        id: String(row.id),
        productId: String(row.productId),
        productSizeId: String(row.productSizeId),
        name: String(row.name),
        isActive: row.isActive === true,
      })),
      items.map((row) => ({
        id: String(row.id),
        recipeId: String(row.recipeId),
        rawMaterialId: String(row.rawMaterialId),
        productionYieldId: row.productionYieldId == null ? null : String(row.productionYieldId),
        quantity: String(row.quantity),
        calculationMode: row.calculationMode as GenericRecipeItemDto['calculationMode'],
        quantityUnit: row.quantityUnit == null ? null : String(row.quantityUnit),
        wasteRate: row.wasteRate == null ? null : String(row.wasteRate),
        sortOrder: Number(row.sortOrder),
      })),
      productId,
      fromSizeId,
    );
    if (!resolved || resolved.items.length === 0) {
      throw new BadRequestException('Kopyalanacak aktif reçete bulunamadı.');
    }
    try {
      return copyRecipeItemsDeep(resolved.items);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Reçete kopyalanamadı.',
      );
    }
  }

  async saveCatalog(dto: CreateCatalogItemDto) {
    try {
      if (dto.mode === 'NEW_GROUP') {
        return await this.saveNewGroup(dto);
      }
      const groupCode = dto.productGroupCode?.trim();
      if (!groupCode) {
        throw new BadRequestException('productGroupCode zorunludur.');
      }
      const groups = await this.listDocs(FIRESTORE_COLLECTIONS.productGroups);
      const group = groups.find((row) => row.code === groupCode);
      if (!group || group.isActive !== true) {
        throw new NotFoundException(`Aktif ürün grubu bulunamadı: ${groupCode}`);
      }
      if (SPECIAL_CALCULATORS.has(String(group.calculatorType))) {
        throw new BadRequestException('SPECIAL_PATH_REQUIRED');
      }
      if (group.calculatorType !== CalculatorType.GENERIC_RECIPE) {
        throw new BadRequestException(`Desteklenmeyen calculatorType: ${group.calculatorType}`);
      }
      const groupRef = {
        id: String(group.id),
        code: String(group.code),
        name: String(group.name),
        calculatorType: group.calculatorType as CalculatorType,
      };
      if (dto.mode === 'NEW_PRODUCT') {
        return await this.saveNewProduct(groupRef, dto);
      }
      return await this.saveNewSize(groupRef, dto);
    } catch (error) {
      rethrowStore(error);
    }
  }

  async deactivate(dto: DeactivateCatalogItemDto) {
    const reason = dto.reason?.trim() || 'Kullanıcı tarafından kaldırıldı';
    try {
      if (dto.target === 'SIZE') {
        return await this.deactivateSize(dto.recipeId!, reason);
      }
      if (dto.target === 'PRODUCT') {
        return await this.deactivateProduct(dto.productId!, reason);
      }
      return await this.deactivateGroup(dto.productGroupCode!, reason);
    } catch (error) {
      rethrowStore(error);
    }
  }

  async findProductById(productId: string) {
    const product = await this.store.getById(FIRESTORE_COLLECTIONS.products, productId);
    if (!product || product.isActive !== true) {
      return null;
    }
    const group = await this.store.getById(
      FIRESTORE_COLLECTIONS.productGroups,
      String(product.productGroupId),
    );
    if (!group || group.isActive !== true) {
      return null;
    }
    return { product, group };
  }

  async findSizeRecipe(productId: string, widthMm: number, lengthMm: number) {
    const sizes = await this.listDocs(FIRESTORE_COLLECTIONS.productSizes);
    const size = sizes.find(
      (row) => Number(row.widthMm) === widthMm && Number(row.lengthMm) === lengthMm,
    );
    if (!size) {
      return null;
    }
    const recipes = await this.listDocs(FIRESTORE_COLLECTIONS.recipes);
    const recipe = recipes.find(
      (row) =>
        row.productId === productId && row.productSizeId === size.id && row.isActive === true,
    );
    if (!recipe) {
      return null;
    }
    const graph = await this.loadActiveGenericGroupForProduct(productId);
    const product = graph.products.find((row) => row.id === productId);
    const recipeNode = product?.recipes.find((row) => row.id === recipe.id);
    if (!product || !recipeNode) {
      return null;
    }
    return { group: graph.group, product, size: recipeNode.productSize, items: recipeNode.items };
  }

  private async loadActiveGenericGroupForProduct(productId: string): Promise<GenericRecipeGraph> {
    const product = await this.store.getById(FIRESTORE_COLLECTIONS.products, productId);
    if (!product) {
      throw new NotFoundException('Aktif ürün bulunamadı.');
    }
    const group = await this.store.getById(
      FIRESTORE_COLLECTIONS.productGroups,
      String(product.productGroupId),
    );
    if (!group) {
      throw new NotFoundException('Aktif ürün bulunamadı.');
    }
    return this.loadActiveGenericGroup(String(group.code));
  }

  private async saveNewGroup(dto: CreateCatalogItemDto) {
    const code = dto.newGroupCode?.trim().toUpperCase();
    const name = dto.newGroupName?.trim();
    if (!code || !name) {
      throw new BadRequestException('newGroupCode ve newGroupName zorunludur.');
    }
    if (RESERVED_GROUP_CODES.has(code) || RESERVED_GROUP_CODES.has(code.toLowerCase())) {
      throw new BadRequestException(`Bu grup kodu özel calculator için ayrılmıştır: ${code}`);
    }
    if (!dto.newProductCode?.trim() || !dto.productName?.trim()) {
      throw new BadRequestException('Yeni grup ile birlikte ilk ürün kodu ve adı zorunludur.');
    }
    if (!dto.recipeItems?.length) {
      throw new BadRequestException('Generic ürün için recipeItems zorunludur.');
    }
    return this.store.runTransaction(async (tx) => {
      const groups = await this.listDocs(FIRESTORE_COLLECTIONS.productGroups);
      if (groups.some((row) => row.code === code)) {
        throw new ConflictException(`Ürün grubu zaten tanımlı: ${code}`);
      }
      const groupId = this.store.createId();
      const productId = this.store.createId();
      await tx.upsert(FIRESTORE_COLLECTIONS.productGroups, groupId, {
        id: groupId,
        code,
        name,
        calculatorType: CalculatorType.GENERIC_RECIPE,
        isActive: dto.isActive !== false,
      });
      await writeAudit(this.store, tx, {
        entityType: 'ProductGroup',
        entityId: groupId,
        action: 'CREATE',
        fieldName: 'code',
        newValue: code,
        reason: dto.reason ?? 'Yeni ürün grubu',
      });
      await tx.upsert(FIRESTORE_COLLECTIONS.products, productId, {
        id: productId,
        productGroupId: groupId,
        code: dto.newProductCode!.trim().toUpperCase(),
        name: dto.productName!.trim(),
        unit: dto.productUnit ?? 'ADET',
        hasSizes: dto.hasSizes !== false,
        isActive: dto.isActive !== false,
      });
      await writeAudit(this.store, tx, {
        entityType: 'Product',
        entityId: productId,
        action: 'CREATE',
        fieldName: 'code',
        newValue: dto.newProductCode!.trim().toUpperCase(),
        reason: dto.reason ?? 'Yeni ürün',
      });
      const sizeResult = await this.createSizeRecipeInTx(
        tx,
        { id: groupId, code, name },
        { id: productId, code: dto.newProductCode!.trim().toUpperCase(), name: dto.productName!.trim() },
        dto,
      );
      return {
        mode: 'NEW_GROUP' as const,
        productGroupCode: code,
        productGroupName: name,
        calculatorType: CalculatorType.GENERIC_RECIPE,
        productCode: dto.newProductCode!.trim().toUpperCase(),
        productName: dto.productName!.trim(),
        ...sizeResult,
        message: 'Ürün grubu, ürün ve ölçü başarıyla eklendi.',
      };
    });
  }

  private async saveNewProduct(
    group: { id: string; code: string; name: string; calculatorType: CalculatorType },
    dto: CreateCatalogItemDto,
  ) {
    const code = dto.newProductCode?.trim().toUpperCase();
    const name = dto.productName?.trim();
    if (!code || !name) {
      throw new BadRequestException('newProductCode ve productName zorunludur.');
    }
    if (!dto.recipeItems?.length && !dto.copyRecipeFromSizeId) {
      throw new BadRequestException('recipeItems zorunludur.');
    }
    if ((!dto.recipeItems || dto.recipeItems.length === 0) && dto.copyRecipeFromSizeId) {
      throw new BadRequestException(
        'Yeni ürün için copyRecipeFromSizeId kullanılamaz; recipeItems gönderin.',
      );
    }
    return this.store.runTransaction(async (tx) => {
      const products = await this.listDocs(FIRESTORE_COLLECTIONS.products);
      if (products.some((row) => row.productGroupId === group.id && row.code === code)) {
        throw new ConflictException(`Ürün zaten tanımlı: ${code}. Yeni ölçü için NEW_SIZE kullanın.`);
      }
      const productId = this.store.createId();
      await tx.upsert(FIRESTORE_COLLECTIONS.products, productId, {
        id: productId,
        productGroupId: group.id,
        code,
        name,
        unit: dto.productUnit ?? 'ADET',
        hasSizes: dto.hasSizes !== false,
        isActive: dto.isActive !== false,
      });
      await writeAudit(this.store, tx, {
        entityType: 'Product',
        entityId: productId,
        action: 'CREATE',
        fieldName: 'code',
        newValue: code,
        reason: dto.reason ?? 'Yeni ürün',
      });
      const sizeResult = await this.createSizeRecipeInTx(
        tx,
        group,
        { id: productId, code, name },
        dto,
      );
      return {
        mode: 'NEW_PRODUCT' as const,
        productGroupCode: group.code,
        productCode: code,
        productName: name,
        ...sizeResult,
        message: 'Ürün ve ölçü başarıyla eklendi.',
      };
    });
  }

  private async saveNewSize(
    group: { id: string; code: string; name: string; calculatorType: CalculatorType },
    dto: CreateCatalogItemDto,
  ) {
    const productCode = dto.productCode?.trim();
    if (!productCode) {
      throw new BadRequestException('productCode zorunludur.');
    }
    const products = await this.listDocs(FIRESTORE_COLLECTIONS.products);
    const product = products.find(
      (row) => row.productGroupId === group.id && row.code === productCode && row.isActive === true,
    );
    if (!product) {
      throw new NotFoundException(`Aktif ürün bulunamadı: ${productCode}`);
    }
    let recipeItems = dto.recipeItems;
    if ((!recipeItems || recipeItems.length === 0) && dto.copyRecipeFromSizeId) {
      recipeItems = await this.copyRecipeItems(String(product.id), dto.copyRecipeFromSizeId);
    }
    if (!recipeItems?.length) {
      throw new BadRequestException(
        'recipeItems zorunludur veya copyRecipeFromSizeId ile kopyalayın.',
      );
    }
    const dtoWithItems = { ...dto, recipeItems };
    return this.store.runTransaction(async (tx) => {
      const sizeResult = await this.createSizeRecipeInTx(
        tx,
        group,
        { id: String(product.id), code: String(product.code), name: String(product.name) },
        dtoWithItems,
      );
      return {
        mode: 'NEW_SIZE' as const,
        productGroupCode: group.code,
        productCode: String(product.code),
        productName: String(product.name),
        ...sizeResult,
        message: 'Ölçü başarıyla eklendi.',
      };
    });
  }

  private async createSizeRecipeInTx(
    tx: StoreTransaction,
    group: { id: string; code: string; name: string },
    product: { id: string; code: string; name: string },
    dto: CreateCatalogItemDto,
  ) {
    const label = displayNameCm(dto.widthMm, dto.lengthMm, dto.displayName);
    const sizes = await this.listDocs(FIRESTORE_COLLECTIONS.productSizes);
    let size = sizes.find(
      (row) => Number(row.widthMm) === dto.widthMm && Number(row.lengthMm) === dto.lengthMm,
    );
    if (!size) {
      const sizeId = this.store.createId();
      size = {
        id: sizeId,
        widthMm: dto.widthMm,
        lengthMm: dto.lengthMm,
        displayName: label,
      };
      await tx.upsert(FIRESTORE_COLLECTIONS.productSizes, sizeId, size);
      await writeAudit(this.store, tx, {
        entityType: 'ProductSize',
        entityId: sizeId,
        action: 'CREATE',
        fieldName: 'displayName',
        newValue: label,
        reason: dto.reason ?? 'Yeni ölçü',
      });
    }
    const recipes = await this.listDocs(FIRESTORE_COLLECTIONS.recipes);
    if (recipes.some((row) => row.productId === product.id && row.productSizeId === size!.id)) {
      throw new ConflictException(`Bu ölçü zaten tanımlı: ${label} (${product.code}).`);
    }
    const recipeItems = dto.recipeItems ?? [];
    const materials = await this.listDocs(FIRESTORE_COLLECTIONS.rawMaterials);
    const yields = [...(await this.listDocs(FIRESTORE_COLLECTIONS.productionYields))];
    const createdItems: Array<{
      rawMaterialId: string;
      productionYieldId: string | null;
      quantity: string;
      calculationMode: GenericRecipeItemDto['calculationMode'];
      quantityUnit: string | null;
      wasteRate: string | null;
      sortOrder: number;
    }> = [];

    for (let i = 0; i < recipeItems.length; i += 1) {
      const item = recipeItems[i];
      const material = materials.find((row) => row.id === item.rawMaterialId);
      if (!material || material.isActive !== true) {
        throw new BadRequestException(
          'Aktif ham madde seçilmelidir. Yoksa Ham Maddeler ekranından tanımlayın.',
        );
      }
      let yieldId = item.productionYieldId ?? null;
      if (item.calculationMode === 'PER_SHEET_YIELD') {
        if (yieldId) {
          const y = yields.find((row) => row.id === yieldId);
          if (!y || y.isActive !== true || y.rawMaterialId !== material.id) {
            throw new BadRequestException('Geçersiz ProductionYield.');
          }
        } else if (item.newNetQty != null) {
          const pieceWidthMm = item.pieceWidthMm ?? dto.widthMm;
          const pieceLengthMm = item.pieceLengthMm ?? dto.lengthMm;
          const existingYield = yields.find(
            (row) =>
              row.isActive === true &&
              (row.productId == null || row.productId === '') &&
              row.rawMaterialId === material.id &&
              Number(row.pieceWidthMm) === pieceWidthMm &&
              Number(row.pieceLengthMm) === pieceLengthMm,
          );
          if (existingYield) {
            if (Number(existingYield.netQty) !== item.newNetQty) {
              throw new ConflictException(
                `Bu ham madde/ölçü için aktif NET zaten ${existingYield.netQty}.`,
              );
            }
            yieldId = String(existingYield.id);
          } else {
            yieldId = this.store.createId();
            const createdYield = {
              id: yieldId,
              productId: null,
              rawMaterialId: material.id,
              pieceWidthMm,
              pieceLengthMm,
              netQty: item.newNetQty,
              isActive: true,
            };
            await tx.upsert(FIRESTORE_COLLECTIONS.productionYields, yieldId, createdYield);
            yields.push(createdYield);
            await writeAudit(this.store, tx, {
              entityType: 'ProductionYield',
              entityId: yieldId,
              action: 'CREATE',
              fieldName: 'netQty',
              newValue: String(item.newNetQty),
              reason: dto.reason ?? 'Generic katalog NET',
            });
          }
        } else {
          throw new BadRequestException(
            'PER_SHEET_YIELD için productionYieldId veya newNetQty zorunludur.',
          );
        }
      }
      createdItems.push({
        rawMaterialId: String(material.id),
        productionYieldId: yieldId,
        quantity: item.quantity,
        calculationMode: item.calculationMode,
        quantityUnit: item.quantityUnit ?? null,
        wasteRate: item.wasteRate ?? null,
        sortOrder: item.sortOrder ?? i + 1,
      });
    }

    const recipeId = this.store.createId();
    await tx.upsert(FIRESTORE_COLLECTIONS.recipes, recipeId, {
      id: recipeId,
      productId: product.id,
      productSizeId: String(size.id),
      name: `${product.code} ${label}`,
      isActive: true,
    });
    for (const item of createdItems) {
      const itemId = this.store.createId();
      await tx.upsert(FIRESTORE_COLLECTIONS.recipeItems, itemId, {
        id: itemId,
        recipeId,
        rawMaterialId: item.rawMaterialId,
        productionYieldId: item.productionYieldId,
        quantity: item.quantity,
        calculationMode: item.calculationMode,
        quantityUnit: item.quantityUnit,
        wasteRate: item.wasteRate,
        sortOrder: item.sortOrder,
      });
    }
    await writeAudit(this.store, tx, {
      entityType: 'Recipe',
      entityId: recipeId,
      action: 'CREATE',
      fieldName: 'catalogItem',
      newValue: JSON.stringify({
        productGroup: group.code,
        productCode: product.code,
        widthMm: dto.widthMm,
        lengthMm: dto.lengthMm,
        itemCount: createdItems.length,
      }),
      reason: dto.reason ?? 'Generic recipe',
    });
    if (dto.extraCosts?.length) {
      await this.createExtraCostsInTx(tx, group.id, product.id, dto.extraCosts, dto.reason);
    }
    return {
      size: {
        id: String(size.id),
        widthMm: Number(size.widthMm),
        lengthMm: Number(size.lengthMm),
        displayName: String(size.displayName),
      },
      recipeId,
    };
  }

  private async createExtraCostsInTx(
    tx: StoreTransaction,
    groupId: string,
    productId: string,
    extras: GenericExtraCostDto[],
    reason?: string,
  ) {
    const now = new Date();
    const types = await this.listDocs(FIRESTORE_COLLECTIONS.extraCostTypes);
    const values = await this.listDocs(FIRESTORE_COLLECTIONS.extraCostValues);
    for (const extra of extras) {
      const type = types.find((row) => row.code === extra.typeCode && row.isActive === true);
      if (!type) {
        throw new BadRequestException(
          `Ek maliyet tipi bulunamadı: ${extra.typeCode}. Mevcut tiplerden seçin.`,
        );
      }
      const productGroupId = extra.scope === 'GROUP' ? groupId : null;
      const scopedProductId = extra.scope === 'PRODUCT' ? productId : null;
      const existing = values
        .filter(
          (row) =>
            row.extraCostTypeId === type.id &&
            (row.productGroupId ?? null) === productGroupId &&
            (row.productId ?? null) === scopedProductId &&
            row.isActive === true &&
            (row.effectiveTo == null || row.effectiveTo === ''),
        )
        .sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)))[0];
      if (
        existing &&
        String(existing.amount) === extra.amount &&
        existing.calculationMode === extra.calculationMode
      ) {
        continue;
      }
      if (existing) {
        await tx.upsert(FIRESTORE_COLLECTIONS.extraCostValues, String(existing.id), {
          ...existing,
          effectiveTo: now,
          isActive: false,
        });
      }
      const createdId = this.store.createId();
      await tx.upsert(FIRESTORE_COLLECTIONS.extraCostValues, createdId, {
        id: createdId,
        extraCostTypeId: type.id,
        productGroupId,
        productId: scopedProductId,
        amount: extra.amount,
        calculationMode: extra.calculationMode,
        effectiveFrom: now,
        effectiveTo: null,
        isActive: true,
      });
      await writeAudit(this.store, tx, {
        entityType: 'ExtraCostValue',
        entityId: createdId,
        action: 'CREATE',
        fieldName: 'amount',
        newValue: extra.amount,
        reason: reason ?? 'Generic ek maliyet',
      });
    }
  }

  private assertGenericGroup(group: { calculatorType: unknown; code: unknown }) {
    if (SPECIAL_CALCULATORS.has(String(group.calculatorType)) || RESERVED_GROUP_CODES.has(String(group.code))) {
      throw new BadRequestException(
        'Özel ürün grupları (Kapı Kasası / Pervaz / Süpürgelik / Çıta) kaldırılamaz.',
      );
    }
    if (group.calculatorType !== CalculatorType.GENERIC_RECIPE) {
      throw new BadRequestException(
        `Yalnız Genel Reçete öğeleri kaldırılabilir (calculatorType=${group.calculatorType}).`,
      );
    }
  }

  private async deactivateSize(recipeId: string, reason: string) {
    const recipe = await this.store.getById(FIRESTORE_COLLECTIONS.recipes, recipeId);
    if (!recipe) {
      throw new NotFoundException('Reçete / ölçü bağlantısı bulunamadı.');
    }
    const product = await this.store.getById(FIRESTORE_COLLECTIONS.products, String(recipe.productId));
    const group = product
      ? await this.store.getById(FIRESTORE_COLLECTIONS.productGroups, String(product.productGroupId))
      : null;
    if (!product || !group) {
      throw new NotFoundException('Reçete / ölçü bağlantısı bulunamadı.');
    }
    this.assertGenericGroup({ calculatorType: group.calculatorType, code: group.code });
    if (recipe.isActive !== true) {
      return {
        target: 'SIZE' as const,
        changed: false,
        recipeId: String(recipe.id),
        productId: String(recipe.productId),
        sizeId: String(recipe.productSizeId),
        message: 'Ölçü zaten pasif.',
      };
    }
    await this.store.runTransaction(async (tx) => {
      await tx.upsert(FIRESTORE_COLLECTIONS.recipes, recipeId, { ...recipe, isActive: false });
      await writeAudit(this.store, tx, {
        entityType: 'Recipe',
        entityId: recipeId,
        action: 'UPDATE',
        fieldName: 'isActive',
        oldValue: 'true',
        newValue: 'false',
        reason,
      });
    });
    return {
      target: 'SIZE' as const,
      changed: true,
      recipeId: String(recipe.id),
      productId: String(recipe.productId),
      sizeId: String(recipe.productSizeId),
      message: 'Ölçü aktif listelerden kaldırıldı.',
    };
  }

  private async deactivateProduct(productId: string, reason: string) {
    const product = await this.store.getById(FIRESTORE_COLLECTIONS.products, productId);
    if (!product) {
      throw new NotFoundException('Ürün bulunamadı.');
    }
    const group = await this.store.getById(
      FIRESTORE_COLLECTIONS.productGroups,
      String(product.productGroupId),
    );
    if (!group) {
      throw new NotFoundException('Ürün bulunamadı.');
    }
    this.assertGenericGroup({ calculatorType: group.calculatorType, code: group.code });
    if (product.isActive !== true) {
      return {
        target: 'PRODUCT' as const,
        changed: false,
        productId,
        productGroupCode: String(group.code),
        message: 'Ürün zaten pasif.',
      };
    }
    await this.store.runTransaction(async (tx) => {
      await tx.upsert(FIRESTORE_COLLECTIONS.products, productId, { ...product, isActive: false });
      await writeAudit(this.store, tx, {
        entityType: 'Product',
        entityId: productId,
        action: 'UPDATE',
        fieldName: 'isActive',
        oldValue: 'true',
        newValue: 'false',
        reason,
      });
    });
    return {
      target: 'PRODUCT' as const,
      changed: true,
      productId,
      productGroupCode: String(group.code),
      message: 'Ürün aktif listelerden kaldırıldı.',
    };
  }

  private async deactivateGroup(productGroupCode: string, reason: string) {
    const groups = await this.listDocs(FIRESTORE_COLLECTIONS.productGroups);
    const group = groups.find((row) => row.code === productGroupCode);
    if (!group) {
      throw new NotFoundException(`Ürün grubu bulunamadı: ${productGroupCode}`);
    }
    this.assertGenericGroup({ calculatorType: group.calculatorType, code: group.code });
    if (group.isActive !== true) {
      return {
        target: 'GROUP' as const,
        changed: false,
        productGroupCode: String(group.code),
        message: 'Ürün grubu zaten pasif.',
      };
    }
    const products = await this.listDocs(FIRESTORE_COLLECTIONS.products);
    if (products.some((row) => row.productGroupId === group.id && row.isActive === true)) {
      throw new BadRequestException('Önce gruptaki aktif ürünleri kaldırın.');
    }
    await this.store.runTransaction(async (tx) => {
      await tx.upsert(FIRESTORE_COLLECTIONS.productGroups, String(group.id), {
        ...group,
        isActive: false,
      });
      await writeAudit(this.store, tx, {
        entityType: 'ProductGroup',
        entityId: String(group.id),
        action: 'UPDATE',
        fieldName: 'isActive',
        oldValue: 'true',
        newValue: 'false',
        reason,
      });
    });
    return {
      target: 'GROUP' as const,
      changed: true,
      productGroupCode: String(group.code),
      message: 'Ürün grubu aktif listelerden kaldırıldı.',
    };
  }
}
