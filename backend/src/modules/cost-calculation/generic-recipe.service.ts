import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CalculatorType,
  MaterialPriceType,
  Prisma,
  ProductUnit,
} from '@prisma/client';
import {
  calculateGenericRecipeCost,
  type GenericExtraCostInput,
  type GenericRecipeCostResult,
  type GenericRecipeItemInput,
  type RecipeCalculationMode,
} from '../../calculation-engine/calculators/generic-recipe-calculator';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { selectCurrentMaterialPrice } from './current-material-price';
import type {
  CreateCatalogItemDto,
  GenericExtraCostDto,
  GenericPreviewDto,
  GenericRecipeItemDto,
} from './dto/create-catalog-item.dto';
import type { DeactivateCatalogItemDto } from './dto/deactivate-catalog-item.dto';
import { resolveCitaMaterialPriceType } from './cita-mdf.service';
import {
  loadProfitRateCatalog,
  resolveCatalogProfitRate,
} from '../pricing/profit-rate-catalog';

const RESERVED_GROUP_CODES = new Set([
  'door_frame',
  'PERVAZ',
  'SUPURGELIK',
  'CITA',
  'KAPI_IMALATI',
]);

const SPECIAL_CALCULATORS = new Set<CalculatorType>([
  CalculatorType.DOOR_FRAME,
  CalculatorType.PERVAZ,
  CalculatorType.SUPURGELIK,
  CalculatorType.CITA,
  CalculatorType.DOOR_BUILD,
]);

function displayNameCm(widthMm: number, lengthMm: number, override?: string): string {
  if (override?.trim()) return override.trim();
  return `${widthMm / 10}×${lengthMm / 10}`;
}

