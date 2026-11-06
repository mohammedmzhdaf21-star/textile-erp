import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../lib/currency';
import { getColorLabel } from '../lib/colorLabels';
import { BRANCH_ID_BY_CODE } from '../lib/inventoryCodes';

type DesignColorRow = {
  designCode: string;
  color: string;
  quantity: number;
  revenue: number;
  saleCount: number;
};

type SalesBreakdown = {
  saleCount: number;
  revenue: number;
  quantity: number;
  byDay: Array<{ date: string; revenue: number; saleCount: number }>;
  byEmployee: Array<{ employee: string; revenue: number; saleCount: number }>;
  byDesignColor: DesignColorRow[];
};

type TaskBreakdown = {
  open: number;
  done: number;
  byEmployee: Array<{ employee: string; open: number; done: number }>;
  byDesignColor: Array<{ designCode: string; color: string; open: number; done: number }>;
};

type AnalysisReport = {
  todayKey: string;
  every: SalesBreakdown;
  daily: SalesBreakdown;
  history: SalesBreakdown;
  tasks: TaskBreakdown;
};

const branches = ['A', 'B', 'C', 'E', 'F'] as const;
type BranchId = (typeof branches)[number];

const baghdadTodayKey = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const addCalendarDays = (dayKey: string, days: number) => {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const rangeForFocus = (focus: string | null, branch: string | null) => {
  const today = baghdadTodayKey();
  const selected = branches.includes(branch as BranchId) ? (branch as BranchId) : 'A';
  if (focus === 'daily') return { branch: selected, from: today, to: today };
  if (focus === 'history') return { branch: selected, from: addCalendarDays(today, -10), to: addCalendarDays(today, -1) };
  if (focus === 'every' || focus === 'tasks') {
    return { branch: selected, from: addCalendarDays(today, -30), to: today };
  }
  return { branch: selected, from: addCalendarDays(today, -7), to: today };
};

const DataAnalysis: React.FC = () => {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const initial = rangeForFocus(params.get('focus'), params.get('branch'));
  const [selectedBranch, setSelectedBranch] = useState<BranchId>(initial.branch);
  const [fromDate, setFromDate] = useState(initial.from);
  const [toDate, setToDate] = useState(initial.to);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focus = params.get('focus');

  const search = params.toString();
  useEffect(() => {
    const next = rangeForFocus(params.get('focus'), params.get('branch'));
    setSelectedBranch(next.branch);
    setFromDate(next.from);
    setToDate(next.to);
    // The linked branch and focus live in the query string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const loadAnalysis = async (branch = selectedBranch, from = fromDate, to = toDate) => {
    setLoading(true);
    setError(null);
    try {
      if (from > to) {
        setError(t('dataAnalysis.invalidDateRange'));
        setReport(null);
        return;
      }
      const response = await api.get<AnalysisReport>('/sales/analysis', {
        params: {
          branchId: BRANCH_ID_BY_CODE[branch],
          fromDate: `${from}T00:00:00.000+03:00`,
          toDate: `${to}T23:59:59.999+03:00`,
        },
      });
      setReport(response.data);
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      setReport(null);
      setError(
        body?.error ?? body?.message ?? err?.message ?? (status
          ? t('common.requestFailed', { status: t('common.requestFailedStatus', { status }), message: t('dataAnalysis.failedToLoad') })
          : t('dataAnalysis.failedToLoad'))
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAnalysis(selectedBranch, fromDate, toDate);
    // Reload when the linked branch or dates change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch, fromDate, toDate]);

  useEffect(() => {
    if (!report || !focus) return;
    document.getElementById(`analysis-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [report, focus]);

  const labelDesign = (code: string) => (code ? code : t('dataAnalysis.noDesignCode'));
  const labelColor = (color: string) => (color ? getColorLabel(t, color) : t('dataAnalysis.noColor'));

  const designTable = (rows: DesignColorRow[]) =>
    rows.length === 0 ? (
      <p className="mt-4 text-sm text-gray-500">{t('dataAnalysis.emptyDesign')}</p>
    ) : (
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-2 py-2">{t('dataAnalysis.designCode')}</th>
              <th className="px-2 py-2">{t('dataAnalysis.color')}</th>
              <th className="px-2 py-2">{t('dataAnalysis.quantity')}</th>
              <th className="px-2 py-2">{t('dataAnalysis.sales')}</th>
              <th className="px-2 py-2">{t('dataAnalysis.lineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.designCode}-${row.color}`} className="border-b border-gray-100">
                <td className="px-2 py-3 font-bold text-black">{labelDesign(row.designCode)}</td>
                <td className="px-2 py-3">{labelColor(row.color)}</td>
                <td className="px-2 py-3">{row.quantity}</td>
                <td className="px-2 py-3">{row.saleCount}</td>
                <td className="px-2 py-3">{formatCurrency(row.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const saleSection = (id: string, title: string, breakdown: SalesBreakdown | undefined) => (
    <section id={id} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-lg font-semibold text-black">{title}</h3>
        <p className="text-sm text-gray-500">
          {t('dataAnalysis.sectionSummary', {
            count: breakdown?.saleCount ?? 0,
            amount: formatCurrency(breakdown?.revenue ?? 0),
          })}
        </p>
      </div>
      {designTable(breakdown?.byDesignColor ?? [])}
    </section>
  );

  const every = report?.every;
  const maxDayTotal = Math.max(...(every?.byDay.map((entry) => Math.abs(entry.revenue)) ?? [1]), 1);
  const maxEmployeeTotal = Math.max(...(every?.byEmployee.map((entry) => Math.abs(entry.revenue)) ?? [1]), 1);

  return (
    <div className="max-w-full overflow-x-hidden p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">{t('dataAnalysis.title')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">{t('dataAnalysis.subtitle')}</p>
        </div>
      </div>

      <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('dataAnalysis.branch')}</label>
            <select
              value={selectedBranch}
              onChange={(event) => setSelectedBranch(event.target.value as BranchId)}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            >
              {branches.map((branch) => (
                <option key={branch} value={branch}>{t('common.branchLabel', { code: branch })}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('dataAnalysis.from')}</label>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('common.to')}</label>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => void loadAnalysis()} className="btn-primary w-full">
              {t('dataAnalysis.loadAnalysis')}
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 text-gray-600 shadow-sm">
          {t('dataAnalysis.loading')}
        </div>
      ) : error ? (
        <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
          {error}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl bg-magenta-500 p-6 text-white shadow-sm">
              <div className="text-sm opacity-80">{t('dataAnalysis.totalSales')}</div>
              <div className="mt-1 text-3xl font-bold">{every?.saleCount ?? 0}</div>
            </div>
            <div className="rounded-3xl bg-black p-6 text-white shadow-sm">
              <div className="text-sm opacity-80">{t('dataAnalysis.revenue')}</div>
              <div className="mt-1 text-3xl font-bold">{formatCurrency(every?.revenue ?? 0)}</div>
            </div>
            <div className="rounded-3xl border-2 border-magenta-500 bg-white p-6 text-black shadow-sm">
              <div className="text-sm text-gray-500">{t('dataAnalysis.averageSale')}</div>
              <div className="mt-1 text-3xl font-bold text-magenta-500">
                {formatCurrency(every && every.saleCount > 0 ? every.revenue / every.saleCount : 0)}
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-black">{t('dataAnalysis.salesByDay')}</h3>
              {(every?.byDay.length ?? 0) === 0 ? (
                <div className="mt-4 text-sm text-gray-500">{t('dataAnalysis.loadToSeeDaily')}</div>
              ) : (
                <div className="mt-4 space-y-3">
                  {every?.byDay.map((entry) => (
                    <div key={entry.date}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{entry.date}</span>
                        <span className="font-semibold">{formatCurrency(entry.revenue)}</span>
                      </div>
                      <div className="h-4 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-magenta-500"
                          style={{ width: `${Math.max(8, (Math.abs(entry.revenue) / maxDayTotal) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-black">{t('dataAnalysis.salesByEmployee')}</h3>
              {(every?.byEmployee.length ?? 0) === 0 ? (
                <div className="mt-4 text-sm text-gray-500">{t('dataAnalysis.loadToSeeEmployee')}</div>
              ) : (
                <div className="mt-4 space-y-3">
                  {every?.byEmployee.map((entry) => (
                    <div key={entry.employee}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{entry.employee}</span>
                        <span className="font-semibold">{formatCurrency(entry.revenue)}</span>
                      </div>
                      <div className="h-4 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-black"
                          style={{ width: `${Math.max(8, (Math.abs(entry.revenue) / maxEmployeeTotal) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {saleSection('analysis-every', t('dataAnalysis.everySale'), report?.every)}
          {saleSection('analysis-daily', t('dataAnalysis.dailySale'), report?.daily)}
          {saleSection('analysis-history', t('dataAnalysis.historySale'), report?.history)}

          <section id="analysis-tasks" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">{t('dataAnalysis.taskEmployee')}</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-red-50 p-4">
                <div className="text-sm text-red-700">{t('dataAnalysis.openTasks')}</div>
                <div className="mt-1 text-3xl font-bold text-black">{report?.tasks.open ?? 0}</div>
              </div>
              <div className="rounded-2xl bg-green-50 p-4">
                <div className="text-sm text-green-700">{t('dataAnalysis.doneTasks')}</div>
                <div className="mt-1 text-3xl font-bold text-black">{report?.tasks.done ?? 0}</div>
              </div>
            </div>

            <h4 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t('dataAnalysis.tasksByEmployee')}
            </h4>
            {(report?.tasks.byEmployee.length ?? 0) === 0 ? (
              <p className="mt-3 text-sm text-gray-500">{t('dataAnalysis.emptyTasks')}</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-2 py-2">{t('dataAnalysis.employee')}</th>
                      <th className="px-2 py-2">{t('dataAnalysis.openTasks')}</th>
                      <th className="px-2 py-2">{t('dataAnalysis.doneTasks')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report?.tasks.byEmployee.map((row) => (
                      <tr key={row.employee} className="border-b border-gray-100">
                        <td className="px-2 py-3 font-semibold text-black">{row.employee}</td>
                        <td className="px-2 py-3">{row.open}</td>
                        <td className="px-2 py-3">{row.done}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h4 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t('dataAnalysis.tasksByDesign')}
            </h4>
            {(report?.tasks.byDesignColor.length ?? 0) === 0 ? (
              <p className="mt-3 text-sm text-gray-500">{t('dataAnalysis.emptyTasks')}</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-2 py-2">{t('dataAnalysis.designCode')}</th>
                      <th className="px-2 py-2">{t('dataAnalysis.color')}</th>
                      <th className="px-2 py-2">{t('dataAnalysis.openTasks')}</th>
                      <th className="px-2 py-2">{t('dataAnalysis.doneTasks')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report?.tasks.byDesignColor.map((row) => (
                      <tr key={`${row.designCode}-${row.color}`} className="border-b border-gray-100">
                        <td className="px-2 py-3 font-bold text-black">{labelDesign(row.designCode)}</td>
                        <td className="px-2 py-3">{labelColor(row.color)}</td>
                        <td className="px-2 py-3">{row.open}</td>
                        <td className="px-2 py-3">{row.done}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default DataAnalysis;
