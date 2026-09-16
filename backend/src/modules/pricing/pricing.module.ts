import { Module } from '@nestjs/common';
import { CitaPublishedPriceBandsController } from './cita-published-price-bands.controller';
import { CitaPublishedPriceBandsService } from './cita-published-price-bands.service';
import { PricingSettingsController } from './pricing-settings.controller';
import { PricingSettingsService } from './pricing-settings.service';
import { PricingThicknessModifiersController } from './pricing-thickness-modifiers.controller';
import { PricingThicknessModifiersService } from './pricing-thickness-modifiers.service';

@Module({
  controllers: [
    PricingSettingsController,
    PricingThicknessModifiersController,
    CitaPublishedPriceBandsController,
  ],
  providers: [
    PricingSettingsService,
    PricingThicknessModifiersService,
    CitaPublishedPriceBandsService,
  ],
  exports: [
    PricingSettingsService,
    PricingThicknessModifiersService,
    CitaPublishedPriceBandsService,
  ],
})
export class PricingModule {}
