import { CostCalculationService } from './cost-calculation.service';
import { DEKORATIF_PERVAZ_YIELD_SEEDS } from '../production-yields/pervaz-dekoratif-yield-seed-data';

describe('CostCalculationService DEKORATIF_PERVAZ toplu liste', () => {
  it('DB’deki altı aktif product-scoped MASTER ölçüyü sırayla hesaplar', async () => {
    const product = {
      id: 'dekoratif-product', code: 'DEKORATIF_PERVAZ', name: 'Dekoratif Pervaz', isActive: true,
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
          DEKORATIF_PERVAZ_YIELD_SEEDS.map((row, index) => ({
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

    const result = await service.getDekoratifPervazCosts(
      new Date('2026-09-08T12:00:00.000Z'),
    );

    expect(result.productCode).toBe('DEKORATIF_PERVAZ');
    expect(result.verifiedMeasureCount).toBe(6);
    expect(result.rows).toHaveLength(6);
    expect(calculate).toHaveBeenCalledTimes(6);
    expect(result.rows.map((row) => row.thicknessMm)).toEqual([12, 12, 14, 14, 18, 18]);
    expect(prisma.productionYield.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ productId: product.id }) }),
    );
  });
});
