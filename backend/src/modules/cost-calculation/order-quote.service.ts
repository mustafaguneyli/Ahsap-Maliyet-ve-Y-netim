import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DoorFrameVariantCode } from '../../calculation-engine/calculators/door-frame-variants';
import {
  SUPURGELIK_PRODUCT_CODES,
  type SupurgelikProductCode,
} from '../../calculation-engine/calculators/supurgelik-mdf-calculator';
import { PrismaService } from '../../prisma/prisma.service';
import { CitaProductionService } from './cita-production.service';
import { CostCalculationService } from './cost-calculation.service';
import type { OrderQuoteDto } from './dto/order-quote.dto';
import {
  EXTRA_COST_TR,
  formatOrderSizeLabel,
  MISSING_SOURCE_MESSAGE,
  multiplyUnitByQuantity,
  SALE_PRICE_MISSING_MESSAGE,
  sameMm,
} from './order-quote';

export type OrderQuoteResult = {
  productGroupName: string;
  productName: string;
  sizeLabel: string;
  quantity: number;
  productionCostAvailable: boolean;
  unitProductionCost: string | null;
  totalProductionCost: string | null;
  missingMessages: string[];
  salePriceAvailable: boolean;
  salePriceMessage: string | null;
  unitCashPrice: string | null;
  totalCashPrice: string | null;
  unitCardPrice: string | null;
  totalCardPrice: string | null;
};

type LoadedProduct = {
  id: string;
  code: string;
  name: string;
  productGroup: { code: string; name: string };
};

