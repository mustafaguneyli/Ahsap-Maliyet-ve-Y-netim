import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MaterialPriceType, Prisma, RawMaterial } from '@prisma/client';
import { decimalToPrisma, toDecimal } from '../../common/decimal/decimal.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRawMaterialDto } from './dto/create-raw-material.dto';
import { ListRawMaterialsQueryDto } from './dto/list-raw-materials-query.dto';
import { UpdateRawMaterialDto } from './dto/update-raw-material.dto';
import { UpdateRawMaterialPricesDto } from './dto/update-raw-material-prices.dto';

const ENTITY_TYPE = 'RawMaterial';
const PRICE_ENTITY_TYPE = 'RawMaterialPrice';

export type RawMaterialListItem = {
  id: string;
  code: string;
  name: string;
  thicknessMm: string;
  sheetWidthMm: number;
  sheetLengthMm: number;
  surfaceType: string | null;
  supplierName: string | null;
  isActive: boolean;
  cashPrice: string | null;
  cardInstallmentPrice: string | null;
  lastPriceUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class RawMaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: ListRawMaterialsQueryDto): Promise<RawMaterialListItem[]> {
    const where: Prisma.RawMaterialWhereInput = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.thicknessMm !== undefined) {
      where.thicknessMm = query.thicknessMm;
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    } else {
      if (query.code) {
        where.code = { contains: query.code, mode: 'insensitive' };
      }
      if (query.name) {
        where.name = { contains: query.name, mode: 'insensitive' };
      }
    }

    const rows = await this.prisma.rawMaterial.findMany({
      where,
      include: {
        prices: {
          where: { isActive: true, effectiveTo: null },
          orderBy: { effectiveFrom: 'desc' },
        },
      },
      orderBy: [{ thicknessMm: 'asc' }, { name: 'asc' }],
    });

    return rows.map((row) => this.toListItem(row));
  }

  async findOne(id: string): Promise<RawMaterialListItem> {
    const material = await this.prisma.rawMaterial.findUnique({
      where: { id },
      include: {
        prices: {
          where: { isActive: true, effectiveTo: null },
          orderBy: { effectiveFrom: 'desc' },
        },
      },
    });
    if (!material) {
      throw new NotFoundException(`Ham madde bulunamadı: ${id}`);
    }
    return this.toListItem(material);
  }

  async create(dto: CreateRawMaterialDto): Promise<RawMaterialListItem> {
    this.assertPositiveDimensions(dto);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.rawMaterial.create({
          data: {
            code: dto.code,
            name: dto.name,
            thicknessMm: decimalToPrisma(toDecimal(dto.thicknessMm)),
            sheetWidthMm: dto.sheetWidthMm,
            sheetLengthMm: dto.sheetLengthMm,
            surfaceType: dto.surfaceType ?? null,
            supplierName: dto.supplierName ?? null,
            isActive: dto.isActive ?? true,
          },
        });

        await this.auditService.record(
          {
            entityType: ENTITY_TYPE,
            entityId: row.id,
            action: 'CREATE',
            fieldName: null,
            oldValue: null,
            newValue: JSON.stringify({
              code: row.code,
              name: row.name,
              thicknessMm: row.thicknessMm.toString(),
            }),
          },
          tx,
        );

        return row;
      });

      return this.findOne(created.id);
    } catch (err) {
      this.rethrowUniqueCodeConflict(err);
      throw err;
    }
  }

  async update(id: string, dto: UpdateRawMaterialDto): Promise<RawMaterialListItem> {
    const existing = await this.prisma.rawMaterial.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Ham madde bulunamadı: ${id}`);
    }

    this.assertPositiveDimensions({
      thicknessMm: dto.thicknessMm ?? Number(existing.thicknessMm.toString()),
      sheetWidthMm: dto.sheetWidthMm ?? existing.sheetWidthMm,
      sheetLengthMm: dto.sheetLengthMm ?? existing.sheetLengthMm,
    });

    const changes: Array<{ fieldName: string; oldValue: string; newValue: string }> = [];
    const data: Prisma.RawMaterialUpdateInput = {};

    if (dto.code !== undefined && dto.code !== existing.code) {
      data.code = dto.code;
      changes.push({ fieldName: 'code', oldValue: existing.code, newValue: dto.code });
    }
    if (dto.name !== undefined && dto.name !== existing.name) {
      data.name = dto.name;
      changes.push({ fieldName: 'name', oldValue: existing.name, newValue: dto.name });
    }
    if (
      dto.thicknessMm !== undefined &&
      toDecimal(dto.thicknessMm).toString() !== existing.thicknessMm.toString()
    ) {
      data.thicknessMm = decimalToPrisma(toDecimal(dto.thicknessMm));
      changes.push({
        fieldName: 'thicknessMm',
        oldValue: existing.thicknessMm.toString(),
        newValue: toDecimal(dto.thicknessMm).toString(),
      });
    }
    if (dto.sheetWidthMm !== undefined && dto.sheetWidthMm !== existing.sheetWidthMm) {
      data.sheetWidthMm = dto.sheetWidthMm;
      changes.push({
        fieldName: 'sheetWidthMm',
        oldValue: String(existing.sheetWidthMm),
        newValue: String(dto.sheetWidthMm),
      });
    }
    if (dto.sheetLengthMm !== undefined && dto.sheetLengthMm !== existing.sheetLengthMm) {
      data.sheetLengthMm = dto.sheetLengthMm;
      changes.push({
        fieldName: 'sheetLengthMm',
        oldValue: String(existing.sheetLengthMm),
        newValue: String(dto.sheetLengthMm),
      });
    }
    if (dto.surfaceType !== undefined && dto.surfaceType !== existing.surfaceType) {
      data.surfaceType = dto.surfaceType;
      changes.push({
        fieldName: 'surfaceType',
        oldValue: String(existing.surfaceType ?? ''),
        newValue: String(dto.surfaceType ?? ''),
      });
    }
    if (dto.supplierName !== undefined && dto.supplierName !== existing.supplierName) {
      data.supplierName = dto.supplierName;
      changes.push({
        fieldName: 'supplierName',
        oldValue: String(existing.supplierName ?? ''),
        newValue: String(dto.supplierName ?? ''),
      });
    }
    if (dto.isActive !== undefined && dto.isActive !== existing.isActive) {
      data.isActive = dto.isActive;
      changes.push({
        fieldName: 'isActive',
        oldValue: String(existing.isActive),
        newValue: String(dto.isActive),
      });
    }

    if (changes.length === 0) {
      return this.findOne(id);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.rawMaterial.update({ where: { id }, data });
        for (const change of changes) {
          await this.auditService.record(
            {
              entityType: ENTITY_TYPE,
              entityId: id,
              action: 'UPDATE',
              fieldName: change.fieldName,
              oldValue: change.oldValue,
              newValue: change.newValue,
            },
            tx,
          );
        }
      });
      return this.findOne(id);
    } catch (err) {
      this.rethrowUniqueCodeConflict(err);
      throw err;
    }
  }

  async deactivate(id: string): Promise<RawMaterialListItem> {
    return this.update(id, { isActive: false });
  }

  /**
   * Mevcut açık fiyat dönemlerini kapatır, yeni CASH + CARD_INSTALLMENT kayıtları açar.
   * Eski fiyat satırları silinmez / üzerine yazılmaz.
   */
  async updatePrices(
    id: string,
    dto: UpdateRawMaterialPricesDto,
  ): Promise<RawMaterialListItem> {
    const cash = toDecimal(dto.cashPrice);
    const card = toDecimal(dto.cardInstallmentPrice);

    if (cash.isNegative()) {
      throw new BadRequestException('Peşin fiyat negatif olamaz.');
    }
    if (card.isNegative()) {
      throw new BadRequestException('K.Kartı fiyatı negatif olamaz.');
    }

    const effectiveFrom = this.parseEffectiveFromDate(dto.effectiveFrom);

    await this.prisma.$transaction(async (tx) => {
      const material = await tx.rawMaterial.findUnique({ where: { id } });
      if (!material) {
        throw new NotFoundException(`Ham madde bulunamadı: ${id}`);
      }

      await this.replaceOpenPrice(tx, {
        rawMaterialId: id,
        priceType: MaterialPriceType.CASH,
        newPrice: cash,
        effectiveFrom,
      });

      await this.replaceOpenPrice(tx, {
        rawMaterialId: id,
        priceType: MaterialPriceType.CARD_INSTALLMENT,
        newPrice: card,
        effectiveFrom,
      });
    });

    return this.findOne(id);
  }

  private async replaceOpenPrice(
    tx: Prisma.TransactionClient,
    params: {
      rawMaterialId: string;
      priceType: MaterialPriceType;
      newPrice: ReturnType<typeof toDecimal>;
      effectiveFrom: Date;
    },
  ): Promise<void> {
    const open = await tx.rawMaterialPrice.findFirst({
      where: {
        rawMaterialId: params.rawMaterialId,
        priceType: params.priceType,
        isActive: true,
        effectiveTo: null,
      },
    });

    if (open) {
      if (params.effectiveFrom <= open.effectiveFrom) {
        throw new BadRequestException(
          'Yeni geçerlilik tarihi, mevcut açık fiyat döneminin başlangıcından sonra olmalıdır.',
        );
      }

      await tx.rawMaterialPrice.update({
        where: { id: open.id },
        data: { effectiveTo: params.effectiveFrom },
      });

      await this.auditService.record(
        {
          entityType: PRICE_ENTITY_TYPE,
          entityId: open.id,
          action: 'UPDATE',
          fieldName: 'effectiveTo',
          oldValue: null,
          newValue: params.effectiveFrom.toISOString(),
          reason: 'Yeni fiyat dönemi için mevcut dönem kapatıldı',
        },
        tx,
      );
    }

    const created = await tx.rawMaterialPrice.create({
      data: {
        rawMaterialId: params.rawMaterialId,
        priceType: params.priceType,
        price: decimalToPrisma(params.newPrice),
        effectiveFrom: params.effectiveFrom,
        effectiveTo: null,
        isActive: true,
      },
    });

    await this.auditService.record(
      {
        entityType: PRICE_ENTITY_TYPE,
        entityId: created.id,
        action: 'CREATE',
        fieldName: 'price',
        oldValue: open ? open.price.toString() : null,
        newValue: params.newPrice.toFixed(4),
        reason: `DEMPAŞ fiyat güncellemesi (${params.priceType})`,
      },
      tx,
    );
  }

  private parseEffectiveFromDate(value: string): Date {
    // YYYY-MM-DD → gün başı UTC (tarih tutarlılığı)
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) {
      throw new BadRequestException('Geçerlilik tarihi YYYY-MM-DD formatında olmalıdır.');
    }
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Geçerlilik tarihi geçersiz.');
    }
    return date;
  }

  private toListItem(
    row: RawMaterial & {
      prices: Array<{
        priceType: MaterialPriceType;
        price: Prisma.Decimal;
        effectiveFrom: Date;
        createdAt: Date;
      }>;
    },
  ): RawMaterialListItem {
    const cash = row.prices.find((p) => p.priceType === MaterialPriceType.CASH);
    const card = row.prices.find((p) => p.priceType === MaterialPriceType.CARD_INSTALLMENT);
    const lastDates = row.prices.map((p) => p.effectiveFrom.getTime());
    const lastMs = lastDates.length ? Math.max(...lastDates) : null;

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      thicknessMm: row.thicknessMm.toString(),
      sheetWidthMm: row.sheetWidthMm,
      sheetLengthMm: row.sheetLengthMm,
      surfaceType: row.surfaceType,
      supplierName: row.supplierName,
      isActive: row.isActive,
      cashPrice: cash ? cash.price.toString() : null,
      cardInstallmentPrice: card ? card.price.toString() : null,
      lastPriceUpdatedAt: lastMs ? new Date(lastMs).toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private assertPositiveDimensions(input: {
    thicknessMm: number;
    sheetWidthMm: number;
    sheetLengthMm: number;
  }): void {
    try {
      if (toDecimal(input.thicknessMm).lte(0)) {
        throw new BadRequestException('thicknessMm > 0 olmalıdır.');
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('thicknessMm geçerli bir Decimal olmalıdır.');
    }
    if (!Number.isInteger(input.sheetWidthMm) || input.sheetWidthMm <= 0) {
      throw new BadRequestException('sheetWidthMm > 0 olmalıdır.');
    }
    if (!Number.isInteger(input.sheetLengthMm) || input.sheetLengthMm <= 0) {
      throw new BadRequestException('sheetLengthMm > 0 olmalıdır.');
    }
  }

  private rethrowUniqueCodeConflict(err: unknown): void {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException('Bu code ile kayıtlı bir ham madde zaten var.');
    }
  }
}