function assertPositiveInt(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${name} pozitif tam sayı olmalıdır.`);
  }
}

@Injectable()
export class GenericRecipeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listCostRows(
    productGroupCode: string,
    materialPriceTypeInput?: string | null,
    now: Date = new Date(),
  ) {
    const materialPriceType = resolveCitaMaterialPriceType(materialPriceTypeInput);
    const group = await this.prisma.productGroup.findUnique({
      where: { code: productGroupCode },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          include: {
            recipes: {
              where: { isActive: true },
              include: {
                productSize: true,
                items: {
                  orderBy: { sortOrder: 'asc' },
                  include: {
                    rawMaterial: { include: { prices: true } },
                    productionYield: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!group?.isActive) {
      throw new NotFoundException(`Aktif ürün grubu bulunamadı: ${productGroupCode}`);
    }
    if (group.calculatorType !== CalculatorType.GENERIC_RECIPE) {
      throw new BadRequestException(
        `${productGroupCode} GENERIC_RECIPE değil (calculatorType=${group.calculatorType}).`,
      );
    }

    const pricing = await this.resolveGroupPricing(group.id, now);

    const rows: Array<GenericRecipeCostResult & { recipeId: string; productId: string; sizeId: string }> = [];
    for (const product of group.products) {
      // Ürün-scope ExtraCost group’u ezer; liste satırında productId ile yüklenmeli.
      const extras = await this.loadExtrasForGroup(group.id, product.id, now);
      const profitCatalog = await loadProfitRateCatalog(
        this.prisma,
        product.id,
        group.id,
      );
      for (const recipe of product.recipes) {
        const resolvedProfit = resolveCatalogProfitRate({
          catalog: profitCatalog,
          now,
          productCode: product.code,
          productSizeId: recipe.productSizeId,
          required: false,
        });
        const computed = await this.computeFromRecipeEntities({
          group,
          product,
          size: recipe.productSize,
          items: recipe.items,
          extras,
          pricing: {
            ...pricing,
            profitRate: resolvedProfit.profitRate ?? pricing.profitRate,
          },
          materialPriceType,
          now,
        });
        rows.push({
          ...computed,
          recipeId: recipe.id,
          productId: product.id,
          sizeId: recipe.productSizeId,
        });
      }
    }

    return {
      productGroupCode: group.code,
      productGroupName: group.name,
      calculatorType: group.calculatorType,
      materialPriceType,
      rows,
    };
  }

  async preview(dto: GenericPreviewDto, now: Date = new Date()) {
    assertPositiveInt('widthMm', dto.widthMm);
    assertPositiveInt('lengthMm', dto.lengthMm);
    const materialPriceType = resolveCitaMaterialPriceType(dto.materialPriceType);
    const items = await this.resolvePreviewItems(dto.recipeItems, now, materialPriceType);
    const extras = this.mapExtraDtos(dto.extraCosts ?? []);

    let vatRate = dto.vatRate ?? null;
    let profitRate = dto.profitRate ?? null;
    let cardMarkupRate = dto.cardMarkupRate ?? null;
    if (dto.productGroupCode) {
      const group = await this.prisma.productGroup.findUnique({
        where: { code: dto.productGroupCode },
      });
      if (group) {
        const pricing = await this.resolveGroupPricing(group.id, now);
        vatRate = vatRate ?? pricing.vatRate;
        profitRate = profitRate ?? pricing.profitRate;
        cardMarkupRate = cardMarkupRate ?? pricing.cardMarkupRate;
      }
    }

    return calculateGenericRecipeCost({
      productGroupCode: dto.productGroupCode ?? 'PREVIEW',
      productGroupName: dto.productGroupName ?? 'Önizleme',
      productCode: dto.productCode ?? 'PREVIEW',
      productName: dto.productName ?? 'Önizleme ürünü',
      productUnit: dto.productUnit ?? 'ADET',
      widthMm: dto.widthMm,
      lengthMm: dto.lengthMm,
      displayName: displayNameCm(dto.widthMm, dto.lengthMm, dto.displayName),
      materialPriceType,
      items,
      extraCosts: extras,
      vatRate,
      profitRate,
      cardMarkupRate,
    });
  }

  async quoteByProductSize(input: {
    productId: string;
    widthMm: number;
    lengthMm: number;
    materialPriceType?: string | null;
    now?: Date;
  }): Promise<GenericRecipeCostResult> {
    const now = input.now ?? new Date();
    const materialPriceType = resolveCitaMaterialPriceType(input.materialPriceType);
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, isActive: true },
      include: { productGroup: true },
    });
    if (!product?.productGroup.isActive) {
      throw new NotFoundException('Aktif ürün bulunamadı.');
    }
    if (product.productGroup.calculatorType !== CalculatorType.GENERIC_RECIPE) {
      throw new BadRequestException('Ürün GENERIC_RECIPE değil.');
    }
    const size = await this.prisma.productSize.findUnique({
      where: {
        widthMm_lengthMm: {
          widthMm: input.widthMm,
          lengthMm: input.lengthMm,
        },
      },
    });
    if (!size) {
      throw new BadRequestException('Ölçü bulunamadı.');
    }
    const recipe = await this.prisma.recipe.findUnique({
      where: {
        productId_productSizeId: {
          productId: product.id,
          productSizeId: size.id,
        },
      },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            rawMaterial: { include: { prices: true } },
            productionYield: true,
          },
        },
      },
    });
    if (!recipe?.isActive || recipe.items.length === 0) {
      throw new BadRequestException('Aktif reçete bulunamadı.');
    }
    const pricing = await this.resolveGroupPricing(product.productGroupId, now);
    const profitCatalog = await loadProfitRateCatalog(
      this.prisma,
      product.id,
      product.productGroupId,
    );
    const resolvedProfit = resolveCatalogProfitRate({
      catalog: profitCatalog,
      now,
      productCode: product.code,
      productSizeId: size.id,
      required: false,
    });
    const extras = await this.loadExtrasForGroup(
      product.productGroupId,
      product.id,
      now,
    );
    return this.computeFromRecipeEntities({
      group: product.productGroup,
      product,
      size,
      items: recipe.items,
      extras,
      pricing: {
        ...pricing,
        profitRate: resolvedProfit.profitRate ?? pricing.profitRate,
      },
      materialPriceType,
      now,
    });
  }

  /**
   * Soft-deactivate: isActive=false. Hard delete yok.
   * SIZE → Recipe (product×size catalog bağlantısı; ProductSize paylaşılır, dokunulmaz)
   * PRODUCT → Product
   * GROUP → ProductGroup (yalnız aktif ürün yoksa)
   */
  async deactivateCatalogItem(dto: DeactivateCatalogItemDto) {
    const reason = dto.reason?.trim() || 'Kullanıcı tarafından kaldırıldı';

    if (dto.target === 'SIZE') {
      return this.deactivateSize(dto.recipeId!, reason);
    }
    if (dto.target === 'PRODUCT') {
      return this.deactivateProduct(dto.productId!, reason);
    }
    return this.deactivateGroup(dto.productGroupCode!, reason);
  }

  private assertGenericGroup(group: {
    calculatorType: CalculatorType;
    code: string;
  }) {
    if (SPECIAL_CALCULATORS.has(group.calculatorType) || RESERVED_GROUP_CODES.has(group.code)) {
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
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        product: { include: { productGroup: true } },
        productSize: true,
      },
    });
    if (!recipe) {
      throw new NotFoundException('Reçete / ölçü bağlantısı bulunamadı.');
    }
    this.assertGenericGroup(recipe.product.productGroup);

    if (!recipe.isActive) {
      return {
        target: 'SIZE' as const,
        changed: false,
        recipeId: recipe.id,
        productId: recipe.productId,
        sizeId: recipe.productSizeId,
        message: 'Ölçü zaten pasif.',
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.recipe.update({
        where: { id: recipe.id },
        data: { isActive: false },
      });
      await this.auditService.record(
        {
          entityType: 'Recipe',
          entityId: recipe.id,
          action: AuditAction.UPDATE,
          fieldName: 'isActive',
          oldValue: 'true',
          newValue: 'false',
          reason,
        },
        tx,
      );
    });

    return {
      target: 'SIZE' as const,
      changed: true,
      recipeId: recipe.id,
      productId: recipe.productId,
      sizeId: recipe.productSizeId,
      message: 'Ölçü aktif listelerden kaldırıldı.',
    };
  }

  private async deactivateProduct(productId: string, reason: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { productGroup: true },
    });
    if (!product) {
      throw new NotFoundException('Ürün bulunamadı.');
    }
    this.assertGenericGroup(product.productGroup);

    if (!product.isActive) {
      return {
        target: 'PRODUCT' as const,
        changed: false,
        productId: product.id,
        productGroupCode: product.productGroup.code,
        message: 'Ürün zaten pasif.',
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: product.id },
        data: { isActive: false },
      });
      await this.auditService.record(
        {
          entityType: 'Product',
          entityId: product.id,
          action: AuditAction.UPDATE,
          fieldName: 'isActive',
          oldValue: 'true',
          newValue: 'false',
          reason,
        },
        tx,
      );
    });

    return {
      target: 'PRODUCT' as const,
      changed: true,
      productId: product.id,
      productGroupCode: product.productGroup.code,
      message: 'Ürün aktif listelerden kaldırıldı.',
    };
  }

  private async deactivateGroup(productGroupCode: string, reason: string) {
    const group = await this.prisma.productGroup.findUnique({
      where: { code: productGroupCode },
    });
    if (!group) {
      throw new NotFoundException(`Ürün grubu bulunamadı: ${productGroupCode}`);
    }
    this.assertGenericGroup(group);

    if (!group.isActive) {
      return {
        target: 'GROUP' as const,
        changed: false,
        productGroupCode: group.code,
        message: 'Ürün grubu zaten pasif.',
      };
    }

    const activeCount = await this.prisma.product.count({
      where: { productGroupId: group.id, isActive: true },
    });
    if (activeCount > 0) {
      throw new BadRequestException(
        'Önce gruptaki aktif ürünleri kaldırın.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productGroup.update({
        where: { id: group.id },
        data: { isActive: false },
      });
      await this.auditService.record(
        {
          entityType: 'ProductGroup',
          entityId: group.id,
          action: AuditAction.UPDATE,
          fieldName: 'isActive',
          oldValue: 'true',
          newValue: 'false',
          reason,
        },
        tx,
      );
    });

    return {
      target: 'GROUP' as const,
      changed: true,
      productGroupCode: group.code,
      message: 'Ürün grubu aktif listelerden kaldırıldı.',
    };
  }

  /**
   * Generic NEW_GROUP / NEW_PRODUCT / NEW_SIZE kaydı.
   * Special calculator grupları CatalogItemsService’e bırakılır.
   */
  async saveCatalog(dto: CreateCatalogItemDto) {
    assertPositiveInt('widthMm', dto.widthMm);
    assertPositiveInt('lengthMm', dto.lengthMm);

    if (dto.mode === 'NEW_GROUP') {
      return this.saveNewGroup(dto);
    }

    const groupCode = dto.productGroupCode?.trim();
    if (!groupCode) {
      throw new BadRequestException('productGroupCode zorunludur.');
    }
    const group = await this.prisma.productGroup.findUnique({
      where: { code: groupCode },
    });
    if (!group?.isActive) {
      throw new NotFoundException(`Aktif ürün grubu bulunamadı: ${groupCode}`);
    }
    if (SPECIAL_CALCULATORS.has(group.calculatorType)) {
      throw new BadRequestException(
        'SPECIAL_PATH_REQUIRED',
      );
    }
    if (group.calculatorType !== CalculatorType.GENERIC_RECIPE) {
      throw new BadRequestException(
        `Desteklenmeyen calculatorType: ${group.calculatorType}`,
      );
    }

    if (dto.mode === 'NEW_PRODUCT') {
      return this.saveNewProduct(group, dto);
    }
    return this.saveNewSize(group, dto);
  }

  private async saveNewGroup(dto: CreateCatalogItemDto) {
    const code = dto.newGroupCode?.trim().toUpperCase();
    const name = dto.newGroupName?.trim();
    if (!code || !name) {
      throw new BadRequestException('newGroupCode ve newGroupName zorunludur.');
    }
    if (RESERVED_GROUP_CODES.has(code) || RESERVED_GROUP_CODES.has(code.toLowerCase())) {
      throw new BadRequestException(
        `Bu grup kodu özel calculator için ayrılmıştır: ${code}`,
      );
    }
    const existing = await this.prisma.productGroup.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException(`Ürün grubu zaten tanımlı: ${code}`);
    }
    if (!dto.newProductCode?.trim() || !dto.productName?.trim()) {
      throw new BadRequestException(
        'Yeni grup ile birlikte ilk ürün kodu ve adı zorunludur.',
      );
    }
    if (!dto.recipeItems?.length) {
      throw new BadRequestException('Generic ürün için recipeItems zorunludur.');
    }

    // Preview önce — bozuk kayıt bırakma
    await this.preview({
      productGroupCode: code,
      productGroupName: name,
      productCode: dto.newProductCode,
      productName: dto.productName,
      productUnit: dto.productUnit ?? 'ADET',
      widthMm: dto.widthMm,
      lengthMm: dto.lengthMm,
      displayName: dto.displayName,
      materialPriceType: dto.materialPriceType,
      recipeItems: dto.recipeItems,
      extraCosts: dto.extraCosts,
    });

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.productGroup.create({
        data: {
          code,
          name,
          calculatorType: CalculatorType.GENERIC_RECIPE,
          isActive: dto.isActive !== false,
        },
      });
      await this.auditService.record(
        {
          entityType: 'ProductGroup',
          entityId: group.id,
          action: AuditAction.CREATE,
          fieldName: 'code',
          newValue: group.code,
          reason: dto.reason ?? 'Yeni ürün grubu',
        },
        tx,
      );

      const product = await tx.product.create({
        data: {
          productGroupId: group.id,
          code: dto.newProductCode!.trim().toUpperCase(),
          name: dto.productName!.trim(),
          unit: (dto.productUnit ?? 'ADET') as ProductUnit,
          hasSizes: dto.hasSizes !== false,
          isActive: dto.isActive !== false,
        },
      });
      await this.auditService.record(
        {
          entityType: 'Product',
          entityId: product.id,
          action: AuditAction.CREATE,
          fieldName: 'code',
          newValue: product.code,
          reason: dto.reason ?? 'Yeni ürün',
        },
        tx,
      );

      const sizeResult = await this.createSizeRecipeInTx(tx, group, product, dto);
      return {
        mode: 'NEW_GROUP' as const,
        productGroupCode: group.code,
        productGroupName: group.name,
        calculatorType: group.calculatorType,
        productCode: product.code,
        productName: product.name,
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
    const existing = await this.prisma.product.findUnique({
      where: {
        productGroupId_code: { productGroupId: group.id, code },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Ürün zaten tanımlı: ${code}. Yeni ölçü için NEW_SIZE kullanın.`,
      );
    }
    if (!dto.recipeItems?.length && !dto.copyRecipeFromSizeId) {
      throw new BadRequestException('recipeItems zorunludur.');
    }

    let recipeItems = dto.recipeItems;
    if ((!recipeItems || recipeItems.length === 0) && dto.copyRecipeFromSizeId) {
      // NEW_PRODUCT + kopya: ürün henüz yok; kopya kaynak productId gerekir → reddet
      throw new BadRequestException(
        'Yeni ürün için copyRecipeFromSizeId kullanılamaz; recipeItems gönderin.',
      );
    }

    await this.preview({
      productGroupCode: group.code,
      productGroupName: group.name,
      productCode: code,
      productName: name,
      productUnit: dto.productUnit ?? 'ADET',
      widthMm: dto.widthMm,
      lengthMm: dto.lengthMm,
      displayName: dto.displayName,
      materialPriceType: dto.materialPriceType,
      recipeItems: recipeItems!,
      extraCosts: dto.extraCosts,
    });

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          productGroupId: group.id,
          code,
          name,
          unit: (dto.productUnit ?? 'ADET') as ProductUnit,
          hasSizes: dto.hasSizes !== false,
          isActive: dto.isActive !== false,
        },
      });
      await this.auditService.record(
        {
          entityType: 'Product',
          entityId: product.id,
          action: AuditAction.CREATE,
          fieldName: 'code',
          newValue: product.code,
          reason: dto.reason ?? 'Yeni ürün',
        },
        tx,
      );
      const sizeResult = await this.createSizeRecipeInTx(tx, group, product, dto);
      return {
        mode: 'NEW_PRODUCT' as const,
        productGroupCode: group.code,
        productCode: product.code,
        productName: product.name,
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
    const product = await this.prisma.product.findUnique({
      where: {
        productGroupId_code: { productGroupId: group.id, code: productCode },
      },
    });
    if (!product?.isActive) {
      throw new NotFoundException(`Aktif ürün bulunamadı: ${productCode}`);
    }

    let recipeItems = dto.recipeItems;
    if ((!recipeItems || recipeItems.length === 0) && dto.copyRecipeFromSizeId) {
      recipeItems = await this.copyRecipeItemsDto(
        product.id,
        dto.copyRecipeFromSizeId,
      );
    }
    if (!recipeItems?.length) {
      throw new BadRequestException(
        'recipeItems zorunludur veya copyRecipeFromSizeId ile kopyalayın.',
      );
    }
    const dtoWithItems = { ...dto, recipeItems };

    await this.preview({
      productGroupCode: group.code,
      productGroupName: group.name,
      productCode: product.code,
      productName: product.name,
      productUnit: product.unit,
      widthMm: dto.widthMm,
      lengthMm: dto.lengthMm,
      displayName: dto.displayName,
      materialPriceType: dto.materialPriceType,
      recipeItems,
      extraCosts: dto.extraCosts,
    });

    return this.prisma.$transaction(async (tx) => {
      const sizeResult = await this.createSizeRecipeInTx(
        tx,
        group,
        product,
        dtoWithItems,
      );
      return {
        mode: 'NEW_SIZE' as const,
        productGroupCode: group.code,
        productCode: product.code,
        productName: product.name,
        ...sizeResult,
        message: 'Ölçü başarıyla eklendi.',
      };
    });
  }

  private async createSizeRecipeInTx(
    tx: Prisma.TransactionClient,
    group: { id: string; code: string; name: string },
    product: { id: string; code: string; name: string; unit?: ProductUnit },
    dto: CreateCatalogItemDto,
  ) {
    const label = displayNameCm(dto.widthMm, dto.lengthMm, dto.displayName);
    let size = await tx.productSize.findUnique({
      where: {
        widthMm_lengthMm: { widthMm: dto.widthMm, lengthMm: dto.lengthMm },
      },
    });
    if (!size) {
      size = await tx.productSize.create({
        data: {
          widthMm: dto.widthMm,
          lengthMm: dto.lengthMm,
          displayName: label,
        },
      });
      await this.auditService.record(
        {
          entityType: 'ProductSize',
          entityId: size.id,
          action: AuditAction.CREATE,
          fieldName: 'displayName',
          newValue: size.displayName,
          reason: dto.reason ?? 'Yeni ölçü',
        },
        tx,
      );
    }

    const existingRecipe = await tx.recipe.findUnique({
      where: {
        productId_productSizeId: {
          productId: product.id,
          productSizeId: size.id,
        },
      },
    });
    if (existingRecipe) {
      throw new ConflictException(
        `Bu ölçü zaten tanımlı: ${label} (${product.code}).`,
      );
    }

    const recipeItems = dto.recipeItems ?? [];
    const createdItems: Array<{
      rawMaterialId: string;
      productionYieldId: string | null;
      quantity: Prisma.Decimal;
      calculationMode: RecipeCalculationMode;
      quantityUnit: string | null;
      wasteRate: Prisma.Decimal | null;
      sortOrder: number;
    }> = [];

    for (let i = 0; i < recipeItems.length; i++) {
      const item = recipeItems[i];
      const material = await tx.rawMaterial.findUnique({
        where: { id: item.rawMaterialId },
      });
      if (!material?.isActive) {
        throw new BadRequestException(
          'Aktif ham madde seçilmelidir. Yoksa Ham Maddeler ekranından tanımlayın.',
        );
      }
      let yieldId = item.productionYieldId ?? null;
      if (item.calculationMode === 'PER_SHEET_YIELD') {
        if (yieldId) {
          const y = await tx.productionYield.findUnique({ where: { id: yieldId } });
          if (!y?.isActive || y.rawMaterialId !== material.id) {
            throw new BadRequestException('Geçersiz ProductionYield.');
          }
        } else if (item.newNetQty != null) {
          const pieceWidthMm = item.pieceWidthMm ?? dto.widthMm;
          const pieceLengthMm = item.pieceLengthMm ?? dto.lengthMm;
          const existingYield = await tx.productionYield.findFirst({
            where: {
              productId: null,
              isActive: true,
              rawMaterialId: material.id,
              pieceWidthMm,
              pieceLengthMm,
            },
          });
          if (existingYield) {
            if (existingYield.netQty !== item.newNetQty) {
              throw new ConflictException(
                `Bu ham madde/ölçü için aktif NET zaten ${existingYield.netQty}.`,
              );
            }
            yieldId = existingYield.id;
          } else {
            const created = await tx.productionYield.create({
              data: {
                productId: null,
                rawMaterialId: material.id,
                pieceWidthMm,
                pieceLengthMm,
                netQty: item.newNetQty,
                isActive: true,
              },
            });
            await this.auditService.record(
              {
                entityType: 'ProductionYield',
                entityId: created.id,
                action: AuditAction.CREATE,
                fieldName: 'netQty',
                newValue: String(created.netQty),
                reason: dto.reason ?? 'Generic katalog NET',
              },
              tx,
            );
            yieldId = created.id;
          }
        } else {
          throw new BadRequestException(
            'PER_SHEET_YIELD için productionYieldId veya newNetQty zorunludur.',
          );
        }
      }

      const qty = new Prisma.Decimal(item.quantity);
      if (qty.lte(0)) {
        throw new BadRequestException('quantity > 0 olmalıdır.');
      }

      createdItems.push({
        rawMaterialId: material.id,
        productionYieldId: yieldId,
        quantity: qty,
        calculationMode: item.calculationMode,
        quantityUnit: item.quantityUnit ?? null,
        wasteRate:
          item.wasteRate != null && item.wasteRate !== ''
            ? new Prisma.Decimal(item.wasteRate)
            : null,
        sortOrder: item.sortOrder ?? i + 1,
      });
    }

    const recipe = await tx.recipe.create({
      data: {
        productId: product.id,
        productSizeId: size.id,
        name: `${product.code} ${label}`,
        isActive: true,
        items: {
          create: createdItems.map((item) => ({
            rawMaterialId: item.rawMaterialId,
            productionYieldId: item.productionYieldId,
            quantity: item.quantity,
            calculationMode: item.calculationMode,
            quantityUnit: item.quantityUnit,
            wasteRate: item.wasteRate,
            sortOrder: item.sortOrder,
          })),
        },
      },
    });
    await this.auditService.record(
      {
        entityType: 'Recipe',
        entityId: recipe.id,
        action: AuditAction.CREATE,
        fieldName: 'catalogItem',
        newValue: JSON.stringify({
          productGroup: group.code,
          productCode: product.code,
          widthMm: dto.widthMm,
          lengthMm: dto.lengthMm,
          itemCount: createdItems.length,
        }),
        reason: dto.reason ?? 'Generic recipe',
      },
      tx,
    );

    if (dto.extraCosts?.length) {
      await this.createExtraCostsInTx(tx, group.id, product.id, dto.extraCosts, dto.reason);
    }

    return {
      size: {
        id: size.id,
        widthMm: size.widthMm,
        lengthMm: size.lengthMm,
        displayName: size.displayName,
      },
      recipeId: recipe.id,
    };
  }

  private async createExtraCostsInTx(
    tx: Prisma.TransactionClient,
    groupId: string,
    productId: string,
    extras: GenericExtraCostDto[],
    reason?: string,
  ) {
    const now = new Date();
    for (const extra of extras) {
      const type = await tx.extraCostType.findFirst({
        where: { code: extra.typeCode, isActive: true },
      });
      if (!type) {
        throw new BadRequestException(
          `Ek maliyet tipi bulunamadı: ${extra.typeCode}. Mevcut tiplerden seçin.`,
        );
      }
      const amount = new Prisma.Decimal(extra.amount);
      if (amount.lt(0)) {
        throw new BadRequestException(`${extra.typeCode} tutarı negatif olamaz.`);
      }
      const data =
        extra.scope === 'GROUP'
          ? {
              extraCostTypeId: type.id,
              productGroupId: groupId,
              productId: null as string | null,
              amount,
              calculationMode: extra.calculationMode,
              effectiveFrom: now,
              isActive: true,
            }
          : {
              extraCostTypeId: type.id,
              productGroupId: null as string | null,
              productId,
              amount,
              calculationMode: extra.calculationMode,
              effectiveFrom: now,
              isActive: true,
            };

      // NO-OP: aynı scope’ta aynı aktif tutar varsa tekrar yazma
      const existing = await tx.extraCostValue.findFirst({
        where: {
          extraCostTypeId: type.id,
          productGroupId: data.productGroupId,
          productId: data.productId,
          isActive: true,
          effectiveTo: null,
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (
        existing &&
        existing.amount.equals(amount) &&
        existing.calculationMode === extra.calculationMode
      ) {
        continue;
      }
      if (existing) {
        await tx.extraCostValue.update({
          where: { id: existing.id },
          data: { effectiveTo: now, isActive: false },
        });
      }
      const created = await tx.extraCostValue.create({ data });
      await this.auditService.record(
        {
          entityType: 'ExtraCostValue',
          entityId: created.id,
          action: AuditAction.CREATE,
          fieldName: 'amount',
          newValue: amount.toString(),
          reason: reason ?? 'Generic ek maliyet',
        },
        tx,
      );
    }
  }

  private async copyRecipeItemsDto(
    productId: string,
    fromSizeId: string,
  ): Promise<GenericRecipeItemDto[]> {
    const recipe = await this.prisma.recipe.findUnique({
      where: {
        productId_productSizeId: {
          productId,
          productSizeId: fromSizeId,
        },
      },
      include: {
        items: { orderBy: { sortOrder: 'asc' }, include: { productionYield: true } },
      },
    });
    if (!recipe?.isActive || recipe.items.length === 0) {
      throw new BadRequestException('Kopyalanacak aktif reçete bulunamadı.');
    }
    return recipe.items.map((item) => {
      if (!item.calculationMode) {
        throw new BadRequestException(
          'Kaynak reçete satırında calculationMode yok; generic kopyalama yapılamaz.',
        );
      }
      return {
        rawMaterialId: item.rawMaterialId,
        calculationMode: item.calculationMode,
        quantity: item.quantity.toString(),
        quantityUnit: item.quantityUnit ?? undefined,
        wasteRate: item.wasteRate?.toString(),
        productionYieldId: item.productionYieldId ?? undefined,
        sortOrder: item.sortOrder,
      };
    });
  }

  private async resolvePreviewItems(
    items: GenericRecipeItemDto[],
    now: Date,
    materialPriceType: MaterialPriceType,
  ): Promise<GenericRecipeItemInput[]> {
    const out: GenericRecipeItemInput[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const material = await this.prisma.rawMaterial.findUnique({
        where: { id: item.rawMaterialId },
        include: { prices: true },
      });
      if (!material?.isActive) {
        throw new BadRequestException(
          'Aktif ham madde seçilmelidir. Yoksa Ham Maddeler ekranından tanımlayın.',
        );
      }
      const price = selectCurrentMaterialPrice(
        material.prices,
        materialPriceType,
        now,
      );
      let netQty: number | null = null;
      if (item.productionYieldId) {
        const y = await this.prisma.productionYield.findUnique({
          where: { id: item.productionYieldId },
        });
        if (!y?.isActive) {
          throw new BadRequestException('ProductionYield aktif değil.');
        }
        netQty = y.netQty;
      } else if (item.newNetQty != null) {
        netQty = item.newNetQty;
      }
      out.push({
        sortOrder: item.sortOrder ?? i + 1,
        rawMaterialId: material.id,
        rawMaterialCode: material.code,
        rawMaterialName: material.name,
        priceBasis: material.priceBasis,
        unitPrice: price ? price.price.toString() : null,
        calculationMode: item.calculationMode,
        quantity: item.quantity,
        quantityUnit: item.quantityUnit,
        wasteRate: item.wasteRate,
        netQty,
        productionYieldId: item.productionYieldId,
      });
    }
    return out;
  }

  private mapExtraDtos(extras: GenericExtraCostDto[]): GenericExtraCostInput[] {
    return extras.map((e) => ({
      typeCode: e.typeCode,
      typeName: e.typeCode,
      amount: e.amount,
      calculationMode: e.calculationMode,
      scope: e.scope,
    }));
  }

  private async resolveGroupPricing(groupId: string, now: Date) {
    void now;
    const groupSetting = await this.prisma.pricingSetting.findFirst({
      where: {
        productGroupId: groupId,
        productId: null,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const globalSetting =
      groupSetting ??
      (await this.prisma.pricingSetting.findFirst({
        where: {
          productGroupId: null,
          productId: null,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      }));
    return {
      vatRate: globalSetting?.vatRate?.toString() ?? null,
      profitRate: globalSetting?.profitRate?.toString() ?? null,
      cardMarkupRate: globalSetting?.cardMarkupRate?.toString() ?? null,
    };
  }

  private async loadExtrasForGroup(
    groupId: string,
    productId: string | null,
    now: Date,
  ): Promise<GenericExtraCostInput[]> {
    const values = await this.prisma.extraCostValue.findMany({
      where: {
        isActive: true,
        OR: [
          { productGroupId: groupId, productId: null },
          ...(productId
            ? [{ productGroupId: null as string | null, productId }]
            : []),
        ],
        effectiveFrom: { lte: now },
        AND: [
          {
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
        ],
      },
      include: { extraCostType: true },
      orderBy: { effectiveFrom: 'desc' },
    });

    // product override typeCode bazında group’u ezer
    const byType = new Map<string, (typeof values)[number]>();
    for (const v of values) {
      if (!v.extraCostType.isActive) continue;
      const existing = byType.get(v.extraCostType.code);
      if (!existing) {
        byType.set(v.extraCostType.code, v);
        continue;
      }
      if (v.productId != null && existing.productId == null) {
        byType.set(v.extraCostType.code, v);
      }
    }

    return [...byType.values()].map((v) => ({
      typeCode: v.extraCostType.code,
      typeName: v.extraCostType.name,
      amount: v.amount.toString(),
      calculationMode: v.calculationMode,
      scope: v.productId ? ('PRODUCT' as const) : ('GROUP' as const),
    }));
  }

  private async computeFromRecipeEntities(input: {
    group: { code: string; name: string };
    product: { code: string; name: string; unit: ProductUnit };
    size: { widthMm: number; lengthMm: number; displayName: string };
    items: Array<{
      sortOrder: number;
      rawMaterialId: string;
      quantity: Prisma.Decimal;
      calculationMode: RecipeCalculationMode | null;
      quantityUnit: string | null;
      wasteRate: Prisma.Decimal | null;
      productionYieldId: string | null;
      rawMaterial: {
        id: string;
        code: string;
        name: string;
        priceBasis: GenericRecipeItemInput['priceBasis'];
        isActive: boolean;
        prices: Parameters<typeof selectCurrentMaterialPrice>[0];
      };
      productionYield: { netQty: number; isActive: boolean } | null;
    }>;
    extras: GenericExtraCostInput[];
    pricing: {
      vatRate: string | null;
      profitRate: string | null;
      cardMarkupRate: string | null;
    };
    materialPriceType: MaterialPriceType;
    now: Date;
  }): Promise<GenericRecipeCostResult> {
    const recipeInputs: GenericRecipeItemInput[] = [];
    for (const item of input.items) {
      if (!item.calculationMode) {
        throw new BadRequestException(
          `RecipeItem calculationMode eksik (sortOrder ${item.sortOrder}). ` +
            'Bu hesap tipi generic recipe ile desteklenmiyor.',
        );
      }
      if (!item.rawMaterial.isActive) {
        throw new BadRequestException(
          `Ham madde pasif: ${item.rawMaterial.code}`,
        );
      }
      const price = selectCurrentMaterialPrice(
        item.rawMaterial.prices,
        input.materialPriceType,
        input.now,
      );
      recipeInputs.push({
        sortOrder: item.sortOrder,
        rawMaterialId: item.rawMaterial.id,
        rawMaterialCode: item.rawMaterial.code,
        rawMaterialName: item.rawMaterial.name,
        priceBasis: item.rawMaterial.priceBasis,
        unitPrice: price ? price.price.toString() : null,
        calculationMode: item.calculationMode,
        quantity: item.quantity.toString(),
        quantityUnit: item.quantityUnit,
        wasteRate: item.wasteRate?.toString() ?? null,
        netQty:
          item.productionYield?.isActive === true
            ? item.productionYield.netQty
            : null,
        productionYieldId: item.productionYieldId,
      });
    }

    return calculateGenericRecipeCost({
      productGroupCode: input.group.code,
      productGroupName: input.group.name,
      productCode: input.product.code,
      productName: input.product.name,
      productUnit: input.product.unit,
      widthMm: input.size.widthMm,
      lengthMm: input.size.lengthMm,
      displayName: input.size.displayName,
      materialPriceType: input.materialPriceType,
      items: recipeInputs,
      extraCosts: input.extras,
      vatRate: input.pricing.vatRate,
      profitRate: input.pricing.profitRate,
      cardMarkupRate: input.pricing.cardMarkupRate,
    });
  }
}
