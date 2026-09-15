import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { DoorFrameVariantCode } from '../../calculation-engine/calculators/door-frame-variants';
import { CostCalculationService } from './cost-calculation.service';
import { AyarliPervazMdfQueryDto } from './dto/ayarli-pervaz-mdf-query.dto';
import { SupurgelikListQueryDto } from './dto/supurgelik-list-query.dto';
import { SupurgelikMdfQueryDto } from './dto/supurgelik-mdf-query.dto';

@Controller('cost-calculation')
export class CostCalculationController {
  constructor(private readonly costCalculationService: CostCalculationService) {}

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
}