@Injectable()
export class OrderQuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costCalculationService: CostCalculationService,
    private readonly citaProductionService: CitaProductionService,
  ) {}

  async quote(dto: OrderQuoteDto): Promise<OrderQuoteResult> {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, isActive: true, productGroup: { isActive: true } },
      select: {
        id: true,
        code: true,
        name: true,
        productGroup: { select: { code: true, name: true } },
      },
    });
    if (!product) {
      throw new NotFoundException('Aktif ürün bulunamadı.');
    }

    switch (product.productGroup.code) {
      case 'CITA':
        return this.quoteCita(product, dto);
      case 'door_frame':
        return this.quoteDoorFrame(product, dto);
      case 'PERVAZ':
        return this.quotePervaz(product, dto);
      case 'SUPURGELIK':
        return this.quoteSupurgelik(product, dto);
      default:
        throw new BadRequestException(
          'Bu ürün grubu için sipariş maliyeti henüz hesaplanamıyor.',
        );
    }
  }

  private async quoteCita(
    product: LoadedProduct,
    dto: OrderQuoteDto,
  ): Promise<OrderQuoteResult> {
    if (!dto.thicknessMm) {
      throw new BadRequestException('Çıta için kalınlık zorunludur.');
    }

    try {
      const row = await this.citaProductionService.getQuotedProductionCost({
        thicknessMm: dto.thicknessMm,
        widthMm: dto.widthMm,
        lengthMm: dto.lengthMm,
      });

      const missingMessages: string[] = [];
      if (row.statusCode === 'EXTRA_COST_MISSING') {
        const names = row.missingExtraCosts.map(
          (code) => EXTRA_COST_TR[code] ?? code,
        );
        missingMessages.push(
          names.length > 0
            ? `${names.join(' ve ')} tanımlı değil.`
            : 'Kesim ve işçilik tanımlı değil.',
        );
      }

      const saleMissing =
        row.pricing?.statusCode === 'CITA_PUBLISHED_PRICE_MISSING' ||
        row.pricing?.publishedCashPrice == null;

      return this.buildResult({
        product,
        dto,
        thicknessMm: dto.thicknessMm,
        unitProductionCost: row.productionCost,
        missingMessages,
        unitCashPrice: row.pricing?.publishedCashPrice ?? null,
        unitCardPrice: row.pricing?.publishedCardPrice ?? null,
        saleMissing,
      });
    } catch (error) {
      return this.quoteFromCaughtError(product, dto, dto.thicknessMm, error);
    }
  }

  private async quoteDoorFrame(
    product: LoadedProduct,
    dto: OrderQuoteDto,
  ): Promise<OrderQuoteResult> {
    const variant = product.code;
    if (variant !== '34_MM' && variant !== '30_MM') {
      throw new BadRequestException('Kapı Kasası ürün kodu geçersiz.');
    }

    try {
      const list = await this.costCalculationService.getDoorFrameMdfCosts(
        variant as DoorFrameVariantCode,
      );
      const row = list.rows.find(
        (item) =>
          sameMm(item.widthCm * 10, dto.widthMm) &&
          sameMm(item.lengthCm * 10, dto.lengthMm),
      );
      if (!row) {
        throw new BadRequestException('Bu ürün için seçilen ölçü hesaplanamıyor.');
      }

      return this.buildResult({
        product,
        dto,
        thicknessMm: null,
        unitProductionCost: row.productionCost,
        missingMessages: [],
        unitCashPrice: row.pricing.publishedCashPrice ?? null,
        unitCardPrice: row.pricing.publishedCardPrice ?? null,
        saleMissing:
          row.pricing.publishedCashPrice == null &&
          row.pricing.publishedCardPrice == null,
      });
    } catch (error) {
      return this.quoteFromCaughtError(product, dto, null, error);
    }
  }

  private async quotePervaz(
    product: LoadedProduct,
    dto: OrderQuoteDto,
  ): Promise<OrderQuoteResult> {
    if (!dto.thicknessMm) {
      throw new BadRequestException('Pervaz için kalınlık zorunludur.');
    }

    try {
      const list = await this.loadPervazList(product.code);
      const row = list.rows.find(
        (item) =>
          sameMm(item.thicknessMm, dto.thicknessMm!) &&
          sameMm(item.widthMm, dto.widthMm) &&
          sameMm(item.lengthMm, dto.lengthMm),
      );
      if (!row) {
        throw new BadRequestException('Bu ürün için seçilen ölçü hesaplanamıyor.');
      }

      const cash = row.pricing.publishedSalePrice ?? null;
      const card = row.pricing.cardSaleAvailable
        ? row.pricing.cardSalePrice
        : null;

      return this.buildResult({
        product,
        dto,
        thicknessMm: dto.thicknessMm,
        unitProductionCost: row.productionCost,
        missingMessages: [],
        unitCashPrice: cash,
        unitCardPrice: card,
        saleMissing: cash == null,
      });
    } catch (error) {
      return this.quoteFromCaughtError(product, dto, dto.thicknessMm, error);
    }
  }

  private async quoteSupurgelik(
    product: LoadedProduct,
    dto: OrderQuoteDto,
  ): Promise<OrderQuoteResult> {
    if (!dto.thicknessMm) {
      throw new BadRequestException('Süpürgelik için kalınlık zorunludur.');
    }
    if (!isSupurgelikProductCode(product.code)) {
      throw new BadRequestException('Süpürgelik ürün kodu geçersiz.');
    }

    try {
      const list = await this.costCalculationService.getSupurgelikMdfCosts({
        productCode: product.code,
      });
      const row = list.rows.find(
        (item) =>
          sameMm(item.thicknessMm, dto.thicknessMm!) &&
          sameMm(item.widthMm, dto.widthMm) &&
          sameMm(item.lengthMm, dto.lengthMm),
      );
      if (!row) {
        throw new BadRequestException('Bu ürün için seçilen ölçü hesaplanamıyor.');
      }

      const missingMessages = supurgelikMissingMessages(row.errorCode);
      return this.buildResult({
        product,
        dto,
        thicknessMm: dto.thicknessMm,
        unitProductionCost: row.productionCost,
        missingMessages,
        unitCashPrice: row.pricing?.publishedCashPrice ?? null,
        unitCardPrice: null,
        saleMissing: row.pricing?.publishedCashPrice == null,
      });
    } catch (error) {
      return this.quoteFromCaughtError(product, dto, dto.thicknessMm, error);
    }
  }

  private async loadPervazList(productCode: string) {
    if (productCode === 'AYARLI_PERVAZ') {
      return this.costCalculationService.getAyarliPervazMdfCosts();
    }
    if (productCode === 'DEKORATIF_PERVAZ') {
      return this.costCalculationService.getDekoratifPervazCosts();
    }
    if (productCode === 'DEKORATIF_PERVAZ_GENIS_KILCIK') {
      return this.costCalculationService.getDekoratifGenisKilcikCosts();
    }
    throw new BadRequestException('Pervaz ürün kodu geçersiz.');
  }

  private quoteFromCaughtError(
    product: LoadedProduct,
    dto: OrderQuoteDto,
    thicknessMm: string | null,
    error: unknown,
  ): OrderQuoteResult {
    if (error instanceof BadRequestException) {
      const message = firstExceptionMessage(error);
      if (message.includes('seçilen ölçü')) {
        throw error;
      }
    }
    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException ||
      error instanceof HttpException
    ) {
      return this.buildResult({
        product,
        dto,
        thicknessMm,
        unitProductionCost: null,
        missingMessages: [friendlyExceptionMessage(error)],
        unitCashPrice: null,
        unitCardPrice: null,
        saleMissing: true,
      });
    }
    throw error;
  }

  private buildResult(input: {
    product: LoadedProduct;
    dto: OrderQuoteDto;
    thicknessMm: string | number | null;
    unitProductionCost: string | null;
    missingMessages: string[];
    unitCashPrice: string | null;
    unitCardPrice: string | null;
    saleMissing: boolean;
  }): OrderQuoteResult {
    const productionCostAvailable =
      input.unitProductionCost != null && input.unitProductionCost !== '';
    const cashAvailable = input.unitCashPrice != null && input.unitCashPrice !== '';
    const cardAvailable = input.unitCardPrice != null && input.unitCardPrice !== '';

    return {
      productGroupName: input.product.productGroup.name,
      productName: input.product.name,
      sizeLabel: formatOrderSizeLabel({
        thicknessMm: input.thicknessMm,
        widthMm: input.dto.widthMm,
        lengthMm: input.dto.lengthMm,
      }),
      quantity: input.dto.quantity,
      productionCostAvailable,
      unitProductionCost: productionCostAvailable ? input.unitProductionCost : null,
      totalProductionCost: productionCostAvailable
        ? multiplyUnitByQuantity(input.unitProductionCost!, input.dto.quantity)
        : null,
      missingMessages: productionCostAvailable
        ? []
        : input.missingMessages.length > 0
          ? input.missingMessages
          : [MISSING_SOURCE_MESSAGE],
      salePriceAvailable: cashAvailable || cardAvailable,
      salePriceMessage:
        cashAvailable || cardAvailable ? null : SALE_PRICE_MISSING_MESSAGE,
      unitCashPrice: cashAvailable ? input.unitCashPrice : null,
      totalCashPrice: cashAvailable
        ? multiplyUnitByQuantity(input.unitCashPrice!, input.dto.quantity)
        : null,
      unitCardPrice: cardAvailable ? input.unitCardPrice : null,
      totalCardPrice: cardAvailable
        ? multiplyUnitByQuantity(input.unitCardPrice!, input.dto.quantity)
        : null,
    };
  }
}

