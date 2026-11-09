import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildInventoryItemId,
  designCodeFromIndex,
  formatPieceInstanceIdSuffix,
  isDesignCode,
  nextDesignCode,
  parsePieceInstanceNumberFromItem,
  resolvePieceInstanceKey,
} from '../src/lib/inventoryCodes';

describe('formatPieceInstanceIdSuffix', () => {
  it('maps piece instance keys to -Pxx suffixes', () => {
    assert.equal(formatPieceInstanceIdSuffix('piece-1'), '-P01');
    assert.equal(formatPieceInstanceIdSuffix('piece-2'), '-P02');
    assert.equal(formatPieceInstanceIdSuffix('piece-12'), '-P12');
    assert.equal(formatPieceInstanceIdSuffix(''), '');
    assert.equal(formatPieceInstanceIdSuffix('roll-1'), '');
  });
});

describe('parsePieceInstanceNumberFromItem', () => {
  it('reads instance numbers from ids and package keys', () => {
    assert.equal(parsePieceInstanceNumberFromItem({ id: 'B001-001-3500-REDP0225-P02' }), 2);
    assert.equal(parsePieceInstanceNumberFromItem({ packageKey: 'piece-3' }), 3);
    assert.equal(parsePieceInstanceNumberFromItem({ id: 'B001-001-3500-REDP0225' }), 1);
  });
});

describe('buildInventoryItemId with piece instances', () => {
  it('appends piece instance suffix for unique sales cuts', () => {
    const base = {
      branchId: 'B001',
      familyCode: 1,
      subCode: 3500,
      colorName: 'Red',
      colorId: 'color-red',
      type: 'PIECE' as const,
      pieceLength: 2.25,
    };

    assert.equal(
      buildInventoryItemId({ ...base, instanceKey: 'piece-1' }),
      'B001-001-3500-REDP0225-P01'
    );
    assert.equal(
      buildInventoryItemId({ ...base, instanceKey: 'piece-2' }),
      'B001-001-3500-REDP0225-P02'
    );
  });

  it('keeps shelf-stock ids without instance suffix', () => {
    assert.equal(
      buildInventoryItemId({
        branchId: 'B001',
        familyCode: 1,
        subCode: 3500,
        colorName: 'Red',
        colorId: 'color-red',
        type: 'PIECE',
        pieceLength: 2.25,
      }),
      'B001-001-3500-REDP0225'
    );
  });
});

describe('resolvePieceInstanceKey', () => {
  it('increments after legacy base id and suffixed pieces', () => {
    const next = resolvePieceInstanceKey({
      items: [
        {
          id: 'B001-001-3500-REDP0225',
          branchId: 'B001',
          code: 1,
          subCode: 3500,
          colorId: 'color-red',
          type: 'PIECE',
          pieceLength: 2.25,
          packageKey: '',
        },
        {
          id: 'B001-001-3500-REDP0225-P01',
          branchId: 'B001',
          code: 1,
          subCode: 3500,
          colorId: 'color-red',
          type: 'PIECE',
          pieceLength: 2.25,
          packageKey: 'piece-1',
        },
      ],
      branchId: 'B001',
      familyCode: 1,
      subCode: 3500,
      colorId: 'color-red',
      pieceLength: 2.25,
    });

    assert.equal(next, 'piece-2');
  });
});

describe('design codes', () => {
  it('walks a–z, then aa–zz, then aaa', () => {
    assert.equal(isDesignCode('Aa'), true);
    assert.equal(isDesignCode('a1'), false);
    assert.equal(isDesignCode('aaaa'), false);
    assert.equal(nextDesignCode([]), 'a');
    assert.equal(nextDesignCode(['a', 'b', 'A']), 'c');
    assert.equal(designCodeFromIndex(25), 'z');
    assert.equal(designCodeFromIndex(26), 'aa');
    assert.equal(designCodeFromIndex(27), 'ab');
    assert.equal(designCodeFromIndex(26 + 675), 'zz');
    assert.equal(designCodeFromIndex(26 + 676), 'aaa');
    const throughZ = Array.from({ length: 26 }, (_, index) => designCodeFromIndex(index));
    assert.equal(nextDesignCode(throughZ), 'aa');
  });

  it('puts the design letters into the item id and leaves old ids unchanged', () => {
    const base = {
      branchId: 'B001',
      familyCode: 1,
      subCode: 3500,
      colorName: 'Red',
      colorId: 'color-red',
      type: 'PIECE' as const,
      pieceLength: 2.25,
    };
    assert.equal(buildInventoryItemId(base), 'B001-001-3500-REDP0225');
    assert.equal(buildInventoryItemId({ ...base, designCode: 'ab' }), 'B001-001-AB-3500-REDP0225');
    assert.equal(buildInventoryItemId({ ...base, designCode: '' }), 'B001-001-3500-REDP0225');
  });
});
