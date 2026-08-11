export const CURRENCY_CODE = 'IQD';

const currencyFormatter = new Intl.NumberFormat('en-IQ', {
  style: 'currency',
  currency: CURRENCY_CODE,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCurrency(value: string | number): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return currencyFormatter.format(0);
  }
  return currencyFormatter.format(amount);
}

export function formatSignedCurrency(value: string | number): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return formatCurrency(0);
  }
  if (amount < 0) {
    return `-${formatCurrency(Math.abs(amount))}`;
  }
  return formatCurrency(amount);
}

export function formatCurrencyNumber(value: string | number): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return '0';
  }
  return amount.toLocaleString('en-IQ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
