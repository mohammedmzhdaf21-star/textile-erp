import React, { useMemo, useState } from 'react';
import api from '../lib/api';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../lib/currency';

type Sale = {
  id: string;
  total?: number | string;
  totalPrice?: number | string;
  createdAt: string;
  paymentMethod?: string;
  notes?: string;
  employee?: {
    name: string;
  };
  employeeName?: string;
};

const branches = ['A', 'B', 'C', 'E', 'F'] as const;
type BranchId = typeof branches[number];

const BRANCH_MAP: Record<BranchId, string> = {
  A: 'B001',
  B: 'B002',
  C: 'B003',
  E: 'B001',
  F: 'B002',
};

const toMoneyNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const extractSales = (data: unknown): Sale[] => {
  if (Array.isArray(data)) return data as Sale[];
  if (data && typeof data === 'object' && Array.isArray((data as { sales?: unknown }).sales)) {
    return (data as { sales: Sale[] }).sales;
  }
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: Sale[] }).items;
  }
  return [];
};

const saleCashAmount = (sale: Sale) => {
  const notes = sale.notes || '';
  const refundMatch = /Refunded\s+([0-9]+(?:\.[0-9]+)?)/i.exec(notes);
  const paidMatch = /Paid\s+(-?[0-9]+(?:\.[0-9]+)?)/i.exec(notes);

  if (refundMatch) return -toMoneyNumber(refundMatch[1]);
  if (paidMatch) return toMoneyNumber(paidMatch[1]);
  if (sale.paymentMethod === 'CASH') return toMoneyNumber(sale.total ?? sale.totalPrice ?? 0);
  return toMoneyNumber(sale.total ?? sale.totalPrice ?? 0);
};

const DataAnalysis: React.FC = () => {
  const { t } = useTranslation();
  const today = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(today.getDate() - 7);

  const [selectedBranch, setSelectedBranch] = useState<BranchId>('A');
  const [fromDate, setFromDate] = useState(formatDate(weekAgo));
  const [toDate, setToDate] = useState(formatDate(today));
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalRevenue = useMemo(
    () => sales.reduce((sum, sale) => sum + saleCashAmount(sale), 0),
    [sales]
  );

  const averageSale = sales.length > 0 ? totalRevenue / sales.length : 0;

  const salesByDay = useMemo(() => {
    const groups: Record<string, number> = {};
    sales.forEach((sale) => {
      const key = formatDate(new Date(sale.createdAt));
      groups[key] = (groups[key] || 0) + saleCashAmount(sale);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total }));
  }, [sales]);

  const salesByEmployee = useMemo(() => {
    const groups: Record<string, number> = {};
    sales.forEach((sale) => {
      const employee = sale.employee?.name || sale.employeeName || 'Unknown Employee';
      groups[employee] = (groups[employee] || 0) + saleCashAmount(sale);
    });
    return Object.entries(groups)
      .sort(([, a], [, b]) => b - a)
      .map(([employee, total]) => ({ employee, total }));
  }, [sales]);

  const maxDayTotal = Math.max(...salesByDay.map((entry) => Math.abs(entry.total)), 1);
  const maxEmployeeTotal = Math.max(...salesByEmployee.map((entry) => Math.abs(entry.total)), 1);

  const loadAnalysis = async () => {
    setLoading(true);
    setError(null);

    try {
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);

      if (start > end) {
        setError(t('dataAnalysis.invalidDateRange'));
        setSales([]);
        setLoading(false);
        return;
      }

      const response = await api.get('/sales', {
        params: {
          branchId: BRANCH_MAP[selectedBranch],
          fromDate: start.toISOString(),
          toDate: end.toISOString(),
          includeVoided: false,
          pageSize: 200,
        },
      });

      setSales(extractSales(response.data));
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      setSales([]);
      setError(
        `Request failed${status ? ` (status ${status})` : ''}: ${
          body?.error ?? body?.message ?? err?.message ?? t('dataAnalysis.failedToLoad')
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-full overflow-x-hidden p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">{t('dataAnalysis.title')}</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-600">
            Review sales graphs and charts by branch and date range.
          </p>
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
            <button type="button" onClick={loadAnalysis} className="btn-primary w-full">
              Load analysis
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 text-gray-600 shadow-sm">
          Loading analysis...
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
              <div className="mt-1 text-3xl font-bold">{sales.length}</div>
            </div>
            <div className="rounded-3xl bg-black p-6 text-white shadow-sm">
              <div className="text-sm opacity-80">{t('dataAnalysis.revenue')}</div>
              <div className="mt-1 text-3xl font-bold">{formatCurrency(totalRevenue)}</div>
            </div>
            <div className="rounded-3xl border-2 border-magenta-500 bg-white p-6 text-black shadow-sm">
              <div className="text-sm text-gray-500">{t('dataAnalysis.averageSale')}</div>
              <div className="mt-1 text-3xl font-bold text-magenta-500">{formatCurrency(averageSale)}</div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-black">{t('dataAnalysis.salesByDay')}</h3>
              {salesByDay.length === 0 ? (
                <div className="mt-4 text-sm text-gray-500">{t('dataAnalysis.loadToSeeDaily')}</div>
              ) : (
                <div className="mt-4 space-y-3">
                  {salesByDay.map((entry) => (
                    <div key={entry.date}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{entry.date}</span>
                        <span className="font-semibold">{formatCurrency(entry.total)}</span>
                      </div>
                      <div className="h-4 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-magenta-500"
                          style={{ width: `${Math.max(8, (Math.abs(entry.total) / maxDayTotal) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-black">{t('dataAnalysis.salesByEmployee')}</h3>
              {salesByEmployee.length === 0 ? (
                <div className="mt-4 text-sm text-gray-500">{t('dataAnalysis.loadToSeeEmployee')}</div>
              ) : (
                <div className="mt-4 space-y-3">
                  {salesByEmployee.map((entry) => (
                    <div key={entry.employee}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{entry.employee}</span>
                        <span className="font-semibold">{formatCurrency(entry.total)}</span>
                      </div>
                      <div className="h-4 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-black"
                          style={{ width: `${Math.max(8, (Math.abs(entry.total) / maxEmployeeTotal) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default DataAnalysis;
