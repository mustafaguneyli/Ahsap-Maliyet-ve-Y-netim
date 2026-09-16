import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { DoorFrameVariantCode } from '../../calculation-engine/calculators/door-frame-variants';
import { CitaListService } from './cita-list.service';
import { CitaMdfService } from './cita-mdf.service';
import { CitaNetService } from './cita-net.service';
import { CitaProductionService } from './cita-production.service';
import { CostCalculationService } from './cost-calculation.service';
import { OrderQuoteDto } from './dto/order-quote.dto';
import { OrderQuoteService } from './order-quote.service';
import { AyarliPervazMdfQueryDto } from './dto/ayarli-pervaz-mdf-query.dto';
import { CitaNetQueryDto } from './dto/cita-net-query.dto';
import { SupurgelikListQueryDto } from './dto/supurgelik-list-query.dto';
import { SupurgelikMdfQueryDto } from './dto/supurgelik-mdf-query.dto';

@Controller('cost-calculation')
export class CostCalculationController {
  constructor(
    private readonly costCalculationService: CostCalculationService,
    private readonly citaNetService: CitaNetService,
    private readonly citaMdfService: CitaMdfService,
    private readonly citaProductionService: CitaProductionService,
    private readonly citaListService: CitaListService,
    private readonly orderQuoteService: OrderQuoteService,
  ) {}

  /**
   * Kapı kasası — MDF + ek maliyet + KDV + kâr + ROUNDUP + isteğe bağlı nakit override.
   * GET /cost-calculation/door-frame/mdf?variant=34_MM|30_MM
   */
  @Get('door-frame/mdf')
  getDoorFrameMdf(@Query('variant') variant?: string) {
    if (variant !== '34_MM' && variant !== '30_MM') {
      throw new BadRequestException('variant query parametresi 34_MM veya 30_MM olmalıdır.');
    }
    return this.costCalculationService.getDoorFrameMdfCosts(variant as DoorFrameVariantCode);
  }

  /**
   * Çıta — yalnız NET. MASTER yoksa runtime cut rule. DB'ye yazmaz.
   * GET /cost-calculation/cita/net?thicknessMm=&widthMm=&lengthMm=
   */
  @Get('cita/net')
  getCitaNet(@Query() query: CitaNetQueryDto) {
    return this.citaNetService.resolveNet(query);
  }

  /**
   * Çıta — yalnız MDF birim maliyeti (CARD_INSTALLMENT / NET). ExtraCost yok.
   * GET /cost-calculation/cita/mdf?thicknessMm=&widthMm=&lengthMm=
   */
  @Get('cita/mdf')
  getCitaMdf(@Query() query: CitaNetQueryDto) {
    return this.citaMdfService.getMdfCost(query);
  }

  /**
   * Çıta — yalnız aktif standart MASTER satırları (DB discovery).
   * Custom ölçü bu listede yoktur; tek ölçü endpoint'i ayrıdır.
   * GET /cost-calculation/cita/list
   */
  @Get('cita/list')
  getCitaList() {
    return this.citaListService.listProductionCosts();
  }

  /**
   * Çıta — MDF + group-scope CUTTING/LABOR + yayınlanmış nakit/kart.
   * Custom width ticari banda sınıflandırılır. Kâr yok. DB yazmaz.
   * GET /cost-calculation/cita?thicknessMm=&widthMm=&lengthMm=
   */
  @Get('cita')
  getCitaProduction(@Query() query: CitaNetQueryDto) {
    return this.citaProductionService.getQuotedProductionCost(query);
  }

  /**
   * Süpürgelik — tek ölçü için yalnız temel MDF maliyeti.
   * GET /cost-calculation/supurgelik/mdf?productCode=&thicknessMm=&widthMm=&lengthMm=
   */
  @Get('supurgelik/mdf')
  getSupurgelikMdf(@Query() query: SupurgelikMdfQueryDto) {
    return this.costCalculationService.getSupurgelikMdfCost(query);
  }

  /** GET /cost-calculation/supurgelik?productCode=DUZ_SUPURGELIK */
  @Get('supurgelik')
  getSupurgelikMdfCosts(@Query() query: SupurgelikListQueryDto) {
    return this.costCalculationService.getSupurgelikMdfCosts(query);
  }

  /**
   * Ayarlı Pervaz — MDF + ek maliyet + kâr + ROUNDUP + satır adjustment (KDV / kart yok).
   * GET /cost-calculation/pervaz/mdf?productCode=AYARLI_PERVAZ&thicknessMm=&widthMm=&lengthMm=
   */
  @Get('pervaz/mdf')
  getAyarliPervazMdf(@Query() query: AyarliPervazMdfQueryDto) {
    return this.costCalculationService.getAyarliPervazMdfCost(query);
  }

  /**
   * Ayarlı Pervaz — yalnız doğrulanmış aktif Excel master ölçüleri.
   * GET /cost-calculation/pervaz/ayarli
   */
  @Get('pervaz/ayarli')
  getAyarliPervazMdfCosts() {
    return this.costCalculationService.getAyarliPervazMdfCosts();
  }

  /**
   * Dekoratif Pervaz — yalnız doğrulanmış aktif Excel master ölçüleri.
   * GET /cost-calculation/pervaz/dekoratif
   */
  @Get('pervaz/dekoratif')
  getDekoratifPervazCosts() {
    return this.costCalculationService.getDekoratifPervazCosts();
  }

  /** GET /cost-calculation/pervaz/dekoratif-genis-kilcik */
  @Get('pervaz/dekoratif-genis-kilcik')
  getDekoratifGenisKilcikCosts() {
    return this.costCalculationService.getDekoratifGenisKilcikCosts();
  }

  /**
   * Anlık sipariş maliyeti: mevcut calculator birim sonucu × adet.
   * DB'ye sipariş yazmaz.
   */
  @Post('order-quote')
  quoteOrder(@Body() dto: OrderQuoteDto) {
    return this.orderQuoteService.quote(dto);
  }
}
