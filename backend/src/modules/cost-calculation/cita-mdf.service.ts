import { Injectable, NotFoundException } from '@nestjs/common';
import { MaterialPriceType } from '@prisma/client';
import { calculateCitaMdfCost } from '../../calculation-engine/calculators/cita-mdf-calculator';
import { CitaNetService } from './cita-net.service';
import { CitaRawMaterialPriceMissingException } from './cita-mdf.errors';
import { selectCurrentMaterialPrice } from './current-material-price';
import type { CitaNetQueryDto } from './dto/cita-net-query.dto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CitaMdfService {
  constructor(
    private readonly citaNetService: CitaNetService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * NET resolver'ı reuse eder; üzerine yalnız aktif CARD_INSTALLMENT / netQty ekler.
   * Custom ölçü ve fiyat değişimi DB master'ına yazılmaz.
   */
  async getMdfCost(query: CitaNetQueryDto, now: Date = new Date()) {
    const net = await this.citaNetService.resolveNet(query);

    const material = await this.prisma.rawMaterial.findUnique({
      where: { code: net.rawMaterial.code },
      include: {
        prices: {
          where: {
            priceType: MaterialPriceType.CARD_INSTALLMENT,
            isActive: true,
          },
          orderBy: { effectiveFrom: 'desc' },
        },
      },
    });
    if (!material?.isActive) {
      throw new NotFoundException(
        `Aktif ham madde bulunamadı: ${net.rawMaterial.code}`,
      );
    }

    const currentPrice = selectCurrentMaterialPrice(
      material.prices,
      MaterialPriceType.CARD_INSTALLMENT,
      now,
    );
    if (!currentPrice) {
      throw new CitaRawMaterialPriceMissingException(material.code);
    }

    return calculateCitaMdfCost({
      productCode: net.productCode,
      thicknessMm: net.thicknessMm,
      widthMm: net.widthMm,
      lengthMm: net.lengthMm,
      rawMaterial: {
        code: material.code,
        thicknessMm: material.thicknessMm.toString(),
        sheetWidthMm: material.sheetWidthMm,
        sheetLengthMm: material.sheetLengthMm,
      },
      cut: {
        bladeAllowanceMm: net.bladeAllowanceMm,
        countSideMm: net.countSideMm,
        effectiveCutPitchMm: net.effectiveCutPitchMm,
      },
      productionYield: {
        netQty: net.netQty,
        source: net.source,
      },
      sheetPrice: {
        priceType: 'CARD_INSTALLMENT',
        amount: currentPrice.price.toString(),
      },
    });
  }
}
