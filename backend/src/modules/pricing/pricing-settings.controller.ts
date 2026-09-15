import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { UpdateProductPricingSettingDto } from './dto/update-product-pricing-setting.dto';
import { UpdateAyarliPervazPricingSettingDto } from './dto/update-ayarli-pervaz-pricing-setting.dto';
import { UpdateSupurgelikPricingSettingDto } from './dto/update-supurgelik-pricing-setting.dto';
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

  /** GET /pricing-settings/pervaz/AYARLI_PERVAZ|DEKORATIF_PERVAZ */
  @Get('pervaz/:productCode')
  getPervazProduct(@Param('productCode') productCode: string) {
    return this.pricingSettingsService.getPervazProductSetting(productCode);
  }

  /**
   * Eski aktif kaydı kapatır; profitRate ve varsa cardFixedSurchargeAmount yazılır.
   * PATCH /pricing-settings/pervaz/:productCode
   */
  @Patch('pervaz/:productCode')
  replacePervazProduct(
    @Param('productCode') productCode: string,
    @Body() dto: UpdateAyarliPervazPricingSettingDto,
  ) {
    return this.pricingSettingsService.replacePervazProductSetting(
      productCode,
      dto,
    );
  }

  /** GET /pricing-settings/supurgelik */
  @Get('supurgelik')
  getSupurgelikGroup() {
    return this.pricingSettingsService.getSupurgelikGroupSetting();
  }

  /** Aktif sürümü kapatır, yalnız normal baz profitRate için yeni sürüm açar. */
  @Patch('supurgelik')
  replaceSupurgelikGroup(@Body() dto: UpdateSupurgelikPricingSettingDto) {
    return this.pricingSettingsService.replaceSupurgelikGroupSetting(dto);
  }
}
