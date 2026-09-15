import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MaterialPriceType, PricingModifierType } from '@prisma/client';
import { CalculationEngine } from '../../calculation-engine/calculation-engine';
import { toDecimal } from '../../common/decimal/decimal.util';
import type {
  AyarliPervazExtraCostsInput,
  AyarliPervazMdfInput,
} from '../../calculation-engine/calculators/ayarli-pervaz-mdf-calculator';
import type {
  DoorFrameExtraCostsInput,
  DoorFrameSizeCostInput,
} from '../../calculation-engine/calculators/door-frame-calculator';
import type { DekoratifPervazProductCode } from '../../calculation-engine/calculators/dekoratif-pervaz-calculator';
import {
  isSupurgelikDecorativeProduct,
  isSupurgelikPpProduct,
  SUPURGELIK_PP_WRAPPING_COST_MISSING,
  SUPURGELIK_PRODUCT_CODES,
  type SupurgelikDecorativePricingInput,
  type SupurgelikExtraCostInput,
  type SupurgelikDuzPricingInput,
  type SupurgelikMdfInput,
  type SupurgelikProductCode,
} from '../../calculation-engine/calculators/supurgelik-mdf-calculator';
import {
  DoorFrameVariantCode,
  formatDoorFrameSizeLabel,
  getDoorFrameSizes,
  getPrimaryMaterialCode,
  getSecondary12MaterialCode,
} from '../../calculation-engine/calculators/door-frame-variants';
import { ExtraCostListResponse, ExtraCostsService } from '../extra-costs/extra-costs.service';
import { SUPURGELIK_EXTRA_COST_TYPE_ORDER } from '../extra-costs/supurgelik-extra-cost-seed';
import { AYARLI_PERVAZ_KILCIK_MATERIAL_CODE } from '../pervaz/ayarli-pervaz-kilcik-yield-seed';
import {
  resolveAyarliPervazAdjustment,
  resolveAyarliPervazCardSaleEnabled,
  resolveAyarliPervazProfitRate,
  resolveDekoratifPervazPremiumRate,
  resolvePervazCardFixedSurchargeAmount,
} from '../pricing/ayarli-pervaz-profit-rate.resolver';
import { PervazQtyService } from '../pervaz/pervaz-qty.service';
import {
  applyPublishedSalePrices,
  CashOverrideSnapshot,
} from '../price-overrides/apply-published-sale-prices';
import { PrismaService } from '../../prisma/prisma.service';
import { selectCurrentMaterialPrice } from './current-material-price';
import {
  SUPURGELIK_DECORATIVE_RATE_MISSING,
  SupurgelikRawMaterialPriceMissingException,
  supurgelikDecorativeRateMissingMessage,
  supurgelikPpWrappingCostMissingMessage,
} from './supurgelik-mdf.errors';
import {
  type ActiveProductMasterRow,
  discoverActiveProductMasterRows,
} from '../production-yields/active-product-master-discovery';

type SupurgelikExtraCostContext = {
  items: SupurgelikExtraCostInput[];
  totalAmount: string;
};

type SupurgelikDuzPricingContext = SupurgelikDuzPricingInput;
type SupurgelikDecorativeRateContext = Pick<
  SupurgelikDecorativePricingInput,
  'decorativeRate' | 'decorativeRateSource'
