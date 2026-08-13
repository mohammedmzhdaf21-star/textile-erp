import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  createPlainClothType,
  deletePlainClothType,
  fetchPlainClothTypes,
  isPlainClothOfflineMode,
  reconnectPlainClothApi,
  updatePlainClothType,
  type PlainClothType,
} from '../lib/plainClothApi';
import { formatCurrency, parsePriceInput, toPriceInput } from '../lib/currency';

function getApiErrorMessage(
  error: unknown,
  fallback: string,
  apiUnavailable: string
): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (
      error as { response?: { status?: number; data?: { error?: string; message?: string } } }
    ).response;
    if (response?.status === 404) {
      return apiUnavailable;
    }
    if (response?.data?.error) return response.data.error;
    if (response?.data?.message) return response.data.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function PlainClothPricing() {
  const { t } = useTranslation();
  const [items, setItems] = useState<PlainClothType[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [pricePerMeter, setPricePerMeter] = useState('0');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchPlainClothTypes(true);
      setItems(list.filter((item) => item.isActive));
      setOffline(isPlainClothOfflineMode());
      if (isPlainClothOfflineMode()) {
        setError(null);
      }
    } catch (loadError: unknown) {
      setError(
        getApiErrorMessage(
          loadError,
          t('plainClothPricing.loadFailed'),
          t('plainClothPricing.apiUnavailable')
        )
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const resetForm = () => {
    setName('');
    setPricePerMeter('0');
    setEditingId(null);
  };

  const startEdit = (item: PlainClothType) => {
    setEditingId(item.id);
    setName(item.name);
    setPricePerMeter(toPriceInput(item.pricePerM));
    setMessage(null);
    setError(null);
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await reconnectPlainClothApi();
      if (result.online) {
        setOffline(false);
        await loadItems();
        setMessage(
          result.synced > 0
            ? t('plainClothPricing.reconnectedSynced', { count: result.synced })
            : t('plainClothPricing.reconnected')
        );
      } else {
        setOffline(true);
        setError(t('plainClothPricing.refreshBrowser'));
      }
    } catch (reconnectError: unknown) {
      setError(
        reconnectError instanceof Error
          ? reconnectError.message
          : t('plainClothPricing.loadFailed')
      );
    } finally {
      setReconnecting(false);
    }
  };

  const saveItem = async () => {
    const trimmedName = name.trim();
    const storedPrice = parsePriceInput(pricePerMeter);
    if (!trimmedName) return alert(t('plainClothPricing.enterName'));
    if (!Number.isFinite(Number(pricePerMeter)) || Number(pricePerMeter) < 0) {
      return alert(t('plainClothPricing.enterValidPrice'));
    }

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      if (editingId) {
        await updatePlainClothType(editingId, { name: trimmedName, pricePerM: storedPrice });
        setMessage(
          t('plainClothPricing.updated', {
            name: trimmedName,
            price: formatCurrency(storedPrice),
          })
        );
      } else {
        await createPlainClothType(trimmedName, storedPrice);
        setMessage(
          isPlainClothOfflineMode()
            ? t('plainClothPricing.savedLocal', {
                name: trimmedName,
                price: formatCurrency(storedPrice),
              })
            : t('plainClothPricing.saved', {
                name: trimmedName,
                price: formatCurrency(storedPrice),
              })
        );
      }
      resetForm();
      await loadItems();
      setOffline(isPlainClothOfflineMode());
    } catch (saveError: unknown) {
      setError(
        getApiErrorMessage(saveError, t('plainClothPricing.saveFailed'), t('plainClothPricing.apiUnavailable'))
      );
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (item: PlainClothType) => {
    const confirmed = window.confirm(t('plainClothPricing.confirmDelete', { name: item.name }));
    if (!confirmed) return;

    setError(null);
    try {
      await deletePlainClothType(item.id);
      if (editingId === item.id) resetForm();
      setMessage(t('plainClothPricing.deleted', { name: item.name }));
      await loadItems();
    } catch (deleteError: unknown) {
      setError(
        getApiErrorMessage(
          deleteError,
          t('plainClothPricing.deleteFailed'),
          t('plainClothPricing.apiUnavailable')
        )
      );
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-black">{t('nav.plainClothPricing')}</h1>
        <p className="mt-1 text-sm text-gray-600">{t('plainClothPricing.subtitle')}</p>
        <p className="mt-1 text-xs text-gray-500">{t('currency.thousandsHint')}</p>
        <Link to="/sales" className="mt-2 inline-block text-sm font-medium text-magenta-600 hover:underline">
          {t('plainClothPricing.backToSales')}
        </Link>
        {offline && (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>{t('plainClothPricing.offlineMode')}</p>
            <button
              type="button"
              className="btn-secondary mt-3"
              disabled={reconnecting}
              onClick={() => void handleReconnect()}
            >
              {reconnecting ? t('common.loading') : t('plainClothPricing.reconnectServer')}
            </button>
          </div>
        )}
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-black">
          {editingId ? t('plainClothPricing.editTitle') : t('plainClothPricing.addTitle')}
        </h2>

        <label className="mt-4 block text-sm font-medium text-gray-700">
          {t('plainClothPricing.clothName')}
        </label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('plainClothPricing.namePlaceholder')}
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
        />

        <label className="mt-4 block text-sm font-medium text-gray-700">
          {t('sales.pricePerMeter')}
        </label>
        <input
          type="number"
          min="0"
          step="1"
          value={pricePerMeter}
          onChange={(event) => setPricePerMeter(event.target.value)}
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={saving} onClick={() => void saveItem()} className="btn-primary">
            {saving
              ? t('common.saving')
              : editingId
              ? t('plainClothPricing.updateButton')
              : t('plainClothPricing.saveButton')}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="btn-secondary">
              {t('common.cancel')}
            </button>
          )}
        </div>

        {message && <p className="mt-3 text-sm text-magenta-600">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-black">{t('plainClothPricing.savedTypes')}</h2>
        {loading ? (
          <p className="mt-4 text-sm text-gray-500">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">{t('plainClothPricing.noTypes')}</p>
        ) : (
          <div className="mt-4 space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${
                  editingId === item.id
                    ? 'border-magenta-500 bg-magenta-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div>
                  <div className="font-semibold text-black">{item.name}</div>
                  <div className="text-sm text-magenta-600">
                    {t('plainClothPricing.pricePerMeter', {
                      price: formatCurrency(item.pricePerM),
                    })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeItem(item)}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
