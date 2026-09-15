import { Module } from '@nestjs/common';
import { PricingSettingsController } from './pricing-settings.controller';
import { PricingSettingsService } from './pricing-settings.service';
import { PricingThicknessModifiersController } from './pricing-thickness-modifiers.controller';
import { PricingThicknessModifiersService } from './pricing-thickness-modifiers.service';

@Module({
  controllers: [
    PricingSettingsController,
    PricingThicknessModifiersController,
  ],
  providers: [PricingSettingsService, PricingThicknessModifiersService],
  exports: [PricingSettingsService, PricingThicknessModifiersService],
})
export class PricingModule {}
