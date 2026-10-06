import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  CitaPublishedPriceBandItem,
  listCitaPublishedPriceBands,
  updateCitaPublishedPriceBand,
} from '../api/cita-published-price-bands-api';
import {
  CITA_CUSTOM_THICKNESS_MM,
  CitaCostListResponse,
  CitaCostRow,
  CitaCustomThicknessMm,
  fetchCitaCostList,
  fetchCitaProductionCost,
} from '../api/cost-calculation-api';
import {
  ExtraCostItem,
  listExtraCosts,
  updateExtraCostValue,
} from '../api/extra-costs-api';
import {
  listRawMaterials,
  RawMaterial,
} from '../api/raw-materials-api';
import { saveChangedPurchasePrices } from '../lib/material-purchase-prices';
import {
  friendlyMaterialPriceError,
  materialPriceTypeLabel,
  missingPurchasePriceLabel,
  salePriceResultLabel,
  showsCardSalePrice,
  showsCashSalePrice,
  type MaterialPriceType,
} from '../lib/material-price-type';
import {
  getCitaPricingSetting,
  updateCitaPricingSetting,
} from '../api/pricing-settings-api';
import { ApiError } from '../lib/api';
import {
  cmInputToMmString,
  formatCitaPieceLabel,
  formatSheetSizeCm,
} from '../lib/length';
import { formatTryTwoDecimals } from '../lib/money';
import { ProfitRateCell } from './profit-rate-cell';

const CITA_EXTRA_COST_CODES = ['CUTTING', 'LABOR'] as const;
type CitaExtraCostCode = (typeof CITA_EXTRA_COST_CODES)[number];

const EXTRA_COST_LABELS: Record<CitaExtraCostCode, string> = {
  CUTTING: 'Kesim Maliyeti (250 Parça)',
  LABOR: 'İşçilik',
};

const CITA_LENGTH_MM = '2800';
const CITA_SHEET_MM = { widthMm: 2100, lengthMm: 2800 } as const;
const CITA_FORBIDDEN_MATERIAL_CODES = [
  'MDF-18-2100X2800-ZIMPARALI-NEOPAN',
  'MDF-18-2100X2800-TEK-YUZ-MEMBRANLIK-4',
  'MDF-22-UI-TEST',
] as const;

function todayIsoDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeDecimalInput(value: string): string {
  return value.trim().replace(',', '.');
}

function isPositiveDecimalInput(value: string): boolean {
  const normalized = normalizeDecimalInput(value);
  return /^\d+(\.\d{1,4})?$/.test(normalized) && !/^0+(\.0+)?$/.test(normalized);
}

function isNonNegativeDecimalInput(value: string): boolean {
  const normalized = normalizeDecimalInput(value);
  return /^\d+(\.\d{1,4})?$/.test(normalized);
}

function formatThicknessGroupLabel(thicknessMm: string): string {
  const normalized = thicknessMm.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return `${normalized} MM`;
}

function extraAmount(row: CitaCostRow, code: CitaExtraCostCode): string | null {
  return row.extraCosts.find((item) => item.code === code)?.amount ?? null;
}

function cuttingUnitAmount(row: CitaCostRow): string | null {
  return row.cuttingUnitCost ?? null;
}

/** Backend publishedCash/Card değerini aynen okur; frontend hesap yapmaz. */
function publishedPriceAmount(
  row: CitaCostRow,
  field: 'publishedCashPrice' | 'publishedCardPrice',
): string | null {
  const pricing = row.pricing;
  if (!pricing || !pricing.pricingAvailable) return null;
  return pricing[field];
}

function priceBandLabel(row: CitaCostRow): string | null {
  return row.pricing?.priceBand?.displayName ?? null;
}

function isPublishedPriceMissing(row: CitaCostRow): boolean {
  return row.pricing?.statusCode === 'CITA_PUBLISHED_PRICE_MISSING';
}

function statusLabel(
  row: CitaCostRow,
  materialPriceType: MaterialPriceType,
): string | null {
  if (row.statusCode === 'RAW_MATERIAL_PRICE_MISSING') {
    return missingPurchasePriceLabel(
      `${row.thicknessMm} mm ${formatSheetSizeCm(
        row.rawMaterial.sheetWidthMm,
        row.rawMaterial.sheetLengthMm,
      )} MDF`,
      row.materialPriceType ?? materialPriceType,
    );
  }
  if (row.statusCode !== 'EXTRA_COST_MISSING') {
    return null;
  }

  const missing = row.missingExtraCosts;
  const cutting = missing.includes('CUTTING');
  const labor = missing.includes('LABOR');
  if (cutting && labor) return 'Kesim ve işçilik tanımlı değil';
  if (cutting) return 'Kesim tanımlı değil';
  if (labor) return 'İşçilik tanımlı değil';
  return 'Kesim ve işçilik tanımlı değil';
}

function customSourceLabel(source: CitaCostRow['productionYield']['source']): string {
  return source === 'CALCULATED_CUT_RULE' ? 'Özel Kesim Hesabı' : 'Kayıtlı';
}

