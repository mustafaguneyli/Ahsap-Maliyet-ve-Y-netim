import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ListPricingThicknessModifiersQueryDto } from './dto/list-pricing-thickness-modifiers-query.dto';
import { UpdateSupurgelikDecorativeRateDto } from './dto/update-supurgelik-decorative-rate.dto';
import { PricingThicknessModifiersService } from './pricing-thickness-modifiers.service';

@Controller('pricing-thickness-modifiers')
export class PricingThicknessModifiersController {
  constructor(
    private readonly pricingThicknessModifiersService: PricingThicknessModifiersService,
  ) {}

  /** GET /pricing-thickness-modifiers?productGroup=SUPURGELIK */
  @Get()
  list(@Query() query: ListPricingThicknessModifiersQueryDto) {
    return this.pricingThicknessModifiersService.listSupurgelikDecorativeRates(
      query.productGroup,
    );
  }

  /**
   * Eski aktif kaydı kapatır; yalnız 12/14/18 mm için yeni dekoratif oran sürümü açar.
   * PATCH /pricing-thickness-modifiers
   */
  @Patch()
  replace(@Body() dto: UpdateSupurgelikDecorativeRateDto) {
    return this.pricingThicknessModifiersService.replaceSupurgelikDecorativeRate(
      dto,
    );
  }
}
