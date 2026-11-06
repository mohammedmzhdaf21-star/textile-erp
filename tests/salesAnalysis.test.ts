import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  splitSalesByBaghdadDay,
  summarizeTasks,
  type AnalysisSale,
} from '../src/lib/salesAnalysis';

const sales: AnalysisSale[] = [
  {
    id: 'today-1',
    createdAt: '2026-11-07T08:00:00.000Z',
    totalPrice: 25000,
    employeeName: 'Sara',
    items: [
      { quantitySold: 2, soldPrice: 10000, lineDiscount: 0, colorName: 'Red', designCode: 12 },
      { quantitySold: 1, soldPrice: 5000, lineDiscount: 0, colorName: 'Red', designCode: 12 },
    ],
  },
  {
    id: 'yesterday',
    createdAt: '2026-11-06T12:00:00.000Z',
    totalPrice: 8000,
    employeeName: 'Hana',
    items: [
      { quantitySold: 1, soldPrice: 8000, colorName: 'Blue', designCode: 4 },
    ],
  },
];

describe('sales analysis', () => {
  it('splits every sale, today, and history by color and design code', () => {
    const report = splitSalesByBaghdadDay(sales, '2026-11-07');

    assert.equal(report.every.saleCount, 2);
    assert.equal(report.every.revenue, 33000);
    assert.equal(report.daily.saleCount, 1);
    assert.equal(report.history.saleCount, 1);

    const red = report.every.byDesignColor.find((row) => row.designCode === '12' && row.color === 'Red');
    assert.ok(red);
    assert.equal(red.quantity, 3);
    assert.equal(red.revenue, 25000);
    assert.equal(red.saleCount, 1);

    const blue = report.history.byDesignColor[0];
    assert.equal(blue.designCode, '4');
    assert.equal(blue.color, 'Blue');
    assert.equal(blue.revenue, 8000);
    assert.equal(report.daily.byDesignColor[0].designCode, '12');
  });

  it('counts open and done employee tasks, including design and color', () => {
    const tasks = summarizeTasks([
      { assignedTo: 'sara@textile.com', status: 'TODO', designCode: 12, colorName: 'Red' },
      { assignedTo: 'sara@textile.com', status: 'DONE', designCode: 12, colorName: 'Red' },
      { assignedTo: 'hana@textile.com', status: 'DONE' },
    ]);

    assert.equal(tasks.open, 1);
    assert.equal(tasks.done, 2);
    assert.deepEqual(tasks.byEmployee[0], { employee: 'sara@textile.com', open: 1, done: 1 });
    assert.equal(tasks.byDesignColor.length, 1);
    assert.equal(tasks.byDesignColor[0].designCode, '12');
    assert.equal(tasks.byDesignColor[0].color, 'Red');
    assert.equal(tasks.byDesignColor[0].open, 1);
    assert.equal(tasks.byDesignColor[0].done, 1);
  });
});
