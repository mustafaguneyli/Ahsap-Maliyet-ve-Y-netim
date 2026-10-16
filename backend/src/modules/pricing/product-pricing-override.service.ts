import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { decimalToPrisma, toDecimal } from '../../common/decimal/decimal.util';
import { currentCatalogCache, withCatalogCache } from '../../data-store/firestore-catalog-cache';
import { DataStoreConfig } from '../../data-store/data-store.config';
import { FirestoreDocumentStore } from '../../data-store/firestore.document-store';
import { resolveProfitRateFromFirestoreDocs } from '../../data-store/firestore-profit-catalog';
import { FIRESTORE_COLLECTIONS } from '../../firebase/firestore.collections';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpsertSizeProfitRateDto } from './dto/upsert-size-profit-rate.dto';
import {
  resolveProfitRate,
  type ProfitRateSource,
} from './ayarli-pervaz-profit-rate.resolver';

const ENTITY_TYPE = 'ProductPricingOverride';

export type SizeProfitRateResponse = {
  productId: string;
  productCode: string;
  productGroupCode: string;
  productSizeId: string;
  widthMm: number;
  lengthMm: number;
  profitRate: string | null;
  source: ProfitRateSource | null;
  changed: boolean;
  message: string;
};

@Injectable()
export class ProductPricingOverrideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Optional() private readonly dataStore?: DataStoreConfig,
    @Optional() private readonly firestoreStore?: FirestoreDocumentStore,
  ) {}

  async upsertSizeProfitRate(
    dto: UpsertSizeProfitRateDto,
    now: Date = new Date(),
  ): Promise<SizeProfitRateResponse> {
    if (this.dataStore?.isFirestore() && this.firestoreStore) {
      return this.upsertSizeProfitRateOnFirestore(dto, now);
    }
    const { product, size } = await this.resolveProductAndSize(dto);
    const reason =
      dto.reason?.trim() ||
      `Kâr oranı ölçü güncellemesi (${product.code} ${size.widthMm}×${size.lengthMm})`;

    const current = await this.prisma.productPricingOverride.findFirst({
      where: {
        productId: product.id,
        productSizeId: size.id,
        isActive: true,
        effectiveTo: null,
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const nextRate =
      dto.profitRate == null ? null : toDecimal(dto.profitRate);
    if (nextRate != null && nextRate.isNegative()) {
      throw new BadRequestException('profitRate negatif olamaz.');
    }

    const currentRate =
      current != null ? toDecimal(current.profitRate.toString()) : null;
    if (nextRate != null && currentRate != null && currentRate.equals(nextRate)) {
      const resolved = await this.resolveAfter(product, size, now);
      return {
        ...resolved,
        changed: false,
        message: 'Kâr oranı değişmedi.',
      };
    }
    if (nextRate == null && current == null) {
      const resolved = await this.resolveAfter(product, size, now);
      return {
        ...resolved,
        changed: false,
        message: 'Ölçüye özel kâr oranı zaten yok.',
      };
    }

    await this.prisma.$transaction(async (tx) => {
      if (current) {
        await tx.productPricingOverride.update({
          where: { id: current.id },
          data: { isActive: false, effectiveTo: now },
        });
      }

      if (nextRate != null) {
        const created = await tx.productPricingOverride.create({
          data: {
            productId: product.id,
            productSizeId: size.id,
            profitRate: decimalToPrisma(nextRate),
            isActive: true,
            effectiveFrom: now,
            effectiveTo: null,
          },
        });
        await this.auditService.record(
          {
            entityType: ENTITY_TYPE,
            entityId: created.id,
            action: AuditAction.CREATE,
            fieldName: 'profitRate',
            oldValue: currentRate?.toString() ?? null,
            newValue: nextRate.toString(),
            reason,
          },
          tx,
        );
        return;
      }

      if (current) {
        await this.auditService.record(
          {
            entityType: ENTITY_TYPE,
            entityId: current.id,
            action: AuditAction.UPDATE,
            fieldName: 'profitRate',
            oldValue: currentRate?.toString() ?? null,
            newValue: null,
            reason,
          },
          tx,
        );
      }
    });

    const resolved = await this.resolveAfter(product, size, now);
    return {
      ...resolved,
      changed: true,
      message:
        nextRate == null
          ? 'Ölçüye özel kâr oranı kaldırıldı.'
          : 'Ölçüye özel kâr oranı kaydedildi.',
    };
  }

  private async upsertSizeProfitRateOnFirestore(
    dto: UpsertSizeProfitRateDto,
    now: Date,
  ): Promise<SizeProfitRateResponse> {
    const store = this.firestoreStore!;
    return withCatalogCache(store, async () => {
      const { product, size } = this.resolveProductAndSizeFromCache(dto);
      const reason =
        dto.reason?.trim() ||
        `Kâr oranı ölçü güncellemesi (${product.code} ${size.widthMm}×${size.lengthMm})`;
      const cache = currentCatalogCache();
      const current = cache
        ?.collection(FIRESTORE_COLLECTIONS.productPricingOverrides)
        .find(
          (row) =>
            row.isActive === true &&
            String(row.productId) === product.id &&
            String(row.productSizeId) === size.id &&
            (row.effectiveTo == null || row.effectiveTo === ''),
        ) ?? null;

      const nextRate = dto.profitRate == null ? null : toDecimal(dto.profitRate);
      if (nextRate != null && nextRate.isNegative()) {
        throw new BadRequestException('profitRate negatif olamaz.');
      }
      const currentRate =
        current?.profitRate == null ? null : toDecimal(String(current.profitRate));
      if (nextRate != null && currentRate != null && currentRate.equals(nextRate)) {
        const resolved = await this.resolveAfterFirestore(product, size, now);
        return { ...resolved, changed: false, message: 'Kâr oranı değişmedi.' };
      }
      if (nextRate == null && current == null) {
        const resolved = await this.resolveAfterFirestore(product, size, now);
        return { ...resolved, changed: false, message: 'Ölçüye özel kâr oranı zaten yok.' };
      }

      await store.runTransaction(async (tx) => {
        if (current) {
          await tx.upsert(FIRESTORE_COLLECTIONS.productPricingOverrides, String(current.id), {
            ...current,
            isActive: false,
            effectiveTo: now,
          });
        }
        if (nextRate != null) {
          const createdId = store.createId();
          await tx.upsert(FIRESTORE_COLLECTIONS.productPricingOverrides, createdId, {
            id: createdId,
            productId: product.id,
            productSizeId: size.id,
            profitRate: nextRate.toFixed(4),
            isActive: true,
            effectiveFrom: now,
            effectiveTo: null,
          });
          const auditId = store.createId();
          await tx.upsert(FIRESTORE_COLLECTIONS.auditEvents, auditId, {
            id: auditId,
            entityType: ENTITY_TYPE,
            entityId: createdId,
            action: 'CREATE',
            fieldName: 'profitRate',
            oldValue: currentRate?.toString() ?? null,
            newValue: nextRate.toString(),
            reason,
            actor: 'local-admin',
          });
          return;
        }
        if (current) {
          const auditId = store.createId();
          await tx.upsert(FIRESTORE_COLLECTIONS.auditEvents, auditId, {
            id: auditId,
            entityType: ENTITY_TYPE,
            entityId: String(current.id),
            action: 'UPDATE',
            fieldName: 'profitRate',
            oldValue: currentRate?.toString() ?? null,
            newValue: null,
            reason,
            actor: 'local-admin',
          });
        }
      });

      const resolved = await this.resolveAfterFirestore(product, size, now);
      return {
        ...resolved,
        changed: true,
        message:
          nextRate == null
            ? 'Ölçüye özel kâr oranı kaldırıldı.'
            : 'Ölçüye özel kâr oranı kaydedildi.',
      };
    });
  }

  private resolveProductAndSizeFromCache(dto: UpsertSizeProfitRateDto) {
    const cache = currentCatalogCache();
    if (!cache) {
      throw new NotFoundException('Aktif ürün bulunamadı.');
    }
    let productRow: Record<string, unknown> | null = null;
    let groupRow: Record<string, unknown> | null = null;
    if (dto.productId) {
      productRow =
        cache.collection(FIRESTORE_COLLECTIONS.products).find((row) => String(row.id) === dto.productId) ??
        null;
      groupRow = productRow
        ? cache.groupById(String(productRow.productGroupId))
        : null;
    } else {
      groupRow = cache.groupByCode(dto.productGroupCode!);
      productRow = groupRow
        ? cache.productByGroupAndCode(String(groupRow.id), dto.productCode!)
        : null;
    }
    if (!productRow || productRow.isActive !== true || groupRow?.isActive !== true) {
      throw new NotFoundException('Aktif ürün bulunamadı.');
    }
    const product = {
      id: String(productRow.id),
      code: String(productRow.code),
      productGroup: { id: String(groupRow!.id), code: String(groupRow!.code) },
    };

    if (dto.productSizeId) {
      const size =
        cache
          .collection(FIRESTORE_COLLECTIONS.productSizes)
          .find((row) => String(row.id) === dto.productSizeId) ?? null;
      if (!size) {
        throw new NotFoundException('Ölçü kaydı bulunamadı.');
      }
      return {
        product,
        size: {
          id: String(size.id),
          widthMm: Number(size.widthMm),
          lengthMm: Number(size.lengthMm),
        },
      };
    }

    const widthMm = dto.widthMm!;
    const lengthMm = dto.lengthMm!;
    const size = cache.sizeByMm(widthMm, lengthMm);
    if (size) {
      return {
        product,
        size: { id: String(size.id), widthMm, lengthMm },
      };
    }
    throw new NotFoundException(`Ölçü bulunamadı: ${widthMm}×${lengthMm} mm.`);
  }

  private async resolveAfterFirestore(
    product: { id: string; code: string; productGroup: { id: string; code: string } },
    size: { id: string; widthMm: number; lengthMm: number },
    now: Date,
  ): Promise<Omit<SizeProfitRateResponse, 'changed' | 'message'>> {
    const store = this.firestoreStore!;
    const [overrides, settings] = await Promise.all([
      store.list(FIRESTORE_COLLECTIONS.productPricingOverrides),
      store.list(FIRESTORE_COLLECTIONS.pricingSettings),
    ]);
    const resolved = resolveProfitRateFromFirestoreDocs({
      productId: product.id,
      productGroupId: product.productGroup.id,
      productSizeId: size.id,
      productCode: product.code,
      now,
      overrides,
      settings,
      required: false,
    });
    return {
      productId: product.id,
      productCode: product.code,
      productGroupCode: product.productGroup.code,
      productSizeId: size.id,
      widthMm: size.widthMm,
      lengthMm: size.lengthMm,
      profitRate: resolved.profitRate,
      source: resolved.source,
    };
  }

  private async resolveAfter(
    product: {
      id: string;
      code: string;
      productGroup: { id: string; code: string };
    },
    size: { id: string; widthMm: number; lengthMm: number },
    now: Date,
  ): Promise<Omit<SizeProfitRateResponse, 'changed' | 'message'>> {
    const [sizeOverrides, productOverrides, productSettings, groupSettings, globalSettings] =
      await Promise.all([
        this.prisma.productPricingOverride.findMany({
          where: {
            productId: product.id,
            productSizeId: size.id,
            isActive: true,
          },
        }),
        this.prisma.productPricingOverride.findMany({
          where: {
            productId: product.id,
            productSizeId: null,
            isActive: true,
          },
        }),
        this.prisma.pricingSetting.findMany({
          where: {
            productId: product.id,
            productGroupId: null,
            isActive: true,
          },
        }),
        this.prisma.pricingSetting.findMany({
          where: {
            productGroupId: product.productGroup.id,
            productId: null,
            isActive: true,
          },
        }),
        this.prisma.pricingSetting.findMany({
          where: {
            productGroupId: null,
            productId: null,
            isActive: true,
          },
        }),
      ]);

    const resolved = resolveProfitRate({
      now,
      productCode: product.code,
      sizeOverrides,
      productOverrides,
      productSettings,
      groupSettings,
      globalSettings,
      required: false,
    });

    return {
      productId: product.id,
      productCode: product.code,
      productGroupCode: product.productGroup.code,
      productSizeId: size.id,
      widthMm: size.widthMm,
      lengthMm: size.lengthMm,
      profitRate: resolved.profitRate,
      source: resolved.source,
    };
  }

  private async resolveProductAndSize(dto: UpsertSizeProfitRateDto) {
    const product = dto.productId
      ? await this.prisma.product.findUnique({
          where: { id: dto.productId },
          include: { productGroup: true },
        })
      : await this.findProductByCodes(dto.productGroupCode!, dto.productCode!);

    if (!product?.isActive || !product.productGroup.isActive) {
      throw new NotFoundException('Aktif ürün bulunamadı.');
    }

    if (dto.productSizeId) {
      const size = await this.prisma.productSize.findUnique({
        where: { id: dto.productSizeId },
      });
      if (!size) {
        throw new NotFoundException('Ölçü kaydı bulunamadı.');
      }
      return { product, size };
    }

    const widthMm = dto.widthMm!;
    const lengthMm = dto.lengthMm!;
    const existing = await this.prisma.productSize.findUnique({
      where: { widthMm_lengthMm: { widthMm, lengthMm } },
    });
    if (existing) {
      return { product, size: existing };
    }

    const inCatalog = await this.catalogHasExactMeasure(
      product.id,
      widthMm,
      lengthMm,
    );
    if (!inCatalog) {
      throw new NotFoundException(
        `Ölçü bulunamadı: ${widthMm}×${lengthMm} mm.`,
      );
    }

    const created = await this.prisma.productSize.create({
      data: {
        widthMm,
        lengthMm,
        displayName: catalogSizeDisplayName(widthMm, lengthMm),
      },
    });
    return { product, size: created };
  }

  /**
   * Yakın ölçü eşlemesi yok: yalnız aynı EN×BOY katalog satırı (yield).
   * ProductSize paylaşılır; katalog NET/reçete değiştirilmez.
   */
  private async catalogHasExactMeasure(
    productId: string,
    widthMm: number,
    lengthMm: number,
  ): Promise<boolean> {
    const yieldHit = await this.prisma.productionYield.findFirst({
      where: {
        productId,
        pieceWidthMm: widthMm,
        pieceLengthMm: lengthMm,
        isActive: true,
      },
      select: { id: true },
    });
    return yieldHit != null;
  }

  private async findProductByCodes(groupCode: string, productCode: string) {
    const group = await this.prisma.productGroup.findUnique({
      where: { code: groupCode },
    });
    if (!group?.isActive) {
      throw new NotFoundException(`Aktif ürün grubu bulunamadı: ${groupCode}`);
    }
    return this.prisma.product.findUnique({
      where: {
        productGroupId_code: {
          productGroupId: group.id,
          code: productCode,
        },
      },
      include: { productGroup: true },
    });
  }
}

/** ProductSize.displayName katalog stili: 70×2200 mm → 7×220 */
function catalogSizeDisplayName(widthMm: number, lengthMm: number): string {
  const toCm = (mm: number) =>
    mm % 10 === 0 ? String(mm / 10) : String(mm);
  return `${toCm(widthMm)}×${toCm(lengthMm)}`;
}
