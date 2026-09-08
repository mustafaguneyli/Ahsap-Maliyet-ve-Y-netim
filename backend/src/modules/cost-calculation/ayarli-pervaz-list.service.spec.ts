import { CostCalculationService } from './cost-calculation.service';
import { buildAyarliPervazYieldSeedRows } from '../production-yields/pervaz-ayarli-yield-seed-data';

describe('CostCalculationService AYARLI_PERVAZ toplu liste', () => {
  it('yalnız aktif doğrulanmış 20 master ölçüyü seed sırasıyla pipeline’dan geçirir', async () => {
    const masterRows = buildAyarliPervazYieldSeedRows();
    const prisma = {
      productionYield: {
        findMany: jest.fn().mockResolvedValue([
          ...masterRows.map((row, index) => ({
            id: `yield-${index}`,
            pieceWidthMm: row.pieceWidthMm,
            pieceLengthMm: row.pieceLengthMm,
            rawMaterial: { code: row.materialCode },
          })),
          {
            id: 'fallback-like-row',
            pieceWidthMm: 70,
            pieceLengthMm: 2800,
            rawMaterial: { code: 'MDF-9-2200X2800-ZIMPARALI' },
          },
        ]),
      },
    };
    const service = new CostCalculationService(
      prisma as never,
      {} as never,
      {} as never,
    );
    const calculate = jest
      .spyOn(service, 'getAyarliPervazMdfCost')
      .mockImplementation(async (input, now) => ({
        ...input,
        asOf: now?.toISOString() ?? '',
      }) as never);
    const now = new Date('2026-09-08T12:00:00.000Z');

    const result = await service.getAyarliPervazMdfCosts(now);

    expect(result.productCode).toBe('AYARLI_PERVAZ');
    expect(result.verifiedMeasureCount).toBe(20);
    expect(result.rows).toHaveLength(20);
    expect(calculate).toHaveBeenCalledTimes(20);
    expect(calculate).toHaveBeenCalledWith(
      expect.objectContaining({
        productCode: 'AYARLI_PERVAZ',
        thicknessMm: 9,
        widthMm: 70,
        lengthMm: 2200,
        rawMaterialCode: 'MDF-9-2200X2800-ZIMPARALI',
      }),
      now,
    );
    expect(calculate).toHaveBeenCalledWith(
      expect.objectContaining({
        thicknessMm: 12,
        widthMm: 100,
        lengthMm: 2500,
        rawMaterialCode: 'MDF-12-2100X2800-ZIMPARALI',
      }),
      now,
    );
    expect(prisma.productionYield.findMany).toHaveBeenCalledWith({
      where: {
        productId: null,
        isActive: true,
        OR: expect.arrayContaining([
          expect.objectContaining({
            rawMaterial: {
              code: 'MDF-9-2200X2800-ZIMPARALI',
              isActive: true,
            },
            pieceWidthMm: 70,
            pieceLengthMm: 2200,
          }),
        ]),
      },
      include: { rawMaterial: true },
    });
    expect(result.rows[0]).toMatchObject({
      thicknessMm: 9,
      widthMm: 70,
      lengthMm: 2200,
    });
    expect(result.rows[16]).toMatchObject({
      thicknessMm: 16,
      widthMm: 100,
      lengthMm: 2500,
    });
    expect(result.rows[19]).toMatchObject({
      thicknessMm: 18,
      widthMm: 100,
      lengthMm: 2500,
    });
    expect(result.rows).not.toContainEqual(
      expect.objectContaining({ widthMm: 70, lengthMm: 2800 }),
    );
  });

  it('pasif veya DB’de bulunmayan doğrulanmış master ölçüyü listelemez', async () => {
    const [onlyActive] = buildAyarliPervazYieldSeedRows();
    const prisma = {
      productionYield: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'only-active',
            pieceWidthMm: onlyActive.pieceWidthMm,
            pieceLengthMm: onlyActive.pieceLengthMm,
            rawMaterial: { code: onlyActive.materialCode },
          },
        ]),
      },
    };
    const service = new CostCalculationService(
      prisma as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service, 'getAyarliPervazMdfCost').mockResolvedValue({} as never);

    const result = await service.getAyarliPervazMdfCosts();

    expect(result.verifiedMeasureCount).toBe(1);
    expect(result.rows).toHaveLength(1);
  });
});
