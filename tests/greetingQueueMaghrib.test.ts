import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveSnapshotStartIndex,
  shouldApplyMaghribRollover,
  shouldCaptureMaghribSnapshot,
} from '../src/lib/greetingQueueMaghrib';
import { getMaghribInstantForCalendarDay, hasMaghribPassed } from '../src/lib/sulaymaniyahMaghrib';

const sampleQueue = [
  { id: 'e1', name: 'Ali', email: 'ali@test.com', role: 'EMPLOYEE' },
  { id: 'e2', name: 'Sara', email: 'sara@test.com', role: 'EMPLOYEE' },
  { id: 'e3', name: 'Zaid', email: 'zaid@test.com', role: 'TRUSTEE' },
];

describe('resolveSnapshotStartIndex', () => {
  it('prefers employee id when staff roster is unchanged', () => {
    assert.equal(resolveSnapshotStartIndex(sampleQueue, 99, 'e2'), 1);
  });

  it('falls back to saved index when employee left the branch', () => {
    const queue = sampleQueue.filter((employee) => employee.id !== 'e2');
    assert.equal(resolveSnapshotStartIndex(queue, 1, 'e2'), 1);
  });
});

describe('maghrib rollover timing', () => {
  it('captures only after maghrib and once per calendar day', () => {
    const beforeMaghrib = new Date(getMaghribInstantForCalendarDay('2026-09-12').getTime() - 60_000);
    assert.equal(
      shouldCaptureMaghribSnapshot({ now: beforeMaghrib, maghribSnapshotDay: null }),
      false
    );

    const afterMaghrib = new Date(getMaghribInstantForCalendarDay('2026-09-12').getTime() + 60_000);
    assert.equal(
      shouldCaptureMaghribSnapshot({ now: afterMaghrib, maghribSnapshotDay: null }),
      true
    );
    assert.equal(
      shouldCaptureMaghribSnapshot({ now: afterMaghrib, maghribSnapshotDay: '2026-09-12' }),
      false
    );
  });

  it('applies snapshot on the next attendance day after maghrib day', () => {
    assert.equal(
      shouldApplyMaghribRollover({
        now: new Date('2026-09-12T10:00:00+03:00'),
        maghribSnapshotDay: '2026-09-11',
        queueDayAppliedKey: '2026-09-12',
      }),
      false
    );

    assert.equal(
      shouldApplyMaghribRollover({
        now: new Date('2026-09-13T07:00:00+03:00'),
        maghribSnapshotDay: '2026-09-12',
        queueDayAppliedKey: '2026-09-12',
      }),
      true
    );
  });

  it('returns a maghrib time in the Sulaymaniyah evening', () => {
    const maghrib = getMaghribInstantForCalendarDay('2026-09-12');
    const localHour = Number(
      maghrib.toLocaleString('en-GB', { timeZone: 'Asia/Baghdad', hour: 'numeric', hour12: false })
    );
    assert.ok(localHour >= 17 && localHour <= 20);
    assert.equal(hasMaghribPassed(new Date('2026-09-12T21:00:00+03:00')), true);
  });
});
