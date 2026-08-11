import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatSignedCurrency } from '../lib/currency';
import { isImmediatePaymentMethod, resolveSalePaymentLabel } from '../lib/paymentMethod';

type Sale = {
  id: string;
  total?: number | string;
  totalPrice?: number | string;
  createdAt: string;
  notes?: string;
  customerName?: string;
  customerPhone?: string;
  employee?: {
    id: string;
    name: string;
  };
  employeeName?: string;
  paymentStatus?: 'PAID' | 'PARTIAL' | 'UNPAID';
  paidAmount?: number;
  paymentMethod?: string;
  items?: Array<{
    inventoryItemId?: string | null;
    qrCodeValue?: string | null;
    qrCodeDataUrl?: string | null;
  }>;
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


const formatDateTime = (dateString: string) =>
  new Date(dateString).toLocaleString([], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

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
  } else if (sale.paymentStatus === 'PAID' || isImmediatePaymentMethod(sale.paymentMethod)) {
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
  const { t } = useTranslation();
  const [selectedBranch, setSelectedBranch] = useState<BranchId | null>(null);
  const [buckets, setBuckets] = useState<DateBucket[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Sale[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const navigate = useNavigate();

  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, []);

  const selectedBucket = buckets.find((bucket) => bucket.key === selectedDateKey);

  const groupedByEmployee = useMemo(() => {
    const groups: Record<string, EmployeeGroup> = {};
    const sales = selectedBucket?.sales || [];

    sales.forEach((sale) => {
      const employeeName = sale.employee?.name || sale.employeeName || t('common.unknownEmployee');
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
    setSearchResults(null);
    setSearchError(null);
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
          body?.error ?? body?.message ?? err?.message ?? t('historySales.failedToLoad')
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const runSaleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchError(t('historySales.searchRequired'));
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    setSearchResults(null);

    try {
      const response = await api.get('/sales', {
        params: {
          search: query,
          branchId: selectedBranch ? BRANCH_MAP[selectedBranch] : undefined,
          pageSize: 100,
        },
      });

      const sales = extractSales(response.data).map(enrichedSale);
      setSearchResults(sales);
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      setSearchError(
        t('common.requestFailed', {
          status: status ? t('common.requestFailedStatus', { status }) : '',
          message: body?.error ?? body?.message ?? err?.message ?? t('historySales.searchFailed'),
        })
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSearchError(null);
  };

  const renderSaleButton = (sale: Sale) => {
    const amount = saleCashAmount(sale);
    const matchedItemId = sale.items?.find((item) => item.inventoryItemId)?.inventoryItemId;

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
            <div className="break-all text-sm font-semibold text-black">
              {t('historySales.saleIdLabel', { id: sale.id })}
            </div>
            <div className="mt-1 text-xs text-gray-500">{formatDateTime(sale.createdAt)}</div>
            {(sale.customerName || sale.customerPhone) && (
              <div className="mt-2 text-sm text-gray-700">
                {sale.customerName}
                {sale.customerPhone ? ` · ${sale.customerPhone}` : ''}
              </div>
            )}
            {matchedItemId && (
              <div className="mt-1 break-all font-mono text-xs text-gray-500">
                {t('historySales.itemIdLabel', { id: matchedItemId })}
              </div>
            )}
            {sale.items?.some((item) => item.qrCodeDataUrl) && (
              <div className="mt-1 text-xs font-semibold text-gray-600">{t('historySales.qrSaved')}</div>
            )}
            <div className={`mt-2 text-sm font-bold ${amount < 0 ? 'text-red-600' : 'text-magenta-600'}`}>
              {t('historySales.cashImpact', {
                amount: formatSignedCurrency(amount),
              })}
            </div>
            <span className="mt-2 inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
              {resolveSalePaymentLabel(t, sale.paymentMethod, sale.notes)}
            </span>
          </div>
          <div className={`text-lg font-bold ${amount < 0 ? 'text-red-600' : 'text-magenta-600'}`}>
            {formatSignedCurrency(amount)}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="max-w-full overflow-x-hidden p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">{t('historySales.title')}</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-600">
            {t('historySales.subtitle')}
          </p>
        </div>
        <div className="text-sm text-gray-500">
          {selectedBranch ? t('historySales.branchSelected', { branch: selectedBranch }) : t('common.selectBranch')}
        </div>
      </div>

      <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-black">{t('historySales.searchTitle')}</h3>
        <p className="mt-1 text-sm text-gray-600">{t('historySales.searchDescription')}</p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            runSaleSearch();
          }}
        >
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm"
            placeholder={t('historySales.searchPlaceholder')}
            autoFocus
          />
          <button type="submit" className="btn-primary" disabled={searchLoading}>
            {searchLoading ? t('common.searching') : t('historySales.searchButton')}
          </button>
          {searchResults !== null && (
            <button
              type="button"
              className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700"
              onClick={clearSearch}
            >
              {t('common.clear')}
            </button>
          )}
        </form>
        {selectedBranch && (
          <p className="mt-2 text-xs text-gray-500">{t('historySales.searchBranchHint', { branch: selectedBranch })}</p>
        )}
        {searchError && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {searchError}
          </div>
        )}
        {searchResults && searchResults.length === 0 && !searchLoading && !searchError && (
          <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
            {t('historySales.searchNoResults')}
          </div>
        )}
        {searchResults && searchResults.length > 0 && (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-semibold text-black">
              {t('historySales.searchResults', { count: searchResults.length })}
            </p>
            {searchResults.map((sale) => renderSaleButton(sale))}
          </div>
        )}
      </section>

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
            <h3 className="text-xl font-semibold text-black">{t('historySales.pastDatesTitle', { branch: selectedBranch })}</h3>
            <p className="mt-1 text-sm text-gray-600">
              {t('historySales.pastDatesDescription')}
            </p>

            {loading ? (
              <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">{t('historySales.loadingHistory')}</div>
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
                      {t('historySales.historicalWindow', { branch: selectedBranch })}
                    </p>
                  </div>
                  <div className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white">
                    {selectedBucket.sales.length} sale{selectedBucket.sales.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>

              {selectedBucket.sales.length === 0 ? (
                <div className="rounded-3xl border border-gray-200 bg-white p-6 text-gray-600 shadow-sm">
                  {t('historySales.noSalesForWindow')}
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
                        {formatCurrency(group.total)}
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {group.sales.map((sale) => renderSaleButton(sale))}
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
