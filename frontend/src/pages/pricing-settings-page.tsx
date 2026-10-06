import { FormEvent, useEffect, useState } from 'react';
import {
  listGroupCardMarkupRates,
  updateGroupCardMarkupRate,
  type GroupCardMarkupRateItem,
} from '../api/pricing-settings-api';
import { ApiError } from '../lib/api';
import { formatPercentRate } from '../lib/money';
import './pricing-settings-page.css';

function normalizeRateInput(value: string): string {
  return value.trim().replace(',', '.');
}

function isValidRate(value: string): boolean {
  return /^\d+(\.\d{1,4})?$/.test(value);
}

export function PricingSettingsPage() {
  const [items, setItems] = useState<GroupCardMarkupRateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listGroupCardMarkupRates();
      setItems(response.items);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Kart / taksit farkları yüklenemedi.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const startEdit = (item: GroupCardMarkupRateItem) => {
    setEditingCode(item.productGroupCode);
    setRateInput(item.cardMarkupRate ?? '');
    setFormError(null);
  };

  const cancelEdit = () => {
    setEditingCode(null);
    setRateInput('');
    setFormError(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (editingCode == null) return;
    const rate = normalizeRateInput(rateInput);
    if (!isValidRate(rate)) {
      setFormError('Kart / taksit farkı geçerli olmalıdır (örn. 20 veya 18,5).');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await updateGroupCardMarkupRate(editingCode, rate);
      cancelEdit();
      await load();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Kart / taksit farkı kaydedilemedi.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="pricing-page">
      {error ? <p className="pricing-error">{error}</p> : null}
      {loading ? <p className="pricing-muted">Oranlar yükleniyor…</p> : null}
      {!loading && !error ? (
        <div className="pricing-table-wrap">
          <table className="pricing-table">
            <thead>
              <tr>
                <th>Ürün Grubu</th>
                <th>Kart / Taksit Farkı (%)</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const defined = item.cardMarkupRate != null;
                const editing = editingCode === item.productGroupCode;
                return (
                  <tr key={item.productGroupCode}>
                    <td>{item.productGroupName}</td>
                    <td>
                      {editing ? (
                        <form className="pricing-edit" onSubmit={(event) => void save(event)}>
                          <input
                            className="pricing-input"
                            inputMode="decimal"
                            value={rateInput}
                            onChange={(event) => setRateInput(event.target.value)}
                            aria-label={`${item.productGroupName} kart taksit farkı`}
                            disabled={saving}
                          />
                          <button
                            type="submit"
                            className="pricing-btn pricing-btn-primary"
                            disabled={saving}
                          >
                            {saving ? 'Kaydediliyor…' : 'Kaydet'}
                          </button>
                          <button
                            type="button"
                            className="pricing-btn"
                            onClick={cancelEdit}
                            disabled={saving}
                          >
                            İptal
                          </button>
                        </form>
                      ) : defined ? (
                        formatPercentRate(item.cardMarkupRate)
                      ) : (
                        <div>
                          <div>Grup kart oranı: Tanımlı değil</div>
                          {item.productCardMarkupRate ? (
                            <div className="pricing-note">
                              Mevcut hesaplama: Ürün oranı{' '}
                              {formatPercentRate(item.productCardMarkupRate)}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td>{defined ? 'Tanımlı' : 'Tanımlı değil'}</td>
                    <td>
                      {editing ? null : (
                        <button
                          type="button"
                          className="pricing-link"
                          onClick={() => startEdit(item)}
                        >
                          {defined ? 'Düzenle' : 'Değer Gir'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {formError ? <p className="pricing-error">{formError}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