function validateWidthCm(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'En giriniz.';
  if (trimmed.startsWith('-')) return 'En 0’dan büyük olmalıdır.';

  const mm = cmInputToMmString(trimmed);
  if (mm == null) return 'Geçerli bir en giriniz (ör. 3,5).';
  if (/^0+(\.0+)?$/.test(mm)) return 'En 0’dan büyük olmalıdır.';
  return null;
}

export function selectCitaExtraCosts(items: ExtraCostItem[]): ExtraCostItem[] {
  const byCode = new Map(items.map((item) => [item.typeCode, item]));
  return CITA_EXTRA_COST_CODES.flatMap((code) => {
    const item = byCode.get(code);
    return item ? [item] : [];
  });
}

/** Liste MASTER satırlarındaki unique CITA RawMaterial'ları seçer; fiyat hardcode etmez. */
export function selectCitaRawMaterials(
  materials: RawMaterial[],
  rows: CitaCostRow[],
): RawMaterial[] {
  const usedCodes = new Set(rows.map((row) => row.rawMaterial.code));
  const seen = new Set<string>();

  return materials
    .filter(
      (material) =>
        material.isActive &&
        usedCodes.has(material.code) &&
        !(CITA_FORBIDDEN_MATERIAL_CODES as readonly string[]).includes(
          material.code,
        ) &&
        material.sheetWidthMm === CITA_SHEET_MM.widthMm &&
        material.sheetLengthMm === CITA_SHEET_MM.lengthMm,
    )
    .filter((material) => {
      if (seen.has(material.code)) return false;
      seen.add(material.code);
      return true;
    })
    .sort((left, right) =>
      left.thicknessMm.localeCompare(right.thicknessMm, 'tr-TR', {
        numeric: true,
      }),
    );
}

function groupCitaRows(rows: CitaCostRow[]) {
  const groups: Array<{ thicknessMm: string; label: string; rows: CitaCostRow[] }> =
    [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.thicknessMm === row.thicknessMm) {
      last.rows.push(row);
      continue;
    }
    groups.push({
      thicknessMm: row.thicknessMm,
      label: formatThicknessGroupLabel(row.thicknessMm),
      rows: [row],
    });
  }
  return groups;
}

function MoneyCell({
  value,
  badge,
}: {
  value: string | null | undefined;
  badge?: 'mdf' | 'expense' | 'prod';
}) {
  if (value == null || value === '') return <>—</>;
  const formatted = formatTryTwoDecimals(value);
  if (!badge) return <>{formatted}</>;
  return <span className={`cc-badge cc-badge-${badge}`}>{formatted}</span>;
}

function StatusCell({
  row,
  materialPriceType,
}: {
  row: CitaCostRow;
  materialPriceType: MaterialPriceType;
}) {
  const costLabel = statusLabel(row, materialPriceType);
  const priceMissing = isPublishedPriceMissing(row);
  if (!costLabel && !priceMissing) {
    return <span className="cc-supurgelik-no-status">—</span>;
  }

  const costTone =
    row.statusCode === 'RAW_MATERIAL_PRICE_MISSING'
      ? 'raw_material_price_missing'
      : 'extra_cost_missing';

  return (
    <div className="cc-cita-status-stack">
      {costLabel ? (
        <span className={`cc-supurgelik-status cc-cita-status-${costTone}`}>
          {costLabel}
        </span>
      ) : null}
      {priceMissing ? (
        <span className="cc-supurgelik-status cc-cita-status-price_missing">
          Satış fiyatı tanımlı değil
        </span>
      ) : null}
    </div>
  );
}

function CitaRowsTable({
  rows,
  materialPriceType,
  onProfitSaved,
}: {
  rows: CitaCostRow[];
  materialPriceType: MaterialPriceType;
  onProfitSaved?: (message: string) => void;
}) {
  const groups = groupCitaRows(rows);
  const showCash = showsCashSalePrice(materialPriceType);
  const showCard = showsCardSalePrice(materialPriceType);
  const colCount = 11 + (showCash ? 1 : 0) + (showCard ? 1 : 0) + 1;

  return (
    <table className="cc-table cc-cita-table">
      <thead>
        <tr>
          <th className="cc-col-thickness">Kalınlık</th>
          <th className="cc-col-size">Ölçü</th>
          <th>NET</th>
          <th>Kaynak</th>
          <th>Tabaka Fiyatı</th>
          <th>MDF Maliyeti</th>
          <th>Kesim</th>
          <th>İşçilik</th>
          <th>Üretim Maliyeti</th>
          <th>Kâr %</th>
          <th className="cc-col-sale">{salePriceResultLabel(materialPriceType)}</th>
          <th>Durum</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <CitaThicknessGroup
            key={group.thicknessMm}
            group={group}
            materialPriceType={materialPriceType}
            colCount={colCount}
            onProfitSaved={onProfitSaved}
          />
        ))}
      </tbody>
    </table>
  );
}

