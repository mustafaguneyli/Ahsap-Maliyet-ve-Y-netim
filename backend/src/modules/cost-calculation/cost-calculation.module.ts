import { Module } from '@nestjs/common';
import { ExtraCostsModule } from '../extra-costs/extra-costs.module';
import { PervazModule } from '../pervaz/pervaz.module';
import { CitaListService } from './cita-list.service';
import { CitaMdfService } from './cita-mdf.service';
import { CitaNetService } from './cita-net.service';
import { CitaProductionService } from './cita-production.service';
import { CostCalculationController } from './cost-calculation.controller';
import { CostCalculationService } from './cost-calculation.service';
import { OrderQuoteService } from './order-quote.service';

@Module({
  imports: [ExtraCostsModule, PervazModule],
  controllers: [CostCalculationController],
  providers: [
    CostCalculationService,
    CitaNetService,
    CitaMdfService,
    CitaProductionService,
    CitaListService,
    OrderQuoteService,
  ],
  exports: [CostCalculationService],
})
export class CostCalculationModule {}
