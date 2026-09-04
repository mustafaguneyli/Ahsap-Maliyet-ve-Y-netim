import { Body, Controller, Delete, Param, Put } from '@nestjs/common';
import { UpsertDoorFramePriceOverrideDto } from './dto/upsert-door-frame-price-override.dto';
import { PriceOverridesService } from './price-overrides.service';

@Controller('price-overrides')
export class PriceOverridesController {
  constructor(private readonly priceOverridesService: PriceOverridesService) {}

  /**
   * Aktif override'ı kapatır, yeni aktif nakit override oluşturur.
   * PUT /price-overrides/door-frame/:productCode/:sizeKey
   * örn. 34_MM / 10x210
   */
  @Put('door-frame/:productCode/:sizeKey')
  upsertDoorFrame(
    @Param('productCode') productCode: string,
    @Param('sizeKey') sizeKey: string,
    @Body() dto: UpsertDoorFramePriceOverrideDto,
  ) {
    return this.priceOverridesService.upsertDoorFrameOverride(productCode, sizeKey, dto);
  }

  /**
   * Aktif override'ı pasife alır; formül (calculated) nakit fiyatına döner.
   * DELETE /price-overrides/door-frame/:productCode/:sizeKey
   */
  @Delete('door-frame/:productCode/:sizeKey')
  deactivateDoorFrame(
    @Param('productCode') productCode: string,
    @Param('sizeKey') sizeKey: string,
  ) {
    return this.priceOverridesService.deactivateDoorFrameOverride(productCode, sizeKey);
  }
}
