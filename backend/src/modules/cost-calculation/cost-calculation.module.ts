import { Module } from '@nestjs/common';
import { ExtraCostsModule } from '../extra-costs/extra-costs.module';
import { PervazModule } from '../pervaz/pervaz.module';
import { CatalogItemsService } from './catalog-items.service';
import { CitaListService } from './cita-list.service';
import { CitaMdfService } from './cita-mdf.service';
import { CitaNetService } from './cita-net.service';
import { CitaProductionService } from './cita-production.service';
import { CostCalculationController } from './cost-calculation.controller';
import { CostCalculationService } from './cost-calculation.service';
import { GenericRecipeService } from './generic-recipe.service';
import { OrderQuoteService } from './order-quote.service';

@Module({
  imports: [ExtraCostsModule, PervazModule],
  controllers: [CostCalculationController],
  providers: [
    CostCalculationService,
    CatalogItemsService,
    GenericRecipeService,
    CitaNetService,
    CitaMdfService,
    CitaProductionService,
    CitaListService,
    OrderQuoteService,
  ],
  exports: [
    CostCalculationService,
    CitaNetService,
    CitaListService,
    GenericRecipeService,
  ],
})
export class CostCalculationModule {}
