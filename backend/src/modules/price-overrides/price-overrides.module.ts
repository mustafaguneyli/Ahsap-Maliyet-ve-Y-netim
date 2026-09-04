import { Module } from '@nestjs/common';
import { PriceOverridesController } from './price-overrides.controller';
import { PriceOverridesService } from './price-overrides.service';

@Module({
  controllers: [PriceOverridesController],
  providers: [PriceOverridesService],
  exports: [PriceOverridesService],
})
export class PriceOverridesModule {}
