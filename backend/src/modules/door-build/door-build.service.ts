import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MaterialPriceType } from '@prisma/client';
import {
  buildDoorBuildMaterialPreview,
  calculateDoorBuildQuote,
  DOOR_BUILD_FRAME_QUANTITY_INVALID_MESSAGE,
  DOOR_BUILD_FRAME_QUANTITY_REQUIRED_MESSAGE,
  DOOR_BUILD_MANUAL_COST_LABELS,
  DOOR_BUILD_SIDE_TRIM_PIECES_PER_DOOR,
  DOOR_FRAME_BUSINESS_BOY_NOTE,
  DOOR_FRAME_CATALOG_UNIT_MEANING,
  assertNoPriceLeakage,
  type DoorBuildManualCostLineInput,
  type DoorBuildMaterialDraftLine,
} from '../../calculation-engine/calculators/door-build-quote';
import { calculateDoorBuildSalePrice } from '../../calculation-engine/calculators/door-build-sale';
import {
  DOOR_LEAF_VERIFIED_SHEET_LENGTH_MM,
  DOOR_LEAF_VERIFIED_SHEET_WIDTH_MM,
} from '../../calculation-engine/calculators/door-leaf-surface-yield';
import type { DoorFrameVariantCode } from '../../calculation-engine/calculators/door-frame-variants';
import { toDecimal } from '../../common/decimal/decimal.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CostCalculationService } from '../cost-calculation/cost-calculation.service';
import { selectCurrentMaterialPrice } from '../cost-calculation/current-material-price';
import { sameMm } from '../cost-calculation/order-quote';
import {
  buildDoorBuildOrderUpsert,
  buildDoorBuildWorkshopPreview,
} from './door-build-order-transfer';
import type {
  DoorBuildFrameSelectionDto,
  DoorBuildHeaderSelectionDto,
  DoorBuildOrderTransferDto,
  DoorBuildPervazSelectionDto,
  DoorBuildQuoteDto,
} from './dto/door-build-quote.dto';

function normalizeAmount(raw: string): string {
  return raw.replace(',', '.');
}

function materialPriceTypeLabel(value: MaterialPriceType): string {
  return value === MaterialPriceType.CASH
    ? 'Nakit (Peşin Alış)'
    : 'Kart / Taksitli Alış';
}

const PERVAZ_LABELS: Record<string, string> = {
  AYARLI_PERVAZ: 'Ayarlı Pervaz',
  DEKORATIF_PERVAZ: 'Dekoratif Pervaz',
  DEKORATIF_PERVAZ_GENIS_KILCIK: 'Dekoratif Geniş Kılçık',
};

const FRAME_LABELS: Record<string, string> = {
  '34_MM': '34 MM MDF Kasa',
  '30_MM': '30 MM MDF Kasa',
};

