import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocateCombinedSaleTotal, type CombinedPriceLine } from '../src/lib/combinedSalePrice';

function totals(lines: CombinedPriceLine[], combined: number) {
  return allocateCombinedSaleTotal(lines, combined).map((line) => line.lineTotal);
}

describe('one sale total for scanned items and plain cloth', () => {
  it('keeps the plain cloth cost and gives the rest to the scanned item', () => {
    assert.deepEqual(
      totals(
        [
          { id: 'item', isPlainCloth: false, clothCost: 0, baseline: 100000 },
          { id: 'cloth', isPlainCloth: true, clothCost: 15000, baseline: 0 },
        ],
        200000
      ),
      [185000, 15000]
    );
  });

  it('splits the remainder across scanned items by baseline', () => {
    assert.deepEqual(
      totals(
        [
          { id: 'a', isPlainCloth: false, clothCost: 0, baseline: 100000 },
          { id: 'b', isPlainCloth: false, clothCost: 0, baseline: 50000 },
          { id: 'cloth', isPlainCloth: true, clothCost: 15000, baseline: 0 },
        ],
        300000
      ),
      [190000, 95000, 15000]
    );
  });

  it('keeps every plain cloth cost when several cloths are in the cart', () => {
    assert.deepEqual(
      totals(
        [
          { id: 'item', isPlainCloth: false, clothCost: 0, baseline: 100000 },
          { id: 'atlas', isPlainCloth: true, clothCost: 8000, baseline: 0 },
          { id: 'silk', isPlainCloth: true, clothCost: 7000, baseline: 0 },
        ],
        200000
      ),
      [185000, 8000, 7000]
    );
  });

  it('splits evenly when a scanned item has no baseline', () => {
    assert.deepEqual(
      totals(
        [
          { id: 'a', isPlainCloth: false, clothCost: 0, baseline: 0 },
          { id: 'b', isPlainCloth: false, clothCost: 0, baseline: 100000 },
        ],
        80000
      ),
      [40000, 40000]
    );
  });

  it('uses the typed total for a cloth-only sale', () => {
    assert.deepEqual(
      totals(
        [
          { id: 'a', isPlainCloth: true, clothCost: 10000, baseline: 0 },
          { id: 'b', isPlainCloth: true, clothCost: 20000, baseline: 0 },
        ],
        60000
      ),
      [20000, 40000]
    );
  });

  it('gives the whole total to cloth when the cloth cost is higher', () => {
    assert.deepEqual(
      totals(
        [
          { id: 'item', isPlainCloth: false, clothCost: 0, baseline: 100000 },
          { id: 'cloth', isPlainCloth: true, clothCost: 15000, baseline: 0 },
        ],
        10000
      ),
      [0, 10000]
    );
  });

  it('makes the line totals add up to the typed price', () => {
    const lines = [1, 2, 3].map((id) => ({
      id: String(id),
      isPlainCloth: false,
      clothCost: 0,
      baseline: 100000,
    }));
    const allocated = totals(lines, 10);
    assert.equal(
      allocated.reduce((sum, value) => sum + value, 0),
      10
    );
  });
});
