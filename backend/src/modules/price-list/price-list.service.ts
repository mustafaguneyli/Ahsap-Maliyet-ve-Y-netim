import { HttpException, Injectable } from '@nestjs/common';
import { CalculatorType, MaterialPriceType } from '@prisma/client';
import { SUPURGELIK_PRODUCT_CODES } from '../../calculation-engine/calculators/supurgelik-mdf-calculator';
import type { DoorFrameVariantCode } from '../../calculation-engine/calculators/door-frame-variants';
import { CitaListService } from '../cost-calculation/cita-list.service';
import { CostCalculationService } from '../cost-calculation/cost-calculation.service';
import { GenericRecipeService } from '../cost-calculation/generic-recipe.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FALLBACK_CARD_REASON,
  FALLBACK_SALE_REASON,
  toMissingReasons,
} from './price-list-missing-reasons';
import type {
  PriceListChannelStatus,
  PriceListDocument,
  PriceListGroup,
  PriceListProduct,
  PriceListRow,
  PriceListSubsection,
} from './price-list.types';

const SPECIAL_GROUP_ORDER = ['door_frame', 'PERVAZ', 'SUPURGELIK', 'CITA'] as const;
const DOOR_FRAME_VARIANTS: DoorFrameVariantCode[] = ['34_MM', '30_MM'];
const PERVAZ_PRODUCTS = [
  { code: 'AYARLI_PERVAZ' as const, name: 'Ayarlı Pervaz' },
  { code: 'DEKORATIF_PERVAZ' as const, name: 'Dekoratif Pervaz' },
  { code: 'DEKORATIF_PERVAZ_GENIS_KILCIK' as const, name: 'Dekoratif Geniş Kılçık' },
];

const SALE_MATERIAL_PRICE_TYPE: MaterialPriceType = MaterialPriceType.CARD_INSTALLMENT;

type SizeIdIndex = Map<string, string>;

