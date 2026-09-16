import { MaterialPriceType, PrismaClient } from '@prisma/client';
import { CITA_SHEET_MM, CITA_SUPPORTED_THICKNESSES_MM } from './cita-cut-rule.fixture';

type DiscoveredMaterial = {
  thicknessMm: number;
  code: string;
  sheetWidthMm: number;
  sheetLengthMm: number;
  surfaceType: string | null;
  isActive: boolean;
  hasActiveCardInstallment: boolean;
};

describe('CITA RawMaterial 2100×2800 discovery (yazmaz)', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('desteklenen kalınlıklarda 2100×2800 eşleşmelerini raporlar; 2200 alternatif seçilmez', async () => {
    const now = new Date();
    const discovered: DiscoveredMaterial[] = [];
    const missing: number[] = [];

    for (const thicknessMm of CITA_SUPPORTED_THICKNESSES_MM) {
      const matches = await prisma.rawMaterial.findMany({
        where: {
          thicknessMm,
          sheetWidthMm: CITA_SHEET_MM.widthMm,
          sheetLengthMm: CITA_SHEET_MM.lengthMm,
        },
        include: {
          prices: {
            where: {
              priceType: MaterialPriceType.CARD_INSTALLMENT,
              isActive: true,
            },
          },
        },
        orderBy: { code: 'asc' },
      });

      if (matches.length === 0) {
        missing.push(thicknessMm);
        const forbiddenAlt = await prisma.rawMaterial.findMany({
          where: {
            thicknessMm,
            sheetWidthMm: { not: CITA_SHEET_MM.widthMm },
            sheetLengthMm: CITA_SHEET_MM.lengthMm,
          },
        });
        expect(forbiddenAlt.every((row) => row.sheetWidthMm !== 2100)).toBe(true);
        continue;
      }

      for (const material of matches) {
        const hasActiveCardInstallment = material.prices.some(
          (price) =>
            price.effectiveFrom.getTime() <= now.getTime() &&
            (price.effectiveTo == null || price.effectiveTo.getTime() > now.getTime()),
        );
        discovered.push({
          thicknessMm,
          code: material.code,
          sheetWidthMm: material.sheetWidthMm,
          sheetLengthMm: material.sheetLengthMm,
          surfaceType: material.surfaceType,
          isActive: material.isActive,
          hasActiveCardInstallment,
        });
      }
    }

    expect(discovered.every((row) => row.sheetWidthMm === 2100)).toBe(true);
    expect(discovered.every((row) => row.sheetLengthMm === 2800)).toBe(true);
    expect(discovered.some((row) => row.sheetWidthMm === 2200)).toBe(false);

    process.stdout.write(
      `${JSON.stringify({ discovered, missingThicknessesMm: missing }, null, 2)}\n`,
    );
  });
});
