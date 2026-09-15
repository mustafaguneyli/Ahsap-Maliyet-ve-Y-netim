import { CostCalculationService } from './cost-calculation.service';
import { DEKORATIF_GENIS_KILCIK_YIELD_SEEDS } from '../production-yields/pervaz-dekoratif-genis-kilcik-yield-seed-data';

describe('CostCalculationService DEKORATIF_PERVAZ_GENIS_KILCIK liste', () => {
  it('DB’deki iki aktif product-scoped ana MASTER satırını döndürür', async () => {
    const product = {
      id: 'wide-product',
      code: 'DEKORATIF_PERVAZ_GENIS_KILCIK',
      name: 'Dekoratif Pervaz - Geniş Kılçık',
      isActive: true,
    };
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'group', code: 'PERVAZ', name: 'Pervaz', isActive: true,
        }),
      },
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      productionYield: {
        findMany: jest.fn().mockResolvedValue(
          DEKORATIF_GENIS_KILCIK_YIELD_SEEDS.map((row, index) => ({
            id: `yield-${index}`,
            productId: product.id,
            rawMaterialId: `material-${index}`,
            pieceWidthMm: row.pieceWidthMm,
            pieceLengthMm: row.pieceLengthMm,
            netQty: row.netQty,
            isActive: true,
            createdAt: new Date(`2026-01-01T00:00:0${index}.000Z`),
            rawMaterial: {
              code: row.materialCode,
              thicknessMm: String(row.thicknessMm),
              isActive: true,
            },
          })),
        ),
      },
    };
    const service = new CostCalculationService(prisma as never, {} as never, {} as never);
    const calculate = jest
      .spyOn(service as any, 'calculateDekoratifPervazRow')
      .mockImplementation(async (...args: unknown[]) => {
        const context = args[1] as { thicknessMm: number; pieceWidthMm: number; pieceLengthMm: number };
        return {
          thicknessMm: context.thicknessMm,
          widthMm: context.pieceWidthMm,
          lengthMm: context.pieceLengthMm,
        };
      });

    const result = await service.getDekoratifGenisKilcikCosts(
      new Date('2026-09-08T12:00:00.000Z'),
    );

    expect(result.productCode).toBe('DEKORATIF_PERVAZ_GENIS_KILCIK');
    expect(result.verifiedMeasureCount).toBe(2);
    expect(result.rows).toEqual([
      { thicknessMm: 12, widthMm: 90, lengthMm: 2200 },
      { thicknessMm: 12, widthMm: 90, lengthMm: 2300 },
    ]);
    expect(calculate).toHaveBeenCalledTimes(2);
    expect(prisma.productionYield.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ productId: product.id }) }),
    );
  });
});
