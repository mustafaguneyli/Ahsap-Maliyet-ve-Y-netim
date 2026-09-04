import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  DoorFrameMdfResponse,
  DoorFrameMdfRow,
  fetchDoorFrameMdfCosts,
} from '../api/cost-calculation-api';
import { listExtraCosts, updateExtraCostValue } from '../api/extra-costs-api';
import {
  ProductPricingSetting,
  getDoorFramePricingSetting,
  updateDoorFramePricingSetting,
} from '../api/pricing-settings-api';
import { ApiError } from '../lib/api';
import { formatPercentRate, formatTry } from '../lib/money';
import {
  deactivateDoorFrameCashOverride,
  upsertDoorFrameCashOverride,
} from '../api/price-overrides-api';
import './cost-calculation-page.css';

type ProductGroup = 'door_frame';
type DoorFrameVariant = '34_MM' | '30_MM';

type ExtraForm = {
  CUTTING: string;
  GLUE: string;
  LABOR: string;
  OTHER: string;
};

type PricingForm = {
  vatRate: string;
  profitRate: string;
  cardMarkupRate: string;
};

const EXTRA_LABELS: Record<keyof ExtraForm, string> = {
  CUTTING: 'Kesim',
  GLUE: 'Tutkal',
  LABOR: 'İşçilik',
  OTHER: 'Diğer',
};

const EXTRA_ORDER: Array<keyof ExtraForm> = ['CUTTING', 'GLUE', 'LABOR', 'OTHER'];

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

function isValidDecimal(value: string): boolean {
  return /^\d+(\.\d{1,4})?$/.test(value);
}

function amountsEqual(a: string, b: string): boolean {
  const na = normalizeDecimalInput(a);
  const nb = normalizeDecimalInput(b);
  if (!isValidDecimal(na) || !isValidDecimal(nb)) return false;
  // string karşılaştırma için trailing zero farkını basitçe ele al
  const strip = (v: string) => v.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return strip(na) === strip(nb);
}

function partByThickness(row: DoorFrameMdfRow, thickness: string) {
  return row.parts.find((p) => p.thicknessMm === thickness || p.thicknessMm === `${thickness}.0`);
}

function emptyExtraForm(): ExtraForm {
  return { CUTTING: '', GLUE: '', LABOR: '', OTHER: '' };
}

