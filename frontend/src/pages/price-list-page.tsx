import { useEffect, useMemo, useState } from 'react';
import {
  fetchPriceList,
  type PriceListDocument,
  type PriceListRow,
} from '../api/price-list-api';
import { ApiError } from '../lib/api';
import { formatDateTr, formatListTl } from '../lib/money';
import './price-list-page.css';

export type SalePriceMode = 'CASH' | 'CARD' | 'BOTH';

function rowMissing(row: PriceListRow, mode: SalePriceMode): boolean {
  if (mode === 'CASH') return row.cashSalePrice == null;
  if (mode === 'CARD') return row.cardSalePrice == null;
  return row.cashSalePrice == null || row.cardSalePrice == null;
}

function channelReasons(row: PriceListRow, channel: 'cash' | 'card'): string[] {
  if (channel === 'cash') {
    return row.cashMissingReasons?.length
      ? row.cashMissingReasons
      : row.missingReasons ?? [];
  }
  return row.cardMissingReasons ?? [];
}

function MissingPrice({ reasons }: { reasons: string[] }) {
  return (
    <div className="pl-missing-cell">
      <span>Hesaplanamıyor</span>
      {reasons.length === 1 ? <small>{reasons[0]}</small> : null}
      {reasons.length > 1 ? (
        <ul>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function PriceListPage() {
  const [data, setData] = useState<PriceListDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SalePriceMode>('CASH');
  const [selectedCodes, setSelectedCodes] = useState<string[] | null>(null);
  const [includeMissingPreview] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchPriceList()
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : 'Fiyat listesi yüklenemedi.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    if (!data) return [];
    if (selectedCodes == null) return data.groups;
    return data.groups.filter((group) => selectedCodes.includes(group.productGroupCode));
  }, [data, selectedCodes]);

  const missingForMode = groups.reduce(
    (sum, group) =>
      sum +
      group.products.reduce(
        (productSum, product) =>
          productSum +
          product.subsections.reduce(
            (sectionSum, section) =>
              sectionSum + section.rows.filter((row) => rowMissing(row, mode)).length,
            0,
          ),
        0,
      ),
    0,
  );

  const printList = (includeMissing: boolean) => {
    if (!data) return;
    const printable = {
      ...data,
      groups: groups
        .map((group) => ({
          ...group,
          products: group.products
            .map((product) => ({
              ...product,
              subsections: product.subsections
                .map((section) => ({
                  ...section,
                  rows: section.rows.filter(
                    (row) => includeMissing || !rowMissing(row, mode),
                  ),
                }))
                .filter((section) => section.rows.length > 0),
            }))
            .filter((product) => product.subsections.length > 0),
        }))
        .filter((group) => group.products.length > 0 || group.groupError),
    };
    const html = buildPrintHtml(printable, mode);
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1200');
    if (!popup) {
      setError('Yazdırma penceresi açılamadı. Tarayıcı pop-up engelini kapatın.');
      return;
    }
    popup.document.write(html);
    popup.document.close();
  };

  const onPrint = () => {
    if (missingForMode <= 0) {
      printList(false);
      return;
    }
    const include = window.confirm(
      `${missingForMode} ürünün satış fiyatı eksik.\nEksik ürünleri listeye dahil etmek istiyor musunuz?\n\nTamam: dahil et\nİptal: müşteri listesine alma`,
    );
    printList(include);
  };

  const toggleGroup = (code: string) => {
    if (selectedCodes == null) {
      setSelectedCodes(
        (data?.groups ?? [])
          .map((group) => group.productGroupCode)
          .filter((item) => item !== code),
      );
      return;
    }
    if (selectedCodes.includes(code)) {
      const next = selectedCodes.filter((item) => item !== code);
      setSelectedCodes(next.length ? next : []);
      return;
    }
    setSelectedCodes([...selectedCodes, code]);
  };

  return (
    <section className="pl-page">
      <div className="pl-toolbar">
        <div className="pl-filters">
          <div className="cc-price-type" role="group" aria-label="Satış fiyat türü">
            <span>Fiyat Türü</span>
            <div className="cc-price-type-options">
              <button
                type="button"
                className={mode === 'CASH' ? 'active' : undefined}
                onClick={() => setMode('CASH')}
              >
                Nakit
              </button>
              <button
                type="button"
                className={mode === 'CARD' ? 'active' : undefined}
                onClick={() => setMode('CARD')}
              >
                Kart / Taksit
              </button>
              <button
                type="button"
                className={mode === 'BOTH' ? 'active' : undefined}
                onClick={() => setMode('BOTH')}
              >
                Nakit + Kart
              </button>
            </div>
          </div>
          <div className="pl-groups" role="group" aria-label="Ürün grubu">
            <span>Ürün Grubu</span>
            <label className="pl-check">
              <input
                type="checkbox"
                checked={selectedCodes == null}
                onChange={(event) =>
                  setSelectedCodes(event.target.checked ? null : [])
                }
              />
              Tüm Gruplar
            </label>
            {(data?.groups ?? []).map((group) => (
              <label key={group.productGroupCode} className="pl-check">
                <input
                  type="checkbox"
                  checked={
                    selectedCodes == null ||
                    selectedCodes.includes(group.productGroupCode)
                  }
                  onChange={() => toggleGroup(group.productGroupCode)}
                />
                {group.productGroupName}
              </label>
            ))}
          </div>
        </div>
        <div className="pl-actions">
          <button
            type="button"
            className="cc-btn"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              void fetchPriceList()
                .then(setData)
                .catch((err) =>
                  setError(
                    err instanceof ApiError
                      ? err.message
                      : 'Fiyat listesi yüklenemedi.',
                  ),
                )
                .finally(() => setLoading(false));
            }}
          >
            Yenile
          </button>
          <button
            type="button"
            className="cc-btn cc-btn-primary"
            disabled={loading || !data}
            onClick={onPrint}
          >
            Yazdır / PDF Kaydet
          </button>
        </div>
      </div>

      {error ? <p className="pl-error">{error}</p> : null}
      {loading ? <p className="pl-muted">Fiyat listesi hazırlanıyor…</p> : null}

      {data && !loading ? (
        <article className="pl-sheet">
          <header className="pl-letterhead">
            <p className="pl-company">{data.companyName}</p>
            <h2>{data.title}</h2>
            <p className="pl-date">Tarih: {formatDateTr(data.asOf)}</p>
          </header>
          {groups.length === 0 ? (
            <p className="pl-muted">Seçili ürün grubu yok.</p>
          ) : (
            groups.map((group) => (
              <section key={group.productGroupCode} className="pl-group">
                <h3>{group.productGroupName.toLocaleUpperCase('tr-TR')}</h3>
                {group.groupError ? (
                  <p className="pl-error">{group.groupError}</p>
                ) : null}
                {group.products.map((product) => (
                  <div key={product.productCode} className="pl-product">
                    {product.subsections.map((section) => (
                      <div key={`${product.productCode}-${section.title}`}>
                        <h4>{section.title}</h4>
                        <table>
                          <thead>
                            <tr>
                              <th>Ölçü</th>
                              {mode !== 'CARD' ? <th>Nakit</th> : null}
                              {mode !== 'CASH' ? <th>Kart / Taksit</th> : null}
                            </tr>
                          </thead>
                          <tbody>
                            {section.rows.map((row, index) => {
                              const missing = rowMissing(row, mode);
                              if (!includeMissingPreview && missing) return null;
                              return (
                                <tr
                                  key={`${row.productCode}-${row.displayName}-${index}`}
                                  className={missing ? 'pl-missing' : undefined}
                                >
                                  <td>
                                    {row.thicknessLabel
                                      ? `${row.thicknessLabel} · ${row.displayName}`
                                      : row.displayName}
                                  </td>
                                  {mode !== 'CARD' ? (
                                    <td className="pl-money">
                                      {row.cashSalePrice ? (
                                        formatListTl(row.cashSalePrice)
                                      ) : (
                                        <MissingPrice
                                          reasons={channelReasons(row, 'cash')}
                                        />
                                      )}
                                    </td>
                                  ) : null}
                                  {mode !== 'CASH' ? (
                                    <td className="pl-money">
                                      {row.cardSalePrice ? (
                                        formatListTl(row.cardSalePrice)
                                      ) : (
                                        <MissingPrice
                                          reasons={channelReasons(row, 'card')}
                                        />
                                      )}
                                    </td>
                                  ) : null}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            ))
          )}
          {missingForMode > 0 ? (
            <p className="pl-note">
              {missingForMode} satırın satış fiyatı hesaplanamıyor. Yazdırırken
              varsayılan olarak müşteri listesine alınmaz.
            </p>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMissingHtml(reasons: string[]): string {
  const unique = [...new Set(reasons.filter(Boolean))];
  const extra =
    unique.length === 0
      ? ''
      : unique
          .map((reason) => `<span class="reason">${escapeHtml(reason)}</span>`)
          .join('');
  return `<span class="missing">Hesaplanamıyor</span>${extra}`;
}

function buildPrintHtml(data: PriceListDocument, mode: SalePriceMode): string {
  const groupsHtml = data.groups
    .map((group) => {
      const products = group.products
        .map((product) =>
          product.subsections
            .map((section) => {
              const rows = section.rows
                .map((row) => {
                  const size = row.thicknessLabel
                    ? `${row.thicknessLabel} · ${row.displayName}`
                    : row.displayName;
                  const cash = row.cashSalePrice
                    ? formatListTl(row.cashSalePrice)
                    : formatMissingHtml(channelReasons(row, 'cash'));
                  const card = row.cardSalePrice
                    ? formatListTl(row.cardSalePrice)
                    : formatMissingHtml(channelReasons(row, 'card'));
                  return `<tr>
                    <td>${escapeHtml(size)}</td>
                    ${mode !== 'CARD' ? `<td class="money">${cash}</td>` : ''}
                    ${mode !== 'CASH' ? `<td class="money">${card}</td>` : ''}
                  </tr>`;
                })
                .join('');
              return `<h4>${escapeHtml(section.title)}</h4>
                <table>
                  <thead><tr>
                    <th>Ölçü</th>
                    ${mode !== 'CARD' ? '<th>Nakit</th>' : ''}
                    ${mode !== 'CASH' ? '<th>Kart / Taksit</th>' : ''}
                  </tr></thead>
                  <tbody>${rows}</tbody>
                </table>`;
            })
            .join(''),
        )
        .join('');
      return `<section class="group">
        <h3>${escapeHtml(group.productGroupName.toLocaleUpperCase('tr-TR'))}</h3>
        ${products}
      </section>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.title)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Calibri, "Segoe UI", sans-serif; color: #111; }
    .print-bar { margin: 0 0 12px; }
    .print-bar button { font: inherit; padding: 6px 10px; }
    @media print { .print-bar { display: none; } }
    .company { text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 0.08em; }
    h1 { text-align: center; font-size: 16px; margin: 4px 0 2px; }
    .date { text-align: center; margin: 0 0 16px; }
    .group { margin-top: 18px; }
    h3 { margin: 0 0 8px; border-bottom: 2px solid #111; padding-bottom: 4px; break-after: avoid; page-break-after: avoid; }
    h4 { margin: 12px 0 6px; break-after: avoid; page-break-after: avoid; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; page-break-inside: auto; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { border-bottom: 1px solid #d1d5db; padding: 5px 6px; font-size: 13px; }
    th { text-align: left; }
    .money { text-align: right; }
    .missing { font-weight: 600; }
    .reason { display: block; font-size: 10px; font-weight: 400; color: #7c2d12; margin-top: 2px; }
  </style>
</head>
<body>
  <div class="print-bar">
    <button type="button" onclick="window.print()">Yazdır / PDF kaydet</button>
    <span> Açılan pencerede hedef olarak PDF kaydetmeyi seçin.</span>
  </div>
  <p class="company">${escapeHtml(data.companyName)}</p>
  <h1>${escapeHtml(data.title)}</h1>
  <p class="date">Tarih: ${escapeHtml(formatDateTr(data.asOf))}</p>
  ${groupsHtml}
</body>
</html>`;
}
