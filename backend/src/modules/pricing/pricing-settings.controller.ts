import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UpdateProductPricingSettingDto } from './dto/update-product-pricing-setting.dto';
import { UpdateAyarliPervazPricingSettingDto } from './dto/update-ayarli-pervaz-pricing-setting.dto';
import { UpdateGroupCardMarkupRateDto } from './dto/update-group-card-markup-rate.dto';
import { UpdateCitaPricingSettingDto } from './dto/update-cita-pricing-setting.dto';
import { UpdateSupurgelikPricingSettingDto } from './dto/update-supurgelik-pricing-setting.dto';
import { UpdateDoorBuildPricingSettingDto } from './dto/update-door-build-pricing-setting.dto';
import { PricingSettingsService } from './pricing-settings.service';
import { ProductPricingOverrideService } from './product-pricing-override.service';
import { UpsertSizeProfitRateDto } from './dto/upsert-size-profit-rate.dto';

@Controller('pricing-settings')
export class PricingSettingsController {
  constructor(
    private readonly pricingSettingsService: PricingSettingsService,
    private readonly productPricingOverrideService: ProductPricingOverrideService,
  ) {}

  /** Aktif grupların group-scope kart/taksit oranı. */
  @Get('group-card-markup-rates')
  listGroupCardMarkupRates() {
    return this.pricingSettingsService.listGroupCardMarkupRates();
  }

  /** Group-scope kart oranını versionlar. Kâr ve KDV bu istekte değişmez. */
  @Patch('group-card-markup-rates')
  replaceGroupCardMarkupRate(@Body() dto: UpdateGroupCardMarkupRateDto) {
    return this.pricingSettingsService.replaceGroupCardMarkupRate(dto);
  }

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
   * Product-level profitRate; group-scope cardMarkupRate.
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

  /** Aktif sürümü kapatır, group-scope profitRate ve cardMarkupRate. */
  @Patch('supurgelik')
  replaceSupurgelikGroup(@Body() dto: UpdateSupurgelikPricingSettingDto) {
    return this.pricingSettingsService.replaceSupurgelikGroupSetting(dto);
  }

  /** GET /pricing-settings/cita — group-scope cardMarkupRate; yoksa null. */
  @Get('cita')
  getCitaGroup() {
    return this.pricingSettingsService.getCitaGroupSetting();
  }

  /** PATCH /pricing-settings/cita — group-scope kart oranı version/audit. */
  replaceCitaGroup(@Body() dto: UpdateCitaPricingSettingDto) {
    return this.pricingSettingsService.replaceCitaGroupSetting(dto);
  }

  /** GET /pricing-settings/door-build — Kapı İmalatı kâr/KDV/kart; yoksa null. */
  @Get('door-build')
  getDoorBuildGroup() {
    return this.pricingSettingsService.getDoorBuildGroupSetting();
  }

  /** PATCH /pricing-settings/door-build — group-scope oran version/audit. */
  @Patch('door-build')
  replaceDoorBuildGroup(@Body() dto: UpdateDoorBuildPricingSettingDto) {
    return this.pricingSettingsService.replaceDoorBuildGroupSetting(dto);
  }

  /**
   * Ölçü bazlı kâr oranı. profitRate=null ölçü override’ını kapatır.
   * POST /pricing-settings/profit-rate
   */
  @Post('profit-rate')
  upsertSizeProfitRate(@Body() dto: UpsertSizeProfitRateDto) {
    return this.productPricingOverrideService.upsertSizeProfitRate(dto);
  }
}