export function CostCalculationPage() {
  const [productGroup, setProductGroup] = useState<ProductGroup>('door_frame');
  const [variant, setVariant] = useState<DoorFrameVariant>('34_MM');
  const [data, setData] = useState<DoorFrameMdfResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [extraBaseline, setExtraBaseline] = useState<ExtraForm>(emptyExtraForm());
  const [extraForm, setExtraForm] = useState<ExtraForm>(emptyExtraForm());
  const [pricingBaseline, setPricingBaseline] = useState<PricingForm>({
    vatRate: '',
    profitRate: '',
    cardMarkupRate: '',
  });
  const [pricingForm, setPricingForm] = useState<PricingForm>({
    vatRate: '',
    profitRate: '',
    cardMarkupRate: '',
  });
  const [pricingMeta, setPricingMeta] = useState<ProductPricingSetting | null>(null);

  const [priceEditRow, setPriceEditRow] = useState<DoorFrameMdfRow | null>(null);
  const [priceEditCash, setPriceEditCash] = useState('');
  const [priceEditReason, setPriceEditReason] = useState('');
  const [priceEditSaving, setPriceEditSaving] = useState(false);
  const [priceEditError, setPriceEditError] = useState<string | null>(null);

  const thicknesses = useMemo(
    () => (variant === '34_MM' ? (['22', '12'] as const) : (['18', '12'] as const)),
    [variant],
  );

  const reloadCosts = async (targetVariant: DoorFrameVariant = variant) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchDoorFrameMdfCosts(targetVariant);
      setData(response);
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError ? err.message : 'MDF maliyeti yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (productGroup !== 'door_frame') return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    void fetchDoorFrameMdfCosts(variant)
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(err instanceof ApiError ? err.message : 'MDF maliyeti yüklenemedi.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productGroup, variant]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const loadSettingsIntoDrawer = async () => {
    setSettingsLoading(true);
    setFormError(null);
    try {
      const [extras, pricing] = await Promise.all([
        listExtraCosts('door_frame'),
        getDoorFramePricingSetting(variant),
      ]);

      const nextExtra: ExtraForm = emptyExtraForm();
      for (const code of EXTRA_ORDER) {
        const item = extras.items.find((i) => i.typeCode === code);
        nextExtra[code] = item?.amount ?? '';
      }
      setExtraBaseline(nextExtra);
      setExtraForm(nextExtra);

      const nextPricing = {
        vatRate: pricing.vatRate,
        profitRate: pricing.profitRate,
        cardMarkupRate: pricing.cardMarkupRate,
      };
      setPricingBaseline(nextPricing);
      setPricingForm(nextPricing);
      setPricingMeta(pricing);
      setDrawerOpen(true);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Maliyet ayarları yüklenemedi.',
      );
      setDrawerOpen(true);
    } finally {
      setSettingsLoading(false);
    }
  };

  const closeDrawer = () => {
    if (saving) return;
    setDrawerOpen(false);
    setFormError(null);
  };

  const openPriceEdit = (row: DoorFrameMdfRow) => {
    setPriceEditRow(row);
    setPriceEditCash(row.pricing.publishedCashPrice);
    setPriceEditReason(row.pricing.cashOverride?.reason ?? '');
    setPriceEditError(null);
  };

  const closePriceEdit = () => {
    if (priceEditSaving) return;
    setPriceEditRow(null);
    setPriceEditError(null);
  };

  const onSavePriceOverride = async (event: FormEvent) => {
    event.preventDefault();
    if (!priceEditRow) return;
    const cash = normalizeDecimalInput(priceEditCash);
    if (!isValidDecimal(cash) || /^0+(\.0+)?$/.test(cash)) {
      setPriceEditError('Yayınlanan nakit fiyatı 0\'dan büyük bir tutar olmalıdır (örn. 300).');
      return;
    }
    setPriceEditSaving(true);
    setPriceEditError(null);
    try {
      await upsertDoorFrameCashOverride(variant, priceEditRow.widthCm, priceEditRow.lengthCm, {
        productGroup: 'door_frame',
        cashPrice: cash,
        reason: priceEditReason.trim() || undefined,
      });
      setPriceEditRow(null);
      setNotice('Nakit override kaydedildi. Tablo güncelleniyor…');
      await reloadCosts(variant);
      setNotice('Yayınlanan nakit fiyatı uygulandı.');
    } catch (err) {
      setPriceEditError(err instanceof ApiError ? err.message : 'Override kaydedilemedi.');
    } finally {
      setPriceEditSaving(false);
    }
  };

  const onUseFormulaPrice = async () => {
    if (!priceEditRow) return;
    setPriceEditSaving(true);
    setPriceEditError(null);
    try {
      await deactivateDoorFrameCashOverride(
        variant,
        priceEditRow.widthCm,
        priceEditRow.lengthCm,
      );
      setPriceEditRow(null);
      setNotice('Override kaldırıldı. Formül fiyatı kullanılıyor…');
      await reloadCosts(variant);
      setNotice('Formül nakit fiyatı uygulandı.');
    } catch (err) {
      setPriceEditError(err instanceof ApiError ? err.message : 'Override kaldırılamadı.');
    } finally {
      setPriceEditSaving(false);
    }
  };

  const pendingChanges = useMemo(() => {
    const changes: Array<{ label: string; from: string; to: string }> = [];
    for (const code of EXTRA_ORDER) {
      if (!amountsEqual(extraForm[code], extraBaseline[code])) {
        changes.push({
          label: EXTRA_LABELS[code],
          from: formatTry(normalizeDecimalInput(extraBaseline[code])),
          to: formatTry(normalizeDecimalInput(extraForm[code])),
        });
      }
    }
    if (!amountsEqual(pricingForm.vatRate, pricingBaseline.vatRate)) {
      changes.push({
        label: 'KDV Oranı',
        from: formatPercentRate(normalizeDecimalInput(pricingBaseline.vatRate)),
        to: formatPercentRate(normalizeDecimalInput(pricingForm.vatRate)),
      });
    }
    if (!amountsEqual(pricingForm.profitRate, pricingBaseline.profitRate)) {
      changes.push({
        label: 'Kâr Oranı',
        from: formatPercentRate(normalizeDecimalInput(pricingBaseline.profitRate)),
        to: formatPercentRate(normalizeDecimalInput(pricingForm.profitRate)),
      });
    }
    if (!amountsEqual(pricingForm.cardMarkupRate, pricingBaseline.cardMarkupRate)) {
      changes.push({
        label: 'Kredi Kartı Farkı',
        from: formatPercentRate(normalizeDecimalInput(pricingBaseline.cardMarkupRate)),
        to: formatPercentRate(normalizeDecimalInput(pricingForm.cardMarkupRate)),
      });
    }
    return changes;
  }, [extraForm, extraBaseline, pricingForm, pricingBaseline]);

  const onSaveSettings = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    for (const code of EXTRA_ORDER) {
      const amount = normalizeDecimalInput(extraForm[code]);
      if (!isValidDecimal(amount)) {
        setFormError(`${EXTRA_LABELS[code]} geçerli bir tutar olmalıdır (örn. 17.00).`);
        return;
      }
    }
    const vat = normalizeDecimalInput(pricingForm.vatRate);
    const profit = normalizeDecimalInput(pricingForm.profitRate);
    const card = normalizeDecimalInput(pricingForm.cardMarkupRate);
    if (!isValidDecimal(vat)) {
      setFormError('KDV oranı geçerli olmalıdır (örn. 0 veya 10).');
      return;
    }
    if (!isValidDecimal(profit)) {
      setFormError('Kâr oranı geçerli olmalıdır (örn. 20).');
      return;
    }
    if (!isValidDecimal(card)) {
      setFormError('Kredi kartı farkı geçerli olmalıdır (örn. 20).');
      return;
    }
    if (pendingChanges.length === 0) {
      setFormError('Değişiklik yok.');
      return;
    }

    setSaving(true);
    try {
      const effectiveFrom = todayIsoDate();
      for (const code of EXTRA_ORDER) {
        if (amountsEqual(extraForm[code], extraBaseline[code])) continue;
        await updateExtraCostValue(code, {
          productGroup: 'door_frame',
          amount: normalizeDecimalInput(extraForm[code]),
          effectiveFrom,
        });
      }

      if (
        !amountsEqual(pricingForm.vatRate, pricingBaseline.vatRate) ||
        !amountsEqual(pricingForm.profitRate, pricingBaseline.profitRate) ||
        !amountsEqual(pricingForm.cardMarkupRate, pricingBaseline.cardMarkupRate)
      ) {
        await updateDoorFramePricingSetting(variant, {
          productGroup: 'door_frame',
          vatRate: vat,
          profitRate: profit,
          cardMarkupRate: card,
        });
      }

      setDrawerOpen(false);
      setNotice('Maliyet ayarları kaydedildi. Tablo güncelleniyor…');
      await reloadCosts(variant);
      setNotice('Maliyet ayarları uygulandı.');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Ayarlar kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="cc-page">
      <div className="cc-toolbar">
        <label className="cc-field">
          <span>Ürün Grubu</span>
          <select
            className="cc-select"
            value={productGroup}
            onChange={(e) => setProductGroup(e.target.value as ProductGroup)}
          >
            <option value="door_frame">Kapı Kasası</option>
          </select>
        </label>

        {productGroup === 'door_frame' ? (
          <button
            type="button"
            className="cc-btn cc-btn-primary"
            onClick={() => void loadSettingsIntoDrawer()}
            disabled={settingsLoading || loading}
          >
            {settingsLoading ? 'Yükleniyor…' : 'Maliyet Ayarlarını Düzenle'}
          </button>
        ) : null}
      </div>

      {productGroup === 'door_frame' ? (
        <>
          <div className="cc-segments" role="tablist" aria-label="Kapı kasası tipi">
            <button
              type="button"
              role="tab"
              aria-selected={variant === '34_MM'}
              className={variant === '34_MM' ? 'cc-segment active' : 'cc-segment'}
              onClick={() => setVariant('34_MM')}
            >
              34 MM MDF KASA
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={variant === '30_MM'}
              className={variant === '30_MM' ? 'cc-segment active' : 'cc-segment'}
              onClick={() => setVariant('30_MM')}
            >
              30 MM MDF KASA
            </button>
          </div>

          <p className="cc-note">
            Maliyet hesabı aktif <strong>K.Kartı / Taksitli</strong> ham madde alış fiyatı,
            doğrulanmış <strong>NET adet</strong>, Kapı Kasası <strong>ek maliyetleri</strong>,
            ürün <strong>KDV</strong>, <strong>kâr</strong> ve <strong>kredi kartı farkı</strong> oranı
            ile yapılır. Girdi değerleri “Maliyet Ayarlarını Düzenle” ile değiştirilir; satış
            fiyatları her istekte yeniden hesaplanır.
          </p>

          {notice ? <div className="cc-notice">{notice}</div> : null}
          {error ? <div className="cc-alert">{error}</div> : null}

          <div className="cc-table-wrap">
            {loading ? (
              <p className="cc-empty">Hesaplanıyor…</p>
            ) : !data || data.rows.length === 0 ? (
              <p className="cc-empty">Gösterilecek satır yok.</p>
            ) : (
              <table className="cc-table">
                <thead>
                  <tr>
                    <th rowSpan={2} className="cc-col-size">
                      Ölçü
                    </th>
                    <th colSpan={2}>Hesaplanan</th>
                    <th colSpan={2}>NET</th>
                    <th colSpan={2}>
                      <span className="cc-th-stack">
                        Parça
                        <span>Maliyeti</span>
                      </span>
                    </th>
                    <th rowSpan={2} className="cc-th-result">
                      <span className="cc-th-stack">
                        MDF
                        <span>Maliyeti</span>
                      </span>
                    </th>
                    <th rowSpan={2} className="cc-th-expense">
                      Kesim
                    </th>
                    <th rowSpan={2} className="cc-th-expense">
                      Tutkal
                    </th>
                    <th rowSpan={2} className="cc-th-expense">
                      İşçilik
                    </th>
                    <th rowSpan={2} className="cc-th-expense">
                      Diğer
                    </th>
                    <th rowSpan={2} className="cc-th-result">
                      <span className="cc-th-stack">
                        MDF +
                        <span>Masraf</span>
                      </span>
                    </th>
                    <th rowSpan={2}>KDV %</th>
                    <th rowSpan={2}>KDV ₺</th>
                    <th rowSpan={2} className="cc-th-result">
                      <span className="cc-th-stack">
                        KDV Dahil
                        <span>Maliyet</span>
                      </span>
                    </th>
                    <th rowSpan={2}>Kâr %</th>
                    <th rowSpan={2}>Kâr ₺</th>
                    <th rowSpan={2} className="cc-th-result">
                      <span className="cc-th-stack">
                        Yuvarlama
                        <span>Öncesi</span>
                      </span>
                    </th>
                    <th rowSpan={2} className="cc-th-result">
                      <span className="cc-th-stack">
                        Yuvarlanmış
                        <span>Satış</span>
                      </span>
                    </th>
                    <th rowSpan={2} className="cc-th-final">
                      <span className="cc-th-stack">
                        Hesaplanan
                        <span>Nakit</span>
                      </span>
                    </th>
                    <th rowSpan={2} className="cc-th-final">
                      <span className="cc-th-stack">
                        Yayınlanan
                        <span>Nakit</span>
                      </span>
                    </th>
                    <th rowSpan={2} className="cc-th-final">
                      <span className="cc-th-stack">
                        K.Kartı /
                        <span>Taksitli</span>
                      </span>
                    </th>
                    <th rowSpan={2} className="cc-th-action">
                      {' '}
                    </th>
                  </tr>
                  <tr>
                    <th className="cc-th-sub">{thicknesses[0]}</th>
                    <th className="cc-th-sub">{thicknesses[1]}</th>
                    <th className="cc-th-sub">{thicknesses[0]}</th>
                    <th className="cc-th-sub">{thicknesses[1]}</th>
                    <th className="cc-th-sub">{thicknesses[0]}</th>
                    <th className="cc-th-sub">{thicknesses[1]}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const primary = partByThickness(row, thicknesses[0]);
                    const secondary = partByThickness(row, thicknesses[1]);
                    return (
                      <tr key={row.displayName}>
                        <td className="cc-col-size">{row.displayName.replace('×', '×')}</td>
                        <td className="cc-qty">{primary?.calculatedQty ?? '—'}</td>
                        <td className="cc-qty">{secondary?.calculatedQty ?? '—'}</td>
                        <td className="cc-qty">{primary?.netQty ?? '—'}</td>
                        <td className="cc-qty">{secondary?.netQty ?? '—'}</td>
                        <td className="cc-money">{formatTry(primary?.unitCost)}</td>
                        <td className="cc-money">{formatTry(secondary?.unitCost)}</td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-mdf">{formatTry(row.mdfCost)}</span>
                        </td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-expense">
                            {formatTry(row.extraCosts.cutting)}
                          </span>
                        </td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-expense">
                            {formatTry(row.extraCosts.glue)}
                          </span>
                        </td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-expense">
                            {formatTry(row.extraCosts.labor)}
                          </span>
                        </td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-expense">
                            {formatTry(row.extraCosts.other)}
                          </span>
                        </td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-prod">
                            {formatTry(row.productionCost)}
                          </span>
                        </td>
                        <td className="cc-qty">{formatPercentRate(row.pricing.vatRate)}</td>
                        <td className="cc-money">{formatTry(row.pricing.vatAmount)}</td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-vat">
                            {formatTry(row.pricing.costWithVat)}
                          </span>
                        </td>
                        <td className="cc-qty">{formatPercentRate(row.pricing.profitRate)}</td>
                        <td className="cc-money">{formatTry(row.pricing.profitAmount)}</td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-pre">
                            {formatTry(row.pricing.priceBeforeRounding)}
                          </span>
                        </td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-sale">
                            {formatTry(row.pricing.roundedSalePrice)}
                          </span>
                        </td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-cash">
                            {formatTry(row.pricing.calculatedCashPrice ?? row.pricing.cashSalePrice)}
                          </span>
                        </td>
                        <td className="cc-money">
                          <span
                            className={
                              row.pricing.cashOverride
                                ? 'cc-badge cc-badge-published'
                                : 'cc-badge cc-badge-cash'
                            }
                          >
                            {formatTry(row.pricing.publishedCashPrice ?? row.pricing.cashSalePrice)}
                          </span>
                        </td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-card">
                            {formatTry(row.pricing.publishedCardPrice ?? row.pricing.cardSalePrice)}
                          </span>
                        </td>
                        <td className="cc-col-action">
                          <button
                            type="button"
                            className="cc-btn cc-btn-row"
                            onClick={() => openPriceEdit(row)}
                          >
                            Fiyat Düzenle
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}

      {drawerOpen ? (
        <div className="cc-drawer-overlay" onClick={closeDrawer} role="presentation">
          <aside
            className="cc-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Maliyet ayarlarını düzenle"
          >
            <div className="cc-drawer-header">
              <h2>Maliyet Ayarlarını Düzenle</h2>
              <button type="button" className="cc-btn cc-btn-sm" onClick={closeDrawer} disabled={saving}>
                Kapat
              </button>
            </div>

            {settingsLoading ? (
              <p className="cc-empty">Ayarlar yükleniyor…</p>
            ) : (
              <form className="cc-form" onSubmit={onSaveSettings}>
                <section className="cc-form-section">
                  <h3>Ortak Kapı Kasası Giderleri</h3>
                  <p className="cc-hint">34 MM ve 30 MM aynı değerleri kullanır.</p>
                  {EXTRA_ORDER.map((code) => (
                    <label key={code} className="cc-field">
                      <span>{EXTRA_LABELS[code]} (TL)</span>
                      <input
                        className="cc-input"
                        value={extraForm[code]}
                        onChange={(e) =>
                          setExtraForm((prev) => ({ ...prev, [code]: e.target.value }))
                        }
                        inputMode="decimal"
                      />
                    </label>
                  ))}
                </section>

                <section className="cc-form-section">
                  <h3>
                    {variant === '34_MM' ? '34 MM' : '30 MM'} Fiyatlandırma Ayarları
                  </h3>
                  <p className="cc-hint">
                    {pricingMeta?.productName ?? variant} — yalnızca seçili kasa etkilenir.
                  </p>
                  <label className="cc-field">
                    <span>KDV Oranı (%)</span>
                    <input
                      className="cc-input"
                      value={pricingForm.vatRate}
                      onChange={(e) =>
                        setPricingForm((prev) => ({ ...prev, vatRate: e.target.value }))
                      }
                      inputMode="decimal"
                    />
                  </label>
                  <label className="cc-field">
                    <span>Kâr Oranı (%)</span>
                    <input
                      className="cc-input"
                      value={pricingForm.profitRate}
                      onChange={(e) =>
                        setPricingForm((prev) => ({ ...prev, profitRate: e.target.value }))
                      }
                      inputMode="decimal"
                    />
                  </label>
                  <label className="cc-field">
                    <span>Kredi Kartı Farkı (%)</span>
                    <input
                      className="cc-input"
                      value={pricingForm.cardMarkupRate}
                      onChange={(e) =>
                        setPricingForm((prev) => ({
                          ...prev,
                          cardMarkupRate: e.target.value,
                        }))
                      }
                      inputMode="decimal"
                    />
                  </label>
                </section>

                {pendingChanges.length > 0 ? (
                  <div className="cc-summary">
                    <div className="cc-summary-label">Kaydedilecek değişiklikler</div>
                    <ul className="cc-change-list">
                      {pendingChanges.map((c) => (
                        <li key={c.label}>
                          <strong>{c.label}:</strong> {c.from} → {c.to}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="cc-hint">Henüz değişiklik yok.</p>
                )}

                {formError ? <div className="cc-alert">{formError}</div> : null}

                <div className="cc-form-actions">
                  <button type="button" className="cc-btn" onClick={closeDrawer} disabled={saving}>
                    İptal
                  </button>
                  <button
                    type="submit"
                    className="cc-btn cc-btn-primary"
                    disabled={saving || pendingChanges.length === 0}
                  >
                    {saving ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}
                  </button>
                </div>
              </form>
            )}
          </aside>
        </div>
      ) : null}

      {priceEditRow ? (
        <div className="cc-drawer-overlay" onClick={closePriceEdit} role="presentation">
          <aside
            className="cc-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Nakit fiyat düzenle"
          >
            <div className="cc-drawer-header">
              <h2>Fiyat Düzenle</h2>
              <button
                type="button"
                className="cc-btn cc-btn-sm"
                onClick={closePriceEdit}
                disabled={priceEditSaving}
              >
                Kapat
              </button>
            </div>
            <form className="cc-form" onSubmit={onSavePriceOverride}>
              <section className="cc-form-section">
                <p className="cc-hint">
                  {variant === '34_MM' ? '34 MM' : '30 MM'} · Ölçü:{' '}
                  <strong>{priceEditRow.displayName}</strong>
                </p>
                <div className="cc-summary">
                  <div className="cc-summary-label">Hesaplanan Nakit</div>
                  <strong>
                    {formatTry(
                      priceEditRow.pricing.calculatedCashPrice ??
                        priceEditRow.pricing.cashSalePrice,
                    )}
                  </strong>
                </div>
                <label className="cc-field">
                  <span>Yayınlanan Nakit (TL)</span>
                  <input
                    className="cc-input"
                    value={priceEditCash}
                    onChange={(e) => setPriceEditCash(e.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <label className="cc-field">
                  <span>Değişiklik Sebebi (opsiyonel)</span>
                  <input
                    className="cc-input"
                    value={priceEditReason}
                    onChange={(e) => setPriceEditReason(e.target.value)}
                  />
                </label>
                <p className="cc-hint">
                  Kart fiyatı yayınlanan nakit × kart farkı oranı ile ROUNDUP hesaplanır.
                  Kart için ayrı override yoktur.
                </p>
              </section>

              {priceEditError ? <div className="cc-alert">{priceEditError}</div> : null}

              <div className="cc-form-actions">
                <button
                  type="button"
                  className="cc-btn"
                  onClick={closePriceEdit}
                  disabled={priceEditSaving}
                >
                  İptal
                </button>
                <button
                  type="button"
                  className="cc-btn"
                  onClick={() => void onUseFormulaPrice()}
                  disabled={priceEditSaving || !priceEditRow.pricing.cashOverride}
                >
                  Formül fiyatını kullan
                </button>
                <button
                  type="submit"
                  className="cc-btn cc-btn-primary"
                  disabled={priceEditSaving}
                >
                  {priceEditSaving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
