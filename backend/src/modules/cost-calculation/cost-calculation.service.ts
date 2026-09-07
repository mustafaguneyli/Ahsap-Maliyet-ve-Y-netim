import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MaterialPriceType } from '@prisma/client';
import { CalculationEngine } from '../../calculation-engine/calculation-engine';
import type {
  AyarliPervazExtraCostsInput,
  AyarliPervazMdfInput,
} from '../../calculation-engine/calculators/ayarli-pervaz-mdf-calculator';
import type {
  DoorFrameExtraCostsInput,
  DoorFrameSizeCostInput,
} from '../../calculation-engine/calculators/door-frame-calculator';
import {
  DoorFrameVariantCode,
  formatDoorFrameSizeLabel,
  getDoorFrameSizes,
  getPrimaryMaterialCode,
  getSecondary12MaterialCode,
} from '../../calculation-engine/calculators/door-frame-variants';
import { ExtraCostListResponse, ExtraCostsService } from '../extra-costs/extra-costs.service';
import { AYARLI_PERVAZ_KILCIK_MATERIAL_CODE } from '../pervaz/ayarli-pervaz-kilcik-yield-seed';
import {
  resolveAyarliPervazAdjustment,
  resolveAyarliPervazProfitRate,
} from '../pricing/ayarli-pervaz-profit-rate.resolver';
import { PervazQtyService } from '../pervaz/pervaz-qty.service';
import {
  applyPublishedSalePrices,
  CashOverrideSnapshot,
} from '../price-overrides/apply-published-sale-prices';
import { PrismaService } from '../../prisma/prisma.service';
import { selectCurrentMaterialPrice } from './current-material-price';

