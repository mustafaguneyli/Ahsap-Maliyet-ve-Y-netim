import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CalculateProductionYieldDto } from './dto/calculate-production-yield.dto';
import { CreateProductionYieldDto } from './dto/create-production-yield.dto';
import { ListProductionYieldsQueryDto } from './dto/list-production-yields-query.dto';
import { ReplaceProductionYieldDto } from './dto/replace-production-yield.dto';
import { ProductionYieldsService } from './production-yields.service';

@Controller('production-yields')
export class ProductionYieldsController {
  constructor(private readonly productionYieldsService: ProductionYieldsService) {}

  @Get()
  findAll(@Query() query: ListProductionYieldsQueryDto) {
    return this.productionYieldsService.findAll(query);
  }

  /** Statik path, :id route'larından önce tanımlanmalı. */
  @Post('calculate')
  calculate(@Body() dto: CalculateProductionYieldDto) {
    return this.productionYieldsService.calculateSuggestedQty(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productionYieldsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProductionYieldDto) {
    return this.productionYieldsService.create(dto);
  }

  /**
   * Versioning: eski kaydı pasife alır, aynı ölçü + yeni netQty ile aktif kayıt oluşturur.
   * Overwrite / PATCH yapılmaz.
   */
  @Post(':id/replace')
  replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceProductionYieldDto,
  ) {
    return this.productionYieldsService.replace(id, dto);
  }
}
