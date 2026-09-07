import { PervazQtyService } from './pervaz-qty.service';

describe('PervazQtyService', () => {
  it('ProductionYield master varsa ana pervaz EXCEL_MASTER döner ve create çağırmaz', async () => {
    const prisma = {
      productionYield: {
        findFirst: jest.fn().mockResolvedValue({ netQty: 22 }),
        create: jest.fn(),
      },
      pervazKilcikYield: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    const service = new PervazQtyService(prisma as never);

    const result = await service.resolvePervazPiece({
      rawMaterialId: 'rm-12-210',
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
      pieceWidthMm: 100,
      pieceLengthMm: 2500,
    });

    expect(result.source).toBe('EXCEL_MASTER');
    expect(result.netQty).toBe(22);
    expect(result.calculatedQty).toBe(21);
    expect(prisma.productionYield.create).not.toHaveBeenCalled();
    expect(prisma.pervazKilcikYield.create).not.toHaveBeenCalled();
  });

  it('kılçık master yoksa CALCULATED_EXCEL_RULE üretir, kaydetmez', async () => {
    const prisma = {
      productionYield: { findFirst: jest.fn(), create: jest.fn() },
      pervazKilcikYield: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    const service = new PervazQtyService(prisma as never);

    const result = await service.resolveKilcik({
      productId: 'p-ayarli',
      pervazThicknessMm: 9,
      pieceLengthMm: 2300,
    });

    expect(result.source).toBe('CALCULATED_EXCEL_RULE');
    expect(result.netQty).toBe(52);
    expect(prisma.pervazKilcikYield.findFirst).toHaveBeenCalledWith({
      where: {
        productId: 'p-ayarli',
        pervazThicknessMm: 9,
        pieceLengthMm: 2300,
        source: 'EXCEL_MASTER',
        isActive: true,
      },
    });
    expect(prisma.pervazKilcikYield.create).not.toHaveBeenCalled();
  });

  it('kılçık EXCEL_MASTER aramasında kilcikTypeId kullanmaz', async () => {
    const prisma = {
      productionYield: { findFirst: jest.fn(), create: jest.fn() },
      pervazKilcikYield: {
        findFirst: jest.fn().mockResolvedValue({ netQty: 66 }),
        create: jest.fn(),
      },
    };
    const service = new PervazQtyService(prisma as never);

    const result = await service.resolveKilcik({
      productId: 'p-ayarli',
      kilcikTypeId: 't-wide',
      pervazThicknessMm: 9,
      pieceLengthMm: 2200,
    });

    expect(result.source).toBe('EXCEL_MASTER');
    expect(result.netQty).toBe(66);
    expect(prisma.pervazKilcikYield.findFirst).toHaveBeenCalledWith({
      where: {
        productId: 'p-ayarli',
        pervazThicknessMm: 9,
        pieceLengthMm: 2200,
        source: 'EXCEL_MASTER',
        isActive: true,
      },
    });
  });
});
