import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';
import { CitaRawMaterialPriceMissingException } from './cita-mdf.errors';
import type { CitaMdfResult } from '../../calculation-engine/calculators/cita-mdf-calculator';
import { CITA_EXTRA_COST_MISSING } from '../../calculation-engine/calculators/cita-production-calculator';
import { CitaProductionService } from './cita-production.service';

function mdfResult(): CitaMdfResult {
  return {
    productCode: 'CITA',
    thicknessMm: '14',
    widthMm: '35',
    lengthMm: '2800',
    rawMaterial: {
      code: 'MDF-14-2100X2800-ZIMPARALI',
      thicknessMm: '14',
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
    },
    cut: {
      bladeAllowanceMm: 4,
      countSideMm: 2100,
      effectiveCutPitchMm: '39',
    },
    productionYield: { netQty: 53, source: 'CALCULATED_CUT_RULE' },
    sheetPrice: { priceType: 'CARD_INSTALLMENT', amount: '2625' },
    mdfUnitCost: toDecimal('2625').div('53').toFixed(),
  };
}

function extraList(
  cutting: string | null,
  labor: string | null,
) {
  return {
    productGroupCode: 'CITA',
    productGroupName: 'Çıta',
    asOf: '2026-09-16T12:00:00.000Z',
    items: [
      {
        typeId: 't-cut',
        typeCode: 'CUTTING',
        typeName: 'Kesim',
        valueId: cutting ? 'v-cut' : null,
        amount: cutting,
        effectiveFrom: cutting ? '2026-09-16T00:00:00.000Z' : null,
        effectiveTo: null,
      },
      {
        typeId: 't-labor',
        typeCode: 'LABOR',
        typeName: 'İşçilik',
        valueId: labor ? 'v-labor' : null,
        amount: labor,
        effectiveFrom: labor ? '2026-09-16T00:00:00.000Z' : null,
        effectiveTo: null,
      },
    ],
    totalAmount: cutting && labor ? toDecimal(cutting).plus(labor).toFixed() : '0',
  };
}

describe('CitaProductionService', () => {
  const query = { thicknessMm: '14', widthMm: '35', lengthMm: '2800' };
  const now = new Date('2026-09-16T12:00:00.000Z');

  it('MDF calculator sonucunu reuse eder ve CUTTING+LABOR ekler', async () => {
    const mdf = mdfResult();
    const citaMdfService = {
      getMdfCost: jest.fn().mockResolvedValue(mdf),
    };
    const extraCostsService = {
      listForProductGroup: jest.fn().mockResolvedValue(extraList('5', '10')),
    };
    const service = new CitaProductionService(
      citaMdfService as never,
      extraCostsService as never,
    );

    const result = await service.getProductionCost(query, now);

    expect(citaMdfService.getMdfCost).toHaveBeenCalledWith(query, now);
    expect(extraCostsService.listForProductGroup).toHaveBeenCalledWith('CITA', now);
    expect(result.productionYield.netQty).toBe(53);
    expect(result.productionCost).toBe(toDecimal(mdf.mdfUnitCost).plus(15).toFixed());
    expect(result.statusCode).toBeNull();
  });

  it('ExtraCost yoksa EXTRA_COST_MISSING döner; 0 uydurmaz', async () => {
    const mdf = mdfResult();
    const extraCostsService = {
      listForProductGroup: jest.fn().mockResolvedValue(extraList(null, null)),
    };
    const service = new CitaProductionService(
      { getMdfCost: jest.fn().mockResolvedValue(mdf) } as never,
      extraCostsService as never,
    );

    const result = await service.getProductionCost(query, now);
    expect(result.mdfUnitCost).toBe(mdf.mdfUnitCost);
    expect(result.productionCost).toBeNull();
    expect(result.statusCode).toBe(CITA_EXTRA_COST_MISSING);
    expect(result.missingExtraCosts).toEqual(['CUTTING', 'LABOR']);
  });

  it('quoted custom 35 mm ExtraCost yokken 145/174 yayın fiyatı döner', async () => {
    const mdf = mdfResult();
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({ id: 'g-cita', isActive: true }),
      },
      citaPublishedPriceBand: {
        findMany: jest.fn().mockResolvedValue([
          {
            minWidthMm: 30,
            maxWidthMm: 40,
            cashPrice: { toString: () => '145' },
            cardPrice: { toString: () => '174' },
            isActive: true,
            effectiveTo: null,
            thicknesses: [{ thicknessMm: 12 }, { thicknessMm: 14 }, { thicknessMm: 16 }],
          },
        ]),
      },
    };
    const service = new CitaProductionService(
      { getMdfCost: jest.fn().mockResolvedValue(mdf) } as never,
      { listForProductGroup: jest.fn().mockResolvedValue(extraList(null, null)) } as never,
      prisma as never,
    );

    const result = await service.getQuotedProductionCost(query, now);
    expect(result.productionCost).toBeNull();
    expect(result.statusCode).toBe(CITA_EXTRA_COST_MISSING);
    expect(result.pricing).toMatchObject({
      pricingAvailable: true,
      publishedCashPrice: '145',
      publishedCardPrice: '174',
      priceBand: { minWidthMm: 30, maxWidthMm: 40, displayName: '3–4 cm' },
    });
    expect(prisma.citaPublishedPriceBand.findMany).toHaveBeenCalled();
  });

  it('MDF fiyatı yoksa ExtraCost listesini çağırmaz', async () => {
    const extraCostsService = {
      listForProductGroup: jest.fn(),
    };
    const service = new CitaProductionService(
      {
        getMdfCost: jest
          .fn()
          .mockRejectedValue(
            new CitaRawMaterialPriceMissingException(
              'MDF-14-2100X2800-ZIMPARALI',
            ),
          ),
      } as never,
      extraCostsService as never,
    );

    await expect(service.getProductionCost(query, now)).rejects.toBeInstanceOf(
      CitaRawMaterialPriceMissingException,
    );
    expect(extraCostsService.listForProductGroup).not.toHaveBeenCalled();
  });

  it('NET validation hatasını ExtraCost öncesinde iletir', async () => {
    const extraCostsService = { listForProductGroup: jest.fn() };
    const service = new CitaProductionService(
      {
        getMdfCost: jest
          .fn()
          .mockRejectedValue(new BadRequestException('widthMm > 0 olmalıdır.')),
      } as never,
      extraCostsService as never,
    );

    await expect(
      service.getProductionCost(
        { thicknessMm: '14', widthMm: '0', lengthMm: '2800' },
        now,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(extraCostsService.listForProductGroup).not.toHaveBeenCalled();
  });
});
