import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { getDoorFrameSizes } from '../../calculation-engine/calculators/door-frame-variants';
import { decimalToPrisma, toDecimal } from '../../common/decimal/decimal.util';
import { AuditService } from '../audit/audit.service';
import { CITA_SUPPORTED_THICKNESSES_MM } from '../products/cita-cut-rule.fixture';
import { CITA_PRODUCT_SIZE_SEEDS } from '../products/cita-product-seed';
import { SUPURGELIK_PRODUCT_SIZE_SEEDS } from '../products/supurgelik-product-seed';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertOrderDocumentDto } from './dto/upsert-order-document.dto';
import { formatDocumentTitle } from './order-letterhead';
import {
  duplicateMaterialWarnings,
  planComponents,
  type PlannedMaterial,
} from './order-material-plan';
import { ListOrderDocumentsQueryDto } from './dto/list-order-documents-query.dto';
import {
  claimStoredLine,
  formatQuantityText,
  normalizeOrderListQuery,
  orderListWhere,
  sumQuantities,
} from './order-list';
import { OrderMaterialResolver } from './order-material.resolver';
import {
  CustomerPrintModel,
  renderCombinedPrintHtml,
  renderCustomerPrintHtml,
  renderWorkshopPrintHtml,
  WorkshopPrintModel,
} from './order-print';
import {
  calculateOrderTotals,
  formatOrderMoney,
  formatVatLabel,
  OrderCalculationError,
} from './order-totals';

const SPECIAL_ORDER_GROUP_CODES = [
  'door_frame',
  'PERVAZ',
  'SUPURGELIK',
  'CITA',
] as const;

