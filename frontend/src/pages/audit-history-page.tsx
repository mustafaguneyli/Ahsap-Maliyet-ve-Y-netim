import { useEffect, useState } from 'react';
import { listAuditEvents, type AuditEventListItem } from '../api/audit-events-api';
import { ApiError } from '../lib/api';
import './control-panel-page.css';

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

export function AuditHistoryPage() {
  const [events, setEvents] = useState<AuditEventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await listAuditEvents(50);
        if (!cancelled) setEvents(response.items);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Değişiklik geçmişi yüklenemedi.',
          );
        }
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
      <article className="cp-card">
        <h2>Değişiklik Geçmişi</h2>
        {loading ? <p className="cp-muted">Kayıtlar yükleniyor…</p> : null}
        {error ? <p className="cp-error">{error}</p> : null}
        {!loading && !error && events.length === 0 ? (
          <p className="cp-muted">Henüz değişiklik kaydı yok.</p>
        ) : null}
        {events.length > 0 ? (
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
        ) : null}
      </article>
    </section>
  );
}
