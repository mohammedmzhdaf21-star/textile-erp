import React, { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { formatCurrency, parsePriceInput, toPriceInput } from '../lib/currency';
import {
  createTailorMeasurement,
  deleteTailorMeasurement,
  fetchTailorMeasurements,
  updateTailorMeasurement,
  type TailorMeasurement,
  type TailorMeasurementDraft,
} from '../lib/tailorApi';
import {
  buildTailorReceiptHtml,
  formatReceiptDate,
  printTailorReceipt,
  todayInBaghdad,
} from '../lib/tailorReceipt';

const emptyDraft = (): TailorMeasurementDraft => ({
  customerName: '',
  phone: '',
  shoulderCm: '',
  armCm: '',
  waistCm: '',
  chestCm: '',
  heightCm: '',
  buttCm: '',
  cost: '',
  paid: '',
  givenOn: todayInBaghdad(),
  returnOn: '',
});

const sizeFields = [
  ['shoulderCm', 'tailors.shoulder'],
  ['armCm', 'tailors.arm'],
  ['waistCm', 'tailors.waist'],
  ['chestCm', 'tailors.chest'],
  ['heightCm', 'tailors.height'],
  ['buttCm', 'tailors.butt'],
] as const;

function errorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const code = error.response?.data?.code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return fallback;
}

