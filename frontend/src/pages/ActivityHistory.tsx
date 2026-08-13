import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getCurrentUser } from '../lib/auth';
import { fetchAuditEntityTypes, fetchAuditLogs, type AuditLogEntry } from '../lib/auditLogApi';
import { AUDIT_ACTIONS } from '../lib/auditLogTypes';

type DateBucket = {
  key: string;
  label: string;
  entries: AuditLogEntry[];
};

const formatDateKey = (iso: string) => iso.slice(0, 10);

const formatTime = (iso: string, locale: string) =>
  new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const formatDayLabel = (key: string, locale: string) => {
  const date = new Date(`${key}T12:00:00`);
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const ActivityHistory: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = getCurrentUser();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const locale = i18n.language === 'ckb' ? 'ckb-IQ' : 'en-US';

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [search, setSearch] = useState('');

  const loadPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError('');
      try {
        const data = await fetchAuditLogs({
          page: pageNum,
          pageSize: 100,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          action: action ? (action as AuditLogEntry['action']) : undefined,
          entityType: entityType || undefined,
          search: search.trim() || undefined,
        });
        setEntries((prev) => (append ? [...prev, ...data.items] : data.items));
        setPage(data.pagination.page);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : t('activityHistory.loadError');
        setError(msg);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [action, entityType, fromDate, search, t, toDate]
  );

  useEffect(() => {
    void loadPage(1, false);
  }, [loadPage]);

  useEffect(() => {
    void fetchAuditEntityTypes()
      .then(setEntityTypes)
      .catch(() => setEntityTypes([]));
  }, []);

  const buckets = useMemo(() => {
    const map = new Map<string, AuditLogEntry[]>();
    for (const entry of entries) {
      const key = formatDateKey(entry.createdAt);
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, bucketEntries]) => ({
        key,
        label: formatDayLabel(key, locale),
        entries: bucketEntries,
      })) satisfies DateBucket[];
  }, [entries, locale]);

  const describeEntry = (entry: AuditLogEntry) => {
    const actor =
      entry.performedBy?.name ||
      entry.performedByEmail ||
      t('activityHistory.unknownUser');
    const entityLabel = t(`activityHistory.entity.${entry.entityType}`, {
      defaultValue: entry.entityType,
    });
    const actionLabel = t(`activityHistory.action.${entry.action}`, {
      defaultValue: entry.action,
    });
    return t('activityHistory.entrySummary', {
      actor,
      action: actionLabel,
      entity: entityLabel,
      entityId: entry.entityId,
    });
  };

  const detailLines = (entry: AuditLogEntry): string[] => {
    const lines: string[] = [];
    const changes = entry.changes as Record<string, unknown> | null;
    if (!changes || typeof changes !== 'object') return lines;
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === null) continue;
      const rendered =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
      lines.push(`${key}: ${rendered}`);
    }
    return lines.slice(0, 3);
  };

  const openDetail = (entryId: string) => {
    navigate(`/activity-history/${entryId}`);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('activityHistory.title')}</h1>
        <p className="mt-1 text-sm text-gray-600">{t('activityHistory.subtitle')}</p>
        {!isAdmin && (
          <p className="mt-2 text-sm text-amber-800">{t('activityHistory.selfOnlyNote')}</p>
        )}
      </div>

      <div className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">{t('activityHistory.fromDate')}</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">{t('activityHistory.toDate')}</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">{t('activityHistory.actionFilter')}</span>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          >
            <option value="">{t('activityHistory.allActions')}</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {t(`activityHistory.action.${a}`, { defaultValue: a })}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">{t('activityHistory.entityFilter')}</span>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          >
            <option value="">{t('activityHistory.allEntities')}</option>
            {entityTypes.map((type) => (
              <option key={type} value={type}>
                {t(`activityHistory.entity.${type}`, { defaultValue: type })}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium text-gray-700">{t('activityHistory.search')}</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('activityHistory.searchPlaceholder')}
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void loadPage(1, false)}
            className="w-full rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            {t('activityHistory.applyFilters')}
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        {t('activityHistory.totalCount', { count: total })}
      </p>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-600">{t('activityHistory.loading')}</p>
      ) : buckets.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-gray-600">
          {t('activityHistory.empty')}
        </p>
      ) : (
        <div className="space-y-8">
          {buckets.map((bucket) => (
            <section key={bucket.key}>
              <h2 className="mb-3 border-b border-gray-200 pb-2 text-lg font-semibold text-gray-900">
                {bucket.label}
              </h2>
              <ul className="space-y-3">
                {bucket.entries.map((entry) => {
                  const details = detailLines(entry);
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => openDetail(entry.id)}
                        className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-gray-400 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black/20"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="font-medium text-gray-900">{describeEntry(entry)}</p>
                          <time className="shrink-0 text-sm tabular-nums text-gray-500">
                            {formatTime(entry.createdAt, locale)}
                          </time>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                            {entry.performedBy?.role ?? '—'}
                          </span>
                          {entry.branch?.name && (
                            <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-800">
                              {entry.branch.name}
                            </span>
                          )}
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-900">
                            {t('activityHistory.tapForDetail')}
                          </span>
                        </div>
                        {details.length > 0 && (
                          <ul className="mt-2 space-y-1 text-sm text-gray-600">
                            {details.map((line) => (
                              <li key={line} className="break-all">
                                {line}
                              </li>
                            ))}
                          </ul>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {page < totalPages && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadPage(page + 1, true)}
            className="rounded-xl border border-gray-300 bg-white px-6 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingMore ? t('activityHistory.loading') : t('activityHistory.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
};

export default ActivityHistory;
