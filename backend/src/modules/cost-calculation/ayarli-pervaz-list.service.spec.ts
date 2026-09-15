import { CostCalculationService } from './cost-calculation.service';
import { buildAyarliPervazYieldSeedRows } from '../production-yields/pervaz-ayarli-yield-seed-data';

const GROUP = { id: 'pervaz-group', code: 'PERVAZ', name: 'Pervaz', isActive: true };
const PRODUCT = {
  id: 'ayarli-product',
  code: 'AYARLI_PERVAZ',
  name: 'Ayarlı Pervaz',
  isActive: true,
};

function masterRow(
  row: { materialCode: string; pieceWidthMm: number; pieceLengthMm: number; netQty: number },
  index: number,
  overrides: { productId?: string; isActive?: boolean; materialIsActive?: boolean } = {},
) {
  const thicknessMm = /MDF-(\d+(?:\.\d+)?)-/.exec(row.materialCode)?.[1];
  if (!thicknessMm) throw new Error(`Test ham madde kalınlığı okunamadı: ${row.materialCode}`);
  return {
    id: `yield-${index}`,
    productId: overrides.productId ?? PRODUCT.id,
    rawMaterialId: `material-${index}`,
    pieceWidthMm: row.pieceWidthMm,
    pieceLengthMm: row.pieceLengthMm,
    netQty: row.netQty,
    isActive: overrides.isActive ?? true,
    createdAt: new Date(`2026-01-01T00:00:${String(index).padStart(2, '0')}.000Z`),
    rawMaterial: {
      code: row.materialCode,
      thicknessMm,
      isActive: overrides.materialIsActive ?? true,
    },
  };
}

function createPrisma(rows: ReturnType<typeof masterRow>[]) {
  return {
    productGroup: { findUnique: jest.fn().mockResolvedValue(GROUP) },
    product: { findUnique: jest.fn().mockResolvedValue(PRODUCT) },
    productionYield: { findMany: jest.fn().mockResolvedValue(rows) },
  };
}

describe('CostCalculationService AYARLI_PERVAZ toplu liste', () => {
  it('20 aktif product-scoped MASTER ölçüyü DB sırasıyla pipeline’dan geçirir', async () => {
    const prisma = createPrisma(
      buildAyarliPervazYieldSeedRows().map((row, index) => masterRow(row, index)),
    );
    const service = new CostCalculationService(prisma as never, {} as never, {} as never);
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
    expect(prisma.productionYield.findMany).toHaveBeenCalledWith({
      where: {
        productId: PRODUCT.id,
        isActive: true,
        rawMaterial: { isActive: true },
      },
      include: { rawMaterial: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(result.rows[0]).toMatchObject({ thicknessMm: 9, widthMm: 70, lengthMm: 2200 });
    expect(result.rows[19]).toMatchObject({ thicknessMm: 18, widthMm: 100, lengthMm: 2500 });
  });

  it('inactive, pasif malzemeli ve başka productId bağlamındaki MASTER satırlarını ayırır', async () => {
    const base = buildAyarliPervazYieldSeedRows()[0];
    const prisma = createPrisma([
      masterRow(base, 0),
      masterRow(base, 1, { productId: 'other-product' }),
      masterRow({ ...base, pieceWidthMm: 80 }, 2, { isActive: false }),
      masterRow({ ...base, pieceWidthMm: 90 }, 3, { materialIsActive: false }),
    ]);
    const service = new CostCalculationService(prisma as never, {} as never, {} as never);
    jest.spyOn(service, 'getAyarliPervazMdfCost').mockResolvedValue({} as never);

    const result = await service.getAyarliPervazMdfCosts();

    expect(result.verifiedMeasureCount).toBe(1);
    expect(result.rows).toHaveLength(1);
  });

  it('registry değişmeden DB’ye eklenen yeni aktif MASTER ölçüyü keşfeder', async () => {
    const prisma = createPrisma([
      masterRow(
        {
          materialCode: 'MDF-12-2200X2800-ZIMPARALI',
          pieceWidthMm: 130,
          pieceLengthMm: 2400,
          netQty: 17,
        },
        0,
      ),
    ]);
    const service = new CostCalculationService(prisma as never, {} as never, {} as never);
    const calculate = jest
      .spyOn(service, 'getAyarliPervazMdfCost')
      .mockImplementation(async (input) => input as never);

    const result = await service.getAyarliPervazMdfCosts();

    expect(result.verifiedMeasureCount).toBe(1);
    expect(calculate).toHaveBeenCalledWith(
      {
        productCode: 'AYARLI_PERVAZ',
        thicknessMm: 12,
        widthMm: 130,
        lengthMm: 2400,
        rawMaterialCode: 'MDF-12-2200X2800-ZIMPARALI',
      },
      expect.any(Date),
    );
  });

  it('MASTER yoksa teorik fallback kombinasyonu toplu listeye eklemez', async () => {
    const prisma = createPrisma([]);
    const service = new CostCalculationService(prisma as never, {} as never, {} as never);
    const calculate = jest.spyOn(service, 'getAyarliPervazMdfCost');

    const result = await service.getAyarliPervazMdfCosts();

    expect(result.verifiedMeasureCount).toBe(0);
    expect(result.rows).toEqual([]);
    expect(calculate).not.toHaveBeenCalled();
  });
});
