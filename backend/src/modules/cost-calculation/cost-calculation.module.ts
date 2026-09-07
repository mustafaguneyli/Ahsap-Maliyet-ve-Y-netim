import { Module } from '@nestjs/common';
import { ExtraCostsModule } from '../extra-costs/extra-costs.module';
import { PervazModule } from '../pervaz/pervaz.module';
import { CostCalculationController } from './cost-calculation.controller';
import { CostCalculationService } from './cost-calculation.service';

@Module({
  imports: [ExtraCostsModule, PervazModule],
  controllers: [CostCalculationController],
  providers: [CostCalculationService],
  exports: [CostCalculationService],
})
export class CostCalculationModule {}
