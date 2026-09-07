import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { DoorFrameVariantCode } from '../../calculation-engine/calculators/door-frame-variants';
import { CostCalculationService } from './cost-calculation.service';
import { AyarliPervazMdfQueryDto } from './dto/ayarli-pervaz-mdf-query.dto';

@Controller('cost-calculation')
export class CostCalculationController {
  constructor(private readonly costCalculationService: CostCalculationService) {}

  /**
   * Kapı kasası — MDF + ek maliyet + KDV + kâr + ROUNDUP + isteğe bağlı nakit override.
   * GET /cost-calculation/door-frame/mdf?variant=34_MM|30_MM
   */
  @Get('door-frame/mdf')
  getDoorFrameMdf(@Query('variant') variant?: string) {
    if (variant !== '34_MM' && variant !== '30_MM') {
      throw new BadRequestException('variant query parametresi 34_MM veya 30_MM olmalıdır.');
    }
    return this.costCalculationService.getDoorFrameMdfCosts(variant as DoorFrameVariantCode);
  }

  /**
   * Ayarlı Pervaz — MDF + ek maliyet + kâr + ROUNDUP + satır adjustment (KDV / kart yok).
   * GET /cost-calculation/pervaz/mdf?productCode=AYARLI_PERVAZ&thicknessMm=&widthMm=&lengthMm=
   */
  @Get('pervaz/mdf')
  getAyarliPervazMdf(@Query() query: AyarliPervazMdfQueryDto) {
    return this.costCalculationService.getAyarliPervazMdfCost(query);
  }
}
