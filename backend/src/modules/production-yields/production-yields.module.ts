import { Module } from '@nestjs/common';
import { ProductionYieldsController } from './production-yields.controller';
import { ProductionYieldsService } from './production-yields.service';

@Module({
  controllers: [ProductionYieldsController],
  providers: [ProductionYieldsService],
  exports: [ProductionYieldsService],
})
export class ProductionYieldsModule {}
