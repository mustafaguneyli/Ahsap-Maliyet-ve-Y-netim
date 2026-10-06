import { Body, Controller, Post } from '@nestjs/common';
import {
  DoorBuildOrderTransferDto,
  DoorBuildQuoteDto,
} from './dto/door-build-quote.dto';
import { DoorBuildService } from './door-build.service';

@Controller('door-build')
export class DoorBuildController {
  constructor(private readonly doorBuildService: DoorBuildService) {}

  /**
   * Kapı İmalatı — yüzey + isteğe bağlı kasa/pervaz/başlık + manuel gider/malzeme.
   * DB yazmaz.
   */
  @Post('quote')
  quote(@Body() dto: DoorBuildQuoteDto) {
    return this.doorBuildService.quote(dto);
  }

  /**
   * Mevcut OrderDocuments upsert gövdesine dönüştürür.
   * Kısmi maliyet satış fiyatı yapılmaz; unitPrice zorunludur.
   * DB yazmaz — kayıt Siparişler ekranından yapılır.
   */
  @Post('order-draft')
  orderDraft(@Body() dto: DoorBuildOrderTransferDto) {
    return this.doorBuildService.toOrderDraft(dto);
  }

  /**
   * Kaydedilmemiş A5 üretim önizlemesi (sipariş no: TASLAK).
   * Fiyat alanı içermez.
   */
  @Post('workshop-preview')
  workshopPreview(@Body() dto: DoorBuildQuoteDto) {
    return this.doorBuildService.workshopPreview(dto);
  }
}
