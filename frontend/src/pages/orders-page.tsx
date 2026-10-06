import { useEffect, useMemo, useRef, useState } from 'react';
import { quoteOrderCost } from '../api/order-quote-api';
import {
  DOOR_BUILD_ORDER_DRAFT_STORAGE_KEY,
} from '../api/door-build-api';
import {
  createOrderDocument,
  fetchOrderCatalog,
  getOrderDocument,
  listOrderDocuments,
  openOrderPrint,
  previewOrderDocument,
  recalculateOrderMaterials,
  updateOrderDocument,
  type OrderCatalog,
  type OrderDetail,
  type OrderListItem,
  type OrderPreview,
  type OrderPreviewMaterial,
  type OrderUpsertInput,
} from '../api/order-documents-api';
import { listRawMaterials, type RawMaterial } from '../api/raw-materials-api';
import { ApiError } from '../lib/api';
import type { MaterialPriceType } from '../lib/material-price-type';
import './orders-page.css';

type DraftLine = {
  key: string;
  kind: 'CATALOG' | 'FREE_TEXT';
  groupCode: string;
  productId: string;
  productNameText: string;
  widthMm: string;
  lengthMm: string;
  thicknessMm: string;
  decorText: string;
  productionNote: string;
  quantity: string;
  unitText: string;
  discountRate: string;
  unitPrice: string;
  /** Müşteri satış türü — MDF alış türünden ayrıdır. */
  saleType: 'CASH' | 'CARD';
  priceSource: 'ENTERED' | 'SUGGESTED_CASH' | 'SUGGESTED_CARD';
  /** Manuel düzenleme sonrası aynı ürün/ölçü/satış türünde otomatik fiyat ezmesin. */
  priceManual: boolean;
  cashSuggestion: string | null;
  cardSuggestion: string | null;
  suggestionNote: string;
  autoQuoteKey: string;
};

type DraftMaterial = {
  key: string;
  lineNo: string;
  rawMaterialId: string;
  materialNameText: string;
  thicknessMm: string;
  sheetWidthMm: string;
  sheetLengthMm: string;
  surfaceType: string;
  quantity: string;
  pieceQuantity: string;
  sheetQuantity: string;
  unitText: string;
  componentRole: string;
  note: string;
  unverified: boolean;
};

function newLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    kind: 'CATALOG',
    groupCode: '',
    productId: '',
    productNameText: '',
    widthMm: '',
    lengthMm: '',
    thicknessMm: '',
    decorText: '',
    productionNote: '',
    quantity: '1',
    unitText: 'ADET',
    discountRate: '0',
    unitPrice: '',
    saleType: 'CASH',
    priceSource: 'ENTERED',
    priceManual: false,
    cashSuggestion: null,
    cardSuggestion: null,
    suggestionNote: '',
    autoQuoteKey: '',
  };
}

function lineAutoQuoteKey(line: Pick<DraftLine, 'productId' | 'widthMm' | 'lengthMm' | 'thicknessMm' | 'saleType'>): string {
  return [line.productId, line.widthMm, line.lengthMm, line.thicknessMm.trim(), line.saleType].join('|');
}

function applySalePrice(
  saleType: 'CASH' | 'CARD',
  cash: string | null,
  card: string | null,
): { unitPrice: string; priceSource: DraftLine['priceSource']; suggestionNote: string } {
  if (saleType === 'CASH') {
    if (cash != null && cash !== '') {
      return {
        unitPrice: cash,
        priceSource: 'SUGGESTED_CASH',
        suggestionNote: '',
      };
    }
    return {
      unitPrice: '',
      priceSource: 'ENTERED',
      suggestionNote: 'Nakit satış fiyatı tanımlı değil.',
    };
  }
  if (card != null && card !== '') {
    return {
      unitPrice: card,
      priceSource: 'SUGGESTED_CARD',
      suggestionNote: '',
    };
  }
  return {
    unitPrice: '',
    priceSource: 'ENTERED',
    suggestionNote: 'Kart/taksit satış fiyatı tanımlı değil.',
  };
}

function newMaterial(): DraftMaterial {
  return {
    key: crypto.randomUUID(),
    lineNo: '',
    rawMaterialId: '',
    materialNameText: '',
    thicknessMm: '',
    sheetWidthMm: '',
    sheetLengthMm: '',
    surfaceType: '',
    quantity: '',
    pieceQuantity: '',
    sheetQuantity: '',
    unitText: 'ADET',
    componentRole: '',
    note: '',
    unverified: false,
  };
}

