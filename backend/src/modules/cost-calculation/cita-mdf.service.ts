import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MaterialPriceType } from '@prisma/client';
import {
  calculateCitaMdfCost,
  isCitaMaterialPriceType,
  type CitaMaterialPriceType,
} from '../../calculation-engine/calculators/cita-mdf-calculator';
import { CitaNetService } from './cita-net.service';
import { CitaRawMaterialPriceMissingException } from './cita-mdf.errors';
import { selectCurrentMaterialPrice } from './current-material-price';
import type { CitaNetQueryDto } from './dto/cita-net-query.dto';
import { PrismaService } from '../../prisma/prisma.service';

/** Parametre yoksa mevcut kart alış davranışı korunur. Diğer türe düşülmez. */
export function resolveCitaMaterialPriceType(
  value?: string | null,
): CitaMaterialPriceType {
  if (value == null || value.trim() === '') {
    return 'CARD_INSTALLMENT';
  }
  const normalized = value.trim();
  if (!isCitaMaterialPriceType(normalized)) {
    throw new BadRequestException(
      'materialPriceType CASH veya CARD_INSTALLMENT olmalıdır.',
    );
  }
  return normalized;
}

@Injectable()
export class CitaMdfService {
  constructor(
    private readonly citaNetService: CitaNetService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * NET resolver'ı reuse eder; seçilen aktif alış fiyatını / netQty ekler.
   * materialPriceType yoksa CARD_INSTALLMENT. Diğer türe düşülmez.
   * Custom ölçü ve fiyat değişimi DB master'ına yazılmaz.
   */
  async getMdfCost(query: CitaNetQueryDto, now: Date = new Date()) {
    const materialPriceType = resolveCitaMaterialPriceType(query.materialPriceType);
    const net = await this.citaNetService.resolveNet(query);

    const material = await this.prisma.rawMaterial.findUnique({
      where: { code: net.rawMaterial.code },
      include: {
        prices: {
          where: {
            priceType: materialPriceType as MaterialPriceType,
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
      materialPriceType as MaterialPriceType,
      now,
    );
    if (!currentPrice) {
      throw new CitaRawMaterialPriceMissingException(
        material.code,
        materialPriceType,
      );
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
        priceType: materialPriceType,
        amount: currentPrice.price.toString(),
      },
    });
  }
}
