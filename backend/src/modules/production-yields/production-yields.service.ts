import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProductionYieldDto } from './dto/create-production-yield.dto';
import { ListProductionYieldsQueryDto } from './dto/list-production-yields-query.dto';
import { ReplaceProductionYieldDto } from './dto/replace-production-yield.dto';
import { CalculateProductionYieldDto } from './dto/calculate-production-yield.dto';
import {
  calculateDoorFrameSuggestedQty,
  YieldCalculationResult,
} from './production-yield-calculator';
import {
  collectRowUsages,
  type ProductionYieldUsage,
  type YieldUsageProduct,
} from './production-yield-usage';

const ENTITY_TYPE = 'ProductionYield';

const yieldListInclude = {
  rawMaterial: true,
  product: { include: { productGroup: true } },
  recipeItems: {
    include: {
      recipe: {
        include: {
          product: { include: { productGroup: true } },
        },
      },
    },
  },
} as const;

const yieldWriteInclude = {
  rawMaterial: true,
  product: { include: { productGroup: true } },
} as const;

export type ProductionYieldProductRef = {
  id: string;
  code: string;
  name: string;
  productGroup: {
    id: string;
    code: string;
    name: string;
  };
};

export type ProductionYieldListItem = {
  id: string;
  productId: string | null;
  rawMaterialId: string;
  pieceWidthMm: number;
  pieceLengthMm: number;
  netQty: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  rawMaterial: {
    id: string;
    code: string;
    name: string;
    thicknessMm: string;
    sheetWidthMm: number;
    sheetLengthMm: number;
    surfaceType: string | null;
    isActive: boolean;
  };
  product: ProductionYieldProductRef | null;
  usages: ProductionYieldUsage[];
};

@Injectable()
export class ProductionYieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: ListProductionYieldsQueryDto): Promise<ProductionYieldListItem[]> {
    const where: Prisma.ProductionYieldWhereInput = {};

    if (query.rawMaterialId) {
      where.rawMaterialId = query.rawMaterialId;
    }
    if (query.pieceWidth !== undefined) {
      where.pieceWidthMm = query.pieceWidth;
    }
    if (query.pieceLength !== undefined) {
      where.pieceLengthMm = query.pieceLength;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.thickness !== undefined) {
      where.rawMaterial = { thicknessMm: query.thickness };
    }

    const [rows, productSizes, scopedRows, products] = await Promise.all([
      this.prisma.productionYield.findMany({
        where,
        include: yieldListInclude,
        orderBy: [
          { rawMaterial: { thicknessMm: 'asc' } },
          { pieceWidthMm: 'asc' },
          { pieceLengthMm: 'asc' },
        ],
      }),
      this.prisma.productSize.findMany({
        select: { widthMm: true, lengthMm: true },
      }),
      this.prisma.productionYield.findMany({
        where: { productId: { not: null } },
        select: { productId: true },
        distinct: ['productId'],
      }),
      this.prisma.product.findMany({
        where: { isActive: true, productGroup: { isActive: true } },
        include: { productGroup: true },
      }),
    ]);

    const scopedProductIds = new Set(
      scopedRows
        .map((row) => row.productId)
        .filter((id): id is string => id != null),
    );
    const genericConsumerProducts = products.filter(
      (product) => !scopedProductIds.has(product.id),
    ) as YieldUsageProduct[];
    const productSizeKeys = new Set(
      productSizes.map((size) => `${size.widthMm}|${size.lengthMm}`),
    );

    const items = rows.map((row) => {
      const usages = collectRowUsages(row, {
        genericConsumerProducts,
        productSizeKeys,
      });
      return this.toListItem(row, usages);
    });

    const filtered = items.filter((item) => {
      if (query.productId) {
        return item.usages.some((usage) => usage.productId === query.productId);
      }
      if (query.productGroupId) {
        return item.usages.some(
          (usage) => usage.productGroupId === query.productGroupId,
        );
      }
      return true;
    });

