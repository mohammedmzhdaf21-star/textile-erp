export const IQD_THOUSANDS = 1000;
export const LEGACY_SHORTHAND_MAX = 500;

export function parsePriceInput(value: string | number): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * IQD_THOUSANDS * 100) / 100;
}

export function normalizeStoredAmount(value: string | number): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  if (amount > 0 && amount < LEGACY_SHORTHAND_MAX) {
    return amount * IQD_THOUSANDS;
  }
  return amount;
}

export async function migrateLegacySettingsPrices() {
  const { prisma } = await import('./prisma');
  const setting = await prisma.setting.findUnique({
    where: { key: 'item_minimum_prices' },
  });
  if (!setting?.value || typeof setting.value !== 'object' || Array.isArray(setting.value)) {
    return { updated: 0 };
  }

  const raw = setting.value as Record<string, unknown>;
  let updated = 0;
  const next: Record<string, unknown> = { ...raw };

  for (const [key, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = { ...(entry as Record<string, unknown>) };
    const minimumPrice = Number(record.minimumPrice);
    if (!Number.isFinite(minimumPrice) || minimumPrice <= 0) continue;
    const normalized = normalizeStoredAmount(minimumPrice);
    if (normalized !== minimumPrice) {
      record.minimumPrice = normalized;
      next[key] = record;
      updated += 1;
    }
  }

  if (updated > 0) {
    await prisma.setting.update({
      where: { key: 'item_minimum_prices' },
      data: { value: next as object },
    });
  }

  return { updated };
}
