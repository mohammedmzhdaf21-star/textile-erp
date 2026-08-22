import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeSaleBalance,
  parseInitialPaidFromNotes,
} from '../src/lib/saleBalance';

describe('parseInitialPaidFromNotes', () => {
  it('parses paid amount from notes', () => {
    assert.equal(parseInitialPaidFromNotes('Paid 50000 now via Cash, due 10000.'), 50000);
  });

  it('parses refunded amount as negative', () => {
    assert.equal(parseInitialPaidFromNotes('Refunded 25000 for return'), -25000);
  });

  it('returns null when notes do not contain payment info', () => {
    assert.equal(parseInitialPaidFromNotes('Fully paid via Cash.'), null);
  });
});

describe('computeSaleBalance', () => {
  it('marks cash sales as fully paid', () => {
    const balance = computeSaleBalance({
      totalPrice: 100000,
      paymentMethod: 'CASH',
      notes: 'Fully paid via Cash.',
    });
    assert.equal(balance.paymentStatus, 'PAID');
    assert.equal(balance.outstandingAmount, 0);
    assert.equal(balance.paidAmount, 100000);
  });

  it('marks credit sales as unpaid when no payments recorded', () => {
    const balance = computeSaleBalance({
      totalPrice: 75000,
      paymentMethod: 'CREDIT',
      notes: 'Paid 25000 now via Cash, due 50000.',
    });
    assert.equal(balance.paymentStatus, 'PARTIAL');
    assert.equal(balance.paidAmount, 25000);
    assert.equal(balance.outstandingAmount, 50000);
  });

  it('uses payment rows when present', () => {
    const balance = computeSaleBalance({
      totalPrice: 80000,
      paymentMethod: 'CREDIT',
      payments: [{ amount: 30000 }, { amount: 20000 }],
    });
    assert.equal(balance.paymentStatus, 'PARTIAL');
    assert.equal(balance.paidAmount, 50000);
    assert.equal(balance.outstandingAmount, 30000);
  });

  it('returns zero outstanding for voided sales', () => {
    const balance = computeSaleBalance({
      totalPrice: 40000,
      paymentMethod: 'CREDIT',
      isVoided: true,
    });
    assert.equal(balance.paymentStatus, 'PAID');
    assert.equal(balance.outstandingAmount, 0);
    assert.equal(balance.paidAmount, 0);
  });
});
