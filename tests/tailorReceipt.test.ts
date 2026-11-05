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
      code: 3,
      customerName: 'Sara Omar',
      givenOn: formatReceiptDate('2026-11-05', 'en'),
      returnOn: formatReceiptDate('2026-11-12', 'en'),
      dir: 'ltr',
    });

    assert.match(html, />3</);
    assert.match(html, /Sara Omar/);
    assert.match(html, /Thursday, 5 November 2026/);
    assert.match(html, /Thursday, 12 November 2026/);
    assert.match(html, /Date given to the tailor/);
    assert.match(html, /Day to give back to the customer/);
    assert.equal(formatReceiptDate('2026-11-12', 'ckb'), 'پێنجشەممە، 12ی تشرینی دووەم 2026');
  });

  it('escapes the customer name', () => {
    const html = buildTailorReceiptHtml({
      title: 'Tailor receipt',
      codeLabel: 'Code',
      nameLabel: 'Customer name',
      givenLabel: 'Given',
      returnLabel: 'Return',
      code: 4,
      customerName: '<Lana & Co>',
      givenOn: '5 November 2026',
      returnOn: '12 November 2026',
      dir: 'rtl',
    });
    assert.match(html, /dir="rtl"/);
    assert.match(html, /&lt;Lana &amp; Co&gt;/);
    assert.doesNotMatch(html, /<Lana & Co>/);
  });
});
