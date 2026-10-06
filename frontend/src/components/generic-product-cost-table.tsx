import { useEffect, useState } from 'react';
import {
  deactivateCatalogItem,
  fetchGenericCostList,
  type DeactivateCatalogTarget,
  type GenericCostListResponse,
  type GenericCostRow,
} from '../api/cost-calculation-api';
import { ApiError } from '../lib/api';
import {
  friendlyMaterialPriceError,
  type MaterialPriceType,
} from '../lib/material-price-type';
import { formatPieceSizeCm } from '../lib/length';
import { formatTry } from '../lib/money';
import { ProfitRateCell } from './profit-rate-cell';
import {
  costStatusLabel,
  friendlyTechnicalTerms,
} from '../lib/display-labels';

type ConfirmState = {
  target: DeactivateCatalogTarget;
  title: string;
  body: string;
  confirmLabel: string;
  payload: {
    recipeId?: string;
    productId?: string;
    productGroupCode?: string;
  };
};

export function GenericProductCostTable({
  productGroupCode,
  materialPriceType,
  refreshToken = 0,
  onChanged,
}: {
  productGroupCode: string;
  materialPriceType: MaterialPriceType;
  refreshToken?: number;
  onChanged?: (message: string) => void;
}) {
  const [data, setData] = useState<GenericCostListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [removing, setRemoving] = useState(false);
  const [localRefresh, setLocalRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchGenericCostList(productGroupCode, materialPriceType)
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(
            friendlyTechnicalTerms(
              friendlyMaterialPriceError(
                err instanceof ApiError
                  ? err.message
                  : 'Genel reçete maliyet listesi yüklenemedi.',
              ),
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productGroupCode, materialPriceType, refreshToken, localRefresh]);

  const askRemoveSize = (row: GenericCostRow) => {
    if (!row.recipeId) {
      setError('Bu satır için ölçü kimliği yok; kaldırılamıyor.');
      return;
    }
    setConfirm({
      target: 'SIZE',
      title: 'Ölçüyü kaldır',
      body:
        'Bu ölçü artık aktif listelerde görünmeyecek. Geçmiş siparişler ve kayıtlar korunacaktır.',
      confirmLabel: 'Ölçüyü Kaldır',
      payload: { recipeId: row.recipeId },
    });
  };

  const askRemoveProduct = (row: GenericCostRow) => {
    if (!row.productId) {
      setError('Bu satır için ürün kimliği yok; kaldırılamıyor.');
      return;
    }
    setConfirm({
      target: 'PRODUCT',
      title: 'Ürünü kaldır',
      body:
        'Bu ürün artık aktif listelerde görünmeyecek. Geçmiş siparişler ve kayıtlar korunacaktır.',
      confirmLabel: 'Ürünü Kaldır',
      payload: { productId: row.productId },
    });
  };

  const askRemoveGroup = () => {
    setConfirm({
      target: 'GROUP',
      title: 'Ürün grubunu kaldır',
      body:
        'Bu ürün grubu artık aktif listelerde görünmeyecek. Geçmiş siparişler ve kayıtlar korunacaktır. Yalnız grupta aktif ürün yoksa kaldırılabilir.',
      confirmLabel: 'Grubu Kaldır',
      payload: { productGroupCode },
    });
  };

  const runDeactivate = async () => {
    if (!confirm) return;
    setRemoving(true);
    setError(null);
    try {
      const result = await deactivateCatalogItem({
        target: confirm.target,
        ...confirm.payload,
        reason: 'Maliyet Hesaplama — kaldır',
      });
      setConfirm(null);
      setLocalRefresh((n) => n + 1);
      onChanged?.(result.message);
    } catch (err) {
      setError(
        friendlyTechnicalTerms(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Kaldırma başarısız.',
        ),
      );
    } finally {
      setRemoving(false);
    }
  };

  if (loading) return <p className="cc-empty">Yükleniyor…</p>;

  return (
    <div className="cc-generic-table">
      <div className="cc-generic-toolbar">
        <button
          type="button"
          className="cc-btn cc-btn-sm"
          onClick={askRemoveGroup}
          disabled={removing}
        >
          Grubu Kaldır
        </button>
      </div>

      {error ? <p className="cc-error">{error}</p> : null}

      {!data || data.rows.length === 0 ? (
        <p className="cc-empty">
          Bu grupta henüz ölçü/reçete yok. “+ Yeni Ürün / Ölçü Ekle” ile ekleyin.
        </p>
      ) : (
        <div className="cc-table-wrap">
          <table className="cc-table">
            <thead>
              <tr>
                <th>Ürün</th>
                <th>Ölçü</th>
                <th>Ham Madde</th>
                <th>NET</th>
                <th>Malzeme</th>
                <th>Ek Maliyet</th>
                <th>Üretim</th>
                <th>Kâr %</th>
                <th>Nakit</th>
                <th>Kart</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => {
                const main = row.materialCosts[0];
                const ok = row.status === 'OK' && row.productionCost != null;
                return (
                  <tr key={`${row.productCode}-${row.widthMm}-${row.lengthMm}`}>
                    <td>{row.productName}</td>
                    <td>{formatPieceSizeCm(row.widthMm, row.lengthMm)}</td>
                    <td>{main?.rawMaterialName ?? '—'}</td>
                    <td>{main?.netQty ?? '—'}</td>
                    <td className="cc-money">
                      {ok && row.materialCostTotal != null
                        ? formatTry(row.materialCostTotal)
                        : '—'}
                    </td>
                    <td className="cc-money">
                      {row.extraCostTotal != null
                        ? formatTry(row.extraCostTotal)
                        : '—'}
                    </td>
                    <td className="cc-money">
                      {ok && row.productionCost != null
                        ? formatTry(row.productionCost)
                        : 'Hesaplanamıyor'}
                    </td>
                    <td className="cc-qty">
                      <ProfitRateCell
                        value={row.pricing?.profitRate}
                        payload={{
                          productId: row.productId,
                          productGroupCode: data.productGroupCode,
                          productCode: row.productCode,
                          productSizeId: row.sizeId,
                          widthMm: row.widthMm,
                          lengthMm: row.lengthMm,
                        }}
                        onSaved={(message) => {
                          onChanged?.(message);
                          setLocalRefresh((n) => n + 1);
                        }}
                      />
                    </td>
                    <td className="cc-money">
                      {row.pricing?.cashSalePrice != null
                        ? formatTry(row.pricing.cashSalePrice)
                        : '—'}
                    </td>
                    <td className="cc-money">
                      {row.pricing?.cardSalePrice != null
                        ? formatTry(row.pricing.cardSalePrice)
                        : row.pricing?.cardStatusMessage
                          ? friendlyTechnicalTerms(row.pricing.cardStatusMessage)
                          : '—'}
                    </td>
                    <td>
                      {ok ? (
                        <span className="cc-cita-source-badge">
                          {costStatusLabel('OK')}
                        </span>
                      ) : (
                        <span className="cc-error">
                          {friendlyTechnicalTerms(
                            row.missingSources[0] ?? 'Eksik kaynak',
                          )}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="cc-generic-actions">
                        <button
                          type="button"
                          className="cc-btn cc-btn-sm"
                          onClick={() => askRemoveSize(row)}
                          disabled={removing}
                        >
                          Ölçüyü Kaldır
                        </button>
                        <button
                          type="button"
                          className="cc-btn cc-btn-sm cc-btn-danger-outline"
                          onClick={() => askRemoveProduct(row)}
                          disabled={removing}
                        >
                          Ürünü Kaldır
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirm ? (
        <div
          className="cc-modal-overlay"
          role="presentation"
          onClick={() => (!removing ? setConfirm(null) : undefined)}
        >
          <div
            className="cc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="generic-remove-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="generic-remove-title">{confirm.title}</h3>
            <p>{confirm.body}</p>
            <div className="cc-modal-actions">
              <button
                type="button"
                className="cc-btn"
                disabled={removing}
                onClick={() => setConfirm(null)}
              >
                İptal
              </button>
              <button
                type="button"
                className="cc-btn cc-btn-danger"
                disabled={removing}
                onClick={() => void runDeactivate()}
              >
                {removing ? 'Kaldırılıyor…' : confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
