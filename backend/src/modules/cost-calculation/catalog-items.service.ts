import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import {
  getDoorFrameSizes,
  getPrimaryMaterialCode,
  getSecondary12MaterialCode,
  type DoorFrameSizeCm,
  type DoorFrameVariantCode,
} from '../../calculation-engine/calculators/door-frame-variants';
import { CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM } from '../../calculation-engine/calculators/cita-net-calculator';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AYARLI_PERVAZ_KILCIK_MATERIAL_CODE } from '../pervaz/ayarli-pervaz-kilcik-yield-seed';
import { getExcelKilcikCutWidthMm } from '../pervaz/excel-kilcik-cut-profile';
import { assertPervazKilcikYield } from '../pervaz/pervaz-kilcik-yield.validation';
import type { CreateCatalogItemDto } from './dto/create-catalog-item.dto';

const SUPPORTED_GROUPS = [
  'door_frame',
  'PERVAZ',
  'SUPURGELIK',
  'CITA',
] as const;

type SupportedGroup = (typeof SUPPORTED_GROUPS)[number];

const PERVAZ_PRODUCTS = [
  'AYARLI_PERVAZ',
  'DEKORATIF_PERVAZ',
  'DEKORATIF_PERVAZ_GENIS_KILCIK',
] as const;

const SUPURGELIK_PRODUCTS = [
  'DUZ_SUPURGELIK',
  'DEKORATIF_SUPURGELIK',
  'DUZ_PP_SARMA_SUPURGELIK',
  'DEKORATIF_PP_SARMA_SUPURGELIK',
] as const;

const DOOR_FRAME_PRODUCTS = ['34_MM', '30_MM'] as const;

function assertPositiveInt(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${name} pozitif tam sayı (mm) olmalıdır.`);
  }
}

function assertPositiveNet(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${name} 0’dan büyük tam sayı olmalıdır.`);
  }
}

function displayNameCm(widthMm: number, lengthMm: number, override?: string): string {
  if (override && override.trim()) return override.trim();
  return `${widthMm / 10}×${lengthMm / 10}`;
}

/**
 * Hardcoded kapı kasası ölçüleri + DB’de generic NET’i olan ek ölçüleri birleştirir.
 * Yakın ölçü uydurulmaz; yalnızca exact width/length.
 */
export async function resolveDoorFrameSizesWithCatalog(
  prisma: PrismaService,
  variant: DoorFrameVariantCode,
): Promise<DoorFrameSizeCm[]> {
  const base = getDoorFrameSizes(variant);
  const primaryCode = getPrimaryMaterialCode(variant);
  const primary = await prisma.rawMaterial.findFirst({
    where: { code: primaryCode, isActive: true },
  });
  if (!primary) return base;

  const primaryYields = await prisma.productionYield.findMany({
    where: {
      productId: null,
      isActive: true,
      rawMaterialId: primary.id,
    },
  });

  const merged = new Map<string, DoorFrameSizeCm>();
  for (const s of base) {
    merged.set(`${s.widthCm}x${s.lengthCm}`, s);
  }

  for (const y of primaryYields) {
    if (y.pieceWidthMm % 10 !== 0 || y.pieceLengthMm % 10 !== 0) continue;
    const widthCm = y.pieceWidthMm / 10;
    const lengthCm = y.pieceLengthMm / 10;
    const key = `${widthCm}x${lengthCm}`;
    if (merged.has(key)) continue;

    const secondaryCode = getSecondary12MaterialCode(widthCm, lengthCm);
    const secondary = await prisma.rawMaterial.findFirst({
      where: { code: secondaryCode, isActive: true },
    });
    if (!secondary) continue;
    const secondaryYield = await prisma.productionYield.findFirst({
      where: {
        productId: null,
        isActive: true,
        rawMaterialId: secondary.id,
        pieceWidthMm: y.pieceWidthMm,
        pieceLengthMm: y.pieceLengthMm,
      },
    });
    if (!secondaryYield) continue;
    merged.set(key, { widthCm, lengthCm });
  }

  return [...merged.values()].sort(
    (a, b) => a.widthCm - b.widthCm || a.lengthCm - b.lengthCm,
  );
}

