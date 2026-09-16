import { BadRequestException, Injectable } from '@nestjs/common';
import { decimalToString, toDecimal } from '../../common/decimal/decimal.util';
import {
  citaMaterialCodeForThickness,
  CITA_NET_PRODUCT_CODE,
  parseCitaThicknessMm,
} from '../../calculation-engine/calculators/cita-net-calculator';
import type { CitaProductionResult } from '../../calculation-engine/calculators/cita-production-calculator';
import {
  CITA_PRODUCT_GROUP_SEED,
  CITA_PRODUCT_SEED,
} from '../products/cita-product-seed';
import {
  discoverActiveProductMasterRows,
  type ActiveProductMasterRow,
} from '../production-yields/active-product-master-discovery';
import { PrismaService } from '../../prisma/prisma.service';
import {
  attachCitaListPricing,
  loadCitaPublishedPriceBandViews,
  type CitaListPricing,
} from './cita-list-pricing';
import {
  CITA_RAW_MATERIAL_PRICE_MISSING,
  CitaRawMaterialPriceMissingException,
} from './cita-mdf.errors';
import { CitaNetService, type CitaNetResult } from './cita-net.service';
import { CitaProductionService } from './cita-production.service';
import type { CitaNetQueryDto } from './dto/cita-net-query.dto';

export type CitaListPriceMissingRow = {
  productCode: typeof CITA_NET_PRODUCT_CODE;
  thicknessMm: string;
  widthMm: string;
  lengthMm: string;
  rawMaterial: {
    code: string;
    thicknessMm: string;
    sheetWidthMm: number;
    sheetLengthMm: number;
  };
  cut: {
    bladeAllowanceMm: number;
    countSideMm: number;
    effectiveCutPitchMm: string;
  };
  productionYield: {
    netQty: number;
    source: 'MASTER';
  };
  sheetPrice: null;
  mdfUnitCost: null;
  extraCosts: CitaProductionResult['extraCosts'];
  extraCostsTotal: null;
  productionCost: null;
  extraCostsAvailable: false;
  missingExtraCosts: CitaProductionResult['missingExtraCosts'];
  statusCode: typeof CITA_RAW_MATERIAL_PRICE_MISSING;
};

export type CitaListCostRow = CitaProductionResult | CitaListPriceMissingRow;
export type CitaListRow = CitaListCostRow & { pricing: CitaListPricing };

function toCitaQuery(master: ActiveProductMasterRow): CitaNetQueryDto {
  return {
    thicknessMm: decimalToString(toDecimal(master.thicknessMm)),
    widthMm: decimalToString(toDecimal(master.widthMm)),
    lengthMm: decimalToString(toDecimal(master.lengthMm)),
  };
}

function compareCitaMasters(
  left: ActiveProductMasterRow,
  right: ActiveProductMasterRow,
): number {
  const thickness = toDecimal(left.thicknessMm).comparedTo(
    toDecimal(right.thicknessMm),
  );
  if (thickness !== 0) {
    return thickness;
  }
  if (left.widthMm !== right.widthMm) {
    return left.widthMm - right.widthMm;
  }
  return left.lengthMm - right.lengthMm;
}

function assertCitaListMasterMaterial(master: ActiveProductMasterRow) {
  const thicknessMm = parseCitaThicknessMm(master.thicknessMm);
  const expectedCode = citaMaterialCodeForThickness(thicknessMm);
  if (master.materialCode !== expectedCode) {
    throw new BadRequestException(
      `CITA MASTER ham maddesi beklenen ${expectedCode} değil: ${master.materialCode} ` +
        `(${decimalToString(toDecimal(master.thicknessMm))} mm / ${master.widthMm}×${master.lengthMm}).`,
    );
  }
}

function assertMasterSource(
  thicknessMm: string,
  widthMm: string,
  lengthMm: string,
  source: string,
) {
  if (source !== 'MASTER') {
    throw new BadRequestException(
      `CITA liste yalnız MASTER satırı döner; ${thicknessMm} mm / ${widthMm}×${lengthMm} kaynağı ${source}.`,
    );
  }
}

function priceMissingRow(net: CitaNetResult): CitaListPriceMissingRow {
  assertMasterSource(net.thicknessMm, net.widthMm, net.lengthMm, net.source);
  return {
    productCode: net.productCode,
    thicknessMm: net.thicknessMm,
    widthMm: net.widthMm,
    lengthMm: net.lengthMm,
    rawMaterial: {
      code: net.rawMaterial.code,
      thicknessMm: net.thicknessMm,
      sheetWidthMm: net.rawMaterial.sheetWidthMm,
      sheetLengthMm: net.rawMaterial.sheetLengthMm,
    },
    cut: {
      bladeAllowanceMm: net.bladeAllowanceMm,
      countSideMm: net.countSideMm,
      effectiveCutPitchMm: net.effectiveCutPitchMm,
    },
    productionYield: {
      netQty: net.netQty,
      source: 'MASTER',
    },
    sheetPrice: null,
    mdfUnitCost: null,
    extraCosts: [],
    extraCostsTotal: null,
    productionCost: null,
    extraCostsAvailable: false,
    missingExtraCosts: [],
    statusCode: CITA_RAW_MATERIAL_PRICE_MISSING,
  };
}

@Injectable()
export class CitaListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly citaProductionService: CitaProductionService,
    private readonly citaNetService: CitaNetService,
  ) {}

  /**
   * Yalnız aktif CITA product-scoped ProductionYield MASTER kayıtları.
   * Kalınlık/en dizisi hardcode edilmez. Custom ölçü listeye girmez.
   * Satır bazlı ExtraCost / MDF fiyat eksikliği tüm listeyi düşürmez.
   */
  async listProductionCosts(now: Date = new Date()) {
    const { product, rows: masters } = await discoverActiveProductMasterRows(
      this.prisma,
      {
        productGroupCode: CITA_PRODUCT_GROUP_SEED.code,
        productCode: CITA_PRODUCT_SEED.code,
      },
    );

    for (const master of masters) {
      assertCitaListMasterMaterial(master);
    }

    const bands = await loadCitaPublishedPriceBandViews(this.prisma, now);
    const sorted = [...masters].sort(compareCitaMasters);
    const rows: CitaListRow[] = [];
    for (const master of sorted) {
      const costRow = await this.calculateMasterRow(master, now);
      rows.push(attachCitaListPricing(costRow, bands));
    }

    return {
      productCode: product.code,
      productName: product.name,
      asOf: now.toISOString(),
      verifiedMeasureCount: rows.length,
      rows,
    };
  }

  private async calculateMasterRow(
    master: ActiveProductMasterRow,
    now: Date,
  ): Promise<CitaListCostRow> {
    const query = toCitaQuery(master);
    try {
      const result = await this.citaProductionService.getProductionCost(
        query,
        now,
      );
      assertMasterSource(
        result.thicknessMm,
        result.widthMm,
        result.lengthMm,
        result.productionYield.source,
      );
      return result;
    } catch (error) {
      if (error instanceof CitaRawMaterialPriceMissingException) {
        const net = await this.citaNetService.resolveNet(query);
        return priceMissingRow(net);
      }
      throw error;
    }
  }
}