function CitaThicknessGroup({
  group,
  materialPriceType,
  colCount,
  onProfitSaved,
}: {
  group: { thicknessMm: string; label: string; rows: CitaCostRow[] };
  materialPriceType: MaterialPriceType;
  colCount: number;
  onProfitSaved?: (message: string) => void;
}) {
  const showCash = showsCashSalePrice(materialPriceType);
  const showCard = showsCardSalePrice(materialPriceType);

  return (
    <>
      <tr className="cc-cita-group-heading">
        <td colSpan={colCount}>{group.label}</td>
      </tr>
      {group.rows.map((row) => (
        <tr key={`${row.thicknessMm}-${row.widthMm}-${row.lengthMm}`}>
          <td className="cc-col-thickness">
            {formatThicknessGroupLabel(row.thicknessMm).replace(' MM', ' mm')}
          </td>
          <td className="cc-col-size">
            {formatCitaPieceLabel(row.widthMm, row.lengthMm)}
          </td>
          <td className="cc-qty">{row.productionYield.netQty}</td>
          <td>
            {row.productionYield.source === 'MASTER' ? (
              <span className="cc-cita-source-badge">Kayıtlı</span>
            ) : (
              '—'
            )}
          </td>
          <td className="cc-money">
            <MoneyCell value={row.sheetPrice?.amount} />
          </td>
          <td className="cc-money">
            <MoneyCell value={row.mdfUnitCost} badge="mdf" />
          </td>
          <td className="cc-money">
            <MoneyCell value={cuttingUnitAmount(row)} badge="expense" />
          </td>
          <td className="cc-money">
            <MoneyCell value={extraAmount(row, 'LABOR')} badge="expense" />
          </td>
          <td className="cc-money">
            <MoneyCell value={row.productionCost} badge="prod" />
          </td>
          <td className="cc-qty">
            <ProfitRateCell
              value={row.pricing?.profitRate}
              payload={{
                productGroupCode: 'CITA',
                productCode: 'CITA',
                widthMm: Number(row.widthMm),
                lengthMm: Number(row.lengthMm),
              }}
              onSaved={onProfitSaved}
            />
          </td>
          <td className="cc-money">
            {showCash ? (
              <MoneyCell value={publishedPriceAmount(row, 'publishedCashPrice')} />
            ) : showCard ? (
              publishedPriceAmount(row, 'publishedCardPrice') != null ? (
                <MoneyCell value={publishedPriceAmount(row, 'publishedCardPrice')} />
              ) : (
                row.pricing?.cardStatusMessage ?? 'Kart/taksit oranı tanımlı değil'
              )
            ) : null}
          </td>
          <td className="cc-supurgelik-status-cell">
            <StatusCell row={row} materialPriceType={materialPriceType} />
          </td>
        </tr>
      ))}
    </>
  );
}

