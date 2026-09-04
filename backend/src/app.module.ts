import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './modules/audit/audit.module';
import { ExtraCostsModule } from './modules/extra-costs/extra-costs.module';
import { HealthModule } from './modules/health/health.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { ProductsModule } from './modules/products/products.module';
import { ProductionYieldsModule } from './modules/production-yields/production-yields.module';
import { RecipesModule } from './modules/recipes/recipes.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    HealthModule,
    MaterialsModule,
    ProductsModule,
    RecipesModule,
    ProductionYieldsModule,
    ExtraCostsModule,
    PricingModule,
    AuditModule,
  ],
})
export class AppModule {}
