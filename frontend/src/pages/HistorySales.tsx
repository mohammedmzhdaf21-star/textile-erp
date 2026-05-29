import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

type Sale = {
  id: string;
  total?: number | string;
  totalPrice?: number | string;
  createdAt: string;
  notes?: string;
  employee?: {
    id: string;
    name: string;
  };
  employeeName?: string;
  paymentStatus?: 'PAID' | 'PARTIAL' | 'UNPAID';
  paidAmount?: number;
  paymentMethod?: string;
};

type EmployeeGroup = {
  employeeName: string;
  total: number;
  sales: Sale[];
};

type DateBucket = {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  sales: Sale[];
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

const HISTORY_DAYS = 10;

const toMoneyNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (date: Date) =>
  date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const formatTime = (dateString: string) =>
  new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const historyWindowForDate = (date: Date) => {
  const start = new Date(date);
  start.setHours(9, 0, 0, 0);

  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  end.setHours(2, 0, 0, 0);

  return {
    fromDate: start.toISOString(),
    toDate: end.toISOString(),
  };
};

const buildPastDateBuckets = () => {
  const todayKey = formatDateKey(new Date());
  const buckets: DateBucket[] = [];

  for (let offset = 1; offset <= HISTORY_DAYS; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);

    const key = formatDateKey(date);
    if (key === todayKey) continue;

    const window = historyWindowForDate(date);
    buckets.push({
      key,
      label: formatDisplayDate(date),
      fromDate: window.fromDate,
      toDate: window.toDate,
      sales: [],
    });
  }

  return buckets;
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

const enrichedSale = (sale: Sale): Sale => {
  const notes = sale.notes || '';
  const refundMatch = /Refunded\s+([0-9]+(?:\.[0-9]+)?)/i.exec(notes);
  const paidMatch = /Paid\s+(-?[0-9]+(?:\.[0-9]+)?)/i.exec(notes);

  let paidAmount = 0;
  if (refundMatch) {
    paidAmount = -toMoneyNumber(refundMatch[1]);
  } else if (paidMatch) {
    paidAmount = toMoneyNumber(paidMatch[1]);
  } else if (sale.paymentStatus === 'PAID' || sale.paymentMethod === 'CASH') {
    paidAmount = toMoneyNumber(sale.total ?? sale.totalPrice ?? 0);
  }

  const totalPrice = toMoneyNumber(sale.total ?? sale.totalPrice ?? 0);
  const paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID' =
    paidAmount > 0 && paidAmount < totalPrice
      ? 'PARTIAL'
      : paidAmount >= totalPrice
      ? 'PAID'
      : 'UNPAID';

  return { ...sale, paidAmount, paymentStatus };
};

const saleCashAmount = (sale: Sale) =>
  typeof sale.paidAmount === 'number' && Number.isFinite(sale.paidAmount)
    ? sale.paidAmount
    : toMoneyNumber(sale.total ?? sale.totalPrice ?? 0);

const saleBorderClass = (sale: Sale) => {
  if (sale.paymentStatus === 'PARTIAL') return 'border-red-400 bg-red-50';
  if (sale.paymentStatus === 'PAID') return 'border-green-400 bg-green-50';
  return 'border-gray-200 bg-white';
};

const HistorySales: React.FC = () => {
  const [selectedBranch, setSelectedBranch] = useState<BranchId | null>(null);
  const [buckets, setBuckets] = useState<DateBucket[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, []);

  const selectedBucket = buckets.find((bucket) => bucket.key === selectedDateKey);

  const groupedByEmployee = useMemo(() => {
    const groups: Record<string, EmployeeGroup> = {};
    const sales = selectedBucket?.sales || [];

    sales.forEach((sale) => {
      const employeeName = sale.employee?.name || sale.employeeName || 'Unknown Employee';
      const amount = saleCashAmount(sale);

      if (!groups[employeeName]) {
        groups[employeeName] = {
          employeeName,
          total: amount,
          sales: [sale],
        };
      } else {
        groups[employeeName].total += amount;
        groups[employeeName].sales.push(sale);
      }
    });

    return Object.values(groups).sort((a, b) => b.total - a.total);
  }, [selectedBucket]);

  const loadBranchHistory = async (branch: BranchId) => {
    setSelectedBranch(branch);
    setSelectedDateKey(null);
    setLoading(true);
    setError(null);

    const nextBuckets = buildPastDateBuckets();

    try {
      const loadedBuckets = await Promise.all(
        nextBuckets.map(async (bucket) => {
          const response = await api.get('/sales', {
            params: {
              branchId: BRANCH_MAP[branch],
              fromDate: bucket.fromDate,
              toDate: bucket.toDate,
            },
          });

          return {
            ...bucket,
            sales: extractSales(response.data).map(enrichedSale),
          };
        })
      );

      setBuckets(loadedBuckets);
      setSelectedDateKey(loadedBuckets.find((bucket) => bucket.sales.length > 0)?.key || loadedBuckets[0]?.key || null);
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      setBuckets([]);
      setError(
        `Request failed${status ? ` (status ${status})` : ''}: ${
          body?.error ?? body?.message ?? err?.message ?? 'Failed to load history sales'
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
          <h2 className="text-2xl font-bold text-black">History Sales</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-600">
            Select a branch, choose a past date, and review sales from 09:00 to 02:00 the next day.
          </p>
        </div>
        <div className="text-sm text-gray-500">
          {selectedBranch ? `Branch ${selectedBranch}` : 'Select a branch'}
        </div>
      </div>

      <section className="mt-6 grid grid-cols-5 gap-3">
        {branches.map((branch) => {
          const isSelected = selectedBranch === branch;
          return (
            <button
              key={branch}
              type="button"
              onClick={() => loadBranchHistory(branch)}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-all ${
                isSelected
                  ? 'border-magenta-500 bg-magenta-500 text-white shadow-lg'
                  : 'border-gray-200 bg-white text-gray-800 hover:border-magenta-300 hover:bg-magenta-50'
              }`}
            >
              Branch {branch}
            </button>
          );
        })}
      </section>

      {selectedBranch && (
        <section className="mt-8 space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-black">Past dates for Branch {selectedBranch}</h3>
            <p className="mt-1 text-sm text-gray-600">
              Today is excluded. Each date covers 09:00 through 02:00 the next day.
            </p>

            {loading ? (
              <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">Loading history...</div>
            ) : error ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-3">
                {buckets.map((bucket) => (
                  <button
                    key={bucket.key}
                    type="button"
                    onClick={() => setSelectedDateKey(bucket.key)}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      selectedDateKey === bucket.key
                        ? 'border-magenta-500 bg-magenta-50 text-magenta-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-magenta-300'
                    }`}
                  >
                    <span className="block font-semibold">{bucket.label}</span>
                    <span className="text-xs text-gray-500">
                      {bucket.sales.length} sale{bucket.sales.length === 1 ? '' : 's'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedBucket && !loading && !error && (
            <div className="space-y-5">
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-black">{selectedBucket.label}</h3>
                    <p className="text-sm text-gray-600">
                      Branch {selectedBranch} historical sales window.
                    </p>
                  </div>
                  <div className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white">
                    {selectedBucket.sales.length} sale{selectedBucket.sales.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>

              {selectedBucket.sales.length === 0 ? (
                <div className="rounded-3xl border border-gray-200 bg-white p-6 text-gray-600 shadow-sm">
                  No sales found for this branch/date window.
                </div>
              ) : (
                groupedByEmployee.map((group) => (
                  <div
                    key={group.employeeName}
                    className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-lg font-semibold text-black">{group.employeeName}</h4>
                        <p className="text-sm text-gray-500">
                          {group.sales.length} sale{group.sales.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="rounded-full bg-magenta-500 px-4 py-2 text-sm font-semibold text-white">
                        {`$${group.total.toFixed(2)}`}
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {group.sales.map((sale) => {
                        const amount = saleCashAmount(sale);
                        return (
                          <button
                            key={sale.id}
                            type="button"
                            onClick={() =>
                              navigate(`/sales/${sale.id}`, {
                                state: { returnTo: '/sales/history' },
                              })
                            }
                            className={`w-full rounded-2xl border p-4 text-left transition hover:border-magenta-300 hover:bg-white ${saleBorderClass(sale)}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="break-all text-sm font-semibold text-black">Sale ID: {sale.id}</div>
                                <div className="mt-1 text-xs text-gray-500">{formatTime(sale.createdAt)}</div>
                                <div className={`mt-2 text-sm font-bold ${amount < 0 ? 'text-red-600' : 'text-magenta-600'}`}>
                                  {`Cash impact: ${amount < 0 ? '-' : ''}$${Math.abs(amount).toFixed(2)}`}
                                </div>
                              </div>
                              <div className={`text-lg font-bold ${amount < 0 ? 'text-red-600' : 'text-magenta-600'}`}>
                                {`${amount < 0 ? '-' : ''}$${Math.abs(amount).toFixed(2)}`}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default HistorySales;
