import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tailorClothPieceCount, tailorCommissionIqd } from '../src/lib/tailorCommission';
import {
  tailorClothPieceCount as frontendPieces,
  tailorCommissionIqd as frontendCommission,
} from '../frontend/src/lib/tailorCommission';

const onePiece = [
  [25_000, 5_000],
  [30_000, 5_000],
  [35_000, 10_000],
  [40_000, 10_000],
  [45_000, 15_000],
  [50_000, 15_000],
  [55_000, 20_000],
  [60_000, 20_000],
  [65_000, 20_000],
] as const;

const severalPieces = [
  [35_000, 5_000],
  [40_000, 5_000],
  [45_000, 10_000],
  [50_000, 15_000],
  [55_000, 20_000],
  [60_000, 20_000],
  [65_000, 20_000],
] as const;

describe('tailor commission', () => {
  it('pays the one-piece schedule', () => {
    for (const [price, commission] of onePiece) {
      assert.equal(tailorCommissionIqd(1, price), commission);
      assert.equal(frontendCommission(1, price), commission);
    }
    assert.equal(tailorCommissionIqd(1, 24_000), 0);
    assert.equal(tailorCommissionIqd(1, 32_000), 5_000);
    assert.equal(tailorCommissionIqd(1, 70_000), 20_000);
  });

  it('pays the same schedule for two pieces and three pieces', () => {
    for (const pieces of [2, 3]) {
      for (const [price, commission] of severalPieces) {
        assert.equal(tailorCommissionIqd(pieces, price), commission);
        assert.equal(frontendCommission(pieces, price), commission);
      }
    }
    assert.equal(tailorCommissionIqd(2, 30_000), 0);
    assert.equal(tailorCommissionIqd(3, 42_000), 5_000);
    assert.equal(tailorCommissionIqd(4, 45_000), 10_000);
  });

  it('counts cloth pieces and leaves collar, tara, handwork, and repair out', () => {
    const garments = [
      { id: 'kawa', pieces: 1 },
      { id: 'underDress', pieces: 2 },
      { id: 'repair', pieces: 1 },
      { id: 'collar', pieces: 1 },
    ];
    assert.equal(tailorClothPieceCount(garments), 3);
    assert.equal(frontendPieces(garments), 3);
    assert.equal(tailorClothPieceCount([{ id: 'handwork', pieces: 2 }]), 0);
  });
});