export function CitaCostList({
  materialPriceType,
  initialSourceDrawer = false,
  onSourcesChanged,
  refreshToken = 0,
}: {
  materialPriceType: MaterialPriceType;
  initialSourceDrawer?: boolean;
  onSourcesChanged?: () => void;
  refreshToken?: number;
}) {
  const [data, setData] = useState<CitaCostListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  const [customThickness, setCustomThickness] =
    useState<CitaCustomThicknessMm>('14');
  const [customWidthCm, setCustomWidthCm] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [customResult, setCustomResult] = useState<CitaCostRow | null>(null);
  const [customQuery, setCustomQuery] = useState<{
    thicknessMm: string;
    widthMm: string;
    lengthMm: string;
  } | null>(null);

  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const [sourceMaterials, setSourceMaterials] = useState<RawMaterial[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [mdfCashInput, setMdfCashInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [sourceSaving, setSourceSaving] = useState(false);
  const [sourceExtraCosts, setSourceExtraCosts] = useState<ExtraCostItem[]>([]);
  const [sourceExtraCostsLoading, setSourceExtraCostsLoading] = useState(false);
  const [sourceExtraCostsError, setSourceExtraCostsError] = useState<string | null>(
    null,
  );
  const [editingExtraCostCode, setEditingExtraCostCode] =
    useState<CitaExtraCostCode | null>(null);
  const [extraCostAmountInput, setExtraCostAmountInput] = useState('');
  const [extraCostSaving, setExtraCostSaving] = useState(false);
  const [sourcePriceBands, setSourcePriceBands] = useState<
    CitaPublishedPriceBandItem[]
  >([]);
  const [sourcePriceBandsLoading, setSourcePriceBandsLoading] = useState(false);
  const [sourcePriceBandsError, setSourcePriceBandsError] = useState<string | null>(
    null,
  );
  const [editingPriceBandId, setEditingPriceBandId] = useState<string | null>(null);
  const [cashPriceInput, setCashPriceInput] = useState('');
  const [priceBandSaving, setPriceBandSaving] = useState(false);
  const [cardMarkupRate, setCardMarkupRate] = useState<string | null>(null);
  const [cardMarkupRateInput, setCardMarkupRateInput] = useState('');
  const [editingCardMarkupRate, setEditingCardMarkupRate] = useState(false);
  const [cardMarkupRateSaving, setCardMarkupRateSaving] = useState(false);
  const [cardMarkupRateError, setCardMarkupRateError] = useState<string | null>(
    null,
  );
  const sourceBusy =
    sourceSaving || extraCostSaving || priceBandSaving || cardMarkupRateSaving;
  const customRequestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    void fetchCitaCostList(materialPriceType)
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setData(null);
        setError(
          friendlyMaterialPriceError(
            requestError instanceof ApiError
              ? requestError.message
              : 'Çıta maliyetleri yüklenemedi.',
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestVersion, materialPriceType, refreshToken]);

  const loadSourceMaterials = async (
    costData: CitaCostListResponse | null = data,
  ) => {
    if (!costData) {
      setSourceMaterials([]);
      setSourceError('Çıta kaynakları için önce maliyet listesi yüklenmelidir.');
      return;
    }

    setSourceLoading(true);
    setSourceError(null);
    try {
      const materials = await listRawMaterials({ isActive: true });
      setSourceMaterials(selectCitaRawMaterials(materials, costData.rows));
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

  const loadSourcePriceBands = async () => {
    setSourcePriceBandsLoading(true);
    setSourcePriceBandsError(null);
    try {
      const response = await listCitaPublishedPriceBands();
      setSourcePriceBands(response.items);
    } catch (requestError) {
      setSourcePriceBands([]);
      setSourcePriceBandsError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Yayınlanmış satış fiyatları yüklenemedi.',
      );
    } finally {
      setSourcePriceBandsLoading(false);
    }
  };

  const loadCitaCardMarkupRate = async () => {
    setCardMarkupRateError(null);
    try {
      const setting = await getCitaPricingSetting();
      setCardMarkupRate(setting.cardMarkupRate);
    } catch (requestError) {
      setCardMarkupRate(null);
      setCardMarkupRateError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Kart / taksit oranı yüklenemedi.',
      );
    }
  };

  const saveCitaCardMarkupRate = async (event: FormEvent) => {
    event.preventDefault();
    if (!isNonNegativeDecimalInput(cardMarkupRateInput)) {
      setCardMarkupRateError(
        'Kart / taksit farkı 0 veya daha büyük geçerli bir değer olmalıdır (örn. 20).',
      );
      return;
    }
    setCardMarkupRateSaving(true);
    setCardMarkupRateError(null);
    try {
      const result = await updateCitaPricingSetting(
        normalizeDecimalInput(cardMarkupRateInput),
      );
      setCardMarkupRate(result.cardMarkupRate);
      setEditingCardMarkupRate(false);
      setCardMarkupRateInput('');
      setSourceNotice('Kart / taksit oranı kaydedildi.');
      setRequestVersion((version) => version + 1);
      onSourcesChanged?.();
      if (customQuery) {
        await refetchCustomResult(customQuery);
      }
    } catch (requestError) {
      setCardMarkupRateError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Kart / taksit oranı kaydedilemedi.',
      );
    } finally {
      setCardMarkupRateSaving(false);
    }
  };

  const loadSourceExtraCosts = async () => {
    setSourceExtraCostsLoading(true);
    setSourceExtraCostsError(null);
    try {
      const response = await listExtraCosts('CITA');
      setSourceExtraCosts(selectCitaExtraCosts(response.items));
    } catch (requestError) {
      setSourceExtraCostsError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Çıta üretim giderleri yüklenemedi.',
      );
    } finally {
      setSourceExtraCostsLoading(false);
    }
  };

  const openSourceDrawer = () => {
    setSourceDrawerOpen(true);
    setSourceNotice(null);
    setEditingMaterialId(null);
    setMdfCashInput('');
    setPriceInput('');
    setSourceError(null);
    setEditingExtraCostCode(null);
    setExtraCostAmountInput('');
    setEditingPriceBandId(null);
    setCashPriceInput('');
    setSourcePriceBandsError(null);
    void loadSourceMaterials();
    void loadSourceExtraCosts();
    void loadSourcePriceBands();
    void loadCitaCardMarkupRate();
  };

  const openedInitialDrawer = useRef(false);
  useEffect(() => {
    if (!initialSourceDrawer || !data || openedInitialDrawer.current) return;
    openedInitialDrawer.current = true;
    openSourceDrawer();
    // Liste hazır olunca kaynak çekmecesini bir kez açar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSourceDrawer, data]);

  const closeSourceDrawer = () => {
    if (sourceBusy) return;
    setSourceDrawerOpen(false);
    setEditingMaterialId(null);
    setMdfCashInput('');
    setPriceInput('');
    setEditingExtraCostCode(null);
    setExtraCostAmountInput('');
    setEditingPriceBandId(null);
    setCashPriceInput('');
    setSourceError(null);
    setSourceExtraCostsError(null);
    setSourcePriceBandsError(null);
    setSourceNotice(null);
  };

  const refetchCustomResult = async (query: {
    thicknessMm: string;
    widthMm: string;
    lengthMm: string;
  }) => {
    const requestId = customRequestId.current + 1;
    customRequestId.current = requestId;
    setCustomLoading(true);
    setCustomError(null);
    try {
      const result = await fetchCitaProductionCost({
        ...query,
        materialPriceType,
      });
      if (requestId !== customRequestId.current) return;
      setCustomResult(result);
      setCustomQuery(query);
    } catch (requestError) {
      if (requestId !== customRequestId.current) return;
      setCustomResult(null);
      setCustomError(
        friendlyMaterialPriceError(
          requestError instanceof ApiError
            ? requestError.message
            : 'Özel ölçü hesaplanamadı.',
        ),
      );
    } finally {
      if (requestId === customRequestId.current) setCustomLoading(false);
    }
  };

  useEffect(() => {
    if (!customQuery) return;
    setCustomResult(null);
    void refetchCustomResult(customQuery);
    // Açık özel ölçü, alış türü değişince aynı ölçüyle yeniden hesaplanır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialPriceType]);

  const saveExtraCost = async (event: FormEvent) => {
    event.preventDefault();
    const item = sourceExtraCosts.find(
      (candidate) => candidate.typeCode === editingExtraCostCode,
    );
    if (!item || !editingExtraCostCode) return;

    if (!isPositiveDecimalInput(extraCostAmountInput)) {
      setSourceExtraCostsError(
        'Üretim gideri 0’dan büyük geçerli bir tutar olmalıdır.',
      );
      return;
    }

    setExtraCostSaving(true);
    setSourceExtraCostsError(null);
    try {
      await updateExtraCostValue(editingExtraCostCode, {
        productGroup: 'CITA',
        amount: normalizeDecimalInput(extraCostAmountInput),
        effectiveFrom: todayIsoDate(),
      });
      setSourceNotice(`${item.typeName} gideri kaydedildi.`);
      setEditingExtraCostCode(null);
      setExtraCostAmountInput('');
      setRequestVersion((version) => version + 1);
      onSourcesChanged?.();
      await loadSourceExtraCosts();
      if (customQuery) {
        await refetchCustomResult(customQuery);
      }
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

  const savePublishedPriceBand = async (event: FormEvent) => {
    event.preventDefault();
    const band = sourcePriceBands.find((item) => item.id === editingPriceBandId);
    if (!band || !editingPriceBandId) return;

    if (!isPositiveDecimalInput(cashPriceInput)) {
      setSourcePriceBandsError(
        'Nakit fiyatı 0’dan büyük geçerli bir tutar olmalıdır.',
      );
      return;
    }

    setPriceBandSaving(true);
    setSourcePriceBandsError(null);
    try {
      await updateCitaPublishedPriceBand(editingPriceBandId, {
        cashPrice: normalizeDecimalInput(cashPriceInput),
      });
      setSourceNotice(`${band.displayName} satış fiyatı kaydedildi.`);
      setEditingPriceBandId(null);
      setCashPriceInput('');
      setRequestVersion((version) => version + 1);
      onSourcesChanged?.();
      await loadSourcePriceBands();
      if (customQuery) {
        await refetchCustomResult(customQuery);
      }
    } catch (requestError) {
      setSourcePriceBandsError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Yayınlanmış satış fiyatı kaydedilemedi.',
      );
    } finally {
      setPriceBandSaving(false);
    }
  };

  const startPriceEdit = (material: RawMaterial) => {
    setEditingMaterialId(material.id);
    setMdfCashInput(material.cashPrice ?? '');
    setPriceInput(material.cardInstallmentPrice ?? '');
    setSourceError(null);
    setSourceNotice(null);
  };

  const savePurchasePrices = async (event: FormEvent) => {
    event.preventDefault();
    const material = sourceMaterials.find((item) => item.id === editingMaterialId);
    if (!material) return;

    setSourceSaving(true);
    setSourceError(null);
    try {
      const result = await saveChangedPurchasePrices(
        material,
        mdfCashInput,
        priceInput,
      );
      setSourceNotice(result.message);
      setEditingMaterialId(null);
      setMdfCashInput('');
      setPriceInput('');
      setRequestVersion((version) => version + 1);
      onSourcesChanged?.();
      await loadSourceMaterials(data);
      if (customQuery) {
        await refetchCustomResult(customQuery);
      }
    } catch (requestError) {
      setSourceError(
        requestError instanceof Error
          ? requestError.message
          : 'MDF alış fiyatı kaydedilemedi.',
      );
    } finally {
      setSourceSaving(false);
    }
  };

  const calculateCustom = async (event: FormEvent) => {
    event.preventDefault();
    const widthError = validateWidthCm(customWidthCm);
    if (widthError) {
      setCustomError(widthError);
      return;
    }

    const widthMm = cmInputToMmString(customWidthCm);
    if (widthMm == null) {
      setCustomError('Geçerli bir en giriniz (ör. 3,5).');
      return;
    }

    const query = {
      thicknessMm: customThickness,
      widthMm,
      lengthMm: CITA_LENGTH_MM,
    };
    await refetchCustomResult(query);
  };

  return (
    <div className="cc-cita-list">
      <div className="cc-cita-heading">
        <div>
          <span className="cc-supurgelik-eyebrow">Çıta maliyet listesi</span>
          <h2>{data?.productName ?? 'Çıta'}</h2>
          <p>Standart ölçüler ve özel ölçü hesabı</p>
          <p className="cc-note">
            Seçili MDF alış türü: {materialPriceTypeLabel(materialPriceType)}.
            Yayımlanmış nakit satış fiyatı bu seçimden bağımsızdır.
          </p>
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
            <span>Standart satır</span>
            <strong>{data?.verifiedMeasureCount ?? '—'}</strong>
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

      <section className="cc-cita-custom" aria-label="Özel ölçü hesapla">
        <div className="cc-cita-custom-copy">
          <h3>Özel Ölçü Hesapla</h3>
          <p>Anlık hesap. Standart listeye satır eklenmez.</p>
        </div>
        <form className="cc-cita-custom-form" onSubmit={(event) => void calculateCustom(event)}>
          <label className="cc-field">
            <span>Kalınlık</span>
            <select
              className="cc-select"
              value={customThickness}
              onChange={(event) =>
                setCustomThickness(event.target.value as CitaCustomThicknessMm)
              }
            >
              {CITA_CUSTOM_THICKNESS_MM.map((thicknessMm) => (
                <option key={thicknessMm} value={thicknessMm}>
                  {thicknessMm} mm
                </option>
              ))}
            </select>
          </label>
          <label className="cc-field">
            <span>En (cm)</span>
            <input
              className="cc-input"
              inputMode="decimal"
              value={customWidthCm}
              onChange={(event) => setCustomWidthCm(event.target.value)}
              placeholder="3,5"
            />
          </label>
          <label className="cc-field">
            <span>Boy</span>
            <input className="cc-input" value="280 cm" readOnly />
          </label>
          <button
            type="submit"
            className="cc-btn cc-btn-primary cc-btn-sm"
            disabled={customLoading}
          >
            {customLoading ? 'Hesaplanıyor…' : 'Hesapla'}
          </button>
        </form>
        {customError ? <div className="cc-alert">{customError}</div> : null}
        {customResult ? (
          <dl className="cc-cita-custom-result">
            <div>
              <dt>Seçili MDF Alış Türü</dt>
              <dd>
                {materialPriceTypeLabel(
                  customResult.materialPriceType ?? materialPriceType,
                )}
              </dd>
            </div>
            <div>
              <dt>Kalınlık</dt>
              <dd>{formatThicknessGroupLabel(customResult.thicknessMm).replace(' MM', ' mm')}</dd>
            </div>
            <div>
              <dt>Ölçü</dt>
              <dd>{formatCitaPieceLabel(customResult.widthMm, customResult.lengthMm)}</dd>
            </div>
            <div>
              <dt>NET</dt>
              <dd>{customResult.productionYield.netQty}</dd>
            </div>
            <div>
              <dt>Hesap Kaynağı</dt>
              <dd>{customSourceLabel(customResult.productionYield.source)}</dd>
            </div>
            <div>
              <dt>Tabaka Fiyatı</dt>
              <dd>
                <MoneyCell value={customResult.sheetPrice?.amount} />
              </dd>
            </div>
            <div>
              <dt>MDF Maliyeti</dt>
              <dd>
                <MoneyCell value={customResult.mdfUnitCost} badge="mdf" />
              </dd>
            </div>
            <div>
              <dt>Kesim</dt>
              <dd>
                <MoneyCell value={cuttingUnitAmount(customResult)} />
              </dd>
            </div>
            <div>
              <dt>İşçilik</dt>
              <dd>
                <MoneyCell value={extraAmount(customResult, 'LABOR')} />
              </dd>
            </div>
            <div>
              <dt>Üretim Maliyeti</dt>
              <dd>
                <MoneyCell value={customResult.productionCost} badge="prod" />
              </dd>
            </div>
            <div>
              <dt>Fiyat Bandı</dt>
              <dd>{priceBandLabel(customResult) ?? '—'}</dd>
            </div>
            {showsCashSalePrice(materialPriceType) ? (
              <div>
                <dt>Nakit Satış</dt>
                <dd>
                  <MoneyCell
                    value={publishedPriceAmount(customResult, 'publishedCashPrice')}
                  />
                </dd>
              </div>
            ) : null}
            {showsCardSalePrice(materialPriceType) ? (
              <div>
                <dt>Kart / Taksit Satış</dt>
                <dd>
                  {publishedPriceAmount(customResult, 'publishedCardPrice') != null ? (
                    <MoneyCell
                      value={publishedPriceAmount(customResult, 'publishedCardPrice')}
                    />
                  ) : (
                    customResult.pricing?.cardStatusMessage ??
                    'Kart/taksit oranı tanımlı değil'
                  )}
                </dd>
              </div>
            ) : null}
            {showsCashSalePrice(materialPriceType) &&
            isPublishedPriceMissing(customResult) ? (
              <div className="cc-cita-custom-price-note">
                <dt>Satış</dt>
                <dd>Satış fiyatı tanımlı değil</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </section>

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

      <div className="cc-table-wrap cc-cita-table-wrap">
        {loading ? (
          <div className="cc-table-skeleton" aria-label="Çıta maliyetleri yükleniyor">
            {Array.from({ length: 8 }).map((_, index) => (
              <span key={index} />
            ))}
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="cc-empty">
            <p>Gösterilecek Çıta ölçüsü yok.</p>
            <button
              type="button"
              className="cc-btn cc-btn-sm"
              onClick={() => setRequestVersion((version) => version + 1)}
            >
              Yenile
            </button>
          </div>
        ) : (
          <CitaRowsTable
            rows={data.rows}
            materialPriceType={materialPriceType}
            onProfitSaved={() => setRequestVersion((version) => version + 1)}
          />
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
            aria-label="Çıta maliyet ayarlarını düzenle"
          >
            <div className="cc-drawer-header">
              <div>
                <h2>Maliyet Ayarlarını Düzenle</h2>
                <span className="cc-supurgelik-source-subtitle">Çıta</span>
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
                <span>Kart / Taksit Farkı (%)</span>
                <small>Nakit satış × (1 + oran / 100)</small>
              </div>
              {cardMarkupRateError ? (
                <div className="cc-alert">{cardMarkupRateError}</div>
              ) : null}
              <div className="cc-supurgelik-source-list">
                <div className="cc-supurgelik-source-row">
                  <div className="cc-supurgelik-source-material">
                    <strong>Kart / Taksit Farkı</strong>
                    <span>Çıta ürün grubu</span>
                  </div>
                  {editingCardMarkupRate ? (
                    <form
                      className="cc-supurgelik-source-edit"
                      onSubmit={(event) => void saveCitaCardMarkupRate(event)}
                    >
                      <label className="cc-field">
                        <span>Kart / Taksit Farkı (%)</span>
                        <input
                          className="cc-input"
                          inputMode="decimal"
                          autoFocus
                          value={cardMarkupRateInput}
                          onChange={(event) =>
                            setCardMarkupRateInput(event.target.value)
                          }
                          placeholder="20"
                          disabled={cardMarkupRateSaving}
                        />
                      </label>
                      <div className="cc-supurgelik-source-edit-actions">
                        <button
                          type="button"
                          className="cc-btn cc-btn-sm"
                          onClick={() => {
                            setEditingCardMarkupRate(false);
                            setCardMarkupRateInput('');
                            setCardMarkupRateError(null);
                          }}
                          disabled={cardMarkupRateSaving}
                        >
                          İptal
                        </button>
                        <button
                          type="submit"
                          className="cc-btn cc-btn-primary cc-btn-sm"
                          disabled={cardMarkupRateSaving}
                        >
                          {cardMarkupRateSaving ? 'Kaydediliyor…' : 'Kaydet'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="cc-supurgelik-source-price">
                      <span>Mevcut Oran</span>
                      <strong>
                        {cardMarkupRate == null
                          ? 'Kart/taksit oranı tanımlı değil'
                          : `${cardMarkupRate}%`}
                      </strong>
                      <button
                        type="button"
                        className="cc-btn cc-btn-sm"
                        onClick={() => {
                          setEditingCardMarkupRate(true);
                          setCardMarkupRateInput(cardMarkupRate ?? '');
                          setCardMarkupRateError(null);
                          setSourceNotice(null);
                        }}
                        disabled={sourceBusy}
                      >
                        Düzenle
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="cc-supurgelik-source-section-heading cc-supurgelik-source-section-divider">
                <span>Ham MDF Fiyatları</span>
                <small>Nakit ve kart / taksitli alış</small>
              </div>

              {sourceNotice ? <div className="cc-notice">{sourceNotice}</div> : null}
              {sourceError ? <div className="cc-alert">{sourceError}</div> : null}

              {sourceLoading ? (
                <div className="cc-supurgelik-source-loading">
                  Ham MDF fiyatları yükleniyor…
                </div>
              ) : sourceMaterials.length === 0 ? (
                <div className="cc-empty">
                  <p>Kullanılan aktif Çıta MDF kaynağı bulunamadı.</p>
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
                            onSubmit={(event) => void savePurchasePrices(event)}
                          >
                            <label className="cc-field">
                              <span>Nakit MDF Alış Fiyatı</span>
                              <input
                                className="cc-input"
                                inputMode="decimal"
                                autoFocus
                                value={mdfCashInput}
                                onChange={(event) => setMdfCashInput(event.target.value)}
                                disabled={sourceSaving}
                              />
                            </label>
                            <label className="cc-field">
                              <span>Kart / Taksitli MDF Alış Fiyatı</span>
                              <input
                                className="cc-input"
                                inputMode="decimal"
                                value={priceInput}
                                onChange={(event) => setPriceInput(event.target.value)}
                                disabled={sourceSaving}
                              />
                            </label>
                            <div className="cc-supurgelik-source-edit-actions">
                              <button
                                type="button"
                                className="cc-btn cc-btn-sm"
                                onClick={() => {
                                  setEditingMaterialId(null);
                                  setMdfCashInput('');
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
                          <div className="cc-supurgelik-source-prices">
                            <div className="cc-supurgelik-source-price">
                              <span>Nakit MDF Alış Fiyatı</span>
                              {material.cashPrice == null ? (
                                <strong className="missing">Tanımlı değil</strong>
                              ) : (
                                <strong>{formatTryTwoDecimals(material.cashPrice)}</strong>
                              )}
                            </div>
                            <div className="cc-supurgelik-source-price">
                              <span>Kart / Taksitli MDF Alış Fiyatı</span>
                              {material.cardInstallmentPrice == null ? (
                                <strong className="missing">Tanımlı değil</strong>
                              ) : (
                                <strong>
                                  {formatTryTwoDecimals(material.cardInstallmentPrice)}
                                </strong>
                              )}
                            </div>
                            <button
                              type="button"
                              className="cc-btn cc-btn-sm"
                              onClick={() => startPriceEdit(material)}
                              disabled={sourceBusy}
                            >
                              Düzenle
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

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
                    const code = item.typeCode as CitaExtraCostCode;
                    return (
                      <div className="cc-supurgelik-source-row" key={item.typeCode}>
                        <div className="cc-supurgelik-source-material">
                          <strong>{EXTRA_COST_LABELS[code] ?? item.typeName}</strong>
                          <span>Tüm çıta hesaplarında ortak</span>
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
                            <span>Mevcut</span>
                            {item.amount == null ? (
                              <strong className="missing">Tanımlı değil</strong>
                            ) : (
                              <strong>{formatTryTwoDecimals(item.amount)}</strong>
                            )}
                            <button
                              type="button"
                              className="cc-btn cc-btn-sm"
                              onClick={() => {
                                setEditingExtraCostCode(code);
                                setExtraCostAmountInput('');
                                setSourceExtraCostsError(null);
                                setSourceNotice(null);
                              }}
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

              <div className="cc-supurgelik-source-section-heading cc-supurgelik-source-section-divider">
                <span>Yayınlanmış Satış Fiyatları</span>
                <small>Nakit ve kart fiyatları ayrı ayrı tanımlanır</small>
              </div>

              {sourcePriceBandsError ? (
                <div className="cc-alert">{sourcePriceBandsError}</div>
              ) : null}

              {sourcePriceBandsLoading ? (
                <div className="cc-supurgelik-source-loading">
                  Yayınlanmış satış fiyatları yükleniyor…
                </div>
              ) : sourcePriceBands.length === 0 ? (
                <div className="cc-empty">
                  <p>Aktif yayınlanmış satış fiyatı bulunamadı.</p>
                  <button
                    type="button"
                    className="cc-btn cc-btn-sm"
                    onClick={() => void loadSourcePriceBands()}
                  >
                    Yeniden Dene
                  </button>
                </div>
              ) : (
                <div className="cc-supurgelik-source-list">
                  {sourcePriceBands.map((band) => {
                    const editing = editingPriceBandId === band.id;
                    return (
                      <div
                        className="cc-supurgelik-source-row cc-cita-published-row"
                        key={band.id}
                      >
                        <div className="cc-supurgelik-source-material">
                          <strong>{band.displayName}</strong>
                        </div>

                        {editing ? (
                          <form
                            className="cc-supurgelik-source-edit"
                            onSubmit={(event) => void savePublishedPriceBand(event)}
                          >
                            <label className="cc-field">
                              <span>Nakit</span>
                              <input
                                className="cc-input"
                                inputMode="decimal"
                                autoFocus
                                value={cashPriceInput}
                                onChange={(event) =>
                                  setCashPriceInput(event.target.value)
                                }
                                disabled={priceBandSaving}
                              />
                            </label>
                            <div className="cc-supurgelik-source-edit-actions">
                              <button
                                type="button"
                                className="cc-btn cc-btn-sm"
                                onClick={() => {
                                  setEditingPriceBandId(null);
                                  setCashPriceInput('');
                                  setSourcePriceBandsError(null);
                                }}
                                disabled={priceBandSaving}
                              >
                                Vazgeç
                              </button>
                              <button
                                type="submit"
                                className="cc-btn cc-btn-primary cc-btn-sm"
                                disabled={priceBandSaving}
                              >
                                {priceBandSaving ? 'Kaydediliyor…' : 'Kaydet'}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="cc-cita-published-price">
                            <div>
                              <span>Nakit</span>
                              <strong>
                                {formatTryTwoDecimals(band.cashPrice)}
                              </strong>
                            </div>
                            <button
                              type="button"
                              className="cc-btn cc-btn-sm"
                              onClick={() => {
                                setEditingPriceBandId(band.id);
                                setCashPriceInput(band.cashPrice);
                                setSourcePriceBandsError(null);
                                setSourceNotice(null);
                              }}
                              disabled={sourceBusy}
                            >
                              Düzenle
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
