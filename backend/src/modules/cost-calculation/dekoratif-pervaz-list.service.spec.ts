import { CostCalculationService } from './cost-calculation.service';
import { DEKORATIF_PERVAZ_YIELD_SEEDS } from '../production-yields/pervaz-dekoratif-yield-seed-data';

describe('CostCalculationService DEKORATIF_PERVAZ toplu liste', () => {
  it('yalnız aktif doğrulanmış altı master ölçüyü sırayla hesaplar', async () => {
    const prisma = {
      productionYield: {
        findMany: jest.fn().mockResolvedValue(
          DEKORATIF_PERVAZ_YIELD_SEEDS.map((row, index) => ({
            id: `yield-${index}`,
            pieceWidthMm: row.pieceWidthMm,
            pieceLengthMm: row.pieceLengthMm,
            rawMaterial: { code: row.materialCode },
          })),
        ),
      },
    };
    const service = new CostCalculationService(
      prisma as never,
      {} as never,
      {} as never,
    );
    const calculate = jest
      .spyOn(service as any, 'calculateDekoratifPervazRow')
      .mockImplementation(async (...args: unknown[]) => {
        const context = args[1] as
          (typeof DEKORATIF_PERVAZ_YIELD_SEEDS)[number];
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
    expect(result.rows.map((row) => row.thicknessMm)).toEqual([
      12, 12, 14, 14, 18, 18,
    ]);
  });
});