@Injectable()
export class PriceListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costCalculationService: CostCalculationService,
    private readonly citaListService: CitaListService,
    private readonly genericRecipeService: GenericRecipeService,
  ) {}

  /**
   * Satış fiyatı listesi. Kendi formülü yoktur; mevcut calculator listelerini okur.
   */
  async getPriceList(now: Date = new Date()): Promise<PriceListDocument> {
    const [groups, sizeIds] = await Promise.all([
      this.prisma.productGroup.findMany({
        where: { isActive: true },
        include: {
          products: {
            where: { isActive: true },
            orderBy: { name: 'asc' },
            select: { id: true, code: true, name: true, isActive: true },
          },
        },
      }),
      this.loadSizeIds(),
    ]);

    const ordered = [...groups].sort(compareGroups);
    const sections: PriceListGroup[] = [];
    for (const group of ordered) {
      if (group.calculatorType === CalculatorType.DOOR_BUILD) {
        continue;
      }
      sections.push(await this.mapGroup(group, now, sizeIds));
    }

    return {
      companyName: 'ZİRVE AHŞAP',
      title: 'ÜRÜN FİYAT LİSTESİ',
      asOf: now.toISOString(),
      groups: sections,
      rowCount: sections.reduce((sum, group) => sum + group.rowCount, 0),
      missingCount: sections.reduce((sum, group) => sum + group.missingCount, 0),
    };
  }

  private async loadSizeIds(): Promise<SizeIdIndex> {
    const sizes = await this.prisma.productSize.findMany({
      select: { id: true, widthMm: true, lengthMm: true },
    });
    return new Map(
      sizes.map((size) => [`${size.widthMm}x${size.lengthMm}`, size.id]),
    );
  }

  private async mapGroup(
    group: {
      code: string;
      name: string;
      calculatorType: CalculatorType;
      products: Array<{ id: string; code: string; name: string; isActive: boolean }>;
    },
    now: Date,
    sizeIds: SizeIdIndex,
  ): Promise<PriceListGroup> {
    try {
      if (group.calculatorType === CalculatorType.DOOR_FRAME) {
        return this.summarizeGroup(group, await this.mapDoorFrame(group, now));
      }
      if (group.calculatorType === CalculatorType.PERVAZ) {
        return this.summarizeGroup(
          group,
          await this.mapPervaz(group, now, sizeIds),
        );
      }
      if (group.calculatorType === CalculatorType.SUPURGELIK) {
        return this.summarizeGroup(
          group,
          await this.mapSupurgelik(group, now, sizeIds),
        );
      }
      if (group.calculatorType === CalculatorType.CITA) {
        return this.summarizeGroup(
          group,
          await this.mapCita(group, now, sizeIds),
        );
      }
      if (group.calculatorType === CalculatorType.GENERIC_RECIPE) {
        return this.summarizeGroup(group, await this.mapGeneric(group, now));
      }
      return this.summarizeGroup(group, []);
    } catch (error) {
      return {
        productGroupCode: group.code,
        productGroupName: group.name,
        calculatorType: group.calculatorType,
        products: [],
        rowCount: 0,
        missingCount: 0,
        groupError: nestMessage(error),
      };
    }
  }

  private summarizeGroup(
    group: { code: string; name: string; calculatorType: CalculatorType },
    products: PriceListProduct[],
  ): PriceListGroup {
    const rows = products.flatMap((product) =>
      product.subsections.flatMap((section) => section.rows),
    );
    return {
      productGroupCode: group.code,
      productGroupName: group.name,
      calculatorType: group.calculatorType,
      products,
      rowCount: rows.length,
      missingCount: rows.filter((row) => row.status === 'MISSING_SOURCE').length,
      groupError: null,
    };
  }

  private async mapDoorFrame(
    group: {
      products: Array<{ id: string; code: string; name: string }>;
    },
    now: Date,
  ): Promise<PriceListProduct[]> {
    const products: PriceListProduct[] = [];
    for (const variant of DOOR_FRAME_VARIANTS) {
      const product = group.products.find((item) => item.code === variant);
      if (!product) continue;
      const list = await this.costCalculationService.getDoorFrameMdfCosts(
        variant,
        now,
        SALE_MATERIAL_PRICE_TYPE,
      );
      products.push({
        productCode: product.code,
        productName: product.name,
        subsections: [
          {
            title: product.name,
            rows: list.rows.map((row) =>
              this.row({
                productId: product.id,
                productCode: product.code,
                productSizeId:
                  'productSizeId' in row
                    ? ((row as { productSizeId?: string | null }).productSizeId ??
                      null)
                    : null,
                displayName: `${row.displayName} cm`,
                profitRate: row.pricing.profitRate ?? null,
                cashSalePrice:
                  row.pricing.publishedCashPrice ?? row.pricing.cashSalePrice,
                cardSalePrice:
                  row.pricing.publishedCardPrice ?? row.pricing.cardSalePrice,
                cashSources: optionalCodes(row.pricing, ['statusCode', 'statusMessage']),
                cardSources: [
                  row.pricing.cardStatusCode,
                  row.pricing.cardStatusMessage,
                ],
              }),
            ),
          },
        ],
      });
    }
    return products;
  }

  private async mapPervaz(
    group: {
      products: Array<{ id: string; code: string; name: string }>;
    },
    now: Date,
    sizeIds: SizeIdIndex,
  ): Promise<PriceListProduct[]> {
    const products: PriceListProduct[] = [];
    for (const spec of PERVAZ_PRODUCTS) {
      const product = group.products.find((item) => item.code === spec.code);
      if (!product) continue;
      const list =
        spec.code === 'AYARLI_PERVAZ'
          ? await this.costCalculationService.getAyarliPervazMdfCosts(
              now,
              SALE_MATERIAL_PRICE_TYPE,
            )
          : spec.code === 'DEKORATIF_PERVAZ'
            ? await this.costCalculationService.getDekoratifPervazCosts(
                now,
                SALE_MATERIAL_PRICE_TYPE,
              )
            : await this.costCalculationService.getDekoratifGenisKilcikCosts(
                now,
                SALE_MATERIAL_PRICE_TYPE,
              );
      products.push({
        productCode: product.code,
        productName: product.name || spec.name,
        subsections: [
          {
            title: product.name || spec.name,
            rows: list.rows.map((row) =>
              this.row({
                productId: product.id,
                productCode: product.code,
                productSizeId:
                  sizeIds.get(`${row.widthMm}x${row.lengthMm}`) ?? null,
                displayName: `${formatSizeCm(row.widthMm, row.lengthMm)}`,
                thicknessLabel: `${row.thicknessMm} mm`,
                profitRate: row.pricing.profitRate ?? null,
                cashSalePrice: row.pricing.publishedSalePrice,
                cardSalePrice: row.pricing.cardSalePrice,
                cashSources: optionalCodes(row.pricing, ['statusCode', 'statusMessage']),
                cardSources: [
                  row.pricing.cardStatusCode,
                  row.pricing.cardStatusMessage,
                ],
              }),
            ),
          },
        ],
      });
    }
    return products;
  }

  private async mapSupurgelik(
    group: {
      products: Array<{ id: string; code: string; name: string }>;
    },
    now: Date,
    sizeIds: SizeIdIndex,
  ): Promise<PriceListProduct[]> {
    const products: PriceListProduct[] = [];
    for (const code of SUPURGELIK_PRODUCT_CODES) {
      const product = group.products.find((item) => item.code === code);
      if (!product) continue;
      const list = await this.costCalculationService.getSupurgelikMdfCosts(
        {
          productCode: code,
          materialPriceType: SALE_MATERIAL_PRICE_TYPE,
        },
        now,
      );
      products.push({
        productCode: product.code,
        productName: product.name,
        subsections: [
          {
            title: product.name,
            rows: list.rows.map((row) => {
              const pricing = row.pricing as {
                publishedCashPrice?: string | null;
                publishedCardPrice?: string | null;
                profitRate?: string | null;
                statusCode?: string | null;
                cardStatusCode?: string | null;
                cardStatusMessage?: string | null;
              } | null;
              const cashSalePrice =
                row.priceAvailable === false
                  ? null
                  : (pricing?.publishedCashPrice ?? null);
              return this.row({
                productId: product.id,
                productCode: product.code,
                productSizeId:
                  sizeIds.get(`${row.widthMm}x${row.lengthMm}`) ?? null,
                displayName: formatSizeCm(row.widthMm, row.lengthMm),
                thicknessLabel: `${row.thicknessMm} mm`,
                profitRate: pricing?.profitRate ?? null,
                cashSalePrice,
                cardSalePrice:
                  cashSalePrice == null
                    ? null
                    : (pricing?.publishedCardPrice ?? null),
                cashSources: [
                  row.errorCode,
                  row.errorMessage,
                  pricing?.statusCode,
                ],
                cardSources: [
                  pricing?.cardStatusCode,
                  pricing?.cardStatusMessage,
                ],
              });
            }),
          },
        ],
      });
    }
    return products;
  }

  private async mapCita(
    group: {
      products: Array<{ id: string; code: string; name: string }>;
    },
    now: Date,
    sizeIds: SizeIdIndex,
  ): Promise<PriceListProduct[]> {
    const product = group.products.find((item) => item.code === 'CITA') ?? group.products[0];
    if (!product) return [];
    const list = await this.citaListService.listProductionCosts(
      now,
      SALE_MATERIAL_PRICE_TYPE,
    );
    const byThickness = new Map<string, PriceListRow[]>();
    for (const row of list.rows) {
      const key = row.thicknessMm;
      const published = row.pricing?.pricingAvailable === true;
      const cashSalePrice = published
        ? (row.pricing.publishedCashPrice ?? null)
        : null;
      const cardSalePrice = published
        ? (row.pricing.publishedCardPrice ?? null)
        : null;
      const mapped = this.row({
        productId: product.id,
        productCode: product.code,
        productSizeId:
          sizeIds.get(`${Number(row.widthMm)}x${Number(row.lengthMm)}`) ?? null,
        displayName: formatCitaSize(row.widthMm, row.lengthMm),
        thicknessLabel: `${stripTrailingZeros(row.thicknessMm)} mm`,
        profitRate: row.pricing?.profitRate ?? null,
        cashSalePrice,
        cardSalePrice,
        cashSources: published
          ? []
          : [
              row.pricing?.statusCode,
              'statusCode' in row ? row.statusCode : null,
              'CITA_PUBLISHED_PRICE_MISSING',
            ],
        cardSources: [
          row.pricing?.cardStatusCode,
          row.pricing?.cardStatusMessage,
        ],
      });
      const bucket = byThickness.get(key) ?? [];
      bucket.push(mapped);
      byThickness.set(key, bucket);
    }
    const subsections: PriceListSubsection[] = [...byThickness.entries()]
      .sort((left, right) => Number(left[0]) - Number(right[0]))
      .map(([thicknessMm, rows]) => ({
        title: `${stripTrailingZeros(thicknessMm)} mm`,
        rows,
      }));
    return [
      {
        productCode: product.code,
        productName: product.name,
        subsections,
      },
    ];
  }

  private async mapGeneric(
    group: { code: string; name: string },
    now: Date,
  ): Promise<PriceListProduct[]> {
    const list = await this.genericRecipeService.listCostRows(
      group.code,
      SALE_MATERIAL_PRICE_TYPE,
      now,
    );
    const byProduct = new Map<string, PriceListProduct>();
    for (const row of list.rows) {
      const cashSalePrice =
        row.status === 'OK' ? (row.pricing?.cashSalePrice ?? null) : null;
      const mapped = this.row({
        productId: row.productId ?? null,
        productCode: row.productCode,
        productSizeId: row.sizeId ?? null,
        displayName: row.displayName || formatSizeCm(row.widthMm, row.lengthMm),
        profitRate: row.pricing?.profitRate ?? null,
        cashSalePrice,
        cardSalePrice:
          cashSalePrice == null ? null : (row.pricing?.cardSalePrice ?? null),
        cashSources: [
          ...(row.missingSources ?? []),
          ...(row.status === 'OK' && cashSalePrice == null
            ? ['PROFIT_RATE_MISSING', ...((row as { warnings?: string[] }).warnings ?? [])]
            : []),
        ],
        cardSources: [
          row.pricing?.cardStatusCode,
          row.pricing?.cardStatusMessage,
        ],
      });
      const existing = byProduct.get(row.productCode);
      if (existing) {
        existing.subsections[0].rows.push(mapped);
        continue;
      }
      byProduct.set(row.productCode, {
        productCode: row.productCode,
        productName: row.productName,
        subsections: [{ title: row.productName, rows: [mapped] }],
      });
    }
    return [...byProduct.values()];
  }

  private row(input: {
    productId: string | null;
    productCode: string;
    productSizeId: string | null;
    displayName: string;
    thicknessLabel?: string | null;
    profitRate: string | null;
    cashSalePrice: string | null;
    cardSalePrice: string | null;
    cashSources?: Array<string | null | undefined>;
    cardSources?: Array<string | null | undefined>;
  }): PriceListRow {
    const cashOk = isPositiveMoney(input.cashSalePrice);
    const cardOk = isPositiveMoney(input.cardSalePrice);
    const cashMissingReasons = cashOk
      ? []
      : withFallback(toMissingReasons(input.cashSources ?? []), FALLBACK_SALE_REASON);
    const cardMissingReasons = cardOk
      ? []
      : withFallback(
          toMissingReasons([
            ...(cashOk ? [] : cashMissingReasons),
            ...(input.cardSources ?? []),
          ]),
          cashOk ? FALLBACK_CARD_REASON : FALLBACK_SALE_REASON,
        );
    const cashStatus: PriceListChannelStatus = cashOk
      ? 'CALCULATED'
      : 'MISSING_SOURCE';
    const cardStatus: PriceListChannelStatus = cardOk
      ? 'CALCULATED'
      : 'MISSING_SOURCE';
    return {
      productId: input.productId,
      productCode: input.productCode,
      productSizeId: input.productSizeId,
      displayName: input.displayName,
      thicknessLabel: input.thicknessLabel ?? null,
      profitRate: input.profitRate,
      cashSalePrice: cashOk ? input.cashSalePrice : null,
      cardSalePrice: cardOk ? input.cardSalePrice : null,
      cashStatus,
      cardStatus,
      cashMissingReasons,
      cardMissingReasons,
      status: cashStatus,
      missingReasons: cashMissingReasons,
    };
  }
}

