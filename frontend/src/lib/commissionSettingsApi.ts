import api from './api';
import { normalizeStoredAmount } from './currency';
import type { CommissionSettings, ItemMinimumPrice } from './dashboardSettings';

type SettingsResponse = {
  rate: CommissionSettings;
  prices: Record<string, ItemMinimumPrice>;
};

const defaultRate = (): CommissionSettings => ({
  ratePercent: 5,
  baseAmountPerUnit: 0,
});

let cachedRate: CommissionSettings = defaultRate();
let cachedPrices: Record<string, ItemMinimumPrice> = {};

export function getCachedCommissionSettings(): CommissionSettings {
  return cachedRate;
}

export function getCachedItemMinimumPrices(): Record<string, ItemMinimumPrice> {
  return cachedPrices;
}

export function getCachedItemMinimumPrice(itemId: string): ItemMinimumPrice | undefined {
  const entry = cachedPrices[itemId.trim()];
  if (!entry) return undefined;
  return {
    ...entry,
    minimumPrice: normalizeStoredAmount(entry.minimumPrice),
  };
}

export async function fetchCommissionSettingsFromServer() {
  const response = await api.get<SettingsResponse>('/commissions/settings');
  const { rate, prices } = response.data;

  if (rate && Number.isFinite(rate.ratePercent)) {
    cachedRate = {
      ratePercent: rate.ratePercent,
      baseAmountPerUnit: normalizeStoredAmount(
        Number.isFinite(rate.baseAmountPerUnit) ? rate.baseAmountPerUnit : 0
      ),
    };
  }

  if (prices && typeof prices === 'object') {
    cachedPrices = Object.fromEntries(
      Object.entries(prices).map(([key, price]) => [
        key,
        price?.itemId
          ? {
              ...price,
              minimumPrice: normalizeStoredAmount(price.minimumPrice),
            }
          : price,
      ])
    );
  }

  return { rate: cachedRate, prices: cachedPrices };
}

export async function pushCommissionRateToServer(
  ratePercent: number,
  baseAmountPerUnit?: number
) {
  await api.put('/commissions/settings/rate', {
    ratePercent,
    ...(baseAmountPerUnit !== undefined ? { baseAmountPerUnit } : {}),
  });
  cachedRate = {
    ratePercent,
    baseAmountPerUnit: normalizeStoredAmount(baseAmountPerUnit ?? cachedRate.baseAmountPerUnit),
  };
}

export async function pushItemMinimumPriceToServer(price: ItemMinimumPrice) {
  await api.put('/commissions/settings/prices', { price });
  cachedPrices[price.itemId] = {
    ...price,
    minimumPrice: normalizeStoredAmount(price.minimumPrice),
  };
}

export async function ensureCommissionSettingsSynced() {
  try {
    await fetchCommissionSettingsFromServer();
  } catch {
    // Keep in-memory defaults when offline or unauthorized
  }
}