@Injectable()
export class CostCalculationService {
  private readonly engine = new CalculationEngine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly extraCostsService: ExtraCostsService,
    private readonly pervazQtyService: PervazQtyService,
  ) {}

  async getDoorFrameMdfCosts(variant: DoorFrameVariantCode, now: Date = new Date()) {
    if (variant !== '34_MM' && variant !== '30_MM') {
      throw new BadRequestException('variant 34_MM veya 30_MM olmalıdır.');
    }

    const sizes = getDoorFrameSizes(variant);
    const primaryCode = getPrimaryMaterialCode(variant);
    const secondaryCodes = [
      ...new Set(sizes.map((s) => getSecondary12MaterialCode(s.widthCm, s.lengthCm))),
    ];
    const neededCodes = [primaryCode, ...secondaryCodes];

    // Fiyatları her istekte DB'den oku; sabitlenmiş maliyet saklanmaz.
    const materials = await this.prisma.rawMaterial.findMany({
      where: { code: { in: neededCodes }, isActive: true },
      include: {
        prices: {
          where: {
            priceType: MaterialPriceType.CARD_INSTALLMENT,
            isActive: true,
          },
          orderBy: { effectiveFrom: 'desc' },
        },
      },
    });

    const materialByCode = new Map(materials.map((m) => [m.code, m]));
    const currentPriceByCode = new Map<string, string>();

    for (const code of neededCodes) {
      if (!materialByCode.has(code)) {
        throw new NotFoundException(`Aktif ham madde bulunamadı: ${code}`);
      }
      const material = materialByCode.get(code)!;
      const current = selectCurrentMaterialPrice(
        material.prices,
        MaterialPriceType.CARD_INSTALLMENT,
        now,
      );
      if (!current) {
        throw new NotFoundException(
          `${code} için şu an geçerli CARD_INSTALLMENT (K.Kartı) alış fiyatı bulunamadı.`,
        );
      }
      currentPriceByCode.set(code, current.price.toString());
    }

    const yields = await this.prisma.productionYield.findMany({
      where: {
        isActive: true,
        rawMaterialId: { in: materials.map((m) => m.id) },
      },
    });

    const yieldKey = (rawMaterialId: string, w: number, l: number) =>
      `${rawMaterialId}|${w}|${l}`;
    const yieldByKey = new Map(
      yields.map((y) => [yieldKey(y.rawMaterialId, y.pieceWidthMm, y.pieceLengthMm), y]),
    );

    const sizeInputs: DoorFrameSizeCostInput[] = sizes.map((size) => {
      const pieceWidthMm = size.widthCm * 10;
      const pieceLengthMm = size.lengthCm * 10;
      const displayName = formatDoorFrameSizeLabel(size.widthCm, size.lengthCm);
      const secondaryCode = getSecondary12MaterialCode(size.widthCm, size.lengthCm);

      const partCodes = [primaryCode, secondaryCode];
      const parts = partCodes.map((code) => {
        const material = materialByCode.get(code)!;
        const y = yieldByKey.get(yieldKey(material.id, pieceWidthMm, pieceLengthMm));
        if (!y) {
          throw new NotFoundException(
            `${displayName}: ${code} için aktif NET adet (ProductionYield) bulunamadı.`,
          );
        }
        return {
          thicknessMm: material.thicknessMm.toString(),
          rawMaterialId: material.id,
          rawMaterialCode: material.code,
          rawMaterialName: material.name,
          sheetWidthMm: material.sheetWidthMm,
          sheetLengthMm: material.sheetLengthMm,
          sheetPrice: currentPriceByCode.get(code)!,
          netQty: y.netQty,
          pieceWidthMm,
          pieceLengthMm,
        };
      });

      return {
        widthCm: size.widthCm,
        lengthCm: size.lengthCm,
        displayName,
        parts,
      };
    });

    const extraCosts = this.requireDoorFrameExtraCosts(
      await this.extraCostsService.listForProductGroup('door_frame', now),
    );
    const { productId, vatRate, profitRate, cardMarkupRate } =
      await this.requireProductPricingRates(variant);
    const rows = this.engine.calculateDoorFrameCostsWithProfit(
      sizeInputs,
      extraCosts,
      vatRate,
      profitRate,
      cardMarkupRate,
    );
    const overrideBySize = await this.loadActiveCashOverrides(productId, sizes);

    return {
      productGroupCode: 'door_frame',
      productGroupName: 'Kapı Kasası',
      variant,
      priceType: MaterialPriceType.CARD_INSTALLMENT,
      asOf: now.toISOString(),
      extraCosts,
      vatRate,
      profitRate,
      cardMarkupRate,
      rows: rows.map((row) => {
        const key = `${row.widthCm}x${row.lengthCm}`;
        const published = applyPublishedSalePrices(
          row.pricing.cashSalePrice,
          cardMarkupRate,
          overrideBySize.get(key) ?? null,
        );
        return {
          ...row,
          pricing: {
            ...row.pricing,
            ...published,
          },
        };
      }),
    };
  }

  /**
   * Ayarlı Pervaz — MDF + PERVAZ ek maliyet + kâr + ROUNDUP + satır adjustment.
   * KDV / kart / mutlak PriceOverride yok. Her istekte yeniden hesaplanır.
   */
  async getAyarliPervazMdfCost(
    input: {
      productCode: string;
      thicknessMm: number;
      widthMm: number;
      lengthMm: number;
    },
    now: Date = new Date(),
  ) {
    if (input.productCode !== 'AYARLI_PERVAZ') {
      throw new BadRequestException(
        'Bu aşamada Pervaz MDF maliyeti yalnız AYARLI_PERVAZ için hesaplanır.',
      );
    }

    const group = await this.prisma.productGroup.findUnique({
      where: { code: 'PERVAZ' },
    });
    const product = group
      ? await this.prisma.product.findUnique({
          where: {
            productGroupId_code: {
              productGroupId: group.id,
              code: 'AYARLI_PERVAZ',
            },
          },
        })
      : null;
    if (!group || !group.isActive || !product || !product.isActive) {
      throw new NotFoundException('Aktif ürün bulunamadı: AYARLI_PERVAZ');
    }

    const mainMaterial = await this.resolveAyarliPervazMainMaterial(
      input.thicknessMm,
      input.widthMm,
      input.lengthMm,
    );
    const mainQty = await this.pervazQtyService.resolvePervazPiece({
      rawMaterialId: mainMaterial.id,
      sheetWidthMm: mainMaterial.sheetWidthMm,
      sheetLengthMm: mainMaterial.sheetLengthMm,
      pieceWidthMm: input.widthMm,
      pieceLengthMm: input.lengthMm,
    });
    const mainSheetPrice = this.requireCardSheetPrice(mainMaterial, now);

    const kilcikMaterial = await this.prisma.rawMaterial.findUnique({
      where: { code: AYARLI_PERVAZ_KILCIK_MATERIAL_CODE },
      include: { prices: true },
    });
    if (!kilcikMaterial || !kilcikMaterial.isActive) {
      throw new NotFoundException(
        `Aktif ham madde bulunamadı: ${AYARLI_PERVAZ_KILCIK_MATERIAL_CODE}`,
      );
    }
    const kilcikQty = await this.pervazQtyService.resolveKilcik({
      productId: product.id,
      pervazThicknessMm: input.thicknessMm,
      pieceLengthMm: input.lengthMm,
      sheetWidthMm: kilcikMaterial.sheetWidthMm,
      sheetLengthMm: kilcikMaterial.sheetLengthMm,
    });
    const kilcikSheetPrice = this.requireCardSheetPrice(kilcikMaterial, now);

    const extraCosts = this.requirePervazExtraCosts(
      await this.extraCostsService.listForProductGroup('PERVAZ', now),
    );

    const rowExceptions = await this.prisma.pricingRowException.findMany({
      where: {
        productId: product.id,
        thicknessMm: input.thicknessMm,
        widthMm: input.widthMm,
        lengthMm: input.lengthMm,
        isActive: true,
      },
    });
    const productSettings = await this.prisma.pricingSetting.findMany({
      where: {
        productId: product.id,
        productGroupId: null,
        isActive: true,
      },
    });
    const groupSettings = await this.prisma.pricingSetting.findMany({
      where: {
        productGroupId: group.id,
        productId: null,
        isActive: true,
      },
    });
    const globalSettings = await this.prisma.pricingSetting.findMany({
      where: {
        productGroupId: null,
        productId: null,
        isActive: true,
      },
    });

    const resolvedProfit = resolveAyarliPervazProfitRate({
      now,
      rowExceptions,
      productSettings,
      groupSettings,
      globalSettings,
    });
    const resolvedAdjustment = resolveAyarliPervazAdjustment({
      now,
      rowExceptions,
    });

    const calcInput: AyarliPervazMdfInput = {
      productCode: 'AYARLI_PERVAZ',
      thicknessMm: input.thicknessMm,
      widthMm: input.widthMm,
      lengthMm: input.lengthMm,
      mainPiece: {
        rawMaterialCode: mainMaterial.code,
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: mainSheetPrice,
        netQty: mainQty.netQty,
        yieldSource: mainQty.source,
      },
      kilcik: {
        rawMaterialCode: kilcikMaterial.code,
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: kilcikSheetPrice,
        netQty: kilcikQty.netQty,
        yieldSource: kilcikQty.source,
      },
      extraCosts,
      profitRate: resolvedProfit.profitRate,
      adjustmentAmount: resolvedAdjustment.adjustmentAmount,
    };

    const result = this.engine.calculateAyarliPervazMdf(calcInput);

    return {
      productGroupCode: 'PERVAZ',
      productGroupName: group.name,
      priceType: MaterialPriceType.CARD_INSTALLMENT,
      asOf: now.toISOString(),
      ...result,
      pricing: {
        ...result.pricing,
        profitRateSource: resolvedProfit.source,
        adjustmentSource: resolvedAdjustment.source,
      },
    };
  }

  private async resolveAyarliPervazMainMaterial(
    thicknessMm: number,
    widthMm: number,
    lengthMm: number,
  ) {
    const yields = await this.prisma.productionYield.findMany({
      where: {
        isActive: true,
        pieceWidthMm: widthMm,
        pieceLengthMm: lengthMm,
        rawMaterial: {
          isActive: true,
          thicknessMm,
        },
      },
      include: {
        rawMaterial: {
          include: { prices: true },
        },
      },
    });

    if (yields.length > 1) {
      throw new BadRequestException(
        `${thicknessMm} mm / ${widthMm}×${lengthMm}: birden fazla aktif ProductionYield bulundu; ham madde tek seçilemedi.`,
      );
    }
    if (yields.length === 1) {
      return yields[0].rawMaterial;
    }

    const candidates = await this.prisma.rawMaterial.findMany({
      where: { isActive: true, thicknessMm },
      include: { prices: true },
    });
    if (candidates.length === 0) {
      throw new NotFoundException(
        `${thicknessMm} mm için aktif ham madde bulunamadı (ana pervaz).`,
      );
    }
    if (candidates.length > 1) {
      throw new BadRequestException(
        `${thicknessMm} mm / ${widthMm}×${lengthMm}: ProductionYield master yok ve aynı kalınlıkta birden fazla MDF var. Ham madde tahmin edilmez.`,
      );
    }
    return candidates[0];
  }

  private requireCardSheetPrice(
    material: {
      code: string;
      prices: Parameters<typeof selectCurrentMaterialPrice>[0];
    },
    now: Date,
  ): string {
    const current = selectCurrentMaterialPrice(
      material.prices,
      MaterialPriceType.CARD_INSTALLMENT,
      now,
    );
    if (!current) {
      throw new NotFoundException(
        `${material.code} için şu an geçerli CARD_INSTALLMENT (K.Kartı) alış fiyatı bulunamadı.`,
      );
    }
    return current.price.toString();
  }

  private async loadActiveCashOverrides(
    productId: string,
    sizes: Array<{ widthCm: number; lengthCm: number }>,
  ): Promise<Map<string, CashOverrideSnapshot>> {
    const productSizes = await this.prisma.productSize.findMany({
      where: {
        OR: sizes.map((s) => ({
          widthMm: s.widthCm * 10,
          lengthMm: s.lengthCm * 10,
        })),
      },
    });
    if (productSizes.length === 0) {
      return new Map();
    }

    const sizeKeyById = new Map(
      productSizes.map((s) => [s.id, `${s.widthMm / 10}x${s.lengthMm / 10}`]),
    );

    const overrides = await this.prisma.priceOverride.findMany({
      where: {
        productId,
        isActive: true,
        productSizeId: { in: productSizes.map((s) => s.id) },
      },
    });

    const bySize = new Map<string, CashOverrideSnapshot>();
    for (const override of overrides) {
      const sizeKey = sizeKeyById.get(override.productSizeId);
      if (!sizeKey) continue;
      bySize.set(sizeKey, {
        id: override.id,
        cashPrice: override.cashPrice.toString(),
        reason: override.reason,
      });
    }
    return bySize;
  }

  private async requireProductPricingRates(variant: DoorFrameVariantCode): Promise<{
    productId: string;
    vatRate: string;
    profitRate: string;
    cardMarkupRate: string;
  }> {
    const group = await this.prisma.productGroup.findUnique({
      where: { code: 'door_frame' },
    });
    if (!group || !group.isActive) {
      throw new NotFoundException('Ürün grubu bulunamadı: door_frame');
    }

    const product = await this.prisma.product.findUnique({
      where: {
        productGroupId_code: {
          productGroupId: group.id,
          code: variant,
        },
      },
    });
    if (!product || !product.isActive) {
      throw new NotFoundException(`Kapı Kasası ürünü bulunamadı: ${variant}`);
    }

    const setting = await this.prisma.pricingSetting.findFirst({
      where: {
        productId: product.id,
        productGroupId: null,
        isActive: true,
      },
    });
    if (!setting) {
      throw new NotFoundException(
        `${variant} için aktif Product-level PricingSetting bulunamadı.`,
      );
    }
    if (setting.vatRate == null) {
      throw new NotFoundException(`${variant} için KDV oranı (vatRate) tanımlı değil.`);
    }
    if (setting.profitRate == null) {
      throw new NotFoundException(`${variant} için kâr oranı (profitRate) tanımlı değil.`);
    }
    if (setting.cardMarkupRate == null) {
      throw new NotFoundException(
        `${variant} için kredi kartı farkı (cardMarkupRate) tanımlı değil.`,
      );
    }

    return {
      productId: product.id,
      vatRate: setting.vatRate.toString(),
      profitRate: setting.profitRate.toString(),
      cardMarkupRate: setting.cardMarkupRate.toString(),
    };
  }

  private requireDoorFrameExtraCosts(list: ExtraCostListResponse): DoorFrameExtraCostsInput {
    const byCode = new Map(list.items.map((item) => [item.typeCode, item]));
    const pick = (code: string): string => {
      const item = byCode.get(code);
      if (!item?.amount) {
        throw new NotFoundException(
          `Kapı Kasası için şu an geçerli ek maliyet bulunamadı: ${code}`,
        );
      }
      return item.amount;
    };

    return {
      cutting: pick('CUTTING'),
      glue: pick('GLUE'),
      labor: pick('LABOR'),
      other: pick('OTHER'),
    };
  }

  private requirePervazExtraCosts(list: ExtraCostListResponse): AyarliPervazExtraCostsInput {
    const byCode = new Map(list.items.map((item) => [item.typeCode, item]));
    const pick = (code: string): string => {
      const item = byCode.get(code);
      if (!item?.amount) {
        throw new NotFoundException(
          `Pervaz için şu an geçerli ek maliyet bulunamadı: ${code}`,
        );
      }
      return item.amount;
    };

    return {
      cutting: pick('CUTTING'),
      glue: pick('GLUE'),
      labor: pick('LABOR'),
    };
  }
}
