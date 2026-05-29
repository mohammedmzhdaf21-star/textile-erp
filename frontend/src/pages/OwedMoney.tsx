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
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: string;
  paymentStatus?: 'PAID' | 'PARTIAL' | 'UNPAID';
  paidAmount?: number;
};

type OwedPayment = {
  saleId: string;
  branchId: string;
  amount: number;
  paidAt: string;
  customerName?: string;
  employeeName?: string;
};

type OwedRow = Sale & {
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
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

const OWED_PAYMENTS_KEY = 'textile-erp-owed-payments';

const toMoneyNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatTime = (dateString: string) =>
  new Date(dateString).toLocaleString([], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const readOwedPayments = (): OwedPayment[] => {
  try {
    const raw = localStorage.getItem(OWED_PAYMENTS_KEY);
    return raw ? (JSON.parse(raw) as OwedPayment[]) : [];
  } catch {
    return [];
  }
};

const writeOwedPayments = (payments: OwedPayment[]) => {
  localStorage.setItem(OWED_PAYMENTS_KEY, JSON.stringify(payments));
  window.dispatchEvent(new Event('owed-payments-updated'));
};

const paidFromSale = (sale: Sale) => {
  const notes = sale.notes || '';
  const refundMatch = /Refunded\s+([0-9]+(?:\.[0-9]+)?)/i.exec(notes);
  const paidMatch = /Paid\s+(-?[0-9]+(?:\.[0-9]+)?)/i.exec(notes);

  if (refundMatch) return -toMoneyNumber(refundMatch[1]);
  if (paidMatch) return toMoneyNumber(paidMatch[1]);
  if (sale.paymentStatus === 'PAID' || sale.paymentMethod === 'CASH') {
    return toMoneyNumber(sale.total ?? sale.totalPrice ?? 0);
  }
  return toMoneyNumber(sale.paidAmount);
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

const OwedMoney: React.FC = () => {
  const [selectedBranch, setSelectedBranch] = useState<BranchId | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [localPayments, setLocalPayments] = useState<OwedPayment[]>(() => readOwedPayments());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const owedRows = useMemo<OwedRow[]>(() => {
    if (!selectedBranch) return [];
    const branchId = BRANCH_MAP[selectedBranch];

    return sales
      .map((sale) => {
        const totalAmount = toMoneyNumber(sale.total ?? sale.totalPrice ?? 0);
        const apiPaidAmount = paidFromSale(sale);
        const localPaidAmount = localPayments
          .filter((payment) => payment.saleId === sale.id && payment.branchId === branchId)
          .reduce((sum, payment) => sum + payment.amount, 0);
        const paidAmount = Math.min(totalAmount, apiPaidAmount + localPaidAmount);
        const outstandingAmount = Math.max(0, totalAmount - paidAmount);

        const paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID' =
          outstandingAmount <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';

        return {
          ...sale,
          totalAmount,
          paidAmount,
          outstandingAmount,
          paymentStatus,
        };
      })
      .filter((sale) => sale.totalAmount > 0)
      .sort((a, b) => b.outstandingAmount - a.outstandingAmount);
  }, [localPayments, sales, selectedBranch]);

  const outstandingRows = owedRows.filter((sale) => sale.outstandingAmount > 0);
  const settledRows = owedRows.filter((sale) => sale.outstandingAmount <= 0);
  const outstandingTotal = outstandingRows.reduce((sum, sale) => sum + sale.outstandingAmount, 0);

  const loadBranchOwed = async (branch: BranchId) => {
    setSelectedBranch(branch);
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/sales', {
        params: {
          branchId: BRANCH_MAP[branch],
          includeVoided: false,
          pageSize: 200,
        },
      });
      setSales(extractSales(response.data));
      setLocalPayments(readOwedPayments());
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      setSales([]);
      setError(
        `Request failed${status ? ` (status ${status})` : ''}: ${
          body?.error ?? body?.message ?? err?.message ?? 'Failed to load owed money'
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const payNow = (sale: OwedRow) => {
    if (!selectedBranch || sale.outstandingAmount <= 0) return;
    const payment: OwedPayment = {
      saleId: sale.id,
      branchId: BRANCH_MAP[selectedBranch],
      amount: sale.outstandingAmount,
      paidAt: new Date().toISOString(),
      customerName: sale.customerName,
      employeeName: sale.employee?.name || sale.employeeName,
    };
    const nextPayments = [...readOwedPayments(), payment];
    writeOwedPayments(nextPayments);
    setLocalPayments(nextPayments);
  };

  const rowClass = (sale: OwedRow) => {
    if (sale.outstandingAmount <= 0) return 'border-green-400 border-l-8 bg-green-50';
    return 'border-red-400 border-l-8 bg-red-50';
  };

  return (
    <div className="max-w-full overflow-x-hidden p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">Owed Money</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-600">
            Track partially paid or unpaid sales by branch. Pay Now is a frontend stub until backend arrears endpoints are added.
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
              onClick={() => loadBranchOwed(branch)}
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-black">Branch {selectedBranch} arrears</h3>
                <p className="text-sm text-gray-600">
                  {outstandingRows.length} outstanding sale{outstandingRows.length === 1 ? '' : 's'}.
                </p>
              </div>
              <div className="rounded-full bg-magenta-500 px-4 py-2 text-sm font-semibold text-white">
                {`Outstanding $${outstandingTotal.toFixed(2)}`}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-gray-200 bg-white p-6 text-gray-600 shadow-sm">
              Loading owed money...
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
              {error}
            </div>
          ) : owedRows.length === 0 ? (
            <div className="rounded-3xl border border-gray-200 bg-white p-6 text-gray-600 shadow-sm">
              No sales found for this branch.
            </div>
          ) : (
            <div className="space-y-4">
              {[...outstandingRows, ...settledRows].map((sale) => (
                <div key={sale.id} className={`rounded-3xl border p-5 shadow-sm ${rowClass(sale)}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/sales/${sale.id}`, {
                          state: { returnTo: '/sales/owed' },
                        })
                      }
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="break-all text-sm font-semibold text-black">Sale ID: {sale.id}</div>
                      <div className="mt-1 text-xs text-gray-500">{formatTime(sale.createdAt)}</div>
                      <div className="mt-2 text-sm text-gray-700">
                        {sale.customerName || 'Unknown customer'} · {sale.employee?.name || sale.employeeName || 'Unknown Employee'}
                      </div>
                    </button>

                    <div className="grid gap-3 text-sm sm:grid-cols-4 lg:min-w-[520px]">
                      <div>
                        <div className="text-gray-500">Total</div>
                        <div className="font-bold text-black">{`$${sale.totalAmount.toFixed(2)}`}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Paid</div>
                        <div className="font-bold text-green-700">{`$${sale.paidAmount.toFixed(2)}`}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Outstanding</div>
                        <div className="font-bold text-red-700">{`$${sale.outstandingAmount.toFixed(2)}`}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Status</div>
                        <div className="font-bold text-black">{sale.paymentStatus}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => payNow(sale)}
                      disabled={sale.outstandingAmount <= 0}
                      className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
                        sale.outstandingAmount <= 0
                          ? 'bg-gray-200 text-gray-500'
                          : 'bg-black text-white hover:bg-gray-800'
                      }`}
                    >
                      {sale.outstandingAmount <= 0 ? 'Settled' : 'Pay Now'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default OwedMoney;