export function OrdersPage() {
  const [catalog, setCatalog] = useState<OrderCatalog | null>(null);
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [listQuery, setListQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [cleanKey, setCleanKey] = useState('');
  const saveLock = useRef(false);
  const [mode, setMode] = useState<'list' | 'detail' | 'edit'>('list');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [documentDateText, setDocumentDateText] = useState('');
  const [vatRate, setVatRate] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [materials, setMaterials] = useState<DraftMaterial[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [recordedAuto, setRecordedAuto] = useState<OrderPreviewMaterial[]>([]);
  const [materialBaseline, setMaterialBaseline] = useState('');
  const [suggestionBasis, setSuggestionBasis] = useState<MaterialPriceType>('CASH');
  const autoQuoteTimers = useRef<Map<string, number>>(new Map());
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reloadList = async (next?: { q?: string; dateFrom?: string; dateTo?: string; page?: number }) => {
    const response = await listOrderDocuments({
      q: next?.q ?? listQuery,
      dateFrom: next?.dateFrom ?? dateFrom,
      dateTo: next?.dateTo ?? dateTo,
      page: next?.page ?? page,
      pageSize: 20,
    });
    setItems(response.items);
    setTotal(response.total);
    setPage(response.page);
    setPageSize(response.pageSize);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [catalogResponse, listResponse, materialCatalog] = await Promise.all([
          fetchOrderCatalog(),
          listOrderDocuments({ page: 1, pageSize: 20 }),
          listRawMaterials({ isActive: true }),
        ]);
        if (cancelled) return;
        setCatalog(catalogResponse);
        setItems(listResponse.items);
        setTotal(listResponse.total);
        setPage(listResponse.page);
        setPageSize(listResponse.pageSize);
        setRawMaterials(materialCatalog);
      } catch (err) {
        if (!cancelled) setError(messageOf(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const payload = useMemo(() => buildPayload({
    customerName,
    customerAddress,
    taxOffice,
    customerPhone,
    taxNumber,
    documentDateText,
    vatRate,
    lines,
    materials,
  }), [
    customerName,
    customerAddress,
    taxOffice,
    customerPhone,
    taxNumber,
    documentDateText,
    vatRate,
    lines,
    materials,
  ]);

  const draftKey = JSON.stringify(payload);
  const dirty = mode === 'edit' && cleanKey !== '' && draftKey !== cleanKey;

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const linesUnchanged = orderId != null && lineSignature(lines) === materialBaseline;
  const shownMaterials = linesUnchanged
    ? [
        ...recordedAuto,
        ...(preview?.materials.filter((item) => item.source === 'MANUAL') ?? []),
      ]
    : (preview?.materials ?? []);

  useEffect(() => {
    if (mode !== 'edit') return;
    const handle = window.setTimeout(() => {
      void previewOrderDocument(payload)
        .then((result) => {
          setPreview(result);
          setPreviewError(null);
        })
        .catch((err) => {
          setPreview(null);
          setPreviewError(messageOf(err));
        });
    }, 350);
    return () => window.clearTimeout(handle);
  }, [mode, payload]);

  const startNew = () => {
    setMode('edit');
    setOrderId(null);
    setOrderNumber(null);
    setCustomerName('');
    setCustomerAddress('');
    setTaxOffice('');
    setCustomerPhone('');
    setTaxNumber('');
    setDocumentDateText('');
    setVatRate('');
    setLines([newLine()]);
    setMaterials([]);
    setRecordedAuto([]);
    setMaterialBaseline('');
    setPreview(null);
    setDetail(null);
    setError(null);
    setNotice(null);
    setCleanKey(JSON.stringify(buildPayload({
      customerName: '',
      customerAddress: '',
      taxOffice: '',
      customerPhone: '',
      taxNumber: '',
      documentDateText: '',
      vatRate: '',
      lines: [newLine()],
      materials: [],
    })));
  };

  useEffect(() => {
    const raw = sessionStorage.getItem(DOOR_BUILD_ORDER_DRAFT_STORAGE_KEY);
    if (!raw) return;
    try {
      const upsert = JSON.parse(raw) as OrderUpsertInput;
      sessionStorage.removeItem(DOOR_BUILD_ORDER_DRAFT_STORAGE_KEY);
      const nextLines =
        upsert.lines.length > 0
          ? upsert.lines.map((line) => ({
              ...newLine(),
              kind: line.kind,
              productId: line.productId ?? '',
              productNameText: line.productNameText,
              widthMm: line.widthMm ?? '',
              lengthMm: line.lengthMm ?? '',
              thicknessMm: line.thicknessMm ?? '',
              decorText: line.decorText ?? '',
              productionNote: line.productionNote ?? '',
              quantity: line.quantity,
              unitText: line.unitText,
              discountRate: line.discountRate,
              unitPrice: line.unitPrice,
              saleType: 'CASH' as const,
              priceSource: line.priceSource,
              priceManual: true,
              autoQuoteKey: '',
            }))
          : [newLine()];
      const nextMaterials = (upsert.manualMaterials ?? []).map((item) => ({
        ...newMaterial(),
        lineNo: item.lineNo?.toString() ?? '',
        rawMaterialId: item.rawMaterialId ?? '',
        materialNameText: item.materialNameText,
        thicknessMm: item.thicknessMm ?? '',
        sheetWidthMm: item.sheetWidthMm?.toString() ?? '',
        sheetLengthMm: item.sheetLengthMm?.toString() ?? '',
        surfaceType: item.surfaceType ?? '',
        quantity: item.quantity,
        pieceQuantity: item.pieceQuantity ?? '',
        sheetQuantity: item.sheetQuantity ?? '',
        unitText: item.unitText,
        componentRole: item.componentRole ?? '',
        note: item.note ?? '',
        unverified: Boolean(item.unverified),
      }));
      setMode('edit');
      setOrderId(null);
      setOrderNumber(null);
      setCustomerName(upsert.customerName);
      setCustomerAddress(upsert.customerAddress ?? '');
      setTaxOffice(upsert.taxOffice ?? '');
      setCustomerPhone(upsert.customerPhone ?? '');
      setTaxNumber(upsert.taxNumber ?? '');
      setDocumentDateText(upsert.documentDateText ?? '');
      setVatRate(upsert.vatRate);
      setLines(nextLines);
      setMaterials(nextMaterials);
      setRecordedAuto([]);
      setMaterialBaseline(lineSignature(nextLines));
      setPreview(null);
      setDetail(null);
      setError(null);
      setNotice(
        'Kapı İmalatı aktarımı yüklendi. Kaydetmeden önce birim fiyat ve malzemeleri kontrol edin.',
      );
      setCleanKey(
        JSON.stringify(
          buildPayload({
            customerName: upsert.customerName,
            customerAddress: upsert.customerAddress ?? '',
            taxOffice: upsert.taxOffice ?? '',
            customerPhone: upsert.customerPhone ?? '',
            taxNumber: upsert.taxNumber ?? '',
            documentDateText: upsert.documentDateText ?? '',
            vatRate: upsert.vatRate,
            lines: nextLines,
            materials: nextMaterials,
          }),
        ),
      );
    } catch {
      sessionStorage.removeItem(DOOR_BUILD_ORDER_DRAFT_STORAGE_KEY);
    }
  }, []);

  const loadOrder = async (id: string, nextMode: 'detail' | 'edit') => {
    setBusy(true);
    setError(null);
    try {
      const order = await getOrderDocument(id);
      fillFromOrder(order);
      setMode(nextMode);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const fillFromOrder = (order: OrderDetail) => {
    const nextLines = order.lines.map((line) => ({
      ...newLine(),
      kind: line.kind,
      groupCode: line.productGroupCode ?? '',
      productId: line.productId ?? '',
      productNameText: line.productNameText,
      widthMm: line.widthMm ?? '',
      lengthMm: line.lengthMm ?? '',
      thicknessMm: line.thicknessMm ?? '',
      decorText: line.decorText ?? '',
      productionNote: line.productionNote ?? '',
      quantity: line.quantity,
      unitText: line.unitText,
      discountRate: line.discountRate,
      unitPrice: line.unitPrice,
      saleType: 'CASH' as const,
      priceSource: line.priceSource,
      priceManual: true,
      autoQuoteKey: lineAutoQuoteKey({
        productId: line.productId ?? '',
        widthMm: line.widthMm ?? '',
        lengthMm: line.lengthMm ?? '',
        thicknessMm: line.thicknessMm ?? '',
        saleType: 'CASH',
      }),
    }));
    const nextMaterials = order.materialLines
      .filter((item) => item.source === 'MANUAL')
      .map((item) => ({
        ...newMaterial(),
        lineNo: item.lineNo?.toString() ?? '',
        rawMaterialId: item.rawMaterialId ?? '',
        materialNameText: item.materialNameText,
        thicknessMm: item.thicknessMm ?? '',
        sheetWidthMm: item.sheetWidthMm?.toString() ?? '',
        sheetLengthMm: item.sheetLengthMm?.toString() ?? '',
        surfaceType: item.surfaceType ?? '',
        quantity: item.quantity ?? '',
        pieceQuantity: item.pieceQuantity ?? '',
        sheetQuantity: item.sheetQuantity ?? '',
        unitText: item.unitText ?? 'ADET',
        componentRole: item.componentRole ?? '',
        note: item.note ?? '',
        unverified: item.unverified,
      }));
    setOrderId(order.id);
    setOrderNumber(order.orderNumber);
    setCustomerName(order.customerName);
    setCustomerAddress(order.customerAddress ?? '');
    setTaxOffice(order.taxOffice ?? '');
    setCustomerPhone(order.customerPhone ?? '');
    setTaxNumber(order.taxNumber ?? '');
    setDocumentDateText(order.documentDateText ?? '');
    setVatRate(order.vatRate);
    setLines(nextLines);
    setMaterials(nextMaterials);
    setDetail(order);
    setRecordedAuto(order.materialLines.filter((item) => item.source !== 'MANUAL'));
    setMaterialBaseline(lineSignature(order.lines));
    setCleanKey(JSON.stringify(buildPayload({
      customerName: order.customerName,
      customerAddress: order.customerAddress ?? '',
      taxOffice: order.taxOffice ?? '',
      customerPhone: order.customerPhone ?? '',
      taxNumber: order.taxNumber ?? '',
      documentDateText: order.documentDateText ?? '',
      vatRate: order.vatRate,
      lines: nextLines,
      materials: nextMaterials,
    })));
  };

  const leaveToList = () => {
    if (dirty && !window.confirm('Kaydedilmemiş değişiklikler var. Ekrandan çıkılsın mı?')) return;
    setMode('list');
    void reloadList().catch((err) => setError(messageOf(err)));
  };

  const moveLine = (index: number, direction: -1 | 1) => {
    setLines((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const removeLine = (key: string, index: number) => {
    if (!window.confirm(`Satır ${index + 1} silinsin mi?`)) return;
    setLines((current) => current.filter((item) => item.key !== key));
  };

  const printSaved = async (
    id: string,
    variant: 'customer-priced' | 'workshop-material' | 'combined' = 'combined',
  ) => {
    setError(null);
    try {
      await openOrderPrint(id, variant);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const save = async () => {
    if (saveLock.current) return;
    const validationError = validateOrderInput(payload);
    if (validationError) {
      setError(validationError);
      return;
    }
    saveLock.current = true;
    const creating = orderId == null;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = creating
        ? await createOrderDocument(payload)
        : await updateOrderDocument(orderId, payload);
      fillFromOrder(saved);
      setNotice(
        creating
          ? `Sipariş ${saved.orderNumber} oluşturuldu.`
          : `Sipariş ${saved.orderNumber} güncellendi. Numara aynı kaldı.`,
      );
      await reloadList();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  };

  const recalculate = async () => {
    if (!orderId) return;
    const accepted = window.confirm(
      'Kayıtlı otomatik malzeme satırları güncel reçete ve NET değerleriyle değişir. Manuel malzeme satırları korunur. Satış fiyatı değişmez.',
    );
    if (!accepted) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await recalculateOrderMaterials(orderId);
      fillFromOrder(saved);
      setNotice('Otomatik malzeme satırları yeniden hesaplandı. Manuel satırlar duruyor.');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        const catalogChanged =
          patch.productId !== undefined ||
          patch.widthMm !== undefined ||
          patch.lengthMm !== undefined ||
          patch.thicknessMm !== undefined ||
          patch.saleType !== undefined ||
          patch.groupCode !== undefined;
        if (catalogChanged && patch.priceManual === undefined && patch.unitPrice === undefined) {
          next.priceManual = false;
        }
        return next;
      }),
    );
  };

  const fetchLineSalePrice = async (line: DraftLine, force = false) => {
    if (line.kind !== 'CATALOG' || !line.productId || !line.widthMm || !line.lengthMm) {
      return;
    }
    const key = lineAutoQuoteKey(line);
    if (!force && line.priceManual && line.autoQuoteKey === key) {
      return;
    }
    if (!force && line.autoQuoteKey === key && line.unitPrice.trim() !== '') {
      return;
    }
    try {
      const quote = await quoteOrderCost({
        productId: line.productId,
        quantity: 1,
        widthMm: line.widthMm,
        lengthMm: line.lengthMm,
        thicknessMm: line.thicknessMm || undefined,
        materialPriceType: suggestionBasis,
      });
      const applied = applySalePrice(
        line.saleType,
        quote.unitCashPrice,
        quote.unitCardPrice,
      );
      updateLine(line.key, {
        cashSuggestion: quote.unitCashPrice,
        cardSuggestion: quote.unitCardPrice,
        unitPrice: applied.unitPrice,
        priceSource: applied.priceSource,
        suggestionNote:
          applied.suggestionNote ||
          quote.salePriceMessage ||
          quote.cardPriceMessage ||
          '',
        priceManual: false,
        autoQuoteKey: key,
      });
    } catch (err) {
      updateLine(line.key, {
        cashSuggestion: null,
        cardSuggestion: null,
        suggestionNote: messageOf(err),
        autoQuoteKey: key,
      });
    }
  };

  const scheduleAutoQuote = (line: DraftLine) => {
    if (line.kind !== 'CATALOG' || !line.productId || !line.widthMm || !line.lengthMm) {
      return;
    }
    const key = lineAutoQuoteKey(line);
    if (line.priceManual && line.autoQuoteKey === key) return;
    if (line.autoQuoteKey === key && line.unitPrice.trim() !== '') return;
    const existing = autoQuoteTimers.current.get(line.key);
    if (existing != null) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      autoQuoteTimers.current.delete(line.key);
      setLines((current) => {
        const latest = current.find((row) => row.key === line.key);
        if (latest) void fetchLineSalePrice(latest);
        return current;
      });
    }, 250);
    autoQuoteTimers.current.set(line.key, timer);
  };

  useEffect(() => {
    for (const line of lines) {
      scheduleAutoQuote(line);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- satır kimliği/ölçü değişince tetiklenir
  }, [
    lines
      .map((l) =>
        [
          l.key,
          l.kind,
          l.productId,
          l.widthMm,
          l.lengthMm,
          l.thicknessMm,
          l.saleType,
          l.priceManual,
          suggestionBasis,
        ].join(':'),
      )
      .join('|'),
  ]);

  const suggest = async (line: DraftLine) => {
    await fetchLineSalePrice(line, true);
  };

  if (mode === 'list') {
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    return (
      <section className="order-layout">
        <div className="order-toolbar">
          <button type="button" className="primary" onClick={startNew}>
            Yeni Sipariş
          </button>
        </div>
        <form
          className="order-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void reloadList({ q: listQuery, dateFrom, dateTo, page: 1 }).catch((err) => setError(messageOf(err)));
          }}
        >
          <label>
            Ara
            <input
              value={listQuery}
              placeholder="Sipariş no veya müşteri"
              onChange={(event) => setListQuery(event.target.value)}
            />
          </label>
          <label>
            Kayıt başlangıç
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label>
            Kayıt bitiş
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
          <button type="submit">Filtrele</button>
        </form>
        <p className="order-note">
          Sipariş tarihi, formdaki D.T. metnidir. Tarih filtresi kaydın oluşturulduğu güne göredir.
        </p>
        {error ? <p className="status error">{error}</p> : null}
        <div className="order-table-wrap">
        <table className="order-table">
          <thead>
            <tr>
              <th>Sipariş no</th>
              <th>Müşteri</th>
              <th>D.T.</th>
              <th>Satır</th>
              <th>Toplam miktar</th>
              <th>Genel toplam</th>
              <th>Son güncelleme</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8}>Kayıtlı sipariş yok.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>{item.orderNumber}</td>
                  <td>{item.customerName}</td>
                  <td>{item.documentDateText ?? '—'}</td>
                  <td>{item.lineCount}</td>
                  <td>{item.totalQuantityDisplay}</td>
                  <td>{item.grandTotalDisplay}</td>
                  <td>{new Date(item.updatedAt).toLocaleString('tr-TR')}</td>
                  <td className="order-actions">
                    <button type="button" className="link" onClick={() => void loadOrder(item.id, 'detail')}>
                      Detay
                    </button>
                    <button type="button" className="link" onClick={() => void loadOrder(item.id, 'edit')}>
                      Düzenle
                    </button>
                    <button type="button" className="link" onClick={() => void printSaved(item.id, 'combined')}>
                      Formu Oluştur
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
        <div className="order-toolbar">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => void reloadList({ page: page - 1 }).catch((err) => setError(messageOf(err)))}
          >
            Önceki
          </button>
          <span>
            Sayfa {page} / {pageCount} · {total} sipariş
          </span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => void reloadList({ page: page + 1 }).catch((err) => setError(messageOf(err)))}
          >
            Sonraki
          </button>
        </div>
      </section>
    );
  }

  if (mode === 'detail' && detail) {
    return (
      <section className="order-layout">
        <div className="order-toolbar">
          <button type="button" onClick={leaveToList}>Sipariş Listesi</button>
          <button type="button" className="primary" onClick={() => setMode('edit')}>Düzenle</button>
          <button type="button" className="primary" onClick={() => void printSaved(detail.id, 'combined')}>
            Formu Oluştur
          </button>
        </div>
        <p>Sipariş no: {detail.orderNumber}. Bu numara müşteri formuna basılmaz.</p>
        <p className="order-note">
          Formu Oluştur: tek A4’te üst müşteri / alt üretim. Yazdır penceresinde hedef olarak PDF kaydetmeyi seçin.
        </p>
        {error ? <p className="status error">{error}</p> : null}
        <div className="card order-grid">
          <p><strong>Müşteri / Firma</strong> {detail.customerName}</p>
          <p><strong>D.T.</strong> {detail.documentDateText ?? '—'}</p>
          <p><strong>Müşteri adresi</strong> {detail.customerAddress ?? '—'}</p>
          <p><strong>V.D.</strong> {detail.taxOffice ?? '—'}</p>
          <p><strong>TEL.</strong> {detail.customerPhone ?? '—'}</p>
          <p><strong>VERGİ NO</strong> {detail.taxNumber ?? '—'}</p>
        </div>
        <div className="order-table-wrap">
        <table className="order-table">
          <thead>
            <tr>
              <th>S.NO</th>
              <th>ÜRÜN ADI</th>
              <th>MİKTAR</th>
              <th>BİRİM FİYATI</th>
              <th>İSKONTO</th>
              <th>TUTAR</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((line) => (
              <tr key={line.lineNo}>
                <td>{line.lineNo}</td>
                <td>{line.productNameText}</td>
                <td>{line.quantity} {line.unitText}</td>
                <td>{line.unitPriceDisplay}</td>
                <td>{line.lineDiscountAmountDisplay}</td>
                <td>{line.lineAmountDisplay}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <table className="order-totals">
          <tbody>
            <tr><th>GENEL TOPLAM</th><td>{detail.grossTotalDisplay}</td></tr>
            <tr><th>İSKONTO</th><td>{detail.discountAmountDisplay}</td></tr>
            <tr><th>ARA TOPLAM</th><td>{detail.netTotalDisplay}</td></tr>
            <tr><th>{detail.vatLabel}</th><td>{detail.vatAmountDisplay}</td></tr>
            <tr><th>YENİ TOPLAM</th><td>{detail.grandTotalDisplay}</td></tr>
          </tbody>
        </table>
        <h2>Malzemeler</h2>
        <ul>
          {detail.materialLines.map((item, index) => (
            <li key={`${item.lineNo ?? 'x'}-${index}`}>{materialLineText(item)}</li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="order-layout">
      <div className="order-toolbar">
        <button type="button" onClick={leaveToList}>
          Sipariş Listesi
        </button>
        <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
          Kaydet
        </button>
        {orderId ? (
          <>
            <button type="button" className="primary" onClick={() => void printSaved(orderId, 'combined')}>
              Formu Oluştur
            </button>
            <button type="button" disabled={busy} onClick={() => void recalculate()}>
              Otomatik malzemeyi yeniden hesapla
            </button>
          </>
        ) : null}
      </div>
      {orderNumber ? <p>Sipariş no: {orderNumber}. Bu numara müşteri formuna basılmaz.</p> : null}
      {dirty ? <p className="order-note">Kaydedilmemiş değişiklik var.</p> : null}
      <p className="order-note">
        Birim satış fiyatları KDV hariç kabul edilir. KDV, iskonto sonrası ara toplamın üzerine eklenir.
        KDV oranı boş bırakılırsa %0 sayılmaz. D.T. alanı tarih türüne çevrilmez; forma yazıldığınız metin başlıkta görünür.
        Zirve Ahşap firma bilgileri çıktı şablonundan gelir; aşağıdaki alanlar müşteriye aittir.
      </p>
      {error ? <p className="status error">{error}</p> : null}
      {notice ? <p className="status ok">{notice}</p> : null}

      <div className="card order-grid">
        <label>
          Müşteri / Firma
          <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
        </label>
        <label>
          D.T.
          <input
            value={documentDateText}
            placeholder="06.01.2026"
            onChange={(event) => setDocumentDateText(event.target.value)}
          />
        </label>
        <label>
          Müşteri adresi
          <input value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)} />
        </label>
        <label>
          V.D.
          <input value={taxOffice} onChange={(event) => setTaxOffice(event.target.value)} />
        </label>
        <label>
          TEL. :
          <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
        </label>
        <label>
          VERGİ NO
          <input value={taxNumber} onChange={(event) => setTaxNumber(event.target.value)} />
        </label>
        <label>
          KDV oranı %
          <input value={vatRate} onChange={(event) => setVatRate(event.target.value)} />
        </label>
        <label>
          Maliyet hesabı MDF alış türü
          <select
            value={suggestionBasis}
            onChange={(event) => setSuggestionBasis(event.target.value as MaterialPriceType)}
          >
            <option value="CASH">Peşin alış</option>
            <option value="CARD_INSTALLMENT">Kart / taksitli alış</option>
          </select>
        </label>
      </div>

      {lines.map((line, index) => (
        <LineEditor
          key={line.key}
          index={index}
          line={line}
          catalog={catalog}
          canRemove={lines.length > 1}
          onChange={(patch) => updateLine(line.key, patch)}
          onRemove={() => removeLine(line.key, index)}
          onMove={(direction) => moveLine(index, direction)}
          canMoveUp={index > 0}
          canMoveDown={index < lines.length - 1}
          onSuggest={() => void suggest(line)}
        />
      ))}
      <div className="order-actions">
        <button type="button" onClick={() => setLines((current) => [...current, newLine()])}>
          Satır ekle
        </button>
      </div>

      <h2>Manuel malzeme</h2>
      <p>
        Otomatik satırlar kayıtlı üretim bilgisidir. Ürün veya miktar değişmeden sipariş kaydedilince
        onlar korunur. Yeniden hesaplama eski otomatik satırları güncel kaynakla değiştirir; manuel
        satırlar kalır. Eksik miktar 0 gösterilmez.
      </p>
      {materials.map((item) => (
        <div key={item.key} className="order-line">
          <div className="order-fields">
            <label>
              Satır no
              <input
                value={item.lineNo}
                onChange={(event) =>
                  setMaterials((current) =>
                    current.map((row) =>
                      row.key === item.key ? { ...row, lineNo: event.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <label>
              Katalog malzemesi
              <select
                value={item.rawMaterialId}
                onChange={(event) => {
                  const selected = rawMaterials.find((material) => material.id === event.target.value);
                  setMaterials((current) =>
                    current.map((row) =>
                      row.key === item.key
                        ? {
                            ...row,
                            rawMaterialId: selected?.id ?? '',
                            materialNameText: selected?.name ?? row.materialNameText,
                            thicknessMm: selected ? String(selected.thicknessMm) : row.thicknessMm,
                            sheetWidthMm: selected ? String(selected.sheetWidthMm) : row.sheetWidthMm,
                            sheetLengthMm: selected ? String(selected.sheetLengthMm) : row.sheetLengthMm,
                            surfaceType: selected?.surfaceType ?? row.surfaceType,
                          }
                        : row,
                    ),
                  );
                }}
              >
                <option value="">Serbest açıklama</option>
                {rawMaterials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name} · {material.thicknessMm} mm · {material.sheetWidthMm}×{material.sheetLengthMm}
                    {material.surfaceType ? ` · ${material.surfaceType}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Malzeme adı
              <input
                value={item.materialNameText}
                onChange={(event) =>
                  setMaterials((current) =>
                    current.map((row) =>
                      row.key === item.key
                        ? { ...row, materialNameText: event.target.value, rawMaterialId: '' }
                        : row,
                    ),
                  )
                }
              />
            </label>
            <label>
              Kalınlık mm
              <input
                value={item.thicknessMm}
                onChange={(event) =>
                  setMaterials((current) =>
                    current.map((row) =>
                      row.key === item.key ? { ...row, thicknessMm: event.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <label>
              Tabaka en mm
              <input
                value={item.sheetWidthMm}
                onChange={(event) =>
                  setMaterials((current) =>
                    current.map((row) =>
                      row.key === item.key ? { ...row, sheetWidthMm: event.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <label>
              Tabaka boy mm
              <input
                value={item.sheetLengthMm}
                onChange={(event) =>
                  setMaterials((current) =>
                    current.map((row) =>
                      row.key === item.key ? { ...row, sheetLengthMm: event.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <label>
              Yüzey
              <input
                value={item.surfaceType}
                onChange={(event) =>
                  setMaterials((current) =>
                    current.map((row) =>
                      row.key === item.key ? { ...row, surfaceType: event.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <label>
              Miktar
              <input
                value={item.quantity}
                onChange={(event) =>
                  setMaterials((current) =>
                    current.map((row) =>
                      row.key === item.key ? { ...row, quantity: event.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <label>
              Birim
              <input
                value={item.unitText}
                onChange={(event) =>
                  setMaterials((current) =>
                    current.map((row) =>
                      row.key === item.key ? { ...row, unitText: event.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <label>
              Açıklama
              <input
                value={item.note}
                onChange={(event) =>
                  setMaterials((current) =>
                    current.map((row) =>
                      row.key === item.key ? { ...row, note: event.target.value } : row,
                    ),
                  )
                }
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => setMaterials((current) => current.filter((row) => row.key !== item.key))}
          >
            Malzemeyi sil
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setMaterials((current) => [...current, newMaterial()])}>
        Manuel malzeme ekle
      </button>

      <h2>Önizleme</h2>
      <p>Tutarlar kayıt öncesinde sunucudaki hesapla gösterilir.</p>
      {previewError ? <p className="status error">{previewError}</p> : null}
      {preview ? (
        <div className="order-table-wrap">
        <table className="order-table">
          <thead>
            <tr>
              <th>S.NO</th>
              <th>ÜRÜN</th>
              <th>MİKTAR</th>
              <th>BİRİM FİYATI</th>
              <th>İSKONTO</th>
              <th>TUTAR</th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.map((line) => (
              <tr key={line.lineNo}>
                <td>{line.lineNo}</td>
                <td>{line.productNameText}</td>
                <td>{line.quantity} {line.unitText}</td>
                <td>{line.unitPriceDisplay}</td>
                <td>{line.lineDiscountAmountDisplay}</td>
                <td>{line.lineAmountDisplay}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : null}
      <table className="order-totals">
        <tbody>
          <tr>
            <th>GENEL TOPLAM</th>
            <td>{preview?.grossTotalDisplay ?? '—'}</td>
          </tr>
          <tr>
            <th>İSKONTO</th>
            <td>{preview?.discountAmountDisplay ?? '—'}</td>
          </tr>
          <tr>
            <th>ARA TOPLAM</th>
            <td>{preview?.netTotalDisplay ?? '—'}</td>
          </tr>
          <tr>
            <th>{preview?.vatLabel ?? 'KDV'}</th>
            <td>{preview?.vatAmountDisplay ?? '—'}</td>
          </tr>
          <tr>
            <th>YENİ TOPLAM</th>
            <td>{preview?.grandTotalDisplay ?? '—'}</td>
          </tr>
        </tbody>
      </table>
      {preview?.warnings?.map((warning) => (
        <p key={warning} className="status error">{warning}</p>
      ))}
      {shownMaterials.length > 0 ? (
        <ul>
          {shownMaterials.map((item, index) => (
            <li key={`${item.lineNo ?? 'x'}-${item.source}-${index}`}>
              {materialLineText(item)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function LineEditor(props: {
  index: number;
  line: DraftLine;
  catalog: OrderCatalog | null;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onSuggest: () => void;
}) {
  const { line, catalog } = props;
  const group = catalog?.groups.find((item) => item.code === line.groupCode);
  const sizes =
    line.groupCode === 'door_frame'
      ? catalog?.doorFrameSizes[group?.products.find((item) => item.id === line.productId)?.code ?? ''] ?? []
      : catalog?.groupSizes[line.groupCode] ?? [];

  return (
    <article className="order-line">
      <div className="order-line-head">
        <strong>Satır {props.index + 1}</strong>
        <span className="order-actions">
          <button type="button" disabled={!props.canMoveUp} onClick={() => props.onMove(-1)}>
            Yukarı
          </button>
          <button type="button" disabled={!props.canMoveDown} onClick={() => props.onMove(1)}>
            Aşağı
          </button>
          {props.canRemove ? (
            <button type="button" onClick={props.onRemove}>
              Satırı sil
            </button>
          ) : null}
        </span>
      </div>
      <div className="order-fields">
        <label>
          Satır türü
          <select
            value={line.kind}
            onChange={(event) =>
              props.onChange({
                kind: event.target.value as DraftLine['kind'],
                productId: '',
                groupCode: '',
              })
            }
          >
            <option value="CATALOG">Katalog</option>
            <option value="FREE_TEXT">Serbest ürün</option>
          </select>
        </label>
        {line.kind === 'CATALOG' ? (
          <>
            <label>
              Ürün grubu
              <select
                value={line.groupCode}
                onChange={(event) =>
                  props.onChange({ groupCode: event.target.value, productId: '' })
                }
              >
                <option value="">Seçin</option>
                {catalog?.groups.map((item) => (
                  <option key={item.id} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ürün
              <select
                value={line.productId}
                onChange={(event) => {
                  const product = group?.products.find((item) => item.id === event.target.value);
                  props.onChange({
                    productId: event.target.value,
                    productNameText: product?.name ?? line.productNameText,
                    groupCode: line.groupCode,
                  });
                }}
              >
                <option value="">Seçin</option>
                {group?.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <label>
          ÜRÜN ADI
          <input
            value={line.productNameText}
            onChange={(event) => props.onChange({ productNameText: event.target.value })}
          />
        </label>
        <label>
          Ölçü
          <select
            value={`${line.widthMm}x${line.lengthMm}`}
            onChange={(event) => {
              const [widthMm, lengthMm] = event.target.value.split('x');
              props.onChange({ widthMm: widthMm ?? '', lengthMm: lengthMm ?? '' });
            }}
          >
            <option value="x">Elle</option>
            {sizes.map((size) => (
              <option key={`${size.widthMm}x${size.lengthMm}`} value={`${size.widthMm}x${size.lengthMm}`}>
                {size.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          En mm
          <input value={line.widthMm} onChange={(event) => props.onChange({ widthMm: event.target.value })} />
        </label>
        <label>
          Boy mm
          <input value={line.lengthMm} onChange={(event) => props.onChange({ lengthMm: event.target.value })} />
        </label>
        {line.groupCode !== 'door_frame' ? (
          <label>
            Kalınlık mm
            <input
              value={line.thicknessMm}
              list={line.groupCode === 'CITA' ? 'cita-thickness' : undefined}
              onChange={(event) => props.onChange({ thicknessMm: event.target.value })}
            />
          </label>
        ) : null}
        <label>
          MİKTAR
          <input value={line.quantity} onChange={(event) => props.onChange({ quantity: event.target.value })} />
        </label>
        <label>
          BİRİM
          <input value={line.unitText} onChange={(event) => props.onChange({ unitText: event.target.value })} />
        </label>
        <label>
          İSK.%
          <input
            value={line.discountRate}
            onChange={(event) => props.onChange({ discountRate: event.target.value })}
          />
        </label>
        <label>
          BİRİM FİYATI
          <input
            value={line.unitPrice}
            onChange={(event) =>
              props.onChange({
                unitPrice: event.target.value,
                priceSource: 'ENTERED',
                priceManual: true,
              })
            }
          />
        </label>
        <label>
          Satış türü
          <select
            value={line.saleType}
            onChange={(event) =>
              props.onChange({
                saleType: event.target.value as DraftLine['saleType'],
                priceManual: false,
              })
            }
          >
            <option value="CASH">Nakit satış</option>
            <option value="CARD">Kart / Taksit satış</option>
          </select>
        </label>
        <label>
          Dekor / renk
          <input value={line.decorText} onChange={(event) => props.onChange({ decorText: event.target.value })} />
        </label>
        <label>
          Üretim notu
          <input
            value={line.productionNote}
            onChange={(event) => props.onChange({ productionNote: event.target.value })}
          />
        </label>
      </div>
      {line.groupCode === 'CITA' ? (
        <datalist id="cita-thickness">
          {catalog?.citaThicknessesMm.map((thickness) => (
            <option key={thickness} value={thickness} />
          ))}
        </datalist>
      ) : null}
      {line.kind === 'CATALOG' ? (
        <div className="order-suggest">
          <button type="button" onClick={props.onSuggest}>
            Fiyatı Yenile
          </button>
          {line.cashSuggestion ? <span>Nakit: {line.cashSuggestion}</span> : null}
          {line.cardSuggestion ? <span>Kart: {line.cardSuggestion}</span> : null}
          {line.suggestionNote ? <span>{line.suggestionNote}</span> : null}
        </div>
      ) : null}
    </article>
  );
}

function buildPayload(input: {
  customerName: string;
  customerAddress: string;
  taxOffice: string;
  customerPhone: string;
  taxNumber: string;
  documentDateText: string;
  vatRate: string;
  lines: DraftLine[];
  materials: DraftMaterial[];
}): OrderUpsertInput {
  return {
    customerName: input.customerName,
    customerAddress: input.customerAddress || undefined,
    taxOffice: input.taxOffice || undefined,
    customerPhone: input.customerPhone || undefined,
    taxNumber: input.taxNumber || undefined,
    documentDateText: input.documentDateText || undefined,
    vatRate: input.vatRate,
    lines: input.lines.map((line) => ({
      kind: line.kind,
      productId: line.kind === 'CATALOG' ? line.productId || undefined : undefined,
      productNameText: line.productNameText,
      widthMm: line.widthMm || undefined,
      lengthMm: line.lengthMm || undefined,
      thicknessMm: line.thicknessMm || undefined,
      decorText: line.decorText || undefined,
      productionNote: line.productionNote || undefined,
      quantity: line.quantity,
      unitText: line.unitText,
      discountRate: line.discountRate,
      unitPrice: line.unitPrice,
      priceSource: line.priceSource,
    })),
    manualMaterials: input.materials
      .filter((item) => item.materialNameText.trim() && item.quantity.trim())
      .map((item) => ({
        lineNo: item.lineNo ? Number(item.lineNo) : undefined,
        rawMaterialId: item.rawMaterialId || undefined,
        materialNameText: item.materialNameText,
        thicknessMm: item.thicknessMm || undefined,
        sheetWidthMm: item.sheetWidthMm ? Number(item.sheetWidthMm) : undefined,
        sheetLengthMm: item.sheetLengthMm ? Number(item.sheetLengthMm) : undefined,
        surfaceType: item.surfaceType || undefined,
        quantity: item.quantity,
        pieceQuantity: item.pieceQuantity || undefined,
        sheetQuantity: item.sheetQuantity || undefined,
        unitText: item.unitText,
        componentRole: item.componentRole || undefined,
        note: item.note || undefined,
        unverified: item.unverified || undefined,
      })),
  };
}

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'İşlem tamamlanamadı.';
}

function lineSignature(
  rows: Array<{
    kind: string;
    productId?: string | null;
    widthMm?: string | null;
    lengthMm?: string | null;
    thicknessMm?: string | null;
    quantity: string;
  }>,
): string {
  return rows
    .map((line) =>
      [
        line.kind,
        line.productId ?? '',
        line.widthMm ?? '',
        line.lengthMm ?? '',
        line.thicknessMm ?? '',
        line.quantity,
      ].join('|'),
    )
    .join('\n');
}

function materialLineText(item: OrderPreviewMaterial): string {
  if (item.unverified) {
    return `Satır ${item.lineNo ?? '—'}: ${item.note ?? 'Malzeme miktarı doğrulanamadı.'}`;
  }
  const pieces = item.pieceQuantity ?? item.quantity ?? '';
  const sheets = item.sheetQuantity ? `, tabaka ${item.sheetQuantity}` : '';
  const source = item.source === 'MANUAL' ? 'Manuel' : 'Otomatik';
  return `Satır ${item.lineNo ?? '—'}: ${item.materialNameText} ${pieces} ${item.unitText ?? ''}${sheets} (${source})`;
}

function validateOrderInput(input: OrderUpsertInput): string | null {
  if (input.vatRate.trim() === '') {
    return 'KDV oranı girilmedi. Boş oran %0 olarak kabul edilmez.';
  }
  const vat = classifyDecimal(input.vatRate);
  if (vat === 'invalid') return 'KDV oranı geçerli bir sayı olmalıdır.';
  if (vat === 'negative') return 'KDV oranı negatif olamaz.';
  for (const line of input.lines) {
    const quantity = classifyDecimal(line.quantity);
    if (quantity === 'invalid') return 'Miktar geçerli bir sayı olmalıdır.';
    if (quantity === 'negative' || quantity === 'zero') return 'Miktar 0’dan büyük olmalıdır.';
    if (line.unitPrice.trim() === '') {
      return 'Birim fiyat girilmedi. Tanımsız satış fiyatı 0 TL yapılmaz.';
    }
    const price = classifyDecimal(line.unitPrice);
    if (price === 'invalid') return 'Birim fiyat geçerli bir sayı olmalıdır.';
    if (price === 'negative') return 'Birim fiyat negatif olamaz.';
    const discount = classifyDecimal(line.discountRate);
    if (discount === 'invalid') return 'İskonto yüzdesi geçerli bir sayı olmalıdır.';
    if (discount === 'negative') return 'İskonto yüzdesi negatif olamaz.';
    if (discount === 'over100') return 'İskonto %100’ü aşamaz.';
  }
  for (const material of input.manualMaterials ?? []) {
    const quantity = classifyDecimal(material.quantity);
    if (quantity === 'invalid' || quantity === 'negative' || quantity === 'zero') {
      return 'Manuel malzeme miktarı 0’dan büyük olmalıdır.';
    }
  }
  return null;
}

function classifyDecimal(raw: string): 'ok' | 'negative' | 'zero' | 'over100' | 'invalid' {
  const text = raw.trim().replace(',', '.');
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return 'invalid';
  if (text.startsWith('-')) return 'negative';
  const [whole, fraction = ''] = text.split('.');
  const digits = whole.replace(/^0+/, '') || '0';
  if (digits === '0' && !/[1-9]/.test(fraction)) return 'zero';
  if (digits.length > 3 || (digits.length === 3 && digits > '100') || (digits === '100' && /[1-9]/.test(fraction))) {
    return 'over100';
  }
  return 'ok';
}
