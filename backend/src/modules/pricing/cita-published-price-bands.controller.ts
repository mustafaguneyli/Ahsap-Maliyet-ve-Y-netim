import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { UpdateCitaPublishedPriceBandDto } from './dto/update-cita-published-price-band.dto';
import { CitaPublishedPriceBandsService } from './cita-published-price-bands.service';

@Controller('cita-published-price-bands')
export class CitaPublishedPriceBandsController {
  constructor(
    private readonly citaPublishedPriceBandsService: CitaPublishedPriceBandsService,
  ) {}

  /** GET /cita-published-price-bands */
  @Get()
  list() {
    return this.citaPublishedPriceBandsService.listActive();
  }

  /**
   * Açık bandı kapatır; aynı width + thickness ile yeni version açar.
   * PATCH /cita-published-price-bands/:id  { cashPrice, cardPrice }
   */
  @Patch(':id')
  updatePrices(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCitaPublishedPriceBandDto,
  ) {
    return this.citaPublishedPriceBandsService.updateActiveBandPrices(id, dto);
  }
}
