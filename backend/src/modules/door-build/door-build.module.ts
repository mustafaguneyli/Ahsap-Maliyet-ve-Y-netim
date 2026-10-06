import { Module } from '@nestjs/common';
import { CostCalculationModule } from '../cost-calculation/cost-calculation.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { DoorBuildController } from './door-build.controller';
import { DoorBuildService } from './door-build.service';

@Module({
  imports: [PrismaModule, CostCalculationModule],
  controllers: [DoorBuildController],
  providers: [DoorBuildService],
  exports: [DoorBuildService],
})
export class DoorBuildModule {}
