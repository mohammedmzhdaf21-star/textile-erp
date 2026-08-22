import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { availableMetersForPieceItem } from '../src/lib/pieceCut';

describe('availableMetersForPieceItem', () => {
  it('returns remnant meters', () => {
    assert.equal(
      availableMetersForPieceItem({
        type: 'REMANENT',
        meters: { toString: () => '3.5' } as any,
        pieceLength: null,
        quantity: 1,
      }),
      3.5
    );
  });

  it('returns piece length times quantity', () => {
    assert.equal(
      availableMetersForPieceItem({
        type: 'PIECE',
        meters: null,
        pieceLength: { toString: () => '2.25' } as any,
        quantity: 1,
      }),
      2.25
    );
  });

  it('returns zero for piece packages', () => {
    assert.equal(
      availableMetersForPieceItem({
        type: 'PIECE',
        meters: null,
        pieceLength: { toString: () => '2.25' } as any,
        quantity: 1,
        isPiecePackage: true,
      }),
      0
    );
  });
});
