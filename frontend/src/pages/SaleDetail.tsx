import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';

type SaleItem = {
  id: string;
  inventoryItemId?: string | null;
  plainClothName?: string | null;
  isPlainCloth: boolean;
  color: { name: string };
  soldAsUnit: string;
  quantitySold: string;
  soldPrice: string;
  lineDiscount: string;
};

type Sale = {
  id: string;
  branch: { id: string; name: string };
  employee: { id: string; name: string };
  customerName: string;
  customerPhone: string;
  totalPrice: string;
  discount: string;
  paymentMethod: string;
  notes?: string | null;
  createdAt: string;
  items: SaleItem[];
};

const formatCurrency = (value: string | number) => {
  return `$${Number(value).toFixed(2)}`;
};

const SaleDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('Sale ID is missing');
      return;
    }

    setLoading(true);
    setError(null);

    api
      .get(`/sales/${id}`)
      .then((response) => {
        setSale(response.data as Sale);
      })
      .catch((err) => {
        const status = err?.response?.status;
        const body = err?.response?.data;
        setError(
          `Request failed${status ? ` (status ${status})` : ''}: ${
            body?.error ?? body?.message ?? err?.message ?? 'Failed to load sale'
          }`
        );
        console.error('Sale detail load error:', err);
      })
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">Sale Detail</h2>
          <p className="text-sm text-gray-600 max-w-xl">
            View the sale details and line items for this transaction.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/sales/daily')}
          className="rounded-2xl border border-magenta-500 bg-magenta-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-magenta-600"
        >
          Back to Daily Sales
        </button>
      </div>

      {loading ? (
        <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 text-gray-600 shadow-sm">
          Loading sale details...
        </div>
      ) : error ? (
        <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
          {error}
        </div>
      ) : sale ? (
        <div className="mt-6 space-y-6">
          {(() => {
            const notes = sale.notes || '';
            let paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID' = 'UNPAID';
            if (/paid\s+\d+/i.test(notes) && /due/i.test(notes)) paymentStatus = 'PARTIAL';
            else if (/fully paid/i.test(notes) || sale.paymentMethod === 'CASH') paymentStatus = 'PAID';

            const borderClass =
              paymentStatus === 'PARTIAL'
                ? 'border-red-400 bg-red-50'
                : paymentStatus === 'PAID'
                ? 'border-green-400 bg-green-50'
                : 'border-gray-200 bg-white';

            return (
              <div className={`rounded-3xl border p-6 shadow-sm ${borderClass}`}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-sm text-gray-500">Sale ID</div>
                    <div className="text-lg font-semibold text-black">{sale.id}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Created</div>
                    <div className="text-lg font-semibold text-black">{new Date(sale.createdAt).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Branch</div>
                    <div className="text-lg font-semibold text-black">{sale.branch.name}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Employee</div>
                    <div className="text-lg font-semibold text-black">{sale.employee.name}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Customer</div>
                    <div className="text-lg font-semibold text-black">{sale.customerName}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Phone</div>
                    <div className="text-lg font-semibold text-black">{sale.customerPhone}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="text-sm text-gray-500">Total Price</div>
              <div className="mt-2 text-2xl font-bold text-black">{formatCurrency(sale.totalPrice)}</div>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="text-sm text-gray-500">Discount</div>
              <div className="mt-2 text-2xl font-bold text-black">{formatCurrency(sale.discount)}</div>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="text-sm text-gray-500">Payment Method</div>
              <div className="mt-2 text-2xl font-bold text-black">{sale.paymentMethod}</div>
            </div>
          </div>

          {(() => {
            const notes = sale.notes || '';
            const totalPrice = Number(sale.totalPrice);
            let paidAmount = 0;
            const paidMatch = /Paid\s+([0-9]+(?:\.[0-9]+)?)/i.exec(notes);
            if (paidMatch) {
              paidAmount = Number(paidMatch[1]);
            } else if (sale.paymentMethod === 'CASH') {
              paidAmount = totalPrice;
            }
            const remainingDue = Math.max(0, totalPrice - paidAmount);
            const isPartial = paidAmount > 0 && remainingDue > 0;

            return isPartial ? (
              <div className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-black">Payment Breakdown</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div>
                    <div className="text-sm text-gray-600">Total Price</div>
                    <div className="mt-1 text-xl font-bold text-black">{formatCurrency(totalPrice)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Customer Paid</div>
                    <div className="mt-1 text-xl font-bold text-green-600">{formatCurrency(paidAmount)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Remaining Due</div>
                    <div className="mt-1 text-xl font-bold text-red-600">{formatCurrency(remainingDue)}</div>
                  </div>
                </div>
              </div>
            ) : null;
          })()}

          {sale.notes ? (
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="text-sm text-gray-500">Notes</div>
              <div className="mt-2 text-sm text-gray-700">{sale.notes}</div>
            </div>
          ) : null}

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">Line Items</h3>
            <div className="mt-4 space-y-4">
              {sale.items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-black">
                        {item.isPlainCloth
                          ? item.plainClothName || 'Plain Cloth'
                          : `Inventory Item ${item.inventoryItemId}`}
                      </div>
                      <div className="text-xs text-gray-500">
                        {item.isPlainCloth ? 'Plain cloth line' : `Color: ${item.color?.name}`}
                      </div>
                    </div>
                    <div className="text-sm text-gray-700">
                      {item.soldAsUnit} · {Number(item.quantitySold).toFixed(2)} @ {formatCurrency(item.soldPrice)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default SaleDetail;
