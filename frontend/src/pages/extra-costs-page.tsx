import { FormEvent, useEffect, useState } from 'react';
import {
  ExtraCostItem,
  ExtraCostListResponse,
  listExtraCosts,
  updateExtraCostValue,
} from '../api/extra-costs-api';
import { ApiError } from '../lib/api';
import { formatDateTr, formatTry } from '../lib/money';
import './extra-costs-page.css';

type AmountForm = {
  amount: string;
  effectiveFrom: string;
};

function todayIsoDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeAmountInput(value: string): string {
  return value.trim().replace(',', '.');
}

function validateAmountForm(form: AmountForm): string | null {
  const amount = normalizeAmountInput(form.amount);
  if (!amount || !/^\d+(\.\d{1,4})?$/.test(amount)) {
    return 'Yeni değer geçerli olmalıdır (örn. 10.00).';
  }
  if (!form.effectiveFrom) {
    return 'Geçerlilik tarihi zorunludur.';
  }
  return null;
}

export function ExtraCostsPage() {
  const [data, setData] = useState<ExtraCostListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ExtraCostItem | null>(null);
  const [form, setForm] = useState<AmountForm>({
    amount: '',
    effectiveFrom: todayIsoDate(),
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listExtraCosts('door_frame');
      setData(response);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ek maliyetler yüklenemedi.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const openDrawer = (item: ExtraCostItem) => {
    setSelected(item);
    setForm({
      amount: item.amount ?? '',
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

    const localError = validateAmountForm(form);
    if (localError) {
      setFormError(localError);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const response = await updateExtraCostValue(selected.typeCode, {
        productGroup: 'door_frame',
        amount: normalizeAmountInput(form.amount),
        effectiveFrom: form.effectiveFrom,
      });
      setData(response);
      setNotice(`“${selected.typeName}” güncellendi.`);
      setDrawerOpen(false);
      setSelected(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Değer güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ec-page">
      <div className="ec-toolbar">
        <div>
          <p className="ec-group-label">Ürün grubu</p>
          <p className="ec-group-name">{data?.productGroupName ?? 'Kapı Kasası'}</p>
          <p className="ec-hint">34 MM ve 30 MM aynı Kapı Kasası ek maliyetlerini kullanır.</p>
        </div>
        <button type="button" className="ec-btn" onClick={() => void load()} disabled={loading}>
          Yenile
        </button>
      </div>

      {notice ? <div className="ec-notice">{notice}</div> : null}
      {error ? <div className="ec-alert ec-alert-error">{error}</div> : null}

      <div className="ec-table-wrap">
        {loading && !data ? (
          <p className="ec-empty">Yükleniyor…</p>
        ) : !data || data.items.length === 0 ? (
          <p className="ec-empty">Ek maliyet kaydı bulunamadı. Seed çalıştırılmış olmalı.</p>
        ) : (
          <table className="ec-table">
            <thead>
              <tr>
                <th>Kalem</th>
                <th>Kod</th>
                <th>Aktif değer</th>
                <th>Geçerlilik</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.typeId}>
                  <td className="ec-name">{item.typeName}</td>
                  <td>{item.typeCode}</td>
                  <td className="ec-price">{formatTry(item.amount)}</td>
                  <td>{formatDateTr(item.effectiveFrom)}</td>
                  <td>
                    <button
                      type="button"
                      className="ec-btn ec-btn-sm"
                      onClick={() => openDrawer(item)}
                    >
                      Güncelle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data ? (
        <div className="ec-total">
          <span>Toplam Ek Maliyet</span>
          <strong className="ec-price">{formatTry(data.totalAmount)}</strong>
        </div>
      ) : null}

      {drawerOpen && selected ? (
        <div className="ec-drawer-overlay" onClick={closeDrawer} role="presentation">
          <aside
            className="ec-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.typeName} güncelle`}
          >
            <div className="ec-drawer-header">
              <h2>{selected.typeName} güncelle</h2>
              <button type="button" className="ec-btn ec-btn-sm" onClick={closeDrawer} disabled={saving}>
                Kapat
              </button>
            </div>
            <form className="ec-form" onSubmit={onSubmit}>
              <div className="ec-summary">
                <div className="ec-summary-label">Mevcut değer</div>
                <div className="ec-summary-value">{formatTry(selected.amount)}</div>
              </div>

              <label className="ec-field">
                Yeni değer (TL)
                <input
                  className="ec-input"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  inputMode="decimal"
                  autoFocus
                />
              </label>

              <label className="ec-field">
                Geçerlilik tarihi
                <input
                  className="ec-input"
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
                />
              </label>

              <p className="ec-hint">
                Eski değer silinmez; dönem kapanır ve yeni kayıt açılır.
              </p>

              {formError ? <div className="ec-alert ec-alert-error">{formError}</div> : null}

              <div className="ec-form-actions">
                <button type="button" className="ec-btn" onClick={closeDrawer} disabled={saving}>
                  İptal
                </button>
                <button type="submit" className="ec-btn ec-btn-primary" disabled={saving}>
                  {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
