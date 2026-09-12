import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickCurrentAndNext } from '../src/lib/greetingQueue';

const sampleQueue = [
  { id: 'e1', name: 'Ali', email: 'ali@test.com', role: 'EMPLOYEE' },
  { id: 'e2', name: 'Sara', email: 'sara@test.com', role: 'EMPLOYEE' },
  { id: 'e3', name: 'Zaid', email: 'zaid@test.com', role: 'TRUSTEE' },
];

describe('pickCurrentAndNext', () => {
  it('returns null when the queue is empty', () => {
    const result = pickCurrentAndNext([], 0);
    assert.equal(result.current, null);
    assert.equal(result.next, null);
    assert.equal(result.normalizedIndex, 0);
  });

  it('picks the first employee at index 0', () => {
    const result = pickCurrentAndNext(sampleQueue, 0);
    assert.equal(result.current?.id, 'e1');
    assert.equal(result.next?.id, 'e2');
    assert.equal(result.normalizedIndex, 0);
  });

  it('wraps to the first employee after the last one', () => {
    const result = pickCurrentAndNext(sampleQueue, 2);
    assert.equal(result.current?.id, 'e3');
    assert.equal(result.next?.id, 'e1');
  });

  it('normalizes negative and overflow indices', () => {
    const negative = pickCurrentAndNext(sampleQueue, -1);
    assert.equal(negative.current?.id, 'e3');
    assert.equal(negative.next?.id, 'e1');

    const overflow = pickCurrentAndNext(sampleQueue, 4);
    assert.equal(overflow.current?.id, 'e2');
    assert.equal(overflow.next?.id, 'e3');
  });
});
