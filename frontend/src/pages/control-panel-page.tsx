import { useEffect, useState } from 'react';
import {
  CitaCostListResponse,
  fetchAyarliPervazMdfCosts,
  fetchCitaCostList,
  fetchDekoratifGenisKilcikCosts,
  fetchDekoratifPervazCosts,
  fetchDoorFrameMdfCosts,
  fetchSupurgelikCosts,
  SUPURGELIK_PRODUCT_CODES,
  SupurgelikCostsResponse,
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
import './control-panel-page.css';

export function ControlPanelPage(props: {
  onNavigate: (
    page: 'materials' | 'yields' | 'cost-calculation' | 'audit',
  ) => void;
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
                    <ul className="cp-issue-list">
                      {status.issues.map((issue) => (
                        <li key={issue.text}>{issue.text}</li>
                      ))}
                    </ul>
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
            onClick={() => props.onNavigate('audit')}
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
            onClick={() => props.onNavigate('cost-calculation')}
          >
            Maliyet Hesapla
          </button>
          <button
            type="button"
            className="cp-action"
            onClick={() => props.onNavigate('materials')}
          >
            Ham Madde Fiyatlarını Güncelle
          </button>
          <button
            type="button"
            className="cp-action"
            onClick={() => props.onNavigate('yields')}
          >
            NET Üretim Adetlerini Gör
          </button>
        </div>
      </article>
    </section>
  );
}

type SourceLevel = 'ok' | 'missing' | 'attention';

type SourceIssue = {
  text: string;
  level: SourceLevel;
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

const IGNORED_STATUS_CODES = new Set(['CITA_PUBLISHED_PRICE_MISSING']);

const EXTRA_COST_FALLBACK_NAMES: Record<string, string> = {
  CUTTING: 'Kesim',
  GLUE: 'Tutkal',
  LABOR: 'İşçilik',
  OTHER: 'Diğer',
  PP_WRAPPING: 'PP Sarma',
};

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
  if (reason instanceof ApiError) return reason.message;
  if (reason instanceof Error) return reason.message;
  return 'Kaynak durumu alınamadı.';
}

function collectCitaIssues(
  list: CitaCostListResponse,
  extras: ExtraCostListResponse | null,
): SourceIssue[] {
  const issues: SourceIssue[] = [];
  const extraMissing = new Set<string>();
  const priceMissing = new Set<string>();

  for (const row of list.rows) {
    if (row.statusCode === 'RAW_MATERIAL_PRICE_MISSING') {
      priceMissing.add(
        `${formatThickness(row.rawMaterial.thicknessMm)} mm MDF fiyatı tanımlı değil`,
      );
    }
    if (row.statusCode === 'EXTRA_COST_MISSING') {
      for (const code of row.missingExtraCosts) {
        extraMissing.add(`${extraCostLabel(code, extras)} tanımlı değil`);
      }
    }
  }

  for (const text of extraMissing) issues.push({ text, level: 'missing' });
  for (const text of priceMissing) issues.push({ text, level: 'missing' });
  return issues;
}

function collectSupurgelikIssues(list: SupurgelikCostsResponse): SourceIssue[] {
  const unique = new Set<string>();
  for (const row of list.rows) {
    const code = row.errorCode ?? row.pricing.statusCode ?? null;
    if (!code || IGNORED_STATUS_CODES.has(code)) continue;
    if (code === 'RAW_MATERIAL_PRICE_MISSING') {
      unique.add(
        `${formatThickness(row.rawMaterial.thicknessMm)} mm MDF fiyatı tanımlı değil`,
      );
      continue;
    }
    if (code === 'DECORATIVE_RATE_MISSING') {
      unique.add('Dekoratif fark tanımlı değil');
      continue;
    }
    if (code === 'PP_WRAPPING_COST_MISSING') {
      unique.add('PP Sarma tanımlı değil');
    }
  }
  return [...unique].map((text) => ({ text, level: 'missing' as const }));
}

function extrasIssues(extras: ExtraCostListResponse | null): SourceIssue[] {
  if (!extras) return [];
  return extras.items
    .filter((item) => item.amount == null)
    .map((item) => ({
      text: `${item.typeName} tanımlı değil`,
      level: 'missing' as const,
    }));
}

async function loadGroupStatus(
  group: ProductGroupSummary,
): Promise<GroupSourceStatus> {
  const issues: SourceIssue[] = [];
  let level: SourceLevel = 'ok';

  const extraResult = isExtraCostGroup(group.code)
    ? await Promise.allSettled([listExtraCosts(group.code)])
    : null;
  const extras = extraResult ? settledValue(extraResult[0]) : null;
  const extraError = extraResult ? settledError(extraResult[0]) : null;
  if (extraError) {
    issues.push({ text: extraError, level: 'attention' });
    level = 'attention';
  } else {
    issues.push(...extrasIssues(extras));
  }

  const costJobs: Array<Promise<unknown>> = [];
  const citaIndex = { value: -1 };
  const supurgelikIndexes: number[] = [];

  if (group.code === 'door_frame') {
    for (const product of group.products) {
      if (isDoorFrameVariant(product.code)) {
        costJobs.push(fetchDoorFrameMdfCosts(product.code));
      }
    }
  } else if (group.code === 'CITA') {
    citaIndex.value = costJobs.length;
    costJobs.push(fetchCitaCostList());
  } else if (group.code === 'SUPURGELIK') {
    for (const product of group.products) {
      if (isSupurgelikProductCode(product.code)) {
        supurgelikIndexes.push(costJobs.length);
        costJobs.push(fetchSupurgelikCosts(product.code));
      }
    }
  } else if (group.code === 'PERVAZ') {
    for (const product of group.products) {
      if (product.code === 'AYARLI_PERVAZ') {
        costJobs.push(fetchAyarliPervazMdfCosts());
      } else if (product.code === 'DEKORATIF_PERVAZ') {
        costJobs.push(fetchDekoratifPervazCosts());
      } else if (product.code === 'DEKORATIF_PERVAZ_GENIS_KILCIK') {
        costJobs.push(fetchDekoratifGenisKilcikCosts());
      }
    }
  }

  if (group.code === 'SUPURGELIK') {
    const ppResult = await Promise.allSettled([getSupurgelikPpWrapping()]);
    const pp = settledValue(ppResult[0]);
    const ppError = settledError(ppResult[0]);
    if (ppError) {
      issues.push({ text: ppError, level: 'attention' });
      level = worseLevel(level, 'attention');
    } else {
      issues.push(...extrasIssues(pp));
    }
  }

  if (costJobs.length > 0) {
    const costResults = await Promise.allSettled(costJobs);
    costResults.forEach((result, index) => {
      const error = settledError(result);
      if (error) {
        issues.push({ text: error, level: 'attention' });
        level = worseLevel(level, 'attention');
        return;
      }
      const value = settledValue(result);
      if (index === citaIndex.value && value) {
        issues.push(...collectCitaIssues(value as CitaCostListResponse, extras));
      }
      if (supurgelikIndexes.includes(index) && value) {
        issues.push(...collectSupurgelikIssues(value as SupurgelikCostsResponse));
      }
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
