import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchAuditLogById, type AuditLogDetail } from '../lib/auditLogApi';
import { formatCurrency } from '../lib/currency';

const formatDateTime = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const formatChangeValue = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

const ActivityHistoryDetail: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const locale = i18n.language === 'ckb' ? 'ckb-IQ' : 'en-US';

  const [entry, setEntry] = useState<AuditLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setError(t('activityHistory.detail.missingId'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    void fetchAuditLogById(id)
      .then(setEntry)
      .catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : t('activityHistory.detail.loadError');
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [id, t]);

  const changeRows = useMemo(() => {
    if (!entry?.changes || typeof entry.changes !== 'object') return [];
    return Object.entries(entry.changes as Record<string, unknown>);
  }, [entry]);

  const snapshotRows = useMemo(() => {
    if (!entry?.relatedEntity?.snapshot) return [];
    return Object.entries(entry.relatedEntity.snapshot);
  }, [entry]);

  const summary = entry
    ? t('activityHistory.entrySummary', {
        actor:
          entry.performedBy?.name ||
          entry.performedByEmail ||
          t('activityHistory.unknownUser'),
        action: t(`activityHistory.action.${entry.action}`, { defaultValue: entry.action }),
        entity: t(`activityHistory.entity.${entry.entityType}`, {
          defaultValue: entry.entityType,
        }),
        entityId: entry.entityId,
      })
    : '';

  const renderSnapshotValue = (key: string, value: unknown) => {
    if (key === 'totalPrice' && (typeof value === 'string' || typeof value === 'number')) {
      return formatCurrency(Number(value));
    }
    return formatChangeValue(value);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/activity-history')}
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
        >
          {t('activityHistory.detail.back')}
        </button>
      </div>

      {loading && <p className="text-gray-600">{t('activityHistory.loading')}</p>}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {entry && !loading && (
        <>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('activityHistory.detail.title')}</h1>
            <p className="mt-2 text-gray-800">{summary}</p>
            <p className="mt-1 text-sm text-gray-500">{formatDateTime(entry.createdAt, locale)}</p>
          </div>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t('activityHistory.detail.performedBy')}
            </h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">{t('activityHistory.detail.name')}</dt>
                <dd className="font-medium text-gray-900">
                  {entry.performedBy?.name ?? t('activityHistory.unknownUser')}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('activityHistory.detail.email')}</dt>
                <dd className="break-all font-medium text-gray-900">
                  {entry.performedBy?.email ?? entry.performedByEmail ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('activityHistory.detail.role')}</dt>
                <dd className="font-medium text-gray-900">{entry.performedBy?.role ?? '—'}</dd>
              </div>
              {entry.branch?.name && (
                <div>
                  <dt className="text-gray-500">{t('activityHistory.detail.branch')}</dt>
                  <dd className="font-medium text-gray-900">{entry.branch.name}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t('activityHistory.detail.actionInfo')}
            </h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">{t('activityHistory.actionFilter')}</dt>
                <dd className="font-medium text-gray-900">
                  {t(`activityHistory.action.${entry.action}`, { defaultValue: entry.action })}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('activityHistory.entityFilter')}</dt>
                <dd className="font-medium text-gray-900">
                  {t(`activityHistory.entity.${entry.entityType}`, {
                    defaultValue: entry.entityType,
                  })}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-gray-500">{t('activityHistory.detail.recordId')}</dt>
                <dd className="break-all font-mono text-sm text-gray-900">{entry.entityId}</dd>
              </div>
              {entry.ipAddress && (
                <div>
                  <dt className="text-gray-500">{t('activityHistory.detail.ip')}</dt>
                  <dd className="font-medium text-gray-900">{entry.ipAddress}</dd>
                </div>
              )}
            </dl>
          </section>

          {changeRows.length > 0 && (
            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {t('activityHistory.detail.changes')}
              </h2>
              <dl className="space-y-3">
                {changeRows.map(([key, value]) => (
                  <div key={key} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {key}
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap break-all font-mono text-sm text-gray-800">
                      {formatChangeValue(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {entry.relatedEntity && (
            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  {t('activityHistory.detail.relatedRecord')}
                </h2>
                <Link
                  to={entry.relatedEntity.linkPath}
                  state={{ returnTo: `/activity-history/${entry.id}` }}
                  className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  {t('activityHistory.detail.openRecord')}
                </Link>
              </div>
              {snapshotRows.length > 0 ? (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  {snapshotRows.map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-gray-500">{key}</dt>
                      <dd className="break-all font-medium text-gray-900">
                        {renderSnapshotValue(key, value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-gray-600">{entry.relatedEntity.label}</p>
              )}
            </section>
          )}

          {!changeRows.length && !entry.relatedEntity && (
            <p className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
              {t('activityHistory.detail.noExtraData')}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default ActivityHistoryDetail;