const orderInclude = {
  lines: { orderBy: { lineNo: 'asc' as const } },
  materialLines: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderDocumentInclude;

type OrderRecord = Prisma.OrderDocumentGetPayload<{ include: typeof orderInclude }>;

@Injectable()
export class OrderDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly materialResolver: OrderMaterialResolver,
  ) {}

  async catalog() {
    const groups = await this.prisma.productGroup.findMany({
      where: {
        isActive: true,
        OR: [
          { code: { in: [...SPECIAL_ORDER_GROUP_CODES] } },
          { calculatorType: 'GENERIC_RECIPE' },
        ],
      },
      orderBy: { name: 'asc' },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, code: true, name: true },
        },
      },
    });

    const pervazYields = await this.prisma.productionYield.findMany({
      where: {
        isActive: true,
        product: { isActive: true, productGroup: { code: 'PERVAZ' } },
      },
      select: {
        pieceWidthMm: true,
        pieceLengthMm: true,
        productId: true,
        rawMaterial: { select: { thicknessMm: true } },
      },
    });

    const pervazSizes = uniqueSizes(
      pervazYields.map((row) => ({
        widthMm: row.pieceWidthMm,
        lengthMm: row.pieceLengthMm,
      })),
    );
    const pervazThicknesses = uniqueDecimals(
      pervazYields.map((row) => row.rawMaterial.thicknessMm.toString()),
    );

    const genericGroupCodes = groups
      .filter(
        (g) =>
          !(SPECIAL_ORDER_GROUP_CODES as readonly string[]).includes(g.code),
      )
      .map((g) => g.code);

    const genericRecipes =
      genericGroupCodes.length === 0
        ? []
        : await this.prisma.recipe.findMany({
            where: {
              isActive: true,
              product: {
                isActive: true,
                productGroup: {
                  code: { in: genericGroupCodes },
                  isActive: true,
                },
              },
            },
            select: {
              product: {
                select: { productGroup: { select: { code: true } } },
              },
              productSize: {
                select: { widthMm: true, lengthMm: true, displayName: true },
              },
            },
          });

    const genericSizesByGroup: Record<
      string,
      Array<{ widthMm: number; lengthMm: number; displayName?: string }>
    > = {};
    for (const recipe of genericRecipes) {
      const code = recipe.product.productGroup.code;
      if (!genericSizesByGroup[code]) genericSizesByGroup[code] = [];
      genericSizesByGroup[code].push({
        widthMm: recipe.productSize.widthMm,
        lengthMm: recipe.productSize.lengthMm,
        displayName: recipe.productSize.displayName,
      });
    }
    for (const code of Object.keys(genericSizesByGroup)) {
      genericSizesByGroup[code] = uniqueSizes(genericSizesByGroup[code]);
    }

    return {
      groups: groups.map((group) => ({
        id: group.id,
        code: group.code,
        name: group.name,
        calculatorType: group.calculatorType,
        products: group.products,
      })),
      doorFrameSizes: {
        '34_MM': doorSizes('34_MM'),
        '30_MM': doorSizes('30_MM'),
      },
      groupSizes: {
        CITA: CITA_PRODUCT_SIZE_SEEDS,
        SUPURGELIK: SUPURGELIK_PRODUCT_SIZE_SEEDS,
        PERVAZ: pervazSizes,
        ...genericSizesByGroup,
      },
      citaThicknessesMm: CITA_SUPPORTED_THICKNESSES_MM,
      pervazThicknessesMm: pervazThicknesses,
      citaAllowsCustomSize: true,
      priceBasisNote:
        'Birim satış fiyatı KDV hariçtir. KDV, iskonto sonrası ara toplamın üzerine eklenir.',
    };
  }

  async preview(dto: UpsertOrderDocumentDto) {
    const totals = this.totalsOrThrow(dto);
    return this.prisma.$transaction(async (tx) => {
      const materials = await this.buildMaterials(tx, dto, totals);
      return {
        ...this.previewBody(dto, totals, materials),
        warnings: duplicateMaterialWarnings(materials),
      };
    });
  }

  async create(dto: UpsertOrderDocumentDto) {
    const totals = this.totalsOrThrow(dto);
    const created = await this.prisma.$transaction(async (tx) => {
      const materials = await this.buildMaterials(tx, dto, totals);
      const snapshots = await this.lineSnapshots(tx, dto, totals);
      const orderNumber = await this.nextOrderNumber(tx);
      const order = await tx.orderDocument.create({
        data: {
          ...this.headerData(dto, totals),
          orderNumber,
          lines: { create: snapshots },
          materialLines: { create: materials.map(materialCreateData) },
        },
        include: orderInclude,
      });
      await this.auditService.record(
        {
          entityType: 'OrderDocument',
          entityId: order.id,
          action: AuditAction.CREATE,
          newValue: `${order.orderNumber}; satır=${order.lines.length}; yeni toplam=${order.grandTotal.toString()}`,
        },
        tx,
      );
      return order;
    });
    return this.toDetail(created);
  }

  async update(id: string, dto: UpsertOrderDocumentDto) {
    const totals = this.totalsOrThrow(dto);
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.orderDocument.findUnique({
        where: { id },
        include: orderInclude,
      });
      if (!existing) {
        throw new NotFoundException('Sipariş bulunamadı.');
      }
      const materials = await this.buildMaterials(tx, dto, totals, {
        existing,
        refreshAuto: false,
      });
      const snapshots = await this.lineSnapshots(tx, dto, totals);
      await tx.orderLine.deleteMany({ where: { orderDocumentId: id } });
      await tx.orderMaterialLine.deleteMany({ where: { orderDocumentId: id } });
      const order = await tx.orderDocument.update({
        where: { id },
        data: {
          ...this.headerData(dto, totals),
          lines: { create: snapshots },
          materialLines: { create: materials.map(materialCreateData) },
        },
        include: orderInclude,
      });
      await this.auditService.record(
        {
          entityType: 'OrderDocument',
          entityId: order.id,
          action: AuditAction.UPDATE,
          fieldName: 'grandTotal',
          oldValue: existing.grandTotal.toString(),
          newValue: order.grandTotal.toString(),
          reason: `${order.orderNumber} güncellendi; yeni sipariş kaydı açılmadı.`,
        },
        tx,
      );
      return order;
    });
    return this.toDetail(updated);
  }

  async recalculateMaterials(id: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.orderDocument.findUnique({
        where: { id },
        include: orderInclude,
      });
      if (!existing) throw new NotFoundException('Sipariş bulunamadı.');
      const dto = this.dtoFromOrder(existing);
      const totals = this.totalsOrThrow(dto);
      const materials = await this.buildMaterials(tx, dto, totals, {
        existing,
        refreshAuto: true,
      });
      await tx.orderMaterialLine.deleteMany({ where: { orderDocumentId: id } });
      await tx.orderDocument.update({
        where: { id },
        data: { materialLines: { create: materials.map(materialCreateData) } },
      });
      await this.auditService.record(
        {
          entityType: 'OrderDocument',
          entityId: id,
          action: AuditAction.UPDATE,
          fieldName: 'materialLines',
          reason: 'Otomatik malzeme satırları güncel kaynaktan yeniden hesaplandı. Manuel satırlar korundu. Fiyat snapshot değişmedi.',
        },
        tx,
      );
      return tx.orderDocument.findUniqueOrThrow({ where: { id }, include: orderInclude });
    });
    return this.toDetail(updated);
  }

  async list(query: ListOrderDocumentsQueryDto = {}) {
    const normalized = normalizeOrderListQuery(query);
    const where = orderListWhere(normalized);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.orderDocument.count({ where }),
      this.prisma.orderDocument.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (normalized.page - 1) * normalized.pageSize,
        take: normalized.pageSize,
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          documentDateText: true,
          grandTotal: true,
          createdAt: true,
          updatedAt: true,
          lines: { select: { quantity: true } },
        },
      }),
    ]);
    return {
      items: rows.map((row) => {
        const totalQuantity = sumQuantities(row.lines.map((line) => line.quantity.toString()));
        return {
          id: row.id,
          orderNumber: row.orderNumber,
          customerName: row.customerName,
          documentDateText: row.documentDateText,
          grandTotal: row.grandTotal.toString(),
          grandTotalDisplay: formatOrderMoney(row.grandTotal.toString()),
          lineCount: row.lines.length,
          totalQuantity,
          totalQuantityDisplay: formatQuantityText(totalQuantity),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      }),
      total,
      page: normalized.page,
      pageSize: normalized.pageSize,
    };
  }

  async get(id: string) {
    return this.toDetail(await this.requireOrder(id));
  }

  async customerPrint(id: string) {
    const order = await this.requireOrder(id);
    return { html: renderCustomerPrintHtml(this.customerModel(order)) };
  }

  async workshopPrint(id: string) {
    const order = await this.requireOrder(id);
    return { html: renderWorkshopPrintHtml(this.workshopModel(order)) };
  }

  async combinedPrint(id: string) {
    const order = await this.requireOrder(id);
    return {
      html: renderCombinedPrintHtml(
        this.customerModel(order),
        this.workshopModel(order),
      ),
    };
  }

  private async requireOrder(id: string): Promise<OrderRecord> {
    const order = await this.prisma.orderDocument.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Sipariş bulunamadı.');
    return order;
  }

  private totalsOrThrow(dto: UpsertOrderDocumentDto) {
    try {
      return calculateOrderTotals(
        dto.lines.map((line) => ({
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountRate: line.discountRate,
        })),
        dto.vatRate,
      );
    } catch (error) {
      if (error instanceof OrderCalculationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private headerData(
    dto: UpsertOrderDocumentDto,
    totals: ReturnType<OrderDocumentsService['totalsOrThrow']>,
  ): Omit<Prisma.OrderDocumentCreateInput, 'orderNumber'> {
    return {
      customerName: dto.customerName.trim(),
      customerAddress: emptyToNull(dto.customerAddress),
      taxOffice: emptyToNull(dto.taxOffice),
      customerPhone: emptyToNull(dto.customerPhone),
      taxNumber: emptyToNull(dto.taxNumber),
      documentDateText: emptyToNull(dto.documentDateText),
      vatRate: decimalToPrisma(totals.vatRate),
      grossTotal: decimalToPrisma(totals.grossTotal),
      discountAmount: decimalToPrisma(totals.discountAmount),
      netTotal: decimalToPrisma(totals.netTotal),
      vatAmount: decimalToPrisma(totals.vatAmount),
      grandTotal: decimalToPrisma(totals.grandTotal),
    };
  }

  private async lineSnapshots(
    tx: Prisma.TransactionClient,
    dto: UpsertOrderDocumentDto,
    totals: ReturnType<OrderDocumentsService['totalsOrThrow']>,
  ): Promise<Prisma.OrderLineCreateWithoutOrderDocumentInput[]> {
    const rows: Prisma.OrderLineCreateWithoutOrderDocumentInput[] = [];
    for (let index = 0; index < dto.lines.length; index += 1) {
      const line = dto.lines[index];
      const calc = totals.lines[index];
      const catalog = await this.catalogSnapshot(tx, line.kind, line.productId);
      rows.push({
        lineNo: index + 1,
        kind: line.kind,
        product: catalog.productId
          ? { connect: { id: catalog.productId } }
          : undefined,
        productGroupCode: catalog.productGroupCode,
        productGroupName: catalog.productGroupName,
        catalogProductName: catalog.catalogProductName,
        productNameText: line.productNameText.trim(),
        widthMm: optionalDecimal(line.widthMm),
        lengthMm: optionalDecimal(line.lengthMm),
        thicknessMm: optionalDecimal(line.thicknessMm),
        decorText: emptyToNull(line.decorText),
        productionNote: emptyToNull(line.productionNote),
        quantity: decimalToPrisma(calc.quantity),
        unitText: line.unitText.trim(),
        discountRate: decimalToPrisma(calc.discountRate),
        unitPrice: decimalToPrisma(calc.unitPrice),
        lineAmount: decimalToPrisma(calc.lineAmount),
        lineDiscountAmount: decimalToPrisma(calc.lineDiscountAmount),
        priceSource: line.priceSource,
      });
    }
    return rows;
  }

  private async catalogSnapshot(
    tx: Prisma.TransactionClient,
    kind: 'CATALOG' | 'FREE_TEXT',
    productId?: string,
  ) {
    if (kind === 'FREE_TEXT') {
      return {
        productId: null,
        productGroupCode: null,
        productGroupName: null,
        catalogProductName: null,
      };
    }
    if (!productId) {
      throw new BadRequestException('Katalog satırı için ürün seçilmelidir.');
    }
    const product = await tx.product.findUnique({
      where: { id: productId },
      include: { productGroup: true },
    });
    if (
      !product ||
      (!(SPECIAL_ORDER_GROUP_CODES as readonly string[]).includes(
        product.productGroup.code,
      ) &&
        product.productGroup.calculatorType !== 'GENERIC_RECIPE')
    ) {
      throw new BadRequestException('Seçilen ürün sipariş kataloğunda yok.');
    }
    if (!product.isActive || !product.productGroup.isActive) {
      throw new BadRequestException(
        'Seçilen ürün kaydı artık aktif değil. Kayıtlı sipariş açılabilir; kaydetmek için ürünü değiştirin veya serbest satır yapın.',
      );
    }
    return {
      productId: product.id,
      productGroupCode: product.productGroup.code,
      productGroupName: product.productGroup.name,
      catalogProductName: product.name,
    };
  }

  private async buildMaterials(
    tx: Prisma.TransactionClient,
    dto: UpsertOrderDocumentDto,
    totals: ReturnType<OrderDocumentsService['totalsOrThrow']>,
    options?: { existing?: OrderRecord; refreshAuto?: boolean },
  ): Promise<PlannedMaterial[]> {
    const existing = options?.existing;
    const refreshAuto = options?.refreshAuto ?? !existing;
    const planned: PlannedMaterial[] = [];
    const consumedLineNos = new Set<number>();

    const manuals =
      dto.manualMaterials !== undefined
        ? dto.manualMaterials
        : (existing?.materialLines ?? [])
            .filter((item) => item.source === 'MANUAL')
            .map((item) => ({
              lineNo: item.lineNo ?? undefined,
              rawMaterialId: item.rawMaterialId ?? undefined,
              materialNameText: item.materialNameText,
              thicknessMm: item.thicknessMm?.toString(),
              sheetWidthMm: item.sheetWidthMm ?? undefined,
              sheetLengthMm: item.sheetLengthMm ?? undefined,
              surfaceType: item.surfaceType ?? undefined,
              quantity: item.quantity?.toString() ?? '',
              pieceQuantity: item.pieceQuantity?.toString(),
              sheetQuantity: item.sheetQuantity?.toString(),
              unitText: item.unitText ?? 'ADET',
              componentRole: item.componentRole ?? undefined,
              note: item.note ?? undefined,
              unverified: item.unverified,
            }));

    const lineNosWithProvidedMaterials = new Set(
      manuals
        .map((item) => item.lineNo)
        .filter((lineNo): lineNo is number => typeof lineNo === 'number' && lineNo >= 1),
    );

    for (let index = 0; index < dto.lines.length; index += 1) {
      const line = dto.lines[index];
      const lineNo = index + 1;

      // Kapı İmalatı vb. doğrulanmış malzemeler MANUAL + lineNo ile gelirse
      // otomatik resolver satırı eklenmez (çift kayıt / sahte unverified önlenir).
      if (lineNosWithProvidedMaterials.has(lineNo)) {
        continue;
      }

      const previous =
        !refreshAuto && existing
          ? claimStoredLine(existing.lines, consumedLineNos, (item) =>
              sameMaterialSignature(item, line, totals.lines[index].quantity.toFixed()),
            )
          : undefined;
      const storedAuto = previous
        ? existing!.materialLines.filter((item) => item.source === 'RECIPE' && item.lineNo === previous.lineNo)
        : [];
      if (storedAuto.length > 0) {
        planned.push(...storedAuto.map((item) => ({ ...storedAutoToPlanned(item), lineNo })));
        continue;
      }
      const components = await this.materialResolver.resolve(tx, line);
      planned.push(
        ...planComponents({
          lineNo,
          orderQuantity: totals.lines[index].quantity.toFixed(),
          components,
          unverifiedName: line.productNameText.trim(),
        }),
      );
    }

    for (const manual of manuals) {
      let quantity;
      try {
        quantity = toDecimal(manual.quantity.replace(',', '.'));
      } catch {
        throw new BadRequestException('Manuel malzeme miktarı geçerli bir sayı olmalıdır.');
      }
      if (!quantity.isFinite() || quantity.lte(0)) {
        throw new BadRequestException('Manuel malzeme miktarı 0’dan büyük olmalıdır.');
      }

      let pieceQuantity = quantity;
      if (manual.pieceQuantity != null && String(manual.pieceQuantity).trim() !== '') {
        try {
          pieceQuantity = toDecimal(String(manual.pieceQuantity).replace(',', '.'));
        } catch {
          throw new BadRequestException('Manuel malzeme parça adedi geçerli bir sayı olmalıdır.');
        }
        if (!pieceQuantity.isFinite() || pieceQuantity.lte(0)) {
          throw new BadRequestException('Manuel malzeme parça adedi 0’dan büyük olmalıdır.');
        }
      }

      let sheetQuantity: ReturnType<typeof toDecimal> | null = null;
      if (manual.sheetQuantity != null && String(manual.sheetQuantity).trim() !== '') {
        try {
          sheetQuantity = toDecimal(String(manual.sheetQuantity).replace(',', '.'));
        } catch {
          throw new BadRequestException('Manuel malzeme tabaka ihtiyacı geçerli bir sayı olmalıdır.');
        }
        if (!sheetQuantity.isFinite() || sheetQuantity.lte(0)) {
          throw new BadRequestException('Manuel malzeme tabaka ihtiyacı 0’dan büyük olmalıdır.');
        }
      }

      planned.push({
        source: 'MANUAL',
        lineNo: manual.lineNo ?? null,
        rawMaterialId: manual.rawMaterialId ?? null,
        materialNameText: manual.materialNameText.trim(),
        thicknessMm: emptyToNull(manual.thicknessMm),
        sheetWidthMm: manual.sheetWidthMm ?? null,
        sheetLengthMm: manual.sheetLengthMm ?? null,
        surfaceType: emptyToNull(manual.surfaceType),
        quantity: quantity.toFixed(),
        pieceQuantity: pieceQuantity.toFixed(),
        sheetQuantity: sheetQuantity?.toFixed() ?? null,
        netQtySnapshot: null,
        componentRole: emptyToNull(manual.componentRole) ?? 'MANUEL',
        unitText: manual.unitText.trim(),
        note: emptyToNull(manual.note),
        unverified: Boolean(manual.unverified),
      });
    }
    return planned;
  }

  private dtoFromOrder(order: OrderRecord): UpsertOrderDocumentDto {
    return {
      customerName: order.customerName,
      customerAddress: order.customerAddress ?? undefined,
      taxOffice: order.taxOffice ?? undefined,
      customerPhone: order.customerPhone ?? undefined,
      taxNumber: order.taxNumber ?? undefined,
      documentDateText: order.documentDateText ?? undefined,
      vatRate: order.vatRate.toString(),
      lines: order.lines.map((line) => ({
        kind: line.kind,
        productId: line.productId ?? undefined,
        productNameText: line.productNameText,
        widthMm: line.widthMm?.toString(),
        lengthMm: line.lengthMm?.toString(),
        thicknessMm: line.thicknessMm?.toString(),
        decorText: line.decorText ?? undefined,
        productionNote: line.productionNote ?? undefined,
        quantity: line.quantity.toString(),
        unitText: line.unitText,
        discountRate: line.discountRate.toString(),
        unitPrice: line.unitPrice.toString(),
        priceSource: line.priceSource,
      })),
    };
  }

  private async nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ n: bigint }>>`
      SELECT nextval('order_document_number_seq') AS n
    `;
    const value = rows[0]?.n;
    if (value == null) {
      throw new BadRequestException('Sipariş numarası üretilemedi.');
    }
    return `SP-${value.toString().padStart(6, '0')}`;
  }

  private previewBody(
    dto: UpsertOrderDocumentDto,
    totals: ReturnType<OrderDocumentsService['totalsOrThrow']>,
    materials: PlannedMaterial[],
  ) {
    return {
      documentTitle: formatDocumentTitle(emptyToNull(dto.documentDateText)),
      vatLabel: formatVatLabel(totals.vatRate),
      pricesAreVatExclusive: true,
      lines: dto.lines.map((line, index) => ({
        lineNo: index + 1,
        productNameText: line.productNameText.trim(),
        quantity: totals.lines[index].quantity.toFixed(),
        unitText: line.unitText.trim(),
        discountRate: totals.lines[index].discountRate.toFixed(),
        unitPrice: totals.lines[index].unitPrice.toFixed(),
        unitPriceDisplay: formatOrderMoney(totals.lines[index].unitPrice),
        lineAmount: totals.lines[index].lineAmount.toFixed(),
        lineAmountDisplay: formatOrderMoney(totals.lines[index].lineAmount),
        lineDiscountAmount: totals.lines[index].lineDiscountAmount.toFixed(),
        lineDiscountAmountDisplay: formatOrderMoney(totals.lines[index].lineDiscountAmount),
      })),
      grossTotal: totals.grossTotal.toFixed(),
      grossTotalDisplay: formatOrderMoney(totals.grossTotal),
      discountAmount: totals.discountAmount.toFixed(),
      discountAmountDisplay: formatOrderMoney(totals.discountAmount),
      netTotal: totals.netTotal.toFixed(),
      netTotalDisplay: formatOrderMoney(totals.netTotal),
      vatRate: totals.vatRate.toFixed(),
      vatAmount: totals.vatAmount.toFixed(),
      vatAmountDisplay: formatOrderMoney(totals.vatAmount),
      grandTotal: totals.grandTotal.toFixed(),
      grandTotalDisplay: formatOrderMoney(totals.grandTotal),
      materials,
    };
  }

  private toDetail(order: OrderRecord) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerAddress: order.customerAddress,
      taxOffice: order.taxOffice,
      customerPhone: order.customerPhone,
      taxNumber: order.taxNumber,
      documentDateText: order.documentDateText,
      documentTitle: formatDocumentTitle(order.documentDateText),
      vatRate: order.vatRate.toString(),
      vatLabel: formatVatLabel(order.vatRate.toString()),
      pricesAreVatExclusive: true as const,
      grossTotal: order.grossTotal.toString(),
      grossTotalDisplay: formatOrderMoney(order.grossTotal.toString()),
      discountAmount: order.discountAmount.toString(),
      discountAmountDisplay: formatOrderMoney(order.discountAmount.toString()),
      netTotal: order.netTotal.toString(),
      netTotalDisplay: formatOrderMoney(order.netTotal.toString()),
      vatAmount: order.vatAmount.toString(),
      vatAmountDisplay: formatOrderMoney(order.vatAmount.toString()),
      grandTotal: order.grandTotal.toString(),
      grandTotalDisplay: formatOrderMoney(order.grandTotal.toString()),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      lines: order.lines.map((line) => ({
        lineNo: line.lineNo,
        kind: line.kind,
        productId: line.productId,
        productGroupCode: line.productGroupCode,
        productGroupName: line.productGroupName,
        catalogProductName: line.catalogProductName,
        productNameText: line.productNameText,
        widthMm: line.widthMm?.toString() ?? null,
        lengthMm: line.lengthMm?.toString() ?? null,
        thicknessMm: line.thicknessMm?.toString() ?? null,
        decorText: line.decorText,
        productionNote: line.productionNote,
        quantity: line.quantity.toString(),
        unitText: line.unitText,
        discountRate: line.discountRate.toString(),
        unitPrice: line.unitPrice.toString(),
        unitPriceDisplay: formatOrderMoney(line.unitPrice.toString()),
        lineAmount: line.lineAmount.toString(),
        lineAmountDisplay: formatOrderMoney(line.lineAmount.toString()),
        lineDiscountAmount: line.lineDiscountAmount.toString(),
        lineDiscountAmountDisplay: formatOrderMoney(line.lineDiscountAmount.toString()),
        priceSource: line.priceSource,
      })),
      materialLines: order.materialLines.map((item) => ({
        source: item.source,
        lineNo: item.lineNo,
        rawMaterialId: item.rawMaterialId,
        materialNameText: item.materialNameText,
        thicknessMm: item.thicknessMm?.toString() ?? null,
        sheetWidthMm: item.sheetWidthMm,
        sheetLengthMm: item.sheetLengthMm,
        surfaceType: item.surfaceType,
        quantity: item.quantity?.toString() ?? null,
        pieceQuantity: item.pieceQuantity?.toString() ?? null,
        sheetQuantity: item.sheetQuantity?.toString() ?? null,
        netQtySnapshot: item.netQtySnapshot,
        componentRole: item.componentRole,
        unitText: item.unitText,
        note: item.note,
        unverified: item.unverified,
      })),
    };
  }

  private customerModel(order: OrderRecord): CustomerPrintModel {
    return {
      documentDateText: order.documentDateText,
      customerName: order.customerName,
      customerAddress: order.customerAddress,
      taxOffice: order.taxOffice,
      customerPhone: order.customerPhone,
      taxNumber: order.taxNumber,
      lines: order.lines.map((line) => ({
        lineNo: line.lineNo,
        productNameText: line.productNameText,
        quantity: line.quantity.toString(),
        unitText: line.unitText,
        discountRate: line.discountRate.toString(),
        unitPrice: line.unitPrice.toString(),
        lineAmount: line.lineAmount.toString(),
      })),
      grossTotal: order.grossTotal.toString(),
      discountAmount: order.discountAmount.toString(),
      netTotal: order.netTotal.toString(),
      vatLabel: formatVatLabel(order.vatRate.toString()),
      vatAmount: order.vatAmount.toString(),
      grandTotal: order.grandTotal.toString(),
    };
  }

  private workshopModel(order: OrderRecord): WorkshopPrintModel {
    const unverifiedByLine = new Map<number, string>();
    for (const item of order.materialLines) {
      if (item.unverified && item.lineNo != null && item.note) {
        unverifiedByLine.set(item.lineNo, item.note);
      }
    }
    return {
      orderNumber: order.orderNumber,
      documentDateText: order.documentDateText,
      lines: order.lines.map((line) => ({
        lineNo: line.lineNo,
        productNameText: line.productNameText,
        productKindText: joinText(line.productGroupName, line.catalogProductName),
        sizeText: sizeText(line.widthMm?.toString(), line.lengthMm?.toString()),
        thicknessText: line.thicknessMm ? `${trimDecimal(line.thicknessMm.toString())} mm` : null,
        decorText: line.decorText,
        productionNote: line.productionNote,
        quantity: line.quantity.toString(),
        unitText: line.unitText,
        materialMessage: unverifiedByLine.get(line.lineNo) ?? null,
      })),
      materials: order.materialLines.map((item) => ({
        source: item.source,
        lineNo: item.lineNo,
        rawMaterialId: item.rawMaterialId,
        componentRole: item.componentRole,
        materialNameText: item.materialNameText,
        thicknessMm: item.thicknessMm?.toString() ?? null,
        sheetWidthMm: item.sheetWidthMm,
        sheetLengthMm: item.sheetLengthMm,
        surfaceType: item.surfaceType,
        quantity: item.quantity?.toString() ?? null,
        pieceQuantity: item.pieceQuantity?.toString() ?? null,
        sheetQuantity: item.sheetQuantity?.toString() ?? null,
        unitText: item.unitText,
        note: item.note,
        unverified: item.unverified,
      })),
    };
  }
}

