import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  fetchAyarliPervazMdfCosts,
  fetchCitaCostList,
  fetchDekoratifGenisKilcikCosts,
  fetchDekoratifPervazCosts,
  fetchDoorFrameMdfCosts,
  fetchSupurgelikCosts,
  SUPURGELIK_PRODUCT_CODES,
  type SupurgelikProductCode,
} from '../api/cost-calculation-api';
import { quoteOrderCost, type OrderQuoteResult } from '../api/order-quote-api';
import {
  listProductGroups,
  type ProductGroupProduct,
  type ProductGroupSummary,
} from '../api/product-groups-api';
import { ApiError } from '../lib/api';
import {
  cmInputToMmString,
  formatCitaPieceLabel,
  formatMmAsCmDisplay,
  formatPieceSizeCm,
} from '../lib/length';
import { formatTryTwoDecimals } from '../lib/money';

type SizeOption = {
  key: string;
  label: string;
  thicknessMm: string | null;
  widthMm: string;
  lengthMm: string;
};

type CitaMode = 'standard' | 'custom';

function sizeKey(
  thicknessMm: string | null,
  widthMm: string,
  lengthMm: string,
): string {
  return `${thicknessMm ?? ''}|${widthMm}|${lengthMm}`;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
}

export function OrderCostDrawer(props: { onClose: () => void }) {
  const [groups, setGroups] = useState<ProductGroupSummary[]>([]);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [groupId, setGroupId] = useState('');
  const [productId, setProductId] = useState('');
  const [citaMode, setCitaMode] = useState<CitaMode>('standard');
  const [thicknessMm, setThicknessMm] = useState('');
  const [sizeKeyValue, setSizeKeyValue] = useState('');
  const [customWidthCm, setCustomWidthCm] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [sizes, setSizes] = useState<SizeOption[]>([]);
  const [sizesLoading, setSizesLoading] = useState(false);
  const [sizesError, setSizesError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<OrderQuoteResult | null>(null);

  const selectedGroup = groups.find((group) => group.id === groupId) ?? null;
  const products = selectedGroup?.products ?? [];
  const selectedProduct =
    products.find((product) => product.id === productId) ?? null;
  const needsThickness =
    selectedGroup != null && selectedGroup.code !== 'door_frame';
  const isCita = selectedGroup?.code === 'CITA';

  const thicknessOptions = useMemo(
    () =>
      uniqueSorted(
        sizes
          .map((size) => size.thicknessMm)
          .filter((value): value is string => value != null && value.length > 0),
      ),
    [sizes],
  );

  const lengthOptions = useMemo(() => {
    const source = thicknessMm
      ? sizes.filter((size) => size.thicknessMm === thicknessMm)
      : sizes;
    return uniqueSorted(source.map((size) => size.lengthMm));
  }, [sizes, thicknessMm]);

  const visibleSizes = useMemo(() => {
    if (needsThickness && !thicknessMm) return [];
    if (!thicknessMm) return sizes;
    return sizes.filter((size) => size.thicknessMm === thicknessMm);
  }, [needsThickness, sizes, thicknessMm]);

  useEffect(() => {
    let cancelled = false;
    void listProductGroups()
      .then((response) => {
        if (!cancelled) setGroups(response.items);
      })
      .catch((err) => {
        if (!cancelled) {
          setGroupsError(
            err instanceof ApiError ? err.message : 'Ürün grupları yüklenemedi.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const group = groups.find((item) => item.id === groupId);
    setProductId(group?.products.length === 1 ? group.products[0].id : '');
    setCitaMode('standard');
    setThicknessMm('');
    setSizeKeyValue('');
    setCustomWidthCm('');
    setSizes([]);
    setResult(null);
    setFormError(null);
  }, [groupId, groups]);

  useEffect(() => {
    if (!selectedGroup || !selectedProduct) {
      setSizes([]);
      return;
    }

    let cancelled = false;
    setSizesLoading(true);
    setSizesError(null);
    setResult(null);

    void loadSizeOptions(selectedGroup.code, selectedProduct)
      .then((options) => {
        if (cancelled) return;
        setSizes(options);
        const thicknesses = uniqueSorted(
          options
            .map((item) => item.thicknessMm)
            .filter((value): value is string => value != null && value.length > 0),
        );
        setThicknessMm(thicknesses.length === 1 ? thicknesses[0] : '');
        setSizeKeyValue(options.length === 1 ? options[0].key : '');
      })
      .catch((err) => {
        if (cancelled) return;
        setSizes([]);
        setSizesError(
          err instanceof Error ? err.message : 'Ölçüler yüklenemedi.',
        );
      })
      .finally(() => {
        if (!cancelled) setSizesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedGroup, selectedProduct]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setResult(null);

    if (!selectedProduct) {
      setFormError('Ürün seçiniz.');
      return;
    }

    const qty = Number(quantity.trim());
    if (!Number.isInteger(qty) || qty <= 0) {
      setFormError('Sipariş adedi 1 veya daha büyük bir tam sayı olmalıdır.');
      return;
    }

    let widthMm: string;
    let lengthMm: string;
    let quoteThickness: string | undefined;

    if (isCita && citaMode === 'custom') {
      if (!thicknessMm) {
        setFormError('Kalınlık seçiniz.');
        return;
      }
      const customMm = cmInputToMmString(customWidthCm);
      if (customMm == null || /^0+(\.0+)?$/.test(customMm)) {
        setFormError('Geçerli bir en giriniz (ör. 3,5).');
        return;
      }
      const customLength = lengthOptions[0];
      if (!customLength) {
        setFormError('Özel ölçü için boy bilgisi bulunamadı.');
        return;
      }
      quoteThickness = thicknessMm;
      widthMm = customMm;
      lengthMm = customLength;
    } else {
      const selectedSize = visibleSizes.find((size) => size.key === sizeKeyValue);
      if (!selectedSize) {
        setFormError('Ölçü seçiniz.');
        return;
      }
      quoteThickness = selectedSize.thicknessMm ?? undefined;
      widthMm = selectedSize.widthMm;
      lengthMm = selectedSize.lengthMm;
    }

    setCalculating(true);
    try {
      const quote = await quoteOrderCost({
        productId: selectedProduct.id,
        quantity: qty,
        thicknessMm: quoteThickness,
        widthMm,
        lengthMm,
      });
      setResult(quote);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Sipariş maliyeti hesaplanamadı.',
      );
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className="cc-drawer-overlay" onClick={props.onClose} role="presentation">
      <aside
        className="cc-drawer cc-order-drawer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Sipariş maliyeti hesapla"
      >
        <div className="cc-drawer-header">
          <h2>Sipariş Maliyeti Hesapla</h2>
          <button type="button" className="cc-btn cc-btn-sm" onClick={props.onClose}>
            Kapat
          </button>
        </div>

        <form className="cc-form" onSubmit={(event) => void onSubmit(event)}>
          {groupsError ? <div className="cc-alert">{groupsError}</div> : null}

          <label className="cc-field">
            <span>Ürün Grubu</span>
            <select
              className="cc-select"
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
            >
              <option value="">Seçiniz</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          <label className="cc-field">
            <span>Ürün</span>
            <select
              className="cc-select"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              disabled={!selectedGroup}
            >
              <option value="">Seçiniz</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>

          {isCita ? (
            <div className="cc-segments" role="tablist" aria-label="Ölçü türü">
              <button
                type="button"
                role="tab"
                className={citaMode === 'standard' ? 'cc-segment active' : 'cc-segment'}
                onClick={() => {
                  setCitaMode('standard');
                  setResult(null);
                }}
              >
                Standart Ölçü
              </button>
              <button
                type="button"
                role="tab"
                className={citaMode === 'custom' ? 'cc-segment active' : 'cc-segment'}
                onClick={() => {
                  setCitaMode('custom');
                  setResult(null);
                }}
              >
                Özel Ölçü
              </button>
            </div>
          ) : null}

          {needsThickness ? (
            <label className="cc-field">
              <span>MDF Kalınlığı</span>
              <select
                className="cc-select"
                value={thicknessMm}
                onChange={(event) => {
                  setThicknessMm(event.target.value);
                  setSizeKeyValue('');
                  setResult(null);
                }}
                disabled={sizesLoading || thicknessOptions.length === 0}
              >
                <option value="">Seçiniz</option>
                {thicknessOptions.map((value) => (
                  <option key={value} value={value}>
                    {value} mm
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {isCita && citaMode === 'custom' ? (
            <>
              <label className="cc-field">
                <span>En (cm)</span>
                <input
                  className="cc-input"
                  value={customWidthCm}
                  onChange={(event) => setCustomWidthCm(event.target.value)}
                  inputMode="decimal"
                  placeholder="3,5"
                />
              </label>
              <label className="cc-field">
                <span>Boy</span>
                <input
                  className="cc-input"
                  value={
                    lengthOptions[0]
                      ? `${formatMmAsCmDisplay(lengthOptions[0])} cm`
                      : ''
                  }
                  readOnly
                />
              </label>
            </>
          ) : (
            <label className="cc-field">
              <span>Ölçü</span>
              <select
                className="cc-select"
                value={sizeKeyValue}
                onChange={(event) => {
                  setSizeKeyValue(event.target.value);
                  setResult(null);
                }}
                disabled={sizesLoading || visibleSizes.length === 0}
              >
                <option value="">Seçiniz</option>
                {visibleSizes.map((size) => (
                  <option key={size.key} value={size.key}>
                    {size.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="cc-field">
            <span>Sipariş Adedi</span>
            <input
              className="cc-input"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              inputMode="numeric"
            />
          </label>

          {sizesLoading ? <p className="cc-hint">Ölçüler yükleniyor…</p> : null}
          {sizesError ? <div className="cc-alert">{sizesError}</div> : null}
          {formError ? <div className="cc-alert">{formError}</div> : null}

          <div className="cc-form-actions">
            <button type="button" className="cc-btn" onClick={props.onClose}>
              İptal
            </button>
            <button
              type="submit"
              className="cc-btn cc-btn-primary"
              disabled={calculating || !selectedProduct}
            >
              {calculating ? 'Hesaplanıyor…' : 'Maliyeti Hesapla'}
            </button>
          </div>

          {result ? <OrderQuoteSummary result={result} /> : null}
        </form>
      </aside>
    </div>
  );
}

function OrderQuoteSummary({ result }: { result: OrderQuoteResult }) {
  return (
    <div className="cc-order-result">
      <div className="cc-order-result-head">
        <strong>{result.productGroupName}</strong>
        <span>
          {result.productName} · {result.sizeLabel}
        </span>
      </div>
      <div className="cc-order-result-row">
        <span>Sipariş Adedi</span>
        <strong>{result.quantity} Adet</strong>
      </div>
      {result.productionCostAvailable ? (
        <>
          <div className="cc-order-result-row">
            <span>Birim Üretim Maliyeti</span>
            <strong>{formatTryTwoDecimals(result.unitProductionCost)}</strong>
          </div>
          <div className="cc-order-result-total">
            <span>Toplam Üretim Maliyeti</span>
            <strong>{formatTryTwoDecimals(result.totalProductionCost)}</strong>
          </div>
        </>
      ) : (
        <div className="cc-alert">
          {result.missingMessages.length > 0
            ? result.missingMessages.join(' ')
            : 'Maliyet hesabı için gerekli bazı kaynak değerleri tanımlı değil.'}
        </div>
      )}

      {result.salePriceAvailable ? (
        <div className="cc-order-sale">
          {result.unitCashPrice != null ? (
            <>
              <div className="cc-order-result-row">
                <span>Birim Nakit Satış</span>
                <strong>{formatTryTwoDecimals(result.unitCashPrice)}</strong>
              </div>
              <div className="cc-order-result-row">
                <span>Toplam Nakit Satış</span>
                <strong>{formatTryTwoDecimals(result.totalCashPrice)}</strong>
              </div>
            </>
          ) : null}
          {result.unitCardPrice != null ? (
            <>
              <div className="cc-order-result-row">
                <span>Birim Kart / Taksit</span>
                <strong>{formatTryTwoDecimals(result.unitCardPrice)}</strong>
              </div>
              <div className="cc-order-result-row">
                <span>Toplam Kart / Taksit</span>
                <strong>{formatTryTwoDecimals(result.totalCardPrice)}</strong>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <p className="cc-hint">{result.salePriceMessage}</p>
      )}
    </div>
  );
}

async function loadSizeOptions(
  groupCode: string,
  product: ProductGroupProduct,
): Promise<SizeOption[]> {
  if (groupCode === 'CITA') {
    const list = await fetchCitaCostList();
    return list.rows.map((row) => ({
      key: sizeKey(row.thicknessMm, row.widthMm, row.lengthMm),
      label: formatCitaPieceLabel(row.widthMm, row.lengthMm),
      thicknessMm: row.thicknessMm,
      widthMm: String(row.widthMm),
      lengthMm: String(row.lengthMm),
    }));
  }

  if (groupCode === 'door_frame') {
    if (product.code !== '34_MM' && product.code !== '30_MM') {
      throw new Error('Bu ürün için sipariş hesabı henüz yok.');
    }
    const list = await fetchDoorFrameMdfCosts(product.code);
    return list.rows.map((row) => ({
      key: sizeKey(null, String(row.widthCm * 10), String(row.lengthCm * 10)),
      label: row.displayName,
      thicknessMm: null,
      widthMm: String(row.widthCm * 10),
      lengthMm: String(row.lengthCm * 10),
    }));
  }

  if (groupCode === 'PERVAZ') {
    const list = await fetchPervazList(product.code);
    return list.rows.map((row) => ({
      key: sizeKey(String(row.thicknessMm), String(row.widthMm), String(row.lengthMm)),
      label: formatPieceSizeCm(row.widthMm, row.lengthMm),
      thicknessMm: String(row.thicknessMm),
      widthMm: String(row.widthMm),
      lengthMm: String(row.lengthMm),
    }));
  }

  if (groupCode === 'SUPURGELIK') {
    if (!isSupurgelikCode(product.code)) {
      throw new Error('Bu ürün için sipariş hesabı henüz yok.');
    }
    const list = await fetchSupurgelikCosts(product.code);
    return list.rows.map((row) => ({
      key: sizeKey(String(row.thicknessMm), String(row.widthMm), String(row.lengthMm)),
      label: formatPieceSizeCm(row.widthMm, row.lengthMm),
      thicknessMm: String(row.thicknessMm),
      widthMm: String(row.widthMm),
      lengthMm: String(row.lengthMm),
    }));
  }

  throw new Error('Bu ürün grubu için sipariş hesabı henüz yok.');
}

async function fetchPervazList(productCode: string) {
  if (productCode === 'AYARLI_PERVAZ') return fetchAyarliPervazMdfCosts();
  if (productCode === 'DEKORATIF_PERVAZ') return fetchDekoratifPervazCosts();
  if (productCode === 'DEKORATIF_PERVAZ_GENIS_KILCIK') {
    return fetchDekoratifGenisKilcikCosts();
  }
  throw new Error('Bu ürün için sipariş hesabı henüz yok.');
}

function isSupurgelikCode(code: string): code is SupurgelikProductCode {
  return (SUPURGELIK_PRODUCT_CODES as readonly string[]).includes(code);
}
