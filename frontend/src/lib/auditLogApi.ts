import api from './api';
import type { AuditAction } from './auditLogTypes';

export type AuditLogEntry = {
  id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  performedById: string | null;
  performedByEmail: string | null;
  performedBy: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
  branchId: string | null;
  branch: { id: string; name: string } | null;
  changes: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  recipientName?: string | null;
  recipientEmail?: string | null;
};

export type AuditLogDetail = AuditLogEntry & {
  userAgent: string | null;
  relatedEntity: {
    linkPath: string;
    label: string;
    snapshot: Record<string, unknown>;
  } | null;
};

export type ListAuditLogsResponse = {
  items: AuditLogEntry[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type ListAuditLogsParams = {
  page?: number;
  pageSize?: number;
  fromDate?: string;
  toDate?: string;
  action?: AuditAction;
  entityType?: string;
  search?: string;
};

export async function fetchAuditLogs(params: ListAuditLogsParams = {}) {
  const { data } = await api.get<ListAuditLogsResponse>('/audit-logs', { params });
  return data;
}

export async function fetchAuditEntityTypes() {
  const { data } = await api.get<{ entityTypes: string[] }>('/audit-logs/entity-types');
  return data.entityTypes;
}

export async function fetchAuditLogById(id: string) {
  const { data } = await api.get<{ entry: AuditLogDetail }>(`/audit-logs/${encodeURIComponent(id)}`);
  if (!data.entry) {
    throw new Error('Activity record not found');
  }
  return data.entry;
}
