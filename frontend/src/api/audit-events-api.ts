import { apiRequest } from '../lib/api';

export type AuditEventListItem = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  actor: string;
  createdAt: string;
  summary: string;
};

export type AuditEventListResponse = {
  items: AuditEventListItem[];
};

export function listAuditEvents(limit = 8): Promise<AuditEventListResponse> {
  return apiRequest<AuditEventListResponse>(
    `/audit-events?limit=${encodeURIComponent(String(limit))}`,
  );
}
