import { MaterialPriceType, PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { seedDoorFrameExtraCosts } from '../src/modules/extra-costs/door-frame-extra-cost-seed';
import { seedPervazExtraCosts } from '../src/modules/extra-costs/pervaz-extra-cost-seed';
import { seedDoorFramePriceOverrides } from '../src/modules/price-overrides/door-frame-price-override-seed';
import { seedDoorFramePricingSettings } from '../src/modules/pricing/door-frame-pricing-seed';
import { seedAyarliPervazPricingSettings } from '../src/modules/pricing/ayarli-pervaz-pricing-seed';
import { seedAyarliPervazPricingRowExceptions } from '../src/modules/pricing/ayarli-pervaz-pricing-row-exception-seed';
import { seedDoorFrameProducts } from '../src/modules/products/door-frame-product-seed';
import { seedDoorFrameProductSizes } from '../src/modules/products/door-frame-product-size-seed';
import { seedPervazProducts } from '../src/modules/products/pervaz-product-seed';
import { seedKilcikTypes } from '../src/modules/pervaz/kilcik-type-seed';
import { seedAyarliPervazKilcikYields } from '../src/modules/pervaz/ayarli-pervaz-kilcik-yield-seed';
import { seedDoorFrameProductionYields } from '../src/modules/production-yields/door-frame-yield-seed-data';
import { seedAyarliPervazProductionYields } from '../src/modules/production-yields/pervaz-ayarli-yield-seed-data';

/**
 * DEMPAŞ 2026-3 Revize Ham MDF fiyat tablosu.
 * Idempotent: code unique; mevcut kayıtlar atlanır / fiyat yalnızca yoksa eklenir.
 */
const EFFECTIVE_FROM = new Date('2026-03-01T00:00:00.000Z');
const SUPPLIER = 'DEMPAŞ';

type SeedMaterial = {
  code: string;
  name: string;
  thicknessMm: string;
  sheetWidthMm: number;
  sheetLengthMm: number;
  surfaceType: string;
  cashPrice: string;
  cardPrice: string;
};

const MATERIALS: SeedMaterial[] = [
  {
    code: 'MDF-2_7-2100X2800-ZIMPARALI',
    name: '2,7 MM MDF 210×280 Zımparalı',
    thicknessMm: '2.7',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '525.00',
    cardPrice: '620.00',
  },
  {
    code: 'MDF-4-2100X2800-ZIMPARALI',
    name: '04 MM MDF 210×280 Zımparalı',
    thicknessMm: '4',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '830.00',
    cardPrice: '980.00',
  },
  {
    code: 'MDF-4-2200X2800-ZIMPARALI',
    name: '04 MM MDF 220×280 Zımparalı',
    thicknessMm: '4',
    sheetWidthMm: 2200,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '900.00',
    cardPrice: '1050.00',
  },
  {
    code: 'MDF-6-2100X2800-ZIMPARALI-LIGHT',
    name: '06 MM MDF 210×280 Zımparalı Light',
    thicknessMm: '6',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı Light',
    cashPrice: '1000.00',
    cardPrice: '1180.00',
  },
  {
    code: 'MDF-6-2100X2800-ZIMPARALI',
    name: '06 MM MDF 210×280 Zımparalı',
    thicknessMm: '6',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '1050.00',
    cardPrice: '1220.00',
  },
  {
    code: 'MDF-6-2200X2800-ZIMPARALI',
    name: '06 MM MDF 220×280 Zımparalı',
    thicknessMm: '6',
    sheetWidthMm: 2200,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '1210.00',
    cardPrice: '1425.00',
  },
  {
    code: 'MDF-8-2100X2800-ZIMPARALI',
    name: '08 MM MDF 210×280 Zımparalı',
    thicknessMm: '8',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '1375.00',
    cardPrice: '1620.00',
  },
  {
    code: 'MDF-9-2200X2800-ZIMPARALI',
    name: '09 MM MDF 220×280 Zımparalı',
    thicknessMm: '9',
    sheetWidthMm: 2200,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '1600.00',
    cardPrice: '1880.00',
  },
  {
    code: 'MDF-10-2100X2800-ZIMPARALI',
    name: '10 MM MDF 210×280 Zımparalı',
    thicknessMm: '10',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '1600.00',
    cardPrice: '1880.00',
  },
  {
    code: 'MDF-12-2100X2800-ZIMPARALI',
    name: '12 MM MDF 210×280 Zımparalı',
    thicknessMm: '12',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '1885.00',
    cardPrice: '2185.00',
  },
  {
    code: 'MDF-12-2200X2800-ZIMPARALI',
    name: '12 MM MDF 220×280 Zımparalı',
    thicknessMm: '12',
    sheetWidthMm: 2200,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '2100.00',
    cardPrice: '2475.00',
  },
  {
    code: 'MDF-14-2100X2800-ZIMPARALI',
    name: '14 MM MDF 210×280 Zımparalı',
    thicknessMm: '14',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '2225.00',
    cardPrice: '2625.00',
  },
  {
    code: 'MDF-16-2100X2800-ZIMPARALI',
    name: '16 MM MDF 210×280 Zımparalı',
    thicknessMm: '16',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '2550.00',
    cardPrice: '3000.00',
  },
  {
    code: 'MDF-18-2100X2800-ZIMPARALI-NEOPAN',
    name: '18 MM MDF 210×280 Zımparalı Neopan',
    thicknessMm: '18',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı Neopan',
    cashPrice: '2300.00',
    cardPrice: '2700.00',
  },
  {
    code: 'MDF-18-2100X2800-ZIMPARALI',
    name: '18 MM MDF 210×280 Zımparalı',
    thicknessMm: '18',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '2400.00',
    cardPrice: '2800.00',
  },
  {
    code: 'MDF-18-2200X2800-ZIMPARALI',
    name: '18 MM MDF 220×280 Zımparalı',
    thicknessMm: '18',
    sheetWidthMm: 2200,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '2900.00',
    cardPrice: '3400.00',
  },
  {
    code: 'MDF-18-1830X3660-ZIMPARALI',
    name: '18 MM MDF 183×366 Zımparalı',
    thicknessMm: '18',
    sheetWidthMm: 1830,
    sheetLengthMm: 3660,
    surfaceType: 'Zımparalı',
    cashPrice: '3200.00',
    cardPrice: '3775.00',
  },
  {
    code: 'MDF-22-2100X2800-ZIMPARALI',
    name: '22 MM MDF 210×280 Zımparalı',
    thicknessMm: '22',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '3750.00',
    cardPrice: '4400.00',
  },
  {
    code: 'MDF-25-2100X2800-ZIMPARALI',
    name: '25 MM MDF 210×280 Zımparalı',
    thicknessMm: '25',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '4375.00',
    cardPrice: '5150.00',
  },
  {
    code: 'MDF-30-2100X2800-ZIMPARALI',
    name: '30 MM MDF 210×280 Zımparalı',
    thicknessMm: '30',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    cashPrice: '5500.00',
    cardPrice: '6500.00',
  },
  {
    code: 'MDF-18-2100X2800-TEK-YUZ-MEMBRANLIK-4',
    name: '18 MM 210×280 Tek Yüz Membranlık 4 Nolu',
    thicknessMm: '18',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Tek Yüz Membranlık 4 Nolu',
    cashPrice: '3800.00',
    cardPrice: '4460.00',
  },
];

async function ensureOpenPrice(
  prisma: PrismaClient,
  rawMaterialId: string,
  priceType: MaterialPriceType,
  price: string,
): Promise<void> {
  const open = await prisma.rawMaterialPrice.findFirst({
    where: {
      rawMaterialId,
      priceType,
      isActive: true,
      effectiveTo: null,
    },
  });

  if (open) {
    return;
  }

  await prisma.rawMaterialPrice.create({
    data: {
      rawMaterialId,
      priceType,
      price: new Decimal(price),
      effectiveFrom: EFFECTIVE_FROM,
      effectiveTo: null,
      isActive: true,
    },
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    let createdMaterials = 0;
    let createdPrices = 0;

    for (const item of MATERIALS) {
      const existing = await prisma.rawMaterial.findUnique({
        where: { code: item.code },
      });

      let materialId: string;

      if (existing) {
        materialId = existing.id;
      } else {
        const created = await prisma.rawMaterial.create({
          data: {
            code: item.code,
            name: item.name,
            thicknessMm: new Decimal(item.thicknessMm),
            sheetWidthMm: item.sheetWidthMm,
            sheetLengthMm: item.sheetLengthMm,
            surfaceType: item.surfaceType,
            supplierName: SUPPLIER,
            isActive: true,
          },
        });
        materialId = created.id;
        createdMaterials += 1;
      }

      const beforeCash = await prisma.rawMaterialPrice.count({
        where: {
          rawMaterialId: materialId,
          priceType: MaterialPriceType.CASH,
          isActive: true,
          effectiveTo: null,
        },
      });
      const beforeCard = await prisma.rawMaterialPrice.count({
        where: {
          rawMaterialId: materialId,
          priceType: MaterialPriceType.CARD_INSTALLMENT,
          isActive: true,
          effectiveTo: null,
        },
      });

      await ensureOpenPrice(prisma, materialId, MaterialPriceType.CASH, item.cashPrice);
      await ensureOpenPrice(
        prisma,
        materialId,
        MaterialPriceType.CARD_INSTALLMENT,
        item.cardPrice,
      );

      const afterCash = await prisma.rawMaterialPrice.count({
        where: {
          rawMaterialId: materialId,
          priceType: MaterialPriceType.CASH,
          isActive: true,
          effectiveTo: null,
        },
      });
      const afterCard = await prisma.rawMaterialPrice.count({
        where: {
          rawMaterialId: materialId,
          priceType: MaterialPriceType.CARD_INSTALLMENT,
          isActive: true,
          effectiveTo: null,
        },
      });

      createdPrices += afterCash - beforeCash + (afterCard - beforeCard);
    }

    console.log(
      `Seed tamamlandı. Yeni ham madde: ${createdMaterials}, yeni açık fiyat: ${createdPrices}. Toplam master: ${MATERIALS.length}.`,
    );

    const yieldReport = await seedDoorFrameProductionYields(prisma);
    console.log(
      `Kapı Kasası NET seed: beklenen=${yieldReport.totalExpected}, yeni=${yieldReport.created}, aynı=${yieldReport.unchanged}, conflict=${yieldReport.conflicts.length}, eksikHamMadde=${yieldReport.missingMaterials.length}`,
    );
    if (yieldReport.missingMaterials.length > 0) {
      console.warn('Eksik ham maddeler:', yieldReport.missingMaterials.join(', '));
    }
    if (yieldReport.conflicts.length > 0) {
      console.warn('NET conflict (overwrite yok):');
      for (const c of yieldReport.conflicts) {
        console.warn(
          `  ${c.materialCode} ${c.pieceWidthMm}x${c.pieceLengthMm}: DB=${c.existingNetQty}, Excel=${c.excelNetQty}`,
        );
      }
    }

    const ayarliPervazYieldReport = await seedAyarliPervazProductionYields(prisma);
    console.log(
      `Ayarlı Pervaz NET seed: beklenen=${ayarliPervazYieldReport.totalExpected}, yeni=${ayarliPervazYieldReport.created}, aynı=${ayarliPervazYieldReport.unchanged}, conflict=${ayarliPervazYieldReport.conflicts.length}, eksikHamMadde=${ayarliPervazYieldReport.missingMaterials.length}`,
    );
    if (ayarliPervazYieldReport.missingMaterials.length > 0) {
      console.warn('Eksik ham maddeler:', ayarliPervazYieldReport.missingMaterials.join(', '));
    }
    if (ayarliPervazYieldReport.conflicts.length > 0) {
      console.warn('Ayarlı Pervaz NET conflict (overwrite yok):');
      for (const c of ayarliPervazYieldReport.conflicts) {
        console.warn(
          `  ${c.materialCode} ${c.pieceWidthMm}x${c.pieceLengthMm}: DB=${c.existingNetQty}, Excel=${c.excelNetQty}`,
        );
      }
    }

    const extraCostReport = await seedDoorFrameExtraCosts(prisma);
    console.log(
      `Kapı Kasası ek maliyet seed: grupYeni=${extraCostReport.productGroupCreated}, tipYeni=${extraCostReport.typesCreated}, değerYeni=${extraCostReport.valuesCreated}, mevcutAtlandı=${extraCostReport.valuesSkippedExisting}`,
    );

    const productReport = await seedDoorFrameProducts(prisma);
    console.log(
      `Kapı Kasası ürün seed: grupYeni=${productReport.productGroupCreated}, ürünYeni=${productReport.productsCreated}, mevcutAtlandı=${productReport.productsSkippedExisting}`,
    );

    const pervazProductReport = await seedPervazProducts(prisma);
    console.log(
      `Pervaz ürün seed: grupYeni=${pervazProductReport.productGroupCreated}, ürünYeni=${pervazProductReport.productsCreated}, mevcutAtlandı=${pervazProductReport.productsSkippedExisting}`,
    );

    const pervazExtraCostReport = await seedPervazExtraCosts(prisma);
    console.log(
      `Pervaz ek maliyet seed: beklenen=${pervazExtraCostReport.totalExpected}, yeni=${pervazExtraCostReport.created}, aynı=${pervazExtraCostReport.unchanged}, conflict=${pervazExtraCostReport.conflicts.length}, eksikGrup=${pervazExtraCostReport.missingProductGroup}, eksikTip=${pervazExtraCostReport.missingTypes.join(',') || 'yok'}`,
    );
    if (pervazExtraCostReport.conflicts.length > 0) {
      console.warn('Pervaz ek maliyet conflict (overwrite yok):');
      for (const c of pervazExtraCostReport.conflicts) {
        console.warn(
          `  ${c.typeCode}: DB=${c.existingAmount}, Excel=${c.excelAmount}`,
        );
      }
    }

    const kilcikTypeReport = await seedKilcikTypes(prisma);
    console.log(
      `Kılçık tipi seed: yeni=${kilcikTypeReport.created}, mevcutAtlandı=${kilcikTypeReport.skippedExisting}`,
    );

    const ayarliKilcikYieldReport = await seedAyarliPervazKilcikYields(prisma);
    console.log(
      `Ayarlı Pervaz kılçık NET seed: beklenen=${ayarliKilcikYieldReport.totalExpected}, yeni=${ayarliKilcikYieldReport.created}, normalize=${ayarliKilcikYieldReport.normalized}, aynı=${ayarliKilcikYieldReport.unchanged}, conflict=${ayarliKilcikYieldReport.conflicts.length}, eksikÜrün=${ayarliKilcikYieldReport.missingProduct}, eksikHamMadde=${ayarliKilcikYieldReport.missingMaterial}`,
    );
    if (ayarliKilcikYieldReport.conflicts.length > 0) {
      console.warn('Ayarlı Pervaz kılçık NET conflict (overwrite yok):');
      for (const c of ayarliKilcikYieldReport.conflicts) {
        console.warn(
          `  ${c.pervazThicknessMm}mm ${c.pieceLengthMm}: NET DB=${c.existingNetQty}/Excel=${c.excelNetQty}, cut DB=${c.existingExcelCutWidthMm}/Excel=${c.excelCutWidthMm}`,
        );
      }
    }

    const sizeReport = await seedDoorFrameProductSizes(prisma);
    console.log(
      `Kapı Kasası ölçü seed: yeni=${sizeReport.created}, mevcutAtlandı=${sizeReport.skippedExisting}`,
    );

    const pricingReport = await seedDoorFramePricingSettings(prisma);
    console.log(
      `Kapı Kasası fiyatlandırma seed: yeni=${pricingReport.created}, kartFarkıDolduruldu=${pricingReport.cardMarkupBackfilled}, mevcutAtlandı=${pricingReport.skippedExisting}, eksikÜrün=${pricingReport.missingProducts.length}`,
    );
    if (pricingReport.missingProducts.length > 0) {
      console.warn('Eksik ürünler:', pricingReport.missingProducts.join(', '));
    }

    const ayarliPricingReport = await seedAyarliPervazPricingSettings(prisma);
    console.log(
      `Ayarlı Pervaz fiyatlandırma seed: yeni=${ayarliPricingReport.created}, aynı=${ayarliPricingReport.unchanged}, conflict=${ayarliPricingReport.conflicts.length}, eksikGrup=${ayarliPricingReport.missingProductGroup}, eksikÜrün=${ayarliPricingReport.missingProduct}`,
    );
    if (ayarliPricingReport.conflicts.length > 0) {
      console.warn('Ayarlı Pervaz fiyatlandırma conflict (overwrite yok):');
      for (const c of ayarliPricingReport.conflicts) {
        console.warn(`  ${c.field}: DB=${c.existingValue}, Excel=${c.seedValue}`);
      }
    }

    const ayarliRowExceptionReport = await seedAyarliPervazPricingRowExceptions(prisma);
    console.log(
      `Ayarlı Pervaz satır istisnası seed: beklenen=${ayarliRowExceptionReport.totalExpected}, yeni=${ayarliRowExceptionReport.created}, aynı=${ayarliRowExceptionReport.unchanged}, conflict=${ayarliRowExceptionReport.conflicts.length}, eksikGrup=${ayarliRowExceptionReport.missingProductGroup}, eksikÜrün=${ayarliRowExceptionReport.missingProduct}`,
    );
    if (ayarliRowExceptionReport.conflicts.length > 0) {
      console.warn('Ayarlı Pervaz satır istisnası conflict (overwrite yok):');
      for (const c of ayarliRowExceptionReport.conflicts) {
        console.warn(
          `  ${c.thicknessMm}/${c.widthMm}/${c.lengthMm} ${c.field}: DB=${c.existingValue}, Excel=${c.seedValue}`,
        );
      }
    }

    const overrideReport = await seedDoorFramePriceOverrides(prisma);
    console.log(
      `Kapı Kasası nakit override seed: yeni=${overrideReport.created}, mevcutAtlandı=${overrideReport.skippedExisting}, eksikÜrün=${overrideReport.missingProduct}, eksikÖlçü=${overrideReport.missingSizes.join(',') || 'yok'}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
