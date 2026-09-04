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

const ENTITY_TYPE = 'ProductionYield';

export type ProductionYieldListItem = {
  id: string;
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

    const rows = await this.prisma.productionYield.findMany({
      where,
      include: { rawMaterial: true },
      orderBy: [
        { rawMaterial: { thicknessMm: 'asc' } },
        { pieceWidthMm: 'asc' },
        { pieceLengthMm: 'asc' },
      ],
    });

    return rows.map((row) => this.toListItem(row));
  }

  async findOne(id: string): Promise<ProductionYieldListItem> {
    const row = await this.prisma.productionYield.findUnique({
      where: { id },
      include: { rawMaterial: true },
    });
    if (!row) {
      throw new NotFoundException(`Production yield bulunamadı: ${id}`);
    }
    return this.toListItem(row);
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
            rawMaterialId: dto.rawMaterialId,
            pieceWidthMm: dto.pieceWidthMm,
            pieceLengthMm: dto.pieceLengthMm,
            netQty: dto.netQty,
            isActive,
          },
          include: { rawMaterial: true },
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
      include: { rawMaterial: true },
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
            rawMaterialId: existing.rawMaterialId,
            pieceWidthMm: existing.pieceWidthMm,
            pieceLengthMm: existing.pieceLengthMm,
            netQty: dto.netQty,
            isActive: true,
          },
          include: { rawMaterial: true },
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
    row: Prisma.ProductionYieldGetPayload<{ include: { rawMaterial: true } }>,
  ): ProductionYieldListItem {
    return {
      id: row.id,
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
    };
  }
}
