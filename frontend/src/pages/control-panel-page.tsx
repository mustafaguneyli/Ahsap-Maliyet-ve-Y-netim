import { useEffect, useState } from 'react';
import {
  fetchAyarliPervazMdfCosts,
  fetchCitaCostList,
  fetchDekoratifGenisKilcikCosts,
  fetchDekoratifPervazCosts,
  fetchDoorFrameMdfCosts,
  fetchSupurgelikCosts,
  SUPURGELIK_PRODUCT_CODES,
  SupurgelikProductCode,
} from '../api/cost-calculation-api';
import {
  ExtraCostListResponse,
  ExtraCostProductGroup,
  getSupurgelikPpWrapping,
  listExtraCosts,
} from '../api/extra-costs-api';
import { listAuditEvents, type AuditEventListItem } from '../api/audit-events-api';
import {
  listProductGroups,
  type ProductGroupSummary,
} from '../api/product-groups-api';
import { ApiError } from '../lib/api';
import type { AppNavigation, CostSettingsGroup } from '../lib/app-navigation';
import { extraCostTypeLabel } from '../lib/display-labels';
import { friendlyMaterialPriceError, type MaterialPriceType } from '../lib/material-price-type';
import { formatSheetSizeCm } from '../lib/length';
import './control-panel-page.css';

