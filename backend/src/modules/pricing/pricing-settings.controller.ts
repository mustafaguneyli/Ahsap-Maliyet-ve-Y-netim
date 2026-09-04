import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { UpdateProductPricingSettingDto } from './dto/update-product-pricing-setting.dto';
import { PricingSettingsService } from './pricing-settings.service';

@Controller('pricing-settings')
export class PricingSettingsController {
  constructor(private readonly pricingSettingsService: PricingSettingsService) {}

  /** GET /pricing-settings/door-frame/:productCode  örn. 34_MM */
  @Get('door-frame/:productCode')
  getDoorFrameProduct(@Param('productCode') productCode: string) {
    return this.pricingSettingsService.getDoorFrameProductSetting(productCode);
  }

  /**
   * Eski aktif kaydı kapatır; yeni PricingSetting oluşturur.
   * PATCH /pricing-settings/door-frame/:productCode
   */
  @Patch('door-frame/:productCode')
  replaceDoorFrameProduct(
    @Param('productCode') productCode: string,
    @Body() dto: UpdateProductPricingSettingDto,
  ) {
    return this.pricingSettingsService.replaceDoorFrameProductSetting(productCode, dto);
  }
}