function doorSizes(code: '34_MM' | '30_MM') {
  return getDoorFrameSizes(code).map((size) => ({
    widthMm: size.widthCm * 10,
    lengthMm: size.lengthCm * 10,
    displayName: `${size.widthCm}×${size.lengthCm}`,
  }));
}

function uniqueSizes(rows: Array<{ widthMm: number; lengthMm: number }>) {
  const map = new Map<string, { widthMm: number; lengthMm: number; displayName: string }>();
  for (const row of rows) {
    const key = `${row.widthMm}x${row.lengthMm}`;
    if (!map.has(key)) {
      map.set(key, {
        widthMm: row.widthMm,
        lengthMm: row.lengthMm,
        displayName: `${row.widthMm / 10}×${row.lengthMm / 10}`,
      });
    }
  }
  return [...map.values()];
}

function uniqueDecimals(values: string[]): string[] {
  return [...new Set(values.map((value) => toDecimal(value).toFixed()))].sort(
    (a, b) => toDecimal(a).comparedTo(toDecimal(b)) ?? 0,
  );
}

function sameMaterialSignature(
  previous: {
    kind: string;
    productId: string | null;
    widthMm: { toString(): string } | null;
    lengthMm: { toString(): string } | null;
    thicknessMm: { toString(): string } | null;
    quantity: { toString(): string };
  },
  line: UpsertOrderDocumentDto['lines'][number],
  quantity: string,
): boolean {
  const stored = materialSignature({
    kind: previous.kind,
    productId: previous.productId,
    widthMm: previous.widthMm?.toString() ?? null,
    lengthMm: previous.lengthMm?.toString() ?? null,
    thicknessMm: previous.thicknessMm?.toString() ?? null,
    quantity: previous.quantity.toString(),
  });
  const next = materialSignature({
    kind: line.kind,
    productId: line.productId ?? null,
    widthMm: line.widthMm ?? null,
    lengthMm: line.lengthMm ?? null,
    thicknessMm: line.thicknessMm ?? null,
    quantity,
  });
  return stored === next;
}