function optionalCodes(
  obj: object | null | undefined,
  keys: string[],
): Array<string | null> {
  if (obj == null) return [];
  const rec = obj as Record<string, unknown>;
  return keys.map((key) => (typeof rec[key] === 'string' ? rec[key] : null));
}

function withFallback(reasons: string[], fallback: string): string[] {
  return reasons.length > 0 ? reasons : [fallback];
}

function compareGroups(
  left: { code: string; name: string },
  right: { code: string; name: string },
): number {
  const leftIdx = SPECIAL_GROUP_ORDER.indexOf(
    left.code as (typeof SPECIAL_GROUP_ORDER)[number],
  );
  const rightIdx = SPECIAL_GROUP_ORDER.indexOf(
    right.code as (typeof SPECIAL_GROUP_ORDER)[number],
  );
  if (leftIdx !== -1 || rightIdx !== -1) {
    return (leftIdx === -1 ? 99 : leftIdx) - (rightIdx === -1 ? 99 : rightIdx);
  }
  return left.name.localeCompare(right.name, 'tr');
}

function formatSizeCm(widthMm: number, lengthMm: number): string {
  return `${formatMmAsCm(widthMm)}×${formatMmAsCm(lengthMm)} cm`;
}

function formatCitaSize(widthMm: string, lengthMm: string): string {
  return `${formatMmAsCm(Number(widthMm))}×${formatMmAsCm(Number(lengthMm))} cm`;
}

function formatMmAsCm(mm: number): string {
  const whole = String(Math.trunc(mm));
  if (whole.length === 1) {
    return `0,${whole}`.replace(/,0$/, '0');
  }
  const cmWhole = whole.slice(0, -1).replace(/^0+(?=\d)/, '') || '0';
  const cmFrac = whole.slice(-1);
  return cmFrac === '0' ? cmWhole : `${cmWhole},${cmFrac}`;
}

function stripTrailingZeros(value: string): string {
  return value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function isPositiveMoney(value: string | null | undefined): value is string {
  if (value == null || value === '') return false;
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && value !== '0' && !value.startsWith('0.00');
}

function nestMessage(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'string') return body;
    if (typeof body === 'object' && body && 'message' in body) {
      const message = (body as { message: string | string[] }).message;
      return Array.isArray(message) ? message.join(' ') : String(message);
    }
  }
  if (error instanceof Error) return error.message;
  return FALLBACK_SALE_REASON;
}
