import type { TFunction } from 'i18next';

export type SalePaymentChannel = 'CASH' | 'FIB';

export const isImmediatePaymentMethod = (method?: string | null) =>
  method === 'CASH' || method === 'FIB';

export const formatPaymentMethodLabel = (t: TFunction, method?: string | null) => {
  switch (method) {
    case 'CASH':
      return t('paymentMethod.cash');
    case 'FIB':
      return t('paymentMethod.fib');
    case 'CREDIT':
      return t('paymentMethod.credit');
    case 'CARD':
      return t('paymentMethod.card');
    case 'TRANSFER':
      return t('paymentMethod.transfer');
    default:
      return method || t('paymentMethod.unknown');
  }
};

export const paymentChannelFromNotes = (notes?: string | null): SalePaymentChannel | null => {
  if (!notes) return null;
  if (/\bvia\s+FIB\b/i.test(notes) || /\bFIB\b/i.test(notes)) return 'FIB';
  if (/\bvia\s+Cash\b/i.test(notes) || /\bvia\s+CASH\b/i.test(notes)) return 'CASH';
  return null;
};

export const resolveSalePaymentLabel = (
  t: TFunction,
  paymentMethod?: string | null,
  notes?: string | null
) => {
  if (isImmediatePaymentMethod(paymentMethod)) {
    return formatPaymentMethodLabel(t, paymentMethod);
  }
  const fromNotes = paymentChannelFromNotes(notes);
  if (fromNotes) return formatPaymentMethodLabel(t, fromNotes);
  return formatPaymentMethodLabel(t, paymentMethod);
};