@Injectable()
export class DoorBuildService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costCalculationService: CostCalculationService,
  ) {}

  async quote(dto: DoorBuildQuoteDto, now: Date = new Date()) {
    const materialPriceType =
      dto.materialPriceType ?? MaterialPriceType.CARD_INSTALLMENT;

    const material = await this.prisma.rawMaterial.findFirst({
      where: { id: dto.surfaceRawMaterialId, isActive: true },
      include: {
        prices: {
          where: { isActive: true },
          orderBy: { effectiveFrom: 'desc' },
        },
      },
    });

    if (!material) {
      throw new NotFoundException('Seçilen MDF bulunamadı veya pasif.');
    }

    if (
      material.sheetWidthMm !== DOOR_LEAF_VERIFIED_SHEET_WIDTH_MM ||
      material.sheetLengthMm !== DOOR_LEAF_VERIFIED_SHEET_LENGTH_MM
    ) {
      throw new BadRequestException(
        `Bu aşamada yalnız ${DOOR_LEAF_VERIFIED_SHEET_WIDTH_MM}×${DOOR_LEAF_VERIFIED_SHEET_LENGTH_MM} mm tabakalar desteklenir. Seçilen malzeme: ${material.sheetWidthMm}×${material.sheetLengthMm} mm.`,
      );
    }

    const currentPrice = selectCurrentMaterialPrice(
      material.prices,
      materialPriceType,
      now,
    );
    if (!currentPrice) {
      const kind =
        materialPriceType === MaterialPriceType.CASH
          ? 'nakit alış fiyatı'
          : 'kart/taksitli alış fiyatı';
      throw new BadRequestException(
        `${material.name} için aktif ${kind} tanımlı değil. Diğer alış türüne geçilmez.`,
      );
    }

    if (dto.header && dto.manualCostLines.some((l) => l.code === 'UZUN_BASLIK' && l.included)) {
      throw new BadRequestException(
        'Katalog başlığı seçiliyken Uzun Başlık manuel gideri aynı anda eklenemez. Çift maliyet oluşmasın diye birini kaldırın.',
      );
    }

    let manualCostLines: DoorBuildManualCostLineInput[] =
      dto.manualCostLines.map((line) => ({
        code: line.code,
        included: line.included,
        amount:
          line.included && line.amount != null
            ? normalizeAmount(line.amount)
            : null,
        scope: line.scope,
      }));

    const frameResolved = dto.frame
      ? await this.resolveFrame(dto.frame, materialPriceType, now)
      : null;
    const sideResolved = dto.sideTrims
      ? await this.resolvePervazComponent(
          {
            ...dto.sideTrims,
            // Normal yan pervaz: kullanıcı adedi yok sayılır; doğrulanmış 4/kapı.
            piecesPerDoor: DOOR_BUILD_SIDE_TRIM_PIECES_PER_DOOR,
          },
          materialPriceType,
          now,
          'Yan pervaz',
        )
      : null;
    const headerResolved = dto.header
      ? await this.resolvePervazComponent(
          {
            ...dto.header,
            piecesPerDoor: 1,
          },
          materialPriceType,
          now,
          'Başlık',
        )
      : null;

    if (dto.frame) {
      const totalBoyRaw = dto.frame.totalBoyQuantity;
      if (totalBoyRaw == null || String(totalBoyRaw).trim() === '') {
        throw new BadRequestException(DOOR_BUILD_FRAME_QUANTITY_REQUIRED_MESSAGE);
      }
      const totalBoy = toDecimal(normalizeAmount(totalBoyRaw));
      if (!totalBoy.isFinite() || totalBoy.lte(0)) {
        throw new BadRequestException(DOOR_BUILD_FRAME_QUANTITY_INVALID_MESSAGE);
      }
    }

    let calc;
    try {
      calc = calculateDoorBuildQuote({
        doorHeightMm: dto.doorHeightMm,
        doorWidthMm: dto.doorWidthMm,
        quantity: dto.quantity,
        sheetPrice: currentPrice.price.toString(),
        manualCostLines,
        frame: frameResolved?.cost ?? null,
        frameUnresolvedMessage: frameResolved?.unresolvedMessage ?? null,
        sideTrims: sideResolved?.cost ?? null,
        sideTrimsUnresolvedMessage: sideResolved?.unresolvedMessage ?? null,
        header: headerResolved?.cost ?? null,
        headerUnresolvedMessage: headerResolved?.unresolvedMessage ?? null,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Kapı imalatı hesabı yapılamadı.',
      );
    }

    const thicknessMm = material.thicknessMm.toString();
    const doorSizeLabelCm =
      calc.surface?.rule.sizeLabelCm ??
      `${dto.doorHeightMm / 10} × ${dto.doorWidthMm / 10}`;
    const materialPreview =
      calc.surface != null
        ? buildDoorBuildMaterialPreview({
            rule: calc.surface.rule,
            quantity: calc.surface.quantity,
            totalFaces: calc.surface.totalFaces,
            requiredFullSheets: calc.surface.requiredFullSheets,
            rawMaterial: {
              id: material.id,
              code: material.code,
              name: material.name,
              thicknessMm,
              sheetWidthMm: material.sheetWidthMm,
              sheetLengthMm: material.sheetLengthMm,
              surfaceType: material.surfaceType,
            },
          })
        : null;

    const materialDraft = this.buildMaterialDraft({
      calc,
      dto,
      material: {
        id: material.id,
        code: material.code,
        name: material.name,
        thicknessMm,
        sheetWidthMm: material.sheetWidthMm,
        sheetLengthMm: material.sheetLengthMm,
        surfaceType: material.surfaceType,
      },
      frameMeta: frameResolved,
      sideMeta: sideResolved,
      headerMeta: headerResolved,
    });
    assertNoPriceLeakage(materialDraft);

    const sale = calculateDoorBuildSalePrice({
      productionBase: calc.widthAdjustedSubtotal,
      profitRate: dto.profitRate,
      vatRate: dto.vatRate,
      cardMarkupRate: dto.cardMarkupRate,
    });

    const phaseNote =
      sale.status === 'COMPUTED'
        ? 'Katsayı sonrası üretim maliyeti üzerinden kâr ve KDV ile nakit/kart satış önerisi hesaplandı. Sipariş birim fiyatı kullanıcı seçimine göre snapshot olur.'
        : calc.allSelectedComponentsResolved
          ? 'Katsayı sonrası üretim maliyeti hazır. Nihai satış için kâr ve KDV oranlarını girin.'
          : 'Bazı bileşenlerin maliyet kaynağı eksik veya doğrulanmadı. Hesaplanan parçalar gösterilir; sonuç nihai kapı maliyeti değildir.';

    const totalBoyQuantity = dto.frame
      ? normalizeAmount(dto.frame.totalBoyQuantity)
      : null;
    const frameLineTotal =
      calc.frame.status === 'RESOLVED' ? calc.frame.lineTotal : null;

    return {
      doorHeightMm: dto.doorHeightMm,
      doorWidthMm: dto.doorWidthMm,
      doorSizeLabelCm,
      quantity: dto.quantity,
      materialPriceType,
      materialPriceTypeLabel: materialPriceTypeLabel(materialPriceType),
      rawMaterial: {
        id: material.id,
        code: material.code,
        name: material.name,
        thicknessMm,
        sheetWidthMm: material.sheetWidthMm,
        sheetLengthMm: material.sheetLengthMm,
        surfaceType: material.surfaceType,
      },
      sheetPrice: calc.sheetPrice,
      surfaceStatus: calc.surfaceStatus,
      surfaceMessage: calc.surfaceMessage,
      facesPerSheet: calc.surface?.rule.facesPerSheet ?? null,
      facesPerDoor: calc.surface?.rule.facesPerDoor ?? null,
      theoreticalSheetsPerDoor: calc.surface?.theoreticalSheetsPerDoor ?? null,
      unitMdfSurfaceCost: calc.unitMdfSurfaceCost,
      totalFaces: calc.surface?.totalFaces ?? null,
      requiredFullSheets: calc.surface?.requiredFullSheets ?? null,
      unusedFaces: calc.surface?.unusedFaces ?? null,
      totalAllocatedMdfCost: calc.totalAllocatedMdfCost,
      catalogNote: null,
      frame: {
        ...calc.frame,
        businessBoyNote: DOOR_FRAME_BUSINESS_BOY_NOTE,
        unitMeaning: DOOR_FRAME_CATALOG_UNIT_MEANING,
        selection: dto.frame
          ? {
              productCode: dto.frame.productCode,
              productName: FRAME_LABELS[dto.frame.productCode],
              widthMm: dto.frame.widthMm,
              lengthMm: dto.frame.lengthMm,
              sizeLabelCm: `${dto.frame.widthMm / 10}×${dto.frame.lengthMm / 10}`,
              totalBoyQuantity,
              unitMeaning: DOOR_FRAME_CATALOG_UNIT_MEANING,
              businessBoyNote: DOOR_FRAME_BUSINESS_BOY_NOTE,
            }
          : null,
        displayName: frameResolved?.displayName ?? null,
        selectedProduct: dto.frame
          ? {
              productCode: dto.frame.productCode,
              productName: FRAME_LABELS[dto.frame.productCode],
            }
          : null,
        selectedSize: dto.frame
          ? {
              widthMm: dto.frame.widthMm,
              lengthMm: dto.frame.lengthMm,
              sizeLabelCm: `${dto.frame.widthMm / 10}×${dto.frame.lengthMm / 10}`,
            }
          : null,
        totalBoyQuantity,
        unitProductionCost:
          calc.frame.status === 'RESOLVED'
            ? calc.frame.unitProductionCost
            : null,
        totalCost: frameLineTotal,
        costPerDoor: null,
        boyQuantityPerDoor: null,
        fullBoyQuantityPerDoor: null,
        halfBoyQuantityPerDoor: null,
        fullBoyPrice: null,
        halfBoyPrice: null,
        pricePerBoy: null,
        ruleSource: null,
      },
      sideTrims: {
        ...calc.sideTrims,
        selection: dto.sideTrims
          ? {
              productCode: dto.sideTrims.productCode,
              productName: PERVAZ_LABELS[dto.sideTrims.productCode],
              thicknessMm: dto.sideTrims.thicknessMm,
              widthMm: dto.sideTrims.widthMm,
              lengthMm: dto.sideTrims.lengthMm,
              piecesPerDoor: DOOR_BUILD_SIDE_TRIM_PIECES_PER_DOOR,
            }
          : null,
        displayName: sideResolved?.displayName ?? null,
        piecesPerDoor: dto.sideTrims
          ? DOOR_BUILD_SIDE_TRIM_PIECES_PER_DOOR
          : null,
        totalPieces: dto.sideTrims
          ? String(DOOR_BUILD_SIDE_TRIM_PIECES_PER_DOOR * dto.quantity)
          : null,
      },
      header: {
        ...calc.header,
        selection: dto.header
          ? {
              productCode: dto.header.productCode,
              productName: PERVAZ_LABELS[dto.header.productCode],
              thicknessMm: dto.header.thicknessMm,
              widthMm: dto.header.widthMm,
              lengthMm: dto.header.lengthMm,
              piecesPerDoor: 1,
            }
          : null,
        displayName: headerResolved?.displayName ?? null,
        piecesPerDoor: dto.header ? 1 : null,
        totalPieces: dto.header ? String(dto.quantity) : null,
      },
      componentCostBreakdown: calc.componentCostBreakdown,
      manualCosts: calc.manualCosts.map((line) => ({
        ...line,
        label: DOOR_BUILD_MANUAL_COST_LABELS[line.code],
      })),
      manualCostsTotal: calc.manualCostsTotal,
      baseSubtotalBeforeWidthCoefficient:
        calc.baseSubtotalBeforeWidthCoefficient,
      widthCoefficient: calc.widthCoefficient,
      widthCoefficientStatus: calc.widthCoefficientStatus,
      widthCoefficientMessage: calc.widthCoefficientMessage,
      widthAdjustedSubtotal: calc.widthAdjustedSubtotal,
      partialSubtotal: calc.partialSubtotal,
      partialSubtotalLabel: calc.allSelectedComponentsResolved
        ? 'Katsayı Sonrası Üretim Maliyeti'
        : 'Kısmi Ara Toplam (eksik bileşenler var)',
      sale: {
        status: sale.status,
        productionBase:
          sale.status === 'COMPUTED'
            ? sale.productionBase
            : calc.widthAdjustedSubtotal,
        profitRate: sale.profitRate,
        profitAmount: sale.profitAmount,
        beforeVat: sale.beforeVat,
        vatRate: sale.vatRate,
        vatAmount: sale.vatAmount,
        cashSale: sale.cashSale,
        cardMarkupRate: sale.cardMarkupRate,
        cardSale: sale.cardSale,
        cardStatusMessage: sale.cardStatusMessage,
        reason: sale.status === 'NOT_COMPUTED' ? sale.reason : null,
      },
      allSelectedComponentsResolved: calc.allSelectedComponentsResolved,
      phaseNote,
      missingSources: calc.missingSources,
      materialPreview,
      materialDraft,
    };
  }

  async toOrderDraft(dto: DoorBuildOrderTransferDto, now: Date = new Date()) {
    const quote = await this.quote(dto.quote, now);
    const unitPrice = this.resolveTransferUnitPrice(dto, quote);
    const { upsert, warnings } = buildDoorBuildOrderUpsert({
      quote,
      unitPrice,
      discountRate: normalizeAmount(dto.discountRate ?? '0'),
      vatRate: normalizeAmount(dto.vatRate),
      customerName: dto.customerName,
      customerAddress: dto.customerAddress,
      taxOffice: dto.taxOffice,
      customerPhone: dto.customerPhone,
      taxNumber: dto.taxNumber,
      documentDateText: dto.documentDateText,
      salePriceSource: dto.salePriceSource,
    });
    return {
      upsert,
      warnings,
      materialDraft: quote.materialDraft,
      doorSizeLabelCm: quote.doorSizeLabelCm,
      quantity: quote.quantity,
      salePriceSource: dto.salePriceSource,
      unitPrice,
      suggestedCashSale: quote.sale.cashSale,
      suggestedCardSale: quote.sale.cardSale,
      note: 'Birim satış fiyatı seçilen nakit/kart/manuel kaynaktan snapshot olarak yazılır. MANUAL + lineNo ile otomatik reçete atlanır.',
    };
  }

  private resolveTransferUnitPrice(
    dto: DoorBuildOrderTransferDto,
    quote: Awaited<ReturnType<DoorBuildService['quote']>>,
  ): string {
    if (dto.salePriceSource === 'CASH') {
      if (quote.sale.cashSale == null) {
        throw new BadRequestException(
          'Nakit satış önerisi yok. Kâr ve KDV oranlarını girin veya MANUAL seçin.',
        );
      }
      return quote.sale.cashSale;
    }
    if (dto.salePriceSource === 'CARD') {
      if (quote.sale.cardSale == null) {
        throw new BadRequestException(
          quote.sale.cardStatusMessage ??
            'Kart/taksit satış önerisi yok. Kart oranı girin veya MANUAL/CASH seçin.',
        );
      }
      return quote.sale.cardSale;
    }
    if (dto.unitPrice == null || String(dto.unitPrice).trim() === '') {
      throw new BadRequestException(
        'Manuel birim satış fiyatı seçildi; fiyat girilmelidir.',
      );
    }
    return normalizeAmount(dto.unitPrice);
  }

  async workshopPreview(dto: DoorBuildQuoteDto, now: Date = new Date()) {
    const quote = await this.quote(dto, now);
    const { model, html } = buildDoorBuildWorkshopPreview({ quote });
    return {
      orderNumber: model.orderNumber,
      isDraft: true,
      html,
      materialCount: model.materials.length,
      note: 'Kaydedilmemiş taslak. Resmî üretim çıktısı kayıtlı sipariş A5 formundan alınır.',
    };
  }

  private async resolveFrame(
    selection: DoorBuildFrameSelectionDto,
    materialPriceType: MaterialPriceType,
    now: Date,
  ): Promise<{
    cost: { unitProductionCost: string; totalBoyQuantity: string } | null;
    unresolvedMessage: string | null;
    displayName: string;
  }> {
    const displayName = `${FRAME_LABELS[selection.productCode]} ${selection.widthMm / 10}×${selection.lengthMm / 10}`;

    try {
      const list = await this.costCalculationService.getDoorFrameMdfCosts(
        selection.productCode as DoorFrameVariantCode,
        now,
        materialPriceType,
      );
      const row = list.rows.find(
        (item) =>
          sameMm(item.widthCm * 10, selection.widthMm) &&
          sameMm(item.lengthCm * 10, selection.lengthMm),
      );
      if (!row) {
        return {
          cost: null,
          unresolvedMessage: `${displayName} için katalog ölçüsü bulunamadı. Yakın ölçüye otomatik fiyat atanmaz.`,
          displayName,
        };
      }

      const totalBoyRaw = selection.totalBoyQuantity;
      if (totalBoyRaw == null || String(totalBoyRaw).trim() === '') {
        return {
          cost: null,
          unresolvedMessage: DOOR_BUILD_FRAME_QUANTITY_REQUIRED_MESSAGE,
          displayName,
        };
      }
      const totalBoy = normalizeAmount(totalBoyRaw);
      if (!toDecimal(totalBoy).isFinite() || toDecimal(totalBoy).lte(0)) {
        return {
          cost: null,
          unresolvedMessage: DOOR_BUILD_FRAME_QUANTITY_INVALID_MESSAGE,
          displayName,
        };
      }

      return {
        cost: {
          unitProductionCost: row.productionCost,
          totalBoyQuantity: totalBoy,
        },
        unresolvedMessage: null,
        displayName,
      };
    } catch (error) {
      return {
        cost: null,
        unresolvedMessage:
          error instanceof Error
            ? error.message
            : `${displayName} maliyeti hesaplanamadı.`,
        displayName,
      };
    }
  }

  private async resolvePervazComponent(
    selection: (DoorBuildPervazSelectionDto | DoorBuildHeaderSelectionDto) & {
      piecesPerDoor: number;
    },
    materialPriceType: MaterialPriceType,
    now: Date,
    label: string,
  ): Promise<{
    cost: { unitProductionCost: string; piecesPerDoor: number } | null;
    unresolvedMessage: string | null;
    displayName: string;
  }> {
    const productName = PERVAZ_LABELS[selection.productCode] ?? selection.productCode;
    const displayName = `${productName} ${selection.thicknessMm} mm · ${selection.widthMm}×${selection.lengthMm} mm`;
    try {
      const list = await this.loadPervazList(
        selection.productCode,
        materialPriceType,
        now,
      );
      const row = list.rows.find(
        (item: { thicknessMm: string | number; widthMm: string | number; lengthMm: string | number }) =>
          sameMm(item.thicknessMm, selection.thicknessMm) &&
          sameMm(item.widthMm, selection.widthMm) &&
          sameMm(item.lengthMm, selection.lengthMm),
      );
      if (!row) {
        return {
          cost: null,
          unresolvedMessage: `${label}: ${displayName} katalogda yok. Eksik master için otomatik ölçü/fiyat atanmaz.`,
          displayName,
        };
      }
      return {
        cost: {
          unitProductionCost: row.productionCost,
          piecesPerDoor: selection.piecesPerDoor,
        },
        unresolvedMessage: null,
        displayName,
      };
    } catch (error) {
      return {
        cost: null,
        unresolvedMessage:
          error instanceof Error
            ? `${label}: ${error.message}`
            : `${label} maliyeti hesaplanamadı.`,
        displayName,
      };
    }
  }

  private async loadPervazList(
    productCode: string,
    materialPriceType: MaterialPriceType,
    now: Date,
  ) {
    if (productCode === 'AYARLI_PERVAZ') {
      return this.costCalculationService.getAyarliPervazMdfCosts(
        now,
        materialPriceType,
      );
    }
    if (productCode === 'DEKORATIF_PERVAZ') {
      return this.costCalculationService.getDekoratifPervazCosts(
        now,
        materialPriceType,
      );
    }
    if (productCode === 'DEKORATIF_PERVAZ_GENIS_KILCIK') {
      return this.costCalculationService.getDekoratifGenisKilcikCosts(
        now,
        materialPriceType,
      );
    }
    throw new BadRequestException('Pervaz ürün kodu geçersiz.');
  }

  private buildMaterialDraft(input: {
    calc: ReturnType<typeof calculateDoorBuildQuote>;
    dto: DoorBuildQuoteDto;
    material: {
      id: string;
      code: string;
      name: string;
      thicknessMm: string;
      sheetWidthMm: number;
      sheetLengthMm: number;
      surfaceType: string | null;
    };
    frameMeta: Awaited<ReturnType<DoorBuildService['resolveFrame']>> | null;
    sideMeta: Awaited<ReturnType<DoorBuildService['resolvePervazComponent']>> | null;
    headerMeta: Awaited<ReturnType<DoorBuildService['resolvePervazComponent']>> | null;
  }): DoorBuildMaterialDraftLine[] {
    const lines: DoorBuildMaterialDraftLine[] = [];
    if (input.calc.surface != null) {
      lines.push({
        role: 'YUZAY_MDF',
        label: 'MDF yüzeyi',
        productCode: null,
        productName: null,
        sizeLabel: input.calc.surface.rule.sizeLabelCm,
        thicknessMm: input.material.thicknessMm,
        quantity: String(input.calc.surface.requiredFullSheets),
        pieceQuantity: String(input.calc.surface.totalFaces),
        sheetQuantity: String(input.calc.surface.requiredFullSheets),
        unitText: 'TABAKA',
        rawMaterialId: input.material.id,
        rawMaterialCode: input.material.code,
        rawMaterialName: input.material.name,
        sheetWidthMm: input.material.sheetWidthMm,
        sheetLengthMm: input.material.sheetLengthMm,
        surfaceType: input.material.surfaceType,
        unverified: false,
        note: `Yüzey adedi ${input.calc.surface.totalFaces}; tam tabaka ${input.calc.surface.requiredFullSheets}.`,
      });
    } else {
      lines.push({
        role: 'YUZAY_MDF',
        label: 'MDF yüzeyi',
        productCode: null,
        productName: null,
        sizeLabel: `${input.dto.doorHeightMm / 10}×${input.dto.doorWidthMm / 10}`,
        thicknessMm: input.material.thicknessMm,
        quantity: null,
        pieceQuantity: null,
        sheetQuantity: null,
        unitText: null,
        rawMaterialId: input.material.id,
        rawMaterialCode: input.material.code,
        rawMaterialName: input.material.name,
        sheetWidthMm: input.material.sheetWidthMm,
        sheetLengthMm: input.material.sheetLengthMm,
        surfaceType: input.material.surfaceType,
        unverified: true,
        note:
          input.calc.surfaceMessage ??
          'Bu kapı ölçüsü için doğrulanmış MDF yüzey kesim kuralı bulunmuyor.',
      });
    }

    if (input.dto.frame) {
      const resolved = input.calc.frame.status === 'RESOLVED';
      const totalQty = resolved
        ? normalizeAmount(input.dto.frame.totalBoyQuantity)
        : null;
      lines.push({
        role: 'FRAME',
        label: 'Kapı kasası',
        productCode: input.dto.frame.productCode,
        productName: FRAME_LABELS[input.dto.frame.productCode],
        sizeLabel: `${input.dto.frame.widthMm / 10}×${input.dto.frame.lengthMm / 10}`,
        thicknessMm: null,
        quantity: resolved ? totalQty : null,
        pieceQuantity: resolved ? totalQty : null,
        sheetQuantity: null,
        unitText: resolved ? 'BOY' : null,
        rawMaterialId: null,
        rawMaterialCode: null,
        rawMaterialName: null,
        sheetWidthMm: null,
        sheetLengthMm: null,
        surfaceType: null,
        unverified: !resolved,
        note: resolved
          ? `Toplam kasa miktarı ${totalQty} boy (katalog birim maliyet × boy; kapı adediyle çarpılmaz).`
          : input.frameMeta?.unresolvedMessage ??
            'Kasa miktarı doğrulanamadı; tahmini miktar gösterilmez.',
      });
    }

    if (input.dto.sideTrims) {
      const piecesPerDoor = DOOR_BUILD_SIDE_TRIM_PIECES_PER_DOOR;
      const pieces = toDecimal(piecesPerDoor).times(input.dto.quantity);
      const resolved = input.calc.sideTrims.status === 'RESOLVED';
      lines.push({
        role: 'SIDE_TRIM',
        label: 'Yan pervaz',
        productCode: input.dto.sideTrims.productCode,
        productName: PERVAZ_LABELS[input.dto.sideTrims.productCode],
        sizeLabel: `${input.dto.sideTrims.thicknessMm} mm · ${input.dto.sideTrims.widthMm}×${input.dto.sideTrims.lengthMm}`,
        thicknessMm: input.dto.sideTrims.thicknessMm,
        quantity: resolved ? pieces.toFixed() : null,
        pieceQuantity: resolved ? pieces.toFixed() : null,
        sheetQuantity: null,
        unitText: resolved ? 'ADET' : null,
        rawMaterialId: null,
        rawMaterialCode: null,
        rawMaterialName: null,
        sheetWidthMm: null,
        sheetLengthMm: null,
        surfaceType: null,
        unverified: !resolved,
        note: resolved
          ? `Kapı başına ${piecesPerDoor} yan pervaz (başlık hariç).`
          : input.sideMeta?.unresolvedMessage ??
            'Yan pervaz miktarı doğrulanamadı.',
      });
    }

    if (input.dto.header) {
      const pieces = toDecimal(input.dto.quantity);
      const resolved = input.calc.header.status === 'RESOLVED';
      lines.push({
        role: 'HEADER',
        label: 'Başlık',
        productCode: input.dto.header.productCode,
        productName: PERVAZ_LABELS[input.dto.header.productCode],
        sizeLabel: `${input.dto.header.thicknessMm} mm · ${input.dto.header.widthMm}×${input.dto.header.lengthMm}`,
        thicknessMm: input.dto.header.thicknessMm,
        quantity: resolved ? pieces.toFixed() : null,
        pieceQuantity: resolved ? pieces.toFixed() : null,
        sheetQuantity: null,
        unitText: resolved ? 'ADET' : null,
        rawMaterialId: null,
        rawMaterialCode: null,
        rawMaterialName: null,
        sheetWidthMm: null,
        sheetLengthMm: null,
        surfaceType: null,
        unverified: !resolved,
        note: resolved
          ? 'Kapı başına 1 başlık.'
          : input.headerMeta?.unresolvedMessage ??
            'Başlık miktarı doğrulanamadı.',
      });
    }

    for (const physical of input.dto.physicalMaterials ?? []) {
      const qty = toDecimal(normalizeAmount(physical.quantity));
      if (!qty.isFinite() || qty.lte(0)) {
        throw new BadRequestException(
          'Manuel fiziksel malzeme miktarı 0’dan büyük olmalıdır.',
        );
      }
      const sizeParts = [
        physical.thicknessMm ? `${normalizeAmount(physical.thicknessMm)} mm` : null,
        physical.sheetWidthMm && physical.sheetLengthMm
          ? `${physical.sheetWidthMm}×${physical.sheetLengthMm} mm`
          : null,
        physical.surfaceType?.trim() || null,
      ].filter(Boolean);
      lines.push({
        role: 'MANUAL_PHYSICAL',
        label: 'Manuel malzeme',
        productCode: null,
        productName: null,
        sizeLabel: sizeParts.length > 0 ? sizeParts.join(' · ') : null,
        thicknessMm: physical.thicknessMm
          ? normalizeAmount(physical.thicknessMm)
          : null,
        quantity: qty.toFixed(),
        pieceQuantity: qty.toFixed(),
        sheetQuantity: null,
        unitText: physical.unitText.trim(),
        rawMaterialId: null,
        rawMaterialCode: null,
        rawMaterialName: physical.materialNameText.trim(),
        sheetWidthMm: physical.sheetWidthMm ?? null,
        sheetLengthMm: physical.sheetLengthMm ?? null,
        surfaceType: physical.surfaceType?.trim() || null,
        unverified: false,
        note: physical.note?.trim() || null,
      });
    }

    return lines;
  }
}
