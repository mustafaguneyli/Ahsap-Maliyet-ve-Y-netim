import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CatalogItemsService } from './catalog-items.service';
import { CitaListService } from './cita-list.service';
import { CitaMdfService } from './cita-mdf.service';
import { CitaNetService } from './cita-net.service';
import { CitaProductionService } from './cita-production.service';
import { CostCalculationService } from './cost-calculation.service';
import { GenericRecipeService } from './generic-recipe.service';
import { OrderQuoteDto } from './dto/order-quote.dto';
import {
  CreateCatalogItemDto,
  GenericPreviewDto,
  isSpecialCatalogDto,
} from './dto/create-catalog-item.dto';
import { DeactivateCatalogItemDto } from './dto/deactivate-catalog-item.dto';
import { OrderQuoteService } from './order-quote.service';
import { AyarliPervazMdfQueryDto } from './dto/ayarli-pervaz-mdf-query.dto';
import { DoorFrameMdfQueryDto } from './dto/door-frame-mdf-query.dto';
import { MaterialPriceTypeQueryDto } from './dto/material-price-type-query.dto';
import { CitaListQueryDto, CitaNetQueryDto } from './dto/cita-net-query.dto';
import { resolveCitaMaterialPriceType } from './cita-mdf.service';
import { SupurgelikListQueryDto } from './dto/supurgelik-list-query.dto';
import { SupurgelikMdfQueryDto } from './dto/supurgelik-mdf-query.dto';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

class GenericListQueryDto extends MaterialPriceTypeQueryDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroupCode!: string;
}

@Controller('cost-calculation')
export class CostCalculationController {
  constructor(
    private readonly costCalculationService: CostCalculationService,
    private readonly citaNetService: CitaNetService,
    private readonly citaMdfService: CitaMdfService,
    private readonly citaProductionService: CitaProductionService,
    private readonly citaListService: CitaListService,
    private readonly orderQuoteService: OrderQuoteService,
    private readonly catalogItemsService: CatalogItemsService,
    private readonly genericRecipeService: GenericRecipeService,
  ) {}

  /**
   * Kapı kasası — MDF + ek maliyet + KDV + kâr + ROUNDUP + isteğe bağlı nakit override.
   * materialPriceType yoksa CARD_INSTALLMENT. İki parça aynı alış türünü kullanır.
   * GET /cost-calculation/door-frame/mdf?variant=34_MM|30_MM&materialPriceType=
   */
  @Get('door-frame/mdf')
  getDoorFrameMdf(@Query() query: DoorFrameMdfQueryDto) {
    return this.costCalculationService.getDoorFrameMdfCosts(
      query.variant,
      new Date(),
      query.materialPriceType,
    );
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
   * Çıta — MDF birim maliyeti (seçilen alış türü / NET). ExtraCost yok.
   * materialPriceType yoksa CARD_INSTALLMENT.
   * GET /cost-calculation/cita/mdf?thicknessMm=&widthMm=&lengthMm=&materialPriceType=
   */
  @Get('cita/mdf')
  getCitaMdf(@Query() query: CitaNetQueryDto) {
    return this.citaMdfService.getMdfCost(query);
  }

  /**
   * Çıta — yalnız aktif standart MASTER satırları (DB discovery).
   * Custom ölçü bu listede yoktur; tek ölçü endpoint'i ayrıdır.
   * materialPriceType yoksa CARD_INSTALLMENT.
   * GET /cost-calculation/cita/list?materialPriceType=
   */
  @Get('cita/list')
  getCitaList(@Query() query: CitaListQueryDto) {
    return this.citaListService.listProductionCosts(
      new Date(),
      resolveCitaMaterialPriceType(query.materialPriceType),
    );
  }

  /**
   * Çıta — MDF + group-scope CUTTING/LABOR + yayınlanmış nakit/kart.
   * Custom width ticari banda sınıflandırılır. Kâr yok. DB yazmaz.
   * materialPriceType yoksa CARD_INSTALLMENT. Yayın nakdi alış türünden bağımsızdır.
   * GET /cost-calculation/cita?thicknessMm=&widthMm=&lengthMm=&materialPriceType=
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

  /** GET /cost-calculation/supurgelik?productCode=DUZ_SUPURGELIK&materialPriceType= */
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
    return this.costCalculationService.getAyarliPervazMdfCost(
      query,
      new Date(),
      query.materialPriceType,
    );
  }

  /**
   * Ayarlı Pervaz — yalnız doğrulanmış aktif Excel master ölçüleri.
   * GET /cost-calculation/pervaz/ayarli
   */
  @Get('pervaz/ayarli')
  getAyarliPervazMdfCosts(@Query() query: MaterialPriceTypeQueryDto) {
    return this.costCalculationService.getAyarliPervazMdfCosts(
      new Date(),
      query.materialPriceType,
    );
  }

  /**
   * Dekoratif Pervaz — yalnız doğrulanmış aktif Excel master ölçüleri.
   * GET /cost-calculation/pervaz/dekoratif
   */
  @Get('pervaz/dekoratif')
  getDekoratifPervazCosts(@Query() query: MaterialPriceTypeQueryDto) {
    return this.costCalculationService.getDekoratifPervazCosts(
      new Date(),
      query.materialPriceType,
    );
  }

  /** GET /cost-calculation/pervaz/dekoratif-genis-kilcik */
  @Get('pervaz/dekoratif-genis-kilcik')
  getDekoratifGenisKilcikCosts(@Query() query: MaterialPriceTypeQueryDto) {
    return this.costCalculationService.getDekoratifGenisKilcikCosts(
      new Date(),
      query.materialPriceType,
    );
  }

  /**
   * Anlık sipariş maliyeti: mevcut calculator birim sonucu × adet.
   * DB'ye sipariş yazmaz.
   */
  @Post('order-quote')
  quoteOrder(@Body() dto: OrderQuoteDto) {
    return this.orderQuoteService.quote(dto);
  }

  /**
   * Maliyet kataloguna yeni grup / ürün / ölçü.
   * Özel gruplar (door_frame/PERVAZ/SUPURGELIK/CITA) → mevcut motor path.
   * Diğerleri → GENERIC_RECIPE.
   * POST /cost-calculation/catalog-items
   */
  @Post('catalog-items')
  createCatalogItem(@Body() dto: CreateCatalogItemDto) {
    if (isSpecialCatalogDto(dto)) {
      return this.catalogItemsService.create(dto);
    }
    return this.genericRecipeService.saveCatalog(dto);
  }

  /**
   * Generic katalog soft-deactivate (isActive=false). Hard delete yok.
   * POST /cost-calculation/catalog-items/deactivate
   */
  @Post('catalog-items/deactivate')
  deactivateCatalogItem(@Body() dto: DeactivateCatalogItemDto) {
    return this.genericRecipeService.deactivateCatalogItem(dto);
  }

  /**
   * Generic recipe maliyet önizlemesi (DB yazmaz).
   * POST /cost-calculation/generic-preview
   */
  @Post('generic-preview')
  genericPreview(@Body() dto: GenericPreviewDto) {
    return this.genericRecipeService.preview(dto);
  }

  /**
   * Generic grup maliyet listesi.
   * GET /cost-calculation/generic?productGroupCode=&materialPriceType=
   */
  @Get('generic')
  getGenericList(@Query() query: GenericListQueryDto) {
    return this.genericRecipeService.listCostRows(
      query.productGroupCode,
      query.materialPriceType,
    );
  }
}
