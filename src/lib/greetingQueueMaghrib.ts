import { getAttendanceDayKey, getCalendarDayKey, ATTENDANCE_TIMEZONE } from './attendance';
import { hasMaghribPassed } from './sulaymaniyahMaghrib';
import type { QueueEmployee } from './greetingQueue';

export function resolveSnapshotStartIndex(
  queue: QueueEmployee[],
  snapshotIndex: number | null | undefined,
  snapshotEmployeeId: string | null | undefined
): number {
  if (queue.length === 0) return 0;

  if (snapshotEmployeeId) {
    const byId = queue.findIndex((employee) => employee.id === snapshotEmployeeId);
    if (byId >= 0) return byId;
  }

  if (typeof snapshotIndex === 'number' && Number.isFinite(snapshotIndex)) {
    return ((snapshotIndex % queue.length) + queue.length) % queue.length;
  }

  return 0;
}

export function shouldApplyMaghribRollover(input: {
  now: Date;
  maghribSnapshotDay: string | null | undefined;
  queueDayAppliedKey: string | null | undefined;
  timeZone?: string;
}): boolean {
  const timeZone = input.timeZone ?? ATTENDANCE_TIMEZONE;
  if (!input.maghribSnapshotDay) return false;

  const attendanceDayKey = getAttendanceDayKey(input.now, timeZone);
  if (input.queueDayAppliedKey === attendanceDayKey) return false;

  return attendanceDayKey > input.maghribSnapshotDay;
}

export function shouldCaptureMaghribSnapshot(input: {
  now: Date;
  maghribSnapshotDay: string | null | undefined;
  timeZone?: string;
}): boolean {
  const timeZone = input.timeZone ?? ATTENDANCE_TIMEZONE;
  if (!hasMaghribPassed(input.now, timeZone)) return false;

  const calendarDayKey = getCalendarDayKey(input.now, timeZone);
  return input.maghribSnapshotDay !== calendarDayKey;
}
