import { useEffect, useId, useRef, useState } from 'react';
import {
  DOOR_BUILD_MANUAL_COST_OPTIONS,
  DOOR_BUILD_ORDER_DRAFT_STORAGE_KEY,
  previewDoorBuildWorkshop,
  quoteDoorBuild,
  transferDoorBuildToOrderDraft,
  type DoorBuildHeaderSelection,
  type DoorBuildManualCostCode,
  type DoorBuildManualCostScope,
  type DoorBuildMaterialDraftLine,
  type DoorBuildPervazSelection,
  type DoorBuildQuoteRequest,
  type DoorBuildQuoteResult,
  type DoorBuildSalePriceSource,
} from '../api/door-build-api';
import {
  createOrderDocument,
  openOrderPrint,
} from '../api/order-documents-api';
import {
  fetchAyarliPervazMdfCosts,
  fetchDekoratifGenisKilcikCosts,
  fetchDekoratifPervazCosts,
  fetchDoorFrameMdfCosts,
  type DoorFrameMdfRow,
} from '../api/cost-calculation-api';
import { getDoorBuildPricingSetting } from '../api/pricing-settings-api';
import { listRawMaterials, type RawMaterial } from '../api/raw-materials-api';
import {
  DEFAULT_MATERIAL_PRICE_TYPE,
  materialPriceTypeLabel,
  type MaterialPriceType,
} from '../lib/material-price-type';
import {
  formatCoefficientDisplay,
  formatMoneyDisplay,
  formatMoneyDisplayOrDash,
  formatPercentDisplay,
  formatQuantityDisplay,
} from '../lib/door-build-display';
import './door-build-page.css';

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type FrameCode = '34_MM' | '30_MM';
type PervazCode = DoorBuildPervazSelection['productCode'];

type SizePreset = {
  heightCm: 210 | 250;
  widthCm: 90;
  label: string;
};

const SIZE_PRESETS: SizePreset[] = [
  { heightCm: 210, widthCm: 90, label: '210 × 90 cm' },
  { heightCm: 250, widthCm: 90, label: '250 × 90 cm' },
];

type ManualCostState = {
  included: boolean;
  amount: string;
  scope: DoorBuildManualCostScope;
};

function emptyManualCosts(): Record<DoorBuildManualCostCode, ManualCostState> {
  return DOOR_BUILD_MANUAL_COST_OPTIONS.reduce(
    (acc, option) => {
      acc[option.code] = { included: false, amount: '', scope: 'PER_DOOR' };
      return acc;
    },
    {} as Record<DoorBuildManualCostCode, ManualCostState>,
  );
}

/** Yüzey kesim boy bandı: 210 cm veya >210–250 cm (en bağımsız). */
function isVerifiedSurfaceHeightCm(heightCm: number): boolean {
  return (
    Number.isInteger(heightCm) &&
    (heightCm === 210 || (heightCm > 210 && heightCm <= 250))
  );
}

function formatMoney(value: string): string {
  return formatMoneyDisplay(value);
}

function formatMoneyOrDash(value: string | null | undefined): string {
  return formatMoneyDisplayOrDash(value);
}

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 1, label: '1. Ölçü' },
  { id: 2, label: '2. MDF' },
  { id: 3, label: '3. Kasa' },
  { id: 4, label: '4. Pervaz' },
  { id: 5, label: '5. Ekler' },
  { id: 6, label: '6. Fiyat' },
  { id: 7, label: '7. Sonuç' },
];

const FRAME_CHOICES: Array<{ code: FrameCode; label: string }> = [
  { code: '34_MM', label: '34 MM' },
  { code: '30_MM', label: '30 MM' },
];

const PERVAZ_CHOICES: Array<{ code: PervazCode; label: string }> = [
  { code: 'AYARLI_PERVAZ', label: 'Ayarlı Pervaz' },
  { code: 'DEKORATIF_PERVAZ', label: 'Dekoratif Pervaz' },
  { code: 'DEKORATIF_PERVAZ_GENIS_KILCIK', label: 'Dekoratif Geniş Kılçık' },
];

const SALE_SOURCE_CHOICES: Array<{
  value: DoorBuildSalePriceSource;
  label: string;
}> = [
  { value: 'CASH', label: 'Nakit Satış' },
  { value: 'CARD', label: 'Kart / Taksit' },
  { value: 'MANUAL', label: 'Manuel' },
];

type PhysicalMaterialState = {
  key: string;
  materialNameText: string;
  thicknessMm: string;
  sheetWidthMm: string;
  sheetLengthMm: string;
  surfaceType: string;
  quantity: string;
  unitText: string;
  note: string;
};

function emptyPhysical(): PhysicalMaterialState {
  return {
    key: crypto.randomUUID(),
    materialNameText: '',
    thicknessMm: '',
    sheetWidthMm: '',
    sheetLengthMm: '',
    surfaceType: '',
    quantity: '',
    unitText: 'ADET',
    note: '',
  };
}

function materialSections(draft: DoorBuildMaterialDraftLine[]) {
  return {
    surface: draft.filter((l) => l.role === 'YUZAY_MDF'),
    frame: draft.filter((l) => l.role === 'FRAME'),
    side: draft.filter((l) => l.role === 'SIDE_TRIM'),
    header: draft.filter((l) => l.role === 'HEADER'),
    physical: draft.filter((l) => l.role === 'MANUAL_PHYSICAL'),
  };
}

type PervazMeasure = {
  key: string;
  thicknessMm: string;
  widthMm: string;
  lengthMm: string;
  label: string;
};

function rowToMeasure(row: {
  thicknessMm: number | string;
  widthMm: number | string;
  lengthMm: number | string;
  productCode?: string;
}): PervazMeasure {
  const thicknessMm = String(row.thicknessMm);
  const widthMm = String(row.widthMm);
  const lengthMm = String(row.lengthMm);
  const widthCm = toDecimalDisplayCm(widthMm);
  const lengthCm = toDecimalDisplayCm(lengthMm);
  return {
    key: `${thicknessMm}-${widthMm}-${lengthMm}`,
    thicknessMm,
    widthMm,
    lengthMm,
    label: `${thicknessMm} mm · ${widthCm}×${lengthCm} cm`,
  };
}

function toDecimalDisplayCm(mm: string): string {
  const n = Number(mm);
  if (!Number.isFinite(n)) return mm;
  const cm = n / 10;
  return Number.isInteger(cm) ? String(cm) : String(cm);
}

async function loadPervazMeasures(
  productCode: PervazCode,
  materialPriceType: MaterialPriceType,
): Promise<PervazMeasure[]> {
  if (productCode === 'AYARLI_PERVAZ') {
    const res = await fetchAyarliPervazMdfCosts(materialPriceType);
    return res.rows
      .filter((row) => row.productCode === 'AYARLI_PERVAZ')
      .map(rowToMeasure);
  }
  if (productCode === 'DEKORATIF_PERVAZ') {
    const res = await fetchDekoratifPervazCosts(materialPriceType);
    return res.rows
      .filter((row) => row.productCode === 'DEKORATIF_PERVAZ')
      .map(rowToMeasure);
  }
  const res = await fetchDekoratifGenisKilcikCosts(materialPriceType);
  return res.rows
    .filter((row) => row.productCode === 'DEKORATIF_PERVAZ_GENIS_KILCIK')
    .map(rowToMeasure);
}