export function ControlPanelPage(props: {
  onNavigate: (target: AppNavigation) => void;
}) {
  const [groups, setGroups] = useState<ProductGroupSummary[]>([]);
  const [statuses, setStatuses] = useState<GroupSourceStatus[]>([]);
  const [events, setEvents] = useState<AuditEventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [groupResponse, auditResponse] = await Promise.all([
          listProductGroups(),
          listAuditEvents(8),
        ]);
        if (cancelled) return;
        setGroups(groupResponse.items);
        setEvents(auditResponse.items);

        const nextStatuses = await Promise.all(
          groupResponse.items.map((group) => loadGroupStatus(group)),
        );
        if (cancelled) return;
        setStatuses(nextStatuses);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : 'Kontrol paneli verileri yüklenemedi.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="cp-page">
      {error ? <p className="cp-error">{error}</p> : null}
      {loading ? <p className="cp-muted">Güncel durum yükleniyor…</p> : null}

      <div className="cp-top">
        <article className="cp-card">
          <h2>Ürün Grupları</h2>
          {groups.length === 0 && !loading ? (
            <p className="cp-muted">Aktif ürün grubu bulunamadı.</p>
          ) : (
            <ul className="cp-group-list">
              {groups.map((group) => (
                <li key={group.id} className="cp-group-item">
                  <span className="cp-group-name">{group.name}</span>
                  <span className="cp-group-count">
                    {group.activeProductCount} aktif ürün
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="cp-card">
          <h2>Kaynak Durumu</h2>
          {statuses.length === 0 && !loading ? (
            <p className="cp-muted">Kaynak durumu henüz değerlendirilemedi.</p>
          ) : (
            <ul className="cp-status-list">
              {statuses.map((status) => (
                <li key={status.groupId} className="cp-status-item">
                  <div className="cp-status-head">
                    <span className="cp-group-name">{status.groupName}</span>
                    <span className={`cp-badge cp-badge-${status.level}`}>
                      {badgeLabel(status.level)}
                    </span>
                  </div>
                  {status.issues.length > 0 ? (
                    <div className="cp-issue-groups">
                      {(['cost', 'sale'] as const).map((kind) => {
                        const items = status.issues.filter((issue) => issue.kind === kind);
                        if (items.length === 0) return null;
                        return (
                          <div key={kind}>
                            <p className="cp-issue-kind">
                              {kind === 'cost' ? 'Maliyet' : 'Satış'}
                            </p>
                            <ul className="cp-issue-list">
                              {items.map((issue) => (
                                <li key={issue.text}>
                                  <span>{issue.text}</span>
                                  {issue.action ? (
                                    <button
                                      type="button"
                                      className="cp-link-btn"
                                      onClick={() => props.onNavigate(issue.action!.target)}
                                    >
                                      {issue.action.label}
                                    </button>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="cp-muted">Hesabı engelleyen eksik kaynak yok.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <article className="cp-card">
        <div className="cp-card-head">
          <h2>Son Değişiklikler</h2>
          <button
            type="button"
            className="cp-link-btn"
            onClick={() => props.onNavigate({ page: 'audit' })}
          >
            Tüm Değişiklikleri Gör
          </button>
        </div>
        {events.length === 0 && !loading ? (
          <p className="cp-muted">Henüz değişiklik kaydı yok.</p>
        ) : (
          <ul className="cp-event-list">
            {events.map((event) => (
              <li key={event.id} className="cp-event-item">
                <span className="cp-event-summary">{event.summary}</span>
                <time className="cp-event-time" dateTime={event.createdAt}>
                  {formatDateTimeTr(event.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="cp-card">
        <h2>Hızlı İşlemler</h2>
        <div className="cp-actions">
          <button
            type="button"
            className="cp-action"
            onClick={() => props.onNavigate({ page: 'cost-calculation' })}
          >
            Maliyet Hesapla
          </button>
          <button
            type="button"
            className="cp-action"
            onClick={() => props.onNavigate({ page: 'price-list' })}
          >
            Fiyat Listesi Oluştur
          </button>
          <button
            type="button"
            className="cp-action"
            onClick={() => props.onNavigate({ page: 'materials' })}
          >
            Ham Madde Fiyatlarını Güncelle
          </button>
          <button
            type="button"
            className="cp-action"
            onClick={() => props.onNavigate({ page: 'yields' })}
          >
            NET Üretim Adetlerini Gör
          </button>
        </div>
      </article>
    </section>
  );
}

type SourceLevel = 'ok' | 'missing' | 'attention';
type IssueKind = 'cost' | 'sale';

type SourceIssue = {
  text: string;
  level: SourceLevel;
  kind: IssueKind;
  action?: {
    label: string;
    target: AppNavigation;
  };
};

type GroupSourceStatus = {
  groupId: string;
  groupName: string;
  level: SourceLevel;
  issues: SourceIssue[];
};

const EXTRA_COST_GROUPS: ExtraCostProductGroup[] = [
  'door_frame',
  'PERVAZ',
  'SUPURGELIK',
  'CITA',
];

const PRICE_TYPES: MaterialPriceType[] = ['CASH', 'CARD_INSTALLMENT'];

const EXTRA_COST_FALLBACK_NAMES: Record<string, string> = {
  CUTTING: extraCostTypeLabel('CUTTING'),
  GLUE: extraCostTypeLabel('GLUE'),
  LABOR: extraCostTypeLabel('LABOR'),
  OTHER: extraCostTypeLabel('OTHER'),
  PP_WRAPPING: extraCostTypeLabel('PP_WRAPPING'),
};

const PP_MISSING_TEXT = 'PP sarma maliyeti tanımlı değil.';
const CARD_RATE_MISSING_TEXT = 'Kart/taksit satış oranı tanımlı değil.';

function extraCostLabel(
  code: string,
  extras: ExtraCostListResponse | null,
): string {
  const fromApi = extras?.items.find((item) => item.typeCode === code)?.typeName;
  return fromApi ?? EXTRA_COST_FALLBACK_NAMES[code] ?? code;
}

function formatThickness(value: string | number): string {
  return String(value).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function formatDateTimeTr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function badgeLabel(level: SourceLevel): string {
  if (level === 'ok') return 'Tamam';
  if (level === 'missing') return 'Eksik Tanım';
  return 'Dikkat Gerekiyor';
}

function worseLevel(a: SourceLevel, b: SourceLevel): SourceLevel {
  const rank = { ok: 0, missing: 1, attention: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function isExtraCostGroup(code: string): code is ExtraCostProductGroup {
  return EXTRA_COST_GROUPS.includes(code as ExtraCostProductGroup);
}

function isCostSettingsGroup(code: string): code is CostSettingsGroup {
  return (
    code === 'door_frame' ||
    code === 'PERVAZ' ||
    code === 'SUPURGELIK' ||
    code === 'CITA'
  );
}

function isDoorFrameVariant(code: string): code is '34_MM' | '30_MM' {
  return code === '34_MM' || code === '30_MM';
}

function isSupurgelikProductCode(code: string): code is SupurgelikProductCode {
  return (SUPURGELIK_PRODUCT_CODES as readonly string[]).includes(code);
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

function settledError(result: PromiseSettledResult<unknown>): string | null {
  if (result.status !== 'rejected') return null;
  const reason = result.reason;
  const message =
    reason instanceof ApiError
      ? reason.message
      : reason instanceof Error
        ? reason.message
        : 'Kaynak durumu alınamadı.';
  return friendlyMaterialPriceError(message);
}

function settingsAction(group: CostSettingsGroup): SourceIssue['action'] {
  return {
    label: 'Maliyet Ayarları',
    target: {
      page: 'cost-calculation',
      costGroup: group,
      openCostSettings: true,
    },
  };
}

function purchasePriceText(
  thickness: string | number,
  sheetWidthMm: number,
  sheetLengthMm: number,
  priceType: MaterialPriceType,
): string {
  const kind = priceType === 'CASH' ? 'nakit alış fiyatı' : 'kart/taksitli alış fiyatı';
  return `${formatThickness(thickness)} mm ${formatSheetSizeCm(sheetWidthMm, sheetLengthMm)} MDF ${kind} tanımlı değil.`;
}

type ListedRow = {
  statusCode?: string | null;
  errorCode?: string | null;
  missingExtraCosts?: string[];
  thicknessMm?: string | number;
  rawMaterial?: {
    code: string;
    thicknessMm: string | number;
    sheetWidthMm: number;
    sheetLengthMm: number;
  };
  pricing?: {
    statusCode?: string | null;
    cardMarkupRate?: string | null;
    publishedCashPrice?: string | null;
    publishedCardPrice?: string | null;
    publishedSalePrice?: string | null;
    cardSalePrice?: string | null;
  } | null;
};

function listedRows(value: unknown): ListedRow[] {
  if (!value || typeof value !== 'object' || !('rows' in value)) return [];
  const rows = (value as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as ListedRow[]) : [];
}

function envelopeCardRate(value: unknown): string | null | undefined {
  if (!value || typeof value !== 'object' || !('cardMarkupRate' in value)) {
    return undefined;
  }
  return (value as { cardMarkupRate: string | null }).cardMarkupRate;
}

function collectCalculatedIssues(
  value: unknown,
  priceType: MaterialPriceType,
  group: CostSettingsGroup,
): SourceIssue[] {
  const issues: SourceIssue[] = [];
  let cardRateMissing = envelopeCardRate(value) === null;

  for (const row of listedRows(value)) {
    const status = row.errorCode ?? row.statusCode ?? row.pricing?.statusCode ?? null;
    if (status === 'CITA_PUBLISHED_PRICE_MISSING') continue;

    if (status === 'RAW_MATERIAL_PRICE_MISSING' && row.rawMaterial) {
      issues.push({
        text: purchasePriceText(
          row.rawMaterial.thicknessMm,
          row.rawMaterial.sheetWidthMm,
          row.rawMaterial.sheetLengthMm,
          priceType,
        ),
        level: 'missing',
        kind: 'cost',
        action: {
          label: 'Ham Maddeler',
          target: {
            page: 'materials',
            materialSearch: row.rawMaterial.code,
          },
        },
      });
    }

    if (status === 'DECORATIVE_RATE_MISSING') {
      const thickness = row.thicknessMm ?? row.rawMaterial?.thicknessMm;
      if (thickness != null) {
        issues.push({
          text: `${formatThickness(thickness)} mm dekoratif maliyet oranı tanımlı değil.`,
          level: 'missing',
          kind: 'sale',
          action: settingsAction('SUPURGELIK'),
        });
      }
    }

    if (status === 'PP_WRAPPING_COST_MISSING') {
      issues.push({
        text: PP_MISSING_TEXT,
        level: 'missing',
        kind: 'cost',
        action: settingsAction('SUPURGELIK'),
      });
    }

    if (status === 'EXTRA_COST_MISSING') {
      for (const code of row.missingExtraCosts ?? []) {
        issues.push({
          text: `${extraCostLabel(code, null)} tanımlı değil.`,
          level: 'missing',
          kind: 'cost',
          action: settingsAction(group),
        });
      }
    }

    const cash =
      row.pricing?.publishedCashPrice ?? row.pricing?.publishedSalePrice ?? null;
    const card = row.pricing?.publishedCardPrice ?? row.pricing?.cardSalePrice ?? null;
    if (cash != null && card == null && row.pricing?.cardMarkupRate == null) {
      cardRateMissing = true;
    }
  }

  if (cardRateMissing) {
    issues.push({
      text: CARD_RATE_MISSING_TEXT,
      level: 'missing',
      kind: 'sale',
      action: {
        label: 'Fiyatlandırma Ayarları',
        target: { page: 'pricing' },
      },
    });
  }

  return issues;
}

async function loadGroupStatus(
  group: ProductGroupSummary,
): Promise<GroupSourceStatus> {
  const issues: SourceIssue[] = [];
  let level: SourceLevel = 'ok';
  const settingsGroup = isCostSettingsGroup(group.code) ? group.code : null;

  const extraResult = isExtraCostGroup(group.code)
    ? await Promise.allSettled([listExtraCosts(group.code)])
    : null;
  const extras = extraResult ? settledValue(extraResult[0]) : null;
  const extraError = extraResult ? settledError(extraResult[0]) : null;
  if (extraError) {
    issues.push({ text: extraError, level: 'attention', kind: 'cost' });
    level = 'attention';
  } else if (extras && settingsGroup) {
    for (const item of extras.items) {
      if (item.amount != null) continue;
      issues.push({
        text:
          item.typeCode === 'PP_WRAPPING'
            ? PP_MISSING_TEXT
            : `${item.typeName} tanımlı değil.`,
        level: 'missing',
        kind: 'cost',
        action: settingsAction(settingsGroup),
      });
    }
  }

  const costJobs: Array<Promise<unknown>> = [];
  const jobTypes: MaterialPriceType[] = [];
  const pushJob = (job: Promise<unknown>, priceType: MaterialPriceType) => {
    costJobs.push(job);
    jobTypes.push(priceType);
  };

  if (group.code === 'door_frame') {
    for (const product of group.products) {
      if (!isDoorFrameVariant(product.code)) continue;
      for (const priceType of PRICE_TYPES) {
        pushJob(fetchDoorFrameMdfCosts(product.code, priceType), priceType);
      }
    }
  } else if (group.code === 'CITA') {
    for (const priceType of PRICE_TYPES) {
      pushJob(fetchCitaCostList(priceType), priceType);
    }
  } else if (group.code === 'SUPURGELIK') {
    for (const product of group.products) {
      if (!isSupurgelikProductCode(product.code)) continue;
      for (const priceType of PRICE_TYPES) {
        pushJob(fetchSupurgelikCosts(product.code, priceType), priceType);
      }
    }
  } else if (group.code === 'PERVAZ') {
    for (const product of group.products) {
      for (const priceType of PRICE_TYPES) {
        if (product.code === 'AYARLI_PERVAZ') {
          pushJob(fetchAyarliPervazMdfCosts(priceType), priceType);
        } else if (product.code === 'DEKORATIF_PERVAZ') {
          pushJob(fetchDekoratifPervazCosts(priceType), priceType);
        } else if (product.code === 'DEKORATIF_PERVAZ_GENIS_KILCIK') {
          pushJob(fetchDekoratifGenisKilcikCosts(priceType), priceType);
        }
      }
    }
  }

  if (group.code === 'SUPURGELIK') {
    const ppResult = await Promise.allSettled([getSupurgelikPpWrapping()]);
    const pp = settledValue(ppResult[0]);
    const ppError = settledError(ppResult[0]);
    if (ppError) {
      issues.push({ text: ppError, level: 'attention', kind: 'cost' });
      level = worseLevel(level, 'attention');
    } else if (pp?.items.some((item) => item.amount == null)) {
      issues.push({
        text: PP_MISSING_TEXT,
        level: 'missing',
        kind: 'cost',
        action: settingsAction('SUPURGELIK'),
      });
    }
  }

  if (costJobs.length > 0 && settingsGroup) {
    const costResults = await Promise.allSettled(costJobs);
    costResults.forEach((result, index) => {
      const error = settledError(result);
      if (error) {
        issues.push({ text: error, level: 'attention', kind: 'cost' });
        level = worseLevel(level, 'attention');
        return;
      }
      const value = settledValue(result);
      if (!value) return;
      issues.push(
        ...collectCalculatedIssues(value, jobTypes[index], settingsGroup),
      );
    });
  }

  const unique = new Map<string, SourceIssue>();
  for (const issue of issues) {
    const current = unique.get(issue.text);
    if (!current || worseLevel(issue.level, current.level) === issue.level) {
      unique.set(issue.text, issue);
    }
  }
  const uniqueIssues = [...unique.values()];
  for (const issue of uniqueIssues) {
    level = worseLevel(level, issue.level);
  }

  return {
    groupId: group.id,
    groupName: group.name,
    level: uniqueIssues.length === 0 ? 'ok' : level,
    issues: uniqueIssues,
  };
}
