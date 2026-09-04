import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  listRawMaterials,
  RawMaterial,
  updateRawMaterialPrices,
} from '../api/raw-materials-api';
import { ApiError } from '../lib/api';
import { formatSheetSizeCm } from '../lib/length';
import { formatDateTr, formatTry } from '../lib/money';
import './raw-materials-page.css';

type PriceForm = {
  cashPrice: string;
  cardInstallmentPrice: string;
  effectiveFrom: string;
};

function todayIsoDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizePriceInput(value: string): string {
  return value.trim().replace(',', '.');
}

function validatePriceForm(form: PriceForm): string | null {
  const cash = normalizePriceInput(form.cashPrice);
  const card = normalizePriceInput(form.cardInstallmentPrice);
  const decimalRe = /^\d+(\.\d{1,4})?$/;

  if (!cash || !decimalRe.test(cash)) {
    return 'Yeni peşin fiyat geçerli olmalıdır (örn. 3750.00).';
  }
  if (!card || !decimalRe.test(card)) {
    return 'Yeni K.Kartı fiyatı geçerli olmalıdır (örn. 4400.00).';
  }
  if (!form.effectiveFrom) {
    return 'Geçerlilik tarihi zorunludur.';
  }
  return null;
}

export function RawMaterialsPage() {
  const [items, setItems] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [thicknessFilter, setThicknessFilter] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<RawMaterial | null>(null);
  const [form, setForm] = useState<PriceForm>({
    cashPrice: '',
    cardInstallmentPrice: '',
    effectiveFrom: todayIsoDate(),
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { isActive?: boolean; thicknessMm?: number } = { isActive: true };
      if (thicknessFilter.trim()) {
        const t = Number(thicknessFilter.replace(',', '.'));
        if (Number.isFinite(t) && t > 0) params.thicknessMm = t;
      }
      const data = await listRawMaterials(params);
      setItems(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ham maddeler yüklenemedi.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // thicknessFilter değişikliklerinde yeniden yükle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thicknessFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.surfaceType ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const openPriceDrawer = (material: RawMaterial) => {
    setSelected(material);
    setForm({
      cashPrice: material.cashPrice ?? '',
      cardInstallmentPrice: material.cardInstallmentPrice ?? '',
      effectiveFrom: todayIsoDate(),
    });
    setFormError(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    if (saving) return;
    setDrawerOpen(false);
    setSelected(null);
    setFormError(null);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;

    const localError = validatePriceForm(form);
    if (localError) {
      setFormError(localError);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await updateRawMaterialPrices(selected.id, {
        cashPrice: normalizePriceInput(form.cashPrice),
        cardInstallmentPrice: normalizePriceInput(form.cardInstallmentPrice),
        effectiveFrom: form.effectiveFrom,
      });
      setNotice(`“${selected.name}” fiyatları güncellendi.`);
      setDrawerOpen(false);
      setSelected(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Fiyat güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <section className="rm-page">
      {notice ? <div className="rm-notice">{notice}</div> : null}

      <div className="rm-toolbar">
        <div className="rm-filters">
          <input
            className="rm-input"
            type="search"
            placeholder="Ham madde ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            className="rm-input rm-input-narrow"
            type="text"
            inputMode="decimal"
            placeholder="Kalınlık (mm)"
            value={thicknessFilter}
            onChange={(e) => setThicknessFilter(e.target.value)}
          />
        </div>
      </div>

      {error ? <div className="rm-alert rm-alert-error">{error}</div> : null}

      <div className="rm-table-wrap">
        {loading ? (
          <p className="rm-empty">Yükleniyor…</p>
        ) : filtered.length === 0 ? (
          <p className="rm-empty">Gösterilecek ham madde bulunamadı.</p>
        ) : (
          <table className="rm-table">
            <thead>
              <tr>
                <th>Ham Madde</th>
                <th>Kalınlık</th>
                <th>Tabaka Ölçüsü</th>
                <th>Yüzey Tipi</th>
                <th>Peşin Fiyat</th>
                <th>K.Kartı 3-6 Taksit</th>
                <th>Son Güncelleme</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td className="rm-name">{item.name}</td>
                  <td>{item.thicknessMm} mm</td>
                  <td>{formatSheetSizeCm(item.sheetWidthMm, item.sheetLengthMm)}</td>
                  <td>{item.surfaceType || '—'}</td>
                  <td className="rm-price">{formatTry(item.cashPrice)}</td>
                  <td className="rm-price">{formatTry(item.cardInstallmentPrice)}</td>
                  <td>{formatDateTr(item.lastPriceUpdatedAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="rm-btn rm-btn-primary rm-btn-sm"
                      onClick={() => openPriceDrawer(item)}
                    >
                      Fiyat Güncelle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {drawerOpen && selected ? (
        <div className="rm-drawer-overlay" onClick={closeDrawer}>
          <aside
            className="rm-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Fiyat güncelle"
          >
            <header className="rm-drawer-header">
              <h2>Fiyat Güncelle</h2>
              <button type="button" className="rm-link" onClick={closeDrawer}>
                Kapat
              </button>
            </header>

            <form className="rm-form" onSubmit={(e) => void onSubmit(e)}>
              {formError ? <div className="rm-alert rm-alert-error">{formError}</div> : null}

              <div className="rm-summary">
                <div className="rm-summary-label">Ham Madde</div>
                <div className="rm-summary-value">{selected.name}</div>
              </div>

              <div className="rm-summary">
                <div className="rm-summary-label">Mevcut Peşin</div>
                <div className="rm-summary-value">{formatTry(selected.cashPrice)}</div>
              </div>

              <label className="rm-field">
                <span>Yeni Peşin *</span>
                <input
                  className="rm-input"
                  inputMode="decimal"
                  value={form.cashPrice}
                  onChange={(e) => setForm((f) => ({ ...f, cashPrice: e.target.value }))}
                  placeholder="3750.00"
                  required
                />
              </label>

              <div className="rm-summary">
                <div className="rm-summary-label">Mevcut K.Kartı 3-6 Taksit</div>
                <div className="rm-summary-value">{formatTry(selected.cardInstallmentPrice)}</div>
              </div>

              <label className="rm-field">
                <span>Yeni K.Kartı 3-6 Taksit *</span>
                <input
                  className="rm-input"
                  inputMode="decimal"
                  value={form.cardInstallmentPrice}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cardInstallmentPrice: e.target.value }))
                  }
                  placeholder="4400.00"
                  required
                />
              </label>

              <label className="rm-field">
                <span>Geçerlilik Tarihi *</span>
                <input
                  className="rm-input"
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
                  required
                />
              </label>

              <p className="rm-hint">
                Eski fiyat kaydı silinmez; mevcut dönem kapatılır ve yeni tarihçeli fiyat
                oluşturulur.
              </p>

              <div className="rm-form-actions">
                <button type="button" className="rm-btn" onClick={closeDrawer} disabled={saving}>
                  İptal
                </button>
                <button type="submit" className="rm-btn rm-btn-primary" disabled={saving}>
                  {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
