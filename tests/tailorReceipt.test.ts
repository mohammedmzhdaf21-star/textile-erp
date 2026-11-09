import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTailorReceiptHtml, formatReceiptDate } from '../frontend/src/lib/tailorReceipt';

describe('tailor receipt', () => {
  it('writes the code, name, given day, and return day', () => {
    const html = buildTailorReceiptHtml({
      title: 'Tailor receipt',
      codeLabel: 'Code',
      nameLabel: 'Customer name',
      givenLabel: 'Date given to the tailor',
      returnLabel: 'Day to give back to the customer',
      costLabel: 'How much it is',
      paidLabel: 'How much the customer paid',
      remainingLabel: 'Still owed',
      code: 3,
      customerName: 'Sara Omar',
      givenOn: formatReceiptDate('2026-11-05', 'en'),
      returnOn: formatReceiptDate('2026-11-12', 'en'),
      cost: 'IQD 150,000',
      paid: 'IQD 50,000',
      remaining: 'IQD 100,000',
      clothesLabel: 'Clothes',
      clothes: ['کەوا — 2 pieces', 'ژێر کراس — One piece', 'کاری دەستی — 1 piece'],
      dir: 'ltr',
    });

    assert.match(html, />3</);
    assert.match(html, /Sara Omar/);
    assert.match(html, /Thursday, 5 November 2026/);
    assert.match(html, /Thursday, 12 November 2026/);
    assert.match(html, /Date given to the tailor/);
    assert.match(html, /Day to give back to the customer/);
    assert.match(html, /How much it is/);
    assert.match(html, /IQD 150,000/);
    assert.match(html, /How much the customer paid/);
    assert.match(html, /IQD 50,000/);
    assert.match(html, /Still owed/);
    assert.match(html, /IQD 100,000/);
    assert.match(html, /Clothes/);
    assert.match(html, /کەوا — 2 pieces/);
    assert.match(html, /ژێر کراس — One piece/);
    assert.match(html, /کاری دەستی — 1 piece/);
    assert.doesNotMatch(html, /commission/i);
    assert.doesNotMatch(html, /Employee who sold/);
    assert.equal(formatReceiptDate('2026-11-12', 'ckb'), 'پێنجشەممە، 12ی تشرینی دووەم 2026');
  });

  it('escapes the customer name', () => {
    const html = buildTailorReceiptHtml({
      title: 'Tailor receipt',
      codeLabel: 'Code',
      nameLabel: 'Customer name',
      givenLabel: 'Given',
      returnLabel: 'Return',
      costLabel: 'Cost',
      paidLabel: 'Paid',
      remainingLabel: 'Owed',
      code: 4,
      customerName: '<Lana & Co>',
      givenOn: '5 November 2026',
      returnOn: '12 November 2026',
      cost: 'IQD 10,000',
      paid: 'IQD 0',
      remaining: 'IQD 10,000',
      dir: 'rtl',
    });
    assert.match(html, /dir="rtl"/);
    assert.match(html, /&lt;Lana &amp; Co&gt;/);
    assert.doesNotMatch(html, /<Lana & Co>/);
  });
});
