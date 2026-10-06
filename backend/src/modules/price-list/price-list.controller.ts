import { Controller, Get } from '@nestjs/common';
import { PriceListService } from './price-list.service';

@Controller('price-list')
export class PriceListController {
  constructor(private readonly priceListService: PriceListService) {}

  /**
   * Güncel satış fiyat listesi. Hesap yapmaz; mevcut calculator listelerini okur.
   * GET /price-list
   */
  @Get()
  getPriceList() {
    return this.priceListService.getPriceList();
  }
}
