import api from './api';
import {
  readCommissionSettings,
  readItemMinimumPrices,
  saveCommissionSettings,
  saveItemMinimumPrice,
  type CommissionSettings,
  type ItemMinimumPrice,
} from './dashboardSettings';
import { normalizeStoredAmount } from './currency';

type SettingsResponse = {
  rate: CommissionSettings;
  prices: Record<string, ItemMinimumPrice>;
};

export async function syncCommissionSettingsFromServer() {
  try {
    const response = await api.get<SettingsResponse>('/commissions/settings');
    const { rate, prices } = response.data;

    if (rate && Number.isFinite(rate.ratePercent)) {
      saveCommissionSettings({
        ratePercent: rate.ratePercent,
        baseAmountPerUnit: normalizeStoredAmount(
          Number.isFinite(rate.baseAmountPerUnit) ? rate.baseAmountPerUnit : 0
        ),
      });
    }

    if (prices && typeof prices === 'object') {
      for (const price of Object.values(prices)) {
        if (price?.itemId) {
          saveItemMinimumPrice({
            ...price,
            minimumPrice: normalizeStoredAmount(price.minimumPrice),
          });
        }
      }
    }
  } catch {
    // Keep local settings when offline or unauthorized
  }
}

export async function pushCommissionRateToServer(
  ratePercent: number,
  baseAmountPerUnit?: number
) {
  await api.put('/commissions/settings/rate', {
    ratePercent,
    ...(baseAmountPerUnit !== undefined ? { baseAmountPerUnit } : {}),
  });
}

export async function pushItemMinimumPriceToServer(price: ItemMinimumPrice) {
  await api.put('/commissions/settings/prices', { price });
}

export async function pushLocalPricesToServer() {
  const prices = readItemMinimumPrices();
  if (Object.keys(prices).length === 0) return;
  await api.put('/commissions/settings/prices', { prices });
}

export async function pushLocalRateToServer() {
  const rate = readCommissionSettings();
  await api.put('/commissions/settings/rate', {
    ratePercent: rate.ratePercent,
    baseAmountPerUnit: rate.baseAmountPerUnit,
  });
}

export async function ensureCommissionSettingsSynced() {
  const localPrices = readItemMinimumPrices();
  const hasLocal = Object.keys(localPrices).length > 0;

  try {
    const response = await api.get<SettingsResponse>('/commissions/settings');
    const serverPrices = response.data.prices || {};
    const hasServer = Object.keys(serverPrices).length > 0;

    if (hasServer) {
      await syncCommissionSettingsFromServer();
    } else if (hasLocal) {
      await pushLocalPricesToServer();
      await pushLocalRateToServer();
    }
  } catch {
    // Ignore sync errors on startup
  }
}