const Tailors: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState<TailorMeasurementDraft>(emptyDraft);
  const [editing, setEditing] = useState<TailorMeasurement | null>(null);
  const [items, setItems] = useState<TailorMeasurement[]>([]);
  const [nextCode, setNextCode] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<TailorMeasurement | null>(null);

  const load = useCallback(
    async (search: string) => {
      setLoading(true);
      try {
        const data = await fetchTailorMeasurements(search);
        setItems(data.items);
        setNextCode(data.nextCode);
        setError(null);
      } catch {
        setError(t('tailors.loadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    void load('');
  }, [load]);

  function setField(field: keyof TailorMeasurementDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function startEdit(item: TailorMeasurement) {
    setEditing(item);
    setDraft({
      customerName: item.customerName,
      phone: item.phone,
      shoulderCm: String(item.shoulderCm),
      armCm: String(item.armCm),
      waistCm: String(item.waistCm),
      chestCm: String(item.chestCm),
      heightCm: String(item.heightCm),
      buttCm: String(item.buttCm),
      cost: toPriceInput(item.costIqd),
      paid: toPriceInput(item.paidIqd),
      givenOn: item.givenOn,
      returnOn: item.returnOn,
    });
    setMessage(null);
    setError(null);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft(emptyDraft());
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    if (draft.returnOn && draft.givenOn && draft.returnOn < draft.givenOn) {
      setSaving(false);
      setError(t('tailors.errors.RETURN_BEFORE_GIVEN'));
      return;
    }
    const creating = !editing;
    try {
      const saved = editing
        ? await updateTailorMeasurement(editing.id, draft)
        : await createTailorMeasurement(draft);
      setMessage(
        creating
          ? t('tailors.saved', { code: saved.code })
          : t('tailors.updated', { code: saved.code })
      );
      if (creating) setReceipt(saved);
      cancelEdit();
      await load(query);
    } catch (saveError: unknown) {
      const code = errorMessage(saveError, '');
      const key = `tailors.errors.${code}`;
      const translated = t(key);
      setError(translated === key ? t('tailors.saveFailed') : translated);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: TailorMeasurement) {
    if (!window.confirm(t('tailors.removeConfirm', { code: item.code }))) return;
    setError(null);
    setMessage(null);
    try {
      await deleteTailorMeasurement(item.id);
      if (editing?.id === item.id) cancelEdit();
      setReceipt((current) => (current?.id === item.id ? null : current));
      setMessage(t('tailors.removed', { code: item.code }));
      await load(query);
    } catch {
      setError(t('tailors.saveFailed'));
    }
  }

  function handlePrintReceipt(item: TailorMeasurement) {
    const html = buildTailorReceiptHtml({
      title: t('tailors.receiptTitle'),
      codeLabel: t('tailors.code'),
      nameLabel: t('tailors.customerName'),
      givenLabel: t('tailors.givenOn'),
      returnLabel: t('tailors.returnOn'),
      costLabel: t('tailors.cost'),
      paidLabel: t('tailors.paid'),
      remainingLabel: t('tailors.remaining'),
      code: item.code,
      customerName: item.customerName,
      givenOn: formatReceiptDate(item.givenOn, i18n.language),
      returnOn: formatReceiptDate(item.returnOn, i18n.language),
      cost: formatCurrency(item.costIqd),
      paid: formatCurrency(item.paidIqd),
      remaining: formatCurrency(item.remainingIqd),
      dir: i18n.language === 'ckb' ? 'rtl' : 'ltr',
    });
    if (!printTailorReceipt(html)) {
      setError(t('errors.allowPopups'));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-black">{t('tailors.title')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">{t('tailors.subtitle')}</p>
        </div>
        {!editing && nextCode !== null && (
          <div className="rounded-2xl bg-black px-4 py-3 text-white">
            <p className="text-xs uppercase tracking-wide text-white/70">{t('tailors.nextCode')}</p>
            <p className="text-2xl font-bold">{nextCode}</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-black">
            {editing ? t('tailors.editing', { code: editing.code }) : t('tailors.newCustomer')}
          </h2>
          {editing && (
            <button type="button" className="text-sm font-semibold text-gray-600" onClick={cancelEdit}>
              {t('common.cancel')}
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">
            {t('tailors.customerName')}
            <input
              className="input-field mt-1"
              value={draft.customerName}
              onChange={(event) => setField('customerName', event.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t('tailors.phone')}
            <input
              className="input-field mt-1"
              value={draft.phone}
              onChange={(event) => setField('phone', event.target.value)}
              inputMode="tel"
              required
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sizeFields.map(([field, labelKey]) => (
            <label key={field} className="block text-sm font-medium text-gray-700">
              {t(labelKey)} ({t('tailors.cm')})
              <input
                className="input-field mt-1"
                type="number"
                min="0.1"
                max="400"
                step="0.1"
                value={draft[field]}
                onChange={(event) => setField(field, event.target.value)}
                required
              />
            </label>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">
            {t('tailors.cost')}
            <input
              className="input-field mt-1"
              type="number"
              min="0.01"
              step="0.01"
              value={draft.cost}
              onChange={(event) => setField('cost', event.target.value)}
              required
            />
            <span className="mt-1 block text-xs text-gray-500">
              {draft.cost ? formatCurrency(parsePriceInput(draft.cost)) : t('currency.thousandsHint')}
            </span>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t('tailors.paid')}
            <input
              className="input-field mt-1"
              type="number"
              min="0"
              step="0.01"
              value={draft.paid}
              onChange={(event) => setField('paid', event.target.value)}
              required
            />
            <span className="mt-1 block text-xs text-gray-500">
              {draft.paid ? formatCurrency(parsePriceInput(draft.paid)) : t('tailors.paidHint')}
            </span>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t('tailors.givenOn')}
            <input
              className="input-field mt-1"
              type="date"
              value={draft.givenOn}
              onChange={(event) => setField('givenOn', event.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t('tailors.returnOn')}
            <input
              className="input-field mt-1"
              type="date"
              value={draft.returnOn}
              min={draft.givenOn || undefined}
              onChange={(event) => setField('returnOn', event.target.value)}
              required
            />
          </label>
        </div>

        {message && (
          <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary mt-5" disabled={saving}>
          {saving ? t('common.saving') : editing ? t('common.saveChanges') : t('tailors.save')}
        </button>
      </form>

      <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <form
          className="mb-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void load(query);
          }}
        >
          <input
            className="input-field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('tailors.searchPlaceholder')}
          />
          <button type="submit" className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold">
            {t('common.search')}
          </button>
        </form>

        {loading ? (
          <p className="text-sm text-gray-500">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500">{query.trim() ? t('tailors.noResults') : t('tailors.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2">{t('tailors.code')}</th>
                  <th className="px-2 py-2">{t('tailors.customerName')}</th>
                  <th className="px-2 py-2">{t('tailors.phone')}</th>
                  <th className="px-2 py-2">{t('tailors.shoulder')}</th>
                  <th className="px-2 py-2">{t('tailors.arm')}</th>
                  <th className="px-2 py-2">{t('tailors.waist')}</th>
                  <th className="px-2 py-2">{t('tailors.chest')}</th>
                  <th className="px-2 py-2">{t('tailors.height')}</th>
                  <th className="px-2 py-2">{t('tailors.butt')}</th>
                  <th className="px-2 py-2">{t('tailors.cost')}</th>
                  <th className="px-2 py-2">{t('tailors.paid')}</th>
                  <th className="px-2 py-2">{t('tailors.remaining')}</th>
                  <th className="px-2 py-2">{t('tailors.givenOn')}</th>
                  <th className="px-2 py-2">{t('tailors.returnOn')}</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-2 py-3 font-bold text-black">{item.code}</td>
                    <td className="px-2 py-3">{item.customerName}</td>
                    <td className="px-2 py-3">{item.phone}</td>
                    <td className="px-2 py-3">{item.shoulderCm}</td>
                    <td className="px-2 py-3">{item.armCm}</td>
                    <td className="px-2 py-3">{item.waistCm}</td>
                    <td className="px-2 py-3">{item.chestCm}</td>
                    <td className="px-2 py-3">{item.heightCm}</td>
                    <td className="px-2 py-3">{item.buttCm}</td>
                    <td className="px-2 py-3">{formatCurrency(item.costIqd)}</td>
                    <td className="px-2 py-3">{formatCurrency(item.paidIqd)}</td>
                    <td className="px-2 py-3">{formatCurrency(item.remainingIqd)}</td>
                    <td className="whitespace-nowrap px-2 py-3">{item.givenOn}</td>
                    <td className="whitespace-nowrap px-2 py-3">{item.returnOn}</td>
                    <td className="px-2 py-3 text-right">
                      <button
                        type="button"
                        className="mr-3 font-semibold text-black"
                        onClick={() => setReceipt(item)}
                      >
                        {t('tailors.receipt')}
                      </button>
                      <button
                        type="button"
                        className="mr-3 font-semibold text-black"
                        onClick={() => startEdit(item)}
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        type="button"
                        className="font-semibold text-red-600"
                        onClick={() => void handleDelete(item)}
                      >
                        {t('common.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-3xl border-2 border-black bg-white p-6 shadow-xl"
            role="dialog"
            aria-labelledby="tailor-receipt-title"
          >
            <p id="tailor-receipt-title" className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              {t('tailors.receiptTitle')}
            </p>
            <p className="mt-4 text-xs uppercase tracking-wide text-gray-500">{t('tailors.code')}</p>
            <p className="text-5xl font-bold text-black">{receipt.code}</p>
            <p className="mt-4 text-xs uppercase tracking-wide text-gray-500">{t('tailors.customerName')}</p>
            <p className="text-2xl font-semibold text-black">{receipt.customerName}</p>
            <p className="mt-4 text-xs uppercase tracking-wide text-gray-500">{t('tailors.givenOn')}</p>
            <p className="text-lg font-semibold text-black">
              {formatReceiptDate(receipt.givenOn, i18n.language)}
            </p>
            <p className="mt-4 text-xs uppercase tracking-wide text-gray-500">{t('tailors.returnOn')}</p>
            <p className="text-lg font-semibold text-black">
              {formatReceiptDate(receipt.returnOn, i18n.language)}
            </p>
            <p className="mt-4 text-xs uppercase tracking-wide text-gray-500">{t('tailors.cost')}</p>
            <p className="text-lg font-semibold text-black">{formatCurrency(receipt.costIqd)}</p>
            <p className="mt-4 text-xs uppercase tracking-wide text-gray-500">{t('tailors.paid')}</p>
            <p className="text-lg font-semibold text-black">{formatCurrency(receipt.paidIqd)}</p>
            <p className="mt-4 text-xs uppercase tracking-wide text-gray-500">{t('tailors.remaining')}</p>
            <p className="text-lg font-semibold text-black">{formatCurrency(receipt.remainingIqd)}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={() => handlePrintReceipt(receipt)}>
                {t('tailors.printReceipt')}
              </button>
              <button
                type="button"
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold"
                onClick={() => setReceipt(null)}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tailors;
