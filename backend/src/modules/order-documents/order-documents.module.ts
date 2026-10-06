import { Module } from '@nestjs/common';
import { CostCalculationModule } from '../cost-calculation/cost-calculation.module';
import { PervazModule } from '../pervaz/pervaz.module';
import { OrderDocumentsController } from './order-documents.controller';
import { OrderDocumentsService } from './order-documents.service';
import { OrderMaterialResolver } from './order-material.resolver';

@Module({
  imports: [CostCalculationModule, PervazModule],
  controllers: [OrderDocumentsController],
  providers: [OrderDocumentsService, OrderMaterialResolver],
})
export class OrderDocumentsModule {}