export function DoorBuildPage(props: { onNavigateToOrders?: () => void }) {
  const [step, setStep] = useState<Step>(1);
  const [heightCm, setHeightCm] = useState('210');
  const [widthCm, setWidthCm] = useState('90');
  const [quantityText, setQuantityText] = useState('1');
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(
    null,
  );
  const [materialPriceType, setMaterialPriceType] = useState<MaterialPriceType>(
    DEFAULT_MATERIAL_PRICE_TYPE,
  );

  const [frameEnabled, setFrameEnabled] = useState(false);
  const [frameCode, setFrameCode] = useState<FrameCode>('34_MM');
  const [frameRows, setFrameRows] = useState<DoorFrameMdfRow[]>([]);
  const [frameSizeKey, setFrameSizeKey] = useState('');
  const [frameUnitsPerDoor, setFrameUnitsPerDoor] = useState('2.5');
  const [frameLoadError, setFrameLoadError] = useState<string | null>(null);

  const [sideEnabled, setSideEnabled] = useState(false);
  const [sideProduct, setSideProduct] = useState<PervazCode>('AYARLI_PERVAZ');
  const [sideMeasures, setSideMeasures] = useState<PervazMeasure[]>([]);
  const [sideMeasureKey, setSideMeasureKey] = useState('');
  const [sideLoadError, setSideLoadError] = useState<string | null>(null);

  const [headerEnabled, setHeaderEnabled] = useState(false);
  const [headerProduct, setHeaderProduct] =
    useState<PervazCode>('AYARLI_PERVAZ');
  const [headerMeasures, setHeaderMeasures] = useState<PervazMeasure[]>([]);
  const [headerMeasureKey, setHeaderMeasureKey] = useState('');
  const [headerLoadError, setHeaderLoadError] = useState<string | null>(null);

  const [manualCosts, setManualCosts] = useState(emptyManualCosts);
  const [physicalMaterials, setPhysicalMaterials] = useState<
    PhysicalMaterialState[]
  >([]);
  const [quote, setQuote] = useState<DoorBuildQuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [profitRate, setProfitRate] = useState('');
  const [saleVatRate, setSaleVatRate] = useState('');
  const [cardMarkupRate, setCardMarkupRate] = useState('');
  const [salePriceSource, setSalePriceSource] =
    useState<DoorBuildSalePriceSource>('CASH');
  const [transferUnitPrice, setTransferUnitPrice] = useState('');
  const [transferDiscount, setTransferDiscount] = useState('0');
  const [transferVat, setTransferVat] = useState('20');
  const [transferCustomer, setTransferCustomer] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferNotice, setTransferNotice] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const formId = useId();

  const heightNum = Number(heightCm);
  const widthNum = Number(widthCm);
  const quantityNum = Number(quantityText);
  const sizeOk =
    Number.isInteger(heightNum) &&
    heightNum > 0 &&
    Number.isInteger(widthNum) &&
    widthNum > 0;
  const quantityOk = Number.isInteger(quantityNum) && quantityNum >= 1;
  const verified = sizeOk && isVerifiedSurfaceHeightCm(heightNum);

  const sheetMaterials = materials.filter(
    (m) => m.isActive && m.sheetWidthMm === 2100 && m.sheetLengthMm === 2800,
  );

  useEffect(() => {
    let cancelled = false;
    void listRawMaterials({ isActive: true })
      .then((rows) => {
        if (!cancelled) {
          setMaterials(rows);
          setMaterialsError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMaterialsError(
            error instanceof Error
              ? error.message
              : 'Ham maddeler yüklenemedi.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getDoorBuildPricingSetting()
      .then((setting) => {
        if (cancelled) return;
        // Kâr ve KDV kullanıcı girişidir; PricingSetting'den otomatik doldurulmaz.
        if (setting.cardMarkupRate != null) {
          setCardMarkupRate(setting.cardMarkupRate);
        }
      })
      .catch(() => {
        /* Kart oranı yoksa boş kalır; varsayılan uydurulmaz. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!frameEnabled) {
      setFrameRows([]);
      return;
    }
    let cancelled = false;
    setFrameLoadError(null);
    void fetchDoorFrameMdfCosts(frameCode, materialPriceType)
      .then((res) => {
        if (cancelled) return;
        setFrameRows(res.rows);
        setFrameSizeKey((prev) =>
          res.rows.some((r) => `${r.widthCm}x${r.lengthCm}` === prev)
            ? prev
            : res.rows[0]
              ? `${res.rows[0].widthCm}x${res.rows[0].lengthCm}`
              : '',
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFrameRows([]);
        setFrameLoadError(
          error instanceof Error ? error.message : 'Kasa listesi yüklenemedi.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [frameEnabled, frameCode, materialPriceType]);

  useEffect(() => {
    if (!sideEnabled) {
      setSideMeasures([]);
      return;
    }
    let cancelled = false;
    setSideLoadError(null);
    void loadPervazMeasures(sideProduct, materialPriceType)
      .then((rows) => {
        if (cancelled) return;
        setSideMeasures(rows);
        setSideMeasureKey((prev) =>
          rows.some((r) => r.key === prev) ? prev : '',
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSideMeasures([]);
        setSideLoadError(
          error instanceof Error ? error.message : 'Pervaz listesi yüklenemedi.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [sideEnabled, sideProduct, materialPriceType]);

  useEffect(() => {
    if (!headerEnabled) {
      setHeaderMeasures([]);
      return;
    }
    let cancelled = false;
    setHeaderLoadError(null);
    void loadPervazMeasures(headerProduct, materialPriceType)
      .then((rows) => {
        if (cancelled) return;
        setHeaderMeasures(rows);
        setHeaderMeasureKey((prev) =>
          rows.some((r) => r.key === prev) ? prev : '',
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setHeaderMeasures([]);
        setHeaderLoadError(
          error instanceof Error
            ? error.message
            : 'Başlık pervaz listesi yüklenemedi.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [headerEnabled, headerProduct, materialPriceType]);

  useEffect(() => {
    // Canlı özet: ölçü + MDF seçildikten sonra her adımda backend quote.
    if (step < 2) return;
    if (!verified || !quantityOk || !selectedMaterialId) {
      setQuote(null);
      return;
    }

    const version = ++requestVersion.current;
    setQuoting(true);
    setQuoteError(null);

    const payloadLines = DOOR_BUILD_MANUAL_COST_OPTIONS.map((option) => {
      const state = manualCosts[option.code];
      if (!state.included) {
        return {
          code: option.code,
          included: false as const,
          scope: state.scope,
        };
      }
      return {
        code: option.code,
        included: true as const,
        amount: state.amount.trim(),
        scope: state.scope,
      };
    });

    const frameRow = frameRows.find(
      (r) => `${r.widthCm}x${r.lengthCm}` === frameSizeKey,
    );
    const sideMeasure = sideMeasures.find((m) => m.key === sideMeasureKey);
    const headerMeasure = headerMeasures.find((m) => m.key === headerMeasureKey);

    const sideTrims: DoorBuildPervazSelection | null =
      sideEnabled && sideMeasure
        ? {
            productCode: sideProduct,
            thicknessMm: sideMeasure.thicknessMm,
            widthMm: sideMeasure.widthMm,
            lengthMm: sideMeasure.lengthMm,
          }
        : null;

    const header: DoorBuildHeaderSelection | null =
      headerEnabled && headerMeasure
        ? {
            productCode: headerProduct,
            thicknessMm: headerMeasure.thicknessMm,
            widthMm: headerMeasure.widthMm,
            lengthMm: headerMeasure.lengthMm,
          }
        : null;

    void quoteDoorBuild({
      doorHeightMm: heightNum * 10,
      doorWidthMm: widthNum * 10,
      quantity: quantityNum,
      surfaceRawMaterialId: selectedMaterialId,
      materialPriceType,
      frame:
        frameEnabled && frameRow
          ? {
              productCode: frameCode,
              widthMm: frameRow.widthCm * 10,
              lengthMm: frameRow.lengthCm * 10,
              totalBoyQuantity: frameUnitsPerDoor.trim() || '2.5',
            }
          : null,
      sideTrims,
      header,
      manualCostLines: payloadLines,
      physicalMaterials: physicalMaterials
        .filter((row) => row.materialNameText.trim() && row.quantity.trim())
        .map((row) => ({
          materialNameText: row.materialNameText.trim(),
          thicknessMm: row.thicknessMm.trim() || undefined,
          sheetWidthMm: row.sheetWidthMm.trim()
            ? Number(row.sheetWidthMm)
            : undefined,
          sheetLengthMm: row.sheetLengthMm.trim()
            ? Number(row.sheetLengthMm)
            : undefined,
          surfaceType: row.surfaceType.trim() || undefined,
          quantity: row.quantity.trim(),
          unitText: row.unitText.trim() || 'ADET',
          note: row.note.trim() || undefined,
        })),
      profitRate: profitRate.trim() || undefined,
      vatRate: saleVatRate.trim() || undefined,
      cardMarkupRate: cardMarkupRate.trim() || undefined,
    })
      .then((result) => {
        if (version !== requestVersion.current) return;
        setQuote(result);
        setQuoting(false);
      })
      .catch((error: unknown) => {
        if (version !== requestVersion.current) return;
        setQuote(null);
        setQuoteError(
          error instanceof Error ? error.message : 'Hesaplama yapılamadı.',
        );
        setQuoting(false);
      });
  }, [
    step,
    verified,
    quantityOk,
    selectedMaterialId,
    materialPriceType,
    manualCosts,
    physicalMaterials,
    heightNum,
    widthNum,
    quantityNum,
    frameEnabled,
    frameCode,
    frameSizeKey,
    frameUnitsPerDoor,
    frameRows,
    sideEnabled,
    sideProduct,
    sideMeasureKey,
    sideMeasures,
    headerEnabled,
    headerProduct,
    headerMeasureKey,
    headerMeasures,
    profitRate,
    saleVatRate,
    cardMarkupRate,
  ]);

  function buildQuotePayload(): DoorBuildQuoteRequest | null {
    if (!selectedMaterialId || !verified || !quantityOk) return null;
    const payloadLines = DOOR_BUILD_MANUAL_COST_OPTIONS.map((option) => {
      const state = manualCosts[option.code];
      if (!state.included) {
        return {
          code: option.code,
          included: false as const,
          scope: state.scope,
        };
      }
      return {
        code: option.code,
        included: true as const,
        amount: state.amount.trim(),
        scope: state.scope,
      };
    });
    const frameRow = frameRows.find(
      (r) => `${r.widthCm}x${r.lengthCm}` === frameSizeKey,
    );
    const sideMeasure = sideMeasures.find((m) => m.key === sideMeasureKey);
    const headerMeasure = headerMeasures.find(
      (m) => m.key === headerMeasureKey,
    );
    return {
      doorHeightMm: heightNum * 10,
      doorWidthMm: widthNum * 10,
      quantity: quantityNum,
      surfaceRawMaterialId: selectedMaterialId,
      materialPriceType,
      frame:
        frameEnabled && frameRow
          ? {
              productCode: frameCode,
              widthMm: frameRow.widthCm * 10,
              lengthMm: frameRow.lengthCm * 10,
              totalBoyQuantity: frameUnitsPerDoor.trim() || '2.5',
            }
          : null,
      sideTrims:
        sideEnabled && sideMeasure
          ? {
              productCode: sideProduct,
              thicknessMm: sideMeasure.thicknessMm,
              widthMm: sideMeasure.widthMm,
              lengthMm: sideMeasure.lengthMm,
            }
          : null,
      header:
        headerEnabled && headerMeasure
          ? {
              productCode: headerProduct,
              thicknessMm: headerMeasure.thicknessMm,
              widthMm: headerMeasure.widthMm,
              lengthMm: headerMeasure.lengthMm,
            }
          : null,
      manualCostLines: payloadLines,
      physicalMaterials: physicalMaterials
        .filter((row) => row.materialNameText.trim() && row.quantity.trim())
        .map((row) => ({
          materialNameText: row.materialNameText.trim(),
          thicknessMm: row.thicknessMm.trim() || undefined,
          sheetWidthMm: row.sheetWidthMm.trim()
            ? Number(row.sheetWidthMm)
            : undefined,
          sheetLengthMm: row.sheetLengthMm.trim()
            ? Number(row.sheetLengthMm)
            : undefined,
          surfaceType: row.surfaceType.trim() || undefined,
          quantity: row.quantity.trim(),
          unitText: row.unitText.trim() || 'ADET',
          note: row.note.trim() || undefined,
        })),
      profitRate: profitRate.trim() || undefined,
      vatRate: saleVatRate.trim() || undefined,
      cardMarkupRate: cardMarkupRate.trim() || undefined,
    };
  }

  async function handleWorkshopPreview() {
    const payload = buildQuotePayload();
    if (!payload) {
      setPreviewError('Önizleme için hesaplama seçimleri eksik.');
      return;
    }
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const result = await previewDoorBuildWorkshop(payload);
      const blob = new Blob([result.html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error: unknown) {
      setPreviewError(
        error instanceof Error
          ? error.message
          : 'Taslak üretim formu açılamadı.',
      );
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handleCreateForm() {
    const payload = buildQuotePayload();
    if (!payload) {
      setTransferError('Form için hesaplama seçimleri eksik.');
      return;
    }
    if (!transferCustomer.trim()) {
      setTransferError('Müşteri / firma adı girilmelidir.');
      return;
    }
    if (salePriceSource === 'MANUAL' && !transferUnitPrice.trim()) {
      setTransferError(
        'Manuel satış seçildi; birim satış fiyatı girilmelidir.',
      );
      return;
    }
    if (salePriceSource === 'CASH' && quote?.sale.cashSale == null) {
      setTransferError(
        'Nakit satış önerisi yok. Kâr/KDV girin veya Manuel seçin.',
      );
      return;
    }
    if (salePriceSource === 'CARD' && quote?.sale.cardSale == null) {
      setTransferError(
        quote?.sale.cardStatusMessage ??
          'Kart satış önerisi yok. Kart oranı girin veya başka kaynak seçin.',
      );
      return;
    }
    if (!transferVat.trim()) {
      setTransferError('Sipariş KDV oranı girilmelidir.');
      return;
    }
    setTransferBusy(true);
    setTransferError(null);
    setTransferNotice(null);
    try {
      const draft = await transferDoorBuildToOrderDraft({
        quote: payload,
        salePriceSource,
        unitPrice:
          salePriceSource === 'MANUAL'
            ? transferUnitPrice.trim()
            : undefined,
        discountRate: transferDiscount.trim() || '0',
        vatRate: transferVat.trim(),
        customerName: transferCustomer.trim(),
        documentDateText: new Date().toLocaleDateString('tr-TR'),
      });
      const saved = await createOrderDocument(draft.upsert);
      await openOrderPrint(saved.id, 'combined');
      setTransferNotice(
        draft.warnings.length > 0
          ? `Sipariş ${saved.orderNumber} kaydedildi ve form açıldı. Uyarılar: ${draft.warnings.join(' · ')}`
          : `Sipariş ${saved.orderNumber} kaydedildi. Müşteri + üretim formu açıldı.`,
      );
    } catch (error: unknown) {
      setTransferError(
        error instanceof Error ? error.message : 'Form oluşturulamadı.',
      );
    } finally {
      setTransferBusy(false);
    }
  }

  async function handleTransferToOrder() {
    const payload = buildQuotePayload();
    if (!payload) {
      setTransferError('Aktarım için hesaplama seçimleri eksik.');
      return;
    }
    if (!transferCustomer.trim()) {
      setTransferError('Müşteri / firma adı girilmelidir.');
      return;
    }
    if (salePriceSource === 'MANUAL' && !transferUnitPrice.trim()) {
      setTransferError(
        'Manuel satış seçildi; birim satış fiyatı girilmelidir.',
      );
      return;
    }
    if (salePriceSource === 'CASH' && quote?.sale.cashSale == null) {
      setTransferError(
        'Nakit satış önerisi yok. Kâr/KDV girin veya Manuel seçin.',
      );
      return;
    }
    if (salePriceSource === 'CARD' && quote?.sale.cardSale == null) {
      setTransferError(
        quote?.sale.cardStatusMessage ??
          'Kart satış önerisi yok. Kart oranı girin veya başka kaynak seçin.',
      );
      return;
    }
    if (!transferVat.trim()) {
      setTransferError('Sipariş KDV oranı girilmelidir.');
      return;
    }
    setTransferBusy(true);
    setTransferError(null);
    setTransferNotice(null);
    try {
      const result = await transferDoorBuildToOrderDraft({
        quote: payload,
        salePriceSource,
        unitPrice:
          salePriceSource === 'MANUAL'
            ? transferUnitPrice.trim()
            : undefined,
        discountRate: transferDiscount.trim() || '0',
        vatRate: transferVat.trim(),
        customerName: transferCustomer.trim(),
      });
      sessionStorage.setItem(
        DOOR_BUILD_ORDER_DRAFT_STORAGE_KEY,
        JSON.stringify(result.upsert),
      );
      setTransferNotice(
        result.warnings.length > 0
          ? `Sipariş taslağı hazır. Uyarılar: ${result.warnings.join(' · ')}`
          : 'Sipariş taslağı hazır. Siparişler ekranına yönlendiriliyorsunuz.',
      );
      props.onNavigateToOrders?.();
    } catch (error: unknown) {
      setTransferError(
        error instanceof Error ? error.message : 'Siparişe aktarılamadı.',
      );
    } finally {
      setTransferBusy(false);
    }
  }

  const canGoStep2 = sizeOk && quantityOk && verified;
  const canGoStep3 = canGoStep2 && selectedMaterialId != null;
  const canGoStep4 = canGoStep3;
  const canGoStep5 = canGoStep4;
  const canGoStep6 = canGoStep5;
  const canGoStep7 = canGoStep6;

  const transferBlockedReason = (() => {
    if (!quote) return 'Hesaplama henüz hazır değil.';
    if (!transferCustomer.trim()) return 'Müşteri / firma adı girilmelidir.';
    if (salePriceSource === 'MANUAL' && !transferUnitPrice.trim()) {
      return 'Manuel satış seçildi; birim fiyat girilmelidir.';
    }
    if (salePriceSource === 'CASH' && quote.sale.cashSale == null) {
      return 'Nakit satış yok. Kâr ve KDV oranlarını girin.';
    }
    if (salePriceSource === 'CARD' && quote.sale.cardSale == null) {
      return (
        quote.sale.cardStatusMessage ??
        'Kart satış yok. Kart oranı girin veya başka kaynak seçin.'
      );
    }
    if (!transferVat.trim()) return 'Sipariş KDV oranı girilmelidir.';
    return null;
  })();

  const go = (target: Step) => {
    if (target === 1) setStep(1);
    else if (target === 2 && canGoStep2) setStep(2);
    else if (target === 3 && canGoStep3) setStep(3);
    else if (target === 4 && canGoStep4) setStep(4);
    else if (target === 5 && canGoStep5) setStep(5);
    else if (target === 6 && canGoStep6) setStep(6);
    else if (target === 7 && canGoStep7) setStep(7);
  };

  const frameSummary = (() => {
    if (!frameEnabled || !quote || quote.frame.status === 'NOT_SELECTED') {
      return null;
    }
    return [
      quote.frame.selectedProduct?.productName ?? frameCode,
      quote.frame.selectedSize?.sizeLabelCm
        ? `${quote.frame.selectedSize.sizeLabelCm} cm`
        : null,
      quote.frame.unitProductionCost
        ? `Birim ${formatMoney(quote.frame.unitProductionCost)}`
        : null,
      quote.frame.totalBoyQuantity
        ? `Toplam ${quote.frame.totalBoyQuantity} boy`
        : null,
      quote.frame.totalCost
        ? `Toplam ${formatMoney(quote.frame.totalCost)}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');
  })();

  const sideSummary = (() => {
    if (!sideEnabled || !quote || quote.sideTrims.status === 'NOT_SELECTED') {
      return null;
    }
    return [
      quote.sideTrims.displayName ?? sideProduct,
      quote.sideTrims.piecesPerDoor != null
        ? `${quote.sideTrims.piecesPerDoor} adet / kapı`
        : null,
      quote.sideTrims.totalPieces
        ? `Toplam ${quote.sideTrims.totalPieces} adet`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');
  })();

  const headerSummary = (() => {
    if (!headerEnabled || !quote || quote.header.status === 'NOT_SELECTED') {
      return null;
    }
    return [
      quote.header.displayName ?? headerProduct,
      '1 adet / kapı',
      quote.header.totalPieces
        ? `Toplam ${quote.header.totalPieces} adet`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');
  })();

  return (
    <section className="db-page">
      <nav className="db-steps" aria-label="Kapı imalatı adımları">
        {STEPS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`db-step${step === item.id ? ' active' : ''}${
              step > item.id ? ' done' : ''
            }`}
            onClick={() => go(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <p className="db-step-current">
        Adım {step}/{STEPS.length}: {STEPS.find((item) => item.id === step)?.label}
      </p>

      {canGoStep2 ? (
        <div className="db-sticky-summary" aria-live="polite">
          <div className="db-sticky-item">
            <span>Kapı</span>
            <strong>
              {heightNum} × {widthNum} cm
            </strong>
          </div>
          <div className="db-sticky-item">
            <span>Adet</span>
            <strong>{quantityNum}</strong>
          </div>
          <div className="db-sticky-item">
            <span>En Katsayısı</span>
            <strong>
              {quote?.widthCoefficient != null
                ? formatCoefficientDisplay(quote.widthCoefficient)
                : quote?.widthCoefficientMessage
                  ? '—'
                  : quoting
                    ? '…'
                    : '—'}
            </strong>
          </div>
          <div className="db-sticky-item">
            <span>Toplam Kasa (Boy)</span>
            <strong>
              {quote?.frame.totalBoyQuantity
                ? `${formatQuantityDisplay(quote.frame.totalBoyQuantity)} boy`
                : frameEnabled
                  ? '—'
                  : 'Seçilmedi'}
            </strong>
          </div>
        </div>
      ) : null}

      <div className="db-layout">
        <div className="db-main">
      {step === 1 ? (
        <div className="db-card">
          <h2>Kapı Ölçüleri</h2>
          <p className="lead">
            Ölçüler ekranda cm; hesaplama mm ile yapılır. MDF yüzey kesim
            adedi kapı boyuna göredir (210 cm → 3 yüzey/tabaka; &gt;210–250 cm →
            2 yüzey/tabaka). Kapı eni yüzeyi değiştirmez; yalnız maliyet
            katsayısını belirler.
          </p>
          <div className="db-presets">
            {SIZE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={
                  heightNum === preset.heightCm && widthNum === preset.widthCm
                    ? 'active'
                    : undefined
                }
                onClick={() => {
                  setHeightCm(String(preset.heightCm));
                  setWidthCm(String(preset.widthCm));
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="db-grid">
            <div className="db-field">
              <label htmlFor={`${formId}-height`}>Kapı boyu (cm)</label>
              <input
                id={`${formId}-height`}
                inputMode="numeric"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
              />
            </div>
            <div className="db-field">
              <label htmlFor={`${formId}-width`}>Kapı eni (cm)</label>
              <input
                id={`${formId}-width`}
                inputMode="numeric"
                value={widthCm}
                onChange={(e) => setWidthCm(e.target.value)}
              />
            </div>
            <div className="db-field">
              <label htmlFor={`${formId}-qty`}>Kapı adedi</label>
              <input
                id={`${formId}-qty`}
                inputMode="numeric"
                value={quantityText}
                onChange={(e) => setQuantityText(e.target.value)}
              />
            </div>
          </div>
          {!quantityOk ? (
            <div className="db-error">
              Kapı adedi 1 veya daha büyük tam sayı olmalıdır.
            </div>
          ) : null}
          {sizeOk && !verified ? (
            <div className="db-warn">
              {heightNum} cm boy için henüz doğrulanmış MDF yüzey kesim kuralı
              yok. Yüzey/tabaka hesabı uydurulmaz (210 cm veya &gt;210–250 cm
              boyları desteklenir).
            </div>
          ) : null}
          <div className="db-actions">
            <button
              type="button"
              className="primary"
              disabled={!canGoStep2}
              onClick={() => setStep(2)}
            >
              MDF yüzeyine geç
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="db-card">
          <h2>MDF Yüzeyi</h2>
          <p className="lead">
            Yalnız 2100×2800 mm tabakalar. Seçilen alış türü kasa, pervaz ve
            başlığa da aktarılır; eksikse diğerine geçilmez.
          </p>
          <div className="db-field">
            <span>MDF alış fiyatı</span>
            <div className="db-price-type">
              {(['CASH', 'CARD_INSTALLMENT'] as MaterialPriceType[]).map(
                (type) => (
                  <button
                    key={type}
                    type="button"
                    className={materialPriceType === type ? 'active' : undefined}
                    aria-pressed={materialPriceType === type}
                    onClick={() => setMaterialPriceType(type)}
                  >
                    {materialPriceTypeLabel(type)}
                  </button>
                ),
              )}
            </div>
          </div>
          {materialsError ? (
            <div className="db-error">{materialsError}</div>
          ) : null}
          <div className="db-mdf-list" role="listbox" aria-label="MDF listesi">
            {sheetMaterials.map((material) => {
              const priceLabel =
                materialPriceType === 'CASH'
                  ? material.cashPrice
                  : material.cardInstallmentPrice;
              return (
                <label
                  key={material.id}
                  className={`db-mdf-item${
                    selectedMaterialId === material.id ? ' selected' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="door-build-mdf"
                    checked={selectedMaterialId === material.id}
                    onChange={() => setSelectedMaterialId(material.id)}
                  />
                  <span>
                    <strong>{material.name}</strong>
                    <span>
                      {material.thicknessMm} mm · {material.sheetWidthMm}×
                      {material.sheetLengthMm} mm
                      {material.surfaceType
                        ? ` · ${material.surfaceType}`
                        : ''}
                    </span>
                    <span>
                      {materialPriceTypeLabel(materialPriceType)}:{' '}
                      {priceLabel ? formatMoney(priceLabel) : 'tanımlı değil'}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="db-actions">
            <button type="button" onClick={() => setStep(1)}>
              Geri
            </button>
            <button
              type="button"
              className="primary"
              disabled={!canGoStep3}
              onClick={() => setStep(3)}
            >
              Kasaya geç
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="db-card">
          <h2>Kapı Kasası</h2>
          <p className="lead">
            Gerçek Kapı Kasası katalog ölçüsünü seçin. Birim maliyet mevcut
            Kapı Kasası hesap sonucundan gelir. Toplam boy miktarını siz
            girersiniz; kapı adediyle otomatik çarpılmaz.
          </p>
          <div className="db-choice-row" role="group" aria-label="Kasa ekle">
            <button
              type="button"
              className={!frameEnabled ? 'active' : undefined}
              onClick={() => setFrameEnabled(false)}
            >
              Kasa yok
            </button>
            <button
              type="button"
              className={frameEnabled ? 'active' : undefined}
              onClick={() => setFrameEnabled(true)}
            >
              Kasa ekle
            </button>
          </div>
          {frameEnabled ? (
            <>
              <div className="db-field">
                <span>Kasa tipi</span>
                <div className="db-choice-row">
                  {FRAME_CHOICES.map((choice) => (
                    <button
                      key={choice.code}
                      type="button"
                      className={frameCode === choice.code ? 'active' : undefined}
                      onClick={() => setFrameCode(choice.code)}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="db-grid">
                <div className="db-field">
                  <label htmlFor={`${formId}-frame-size`}>Kasa ölçüsü</label>
                  <select
                    id={`${formId}-frame-size`}
                    value={frameSizeKey}
                    onChange={(e) => setFrameSizeKey(e.target.value)}
                  >
                    {frameRows.map((row) => (
                      <option
                        key={`${row.widthCm}x${row.lengthCm}`}
                        value={`${row.widthCm}x${row.lengthCm}`}
                      >
                        {row.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="db-field">
                  <label htmlFor={`${formId}-frame-units`}>
                    Toplam Kasa Miktarı (Boy)
                  </label>
                  <input
                    id={`${formId}-frame-units`}
                    value={frameUnitsPerDoor}
                    onChange={(e) => setFrameUnitsPerDoor(e.target.value)}
                    inputMode="decimal"
                    placeholder="örn. 2.5"
                  />
                </div>
              </div>
              {frameSummary ? (
                <div className="db-info">Özet: {frameSummary}</div>
              ) : null}
              <div className="db-info">
                Birim maliyet seçilen Kapı Kasası katalog satırından gelir
                (Nakit / Kart alış seçimine göre). Toplam = birim maliyet ×
                girdiğiniz toplam boy. Kapı adediyle tekrar çarpılmaz; sabit
                750/950 TL kullanılmaz.
              </div>
              {quote?.catalogNote ? (
                <div className="db-info">{quote.catalogNote}</div>
              ) : null}
              {frameLoadError ? (
                <div className="db-error">{frameLoadError}</div>
              ) : null}
              {quote?.frame.status === 'UNRESOLVED' && quote.frame.message ? (
                <div className="db-error">{quote.frame.message}</div>
              ) : null}
            </>
          ) : (
            <p className="lead">Kasa bu siparişte kullanılmayacak.</p>
          )}
          <div className="db-actions">
            <button type="button" onClick={() => setStep(2)}>
              Geri
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => setStep(4)}
            >
              Pervaz ve başlığa geç
            </button>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="db-card">
          <h2>Pervaz ve Başlık</h2>
          <p className="lead">
            Ölçüler mevcut katalogdan gelir. Katalogda olmayan boya otomatik
            fiyat atanmaz. Yan pervaz kapı başına sabit 4 adettir (başlık
            hariç). Başlık seçilirse kapı başına 1 adet eklenir.
          </p>

          <h3>Yan pervaz</h3>
          <div className="db-choice-row">
            <button
              type="button"
              className={!sideEnabled ? 'active' : undefined}
              onClick={() => setSideEnabled(false)}
            >
              Yok
            </button>
            <button
              type="button"
              className={sideEnabled ? 'active' : undefined}
              onClick={() => setSideEnabled(true)}
            >
              Ekle (4 adet/kapı)
            </button>
          </div>
          {sideEnabled ? (
            <>
              <div className="db-field">
                <span>Pervaz tipi</span>
                <div className="db-choice-row">
                  {PERVAZ_CHOICES.map((choice) => (
                    <button
                      key={choice.code}
                      type="button"
                      className={
                        sideProduct === choice.code ? 'active' : undefined
                      }
                      onClick={() => setSideProduct(choice.code)}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="db-grid">
                <div className="db-field">
                  <label>Ölçü (katalog)</label>
                  <select
                    value={sideMeasureKey}
                    onChange={(e) => setSideMeasureKey(e.target.value)}
                  >
                    <option value="">Ölçü seçin…</option>
                    {sideMeasures.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="db-field">
                  <label>Kapı başına adet</label>
                  <input value="4 adet" readOnly disabled />
                </div>
              </div>
              {sideSummary ? (
                <div className="db-info">Özet: {sideSummary}</div>
              ) : null}
            </>
          ) : null}
          {sideLoadError ? <div className="db-error">{sideLoadError}</div> : null}
          {sideEnabled && sideMeasures.length === 0 && !sideLoadError ? (
            <div className="db-warn">
              Bu ürün için doğrulanmış katalog ölçüsü yok. Yakın ölçüye otomatik
              atama yapılmaz.
            </div>
          ) : null}
          {quote?.sideTrims.status === 'UNRESOLVED' &&
          quote.sideTrims.message ? (
            <div className="db-error">{quote.sideTrims.message}</div>
          ) : null}

          <h3>Başlık</h3>
          <div className="db-choice-row">
            <button
              type="button"
              className={!headerEnabled ? 'active' : undefined}
              onClick={() => setHeaderEnabled(false)}
            >
              Yok
            </button>
            <button
              type="button"
              className={headerEnabled ? 'active' : undefined}
              onClick={() => setHeaderEnabled(true)}
            >
              Ekle (1 adet/kapı)
            </button>
          </div>
          {headerEnabled ? (
            <>
              <div className="db-field">
                <span>Başlık tipi</span>
                <div className="db-choice-row">
                  {PERVAZ_CHOICES.map((choice) => (
                    <button
                      key={`h-${choice.code}`}
                      type="button"
                      className={
                        headerProduct === choice.code ? 'active' : undefined
                      }
                      onClick={() => setHeaderProduct(choice.code)}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="db-grid">
                <div className="db-field">
                  <label>Ölçü (katalog)</label>
                  <select
                    value={headerMeasureKey}
                    onChange={(e) => setHeaderMeasureKey(e.target.value)}
                  >
                    <option value="">Ölçü seçin…</option>
                    {headerMeasures.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="db-field">
                  <label>Kapı başına adet</label>
                  <input value="1 adet" readOnly disabled />
                </div>
              </div>
              {headerSummary ? (
                <div className="db-info">Özet: {headerSummary}</div>
              ) : null}
              <div className="db-info">
                Katalog başlığı, “Uzun Başlık” manuel giderinden ayrıdır. İkisi
                aynı anda eklenemez.
              </div>
            </>
          ) : null}
          {headerLoadError ? (
            <div className="db-error">{headerLoadError}</div>
          ) : null}

          <div className="db-actions">
            <button type="button" onClick={() => setStep(3)}>
              Geri
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => setStep(5)}
            >
              Ek giderlere geç
            </button>
          </div>
        </div>
      ) : null}

      {step === 5 ? (
        <div className="db-card">
          <h2>Ek Giderler</h2>
          <p className="lead">
            Seçilmemiş gider ile açık 0 TL farklıdır. Çıta bu aşamada manueldir.
            Katalog başlığı seçildiyse Uzun Başlık eklemeyin.
          </p>
          {headerEnabled ? (
            <div className="db-warn">
              Katalog başlığı seçili. Uzun Başlık manuel gideri çift maliyet
              oluşturur; backend reddeder.
            </div>
          ) : null}
          <div className="db-cost-rows">
            {DOOR_BUILD_MANUAL_COST_OPTIONS.map((option) => {
              const state = manualCosts[option.code];
              const blocked =
                headerEnabled && option.code === 'UZUN_BASLIK';
              return (
                <div
                  key={option.code}
                  className={`db-cost-row${state.included ? '' : ' disabled'}`}
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={state.included}
                      disabled={blocked}
                      onChange={(e) =>
                        setManualCosts((prev) => ({
                          ...prev,
                          [option.code]: {
                            ...prev[option.code],
                            included: e.target.checked,
                          },
                        }))
                      }
                    />{' '}
                    {option.label}
                    {blocked ? ' (katalog başlığı ile çakışır)' : ''}
                  </label>
                  <div className="db-cost-controls">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Tutar (TL)"
                      disabled={!state.included || blocked}
                      value={state.amount}
                      onChange={(e) =>
                        setManualCosts((prev) => ({
                          ...prev,
                          [option.code]: {
                            ...prev[option.code],
                            amount: e.target.value,
                          },
                        }))
                      }
                    />
                    <select
                      disabled={!state.included || blocked}
                      value={state.scope}
                      onChange={(e) =>
                        setManualCosts((prev) => ({
                          ...prev,
                          [option.code]: {
                            ...prev[option.code],
                            scope: e.target
                              .value as DoorBuildManualCostScope,
                          },
                        }))
                      }
                    >
                      <option value="PER_DOOR">Kapı Başına</option>
                      <option value="ORDER_TOTAL">Sipariş Toplamı</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          <h3>Fiziksel üretim malzemeleri</h3>
          <p className="lead">
            Parasal ek giderlerle karıştırılmaz. CNC tutarı burada malzeme adedi
            olmaz; yalnız fiziksel kalemler eklenir.
          </p>
          {physicalMaterials.map((row) => (
            <div className="db-physical-row" key={row.key}>
              <input
                type="text"
                placeholder="Malzeme adı"
                value={row.materialNameText}
                onChange={(e) =>
                  setPhysicalMaterials((current) =>
                    current.map((item) =>
                      item.key === row.key
                        ? { ...item, materialNameText: e.target.value }
                        : item,
                    ),
                  )
                }
              />
              <input
                type="text"
                placeholder="Ölçü / kalınlık mm"
                value={row.thicknessMm}
                onChange={(e) =>
                  setPhysicalMaterials((current) =>
                    current.map((item) =>
                      item.key === row.key
                        ? { ...item, thicknessMm: e.target.value }
                        : item,
                    ),
                  )
                }
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder="Miktar"
                value={row.quantity}
                onChange={(e) =>
                  setPhysicalMaterials((current) =>
                    current.map((item) =>
                      item.key === row.key
                        ? { ...item, quantity: e.target.value }
                        : item,
                    ),
                  )
                }
              />
              <input
                type="text"
                placeholder="Birim"
                value={row.unitText}
                onChange={(e) =>
                  setPhysicalMaterials((current) =>
                    current.map((item) =>
                      item.key === row.key
                        ? { ...item, unitText: e.target.value }
                        : item,
                    ),
                  )
                }
              />
              <input
                type="text"
                placeholder="Üretim notu"
                value={row.note}
                onChange={(e) =>
                  setPhysicalMaterials((current) =>
                    current.map((item) =>
                      item.key === row.key
                        ? { ...item, note: e.target.value }
                        : item,
                    ),
                  )
                }
              />
              <button
                type="button"
                onClick={() =>
                  setPhysicalMaterials((current) =>
                    current.filter((item) => item.key !== row.key),
                  )
                }
              >
                Kaldır
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setPhysicalMaterials((current) => [...current, emptyPhysical()])
            }
          >
            Manuel malzeme ekle
          </button>

          <div className="db-actions">
            <button type="button" onClick={() => setStep(4)}>
              Geri
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => setStep(6)}
            >
              Fiyatlandırmaya geç
            </button>
          </div>
        </div>
      ) : null}

      {step === 6 ? (
        <div className="db-card">
          <h2>Fiyatlandırma</h2>
          <p className="lead">
            Kâr ve KDV boş bırakılırsa nihai satış hesaplanmaz. 0 kabul edilir.
            Kart oranı MDF alış türünden (Nakit/Kart) ayrıdır.
          </p>
          <div className="db-transfer-grid">
            <label>
              Kâr oranı (%)
              <input
                type="text"
                inputMode="decimal"
                value={profitRate}
                onChange={(e) => setProfitRate(e.target.value)}
                placeholder="ör. 20"
              />
            </label>
            <label>
              KDV oranı (%)
              <input
                type="text"
                inputMode="decimal"
                value={saleVatRate}
                onChange={(e) => setSaleVatRate(e.target.value)}
                placeholder="ör. 10"
              />
            </label>
            <label>
              Kart / taksit oranı (%)
              <input
                type="text"
                inputMode="decimal"
                value={cardMarkupRate}
                onChange={(e) => setCardMarkupRate(e.target.value)}
                placeholder="boş = kart yok"
              />
            </label>
          </div>
          {quote?.sale.reason ? (
            <div className="db-warn">{quote.sale.reason}</div>
          ) : null}
          {quote?.sale.cardStatusMessage ? (
            <div className="db-warn">{quote.sale.cardStatusMessage}</div>
          ) : null}
          <div className="db-result-grid">
            <div className="db-metric">
              <span>Üretim maliyeti</span>
              <strong>
                {formatMoneyOrDash(quote?.widthAdjustedSubtotal)}
              </strong>
            </div>
            <div className="db-metric">
              <span>Nakit satış</span>
              <strong>{formatMoneyOrDash(quote?.sale.cashSale)}</strong>
            </div>
            <div className="db-metric">
              <span>Kart / taksit satış</span>
              <strong>{formatMoneyOrDash(quote?.sale.cardSale)}</strong>
            </div>
          </div>
          <div className="db-actions">
            <button type="button" onClick={() => setStep(5)}>
              Geri
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => setStep(7)}
            >
              Sonuca geç
            </button>
          </div>
        </div>
      ) : null}

      {step === 7 ? (
        <div className="db-card">
          <h2>Sonuç ve Siparişe Aktar</h2>
          <div className="db-info">
            {quote?.phaseNote ??
              'Üretim maliyeti ve satış önerisi backend hesabından gelir.'}
          </div>
          {quoting ? <p className="lead">Hesaplanıyor…</p> : null}
          {quoteError ? <div className="db-error">{quoteError}</div> : null}
          {quote ? (
            <>
              <div className="db-result-grid">
                <div className="db-metric">
                  <span>Kapı ölçüsü</span>
                  <strong>{quote.doorSizeLabelCm} cm</strong>
                </div>
                <div className="db-metric">
                  <span>Adet</span>
                  <strong>{quote.quantity}</strong>
                </div>
                <div className="db-metric">
                  <span>En katsayısı</span>
                  <strong>
                    {quote.widthCoefficient != null
                      ? formatCoefficientDisplay(quote.widthCoefficient)
                      : quote.widthCoefficientMessage ?? '—'}
                  </strong>
                </div>
              </div>

              <h3>A) Üretim maliyeti</h3>
              <div className="db-result-grid">
                <div className="db-metric">
                  <span>MDF Yüzey Maliyeti</span>
                  <strong>
                    {formatMoneyOrDash(quote.totalAllocatedMdfCost)}
                  </strong>
                </div>
                <div className="db-metric">
                  <span>Kasa</span>
                  <strong>
                    {quote.frame.status === 'RESOLVED'
                      ? formatMoneyOrDash(quote.frame.totalCost)
                      : quote.frame.status === 'NOT_SELECTED'
                        ? 'Seçilmedi'
                        : '—'}
                  </strong>
                  <span style={{ marginTop: 6 }}>
                    {[
                      quote.frame.displayName,
                      quote.frame.unitProductionCost
                        ? `Birim ${formatMoney(quote.frame.unitProductionCost)}`
                        : null,
                      quote.frame.totalBoyQuantity
                        ? `${formatQuantityDisplay(quote.frame.totalBoyQuantity)} boy`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || quote.frame.message || ''}
                  </span>
                </div>
                <div className="db-metric">
                  <span>Pervaz</span>
                  <strong>
                    {quote.sideTrims.status === 'RESOLVED'
                      ? formatMoneyOrDash(quote.sideTrims.lineTotal)
                      : quote.sideTrims.status === 'NOT_SELECTED'
                        ? 'Seçilmedi'
                        : '—'}
                  </strong>
                  <span style={{ marginTop: 6 }}>
                    {[
                      quote.sideTrims.displayName,
                      quote.sideTrims.totalPieces
                        ? `${quote.sideTrims.totalPieces} adet`
                        : null,
                      quote.sideTrims.unitProductionCost
                        ? `Birim ${formatMoney(quote.sideTrims.unitProductionCost)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || quote.sideTrims.message || ''}
                  </span>
                </div>
                <div className="db-metric">
                  <span>Başlık</span>
                  <strong>
                    {quote.header.status === 'RESOLVED'
                      ? formatMoneyOrDash(quote.header.lineTotal)
                      : quote.header.status === 'NOT_SELECTED'
                        ? 'Seçilmedi'
                        : '—'}
                  </strong>
                  <span style={{ marginTop: 6 }}>
                    {[
                      quote.header.displayName,
                      quote.header.totalPieces
                        ? `${quote.header.totalPieces} adet`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || quote.header.message || ''}
                  </span>
                </div>
                <div className="db-metric">
                  <span>Manuel giderler</span>
                  <strong>{formatMoney(quote.manualCostsTotal)}</strong>
                </div>
                {quote.componentCostBreakdown.map((item) => (
                  <div className="db-metric" key={item.code}>
                    <span>{item.label} (özet)</span>
                    <strong>
                      {item.lineTotal != null
                        ? formatMoney(item.lineTotal)
                        : '—'}
                    </strong>
                    {item.message ? (
                      <span style={{ marginTop: 6 }}>{item.message}</span>
                    ) : null}
                  </div>
                ))}
                <div className="db-metric">
                  <span>Katsayı öncesi ara toplam</span>
                  <strong>
                    {formatMoney(quote.baseSubtotalBeforeWidthCoefficient)}
                  </strong>
                </div>
                <div className="db-metric">
                  <span>En katsayısı</span>
                  <strong>
                    {quote.widthCoefficient != null
                      ? formatCoefficientDisplay(quote.widthCoefficient)
                      : quote.widthCoefficientMessage ?? '—'}
                  </strong>
                </div>
                <div className="db-metric">
                  <span>Toplam üretim maliyeti</span>
                  <strong>
                    {formatMoneyOrDash(quote.widthAdjustedSubtotal)}
                  </strong>
                </div>
              </div>

              {quote.missingSources.length > 0 ? (
                <div className="db-warn">
                  <strong>Eksik / doğrulanmamış:</strong>
                  <ul>
                    {quote.missingSources.map((msg) => (
                      <li key={msg}>{msg}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {quote.surfaceMessage ? (
                <div className="db-error">{quote.surfaceMessage}</div>
              ) : null}

              <h3>B) Satış</h3>
              <div className="db-result-grid">
                <div className="db-metric">
                  <span>Kâr %</span>
                  <strong>
                    {quote.sale.profitRate != null
                      ? `%${formatPercentDisplay(quote.sale.profitRate)}`
                      : '—'}
                  </strong>
                </div>
                <div className="db-metric">
                  <span>Kâr tutarı</span>
                  <strong>
                    {formatMoneyOrDash(quote.sale.profitAmount)}
                  </strong>
                </div>
                <div className="db-metric">
                  <span>KDV %</span>
                  <strong>
                    {quote.sale.vatRate != null
                      ? `%${formatPercentDisplay(quote.sale.vatRate)}`
                      : '—'}
                  </strong>
                </div>
                <div className="db-metric">
                  <span>KDV tutarı</span>
                  <strong>{formatMoneyOrDash(quote.sale.vatAmount)}</strong>
                </div>
                <div className="db-metric">
                  <span>Nakit satış</span>
                  <strong>{formatMoneyOrDash(quote.sale.cashSale)}</strong>
                </div>
                <div className="db-metric">
                  <span>Kart / taksit satış</span>
                  <strong>{formatMoneyOrDash(quote.sale.cardSale)}</strong>
                </div>
              </div>
              {quote.sale.reason ? (
                <div className="db-warn">{quote.sale.reason}</div>
              ) : null}
              {quote.sale.cardStatusMessage ? (
                <div className="db-warn">{quote.sale.cardStatusMessage}</div>
              ) : null}

              <div className="db-material">
                <h3>Malzeme özeti (fiyatsız)</h3>
                {quote.surfaceStatus === 'UNRESOLVED' ? (
                  <div className="db-warn">
                    {quote.surfaceMessage ??
                      'Bu kapı ölçüsü için doğrulanmış MDF yüzey kesim kuralı bulunmuyor.'}
                  </div>
                ) : null}
                {(() => {
                  const sections = materialSections(quote.materialDraft);
                  const blocks: Array<{
                    title: string;
                    lines: DoorBuildMaterialDraftLine[];
                  }> = [
                    { title: 'MDF', lines: sections.surface },
                    { title: 'Kasa', lines: sections.frame },
                    { title: 'Pervaz', lines: sections.side },
                    { title: 'Başlık', lines: sections.header },
                    {
                      title: 'Manuel fiziksel malzemeler',
                      lines: sections.physical,
                    },
                  ];
                  return blocks
                    .filter((block) => block.lines.length > 0)
                    .map((block) => (
                      <div key={block.title} className="db-material-section">
                        <h4>{block.title}</h4>
                        <ul>
                          {block.lines.map((line, index) => {
                            const qty =
                              line.quantity != null
                                ? formatQuantityDisplay(line.quantity)
                                : null;
                            const pieces =
                              line.pieceQuantity != null
                                ? formatQuantityDisplay(line.pieceQuantity)
                                : null;
                            const sheets =
                              line.sheetQuantity != null
                                ? formatQuantityDisplay(line.sheetQuantity)
                                : null;
                            let detail = '';
                            if (line.role === 'YUZAY_MDF') {
                              detail =
                                sheets != null
                                  ? ` · ${pieces ?? '—'} yüzey / ${sheets} tabaka`
                                  : ' · tabaka yok';
                            } else if (qty != null && line.unitText) {
                              detail = ` · ${qty} ${line.unitText.toLowerCase()}`;
                            }
                            return (
                              <li key={`${line.role}-${index}`}>
                                <strong>
                                  {line.rawMaterialName ??
                                    line.productName ??
                                    line.label}
                                </strong>
                                {line.sizeLabel ? ` · ${line.sizeLabel}` : ''}
                                {detail}
                                {line.unverified ? ' · doğrulanmadı' : ''}
                                {line.note ? ` — ${line.note}` : ''}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ));
                })()}
              </div>

              <div className="db-transfer">
                <h3>Formu Oluştur / Siparişe aktar</h3>
                <p className="lead">
                  Gerekli alanları doldurun. Formu Oluştur siparişi kaydeder ve
                  Tek A4’te üst müşteri / alt üretim formunu açar. Satış fiyatı snapshot
                  olarak korunur.
                </p>
                <div className="db-field">
                  <span>Satış fiyatı kaynağı</span>
                  <div className="db-choice-row">
                    {SALE_SOURCE_CHOICES.map((choice) => (
                      <button
                        key={choice.value}
                        type="button"
                        className={
                          salePriceSource === choice.value
                            ? 'active'
                            : undefined
                        }
                        onClick={() => setSalePriceSource(choice.value)}
                      >
                        {choice.label}
                        {choice.value === 'CASH' && quote.sale.cashSale
                          ? ` · ${formatMoney(quote.sale.cashSale)}`
                          : ''}
                        {choice.value === 'CARD' && quote.sale.cardSale
                          ? ` · ${formatMoney(quote.sale.cardSale)}`
                          : ''}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="db-transfer-grid">
                  <label>
                    Müşteri / firma
                    <input
                      type="text"
                      value={transferCustomer}
                      onChange={(e) => setTransferCustomer(e.target.value)}
                    />
                  </label>
                  {salePriceSource === 'MANUAL' ? (
                    <label>
                      Birim satış (TL)
                      <input
                        type="text"
                        inputMode="decimal"
                        value={transferUnitPrice}
                        onChange={(e) => setTransferUnitPrice(e.target.value)}
                      />
                    </label>
                  ) : null}
                  <label>
                    İskonto %
                    <input
                      type="text"
                      inputMode="decimal"
                      value={transferDiscount}
                      onChange={(e) => setTransferDiscount(e.target.value)}
                    />
                  </label>
                  <label>
                    Sipariş KDV %
                    <input
                      type="text"
                      inputMode="decimal"
                      value={transferVat}
                      onChange={(e) => setTransferVat(e.target.value)}
                    />
                  </label>
                </div>
                {transferBlockedReason ? (
                  <div className="db-warn">{transferBlockedReason}</div>
                ) : null}
                {transferError ? (
                  <div className="db-error">{transferError}</div>
                ) : null}
                {transferNotice ? (
                  <div className="db-info">{transferNotice}</div>
                ) : null}
                <div className="db-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={transferBusy || transferBlockedReason != null}
                    onClick={() => void handleCreateForm()}
                  >
                    {transferBusy ? 'Oluşturuluyor…' : 'Formu Oluştur'}
                  </button>
                  <button
                    type="button"
                    disabled={transferBusy || transferBlockedReason != null}
                    onClick={() => void handleTransferToOrder()}
                  >
                    Siparişe Aktar
                  </button>
                  <button
                    type="button"
                    disabled={previewBusy}
                    onClick={() => void handleWorkshopPreview()}
                  >
                    {previewBusy
                      ? 'Açılıyor…'
                      : 'Taslak Üretim Formu (TASLAK)'}
                  </button>
                </div>
                {previewError ? (
                  <div className="db-error">{previewError}</div>
                ) : null}
                <div className="db-info">
                  Formu Oluştur siparişi kaydeder ve tek A4’te üst müşteri /
                  alt üretim formunu açar.
                </div>
              </div>
            </>
          ) : null}
          <div className="db-actions">
            <button type="button" onClick={() => setStep(6)}>
              Geri
            </button>
          </div>
        </div>
      ) : null}
        </div>

        <aside className="db-aside" aria-label="Canlı maliyet özeti">
          <h3>Maliyet özeti</h3>
          {quoting ? <p className="lead">Güncelleniyor…</p> : null}
          {quoteError ? <div className="db-error">{quoteError}</div> : null}
          {!quote && !quoting && canGoStep3 ? (
            <p className="lead">Seçimler tamamlandıkça özet burada görünür.</p>
          ) : null}
          {quote ? (
            <dl className="db-aside-list">
              {quote.componentCostBreakdown.map((item) => (
                <div key={item.code}>
                  <dt>{item.label}</dt>
                  <dd>
                    {item.lineTotal != null
                      ? formatMoney(item.lineTotal)
                      : '—'}
                  </dd>
                </div>
              ))}
              <div>
                <dt>Katsayı öncesi</dt>
                <dd>
                  {formatMoney(quote.baseSubtotalBeforeWidthCoefficient)}
                </dd>
              </div>
              <div>
                <dt>En katsayısı</dt>
                <dd>
                  {quote.widthCoefficient != null
                    ? formatCoefficientDisplay(quote.widthCoefficient)
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Üretim maliyeti</dt>
                <dd>{formatMoneyOrDash(quote.widthAdjustedSubtotal)}</dd>
              </div>
              <div>
                <dt>Kâr</dt>
                <dd>{formatMoneyOrDash(quote.sale.profitAmount)}</dd>
              </div>
              <div>
                <dt>KDV</dt>
                <dd>{formatMoneyOrDash(quote.sale.vatAmount)}</dd>
              </div>
              <div>
                <dt>Nakit satış</dt>
                <dd>{formatMoneyOrDash(quote.sale.cashSale)}</dd>
              </div>
              <div>
                <dt>Kart / taksit</dt>
                <dd>{formatMoneyOrDash(quote.sale.cardSale)}</dd>
              </div>
            </dl>
          ) : null}
          {quote?.missingSources?.length ? (
            <div className="db-warn">
              <ul>
                {quote.missingSources.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {quote?.sale.reason ? (
            <div className="db-warn">{quote.sale.reason}</div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

