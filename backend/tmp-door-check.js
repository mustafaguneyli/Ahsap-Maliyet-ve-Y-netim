const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const prod = await p.product.findFirst({
    where: { id: '3d65c630-e4cf-47a1-85fa-4e63856e1f6e' },
    include: { productGroup: true },
  });
  console.log({ code: prod.code, name: prod.name, group: prod.productGroup.code });
  const size = await p.productSize.findUnique({
    where: { widthMm_lengthMm: { widthMm: 100, lengthMm: 2100 } },
  });
  console.log('size', size);
  if (size) {
    const recipe = await p.recipe.findFirst({
      where: { productId: prod.id, productSizeId: size.id, isActive: true },
      include: {
        items: { include: { rawMaterial: true, productionYield: true } },
      },
    });
    console.log(
      'recipe',
      recipe && {
        id: recipe.id,
        items: recipe.items.map((i) => ({
          code: i.rawMaterial.code,
          th: i.rawMaterial.thicknessMm.toString(),
          qty: i.quantity.toString(),
          net: i.productionYield?.netQty ?? null,
          active: i.productionYield?.isActive ?? null,
        })),
      },
    );
  }
  const yields = await p.productionYield.findMany({
    where: {
      isActive: true,
      pieceWidthMm: 100,
      pieceLengthMm: 2100,
    },
    include: { rawMaterial: true },
    take: 10,
  });
  console.log(
    'yields',
    yields.map((y) => ({
      net: y.netQty,
      th: y.rawMaterial.thicknessMm.toString(),
      code: y.rawMaterial.code,
    })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