function materialSignature(line: {
  kind: string;
  productId: string | null;
  widthMm: string | null;
  lengthMm: string | null;
  thicknessMm: string | null;
  quantity: string;
}): string {
  return [
    line.kind,
    line.productId ?? '',
    normalizeMeasure(line.widthMm),
    normalizeMeasure(line.lengthMm),
    normalizeMeasure(line.thicknessMm),
    normalizeMeasure(line.quantity),
  ].join('|');
}

function normalizeMeasure(value: string | null): string {
  if (value == null || value.trim() === '') return '';
  return toDecimal(value.replace(',', '.')).toFixed();
}

function storedAutoToPlanned(item: OrderRecord['materialLines'][number]): PlannedMaterial {
  return {
    source: 'RECIPE',
    lineNo: item.lineNo,
    rawMaterialId: item.rawMaterialId,
    materialNameText: item.materialNameText,
    thicknessMm: item.thicknessMm?.toString() ?? null,
    sheetWidthMm: item.sheetWidthMm,
    sheetLengthMm: item.sheetLengthMm,
    surfaceType: item.surfaceType,
    quantity: item.quantity?.toString() ?? null,
    pieceQuantity: item.pieceQuantity?.toString() ?? null,
    sheetQuantity: item.sheetQuantity?.toString() ?? null,
    netQtySnapshot: item.netQtySnapshot,
    componentRole: item.componentRole,
    unitText: item.unitText,
    note: item.note,
    unverified: item.unverified,
  };
}

