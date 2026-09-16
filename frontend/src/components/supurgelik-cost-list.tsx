import { FormEvent, useEffect, useState } from 'react';
import {
  fetchSupurgelikCosts,
  SUPURGELIK_PRODUCT_CODES,
  SupurgelikCostRow,
  SupurgelikCostsResponse,
  SupurgelikProductCode,
  SupurgelikRowErrorCode,
} from '../api/cost-calculation-api';
import {
  listRawMaterials,
  RawMaterial,
  updateRawMaterialCardInstallmentPrice,
} from '../api/raw-materials-api';
import {
  ExtraCostItem,
  getSupurgelikPpWrapping,
  listExtraCosts,
  updateExtraCostValue,
} from '../api/extra-costs-api';
import {
  getSupurgelikPricingSetting,
  SupurgelikPricingSetting,
  updateSupurgelikPricingSetting,
} from '../api/pricing-settings-api';
import {
  listSupurgelikDecorativeRates,
  selectSupurgelikDecorativeRates,
  SupurgelikDecorativeRateItem,
  SupurgelikDecorativeRateThickness,
  updateSupurgelikDecorativeRate,
} from '../api/pricing-thickness-modifiers-api';
import { ApiError } from '../lib/api';
import { formatPieceSizeCm, formatSheetSizeCm } from '../lib/length';
import { formatPercentRate, formatTryTwoDecimals } from '../lib/money';

const PRODUCT_META: Record<
  SupurgelikProductCode,
  { label: string; shortLabel: string; description: string }
> = {
  DUZ_SUPURGELIK: {
    label: 'Düz Süpürgelik',
    shortLabel: 'Düz',
    description: 'Standart MDF süpürgelik fiyat listesi',
  },
  DEKORATIF_SUPURGELIK: {
    label: 'Dekoratif Süpürgelik',
    shortLabel: 'Dekoratif',
    description: 'Kalınlığa bağlı dekoratif fark içeren liste',
  },
  DUZ_PP_SARMA_SUPURGELIK: {
    label: 'Düz PP Sarma Süpürgelik',
    shortLabel: 'Düz PP Sarma',
    description: 'PP sarma maliyeti eklenmiş düz süpürgelik listesi',
  },
  DEKORATIF_PP_SARMA_SUPURGELIK: {
    label: 'Dekoratif PP Sarma Süpürgelik',
    shortLabel: 'Dekoratif PP Sarma',
    description: 'PP sarma maliyeti üzerine dekoratif fark uygulanan liste',
  },
};

const STATUS_LABELS: Record<SupurgelikRowErrorCode, string> = {
  RAW_MATERIAL_PRICE_MISSING: 'MDF fiyatı eksik',
  DECORATIVE_RATE_MISSING: 'Dekoratif oran tanımlı değil',
  PP_WRAPPING_COST_MISSING: 'PP sarma maliyeti tanımlı değil',
};

const SUPURGELIK_EXTRA_COST_CODES = ['CUTTING', 'LABOR'] as const;
type SupurgelikExtraCostCode = (typeof SUPURGELIK_EXTRA_COST_CODES)[number];

function isDecorativeProduct(productCode: SupurgelikProductCode): boolean {
  return (
    productCode === 'DEKORATIF_SUPURGELIK' ||
    productCode === 'DEKORATIF_PP_SARMA_SUPURGELIK'
  );
}

function normalizeDecimalInput(value: string): string {
  return value.trim().replace(',', '.');
}

function isPositiveDecimalInput(value: string): boolean {
  const normalized = normalizeDecimalInput(value);
  return (
    /^\d+(\.\d{1,4})?$/.test(normalized) &&
    !/^0+(\.0+)?$/.test(normalized)
  );
}

function todayIsoDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function selectSupurgelikExtraCosts(items: ExtraCostItem[]): ExtraCostItem[] {
  const byCode = new Map(items.map((item) => [item.typeCode, item]));
  return SUPURGELIK_EXTRA_COST_CODES.flatMap((code) => {
    const item = byCode.get(code);
    return item ? [item] : [];
  });
}

export function selectSupurgelikRawMaterials(
  materials: RawMaterial[],
  rows: SupurgelikCostRow[],
): RawMaterial[] {
  const usedCodes = new Set(rows.map((row) => row.rawMaterial.code));

  return materials
    .filter(
      (material) =>
        material.isActive &&
        material.sheetWidthMm === 2100 &&
        material.sheetLengthMm === 2800 &&
        usedCodes.has(material.code),
    )
    .sort((left, right) =>
      left.thicknessMm.localeCompare(right.thicknessMm, 'tr-TR', {
        numeric: true,
      }),
    );
}

function StatusBadge({ row }: { row: SupurgelikCostRow }) {
  if (!row.errorCode) return <span className="cc-supurgelik-no-status">—</span>;

  return (
    <span
      className={`cc-supurgelik-status cc-supurgelik-status-${row.errorCode.toLocaleLowerCase(
        'tr-TR',
      )}`}
      title={row.errorMessage ?? STATUS_LABELS[row.errorCode]}
    >
      {STATUS_LABELS[row.errorCode]}
    </span>
  );
}

