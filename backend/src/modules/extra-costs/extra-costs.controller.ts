import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ListExtraCostsQueryDto } from './dto/list-extra-costs-query.dto';
import { UpdateExtraCostValueDto } from './dto/update-extra-cost-value.dto';
import { ExtraCostsService } from './extra-costs.service';

@Controller('extra-costs')
export class ExtraCostsController {
  constructor(private readonly extraCostsService: ExtraCostsService) {}

  @Get()
  list(@Query() query: ListExtraCostsQueryDto) {
    return this.extraCostsService.listForProductGroup(query.productGroup);
  }

  /**
   * Mevcut açık dönemi kapatır; yeni ExtraCostValue oluşturur (overwrite yok).
   * Örn: PATCH /extra-costs/CUTTING  { productGroup, amount, effectiveFrom }
   */
  @Patch(':typeCode')
  updateValue(
    @Param('typeCode') typeCode: string,
    @Body() dto: UpdateExtraCostValueDto,
  ) {
    return this.extraCostsService.updateValue(typeCode, dto);
  }
}