function integerMm(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const value = toDecimal(raw.replace(',', '.'));
  if (!value.isInteger() || value.lte(0) || value.gt(20000)) return null;
  return Number(value.toFixed(0));
}

function optionalDecimal(raw: string | undefined): Prisma.Decimal | null {
  if (raw == null || raw.trim() === '') return null;
  return decimalToPrisma(toDecimal(raw.replace(',', '.')));
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value.trim();
  return text === '' ? null : text;
}

function materialCreateData(item: PlannedMaterial): Prisma.OrderMaterialLineCreateWithoutOrderDocumentInput {
  return {
    source: item.source,
    lineNo: item.lineNo,
    rawMaterial: item.rawMaterialId ? { connect: { id: item.rawMaterialId } } : undefined,
    materialNameText: item.materialNameText,
    thicknessMm: item.thicknessMm ? decimalToPrisma(toDecimal(item.thicknessMm)) : null,
    sheetWidthMm: item.sheetWidthMm,
    sheetLengthMm: item.sheetLengthMm,
    surfaceType: item.surfaceType,
    quantity: item.quantity ? decimalToPrisma(toDecimal(item.quantity)) : null,
    pieceQuantity: item.pieceQuantity ? decimalToPrisma(toDecimal(item.pieceQuantity)) : null,
    sheetQuantity: item.sheetQuantity ? decimalToPrisma(toDecimal(item.sheetQuantity)) : null,
    netQtySnapshot: item.netQtySnapshot,
    componentRole: item.componentRole,
    unitText: item.unitText,
    note: item.note,
    unverified: item.unverified,
  };
}

function joinText(left: string | null, right: string | null): string | null {
  const text = [left, right].filter((part) => part && part.trim()).join(' / ');
  return text || null;
}

function sizeText(width: string | undefined, length: string | undefined): string | null {
  if (!width || !length) return null;
  return `${trimDecimal(width)}×${trimDecimal(length)} mm`;
}

function trimDecimal(value: string): string {
  return toDecimal(value).toFixed().replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}