@Injectable()
export class CatalogItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateCatalogItemDto) {
    if (dto.mode === 'NEW_GROUP') {
      throw new BadRequestException(
        'NEW_GROUP yalnız GENERIC_RECIPE yolu ile oluşturulur.',
      );
    }
    if (!dto.productGroupCode) {
      throw new BadRequestException('productGroupCode zorunludur.');
    }
    const groupCode = dto.productGroupCode as SupportedGroup;
    if (!SUPPORTED_GROUPS.includes(groupCode)) {
      throw new BadRequestException(
        `Ürün grubu desteklenmiyor: ${dto.productGroupCode}. ` +
          `Desteklenenler: ${SUPPORTED_GROUPS.join(', ')}.`,
      );
    }

    assertPositiveInt('widthMm', dto.widthMm);
    assertPositiveInt('lengthMm', dto.lengthMm);
    if (dto.rawMaterialId == null || dto.netQty == null) {
      throw new BadRequestException(
        'Özel ürün grubu için rawMaterialId ve netQty zorunludur.',
      );
    }
    assertPositiveNet('netQty', dto.netQty);

    // Mevcut calculator’lar yalnız grup-scope ExtraCost okur; ürün override sessizce boşa gider.
    if (dto.useGroupExtraCostDefaults === false) {
      throw new BadRequestException(
        'Ürün özel ExtraCost override bu aşamada desteklenmiyor; maliyet motoru grup varsayılanını kullanır. ' +
          'useGroupExtraCostDefaults=true bırakın veya Maliyet Ayarları’ndan grup değerini güncelleyin.',
      );
    }