function PublishedPriceCell({ row }: { row: SupurgelikCostRow }) {
  if (row.errorCode === 'RAW_MATERIAL_PRICE_MISSING') return <>—</>;

  if (row.errorCode === 'PP_WRAPPING_COST_MISSING') {
    return (
      <span
        className="cc-supurgelik-status cc-supurgelik-status-pp_wrapping_cost_missing"
        title={row.errorMessage ?? STATUS_LABELS.PP_WRAPPING_COST_MISSING}
      >
        {STATUS_LABELS.PP_WRAPPING_COST_MISSING}
      </span>
    );
  }

  if (row.pricing.publishedCashPrice == null) return <>—</>;

  return (
    <span className="cc-badge cc-badge-cash">
      {formatTryTwoDecimals(row.pricing.publishedCashPrice)}
    </span>
  );
}

function SupurgelikTable({
  rows,
  productCode,
}: {
  rows: SupurgelikCostRow[];
  productCode: SupurgelikProductCode;
}) {
  const decorative = isDecorativeProduct(productCode);

  return (
    <table className="cc-table cc-supurgelik-table">
      <thead>
        <tr>
          <th className="cc-col-thickness">Kalınlık</th>
          <th className="cc-col-size">Ölçü</th>
          <th>NET</th>
          <th>Tabaka Fiyatı</th>
          <th>MDF Maliyeti</th>
          <th>Ek Maliyet</th>
          <th>Üretim Maliyeti</th>
          <th>Kâr %</th>
          <th>Kâr Tutarı</th>
          {decorative ? <th>Dekoratif %</th> : null}
          {decorative ? <th>Baz Nakit</th> : null}
          <th>{decorative ? 'Dekoratif Nakit' : 'Nakit Satış'}</th>
          <th>Durum</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const startsThicknessGroup =
            index > 0 && rows[index - 1].thicknessMm !== row.thicknessMm;
          const wrappingMissingInPriceCell =
            row.errorCode === 'PP_WRAPPING_COST_MISSING';

          return (
            <tr
              key={`${row.thicknessMm}-${row.widthMm}-${row.lengthMm}`}
              className={startsThicknessGroup ? 'cc-supurgelik-group-start' : undefined}
            >
              <td className="cc-col-thickness">{row.thicknessMm} mm</td>
              <td className="cc-col-size">
                {formatPieceSizeCm(row.widthMm, row.lengthMm)}
              </td>
              <td className="cc-qty">{row.productionYield.netQty}</td>
              <td className="cc-money">
                {formatTryTwoDecimals(row.sheetPrice?.amount)}
              </td>
              <td className="cc-money">
                {row.mdfUnitCost == null ? (
                  '—'
                ) : (
                  <span className="cc-badge cc-badge-mdf">
                    {formatTryTwoDecimals(row.mdfUnitCost)}
                  </span>
                )}
              </td>
              <td className="cc-money">
                <span className="cc-badge cc-badge-expense">
                  {formatTryTwoDecimals(row.extraCostsTotal)}
                </span>
              </td>
              <td className="cc-money">
                {row.productionCost == null ? (
                  '—'
                ) : (
                  <span className="cc-badge cc-badge-prod">
                    {formatTryTwoDecimals(row.productionCost)}
                  </span>
                )}
              </td>
              <td className="cc-qty">{formatPercentRate(row.pricing.profitRate)}</td>
              <td className="cc-money">
                {formatTryTwoDecimals(row.pricing.profitAmount)}
              </td>
              {decorative ? (
                <td className="cc-qty">
                  {formatPercentRate(row.pricing.decorativeRate)}
                </td>
              ) : null}
              {decorative ? (
                <td className="cc-money">
                  {row.pricing.basePublishedCashPrice == null ? (
                    '—'
                  ) : (
                    <span className="cc-badge cc-badge-sale">
                      {formatTryTwoDecimals(row.pricing.basePublishedCashPrice)}
                    </span>
                  )}
                </td>
              ) : null}
              <td className="cc-money cc-supurgelik-price-col">
                <PublishedPriceCell row={row} />
              </td>
              <td className="cc-supurgelik-status-cell">
                {wrappingMissingInPriceCell ? (
                  <span className="cc-supurgelik-no-status">—</span>
                ) : (
                  <StatusBadge row={row} />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SupurgelikCostList() {
  const [productCode, setProductCode] =
    useState<SupurgelikProductCode>('DUZ_SUPURGELIK');
  const [data, setData] = useState<SupurgelikCostsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const [sourceMaterials, setSourceMaterials] = useState<RawMaterial[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [sourceSaving, setSourceSaving] = useState(false);
  const [sourceExtraCosts, setSourceExtraCosts] = useState<ExtraCostItem[]>([]);
  const [sourceExtraCostsLoading, setSourceExtraCostsLoading] = useState(false);
  const [sourceExtraCostsError, setSourceExtraCostsError] = useState<string | null>(null);
  const [editingExtraCostCode, setEditingExtraCostCode] =
    useState<SupurgelikExtraCostCode | null>(null);
  const [extraCostAmountInput, setExtraCostAmountInput] = useState('');
  const [extraCostSaving, setExtraCostSaving] = useState(false);
  const [sourcePricing, setSourcePricing] =
    useState<SupurgelikPricingSetting | null>(null);
  const [sourcePricingLoading, setSourcePricingLoading] = useState(false);
  const [sourcePricingError, setSourcePricingError] = useState<string | null>(null);
  const [editingProfitRate, setEditingProfitRate] = useState(false);
  const [profitRateInput, setProfitRateInput] = useState('');
  const [profitRateSaving, setProfitRateSaving] = useState(false);
  const [sourceDecorativeRates, setSourceDecorativeRates] = useState<
    SupurgelikDecorativeRateItem[]
  >([]);
  const [sourceDecorativeRatesLoading, setSourceDecorativeRatesLoading] =
    useState(false);
  const [sourceDecorativeRatesError, setSourceDecorativeRatesError] = useState<
    string | null
  >(null);
  const [editingDecorativeThicknessMm, setEditingDecorativeThicknessMm] =
    useState<SupurgelikDecorativeRateThickness | null>(null);
  const [decorativeRateInput, setDecorativeRateInput] = useState('');
  const [decorativeRateSaving, setDecorativeRateSaving] = useState(false);
  const [sourcePpWrapping, setSourcePpWrapping] = useState<ExtraCostItem | null>(
    null,
  );
  const [sourcePpWrappingLoading, setSourcePpWrappingLoading] = useState(false);
  const [sourcePpWrappingError, setSourcePpWrappingError] = useState<string | null>(
    null,
  );
  const [ppWrappingAmountInput, setPpWrappingAmountInput] = useState('');
  const [ppWrappingSaving, setPpWrappingSaving] = useState(false);
  const sourceBusy =
    sourceSaving ||
    extraCostSaving ||
    profitRateSaving ||
    decorativeRateSaving ||
    ppWrappingSaving;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    void fetchSupurgelikCosts(productCode)
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : 'Süpürgelik maliyetleri yüklenemedi.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productCode, requestVersion]);

  const loadSourceMaterials = async (
    costData: SupurgelikCostsResponse | null = data,
  ) => {
    if (!costData) {
      setSourceMaterials([]);
      setSourceError('Süpürgelik kaynakları için önce maliyet listesi yüklenmelidir.');
      return;
    }

    setSourceLoading(true);
    setSourceError(null);
    try {
      const materials = await listRawMaterials({ isActive: true });
      setSourceMaterials(selectSupurgelikRawMaterials(materials, costData.rows));
    } catch (requestError) {
      setSourceMaterials([]);
      setSourceError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Ham MDF fiyatları yüklenemedi.',
      );
    } finally {
      setSourceLoading(false);
    }
  };

  const loadSourceExtraCosts = async () => {
    setSourceExtraCostsLoading(true);
    setSourceExtraCostsError(null);
    try {
      const response = await listExtraCosts('SUPURGELIK');
      setSourceExtraCosts(selectSupurgelikExtraCosts(response.items));
    } catch (requestError) {
      setSourceExtraCosts([]);
      setSourceExtraCostsError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Ortak üretim giderleri yüklenemedi.',
      );
    } finally {
      setSourceExtraCostsLoading(false);
    }
  };

  const loadSourcePricing = async () => {
    setSourcePricingLoading(true);
    setSourcePricingError(null);
    try {
      const response = await getSupurgelikPricingSetting();
      setSourcePricing(response);
    } catch (requestError) {
      setSourcePricing(null);
      setSourcePricingError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Kâr oranı yüklenemedi.',
      );
    } finally {
      setSourcePricingLoading(false);
    }
  };

  const loadSourceDecorativeRates = async () => {
    setSourceDecorativeRatesLoading(true);
    setSourceDecorativeRatesError(null);
    try {
      const response = await listSupurgelikDecorativeRates();
      setSourceDecorativeRates(selectSupurgelikDecorativeRates(response.items));
    } catch (requestError) {
      setSourceDecorativeRates([]);
      setSourceDecorativeRatesError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Dekoratif oranlar yüklenemedi.',
      );
    } finally {
      setSourceDecorativeRatesLoading(false);
    }
  };

  const loadSourcePpWrapping = async () => {
    setSourcePpWrappingLoading(true);
    setSourcePpWrappingError(null);
    try {
      const response = await getSupurgelikPpWrapping();
      setSourcePpWrapping(response.items[0] ?? null);
    } catch (requestError) {
      setSourcePpWrapping(null);
      setSourcePpWrappingError(
        requestError instanceof ApiError
          ? requestError.message
          : 'PP sarma maliyeti yüklenemedi.',
      );
    } finally {
      setSourcePpWrappingLoading(false);
    }
  };

  const openSourceDrawer = () => {
    setSourceDrawerOpen(true);
    setSourceNotice(null);
    setEditingMaterialId(null);
    setPriceInput('');
    setEditingExtraCostCode(null);
    setExtraCostAmountInput('');
    setSourceExtraCostsError(null);
    setEditingProfitRate(false);
    setProfitRateInput('');
    setSourcePricingError(null);
    setEditingDecorativeThicknessMm(null);
    setDecorativeRateInput('');
    setSourceDecorativeRatesError(null);
    setPpWrappingAmountInput('');
    setSourcePpWrappingError(null);
    void loadSourceMaterials();
    void loadSourceExtraCosts();
    void loadSourcePricing();
    void loadSourceDecorativeRates();
    void loadSourcePpWrapping();
  };

  const closeSourceDrawer = () => {
    if (sourceBusy) return;
    setSourceDrawerOpen(false);
    setEditingMaterialId(null);
    setPriceInput('');
    setEditingExtraCostCode(null);
    setExtraCostAmountInput('');
    setEditingProfitRate(false);
    setProfitRateInput('');
    setEditingDecorativeThicknessMm(null);
    setDecorativeRateInput('');
    setPpWrappingAmountInput('');
    setSourceError(null);
    setSourceExtraCostsError(null);
    setSourcePricingError(null);
    setSourceDecorativeRatesError(null);
    setSourcePpWrappingError(null);
    setSourceNotice(null);
  };

  const startExtraCostEdit = (item: ExtraCostItem) => {
    if (!SUPURGELIK_EXTRA_COST_CODES.includes(item.typeCode as SupurgelikExtraCostCode)) {
      return;
    }
    setEditingExtraCostCode(item.typeCode as SupurgelikExtraCostCode);
    setExtraCostAmountInput(item.amount ?? '');
    setSourceExtraCostsError(null);
    setSourceNotice(null);
  };

  const startProfitRateEdit = () => {
    setEditingProfitRate(true);
    setProfitRateInput(sourcePricing?.profitRate ?? '');
    setSourcePricingError(null);
    setSourceNotice(null);
  };

  const startDecorativeRateEdit = (item: SupurgelikDecorativeRateItem) => {
    setEditingDecorativeThicknessMm(item.thicknessMm);
    setDecorativeRateInput(item.rate);
    setSourceDecorativeRatesError(null);
    setSourceNotice(null);
  };

  const saveDecorativeRate = async (event: FormEvent) => {
    event.preventDefault();
    if (editingDecorativeThicknessMm == null) return;
    if (!isPositiveDecimalInput(decorativeRateInput)) {
      setSourceDecorativeRatesError(
        'Dekoratif oran 0’dan büyük geçerli bir değer olmalıdır (örn. 25).',
      );
      return;
    }

    setDecorativeRateSaving(true);
    setSourceDecorativeRatesError(null);
    try {
      const result = await updateSupurgelikDecorativeRate(
        editingDecorativeThicknessMm,
        normalizeDecimalInput(decorativeRateInput),
      );
      setSourceDecorativeRates(selectSupurgelikDecorativeRates(result.items));
      setSourceNotice(`${editingDecorativeThicknessMm} mm dekoratif oranı kaydedildi.`);
      setEditingDecorativeThicknessMm(null);
      setDecorativeRateInput('');
      setRequestVersion((version) => version + 1);
      await loadSourceDecorativeRates();
    } catch (requestError) {
      setSourceDecorativeRatesError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Dekoratif oran kaydedilemedi.',
      );
    } finally {
      setDecorativeRateSaving(false);
    }
  };

  const savePpWrapping = async (event: FormEvent) => {
    event.preventDefault();
    if (!isPositiveDecimalInput(ppWrappingAmountInput)) {
      setSourcePpWrappingError(
        'PP sarma maliyeti 0’dan büyük geçerli bir tutar olmalıdır.',
      );
      return;
    }

    setPpWrappingSaving(true);
    setSourcePpWrappingError(null);
    try {
      const result = await updateExtraCostValue('PP_WRAPPING', {
        productGroup: 'SUPURGELIK',
        amount: normalizeDecimalInput(ppWrappingAmountInput),
        effectiveFrom: todayIsoDate(),
      });
      setSourcePpWrapping(result.items[0] ?? null);
      setSourceNotice('PP sarma maliyeti kaydedildi.');
      setPpWrappingAmountInput('');
      setRequestVersion((version) => version + 1);
      await loadSourcePpWrapping();
    } catch (requestError) {
      setSourcePpWrappingError(
        requestError instanceof ApiError
          ? requestError.message
          : 'PP sarma maliyeti kaydedilemedi.',
      );
    } finally {
      setPpWrappingSaving(false);
    }
  };

  const saveProfitRate = async (event: FormEvent) => {
    event.preventDefault();
    if (!isPositiveDecimalInput(profitRateInput)) {
      setSourcePricingError(
        'Kâr oranı 0’dan büyük geçerli bir değer olmalıdır (örn. 20).',
      );
      return;
    }

    setProfitRateSaving(true);
    setSourcePricingError(null);
    try {
      const result = await updateSupurgelikPricingSetting(
        normalizeDecimalInput(profitRateInput),
      );
      setSourcePricing(result);
      setSourceNotice('Kâr oranı kaydedildi.');
      setEditingProfitRate(false);
      setProfitRateInput('');
      setRequestVersion((version) => version + 1);
      await loadSourcePricing();
    } catch (requestError) {
      setSourcePricingError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Kâr oranı kaydedilemedi.',
      );
    } finally {
      setProfitRateSaving(false);
    }
  };

  const saveExtraCost = async (event: FormEvent) => {
    event.preventDefault();
    const item = sourceExtraCosts.find(
      (candidate) => candidate.typeCode === editingExtraCostCode,
    );
    if (!item || !editingExtraCostCode) return;

    if (!isPositiveDecimalInput(extraCostAmountInput)) {
      setSourceExtraCostsError(
        'Üretim gideri 0’dan büyük geçerli bir tutar olmalıdır (örn. 5).',
      );
      return;
    }

    setExtraCostSaving(true);
    setSourceExtraCostsError(null);
    try {
      await updateExtraCostValue(editingExtraCostCode, {
        productGroup: 'SUPURGELIK',
        amount: normalizeDecimalInput(extraCostAmountInput),
        effectiveFrom: todayIsoDate(),
      });
      setSourceNotice(`${item.typeName} gideri kaydedildi.`);
      setEditingExtraCostCode(null);
      setExtraCostAmountInput('');
      setRequestVersion((version) => version + 1);
      await loadSourceExtraCosts();
    } catch (requestError) {
      setSourceExtraCostsError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Ortak üretim gideri kaydedilemedi.',
      );
    } finally {
      setExtraCostSaving(false);
    }
  };

  const startPriceEdit = (material: RawMaterial) => {
    setEditingMaterialId(material.id);
    setPriceInput(material.cardInstallmentPrice ?? '');
    setSourceError(null);
    setSourceNotice(null);
  };

  const saveCardInstallmentPrice = async (event: FormEvent) => {
    event.preventDefault();
    const material = sourceMaterials.find((item) => item.id === editingMaterialId);
    if (!material) return;

    if (!isPositiveDecimalInput(priceInput)) {
      setSourceError(
        'Kart / Taksit fiyatı 0’dan büyük geçerli bir tutar olmalıdır (örn. 1900).',
      );
      return;
    }

    setSourceSaving(true);
    setSourceError(null);
    try {
      const result = await updateRawMaterialCardInstallmentPrice(material.id, {
        price: normalizeDecimalInput(priceInput),
      });
      setSourceNotice(
        result.changed
          ? `${material.thicknessMm} mm Kart / Taksit fiyatı güncellendi.`
          : 'Fiyat değişmedi; yeni geçmiş kaydı oluşturulmadı.',
      );
      setEditingMaterialId(null);
      setPriceInput('');
      setRequestVersion((version) => version + 1);
      await loadSourceMaterials(data);
    } catch (requestError) {
      setSourceError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Kart / Taksit fiyatı kaydedilemedi.',
      );
    } finally {
      setSourceSaving(false);
    }
  };

  const meta = PRODUCT_META[productCode];

  return (
    <div className="cc-supurgelik-list">
      <div
        className="cc-supurgelik-product-tabs"
        role="tablist"
        aria-label="Süpürgelik ürünü"
      >
        {SUPURGELIK_PRODUCT_CODES.map((code) => (
          <button
            key={code}
            type="button"
            role="tab"
            aria-selected={productCode === code}
            className={
              productCode === code
                ? 'cc-supurgelik-product-tab active'
                : 'cc-supurgelik-product-tab'
            }
            onClick={() => setProductCode(code)}
          >
            {PRODUCT_META[code].shortLabel}
          </button>
        ))}
      </div>

      <div className="cc-supurgelik-heading">
        <div>
          <span className="cc-supurgelik-eyebrow">Süpürgelik fiyat listesi</span>
          <h2>{data?.productName ?? meta.label}</h2>
          <p>{meta.description}</p>
        </div>
        <div className="cc-supurgelik-heading-actions">
          <button
            type="button"
            className="cc-btn cc-btn-primary cc-btn-sm"
            onClick={openSourceDrawer}
            disabled={loading || !data}
          >
            Maliyet Ayarlarını Düzenle
          </button>
          <div className="cc-supurgelik-count" aria-live="polite">
            <span>Listelenen satır</span>
            <strong>{data?.rowCount ?? '—'}</strong>
          </div>
          <button
            type="button"
            className="cc-btn cc-btn-sm"
            onClick={() => setRequestVersion((version) => version + 1)}
            disabled={loading}
          >
            {loading ? 'Yükleniyor…' : 'Listeyi Yenile'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="cc-alert cc-alert-actions">
          <span>{error}</span>
          <button
            type="button"
            className="cc-btn cc-btn-sm"
            onClick={() => setRequestVersion((version) => version + 1)}
          >
            Yeniden Dene
          </button>
        </div>
      ) : null}

      <div className="cc-table-wrap cc-supurgelik-table-wrap">
        {loading ? (
          <div
            className="cc-table-skeleton"
            aria-label="Süpürgelik maliyetleri yükleniyor"
          >
            {Array.from({ length: 10 }).map((_, index) => (
              <span key={index} />
            ))}
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="cc-empty">
            <p>Gösterilecek Süpürgelik ölçüsü yok.</p>
            <button
              type="button"
              className="cc-btn cc-btn-sm"
              onClick={() => setRequestVersion((version) => version + 1)}
            >
              Yenile
            </button>
          </div>
        ) : (
          <SupurgelikTable rows={data.rows} productCode={productCode} />
        )}
      </div>

      {sourceDrawerOpen ? (
        <div
          className="cc-drawer-overlay"
          onClick={closeSourceDrawer}
          role="presentation"
        >
          <aside
            className="cc-drawer cc-supurgelik-source-drawer"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Süpürgelik maliyet ayarlarını düzenle"
          >
            <div className="cc-drawer-header">
              <div>
                <h2>Maliyet Ayarlarını Düzenle</h2>
                <span className="cc-supurgelik-source-subtitle">
                  Süpürgelik
                </span>
              </div>
              <button
                type="button"
                className="cc-btn cc-btn-sm"
                onClick={closeSourceDrawer}
                disabled={sourceBusy}
              >
                Kapat
              </button>
            </div>

            <div className="cc-supurgelik-source-body">
              <div className="cc-supurgelik-source-section-heading">
                <span>Ham MDF Fiyatları</span>
                <small>Kart / taksit alış fiyatı</small>
              </div>

              {sourceNotice ? <div className="cc-notice">{sourceNotice}</div> : null}
              {sourceError ? <div className="cc-alert">{sourceError}</div> : null}

              {sourceLoading ? (
                <div className="cc-supurgelik-source-loading">
                  Ham MDF fiyatları yükleniyor…
                </div>
              ) : sourceMaterials.length === 0 ? (
                <div className="cc-empty">
                  <p>Kullanılan aktif Süpürgelik MDF kaynağı bulunamadı.</p>
                  <button
                    type="button"
                    className="cc-btn cc-btn-sm"
                    onClick={() => void loadSourceMaterials()}
                  >
                    Yeniden Dene
                  </button>
                </div>
              ) : (
                <div className="cc-supurgelik-source-list">
                  {sourceMaterials.map((material) => {
                    const editing = editingMaterialId === material.id;
                    return (
                      <div className="cc-supurgelik-source-row" key={material.id}>
                        <div className="cc-supurgelik-source-material">
                          <strong>{material.thicknessMm} mm MDF</strong>
                          <span>
                            {formatSheetSizeCm(
                              material.sheetWidthMm,
                              material.sheetLengthMm,
                            )}
                          </span>
                          <code>{material.code}</code>
                        </div>

                        {editing ? (
                          <form
                            className="cc-supurgelik-source-edit"
                            onSubmit={(event) => void saveCardInstallmentPrice(event)}
                          >
                            <label className="cc-field">
                              <span>Kart / Taksit Ham MDF Fiyatı</span>
                              <input
                                className="cc-input"
                                inputMode="decimal"
                                autoFocus
                                value={priceInput}
                                onChange={(event) => setPriceInput(event.target.value)}
                                placeholder="1900.00"
                                disabled={sourceSaving}
                              />
                            </label>
                            <div className="cc-supurgelik-source-edit-actions">
                              <button
                                type="button"
                                className="cc-btn cc-btn-sm"
                                onClick={() => {
                                  setEditingMaterialId(null);
                                  setPriceInput('');
                                  setSourceError(null);
                                }}
                                disabled={sourceSaving}
                              >
                                İptal
                              </button>
                              <button
                                type="submit"
                                className="cc-btn cc-btn-primary cc-btn-sm"
                                disabled={sourceSaving}
                              >
                                {sourceSaving ? 'Kaydediliyor…' : 'Kaydet'}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="cc-supurgelik-source-price">
                            <span>Kart / Taksit Fiyatı</span>
                            {material.cardInstallmentPrice == null ? (
                              <strong className="missing">Tanımlı değil</strong>
                            ) : (
                              <strong>
                                {formatTryTwoDecimals(
                                  material.cardInstallmentPrice,
                                )}
                              </strong>
                            )}
                            <button
                              type="button"
                              className="cc-btn cc-btn-sm"
                              onClick={() => startPriceEdit(material)}
                            >
                              {material.cardInstallmentPrice == null
                                ? 'Fiyat Gir'
                                : 'Düzenle'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="cc-note">
                Eski fiyat silinmez; yeni fiyat bu tarihten itibaren geçerli olur.
              </p>

              <div className="cc-supurgelik-source-section-heading cc-supurgelik-source-section-divider">
                <span>Ortak Üretim Giderleri</span>
                <small>Kesim ve işçilik</small>
              </div>

              {sourceExtraCostsError ? (
                <div className="cc-alert">{sourceExtraCostsError}</div>
              ) : null}

              {sourceExtraCostsLoading ? (
                <div className="cc-supurgelik-source-loading">
                  Ortak üretim giderleri yükleniyor…
                </div>
              ) : sourceExtraCosts.length === 0 ? (
                <div className="cc-empty">
                  <p>Kesim veya işçilik gideri bulunamadı.</p>
                  <button
                    type="button"
                    className="cc-btn cc-btn-sm"
                    onClick={() => void loadSourceExtraCosts()}
                  >
                    Yeniden Dene
                  </button>
                </div>
              ) : (
                <div className="cc-supurgelik-source-list">
                  {sourceExtraCosts.map((item) => {
                    const editing = editingExtraCostCode === item.typeCode;
                    return (
                      <div className="cc-supurgelik-source-row" key={item.typeCode}>
                        <div className="cc-supurgelik-source-material">
                          <strong>{item.typeName}</strong>
                          <span>Tüm süpürgelik hesaplarında ortak</span>
                        </div>

                        {editing ? (
                          <form
                            className="cc-supurgelik-source-edit"
                            onSubmit={(event) => void saveExtraCost(event)}
                          >
                            <label className="cc-field">
                              <span>Yeni Tutar</span>
                              <input
                                className="cc-input"
                                inputMode="decimal"
                                autoFocus
                                value={extraCostAmountInput}
                                onChange={(event) =>
                                  setExtraCostAmountInput(event.target.value)
                                }
                                placeholder="5.00"
                                disabled={extraCostSaving}
                              />
                            </label>
                            <div className="cc-supurgelik-source-edit-actions">
                              <button
                                type="button"
                                className="cc-btn cc-btn-sm"
                                onClick={() => {
                                  setEditingExtraCostCode(null);
                                  setExtraCostAmountInput('');
                                  setSourceExtraCostsError(null);
                                }}
                                disabled={extraCostSaving}
                              >
                                İptal
                              </button>
                              <button
                                type="submit"
                                className="cc-btn cc-btn-primary cc-btn-sm"
                                disabled={extraCostSaving}
                              >
                                {extraCostSaving ? 'Kaydediliyor…' : 'Kaydet'}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="cc-supurgelik-source-price">
                            <span>Mevcut Tutar</span>
                            {item.amount == null ? (
                              <strong className="missing">Tanımlı değil</strong>
                            ) : (
                              <strong>{formatTryTwoDecimals(item.amount)}</strong>
                            )}
                            <button
                              type="button"
                              className="cc-btn cc-btn-sm"
                              onClick={() => startExtraCostEdit(item)}
                              disabled={sourceBusy}
                            >
                              {item.amount == null ? 'Değer Gir' : 'Düzenle'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="cc-note">
                Değişiklikten sonra maliyetler otomatik olarak yeniden hesaplanır.
              </p>

              <div className="cc-supurgelik-source-section-heading cc-supurgelik-source-section-divider">
                <span>Fiyatlandırma</span>
                <small>Tüm süpürgelik ürünleri için kâr oranı</small>
              </div>

              {sourcePricingError ? (
                <div className="cc-alert">{sourcePricingError}</div>
              ) : null}

              {sourcePricingLoading ? (
                <div className="cc-supurgelik-source-loading">
                  Kâr oranı yükleniyor…
                </div>
              ) : sourcePricing == null ? (
                <div className="cc-empty">
                  <p>Kâr oranı bulunamadı.</p>
                  <button
                    type="button"
                    className="cc-btn cc-btn-sm"
                    onClick={() => void loadSourcePricing()}
                  >
                    Yeniden Dene
                  </button>
                </div>
              ) : (
                <div className="cc-supurgelik-source-list">
                  <div className="cc-supurgelik-source-row">
                    <div className="cc-supurgelik-source-material">
                      <strong>Kâr Oranı</strong>
                      <span>Tüm süpürgelik ürünleri</span>
                    </div>

                    {editingProfitRate ? (
                      <form
                        className="cc-supurgelik-source-edit"
                        onSubmit={(event) => void saveProfitRate(event)}
                      >
                        <label className="cc-field">
                          <span>Yeni Kâr Oranı (%)</span>
                          <input
                            className="cc-input"
                            inputMode="decimal"
                            autoFocus
                            value={profitRateInput}
                            onChange={(event) =>
                              setProfitRateInput(event.target.value)
                            }
                            placeholder="21"
                            disabled={profitRateSaving}
                          />
                        </label>
                        <div className="cc-supurgelik-source-edit-actions">
                          <button
                            type="button"
                            className="cc-btn cc-btn-sm"
                            onClick={() => {
                              setEditingProfitRate(false);
                              setProfitRateInput('');
                              setSourcePricingError(null);
                            }}
                            disabled={profitRateSaving}
                          >
                            İptal
                          </button>
                          <button
                            type="submit"
                            className="cc-btn cc-btn-primary cc-btn-sm"
                            disabled={profitRateSaving}
                          >
                            {profitRateSaving ? 'Kaydediliyor…' : 'Kaydet'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="cc-supurgelik-source-price">
                        <span>Mevcut Oran</span>
                        <strong>
                          {formatPercentRate(sourcePricing.profitRate)}
                        </strong>
                        <button
                          type="button"
                          className="cc-btn cc-btn-sm"
                          onClick={startProfitRateEdit}
                          disabled={sourceBusy}
                        >
                          Düzenle
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <p className="cc-note">
                Değişiklikten sonra satış fiyatları yeniden hesaplanır.
              </p>

              <div className="cc-supurgelik-source-section-heading cc-supurgelik-source-section-divider">
                <span>Dekoratif Oranlar</span>
                <small>12 / 14 / 18 mm kalınlıklar</small>
              </div>

              {sourceDecorativeRatesError ? (
                <div className="cc-alert">{sourceDecorativeRatesError}</div>
              ) : null}

              {sourceDecorativeRatesLoading ? (
                <div className="cc-supurgelik-source-loading">
                  Dekoratif oranlar yükleniyor…
                </div>
              ) : sourceDecorativeRates.length === 0 ? (
                <div className="cc-empty">
                  <p>Aktif 12 / 14 / 18 mm dekoratif oranı bulunamadı.</p>
                  <button
                    type="button"
                    className="cc-btn cc-btn-sm"
                    onClick={() => void loadSourceDecorativeRates()}
                  >
                    Yeniden Dene
                  </button>
                </div>
              ) : (
                <div className="cc-supurgelik-source-list">
                  {sourceDecorativeRates.map((item) => (
                    <div
                      className="cc-supurgelik-source-row"
                      key={item.modifierId}
                    >
                      <div className="cc-supurgelik-source-material">
                        <strong>{item.thicknessMm} mm</strong>
                        <span>Kalınlık bazlı dekoratif fark</span>
                      </div>

                      {editingDecorativeThicknessMm === item.thicknessMm ? (
                        <form
                          className="cc-supurgelik-source-edit"
                          onSubmit={(event) => void saveDecorativeRate(event)}
                        >
                          <label className="cc-field">
                            <span>Yeni Oran (%)</span>
                            <input
                              className="cc-input"
                              inputMode="decimal"
                              autoFocus
                              value={decorativeRateInput}
                              onChange={(event) =>
                                setDecorativeRateInput(event.target.value)
                              }
                              placeholder="26"
                              disabled={decorativeRateSaving}
                            />
                          </label>
                          <div className="cc-supurgelik-source-edit-actions">
                            <button
                              type="button"
                              className="cc-btn cc-btn-sm"
                              onClick={() => {
                                setEditingDecorativeThicknessMm(null);
                                setDecorativeRateInput('');
                                setSourceDecorativeRatesError(null);
                              }}
                              disabled={decorativeRateSaving}
                            >
                              İptal
                            </button>
                            <button
                              type="submit"
                              className="cc-btn cc-btn-primary cc-btn-sm"
                              disabled={decorativeRateSaving}
                            >
                              {decorativeRateSaving ? 'Kaydediliyor…' : 'Kaydet'}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="cc-supurgelik-source-price">
                          <span>Mevcut Oran</span>
                          <strong>{formatPercentRate(item.rate)}</strong>
                          <button
                            type="button"
                            className="cc-btn cc-btn-sm"
                            onClick={() => startDecorativeRateEdit(item)}
                            disabled={sourceBusy}
                          >
                            Düzenle
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <p className="cc-note">
                Dekoratif oran yalnız 12, 14 ve 18 mm için geçerlidir.
              </p>

              <div className="cc-supurgelik-source-section-heading cc-supurgelik-source-section-divider">
                <span>PP Sarma</span>
                <small>Yalnız PP sarmalı ürünlerde kullanılır</small>
              </div>

              {sourcePpWrappingError ? (
                <div className="cc-alert">{sourcePpWrappingError}</div>
              ) : null}

              {sourcePpWrappingLoading ? (
                <div className="cc-supurgelik-source-loading">
                  PP sarma maliyeti yükleniyor…
                </div>
              ) : (
                <div className="cc-supurgelik-source-list">
                  <div className="cc-supurgelik-source-row">
                    <div className="cc-supurgelik-source-material">
                      <strong>PP Sarma Maliyeti</strong>
                      <span>
                        Mevcut:{' '}
                        {sourcePpWrapping?.amount == null
                          ? 'Tanımlı değil'
                          : formatTryTwoDecimals(sourcePpWrapping.amount)}
                      </span>
                    </div>
                    <form
                      className="cc-supurgelik-source-edit"
                      onSubmit={(event) => void savePpWrapping(event)}
                    >
                      <label className="cc-field">
                        <span>PP Sarma Maliyeti</span>
                        <input
                          className="cc-input"
                          inputMode="decimal"
                          value={ppWrappingAmountInput}
                          onChange={(event) =>
                            setPpWrappingAmountInput(event.target.value)
                          }
                          disabled={ppWrappingSaving}
                        />
                      </label>
                      <div className="cc-supurgelik-source-edit-actions">
                        <button
                          type="submit"
                          className="cc-btn cc-btn-primary cc-btn-sm"
                          disabled={ppWrappingSaving || sourceBusy}
                        >
                          {ppWrappingSaving ? 'Kaydediliyor…' : 'Kaydet'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              <p className="cc-note">
                Değer girilene kadar PP ürünlerinde satış fiyatı yayınlanmaz.
              </p>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
