import type {
  AyarliPervazMdfRow,
  DekoratifGenisKilcikRow,
  DekoratifPervazRow,
} from '../api/cost-calculation-api';
import { formatPieceSizeCm } from '../lib/length';
import { formatPercentRate, formatTry } from '../lib/money';

type Props = {
  rows: Array<
    AyarliPervazMdfRow | DekoratifPervazRow | DekoratifGenisKilcikRow
  >;
  mode: 'ayarli' | 'dekoratif';
};

function formatWholeTry(value: string | null | undefined): string {
  const formatted = formatTry(value);
  return formatted.endsWith(',00') ? formatted.slice(0, -3) : formatted;
}

function formatAdjustmentTl(value: string | null | undefined): string {
  const formatted = formatWholeTry(value);
  return formatted === '—' ? formatted : `+${formatted.replace('₺', '')} TL`;
}

export function PervazCostTable({ rows, mode }: Props) {
  const decorative = mode === 'dekoratif';

  return (
    <table
      className={`cc-table cc-pervaz-table ${
        decorative ? 'cc-pervaz-table-decorative' : ''
      }`}
    >
      <caption className="cc-visually-hidden">
        Pervaz ölçü, maliyet ve satış fiyatları
      </caption>
      <thead>
        <tr>
          <th rowSpan={2} className="cc-col-size">
            Ölçü
          </th>
          <th rowSpan={2} className="cc-col-thickness">
            Kalınlık
          </th>
          <th colSpan={2}>Ana MDF</th>
          <th colSpan={2}>Kılçık</th>
          <th rowSpan={2} className="cc-th-result">
            MDF Toplam
          </th>
          <th colSpan={4}>Masraflar</th>
          <th colSpan={7}>Fiyat</th>
        </tr>
        <tr>
          <th className="cc-th-sub">NET</th>
          <th className="cc-th-sub">Maliyet</th>
          <th className="cc-th-sub">NET</th>
          <th className="cc-th-sub">Maliyet</th>
          <th className="cc-th-sub">Kesim</th>
          <th className="cc-th-sub">Tutkal</th>
          <th className="cc-th-sub">İşçilik</th>
          <th className="cc-th-sub">Toplam</th>
          <th className="cc-th-sub">Üretim</th>
          <th className="cc-th-sub">Kâr %</th>
          <th className="cc-th-sub">Kâr</th>
          {decorative ? (
            <>
              <th className="cc-th-sub">Dek. Fark %</th>
              <th className="cc-th-sub">Dek. Fark ₺</th>
            </>
          ) : (
            <>
              <th className="cc-th-sub">ROUNDUP</th>
              <th className="cc-th-sub">Düzeltme</th>
            </>
          )}
          <th className="cc-th-sub cc-pervaz-cash-col">Nakit Satış</th>
          <th className="cc-th-sub cc-pervaz-card-col">Kart/Taksit</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const ayarli =
            mode === 'ayarli'
              ? (row as AyarliPervazMdfRow)
              : null;
          const dekoratif = decorative
            ? (row as DekoratifPervazRow | DekoratifGenisKilcikRow)
            : null;

          return (
            <tr
              key={`${row.thicknessMm}-${row.widthMm}-${row.lengthMm}`}
              className={
                index > 0 && rows[index - 1].thicknessMm !== row.thicknessMm
                  ? 'cc-pervaz-row-group-start'
                  : undefined
              }
            >
              <td className="cc-col-size">
                {formatPieceSizeCm(row.widthMm, row.lengthMm)}
              </td>
              <td className="cc-col-thickness">{row.thicknessMm} mm</td>
              <td
                className="cc-qty"
                title={`${row.mainPiece.rawMaterialCode} · ${row.mainPiece.yieldSource}`}
              >
                {row.mainPiece.netQty}
              </td>
              <td
                className="cc-money"
                title={`${row.mainPiece.rawMaterialCode} · Tabaka ${formatTry(
                  row.mainPiece.sheetPrice,
                )}`}
              >
                {formatTry(row.mainPiece.unitCost)}
              </td>
              <td
                className="cc-qty"
                title={`${row.kilcik.rawMaterialCode} · ${row.kilcik.yieldSource}`}
              >
                {row.kilcik.netQty}
              </td>
              <td
                className="cc-money"
                title={`${row.kilcik.rawMaterialCode} · Tabaka ${formatTry(
                  row.kilcik.sheetPrice,
                )}`}
              >
                {formatTry(row.kilcik.unitCost)}
              </td>
              <td className="cc-money">
                <span className="cc-badge cc-badge-mdf">
                  {formatTry(row.totalMdfCost)}
                </span>
              </td>
              <td className="cc-money">{formatTry(row.extraCosts.cutting)}</td>
              <td className="cc-money">{formatTry(row.extraCosts.glue)}</td>
              <td className="cc-money">{formatTry(row.extraCosts.labor)}</td>
              <td className="cc-money">
                <span className="cc-badge cc-badge-expense">
                  {formatTry(row.extraCosts.total)}
                </span>
              </td>
              <td className="cc-money">
                <span className="cc-badge cc-badge-prod">
                  {formatTry(row.productionCost)}
                </span>
              </td>
              <td
                className="cc-qty"
                title={
                  row.pricing.profitRateSource === 'ROW_EXCEPTION'
                    ? 'Satıra özel kâr oranı'
                    : 'Ürün varsayılan kâr oranı'
                }
              >
                <span
                  className={
                    row.pricing.profitRateSource === 'ROW_EXCEPTION'
                      ? 'cc-rate-special'
                      : undefined
                  }
                >
                  {formatPercentRate(row.pricing.profitRate)}
                </span>
                {row.pricing.profitRateSource === 'ROW_EXCEPTION' ? (
                  <small className="cc-cell-note">Özel oran</small>
                ) : null}
              </td>
              <td className="cc-money">
                {formatTry(row.pricing.profitAmount)}
              </td>
              {dekoratif ? (
                <>
                  <td className="cc-qty">
                    {formatPercentRate(
                      dekoratif.pricing.decorativePremiumRate,
                    )}
                  </td>
                  <td
                    className="cc-money"
                    title={`Baz satış: ${formatTry(
                      dekoratif.pricing.baseSalePrice,
                    )}`}
                  >
                    {formatTry(
                      dekoratif.pricing.decorativePremiumAmount,
                    )}
                  </td>
                </>
              ) : (
                <>
                  <td
                    className="cc-money"
                    title={`Yuvarlama öncesi: ${formatTry(
                      ayarli?.pricing.priceBeforeRounding,
                    )}`}
                  >
                    <span className="cc-badge cc-badge-sale">
                      {formatWholeTry(ayarli?.pricing.roundedSalePrice)}
                    </span>
                  </td>
                  <td className="cc-qty">
                    {ayarli?.pricing.adjustmentSource === 'ROW_EXCEPTION' &&
                    ayarli.pricing.adjustmentAmount != null ? (
                      <span className="cc-adjustment">
                        {formatAdjustmentTl(
                          ayarli.pricing.adjustmentAmount,
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </>
              )}
              <td
                className="cc-money cc-pervaz-cash-col"
                title={
                  dekoratif
                    ? `Yuvarlama öncesi: ${formatTry(
                        dekoratif.pricing.priceBeforeRounding,
                      )}`
                    : undefined
                }
              >
                <span className="cc-badge cc-badge-cash">
                  {formatWholeTry(row.pricing.publishedSalePrice)}
                </span>
              </td>
              <td className="cc-money cc-pervaz-card-col">
                {row.pricing.cardSaleAvailable && row.pricing.cardSalePrice != null ? (
                  <span className="cc-badge cc-badge-card">
                    {formatWholeTry(row.pricing.cardSalePrice)}
                  </span>
                ) : (
                  <span className="cc-card-unavailable">Yok</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