function isSupurgelikProductCode(code: string): code is SupurgelikProductCode {
  return (SUPURGELIK_PRODUCT_CODES as readonly string[]).includes(code);
}

function supurgelikMissingMessages(errorCode: string | null): string[] {
  if (errorCode === 'RAW_MATERIAL_PRICE_MISSING') {
    return ['MDF fiyatı tanımlı değil.'];
  }
  if (errorCode === 'DECORATIVE_RATE_MISSING') {
    return ['Dekoratif oran tanımlı değil.'];
  }
  if (errorCode === 'PP_WRAPPING_COST_MISSING') {
    return ['PP sarma maliyeti tanımlı değil.'];
  }
  return [];
}

function firstExceptionMessage(error: HttpException): string {
  const response = error.getResponse();
  if (typeof response === 'string') return response;
  if (typeof response === 'object' && response && 'message' in response) {
    const message = (response as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join(' ');
    if (typeof message === 'string') return message;
  }
  return error.message;
}

function friendlyExceptionMessage(error: HttpException): string {
  const raw = firstExceptionMessage(error);
  const replaced = raw.replace(
    /\b(CUTTING|GLUE|LABOR|OTHER|CARD_INSTALLMENT)\b/g,
    (code) => EXTRA_COST_TR[code] ?? 'kart / taksit alış fiyatı',
  );
  if (replaced.trim().length === 0) return MISSING_SOURCE_MESSAGE;
  return replaced;
}
