import { PaymentMethod, Prisma } from '@prisma/client';

export type SalePaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export type SaleBalanceInput = {
  totalPrice: Prisma.Decimal | number | string;
  paymentMethod: PaymentMethod;
  notes?: string | null;
  isVoided?: boolean;
  payments?: Array<{ amount: Prisma.Decimal | number | string }>;
  refunds?: Array<{ amount: Prisma.Decimal | number | string }>;
};

export type SaleBalance = {
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  paymentStatus: SalePaymentStatus;
};

const toMoney = (value: Prisma.Decimal | number | string) => {
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseInitialPaidFromNotes = (notes?: string | null): number | null => {
  if (!notes) return null;
  const refundMatch = /Refunded\s+([0-9]+(?:\.[0-9]+)?)/i.exec(notes);
  if (refundMatch) return -toMoney(refundMatch[1]);
  const paidMatch = /Paid\s+(-?[0-9]+(?:\.[0-9]+)?)/i.exec(notes);
  if (paidMatch) return toMoney(paidMatch[1]);
  return null;
};

const isFullyPaidMethod = (method: PaymentMethod) =>
  method === 'CASH' || method === 'FIB' || method === 'CARD' || method === 'TRANSFER';

export const computeSaleBalance = (sale: SaleBalanceInput): SaleBalance => {
  const totalAmount = toMoney(sale.totalPrice);

  if (sale.isVoided) {
    return {
      totalAmount,
      paidAmount: 0,
      outstandingAmount: 0,
      paymentStatus: 'PAID',
    };
  }

  const paymentSum = (sale.payments ?? []).reduce((sum, payment) => sum + toMoney(payment.amount), 0);
  const refundSum = (sale.refunds ?? []).reduce((sum, refund) => sum + toMoney(refund.amount), 0);

  let paidAmount: number;
  if (paymentSum > 0) {
    paidAmount = paymentSum;
  } else {
    const fromNotes = parseInitialPaidFromNotes(sale.notes);
    if (fromNotes !== null) {
      paidAmount = fromNotes;
    } else if (sale.paymentMethod === 'CREDIT') {
      paidAmount = 0;
    } else if (isFullyPaidMethod(sale.paymentMethod)) {
      paidAmount = totalAmount;
    } else {
      paidAmount = 0;
    }
  }

  paidAmount = Math.max(0, paidAmount - refundSum);
  paidAmount = Math.min(totalAmount, Math.max(0, paidAmount));
  const outstandingAmount = Math.max(0, Number((totalAmount - paidAmount).toFixed(2)));
  const paymentStatus: SalePaymentStatus =
    outstandingAmount <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';

  return {
    totalAmount,
    paidAmount: Number(paidAmount.toFixed(2)),
    outstandingAmount,
    paymentStatus,
  };
};

export const enrichSaleWithBalance = <T extends SaleBalanceInput>(sale: T) => {
  const balance = computeSaleBalance(sale);
  return {
    ...sale,
    total: balance.totalAmount,
    paidAmount: balance.paidAmount,
    outstandingAmount: balance.outstandingAmount,
    paymentStatus: balance.paymentStatus,
  };
};