>;
type SupurgelikDecorativeRateMap = Map<number, SupurgelikDecorativeRateContext>;

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
        productId: null,
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
   * Süpürgelik tek ölçü temel MDF maliyeti.
   * Aktif generic MASTER ve ona bağlı güncel CARD_INSTALLMENT fiyatı kullanılır.
   */
  async getSupurgelikMdfCost(
    input: {
      productCode: SupurgelikProductCode;
      thicknessMm: number;
      widthMm: number;
      lengthMm: number;
    },
    now: Date = new Date(),
    prefetchedExtraCosts?: SupurgelikExtraCostContext,
    prefetchedPricing?: SupurgelikDuzPricingContext,
    prefetchedDecorativeRates?: SupurgelikDecorativeRateMap,
    prefetchedPpWrappingCost?: string | null,
  ) {
    if (!SUPURGELIK_PRODUCT_CODES.includes(input.productCode)) {
      throw new BadRequestException('Geçersiz Süpürgelik productCode.');
    }
    for (const [field, value] of [
      ['thicknessMm', input.thicknessMm],
      ['widthMm', input.widthMm],
      ['lengthMm', input.lengthMm],
    ] as const) {
      if (!Number.isInteger(value) || value <= 0) {
        throw new BadRequestException(`${field} pozitif tam sayı olmalıdır.`);
      }
    }

    const group = await this.prisma.productGroup.findUnique({
      where: { code: 'SUPURGELIK' },
    });
    const product = group
      ? await this.prisma.product.findUnique({
          where: {
            productGroupId_code: {
              productGroupId: group.id,
              code: input.productCode,
            },
          },
        })
      : null;
    if (!group?.isActive || !product?.isActive) {
      throw new NotFoundException(`Aktif Süpürgelik ürünü bulunamadı: ${input.productCode}`);
    }

    const masters = await this.prisma.productionYield.findMany({
      where: {
        productId: null,
        isActive: true,
        pieceWidthMm: input.widthMm,
        pieceLengthMm: input.lengthMm,
        rawMaterial: {
          isActive: true,
          thicknessMm: input.thicknessMm,
        },
      },
      include: {
        rawMaterial: {
          include: {
            prices: {
              where: {
                priceType: MaterialPriceType.CARD_INSTALLMENT,
                isActive: true,
              },
              orderBy: { effectiveFrom: 'desc' },
            },
          },
        },
      },
    });

    const context = `${input.thicknessMm} mm / ${input.widthMm}×${input.lengthMm}`;
    if (masters.length === 0) {
      throw new NotFoundException(
        `Aktif generic Süpürgelik ProductionYield MASTER bulunamadı: ${context}`,
      );
    }
    if (masters.length > 1) {
      throw new BadRequestException(
        `Birden fazla aktif generic Süpürgelik ProductionYield bulundu: ${context}`,
      );
    }

    const master = masters[0];
    const material = master.rawMaterial;
    const currentPrice = selectCurrentMaterialPrice(
      material.prices,
      MaterialPriceType.CARD_INSTALLMENT,
      now,
    );
    if (!currentPrice) {
      throw new SupurgelikRawMaterialPriceMissingException(material.code);
    }

    const commonExtraCosts =
      prefetchedExtraCosts ?? (await this.resolveSupurgelikExtraCosts(now));
    const basePricing =
      prefetchedPricing ?? (await this.resolveSupurgelikDuzPricing(group.id));
    const decorativeRates = isSupurgelikDecorativeProduct(input.productCode)
      ? prefetchedDecorativeRates ??
        (await this.resolveSupurgelikDecorativeRates(group.id, now))
      : undefined;
    const decorativeRate = decorativeRates?.get(input.thicknessMm) ?? null;
    const pricing = isSupurgelikDecorativeProduct(input.productCode)
      ? { ...basePricing, ...(decorativeRate ?? this.missingDecorativeRate()) }
      : basePricing;
    const ppWrappingCost = isSupurgelikPpProduct(input.productCode)
      ? prefetchedPpWrappingCost !== undefined
        ? prefetchedPpWrappingCost
        : await this.resolveSupurgelikPpWrappingCost(now)
      : undefined;

    const calculatorInput: SupurgelikMdfInput = {
      productCode: input.productCode,
      thicknessMm: input.thicknessMm,
      widthMm: input.widthMm,
      lengthMm: input.lengthMm,
      rawMaterial: {
        code: material.code,
        thicknessMm: material.thicknessMm.toString(),
        sheetWidthMm: material.sheetWidthMm,
        sheetLengthMm: material.sheetLengthMm,
      },
      sheetPrice: {
        priceType: 'CARD_INSTALLMENT',
        amount: currentPrice.price.toString(),
      },
      productionYield: {
        netQty: master.netQty,
        scope: 'GENERIC',
      },
      extraCosts: commonExtraCosts.items,
      ppWrappingCost,
      pricing,
    };

    return {
      productGroupCode: 'SUPURGELIK',
      productGroupName: group.name,
      productName: product.name,
      asOf: now.toISOString(),
      ...this.engine.calculateSupurgelikMdf(calculatorInput),
    };
  }

  /**
   * DB'deki aktif generic Süpürgelik masterlarını keşfeder ve tek-satır
   * calculator/service yolunu her satır için reuse eder.
   */
  async getSupurgelikMdfCosts(
    input: { productCode: SupurgelikProductCode },
    now: Date = new Date(),
  ) {
    if (!SUPURGELIK_PRODUCT_CODES.includes(input.productCode)) {
      throw new BadRequestException('Geçersiz Süpürgelik productCode.');
    }

    const group = await this.prisma.productGroup.findUnique({
      where: { code: 'SUPURGELIK' },
    });
    const product = group
      ? await this.prisma.product.findUnique({
          where: {
            productGroupId_code: {
              productGroupId: group.id,
              code: input.productCode,
            },
          },
        })
      : null;
    if (!group?.isActive || !product?.isActive) {
      throw new NotFoundException(`Aktif Süpürgelik ürünü bulunamadı: ${input.productCode}`);
    }

    // Ortak group-scope giderleri her toplu request'te bir kez güncel DB'den çözülür.
    const commonExtraCosts = await this.resolveSupurgelikExtraCosts(now);
    const pricing = await this.resolveSupurgelikDuzPricing(group.id);
    const decorativeRates = isSupurgelikDecorativeProduct(input.productCode)
      ? await this.resolveSupurgelikDecorativeRates(group.id, now)
      : undefined;
    const ppWrappingCost = isSupurgelikPpProduct(input.productCode)
      ? await this.resolveSupurgelikPpWrappingCost(now)
      : undefined;

    const productSizes = await this.prisma.productSize.findMany({
      select: { widthMm: true, lengthMm: true },
    });
    const productSizeKeys = new Set(
      productSizes.map((size) => `${size.widthMm}|${size.lengthMm}`),
    );

    const genericCandidates = await this.prisma.productionYield.findMany({
      where: {
        productId: null,
        isActive: true,
        rawMaterial: { isActive: true },
      },
      include: { rawMaterial: true },
    });

    // Generic ProductionYield üzerinde ürün grubu FK'si yoktur. Süpürgelik ayrımı,
    // DB ProductSize eşleşmesi ve parçanın MDF tabaka boyuna tam oturmasıyla yapılır.
    const masters = genericCandidates.filter(
      (row) =>
        row.productId === null &&
        row.isActive &&
        row.rawMaterial.isActive &&
        row.pieceLengthMm === row.rawMaterial.sheetLengthMm &&
        productSizeKeys.has(`${row.pieceWidthMm}|${row.pieceLengthMm}`),
    );

    const seen = new Set<string>();
    for (const master of masters) {
      const key = `${master.rawMaterial.thicknessMm.toString()}|${master.pieceWidthMm}|${master.pieceLengthMm}`;
      if (seen.has(key)) {
        throw new BadRequestException(
          `Birden fazla aktif generic Süpürgelik ProductionYield bulundu: ${master.rawMaterial.thicknessMm.toString()} mm / ${master.pieceWidthMm}×${master.pieceLengthMm}`,
        );
      }
      seen.add(key);
    }

    masters.sort((a, b) => {
      const thicknessOrder = toDecimal(a.rawMaterial.thicknessMm).comparedTo(
        toDecimal(b.rawMaterial.thicknessMm),
      );
      return (
        thicknessOrder ||
        a.pieceWidthMm - b.pieceWidthMm ||
        a.pieceLengthMm - b.pieceLengthMm
      );
    });

    const rows = [];
    for (const master of masters) {
      const thicknessMm = Number(master.rawMaterial.thicknessMm.toString());
      try {
        const calculated = await this.getSupurgelikMdfCost(
          {
            productCode: input.productCode,
            thicknessMm,
            widthMm: master.pieceWidthMm,
            lengthMm: master.pieceLengthMm,
          },
          now,
          commonExtraCosts,
          pricing,
          decorativeRates,
          ppWrappingCost,
        );
        const pricingStatusCode =
          calculated.pricing != null && 'statusCode' in calculated.pricing
            ? calculated.pricing.statusCode
            : null;
        const pricingErrorMessage =
          pricingStatusCode === SUPURGELIK_DECORATIVE_RATE_MISSING
            ? supurgelikDecorativeRateMissingMessage(thicknessMm)
            : pricingStatusCode === SUPURGELIK_PP_WRAPPING_COST_MISSING
              ? supurgelikPpWrappingCostMissingMessage()
              : null;
        rows.push({
          productCode: calculated.productCode,
          thicknessMm: calculated.thicknessMm,
          widthMm: calculated.widthMm,
          lengthMm: calculated.lengthMm,
          rawMaterial: calculated.rawMaterial,
          sheetPrice: calculated.sheetPrice,
          productionYield: calculated.productionYield,
          priceAvailable: true as const,
          mdfUnitCost: calculated.mdfUnitCost,
          extraCosts: calculated.extraCosts,
          extraCostsTotal: calculated.extraCostsTotal,
          productionCost: calculated.productionCost,
          pricing: calculated.pricing,
          errorCode: pricingStatusCode,
          errorMessage: pricingErrorMessage,
        });
      } catch (error) {
        if (!(error instanceof SupurgelikRawMaterialPriceMissingException)) {
          throw error;
        }
        rows.push({
          productCode: input.productCode,
          thicknessMm,
          widthMm: master.pieceWidthMm,
          lengthMm: master.pieceLengthMm,
          rawMaterial: {
            code: master.rawMaterial.code,
            thicknessMm: master.rawMaterial.thicknessMm.toString(),
            sheetWidthMm: master.rawMaterial.sheetWidthMm,
            sheetLengthMm: master.rawMaterial.sheetLengthMm,
          },
          sheetPrice: null,
          productionYield: {
            netQty: master.netQty,
            scope: 'GENERIC' as const,
            productId: null,
            productScoped: false as const,
          },
          priceAvailable: false as const,
          mdfUnitCost: null,
          extraCosts: commonExtraCosts.items,
          extraCostsTotal: commonExtraCosts.totalAmount,
          productionCost: null,
          pricing: this.missingRawMaterialPricing(
            input.productCode,
            pricing,
            decorativeRates?.get(thicknessMm) ??
              (isSupurgelikDecorativeProduct(input.productCode)
                ? this.missingDecorativeRate()
                : undefined),
            ppWrappingCost,
          ),
          errorCode: error.errorCode,
          errorMessage: error.message,
        });
      }
    }

    return {
      productGroupCode: 'SUPURGELIK',
      productGroupName: group.name,
      productCode: input.productCode,
      productName: product.name,
      asOf: now.toISOString(),
      masterCount: masters.length,
      rowCount: rows.length,
      rows,
    };
  }

  /**
   * Ayarlı Pervaz — MDF + PERVAZ ek maliyet + kâr + ROUNDUP + satır adjustment.
   * Kart: yalnız cardSaleEnabled === true satırlarda publishedCash + cardFixedSurchargeAmount.
   * KDV / mutlak PriceOverride yok. Her istekte yeniden hesaplanır.
   */
  async getAyarliPervazMdfCost(
    input: {
      productCode: string;
      thicknessMm: number;
      widthMm: number;
      lengthMm: number;
      rawMaterialCode?: string;
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

    const mainMaterial = input.rawMaterialCode
      ? await this.requireAyarliPervazMainMaterialByCode(
          input.rawMaterialCode,
          input.thicknessMm,
        )
      : await this.resolveAyarliPervazMainMaterial(
          input.thicknessMm,
          input.widthMm,
          input.lengthMm,
        );
    const mainQty = await this.pervazQtyService.resolvePervazPiece({
      productId: product.id,
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
    const cardFixedSurchargeAmount =
      resolvePervazCardFixedSurchargeAmount(productSettings);
    const cardSaleEnabled = resolveAyarliPervazCardSaleEnabled({
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
      cardFixedSurchargeAmount,
      cardSaleEnabled,
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

  /**
   * Ayarlı Pervaz doğrulanmış Excel master ölçüleri.
   * Liste ilgili ürüne ait aktif ProductionYield kayıtlarını DB'den keşfeder;
   * teorik fallback ölçüleri master yapılmadan tabloya girmez.
   */
  async getAyarliPervazMdfCosts(now: Date = new Date()) {
    const { rows: contexts } = await discoverActiveProductMasterRows(
      this.prisma,
      { productGroupCode: 'PERVAZ', productCode: 'AYARLI_PERVAZ' },
    );

    const rows = [];
    for (const row of contexts) {
      rows.push(
        await this.getAyarliPervazMdfCost(
          {
            productCode: 'AYARLI_PERVAZ',
            thicknessMm: this.requirePervazThickness(row),
            widthMm: row.widthMm,
            lengthMm: row.lengthMm,
            rawMaterialCode: row.materialCode,
          },
          now,
        ),
      );
    }

    return {
      productCode: 'AYARLI_PERVAZ',
      productName: 'Ayarlı Pervaz',
      asOf: now.toISOString(),
      verifiedMeasureCount: rows.length,
      rows,
    };
  }

  /**
   * Dekoratif Pervaz — product-scoped aktif Excel master satırları DB'den keşfedilir.
   * Hesaplar her istekte güncel MDF, PERVAZ masraf ve product kâr ayarını kullanır.
   */
  async getDekoratifPervazCosts(now: Date = new Date()) {
    const { rows: contexts } = await discoverActiveProductMasterRows(
      this.prisma,
      { productGroupCode: 'PERVAZ', productCode: 'DEKORATIF_PERVAZ' },
    );

    const rows = [];
    for (const context of contexts) {
      rows.push(
        await this.calculateDekoratifPervazRow(
          'DEKORATIF_PERVAZ',
          this.toDekoratifPervazContext(context),
          now,
        ),
      );
    }

    return {
      productCode: 'DEKORATIF_PERVAZ',
      productName: 'Dekoratif Pervaz',
      asOf: now.toISOString(),
      verifiedMeasureCount: rows.length,
      rows,
    };
  }

  /** Dekoratif Pervaz Geniş Kılçık — yalnız Excel AC96–AC97 master satırları. */
  async getDekoratifGenisKilcikCosts(now: Date = new Date()) {
    const { product, rows: contexts } = await discoverActiveProductMasterRows(
      this.prisma,
      {
        productGroupCode: 'PERVAZ',
        productCode: 'DEKORATIF_PERVAZ_GENIS_KILCIK',
      },
    );
    const rows = [];
    for (const context of contexts) {
      rows.push(
        await this.calculateDekoratifPervazRow(
          'DEKORATIF_PERVAZ_GENIS_KILCIK',
          this.toDekoratifPervazContext(context),
          now,
        ),
      );
    }
    return {
      productCode: 'DEKORATIF_PERVAZ_GENIS_KILCIK',
      productName: product.name,
      asOf: now.toISOString(),
      verifiedMeasureCount: rows.length,
      rows,
    };
  }

  private async calculateDekoratifPervazRow(
    productCode: DekoratifPervazProductCode,
    context: {
      materialCode: string;
      thicknessMm: number;
      pieceWidthMm: number;
      pieceLengthMm: number;
    },
    now: Date,
  ) {
    const group = await this.prisma.productGroup.findUnique({
      where: { code: 'PERVAZ' },
    });
    const product = group
      ? await this.prisma.product.findUnique({
          where: {
            productGroupId_code: {
              productGroupId: group.id,
              code: productCode,
            },
          },
        })
      : null;
    if (!group?.isActive || !product?.isActive) {
      throw new NotFoundException(`Aktif ürün bulunamadı: ${productCode}`);
    }

    const mainMaterial = await this.prisma.rawMaterial.findUnique({
      where: { code: context.materialCode },
      include: { prices: true },
    });
    if (!mainMaterial?.isActive) {
      throw new NotFoundException(
        `Aktif ham madde bulunamadı: ${context.materialCode}`,
      );
    }
    const mainQty = await this.pervazQtyService.resolvePervazPiece({
      productId: product.id,
      rawMaterialId: mainMaterial.id,
      sheetWidthMm: mainMaterial.sheetWidthMm,
      sheetLengthMm: mainMaterial.sheetLengthMm,
      pieceWidthMm: context.pieceWidthMm,
      pieceLengthMm: context.pieceLengthMm,
    });

    const kilcikMaterial = await this.prisma.rawMaterial.findUnique({
      where: { code: AYARLI_PERVAZ_KILCIK_MATERIAL_CODE },
      include: { prices: true },
    });
    if (!kilcikMaterial?.isActive) {
      throw new NotFoundException(
        `Aktif ham madde bulunamadı: ${AYARLI_PERVAZ_KILCIK_MATERIAL_CODE}`,
      );
    }
    const kilcikQty = await this.pervazQtyService.resolveKilcik({
      productId: product.id,
      pervazThicknessMm: context.thicknessMm,
      pieceLengthMm: context.pieceLengthMm,
      sheetWidthMm: kilcikMaterial.sheetWidthMm,
      sheetLengthMm: kilcikMaterial.sheetLengthMm,
    });
    const extraCosts = this.requirePervazExtraCosts(
      await this.extraCostsService.listForProductGroup('PERVAZ', now),
    );

    const rowExceptions = await this.prisma.pricingRowException.findMany({
      where: {
        productId: product.id,
        thicknessMm: context.thicknessMm,
        widthMm: context.pieceWidthMm,
        lengthMm: context.pieceLengthMm,
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
      productCode,
      rowExceptions,
      productSettings,
      groupSettings,
      globalSettings,
    });
    const decorativePremiumRate = resolveDekoratifPervazPremiumRate({
      now,
      rowExceptions,
    });
    const cardFixedSurchargeAmount =
      resolvePervazCardFixedSurchargeAmount(productSettings);
    const result = this.engine.calculateDekoratifPervaz({
      productCode,
      thicknessMm: context.thicknessMm,
      widthMm: context.pieceWidthMm,
      lengthMm: context.pieceLengthMm,
      mainPiece: {
        rawMaterialCode: mainMaterial.code,
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: this.requireCardSheetPrice(mainMaterial, now),
        netQty: mainQty.netQty,
        yieldSource: mainQty.source,
      },
      kilcik: {
        rawMaterialCode: kilcikMaterial.code,
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: this.requireCardSheetPrice(kilcikMaterial, now),
        netQty: kilcikQty.netQty,
        yieldSource: kilcikQty.source,
      },
      extraCosts,
      profitRate: resolvedProfit.profitRate,
      decorativePremiumRate,
      cardFixedSurchargeAmount,
    });

    return {
      productGroupCode: 'PERVAZ',
      productGroupName: group.name,
      priceType: MaterialPriceType.CARD_INSTALLMENT,
      asOf: now.toISOString(),
      ...result,
      pricing: {
        ...result.pricing,
        profitRateSource: resolvedProfit.source,
      },
    };
  }

  private requirePervazThickness(row: ActiveProductMasterRow): number {
    const thicknessMm = Number(row.thicknessMm);
    if (!Number.isInteger(thicknessMm) || thicknessMm <= 0) {
      throw new BadRequestException(
        `${row.materialCode} için Pervaz kalınlığı pozitif tam mm olmalıdır.`,
      );
    }
    return thicknessMm;
  }

  private toDekoratifPervazContext(row: ActiveProductMasterRow) {
    return {
      materialCode: row.materialCode,
      thicknessMm: this.requirePervazThickness(row),
      pieceWidthMm: row.widthMm,
      pieceLengthMm: row.lengthMm,
    };
  }

  private async requireAyarliPervazMainMaterialByCode(
    code: string,
    thicknessMm: number,
  ) {
    const material = await this.prisma.rawMaterial.findUnique({
      where: { code },
      include: { prices: true },
    });
    if (!material?.isActive) {
      throw new NotFoundException(`Aktif ham madde bulunamadı: ${code}`);
    }
    if (Number(material.thicknessMm) !== thicknessMm) {
      throw new BadRequestException(
        `${code} kalınlığı ${material.thicknessMm} mm; beklenen ${thicknessMm} mm.`,
      );
    }
    return material;
  }

  private async resolveAyarliPervazMainMaterial(
    thicknessMm: number,
    widthMm: number,
    lengthMm: number,
  ) {
    const yields = await this.prisma.productionYield.findMany({
      where: {
        productId: null,
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

  private async resolveSupurgelikExtraCosts(
    now: Date,
  ): Promise<SupurgelikExtraCostContext> {
    const list = await this.extraCostsService.listForProductGroup('SUPURGELIK', now);
    const byCode = new Map(list.items.map((item) => [item.typeCode, item]));
    const items = SUPURGELIK_EXTRA_COST_TYPE_ORDER.map((code) => {
      const item = byCode.get(code);
      if (item?.amount == null) {
        throw new NotFoundException(
          `Süpürgelik için şu an geçerli ortak ek maliyet bulunamadı: ${code}`,
        );
      }
      return {
        code: item.typeCode,
        name: item.typeName,
        amount: item.amount,
      };
    });

    return { items, totalAmount: list.totalAmount };
  }

  private async resolveSupurgelikDuzPricing(
    productGroupId: string,
  ): Promise<SupurgelikDuzPricingContext> {
    const settings = await this.prisma.pricingSetting.findMany({
      where: {
        productGroupId,
        productId: null,
        isActive: true,
      },
    });
    if (settings.length > 1) {
      throw new BadRequestException(
        'SUPURGELIK için birden fazla aktif group-scope PricingSetting bulundu.',
      );
    }
    const setting = settings[0];
    if (setting?.profitRate == null) {
      throw new NotFoundException(
        'SUPURGELIK için aktif group-scope profitRate bulunamadı.',
      );
    }

    const profitRate = toDecimal(setting.profitRate.toString());
    if (profitRate.isNegative()) {
      throw new BadRequestException('SUPURGELIK profitRate negatif olamaz.');
    }
    return {
      profitRate: profitRate.toFixed(),
      source: 'GROUP_PRICING_SETTING',
    };
  }

  private async resolveSupurgelikDecorativeRates(
    productGroupId: string,
    now: Date,
  ): Promise<SupurgelikDecorativeRateMap> {
    const rows = await this.prisma.pricingThicknessModifier.findMany({
      where: {
        productGroupId,
        modifierType: PricingModifierType.DECORATIVE,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const byThickness: SupurgelikDecorativeRateMap = new Map();
    for (const row of rows) {
      if (byThickness.has(row.thicknessMm)) {
        throw new BadRequestException(
          `SUPURGELIK ${row.thicknessMm} mm için birden fazla geçerli dekoratif oran bulundu.`,
        );
      }
      const rate = toDecimal(row.rate.toString());
      if (rate.isNegative()) {
        throw new BadRequestException(
          `SUPURGELIK ${row.thicknessMm} mm dekoratif oranı negatif olamaz.`,
        );
      }
      byThickness.set(row.thicknessMm, {
        decorativeRate: rate.toFixed(),
        decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
      });
    }
    return byThickness;
  }

  private missingDecorativeRate(): SupurgelikDecorativeRateContext {
    return {
      decorativeRate: null,
      decorativeRateSource: null,
    };
  }

  private async resolveSupurgelikPpWrappingCost(now: Date): Promise<string | null> {
    const wrapping = await this.extraCostsService.getSupurgelikPpWrapping(now);
    return wrapping.items[0]?.amount ?? null;
  }

  private missingRawMaterialPricing(
    productCode: SupurgelikProductCode,
    pricing: SupurgelikDuzPricingContext,
    decorativeRate: SupurgelikDecorativeRateContext | undefined,
    ppWrappingCost: string | null | undefined,
  ) {
    const ppFields = isSupurgelikPpProduct(productCode)
      ? {
          baseProductionCost: null,
          ppWrappingCost: ppWrappingCost ?? null,
          ppProductionCost: null,
        }
      : {};

    if (isSupurgelikDecorativeProduct(productCode)) {
      return {
        ...pricing,
        ...ppFields,
        ...(decorativeRate ?? this.missingDecorativeRate()),
        profitAmount: null,
        priceBeforeRounding: null,
        roundedBaseSalePrice: null,
        basePublishedCashPrice: null,
        decorativeAmount: null,
        priceBeforeDecorativeRounding: null,
        publishedCashPrice: null,
        statusCode: decorativeRate?.decorativeRate == null
          ? SUPURGELIK_DECORATIVE_RATE_MISSING
          : null,
      };
    }

    return {
      ...pricing,
      ...ppFields,
      profitAmount: null,
      priceBeforeRounding: null,
      roundedBaseSalePrice: null,
      publishedCashPrice: null,
    };
  }
}
