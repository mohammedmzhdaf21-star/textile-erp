import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';
import { formatPackageComponentsSold } from '../lib/piecePackages';
import { getColorLabel } from '../lib/colorLabels';
import { useTranslation } from 'react-i18next';

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
  qrCodeValue?: string | null;
  qrCodeDataUrl?: string | null;
  isPiecePackage?: boolean;
  packageSaleMode?: string | null;
  packagesSold?: number | null;
  packageComponentsSold?: Array<{ name: string; quantity: number }> | null;
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
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnState = location.state as { returnTo?: string } | null;
  const returnTo = returnState?.returnTo || '/sales/daily';
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError(t('saleDetail.saleIdMissing'));
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
            body?.error ?? body?.message ?? err?.message ?? t('saleDetail.failedToLoad')
          }`
        );
        console.error('Sale detail load error:', err);
      })
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="max-w-full overflow-x-hidden p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">{t('saleDetail.title')}</h2>
          <p className="text-sm text-gray-600 max-w-xl">
            {t('saleDetail.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            window.scrollTo({ top: 0, left: 0 });
            navigate(returnTo);
          }}
          className="rounded-2xl border border-magenta-500 bg-magenta-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-magenta-600"
        >
          Back
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
                    <div className="text-sm text-gray-500">{t('saleDetail.saleId')}</div>
                    <div className="break-all text-lg font-semibold text-black">{sale.id}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">{t('saleDetail.created')}</div>
                    <div className="text-lg font-semibold text-black">{new Date(sale.createdAt).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">{t('saleDetail.branch')}</div>
                    <div className="text-lg font-semibold text-black">{sale.branch.name}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">{t('saleDetail.employee')}</div>
                    <div className="text-lg font-semibold text-black">{sale.employee.name}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">{t('saleDetail.customer')}</div>
                    <div className="break-words text-lg font-semibold text-black">{sale.customerName}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">{t('saleDetail.phone')}</div>
                    <div className="text-lg font-semibold text-black">{sale.customerPhone}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="text-sm text-gray-500">{t('saleDetail.totalPrice')}</div>
              <div className="mt-2 text-2xl font-bold text-black">{formatCurrency(sale.totalPrice)}</div>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="text-sm text-gray-500">{t('saleDetail.discount')}</div>
              <div className="mt-2 text-2xl font-bold text-black">{formatCurrency(sale.discount)}</div>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="text-sm text-gray-500">{t('saleDetail.paymentMethod')}</div>
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
                <h3 className="text-lg font-semibold text-black">{t('saleDetail.paymentBreakdown')}</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div>
                    <div className="text-sm text-gray-600">{t('saleDetail.totalPrice')}</div>
                    <div className="mt-1 text-xl font-bold text-black">{formatCurrency(totalPrice)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">{t('saleDetail.customerPaid')}</div>
                    <div className="mt-1 text-xl font-bold text-green-600">{formatCurrency(paidAmount)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">{t('saleDetail.remainingDue')}</div>
                    <div className="mt-1 text-xl font-bold text-red-600">{formatCurrency(remainingDue)}</div>
                  </div>
                </div>
              </div>
            ) : null;
          })()}

          {sale.notes ? (
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="text-sm text-gray-500">{t('saleDetail.notes')}</div>
              <div className="mt-2 break-words text-sm text-gray-700">{sale.notes}</div>
            </div>
          ) : null}

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">{t('saleDetail.lineItems')}</h3>
            <div className="mt-4 space-y-4">
              {sale.items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex-1">
                      <div className="break-all text-sm font-semibold text-black">
                        {item.isPlainCloth
                          ? item.plainClothName || t('common.plainCloth')
                          : `Inventory Item ${item.inventoryItemId}`}
                      </div>
                      <div className="text-xs text-gray-500">
                        {item.isPlainCloth ? t('common.plainClothLine') : t('saleDetail.colorLabel', { name: getColorLabel(t, item.color?.name) })}
                      </div>
                      <div className="mt-2 text-sm text-gray-700">
                        {item.isPiecePackage && item.packageSaleMode === 'FULL'
                          ? `${item.packagesSold ?? Number(item.quantitySold)} full package(s) @ ${formatCurrency(item.soldPrice)}`
                          : item.isPiecePackage && item.packageSaleMode === 'PARTIAL'
                            ? `${formatPackageComponentsSold(item.packageComponentsSold ?? [])} — ${formatCurrency(item.soldPrice)}`
                            : `${item.soldAsUnit} · ${Number(item.quantitySold).toFixed(2)} @ ${formatCurrency(item.soldPrice)}`}
                      </div>
                    </div>
                    {item.qrCodeDataUrl && (
                      <div className="rounded-2xl border border-gray-200 bg-white p-3 text-center">
                        <img
                          src={item.qrCodeDataUrl}
                          alt={t('saleDetail.qrAlt', { id: item.qrCodeValue || item.inventoryItemId || item.id })}
                          className="mx-auto h-28 w-28"
                        />
                        <div className="mt-2 break-all text-xs font-semibold text-gray-700">
                          {item.qrCodeValue || item.inventoryItemId}
                        </div>
                        <a
                          href={item.qrCodeDataUrl}
                          download={`${item.qrCodeValue || item.inventoryItemId || item.id}-qr.png`}
                          className="mt-2 inline-flex text-xs font-semibold text-magenta-600 hover:underline"
                        >
                          {t('saleDetail.downloadQr')}
                        </a>
                      </div>
                    )}
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
