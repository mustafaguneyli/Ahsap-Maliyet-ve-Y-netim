import { Module } from '@nestjs/common';
import { PricingSettingsController } from './pricing-settings.controller';
import { PricingSettingsService } from './pricing-settings.service';

@Module({
  controllers: [PricingSettingsController],
  providers: [PricingSettingsService],
  exports: [PricingSettingsService],
})
export class PricingModule {}
