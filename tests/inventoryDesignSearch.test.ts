import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateFamilyStock, buildInventoryLabelHtml, parseInventoryItemId } from '../frontend/src/lib/inventoryCodes';

describe('inventory design search', () => {
  it('reads the design letters from a scanned id and leaves old ids without a design', () => {
    const designed = parseInventoryItemId('B001-003-A-55000-BLAR');
    assert.equal(designed.familyCode, 3);
    assert.equal(designed.designCode, 'a');
    assert.equal(designed.colorCode, 'BLA');
    assert.equal(designed.type, 'ROLL');

    const plain = parseInventoryItemId('B001-001-3500-REDP0225');
    assert.equal(plain.designCode, '');
    assert.equal(plain.familyCode, 1);
    assert.equal(plain.subCode, 3500);
    assert.equal(plain.type, 'PIECE');
  });

  it('keeps stock on the scanned design', () => {
    const items = [
      {
        id: 'B001-003-A-55000-BLAR',
        branchId: 'B001',
        code: 3,
        designCode: 'a',
        colorId: 'black',
        type: 'ROLL' as const,
        meters: 100,
      },
      {
        id: 'B002-003-A-55000-BLAR',
        branchId: 'B002',
        code: 3,
        designCode: 'A',
        colorId: 'black',
        type: 'ROLL' as const,
        meters: 55,
      },
      {
        id: 'B001-003-B-55000-BLAR',
        branchId: 'B001',
        code: 3,
        designCode: 'b',
        colorId: 'black',
        type: 'ROLL' as const,
        meters: 100,
      },
    ];

    const designA = aggregateFamilyStock(items, 3, 'black', 'a');
    const branchA = designA.find((row) => row.branchId === 'B001');
    const branchB = designA.find((row) => row.branchId === 'B002');
    assert.equal(branchA?.rollMeters, 100);
    assert.equal(branchB?.rollMeters, 55);
    assert.equal(designA.reduce((sum, row) => sum + row.rollMeters, 0), 155);

    const designB = aggregateFamilyStock(items, 3, 'black', 'b');
    assert.equal(designB.find((row) => row.branchId === 'B001')?.rollMeters, 100);
    assert.equal(designB.find((row) => row.branchId === 'B002')?.rollMeters, 0);
  });

  it('prints only the QR image and the item code', () => {
    const html = buildInventoryLabelHtml(
      'B001-003-A-55000-BLAR',
      'data:image/png;base64,abc'
    );
    assert.match(html, /<img src="data:image\/png;base64,abc"/);
    assert.match(html, /B001-003-A-55000-BLAR/);
    assert.equal(html.includes('Family'), false);
    assert.equal(html.includes('Color'), false);
    assert.equal(html.includes('IQD'), false);
    assert.equal(html.includes('class="row"'), false);
  });
});
