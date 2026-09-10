import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ATTENDANCE_RESET_HOUR,
  buildAttendanceQrValue,
  getAttendanceDayKey,
  getAttendanceWindow,
  parseAttendanceQrValue,
} from '../src/lib/attendance';

describe('getAttendanceDayKey', () => {
  it('uses the same calendar day after 6 AM', () => {
    const day = getAttendanceDayKey(
      new Date('2026-09-10T10:00:00+03:00'),
      'Asia/Baghdad'
    );
    assert.equal(day, '2026-09-10');
  });

  it('uses the previous calendar day before 6 AM', () => {
    const day = getAttendanceDayKey(
      new Date('2026-09-10T05:30:00+03:00'),
      'Asia/Baghdad'
    );
    assert.equal(day, '2026-09-09');
  });
});

describe('getAttendanceWindow', () => {
  it('renews at 6 AM the next day', () => {
    const { validFrom, validUntil } = getAttendanceWindow('2026-09-10', 'Asia/Baghdad');
    assert.equal(validFrom.toISOString(), '2026-09-10T03:00:00.000Z');
    assert.equal(validUntil.toISOString(), '2026-09-11T02:59:59.999Z');
    assert.equal(ATTENDANCE_RESET_HOUR, 6);
  });
});

describe('attendance QR payload', () => {
  it('builds and parses branch-specific daily values', () => {
    const value = buildAttendanceQrValue('B001', '2026-09-10', 'abc123');
    assert.equal(value, 'ATT|B001|2026-09-10|abc123');
    assert.deepEqual(parseAttendanceQrValue(value), {
      branchId: 'B001',
      attendanceDay: '2026-09-10',
      token: 'abc123',
    });
  });

  it('parses colon format and strips whitespace', () => {
    assert.deepEqual(parseAttendanceQrValue('ATT:B002:2026-09-11:deadbeef'), {
      branchId: 'B002',
      attendanceDay: '2026-09-11',
      token: 'deadbeef',
    });
  });
});
