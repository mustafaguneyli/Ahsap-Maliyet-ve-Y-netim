import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { UpdateDekoratifPervazPremiumDto } from './dto/update-dekoratif-pervaz-premium.dto';
import { DekoratifPervazPremiumsService } from './dekoratif-pervaz-premiums.service';

@Controller('pricing-row-exceptions/dekoratif-pervaz')
export class DekoratifPervazPremiumsController {
  constructor(
    private readonly dekoratifPervazPremiumsService: DekoratifPervazPremiumsService,
  ) {}

  /** GET /pricing-row-exceptions/dekoratif-pervaz/:productCode */
  @Get(':productCode')
  list(@Param('productCode') productCode: string) {
    return this.dekoratifPervazPremiumsService.listPremiums(productCode);
  }

  /** PATCH /pricing-row-exceptions/dekoratif-pervaz/:productCode */
  @Patch(':productCode')
  replace(
    @Param('productCode') productCode: string,
    @Body() dto: UpdateDekoratifPervazPremiumDto,
  ) {
    return this.dekoratifPervazPremiumsService.replacePremium({
      productCode,
      ...dto,
    });
  }
}
