import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TAILOR_GARMENTS } from '../src/lib/tailorGarments';
import { TAILOR_GARMENT_IDS } from '../frontend/src/lib/tailorGarments';

describe('tailor garment lists', () => {
  it('uses the same clothes on the server and in the form', () => {
    assert.deepEqual(
      TAILOR_GARMENTS.map((garment) => garment.id),
      [...TAILOR_GARMENT_IDS]
    );
  });
});
