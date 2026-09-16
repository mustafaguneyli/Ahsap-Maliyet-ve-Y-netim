import { BadRequestException } from '@nestjs/common';
import { MaterialPriceType } from '@prisma/client';
import { toDecimal } from '../../common/decimal/decimal.util';
import { CitaRawMaterialPriceMissingException } from './cita-mdf.errors';
import { CitaMdfService } from './cita-mdf.service';
import type { CitaNetResult } from './cita-net.service';

function netResult(
  overrides: Partial<CitaNetResult> = {},
): CitaNetResult {
  return {
    productCode: 'CITA',
    thicknessMm: '14',
    widthMm: '40',
    lengthMm: '2800',
    rawMaterial: {
      code: 'MDF-14-2100X2800-ZIMPARALI',
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
    },
    bladeAllowanceMm: 4,
    countSideMm: 2100,
    effectiveCutPitchMm: '44',
    netQty: 47,
    source: 'MASTER',
    ...overrides,
  };
}

function materialWithPrice(code: string, amount: string, thicknessMm = '14') {
  return {
    id: `id-${code}`,
    code,
    isActive: true,
    thicknessMm: { toString: () => thicknessMm },
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    prices: [
      {
        id: 'price-1',
        priceType: MaterialPriceType.CARD_INSTALLMENT,
        price: { toString: () => amount },
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        effectiveTo: null,
        isActive: true,
      },
    ],
  };
}

function buildService(options?: {
  net?: CitaNetResult | Error;
  material?: ReturnType<typeof materialWithPrice> | null;
}) {
  const citaNetService = {
    resolveNet: jest.fn().mockImplementation(() => {
      if (options?.net instanceof Error) {
        return Promise.reject(options.net);
      }
      return Promise.resolve(options?.net ?? netResult());
    }),
  };
  const prisma = {
    rawMaterial: {
      findUnique: jest.fn().mockResolvedValue(
        options?.material === undefined
          ? materialWithPrice('MDF-14-2100X2800-ZIMPARALI', '2625')
          : options.material,
      ),
    },
    productionYield: { create: jest.fn() },
    productSize: { create: jest.fn() },
    recipe: { create: jest.fn() },
    rawMaterialPrice: { create: jest.fn() },
  };
  const service = new CitaMdfService(citaNetService as never, prisma as never);
  return { service, citaNetService, prisma };
}

describe('CitaMdfService', () => {
  const now = new Date('2026-09-16T12:00:00.000Z');

  it('NET resolver MASTER sonucunu reuse eder ve sheetPrice / netQty hesaplar', async () => {
    const { service, citaNetService, prisma } = buildService();
    const result = await service.getMdfCost(
      { thicknessMm: '14', widthMm: '40', lengthMm: '2800' },
      now,
    );

    expect(citaNetService.resolveNet).toHaveBeenCalledWith({
      thicknessMm: '14',
      widthMm: '40',
      lengthMm: '2800',
    });
    expect(result.productionYield).toEqual({ netQty: 47, source: 'MASTER' });
    expect(result.sheetPrice).toEqual({
      priceType: 'CARD_INSTALLMENT',
      amount: '2625',
    });
    expect(result.mdfUnitCost).toBe(toDecimal('2625').div('47').toFixed());
    expect(result).not.toHaveProperty('extraCosts');
    expect(result).not.toHaveProperty('productionCost');
    expect(prisma.productionYield.create).not.toHaveBeenCalled();
    expect(prisma.productSize.create).not.toHaveBeenCalled();
    expect(prisma.rawMaterialPrice.create).not.toHaveBeenCalled();
  });

  it('custom NET ile aynı CARD fiyatını kullanır', async () => {
    const { service } = buildService({
      net: netResult({
        widthMm: '35',
        effectiveCutPitchMm: '39',
        netQty: 53,
        source: 'CALCULATED_CUT_RULE',
      }),
    });

    const result = await service.getMdfCost(
      { thicknessMm: '14', widthMm: '35', lengthMm: '2800' },
      now,
    );
    expect(result.productionYield.source).toBe('CALCULATED_CUT_RULE');
    expect(result.productionYield.netQty).toBe(53);
    expect(result.mdfUnitCost).toBe(toDecimal('2625').div('53').toFixed());
  });

  it('18 mm yalnız ZIMPARALI fiyatını çözer', async () => {
    const { service, prisma } = buildService({
      net: netResult({
        thicknessMm: '18',
        widthMm: '47',
        effectiveCutPitchMm: '51',
        netQty: 41,
        source: 'CALCULATED_CUT_RULE',
        rawMaterial: {
          code: 'MDF-18-2100X2800-ZIMPARALI',
          sheetWidthMm: 2100,
          sheetLengthMm: 2800,
        },
      }),
      material: materialWithPrice(
        'MDF-18-2100X2800-ZIMPARALI',
        '2800',
        '18',
      ),
    });

    const result = await service.getMdfCost(
      { thicknessMm: '18', widthMm: '47', lengthMm: '2800' },
      now,
    );
    expect(prisma.rawMaterial.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: 'MDF-18-2100X2800-ZIMPARALI' },
      }),
    );
    expect(result.rawMaterial.code).toBe('MDF-18-2100X2800-ZIMPARALI');
    expect(result.mdfUnitCost).toBe(toDecimal('2800').div('41').toFixed());
  });

  it('aktif CARD fiyatı yoksa RAW_MATERIAL_PRICE_MISSING üretir, 0 kullanmaz', async () => {
    const material = materialWithPrice('MDF-14-2100X2800-ZIMPARALI', '2625');
    material.prices = [];
    const { service } = buildService({ material });

    await expect(
      service.getMdfCost(
        { thicknessMm: '14', widthMm: '40', lengthMm: '2800' },
        now,
      ),
    ).rejects.toBeInstanceOf(CitaRawMaterialPriceMissingException);

    try {
      await service.getMdfCost(
        { thicknessMm: '14', widthMm: '40', lengthMm: '2800' },
        now,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(CitaRawMaterialPriceMissingException);
      expect((error as CitaRawMaterialPriceMissingException).errorCode).toBe(
        'RAW_MATERIAL_PRICE_MISSING',
      );
    }
  });

  it('NET validation hatalarını aynen iletir', async () => {
    const { service, prisma } = buildService({
      net: new BadRequestException('Çıta bu MDF kalınlığını desteklemiyor'),
    });

    await expect(
      service.getMdfCost(
        { thicknessMm: '9', widthMm: '35', lengthMm: '2800' },
        now,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.rawMaterial.findUnique).not.toHaveBeenCalled();
  });
});
