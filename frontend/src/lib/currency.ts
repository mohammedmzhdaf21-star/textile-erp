export const CURRENCY_CODE = 'IQD';

/** One unit typed in price fields equals this many Iraqi dinars (20 → 20,000 IQD). */
export const IQD_THOUSANDS = 1000;

/** Values below this in the database were saved as shorthand thousands before migration. */
export const LEGACY_SHORTHAND_MAX = 500;

const currencyFormatter = new Intl.NumberFormat('en-IQ', {
  style: 'currency',
  currency: CURRENCY_CODE,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Convert shorthand input (thousands) to stored IQD amount. */
export function parsePriceInput(value: string | number): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * IQD_THOUSANDS * 100) / 100;
}

/** Convert stored IQD to shorthand for price input fields. */
export function toPriceInput(value: string | number): string {
  const stored = normalizeStoredAmount(value);
  if (!Number.isFinite(stored)) return '0';
  const shorthand = stored / IQD_THOUSANDS;
  if (Number.isInteger(shorthand)) return String(shorthand);
  return shorthand.toFixed(2).replace(/\.?0+$/, '');
}

export function toPriceInputNumber(value: string | number): number {
  return Number(toPriceInput(value));
}

/** Upgrade legacy values that were stored as shorthand thousands (e.g. 20 instead of 20000). */
export function normalizeStoredAmount(value: string | number): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  if (amount > 0 && amount < LEGACY_SHORTHAND_MAX) {
    return amount * IQD_THOUSANDS;
  }
  return amount;
}

export function formatCurrency(value: string | number): string {
  const amount = normalizeStoredAmount(value);
  if (!Number.isFinite(amount)) {
    return currencyFormatter.format(0);
  }
  return currencyFormatter.format(amount);
}

export function formatSignedCurrency(value: string | number): string {
  const amount = normalizeStoredAmount(value);
  if (!Number.isFinite(amount)) {
    return formatCurrency(0);
  }
  if (amount < 0) {
    return `-${formatCurrency(Math.abs(amount))}`;
  }
  return formatCurrency(amount);
}

export function formatCurrencyNumber(value: string | number): string {
  const amount = normalizeStoredAmount(value);
  if (!Number.isFinite(amount)) {
    return '0';
  }
  return amount.toLocaleString('en-IQ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
