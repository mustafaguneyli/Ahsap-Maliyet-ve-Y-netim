import { FormEvent, useEffect, useState } from 'react';
import {
  upsertSizeProfitRate,
  type SizeProfitRatePayload,
} from '../api/pricing-settings-api';
import { ApiError } from '../lib/api';
import { formatPercentRate } from '../lib/money';
import { friendlyTechnicalTerms } from '../lib/display-labels';

const NON_NEG = /^(?:0|[1-9]\d*)(?:[.,]\d+)?$/;

export function ProfitRateCell({
  value,
  payload,
  onSaved,
}: {
  value: string | null | undefined;
  payload: Omit<SizeProfitRatePayload, 'profitRate'>;
  onSaved?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(value ?? '');
      setError(null);
    }
  }, [open, value]);

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = draft.trim().replace(',', '.');
    if (trimmed !== '' && !NON_NEG.test(trimmed)) {
      setError('0 veya daha büyük bir oran girin. Boş bırakınca grup/ürün varsayılanına döner.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await upsertSizeProfitRate({
        ...payload,
        profitRate: trimmed === '' ? null : trimmed,
      });
      setOpen(false);
      onSaved?.(result.message);
    } catch (err) {
      setError(
        friendlyTechnicalTerms(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Kâr oranı kaydedilemedi.',
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="cc-profit-edit"
        onClick={() => setOpen(true)}
        title="Kâr oranını düzenle"
      >
        {formatPercentRate(value)}
      </button>
      {open ? (
        <div
          className="cc-modal-overlay"
          role="presentation"
          onClick={() => (!saving ? setOpen(false) : undefined)}
        >
          <form
            className="cc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profit-rate-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void save(e)}
          >
            <h3 id="profit-rate-title">Kâr Oranı (%)</h3>
            <p className="cc-hint">
              Yalnız bu ölçü. Boş kaydetmek özel oranı kaldırır; 0 geçerlidir.
            </p>
            <label className="cc-field">
              <span>Kâr Oranı (%)</span>
              <input
                className="cc-input"
                inputMode="decimal"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="örn. 25"
                disabled={saving}
              />
            </label>
            {error ? <p className="cc-error">{error}</p> : null}
            <div className="cc-modal-actions">
              <button
                type="button"
                className="cc-btn"
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                İptal
              </button>
              <button type="submit" className="cc-btn cc-btn-primary" disabled={saving}>
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
