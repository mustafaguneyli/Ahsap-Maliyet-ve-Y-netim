import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { DoorFrameVariantCode } from '../../calculation-engine/calculators/door-frame-variants';
import { CostCalculationService } from './cost-calculation.service';

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
}
