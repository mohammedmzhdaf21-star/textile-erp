import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { normalizeStoredAmount } from './currency';

export const COMMISSION_RATE_KEY = 'commission_rate';
export const ITEM_MINIMUM_PRICES_KEY = 'item_minimum_prices';

export type ItemMinimumPriceRecord = {
  itemId: string;
  unit: 'METER' | 'PIECE';
  minimumPrice: number;
  updatedAt: string;
};

export type CommissionRateRecord = {
  ratePercent: number;
  /** Flat IQD paid per unit when sold at the item minimum price */
  baseAmountPerUnit: number;
};

const defaultRate = (): CommissionRateRecord => ({ ratePercent: 5, baseAmountPerUnit: 0 });

export async function getCommissionRate(): Promise<CommissionRateRecord> {
  const setting = await prisma.setting.findUnique({ where: { key: COMMISSION_RATE_KEY } });
  if (!setting?.value || typeof setting.value !== 'object') return defaultRate();
  const value = setting.value as Record<string, unknown>;
  const ratePercent = Number(value.ratePercent);
  const baseAmountPerUnit = Number(value.baseAmountPerUnit ?? 0);
  if (!Number.isFinite(ratePercent) || ratePercent < 0) return defaultRate();
  return {
    ratePercent,
    baseAmountPerUnit:
      Number.isFinite(baseAmountPerUnit) && baseAmountPerUnit >= 0 ? baseAmountPerUnit : 0,
  };
}

export async function saveCommissionRate(
  ratePercent: number,
  updatedById?: string,
  baseAmountPerUnit?: number
): Promise<CommissionRateRecord> {
  if (!Number.isFinite(ratePercent) || ratePercent < 0) {
    throw new Error('Commission rate must be a non-negative number');
  }

  const existing = await getCommissionRate();
  const resolvedBase =
    baseAmountPerUnit !== undefined ? baseAmountPerUnit : existing.baseAmountPerUnit;

  if (!Number.isFinite(resolvedBase) || resolvedBase < 0) {
    throw new Error('Base commission amount must be a non-negative number');
  }

  const value: CommissionRateRecord = { ratePercent, baseAmountPerUnit: resolvedBase };
  await prisma.setting.upsert({
    where: { key: COMMISSION_RATE_KEY },
    create: {
      key: COMMISSION_RATE_KEY,
      value: value as unknown as Prisma.InputJsonValue,
      description:
        'Employee commission: base amount at minimum price; percent of margin above minimum',
      updatedById: updatedById || null,
    },
    update: {
      value: value as unknown as Prisma.InputJsonValue,
      updatedById: updatedById || null,
    },
  });

  return value;
}

export async function getItemMinimumPrices(): Promise<Record<string, ItemMinimumPriceRecord>> {
  const setting = await prisma.setting.findUnique({ where: { key: ITEM_MINIMUM_PRICES_KEY } });
  if (!setting?.value || typeof setting.value !== 'object' || Array.isArray(setting.value)) {
    return {};
  }

  const raw = setting.value as Record<string, unknown>;
  const prices: Record<string, ItemMinimumPriceRecord> = {};

  for (const [key, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const minimumPrice = Number(record.minimumPrice);
    const unit = record.unit === 'PIECE' ? 'PIECE' : 'METER';
    if (!Number.isFinite(minimumPrice) || minimumPrice < 0) continue;
    prices[key] = {
      itemId: String(record.itemId || key),
      unit,
      minimumPrice: normalizeStoredAmount(minimumPrice),
      updatedAt: String(record.updatedAt || new Date().toISOString()),
    };
  }

  return prices;
}

export async function getItemMinimumPrice(itemId: string): Promise<ItemMinimumPriceRecord | null> {
  const prices = await getItemMinimumPrices();
  return prices[itemId.trim()] ?? null;
}

export async function saveItemMinimumPrice(
  price: ItemMinimumPriceRecord,
  updatedById?: string
): Promise<ItemMinimumPriceRecord> {
  if (!price.itemId?.trim()) throw new Error('Item ID is required');
  if (!Number.isFinite(price.minimumPrice) || price.minimumPrice < 0) {
    throw new Error('Minimum price must be a non-negative number');
  }

  const prices = await getItemMinimumPrices();
  const normalized: ItemMinimumPriceRecord = {
    itemId: price.itemId.trim(),
    unit: price.unit === 'PIECE' ? 'PIECE' : 'METER',
    minimumPrice: price.minimumPrice,
    updatedAt: price.updatedAt || new Date().toISOString(),
  };
  prices[normalized.itemId] = normalized;

  await prisma.setting.upsert({
    where: { key: ITEM_MINIMUM_PRICES_KEY },
    create: {
      key: ITEM_MINIMUM_PRICES_KEY,
      value: prices as unknown as Prisma.InputJsonValue,
      description: 'Minimum sale prices per inventory item for commission margin calculation',
      updatedById: updatedById || null,
    },
    update: {
      value: prices as unknown as Prisma.InputJsonValue,
      updatedById: updatedById || null,
    },
  });

  return normalized;
}

export async function saveItemMinimumPricesBulk(
  incoming: Record<string, ItemMinimumPriceRecord>,
  updatedById?: string
): Promise<Record<string, ItemMinimumPriceRecord>> {
  const prices = await getItemMinimumPrices();
  for (const entry of Object.values(incoming)) {
    if (!entry?.itemId?.trim()) continue;
    if (!Number.isFinite(entry.minimumPrice) || entry.minimumPrice < 0) continue;
    prices[entry.itemId.trim()] = {
      itemId: entry.itemId.trim(),
      unit: entry.unit === 'PIECE' ? 'PIECE' : 'METER',
      minimumPrice: entry.minimumPrice,
      updatedAt: entry.updatedAt || new Date().toISOString(),
    };
  }

  await prisma.setting.upsert({
    where: { key: ITEM_MINIMUM_PRICES_KEY },
    create: {
      key: ITEM_MINIMUM_PRICES_KEY,
      value: prices as unknown as Prisma.InputJsonValue,
      description: 'Minimum sale prices per inventory item for commission margin calculation',
      updatedById: updatedById || null,
    },
    update: {
      value: prices as unknown as Prisma.InputJsonValue,
      updatedById: updatedById || null,
    },
  });

  return prices;
}
