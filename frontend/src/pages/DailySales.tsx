import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

type Sale = {
  id: string;
  total?: number;
  totalPrice?: number | string;
  createdAt: string;
  employee?: {
    id: string;
    name: string;
  };
  employeeName?: string;
  paymentStatus?: 'PAID' | 'PARTIAL' | 'UNPAID';
  paidAmount?: number;
  paymentMethod?: string;
  notes?: string;
};

type EmployeeGroup = {
  employeeName: string;
  total: number;
  sales: Sale[];
};

const branches = ['A', 'B', 'C', 'E', 'F'] as const;
const BRANCH_MAP: Record<string, string> = {
  A: 'B001',
  B: 'B002',
  C: 'B003',
  E: 'B001',
  F: 'B002',
};
type BranchId = typeof branches[number];

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const DailySales: React.FC = () => {
  const [selectedBranch, setSelectedBranch] = useState<BranchId | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const today = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
const fromDate = formatDate(today);
const toDate = formatDate(tomorrow);
  useEffect(() => {
    if (!selectedBranch) {
      setSales([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);

    api
      .get('/sales', {
        params: {
          // use mapped backend id
          branchId: BRANCH_MAP[selectedBranch as string] ?? selectedBranch,
          fromDate,
          toDate,
        },
      })
      .then((response) => {
        const data = response.data;
        let raw: Sale[] = [];
        if (Array.isArray(data)) raw = data as Sale[];
        else if (data && Array.isArray(data.sales)) raw = data.sales as Sale[];
        else if (data && Array.isArray(data.items)) raw = data.items as Sale[];
        else raw = [];

        // Enrich each sale with computed paidAmount and paymentStatus based on notes/paymentMethod
        const enriched = raw.map((s) => {
          const notes = (s as any).notes || '';
          // Try to parse "Paid X" from notes (e.g. "Paid 50 now, due 150")
          let paidAmount = 0;
          const paidMatch = /Paid\s+([0-9]+(?:\.[0-9]+)?)/i.exec(notes);
          if (paidMatch) {
            paidAmount = Number(paidMatch[1]);
          } else if ((s as any).paymentStatus === 'PAID' || (s as any).paymentMethod === 'CASH') {
            // fully paid
            paidAmount = Number((s as any).total ?? (s as any).totalPrice ?? 0);
          } else {
            paidAmount = 0;
          }

          const totalPrice = Number((s as any).total ?? (s as any).totalPrice ?? 0);
          const paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID' =
            paidAmount > 0 && paidAmount < totalPrice
              ? 'PARTIAL'
              : paidAmount >= totalPrice
              ? 'PAID'
              : 'UNPAID';

          return { ...s, paidAmount, paymentStatus } as Sale & { paidAmount: number; paymentStatus: string };
        });

        setSales(enriched as any);
      })
      .catch((err) => {
        const status = err?.response?.status;
        const body = err?.response?.data;
        setError(
          `Request failed${status ? ` (status ${status})` : ''}: ${
            body?.error ?? body?.message ?? err?.message ?? 'Failed to load daily sales'
          }`
        );
        console.error('Daily sales load error:', err);
      })
      .finally(() => setLoading(false));
  }, [selectedBranch, fromDate, toDate]);

  const groupedByEmployee = useMemo(() => {
    const groups: Record<string, EmployeeGroup> = {};

    sales.forEach((sale: any) => {
      const employeeName =
        sale.employee?.name || sale.employeeName || 'Unknown Employee';
      // Use paidAmount when available; fallback to totalPrice for fully paid
      const salePaid = typeof sale.paidAmount === 'number' ? sale.paidAmount : Number(sale.total ?? sale.totalPrice ?? 0);

      if (!groups[employeeName]) {
        groups[employeeName] = {
          employeeName,
          total: salePaid,
          sales: [sale],
        };
      } else {
        groups[employeeName].total += salePaid;
        groups[employeeName].sales.push(sale);
      }
    });

    return Object.values(groups).sort((a, b) => b.total - a.total);
  }, [sales]);

  const getSaleBorder = (sale: Sale) => {
    if (sale.paymentStatus === 'PARTIAL') return 'border-red-400 bg-red-50';
    if (sale.paymentStatus === 'PAID') return 'border-green-400 bg-green-50';
    return 'border-gray-200 bg-white';
  };

  return (
    <div className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">Daily Sales</h2>
          <p className="mt-1 text-sm text-gray-600 max-w-xl">
            Select a branch and explore today&apos;s sales grouped by employee.
          </p>
        </div>
        <div className="text-sm text-gray-500">Today: {fromDate}</div>
      </div>

      <section className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {branches.map((branch) => {
          const isSelected = selectedBranch === branch;
          return (
            <button
              key={branch}
              type="button"
              onClick={() => setSelectedBranch(branch)}
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

      {selectedBranch ? (
        <section className="mt-8 space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
              <div>
                <h3 className="text-xl font-semibold text-black">Branch {selectedBranch}</h3>
                <p className="text-sm text-gray-600">
                  Showing daily sales for {selectedBranch} on {fromDate}.
                </p>
              </div>
              <div className="text-sm text-gray-500">
                {sales.length} sale{sales.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-gray-200 bg-white p-6 text-gray-600 shadow-sm">
              Loading daily sales...
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
              {error}
            </div>
          ) : sales.length === 0 ? (
            <div className="rounded-3xl border border-gray-200 bg-white p-6 text-gray-600 shadow-sm">
              No sales found for this branch today. Select a different branch or try again later.
            </div>
          ) : (
            <div className="space-y-5">
              {groupedByEmployee.map((group) => (
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
                      ${group.total.toFixed(2)}
                    </div>
                  </div>
                  <div className="mt-5 space-y-3">
                    {group.sales.map((sale) => (
                      <button
                        key={sale.id}
                        type="button"
                        onClick={() => navigate(`/sales/${sale.id}`)}
                        className={`w-full rounded-2xl border p-4 text-left transition hover:border-magenta-300 hover:bg-white ${getSaleBorder(sale)}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-black">Sale ID: {sale.id}</div>
                            <div className="text-xs text-gray-500">{formatTime(sale.createdAt)}</div>
                          </div>
                          <div className="text-sm font-semibold text-magenta-500">
                            ${typeof (sale as any).paidAmount === 'number' ? (sale as any).paidAmount.toFixed(2) : Number(sale.total ?? sale.totalPrice ?? 0).toFixed(2)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
};

export default DailySales;
