import { Injectable, Optional } from '@nestjs/common';
import { calculateCitaProductionCost } from '../../calculation-engine/calculators/cita-production-calculator';
import { ExtraCostsService } from '../extra-costs/extra-costs.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CitaMdfService } from './cita-mdf.service';
import {
  attachCitaClassifiedPricing,
  loadCitaPublishedPriceBandViews,
} from './cita-list-pricing';
import type { CitaNetQueryDto } from './dto/cita-net-query.dto';

@Injectable()
export class CitaProductionService {
  constructor(
    private readonly citaMdfService: CitaMdfService,
    private readonly extraCostsService: ExtraCostsService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /**
   * MDF calculator'ı reuse eder; CITA group-scope CUTTING+LABOR ekler.
   * ExtraCost yoksa mdfUnitCost döner, productionCost null kalır.
   */
  async getProductionCost(query: CitaNetQueryDto, now: Date = new Date()) {
    const mdf = await this.citaMdfService.getMdfCost(query, now);
    const extras = await this.extraCostsService.listForProductGroup('CITA', now);

    return calculateCitaProductionCost({
      mdf,
      extraCosts: extras.items.map((item) => ({
        code: item.typeCode,
        amount: item.amount,
      })),
    });
  }

  /**
   * Tek ölçü endpoint: maliyet + yayınlanmış satış fiyatı.
   * Custom width ticari banda sınıflandırılır; DB master yazılmaz.
   */
  async getQuotedProductionCost(query: CitaNetQueryDto, now: Date = new Date()) {
    const cost = await this.getProductionCost(query, now);
    if (this.prisma == null) {
      throw new Error('CITA published pricing için PrismaService gerekir.');
    }
    const bands = await loadCitaPublishedPriceBandViews(this.prisma, now);
    return attachCitaClassifiedPricing(cost, bands);
  }
}
