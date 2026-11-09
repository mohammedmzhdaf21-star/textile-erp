import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { getCurrentUser } from '../lib/auth';
import { formatCurrency, parsePriceInput, toPriceInputNumber } from '../lib/currency';
import { getColorLabel } from '../lib/colorLabels';

type PaymentMethod = 'CASH' | 'FIB' | 'CARD' | 'TRANSFER' | 'CREDIT';

type SaleLine = {
  id: string;
  inventoryItemId?: string | null;
  plainClothName?: string | null;
  isPlainCloth: boolean;
  isPiecePackage?: boolean;
  color?: { name: string };
  soldAsUnit: string;
  quantitySold: string | number;
  soldPrice: string | number;
  lineDiscount: string | number;
};

type SaleRecord = {
  id: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  notes?: string | null;
  items: SaleLine[];
};

type DraftLine = {
  id: string;
  quantity: string;
  lineTotal: string;
  lockedQuantity: boolean;
  label: string;
};

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'FIB', 'CARD', 'TRANSFER', 'CREDIT'];

const lineTotalStored = (line: SaleLine) => {
  const quantity = Number(line.quantitySold);
  const price = Number(line.soldPrice);
  const discount = Number(line.lineDiscount ?? 0);
  return price * quantity - discount;
};

const canManageSales = () => {
  const role = getCurrentUser()?.role;
  return role === 'ADMIN' || role === 'MANAGER';
};

const SaleManageActions: React.FC<{
  saleId: string;
  onChanged: () => void;
}> = ({ saleId, onChanged }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sale, setSale] = useState<SaleRecord | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);

  const isExchange = useMemo(() => Boolean(sale?.notes?.includes('EXCHANGE')), [sale?.notes]);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoading(true);
    setError(null);
    api
      .get(`/sales/${saleId}`)
      .then((response) => {
        if (!current) return;
        const loaded = response.data as SaleRecord;
        setSale(loaded);
        setCustomerName(loaded.customerName ?? '');
        setCustomerPhone(loaded.customerPhone ?? '');
        setPaymentMethod(loaded.paymentMethod ?? 'CASH');
        setNotes(loaded.notes ?? '');
        setLines(
          (loaded.items ?? []).map((item) => ({
            id: item.id,
            quantity: String(item.quantitySold),
            lineTotal: String(toPriceInputNumber(lineTotalStored(item))),
            lockedQuantity: Boolean(item.isPiecePackage) || Boolean(loaded.notes?.includes('EXCHANGE')),
            label: item.isPlainCloth
              ? item.plainClothName || t('salesManage.plainCloth')
              : item.inventoryItemId || t('salesManage.item'),
          }))
        );
      })
      .catch((err) => {
        if (!current) return;
        const body = err?.response?.data;
        setError(body?.error ?? body?.message ?? err?.message ?? t('salesManage.failedToLoad'));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [open, saleId, t]);

  if (!canManageSales()) return null;

  const updateLine = (id: string, patch: Partial<DraftLine>) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/sales/${saleId}`, {
        customerName,
        customerPhone,
        paymentMethod,
        notes,
        items: lines.map((line) => ({
          id: line.id,
          quantitySold: Number(line.quantity),
          lineTotal: parsePriceInput(line.lineTotal),
        })),
      });
      setOpen(false);
      onChanged();
    } catch (err: any) {
      const body = err?.response?.data;
      setError(body?.error ?? body?.message ?? err?.message ?? t('salesManage.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const removeSale = async () => {
    const reason = window.prompt(t('salesManage.deleteReason'), t('salesManage.deleteReasonDefault'));
    if (!reason || !reason.trim()) return;
    const confirmKey = isExchange ? 'salesManage.deleteExchangeConfirm' : 'salesManage.deleteConfirm';
    if (!window.confirm(t(confirmKey))) return;
    setError(null);
    try {
      await api.post(`/sales/${saleId}/void`, { reason: reason.trim() });
      setOpen(false);
      onChanged();
    } catch (err: any) {
      const body = err?.response?.data;
      window.alert(body?.error ?? body?.message ?? err?.message ?? t('salesManage.failedToDelete'));
    }
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
          className="rounded-xl border border-black bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-gray-50"
        >
          {t('salesManage.edit')}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void removeSale();
          }}
          className="rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
        >
          {t('common.delete')}
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-black">{t('salesManage.editTitle')}</h3>
            <p className="mt-1 break-all text-xs text-gray-500">{saleId}</p>
            {isExchange && (
              <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">
                {t('salesManage.exchangeHint')}
              </p>
            )}
            {loading ? (
              <p className="mt-4 text-sm text-gray-500">{t('common.loading')}</p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {t('salesManage.customerName')}
                    <input
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    {t('salesManage.customerPhone')}
                    <input
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium text-gray-700">
                  {t('salesManage.payment')}
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {t(`paymentMethod.${method.toLowerCase()}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="space-y-3">
                  {lines.map((line, index) => {
                    const source = sale?.items[index];
                    return (
                      <div key={line.id} className="rounded-2xl border border-gray-200 p-3">
                        <div className="break-all text-sm font-semibold text-black">{line.label}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {source?.isPlainCloth
                            ? t('salesManage.plainCloth')
                            : getColorLabel(t, source?.color?.name)}{' '}
                          · {source?.soldAsUnit}
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="block text-sm text-gray-700">
                            {t('salesManage.quantity')}
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              disabled={line.lockedQuantity || isExchange}
                              value={line.quantity}
                              onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                            />
                          </label>
                          <label className="block text-sm text-gray-700">
                            {t('salesManage.lineTotal')}
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={isExchange}
                              value={line.lineTotal}
                              onChange={(event) => updateLine(line.id, { lineTotal: event.target.value })}
                              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                            />
                            <span className="mt-1 block text-xs text-gray-500">
                              {t('currency.thousandsHint')} · {formatCurrency(parsePriceInput(line.lineTotal))}
                            </span>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <label className="block text-sm font-medium text-gray-700">
                  {t('salesManage.notes')}
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            )}
            {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={loading || saving}
                className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? t('common.saving') : t('common.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SaleManageActions;
