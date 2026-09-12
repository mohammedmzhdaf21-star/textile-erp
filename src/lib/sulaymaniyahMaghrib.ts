import { CalculationMethod, Coordinates, PrayerTimes } from 'adhan';
import { ATTENDANCE_TIMEZONE, getCalendarDayKey, zonedTimeToUtc } from './attendance';

/** Sulaymaniyah city center — used for local mosque Maghrib times. */
export const SULAYMANIYAH_COORDINATES = new Coordinates(35.556, 45.434);

const MAGHRIB_CALCULATION =
  process.env.MAGHRIB_CALCULATION_METHOD === 'Tehran'
    ? CalculationMethod.Tehran()
    : CalculationMethod.MuslimWorldLeague();

function parseCalendarDayKey(dayKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) {
    throw new Error(`Invalid calendar day key: ${dayKey}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** Maghrib instant (UTC) for a Baghdad calendar date in Sulaymaniyah. */
export function getMaghribInstantForCalendarDay(
  dayKey: string,
  timeZone: string = ATTENDANCE_TIMEZONE
): Date {
  const { year, month, day } = parseCalendarDayKey(dayKey);
  const noonUtc = zonedTimeToUtc(year, month, day, 12, 0, 0, timeZone);
  const prayers = new PrayerTimes(SULAYMANIYAH_COORDINATES, noonUtc, MAGHRIB_CALCULATION);
  return prayers.maghrib;
}

export function formatMaghribLocalTime(
  dayKey: string,
  timeZone: string = ATTENDANCE_TIMEZONE
): string {
  const maghrib = getMaghribInstantForCalendarDay(dayKey, timeZone);
  return maghrib.toLocaleString([], {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function hasMaghribPassed(
  now: Date = new Date(),
  timeZone: string = ATTENDANCE_TIMEZONE
): boolean {
  const dayKey = getCalendarDayKey(now, timeZone);
  const maghrib = getMaghribInstantForCalendarDay(dayKey, timeZone);
  return now.getTime() >= maghrib.getTime();
}
