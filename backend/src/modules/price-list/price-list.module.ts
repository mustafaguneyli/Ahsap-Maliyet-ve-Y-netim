import { Module } from '@nestjs/common';
import { CostCalculationModule } from '../cost-calculation/cost-calculation.module';
import { PriceListController } from './price-list.controller';
import { PriceListService } from './price-list.service';

@Module({
  imports: [CostCalculationModule],
  controllers: [PriceListController],
  providers: [PriceListService],
})
export class PriceListModule {}