    return filtered.sort((a, b) => compareYieldListItems(a, b));
  }

  async findOne(id: string): Promise<ProductionYieldListItem> {
    const row = await this.prisma.productionYield.findUnique({
      where: { id },
      include: yieldListInclude,
    });
    if (!row) {
      throw new NotFoundException(`Production yield bulunamadı: ${id}`);
    }
    const usages = await this.resolveUsagesForRows([row]);
    return this.toListItem(row, usages.get(row.id) ?? []);
  }

  private async resolveUsagesForRows(
    rows: Array<Prisma.ProductionYieldGetPayload<{ include: typeof yieldListInclude }>>,
  ): Promise<Map<string, ProductionYieldUsage[]>> {
    const [productSizes, scopedRows, products] = await Promise.all([
      this.prisma.productSize.findMany({
        select: { widthMm: true, lengthMm: true },
      }),
      this.prisma.productionYield.findMany({
        where: { productId: { not: null } },
        select: { productId: true },
        distinct: ['productId'],
      }),
      this.prisma.product.findMany({
        where: { isActive: true, productGroup: { isActive: true } },
        include: { productGroup: true },
      }),
    ]);

    const scopedProductIds = new Set(
      scopedRows
        .map((row) => row.productId)
        .filter((id): id is string => id != null),
    );
    const genericConsumerProducts = products.filter(
      (product) => !scopedProductIds.has(product.id),
    ) as YieldUsageProduct[];
    const productSizeKeys = new Set(
      productSizes.map((size) => `${size.widthMm}|${size.lengthMm}`),
    );

    return new Map(
      rows.map((row) => [
        row.id,
        collectRowUsages(row, { genericConsumerProducts, productSizeKeys }),
      ]),
    );
  }

  /**
   * Kapı kasası Excel üretim önerisi. Kaydedilen NET adedi türetilmez;
   * kullanıcı kaydettiği değer production_yields master datasıdır.
   */
  async calculateSuggestedQty(
    dto: CalculateProductionYieldDto,
  ): Promise<YieldCalculationResult> {
    if (!Number.isInteger(dto.pieceWidthMm) || dto.pieceWidthMm <= 0) {
      throw new BadRequestException('pieceWidthMm > 0 olmalıdır.');
    }
    if (!Number.isInteger(dto.pieceLengthMm) || dto.pieceLengthMm <= 0) {
      throw new BadRequestException('pieceLengthMm > 0 olmalıdır.');
    }

    const material = await this.prisma.rawMaterial.findUnique({
      where: { id: dto.rawMaterialId },
    });
    if (!material) {
      throw new NotFoundException(`Ham madde bulunamadı: ${dto.rawMaterialId}`);
    }
    if (!material.isActive) {
      throw new BadRequestException(
        `Ham madde (${material.name}) aktif değil. Pasif ham madde için adet önerisi hesaplanamaz.`,
      );
    }

    return calculateDoorFrameSuggestedQty({
      thicknessMm: material.thicknessMm.toString(),
      sheetWidthMm: material.sheetWidthMm,
      sheetLengthMm: material.sheetLengthMm,
      pieceWidthMm: dto.pieceWidthMm,
      pieceLengthMm: dto.pieceLengthMm,
    });
  }

  async create(dto: CreateProductionYieldDto): Promise<ProductionYieldListItem> {
    this.assertPositiveYield(dto);

    const material = await this.prisma.rawMaterial.findUnique({
      where: { id: dto.rawMaterialId },
    });
    if (!material) {
      throw new NotFoundException(`Ham madde bulunamadı: ${dto.rawMaterialId}`);
    }
    if (!material.isActive) {
      throw new BadRequestException(
        `Ham madde (${material.name}) aktif değil. Pasif ham madde için NET adet kaydı oluşturulamaz.`,
      );
    }

    const isActive = dto.isActive ?? true;

    if (isActive) {
      const existingActive = await this.prisma.productionYield.findFirst({
        where: {
          productId: null,
          rawMaterialId: dto.rawMaterialId,
          pieceWidthMm: dto.pieceWidthMm,
          pieceLengthMm: dto.pieceLengthMm,
          isActive: true,
        },
      });
      if (existingActive) {
        throw new ConflictException(
          'Bu ham madde + parça ölçüsü için zaten aktif bir NET adet kaydı var. ' +
            'Aynı aktif kombinasyon tekrar oluşturulamaz.',
        );
      }
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.productionYield.create({
          data: {
            productId: null,
            rawMaterialId: dto.rawMaterialId,
            pieceWidthMm: dto.pieceWidthMm,
            pieceLengthMm: dto.pieceLengthMm,
            netQty: dto.netQty,
            isActive,
          },
          include: yieldWriteInclude,
        });

        await this.auditService.record(
          {
            entityType: ENTITY_TYPE,
            entityId: row.id,
            action: 'CREATE',
            fieldName: null,
            oldValue: null,
            newValue: JSON.stringify({
              rawMaterialId: row.rawMaterialId,
              pieceWidthMm: row.pieceWidthMm,
              pieceLengthMm: row.pieceLengthMm,
              netQty: row.netQty,
              isActive: row.isActive,
            }),
          },
          tx,
        );

        return row;
      });

      return this.toListItem(created);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Bu ham madde + parça ölçüsü için zaten aktif bir NET adet kaydı var.',
        );
      }
      throw err;
    }
  }

  /**
   * Güvenli versioning:
   * 1) eski aktif kayıt → isActive=false
   * 2) aynı rawMaterial + ölçü ile yeni aktif kayıt (yeni netQty)
   * Overwrite yok; eski satır korunur.
   */
  async replace(
    id: string,
    dto: ReplaceProductionYieldDto,
  ): Promise<ProductionYieldListItem> {
    if (!dto.reason?.trim()) {
      throw new BadRequestException('Değişiklik sebebi zorunludur.');
    }
    if (!Number.isInteger(dto.netQty) || dto.netQty <= 0) {
      throw new BadRequestException('netQty > 0 olmalıdır. NET adet formülle türetilmez.');
    }

    const existing = await this.prisma.productionYield.findUnique({
      where: { id },
      include: yieldWriteInclude,
    });
    if (!existing) {
      throw new NotFoundException(`Production yield bulunamadı: ${id}`);
    }
    if (!existing.isActive) {
      throw new BadRequestException(
        'Pasif NET adet kaydı güncellenemez. Yalnızca aktif kayıtlar versioning ile değiştirilebilir.',
      );
    }
    if (!existing.rawMaterial.isActive) {
      throw new BadRequestException(
        `Ham madde (${existing.rawMaterial.name}) aktif değil. Pasif ham madde için NET adet güncellenemez.`,
      );
    }

    const otherActive = await this.prisma.productionYield.findFirst({
      where: {
        id: { not: id },
        productId: existing.productId,
        rawMaterialId: existing.rawMaterialId,
        pieceWidthMm: existing.pieceWidthMm,
        pieceLengthMm: existing.pieceLengthMm,
        isActive: true,
      },
    });
    if (otherActive) {
      throw new ConflictException(
        'Bu ham madde + parça ölçüsü için başka bir aktif NET adet kaydı var. ' +
          'Önce veri tutarsızlığını giderin.',
      );
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.productionYield.update({
          where: { id },
          data: { isActive: false },
        });

        await this.auditService.record(
          {
            entityType: ENTITY_TYPE,
            entityId: id,
            action: 'UPDATE',
            fieldName: 'isActive',
            oldValue: 'true',
            newValue: 'false',
            reason: dto.reason.trim(),
          },
          tx,
        );

        await this.auditService.record(
          {
            entityType: ENTITY_TYPE,
            entityId: id,
            action: 'UPDATE',
            fieldName: 'netQty',
            oldValue: String(existing.netQty),
            newValue: String(dto.netQty),
            reason: dto.reason.trim(),
          },
          tx,
        );

        const row = await tx.productionYield.create({
          data: {
            productId: existing.productId,
            rawMaterialId: existing.rawMaterialId,
            pieceWidthMm: existing.pieceWidthMm,
            pieceLengthMm: existing.pieceLengthMm,
            netQty: dto.netQty,
            isActive: true,
          },
          include: yieldWriteInclude,
        });

        await this.auditService.record(
          {
            entityType: ENTITY_TYPE,
            entityId: row.id,
            action: 'CREATE',
            fieldName: 'netQty',
            oldValue: String(existing.netQty),
            newValue: String(row.netQty),
            reason: dto.reason.trim(),
          },
          tx,
        );

        return row;
      });

      return this.toListItem(created);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Bu ham madde + parça ölçüsü için zaten aktif bir NET adet kaydı var.',
        );
      }
      throw err;
    }
  }

  private assertPositiveYield(dto: CreateProductionYieldDto): void {
    if (!Number.isInteger(dto.pieceWidthMm) || dto.pieceWidthMm <= 0) {
      throw new BadRequestException('pieceWidthMm > 0 olmalıdır.');
    }
    if (!Number.isInteger(dto.pieceLengthMm) || dto.pieceLengthMm <= 0) {
      throw new BadRequestException('pieceLengthMm > 0 olmalıdır.');
    }
    if (!Number.isInteger(dto.netQty) || dto.netQty <= 0) {
      throw new BadRequestException('netQty > 0 olmalıdır. NET adet formülle türetilmez.');
    }
  }

  private toListItem(
    row: {
      id: string;
      productId: string | null;
      rawMaterialId: string;
      pieceWidthMm: number;
      pieceLengthMm: number;
      netQty: number;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
      rawMaterial: {
        id: string;
        code: string;
        name: string;
        thicknessMm: { toString(): string };
        sheetWidthMm: number;
        sheetLengthMm: number;
        surfaceType: string | null;
        isActive: boolean;
      };
      product?: YieldUsageProduct | null;
    },
    usages?: ProductionYieldUsage[],
  ): ProductionYieldListItem {
    const product = row.product ? toProductRef(row.product) : null;
    return {
      id: row.id,
      productId: row.productId,
      rawMaterialId: row.rawMaterialId,
      pieceWidthMm: row.pieceWidthMm,
      pieceLengthMm: row.pieceLengthMm,
      netQty: row.netQty,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      rawMaterial: {
        id: row.rawMaterial.id,
        code: row.rawMaterial.code,
        name: row.rawMaterial.name,
        thicknessMm: row.rawMaterial.thicknessMm.toString(),
        sheetWidthMm: row.rawMaterial.sheetWidthMm,
        sheetLengthMm: row.rawMaterial.sheetLengthMm,
        surfaceType: row.rawMaterial.surfaceType,
        isActive: row.rawMaterial.isActive,
      },
      product,
      usages:
        usages ??
        (product
          ? [
              {
                productId: product.id,
                productCode: product.code,
                productName: product.name,
                productGroupId: product.productGroup.id,
                productGroupCode: product.productGroup.code,
                productGroupName: product.productGroup.name,
                source: 'PRODUCT_SCOPED',
              },
            ]
          : []),
    };
  }
}

function toProductRef(product: YieldUsageProduct): ProductionYieldProductRef {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    productGroup: {
      id: product.productGroup.id,
      code: product.productGroup.code,
      name: product.productGroup.name,
    },
  };
}

function compareYieldListItems(
  a: ProductionYieldListItem,
  b: ProductionYieldListItem,
): number {
  const aGroup = a.usages[0]?.productGroupName ?? '';
  const bGroup = b.usages[0]?.productGroupName ?? '';
  const aProduct = a.usages[0]?.productName ?? '';
  const bProduct = b.usages[0]?.productName ?? '';
  return (
    aGroup.localeCompare(bGroup, 'tr') ||
    aProduct.localeCompare(bProduct, 'tr') ||
    a.rawMaterial.thicknessMm.localeCompare(b.rawMaterial.thicknessMm, 'tr', {
      numeric: true,
    }) ||
    a.pieceWidthMm - b.pieceWidthMm ||
    a.pieceLengthMm - b.pieceLengthMm
  );
}
