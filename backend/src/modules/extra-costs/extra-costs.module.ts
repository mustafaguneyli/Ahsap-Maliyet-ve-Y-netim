import { Module } from '@nestjs/common';
import { ExtraCostsController } from './extra-costs.controller';
import { ExtraCostsService } from './extra-costs.service';

@Module({
  controllers: [ExtraCostsController],
  providers: [ExtraCostsService],
  exports: [ExtraCostsService],
})
export class ExtraCostsModule {}
