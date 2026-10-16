import { BadRequestException, NotFoundException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';
import { PrismaService } from '../../prisma/prisma.service';

export type ActiveProductMasterRow = {
  id: string;
  productId: string;
  rawMaterialId: string;
  materialCode: string;
  thicknessMm: string;
  widthMm: number;
  lengthMm: number;
  netQty: number;
};

/**
 * Runtime liste keşfi yalnız ilgili ürüne ait aktif MASTER ProductionYield
 * kayıtlarından yapılır. Generic veya başka ürüne ait kayıtlar listeye sızmaz.
 */
export async function discoverActiveProductMasterRows(
  prisma: PrismaService,
  input: { productGroupCode: string; productCode: string },
) {
  const { currentCatalogCache } = await import('../../data-store/firestore-catalog-cache');
  const cache = currentCatalogCache();
  if (cache) {
    return discoverFromCache(cache, input);
  }
  const group = await prisma.productGroup.findUnique({
    where: { code: input.productGroupCode },
  });
  if (!group?.isActive) {
    throw new NotFoundException(
      `Aktif ürün grubu bulunamadı: ${input.productGroupCode}`,
    );
  }

  const product = await prisma.product.findUnique({
    where: {
      productGroupId_code: {
        productGroupId: group.id,
        code: input.productCode,
      },
    },
  });
  if (!product?.isActive) {
    throw new NotFoundException(`Aktif ürün bulunamadı: ${input.productCode}`);
  }

  const masters = await prisma.productionYield.findMany({
    where: {
      productId: product.id,
      isActive: true,
      rawMaterial: { isActive: true },
    },
    include: { rawMaterial: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const rows: ActiveProductMasterRow[] = [];
  const uniqueContexts = new Set<string>();
  for (const master of masters) {
    if (
      !master.isActive ||
      master.productId !== product.id ||
      !master.rawMaterial.isActive
    ) {
      continue;
    }
    const thickness = toDecimal(master.rawMaterial.thicknessMm);
    if (!thickness.isFinite() || thickness.lte(0)) {
      throw new BadRequestException(
        `${master.rawMaterial.code} için geçersiz MDF kalınlığı: ${thickness.toFixed()}`,
      );
    }
    const thicknessMm = thickness.toFixed();
    const contextKey = [
      product.id,
      thicknessMm,
      master.pieceWidthMm,
      master.pieceLengthMm,
    ].join('|');
    if (uniqueContexts.has(contextKey)) {
      throw new BadRequestException(
        `${input.productCode} için aynı kalınlık ve ölçüde birden fazla aktif MASTER var: ` +
          `${thicknessMm} mm / ${master.pieceWidthMm}×${master.pieceLengthMm}.`,
      );
    }
    uniqueContexts.add(contextKey);
    rows.push({
      id: master.id,
      productId: product.id,
      rawMaterialId: master.rawMaterialId,
      materialCode: master.rawMaterial.code,
      thicknessMm,
      widthMm: master.pieceWidthMm,
      lengthMm: master.pieceLengthMm,
      netQty: master.netQty,
    });
  }

  return { group, product, rows };
}

function discoverFromCache(
  cache: import('../../data-store/firestore-catalog-cache').FirestoreCatalogCache,
  input: { productGroupCode: string; productCode: string },
) {
  const group = cache.groupByCode(input.productGroupCode);
  if (!group) {
    throw new NotFoundException(
      `Aktif ürün grubu bulunamadı: ${input.productGroupCode}`,
    );
  }
  const product = cache.productByGroupAndCode(String(group.id), input.productCode);
  if (!product) {
    throw new NotFoundException(`Aktif ürün bulunamadı: ${input.productCode}`);
  }
  const masters = cache.productYields(String(product.id));
  const rows: ActiveProductMasterRow[] = [];
  const uniqueContexts = new Set<string>();
  for (const master of masters) {
    const material = cache.materialById(String(master.rawMaterialId));
    if (!material || material.isActive !== true) {
      continue;
    }
    const thickness = toDecimal(String(material.thicknessMm));
    if (!thickness.isFinite() || thickness.lte(0)) {
      throw new BadRequestException(
        `${material.code} için geçersiz MDF kalınlığı: ${thickness.toFixed()}`,
      );
    }
    const thicknessMm = thickness.toFixed();
    const contextKey = [
      String(product.id),
      thicknessMm,
      Number(master.pieceWidthMm),
      Number(master.pieceLengthMm),
    ].join('|');
    if (uniqueContexts.has(contextKey)) {
      throw new BadRequestException(
        `${input.productCode} için aynı kalınlık ve ölçüde birden fazla aktif MASTER var: ` +
          `${thicknessMm} mm / ${master.pieceWidthMm}×${master.pieceLengthMm}.`,
      );
    }
    uniqueContexts.add(contextKey);
    rows.push({
      id: String(master.id),
      productId: String(product.id),
      rawMaterialId: String(master.rawMaterialId),
      materialCode: String(material.code),
      thicknessMm,
      widthMm: Number(master.pieceWidthMm),
      lengthMm: Number(master.pieceLengthMm),
      netQty: Number(master.netQty),
    });
  }
  return {
    group: {
      id: String(group.id),
      code: String(group.code),
      name: String(group.name),
      isActive: true,
    },
    product: {
      id: String(product.id),
      productGroupId: String(product.productGroupId),
      code: String(product.code),
      name: String(product.name),
      isActive: true,
    },
    rows,
  };
}
