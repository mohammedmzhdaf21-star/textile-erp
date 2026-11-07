import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { baselineForSoldUnit, calculateSaleCommissions, type CommissionInputLine } from '../src/lib/commissionMath';

const BASE = 5000;
const RATE = 10;

function piece(id: string, baseline: number, sold: number, remnant = false): CommissionInputLine {
  return {
    id,
    isPlainCloth: false,
    isRemnant: remnant,
    soldAsUnit: 'PIECE',
    soldPrice: sold,
    quantitySold: 1,
    minimumPrice: baseline,
  };
}

function plain(id: string, total: number): CommissionInputLine {
  return {
    id,
    isPlainCloth: true,
    isRemnant: false,
    soldAsUnit: 'METER',
    soldPrice: total,
    quantitySold: 1,
    minimumPrice: null,
  };
}

function commissionOf(lines: CommissionInputLine[]) {
  return calculateSaleCommissions(lines, RATE, BASE)
    .filter((line) => line.commission > 0)
    .reduce((sum, line) => sum + line.commission, 0);
}

describe('baseline inherited from a roll', () => {
  it('turns a per-meter roll price into the piece baseline', () => {
    assert.equal(
      baselineForSoldUnit({
        minimumPrice: 55_000,
        priceUnit: 'METER',
        soldAsUnit: 'PIECE',
        pieceMeters: 2.25,
      }),
      123_750
    );
  });
});

describe('employee sale commission', () => {
  it('pays the baseline amount when a scanned item is sold at its baseline', () => {
    assert.equal(commissionOf([piece('item', 100_000, 100_000)]), 5_000);
  });

  it('does not pay commission for plain cloth, and deducts it from the scanned item', () => {
    assert.equal(commissionOf([plain('cloth', 15_000)]), 0);
    assert.equal(
      commissionOf([piece('item', 100_000, 100_000), plain('cloth', 15_000)]),
      5_000
    );
    assert.equal(
      commissionOf([piece('item', 100_000, 90_000), plain('cloth', 15_000)]),
      0
    );
  });

  it('adds ten percent of the amount above baseline plus plain cloth', () => {
    assert.equal(
      commissionOf([piece('item', 100_000, 185_000), plain('cloth', 15_000)]),
      13_500
    );
  });

  it('withholds commission under 100,000 even when the baseline plus plain cloth is lower', () => {
    assert.equal(
      commissionOf([piece('item', 60_000, 60_000), plain('cloth', 15_000)]),
      0
    );
    assert.equal(
      commissionOf([piece('item', 60_000, 85_000), plain('cloth', 15_000)]),
      5_000
    );
    assert.equal(
      commissionOf([piece('item', 60_000, 160_000), plain('cloth', 15_000)]),
      12_500
    );
  });

  it('pays only the baseline amount for a remnant, including sales under 100,000', () => {
    assert.equal(commissionOf([piece('remnant', 40_000, 40_000, true)]), 5_000);
    assert.equal(commissionOf([piece('remnant', 40_000, 90_000, true)]), 5_000);
    assert.equal(commissionOf([piece('remnant', 40_000, 30_000, true)]), 0);
    assert.equal(
      commissionOf([piece('remnant', 40_000, 40_000, true), plain('cloth', 15_000)]),
      5_000
    );
  });
});
