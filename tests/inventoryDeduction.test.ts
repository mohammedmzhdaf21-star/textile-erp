import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inventoryBranchMismatchMessage } from '../src/lib/inventoryDeduction';

describe('inventoryBranchMismatchMessage', () => {
  it('returns null when branches match', () => {
    assert.equal(inventoryBranchMismatchMessage('B001', 'B001', 'ITEM-1'), null);
  });

  it('returns an error when branches differ', () => {
    const message = inventoryBranchMismatchMessage('B002', 'B001', 'ITEM-42');
    assert.match(message ?? '', /ITEM-42/);
    assert.match(message ?? '', /B002/);
    assert.match(message ?? '', /B001/);
  });
});
