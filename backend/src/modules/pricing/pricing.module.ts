import { Module } from '@nestjs/common';
import { CitaPublishedPriceBandsController } from './cita-published-price-bands.controller';
import { CitaPublishedPriceBandsService } from './cita-published-price-bands.service';
import { DekoratifPervazPremiumsController } from './dekoratif-pervaz-premiums.controller';
import { DekoratifPervazPremiumsService } from './dekoratif-pervaz-premiums.service';
import { PricingSettingsController } from './pricing-settings.controller';
import { PricingSettingsService } from './pricing-settings.service';
import { ProductPricingOverrideService } from './product-pricing-override.service';
import { PricingThicknessModifiersController } from './pricing-thickness-modifiers.controller';
import { PricingThicknessModifiersService } from './pricing-thickness-modifiers.service';

@Module({
  controllers: [
    PricingSettingsController,
    PricingThicknessModifiersController,
    DekoratifPervazPremiumsController,
    CitaPublishedPriceBandsController,
  ],
  providers: [
    PricingSettingsService,
    ProductPricingOverrideService,
    PricingThicknessModifiersService,
    DekoratifPervazPremiumsService,
    CitaPublishedPriceBandsService,
  ],
  exports: [
    PricingSettingsService,
    ProductPricingOverrideService,
    PricingThicknessModifiersService,
    DekoratifPervazPremiumsService,
    CitaPublishedPriceBandsService,
  ],
})
export class PricingModule {}