    if (dto.mode === 'NEW_PRODUCT') {
      return this.createNewProduct(groupCode, dto);
    }
    return this.createNewSize(groupCode, dto);
  }

  private async createNewProduct(
    groupCode: SupportedGroup,
    dto: CreateCatalogItemDto,
  ) {
    if (!dto.newProductCode?.trim() || !dto.productName?.trim()) {
      throw new BadRequestException(
        'Yeni ürün için ürün kodu ve ürün adı zorunludur.',
      );
    }
    const newCode = dto.newProductCode.trim().toUpperCase();
    const productName = dto.productName.trim();

    if (groupCode === 'door_frame') {
      throw new BadRequestException(
        'Kapı Kasası için yeni ürün tipi açılamaz. Yalnız mevcut 34_MM / 30_MM ürünlerine ölçü ekleyin.',
      );
    }
    if (groupCode === 'CITA') {
      if (newCode !== 'CITA') {
        throw new BadRequestException(
          'Çıta için ürün kodu yalnız CITA olabilir. Yeni ölçü için “Mevcut ürüne yeni ölçü” kullanın.',
        );
      }
    }
    if (groupCode === 'PERVAZ') {
      if (!(PERVAZ_PRODUCTS as readonly string[]).includes(newCode)) {
        throw new BadRequestException(
          `Pervaz yeni ürün kodu mevcut calculator ürünlerinden biri olmalıdır: ${PERVAZ_PRODUCTS.join(', ')}. ` +
            'Bilinmeyen pervaz tipi için ayrı calculator/endpoint gerekir; tahmin edilmez.',
        );
      }
    }
    if (groupCode === 'SUPURGELIK') {
      if (!(SUPURGELIK_PRODUCTS as readonly string[]).includes(newCode)) {
        throw new BadRequestException(
          `Süpürgelik yeni ürün kodu mevcut calculator ürünlerinden biri olmalıdır: ${SUPURGELIK_PRODUCTS.join(', ')}.`,
        );
      }
    }

    const group = await this.prisma.productGroup.findUnique({
      where: { code: groupCode },
    });
    if (!group?.isActive) {
      throw new NotFoundException(`Aktif ürün grubu bulunamadı: ${groupCode}`);
    }

    const existing = await this.prisma.product.findUnique({
      where: {
        productGroupId_code: { productGroupId: group.id, code: newCode },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Ürün zaten tanımlı: ${newCode}. “Mevcut ürüne yeni ölçü” modunu kullanın.`,
      );
    }

    // Ürün + ilk ölçü tek transaction; hata olursa yarım Product kalmaz.
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          productGroupId: group.id,
          code: newCode,
          name: productName,
          isActive: true,
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

      const sizeResult = await this.createNewSizeInTx(tx, groupCode, group, product, {
        ...dto,
        mode: 'NEW_SIZE',
        productCode: product.code,
      });

      return {
        ...sizeResult,
        mode: 'NEW_PRODUCT' as const,
        message: 'Ürün ve ölçü başarıyla eklendi.',
      };
    });
  }

  private async createNewSize(
    groupCode: SupportedGroup,
    dto: CreateCatalogItemDto,
  ) {
    if (!dto.productCode?.trim()) {
      throw new BadRequestException('Mevcut ürün kodu zorunludur.');
    }
    const productCode = dto.productCode.trim();

    const group = await this.prisma.productGroup.findUnique({
      where: { code: groupCode },
    });
    if (!group?.isActive) {
      throw new NotFoundException(`Aktif ürün grubu bulunamadı: ${groupCode}`);
    }

    const product = await this.prisma.product.findUnique({
      where: {
        productGroupId_code: { productGroupId: group.id, code: productCode },
      },
    });
    if (!product?.isActive) {
      throw new NotFoundException(`Aktif ürün bulunamadı: ${productCode}`);
    }

    this.assertProductAllowedForGroup(groupCode, productCode);

    return this.prisma.$transaction(async (tx) =>
      this.createNewSizeInTx(tx, groupCode, group, product, dto),
    );
  }

  private async createNewSizeInTx(
    tx: Prisma.TransactionClient,
    groupCode: SupportedGroup,
    group: { id: string; code: string; name: string },
    product: { id: string; code: string; name: string },
    dto: CreateCatalogItemDto,
  ) {
    if (groupCode === 'door_frame') {
      return this.addDoorFrameSize(tx, group, product, dto);
    }
    if (groupCode === 'PERVAZ') {
      return this.addPervazSize(tx, group, product, dto);
    }
    if (groupCode === 'SUPURGELIK') {
      return this.addSupurgelikSize(tx, group, product, dto);
    }
    return this.addCitaSize(tx, group, product, dto);
  }

  private assertProductAllowedForGroup(
    groupCode: SupportedGroup,
    productCode: string,
  ): void {
    if (
      groupCode === 'door_frame' &&
      !(DOOR_FRAME_PRODUCTS as readonly string[]).includes(productCode)
    ) {
      throw new BadRequestException(
        'Kapı Kasası ürün kodu 34_MM veya 30_MM olmalıdır.',
      );
    }
    if (
      groupCode === 'PERVAZ' &&
      !(PERVAZ_PRODUCTS as readonly string[]).includes(productCode)
    ) {
      throw new BadRequestException(
        `Pervaz ürün kodu şunlardan biri olmalıdır: ${PERVAZ_PRODUCTS.join(', ')}.`,
      );
    }
    if (
      groupCode === 'SUPURGELIK' &&
      !(SUPURGELIK_PRODUCTS as readonly string[]).includes(productCode)
    ) {
      throw new BadRequestException(
        `Süpürgelik ürün kodu şunlardan biri olmalıdır: ${SUPURGELIK_PRODUCTS.join(', ')}.`,
      );
    }
    if (groupCode === 'CITA' && productCode !== 'CITA') {
      throw new BadRequestException('Çıta ürün kodu CITA olmalıdır.');
    }
  }

  private async addDoorFrameSize(
    tx: Prisma.TransactionClient,
    group: { id: string; code: string; name: string },
    product: { id: string; code: string; name: string },
    dto: CreateCatalogItemDto,
  ) {
    const variant = product.code as DoorFrameVariantCode;
    const widthCm = dto.widthMm / 10;
    const lengthCm = dto.lengthMm / 10;
    if (!Number.isInteger(widthCm) || !Number.isInteger(lengthCm)) {
      throw new BadRequestException(
        'Kapı Kasası ölçüsü cm cinsinden tam sayıya karşılık gelmelidir (örn. 100×2100 mm = 10×210 cm).',
      );
    }

    const existingSizes = await resolveDoorFrameSizesWithCatalog(
      this.prisma,
      variant,
    );
    if (
      existingSizes.some((s) => s.widthCm === widthCm && s.lengthCm === lengthCm)
    ) {
      throw new ConflictException(
        `Bu ölçü zaten tanımlı: ${widthCm}×${lengthCm} cm (${product.code}).`,
      );
    }

    if (dto.secondaryNetQty == null) {
      throw new BadRequestException(
        'Kapı Kasası için ikinci parça NET adedi (secondaryNetQty) zorunludur.',
      );
    }
    assertPositiveNet('secondaryNetQty', dto.secondaryNetQty);

    const primaryCode = getPrimaryMaterialCode(variant);
    const secondaryCode = getSecondary12MaterialCode(widthCm, lengthCm);

    const primary = await this.requireActiveMaterial(dto.rawMaterialId!, tx);
    if (primary.code !== primaryCode) {
      throw new BadRequestException(
        `${product.code} birincil MDF kodu ${primaryCode} olmalıdır (seçilen: ${primary.code}).`,
      );
    }

    const secondaryId =
      dto.secondaryRawMaterialId ??
      (
        await tx.rawMaterial.findFirst({
          where: { code: secondaryCode, isActive: true },
        })
      )?.id;
    if (!secondaryId) {
      throw new BadRequestException(
        `İkincil MDF bulunamadı: ${secondaryCode}. Önce Ham Maddeler ekranından tanımlayın.`,
      );
    }
    const secondary = await this.requireActiveMaterial(secondaryId, tx);
    if (secondary.code !== secondaryCode) {
      throw new BadRequestException(
        `Bu ölçü için ikincil MDF ${secondaryCode} olmalıdır (seçilen: ${secondary.code}).`,
      );
    }

    const label = displayNameCm(dto.widthMm, dto.lengthMm, dto.displayName);

    const size = await this.upsertProductSize(
      tx,
      dto.widthMm,
      dto.lengthMm,
      label,
    );

    const primaryYield = await this.ensureGenericYield(tx, {
      rawMaterialId: primary.id,
      pieceWidthMm: dto.widthMm,
      pieceLengthMm: dto.lengthMm,
      netQty: dto.netQty!,
      reason: dto.reason,
    });
    const secondaryYield = await this.ensureGenericYield(tx, {
      rawMaterialId: secondary.id,
      pieceWidthMm: dto.widthMm,
      pieceLengthMm: dto.lengthMm,
      netQty: dto.secondaryNetQty!,
      reason: dto.reason,
    });

    const recipe = await this.ensureRecipe(tx, {
      productId: product.id,
      productSizeId: size.id,
      name: `${product.code} ${label}`,
      items: [
        {
          rawMaterialId: primary.id,
          productionYieldId: primaryYield.id,
          quantity: new Prisma.Decimal(1),
          sortOrder: 1,
        },
        {
          rawMaterialId: secondary.id,
          productionYieldId: secondaryYield.id,
          quantity: new Prisma.Decimal(1),
          sortOrder: 2,
        },
      ],
    });

    await this.auditService.record(
      {
        entityType: 'ProductSize',
        entityId: size.id,
        action: AuditAction.CREATE,
        fieldName: 'catalogItem',
        newValue: JSON.stringify({
          mode: 'NEW_SIZE',
          productGroup: group.code,
          productCode: product.code,
          widthMm: dto.widthMm,
          lengthMm: dto.lengthMm,
          netQtyPrimary: dto.netQty!,
          netQtySecondary: dto.secondaryNetQty,
          recipeId: recipe.id,
        }),
        reason: dto.reason ?? 'Kapı Kasası yeni ölçü',
      },
      tx,
    );

    return {
      mode: 'NEW_SIZE' as const,
      productGroupCode: group.code,
      productCode: product.code,
      productName: product.name,
      size: {
        id: size.id,
        widthMm: size.widthMm,
        lengthMm: size.lengthMm,
        displayName: size.displayName,
      },
      yields: [
        { role: 'PRIMARY', id: primaryYield.id, netQty: primaryYield.netQty },
        {
          role: 'SECONDARY',
          id: secondaryYield.id,
          netQty: secondaryYield.netQty,
        },
      ],
      recipeId: recipe.id,
      message: 'Ölçü başarıyla eklendi.',
    };
  }

  private async addPervazSize(
    tx: Prisma.TransactionClient,
    group: { id: string; code: string; name: string },
    product: { id: string; code: string; name: string },
    dto: CreateCatalogItemDto,
  ) {
    const main = await this.requireActiveMaterial(dto.rawMaterialId!, tx);
    const thicknessMm = Number(main.thicknessMm.toString());
    if (!Number.isInteger(thicknessMm) || thicknessMm <= 0) {
      throw new BadRequestException('Pervaz MDF kalınlığı pozitif tam sayı olmalıdır.');
    }

    const duplicate = await tx.productionYield.findFirst({
      where: {
        productId: product.id,
        isActive: true,
        rawMaterialId: main.id,
        pieceWidthMm: dto.widthMm,
        pieceLengthMm: dto.lengthMm,
      },
    });
    if (duplicate) {
      throw new ConflictException(
        `Bu ölçü zaten tanımlı: ${thicknessMm} mm · ${dto.widthMm}×${dto.lengthMm} mm (${product.code}).`,
      );
    }

    if (dto.kilcikNetQty == null) {
      throw new BadRequestException(
        'Pervaz için kılçık NET adedi (kilcikNetQty) zorunludur.',
      );
    }
    assertPositiveNet('kilcikNetQty', dto.kilcikNetQty);

    const kilcikMaterial =
      dto.kilcikRawMaterialId != null
        ? await this.requireActiveMaterial(dto.kilcikRawMaterialId, tx)
        : await tx.rawMaterial.findFirst({
            where: {
              code: AYARLI_PERVAZ_KILCIK_MATERIAL_CODE,
              isActive: true,
            },
          });
    if (!kilcikMaterial) {
      throw new BadRequestException(
        `Kılçık ham maddesi bulunamadı (${AYARLI_PERVAZ_KILCIK_MATERIAL_CODE}). Ham Maddeler ekranından tanımlayın.`,
      );
    }

    const isGenis = product.code === 'DEKORATIF_PERVAZ_GENIS_KILCIK';
    const supportsTypedKilcik = [9, 12, 16].includes(thicknessMm);
    let kilcikTypeId: string | null = dto.kilcikTypeId ?? null;
    let kilcikTypeCode: string | null = null;
    let kilcikSource: 'EXCEL_MASTER' | 'MANUAL_VERIFIED' = 'EXCEL_MASTER';
    let excelCutWidthMm: number | null = null;

    if (isGenis || supportsTypedKilcik) {
      const wantedCode = isGenis ? 'WIDE' : 'STANDARD';
      const type =
        kilcikTypeId != null
          ? await tx.kilcikType.findUnique({ where: { id: kilcikTypeId } })
          : await tx.kilcikType.findFirst({
              where: { code: wantedCode, isActive: true },
            });
      if (!type?.isActive) {
        throw new BadRequestException(
          `Pervaz kılçık tipi bulunamadı: ${wantedCode}.`,
        );
      }
      kilcikTypeId = type.id;
      kilcikTypeCode = type.code;
      kilcikSource = 'MANUAL_VERIFIED';
    } else {
      // 14/18 mm: mevcut Excel master gibi tipsiz EXCEL_MASTER.
      kilcikTypeId = null;
      excelCutWidthMm = getExcelKilcikCutWidthMm(thicknessMm);
    }

    assertPervazKilcikYield({
      productId: product.id,
      productIsActive: true,
      productGroupCode: 'PERVAZ',
      pervazThicknessMm: thicknessMm,
      source: kilcikSource,
      kilcikTypeCode,
      kilcikTypeIsActive: kilcikTypeCode != null ? true : undefined,
      rawMaterialId: kilcikMaterial.id,
      rawMaterialIsActive: true,
      pieceLengthMm: dto.lengthMm,
      netQty: dto.kilcikNetQty!,
      excelCutWidthMm,
    });

    const label = displayNameCm(dto.widthMm, dto.lengthMm, dto.displayName);

    const size = await this.upsertProductSize(
      tx,
      dto.widthMm,
      dto.lengthMm,
      label,
    );

    const mainYield = await tx.productionYield.create({
      data: {
        productId: product.id,
        rawMaterialId: main.id,
        pieceWidthMm: dto.widthMm,
        pieceLengthMm: dto.lengthMm,
        netQty: dto.netQty!,
        isActive: true,
      },
    });

    const kilcikYield = await tx.pervazKilcikYield.create({
      data: {
        productId: product.id,
        pervazThicknessMm: thicknessMm,
        kilcikTypeId,
        rawMaterialId: kilcikMaterial.id,
        pieceLengthMm: dto.lengthMm,
        netQty: dto.kilcikNetQty!,
        source: kilcikSource,
        excelCutWidthMm,
        isActive: true,
      },
    });

    const recipe = await this.ensureRecipe(tx, {
      productId: product.id,
      productSizeId: size.id,
      name: `${product.code} ${label}`,
      items: [
        {
          rawMaterialId: main.id,
          productionYieldId: mainYield.id,
          quantity: new Prisma.Decimal(1),
          sortOrder: 1,
        },
        {
          rawMaterialId: kilcikMaterial.id,
          productionYieldId: null,
          quantity: new Prisma.Decimal(1),
          sortOrder: 2,
        },
      ],
    });

    await this.auditService.record(
      {
        entityType: 'ProductionYield',
        entityId: mainYield.id,
        action: AuditAction.CREATE,
        fieldName: 'catalogItem',
        newValue: JSON.stringify({
          mode: 'NEW_SIZE',
          productGroup: group.code,
          productCode: product.code,
          widthMm: dto.widthMm,
          lengthMm: dto.lengthMm,
          thicknessMm,
          netQty: dto.netQty!,
          kilcikYieldId: kilcikYield.id,
          kilcikNetQty: dto.kilcikNetQty,
          recipeId: recipe.id,
        }),
        reason: dto.reason ?? 'Pervaz yeni ölçü',
      },
      tx,
    );

    return {
      mode: 'NEW_SIZE' as const,
      productGroupCode: group.code,
      productCode: product.code,
      productName: product.name,
      size: {
        id: size.id,
        widthMm: size.widthMm,
        lengthMm: size.lengthMm,
        displayName: size.displayName,
        thicknessMm,
      },
      yields: [
        { role: 'MAIN', id: mainYield.id, netQty: mainYield.netQty },
        {
          role: 'KILCIK',
          id: kilcikYield.id,
          netQty: kilcikYield.netQty,
        },
      ],
      recipeId: recipe.id,
      message: 'Ölçü başarıyla eklendi.',
    };
  }

  private async addSupurgelikSize(
    tx: Prisma.TransactionClient,
    group: { id: string; code: string; name: string },
    product: { id: string; code: string; name: string },
    dto: CreateCatalogItemDto,
  ) {
    const material = await this.requireActiveMaterial(dto.rawMaterialId!, tx);
    if (dto.lengthMm !== material.sheetLengthMm) {
      throw new BadRequestException(
        `Süpürgelik boyu tabaka boyuna eşit olmalıdır (${material.sheetLengthMm} mm).`,
      );
    }

    const existingSize = await tx.productSize.findUnique({
      where: {
        widthMm_lengthMm: {
          widthMm: dto.widthMm,
          lengthMm: dto.lengthMm,
        },
      },
    });
    const existingYield = await tx.productionYield.findFirst({
      where: {
        productId: null,
        isActive: true,
        rawMaterialId: material.id,
        pieceWidthMm: dto.widthMm,
        pieceLengthMm: dto.lengthMm,
      },
    });
    if (existingSize && existingYield) {
      throw new ConflictException(
        `Bu ölçü zaten tanımlı: ${dto.widthMm}×${dto.lengthMm} mm.`,
      );
    }

    const label = displayNameCm(dto.widthMm, dto.lengthMm, dto.displayName);

    const size = await this.upsertProductSize(
      tx,
      dto.widthMm,
      dto.lengthMm,
      label,
    );
    const yieldRow = await this.ensureGenericYield(tx, {
      rawMaterialId: material.id,
      pieceWidthMm: dto.widthMm,
      pieceLengthMm: dto.lengthMm,
      netQty: dto.netQty!,
      reason: dto.reason,
    });

    // Süpürgelik master’ı 4 ürüne de yansır; her aktif süpürgelik ürünü için recipe.
    const allProducts = await tx.product.findMany({
      where: {
        productGroupId: group.id,
        isActive: true,
        code: { in: [...SUPURGELIK_PRODUCTS] },
      },
    });
    const recipeIds: string[] = [];
    for (const p of allProducts) {
      const recipe = await this.ensureRecipe(tx, {
        productId: p.id,
        productSizeId: size.id,
        name: `${p.code} ${label}`,
        items: [
          {
            rawMaterialId: material.id,
            productionYieldId: yieldRow.id,
            quantity: new Prisma.Decimal(1),
            sortOrder: 1,
          },
        ],
      });
      recipeIds.push(recipe.id);
    }

    await this.auditService.record(
      {
        entityType: 'ProductSize',
        entityId: size.id,
        action: AuditAction.CREATE,
        fieldName: 'catalogItem',
        newValue: JSON.stringify({
          mode: 'NEW_SIZE',
          productGroup: group.code,
          productCode: product.code,
          widthMm: dto.widthMm,
          lengthMm: dto.lengthMm,
          netQty: dto.netQty!,
          yieldId: yieldRow.id,
          recipeIds,
        }),
        reason: dto.reason ?? 'Süpürgelik yeni ölçü',
      },
      tx,
    );

    return {
      mode: 'NEW_SIZE' as const,
      productGroupCode: group.code,
      productCode: product.code,
      productName: product.name,
      size: {
        id: size.id,
        widthMm: size.widthMm,
        lengthMm: size.lengthMm,
        displayName: size.displayName,
      },
      yields: [{ role: 'MAIN', id: yieldRow.id, netQty: yieldRow.netQty }],
      recipeIds,
      message:
        'Ölçü başarıyla eklendi. Süpürgelik generic NET tüm süpürgelik ürünlerinde listelenir.',
    };
  }

  private async addCitaSize(
    tx: Prisma.TransactionClient,
    group: { id: string; code: string; name: string },
    product: { id: string; code: string; name: string },
    dto: CreateCatalogItemDto,
  ) {
    const material = await this.requireActiveMaterial(dto.rawMaterialId!, tx);
    const thicknessMm = Number(material.thicknessMm.toString());
    const expectedCode =
      CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM[
        thicknessMm as keyof typeof CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM
      ];
    if (!expectedCode) {
      throw new BadRequestException(
        `Çıta için desteklenmeyen MDF kalınlığı: ${thicknessMm} mm.`,
      );
    }
    if (material.code !== expectedCode) {
      throw new BadRequestException(
        `Çıta ${thicknessMm} mm için ham madde ${expectedCode} olmalıdır (seçilen: ${material.code}).`,
      );
    }

    const duplicate = await tx.productionYield.findFirst({
      where: {
        productId: product.id,
        isActive: true,
        rawMaterialId: material.id,
        pieceWidthMm: dto.widthMm,
        pieceLengthMm: dto.lengthMm,
      },
    });
    if (duplicate) {
      throw new ConflictException(
        `Bu ölçü zaten tanımlı: ${thicknessMm} mm · ${dto.widthMm}×${dto.lengthMm} mm.`,
      );
    }

    const label = displayNameCm(dto.widthMm, dto.lengthMm, dto.displayName);

    const size = await this.upsertProductSize(
      tx,
      dto.widthMm,
      dto.lengthMm,
      label,
    );
    const yieldRow = await tx.productionYield.create({
      data: {
        productId: product.id,
        rawMaterialId: material.id,
        pieceWidthMm: dto.widthMm,
        pieceLengthMm: dto.lengthMm,
        netQty: dto.netQty!,
        isActive: true,
      },
    });
    const recipe = await this.ensureRecipe(tx, {
      productId: product.id,
      productSizeId: size.id,
      name: `CITA ${label}`,
      items: [
        {
          rawMaterialId: material.id,
          productionYieldId: yieldRow.id,
          quantity: new Prisma.Decimal(1),
          sortOrder: 1,
        },
      ],
    });

    await this.auditService.record(
      {
        entityType: 'ProductionYield',
        entityId: yieldRow.id,
        action: AuditAction.CREATE,
        fieldName: 'catalogItem',
        newValue: JSON.stringify({
          mode: 'NEW_SIZE',
          productGroup: group.code,
          productCode: product.code,
          widthMm: dto.widthMm,
          lengthMm: dto.lengthMm,
          thicknessMm,
          netQty: dto.netQty!,
          recipeId: recipe.id,
        }),
        reason: dto.reason ?? 'Çıta yeni ölçü',
      },
      tx,
    );

    return {
      mode: 'NEW_SIZE' as const,
      productGroupCode: group.code,
      productCode: product.code,
      productName: product.name,
      size: {
        id: size.id,
        widthMm: size.widthMm,
        lengthMm: size.lengthMm,
        displayName: size.displayName,
        thicknessMm,
      },
      yields: [{ role: 'MAIN', id: yieldRow.id, netQty: yieldRow.netQty }],
      recipeId: recipe.id,
      message: 'Ölçü başarıyla eklendi.',
    };
  }

  private async requireActiveMaterial(
    id: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const material = await db.rawMaterial.findUnique({
      where: { id },
    });
    if (!material?.isActive) {
      throw new BadRequestException(
        'Aktif ham madde seçilmelidir. Yoksa Ham Maddeler ekranından tanımlayın.',
      );
    }
    return material;
  }

  private async upsertProductSize(
    tx: Prisma.TransactionClient,
    widthMm: number,
    lengthMm: number,
    displayName: string,
  ) {
    const existing = await tx.productSize.findUnique({
      where: { widthMm_lengthMm: { widthMm, lengthMm } },
    });
    if (existing) return existing;
    return tx.productSize.create({
      data: { widthMm, lengthMm, displayName },
    });
  }

  private async ensureGenericYield(
    tx: Prisma.TransactionClient,
    input: {
      rawMaterialId: string;
      pieceWidthMm: number;
      pieceLengthMm: number;
      netQty: number;
      reason?: string;
    },
  ) {
    const existing = await tx.productionYield.findFirst({
      where: {
        productId: null,
        isActive: true,
        rawMaterialId: input.rawMaterialId,
        pieceWidthMm: input.pieceWidthMm,
        pieceLengthMm: input.pieceLengthMm,
      },
    });
    if (existing) {
      if (existing.netQty !== input.netQty) {
        throw new ConflictException(
          `Bu ham madde/ölçü için aktif generic NET zaten ${existing.netQty}. ` +
            `Girilen ${input.netQty} ile çelişiyor; mevcut NET’i ProductionYields ekranından yönetin.`,
        );
      }
      return existing;
    }
    const created = await tx.productionYield.create({
      data: {
        productId: null,
        rawMaterialId: input.rawMaterialId,
        pieceWidthMm: input.pieceWidthMm,
        pieceLengthMm: input.pieceLengthMm,
        netQty: input.netQty,
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
        reason: input.reason ?? 'Katalog ölçü NET',
      },
      tx,
    );
    return created;
  }

  private async ensureRecipe(
    tx: Prisma.TransactionClient,
    input: {
      productId: string;
      productSizeId: string;
      name: string;
      items: Array<{
        rawMaterialId: string;
        productionYieldId: string | null;
        quantity: Prisma.Decimal;
        sortOrder: number;
      }>;
    },
  ) {
    const existing = await tx.recipe.findUnique({
      where: {
        productId_productSizeId: {
          productId: input.productId,
          productSizeId: input.productSizeId,
        },
      },
      include: { items: true },
    });
    if (existing) {
      if (!existing.isActive) {
        throw new ConflictException(
          'Bu ürün/ölçü için pasif reçete var; otomatik reaktivasyon yapılmaz.',
        );
      }
      return existing;
    }

    return tx.recipe.create({
      data: {
        productId: input.productId,
        productSizeId: input.productSizeId,
        name: input.name,
        isActive: true,
        items: {
          create: input.items.map((item) => ({
            rawMaterialId: item.rawMaterialId,
            productionYieldId: item.productionYieldId,
            quantity: item.quantity,
            sortOrder: item.sortOrder,
          })),
        },
      },
    });
  }
}
