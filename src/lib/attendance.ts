import crypto from 'crypto';
import QRCode from 'qrcode';
import { prisma } from './prisma';
import { roleHasFullAccess } from './employeeSections';

export const ATTENDANCE_RESET_HOUR = 6;
export const ATTENDANCE_TIMEZONE = process.env.ATTENDANCE_TIMEZONE || 'Asia/Baghdad';
export const ATTENDANCE_QR_PREFIX = 'ATT';

type ZonedParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
};

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);

  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '0';
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
  };
}

/** Calendar day key in the attendance timezone (midnight boundary). */
export function getCalendarDayKey(
  date: Date = new Date(),
  timeZone: string = ATTENDANCE_TIMEZONE
): string {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Calendar day key for the current attendance period (resets daily at 6:00 AM). */
export function getAttendanceDayKey(
  date: Date = new Date(),
  timeZone: string = ATTENDANCE_TIMEZONE
): string {
  const parts = getZonedParts(date, timeZone);
  const hour = Number(parts.hour);

  if (hour >= ATTENDANCE_RESET_HOUR) {
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  const utcMidnight = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const previous = new Date(utcMidnight - 86_400_000);
  const prev = getZonedParts(previous, timeZone);
  return `${prev.year}-${prev.month}-${prev.day}`;
}

function parseAttendanceDayKey(dayKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) {
    throw new Error('Invalid attendance day key');
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** UTC instant for a local wall-clock time in the attendance timezone. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string = ATTENDANCE_TIMEZONE
): Date {
  const desiredLocalMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  for (let offsetMinutes = -840; offsetMinutes <= 840; offsetMinutes += 15) {
    const candidate = new Date(desiredLocalMs - offsetMinutes * 60_000);
    const parts = Object.fromEntries(
      formatter.formatToParts(candidate).map((part) => [part.type, part.value])
    );
    const y = Number(parts.year);
    const m = Number(parts.month);
    const d = Number(parts.day);
    const h = Number(parts.hour);
    const min = Number(parts.minute);
    const s = Number(parts.second);
    if (y === year && m === month && d === day && h === hour && min === minute && s === second) {
      return candidate;
    }
  }

  return new Date(desiredLocalMs);
}

export function getAttendanceWindow(
  attendanceDay: string,
  timeZone: string = ATTENDANCE_TIMEZONE
) {
  const { year, month, day } = parseAttendanceDayKey(attendanceDay);
  const validFrom = zonedTimeToUtc(year, month, day, ATTENDANCE_RESET_HOUR, 0, 0, timeZone);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const validUntil = new Date(
    zonedTimeToUtc(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
      ATTENDANCE_RESET_HOUR,
      0,
      0,
      timeZone
    ).getTime() - 1
  );
  return { validFrom, validUntil };
}

export function buildAttendanceQrValue(branchId: string, attendanceDay: string, token: string) {
  return `${ATTENDANCE_QR_PREFIX}|${branchId}|${attendanceDay}|${token}`;
}

export function parseAttendanceQrValue(raw: string): {
  branchId: string;
  attendanceDay: string;
  token: string;
} | null {
  const cleaned = raw.trim().replace(/[\r\n\t\uFEFF\u200B-\u200D\u2060\u00A0]/g, '');
  if (!cleaned) return null;

  let value = cleaned;
  try {
    if (/^https?:\/\//i.test(cleaned)) {
      const url = new URL(cleaned);
      const param =
        url.searchParams.get('attendance') ??
        url.searchParams.get('token') ??
        url.searchParams.get('code');
      if (param?.trim()) {
        value = param.trim();
      } else {
        const segment = url.pathname.split('/').filter(Boolean).pop();
        if (segment) value = decodeURIComponent(segment);
      }
    }
  } catch {
    // keep cleaned value
  }

  const pipeMatch = value.match(/^ATT\|([A-Z]\d{3})\|(\d{4}-\d{2}-\d{2})\|([a-f0-9]+)$/i);
  if (pipeMatch) {
    return {
      branchId: pipeMatch[1].toUpperCase(),
      attendanceDay: pipeMatch[2],
      token: pipeMatch[3].toLowerCase(),
    };
  }

  const colonMatch = value.match(/^ATT:([A-Z]\d{3}):(\d{4}-\d{2}-\d{2}):([a-f0-9]+)$/i);
  if (colonMatch) {
    return {
      branchId: colonMatch[1].toUpperCase(),
      attendanceDay: colonMatch[2],
      token: colonMatch[3].toLowerCase(),
    };
  }

  return null;
}

async function getEmployeeBranchIds(employeeId: string): Promise<string[]> {
  const links = await prisma.branchEmployee.findMany({
    where: { employeeId, isActive: true, branch: { isActive: true, deletedAt: null } },
    select: { branchId: true },
  });
  return links.map((link) => link.branchId);
}

async function assertBranchExists(branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, isActive: true, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!branch) {
    throw new Error('Branch not found');
  }
  return branch;
}

export async function getOrCreateDailyAttendanceQr(branchId: string, now: Date = new Date()) {
  await assertBranchExists(branchId);

  const attendanceDay = getAttendanceDayKey(now);
  const existing = await prisma.branchDailyAttendanceQr.findUnique({
    where: { branchId_attendanceDay: { branchId, attendanceDay } },
  });

  if (existing) {
    const { validFrom, validUntil } = getAttendanceWindow(attendanceDay);
    if (now >= validFrom && now <= validUntil) {
      return formatDailyQr(existing, attendanceDay, validFrom, validUntil);
    }
  }

  const token = crypto.randomBytes(16).toString('hex');
  const qrCodeValue = buildAttendanceQrValue(branchId, attendanceDay, token);
  const qrCodeDataUrl = await QRCode.toDataURL(qrCodeValue, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 480,
  });
  const { validFrom, validUntil } = getAttendanceWindow(attendanceDay);

  const saved = await prisma.branchDailyAttendanceQr.upsert({
    where: { branchId_attendanceDay: { branchId, attendanceDay } },
    create: {
      branchId,
      attendanceDay,
      token,
      qrCodeValue,
      qrCodeDataUrl,
      validFrom,
      validUntil,
    },
    update: {
      token,
      qrCodeValue,
      qrCodeDataUrl,
      validFrom,
      validUntil,
    },
  });

  return formatDailyQr(saved, attendanceDay, validFrom, validUntil);
}

function formatDailyQr(
  row: {
    branchId: string;
    qrCodeValue: string;
    qrCodeDataUrl: string | null;
    validFrom: Date;
    validUntil: Date;
  },
  attendanceDay: string,
  validFrom: Date,
  validUntil: Date
) {
  return {
    branchId: row.branchId,
    attendanceDay,
    qrCodeValue: row.qrCodeValue,
    qrCodeDataUrl: row.qrCodeDataUrl,
    validFrom: validFrom.toISOString(),
    validUntil: validUntil.toISOString(),
    renewsAt: validUntil.toISOString(),
    resetHour: ATTENDANCE_RESET_HOUR,
    timezone: ATTENDANCE_TIMEZONE,
  };
}

export async function recordAttendanceCheckIn(input: {
  employeeId: string;
  employeeRole: string;
  qrValue: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const parsed = parseAttendanceQrValue(input.qrValue);
  if (!parsed) {
    throw new Error('Invalid attendance QR code');
  }

  const currentDay = getAttendanceDayKey(now);
  if (parsed.attendanceDay !== currentDay) {
    throw new Error('This QR code is expired. Scan today\'s branch QR from the tablet.');
  }

  const qrRow = await prisma.branchDailyAttendanceQr.findUnique({
    where: {
      branchId_attendanceDay: {
        branchId: parsed.branchId,
        attendanceDay: parsed.attendanceDay,
      },
    },
    include: { branch: { select: { id: true, name: true } } },
  });

  if (!qrRow || qrRow.token !== parsed.token) {
    throw new Error('Attendance QR code is not valid for this branch');
  }

  if (now < qrRow.validFrom || now > qrRow.validUntil) {
    throw new Error('Attendance QR code is outside the valid check-in window');
  }

  if (!roleHasFullAccess(input.employeeRole)) {
    const branchIds = await getEmployeeBranchIds(input.employeeId);
    if (!branchIds.includes(parsed.branchId)) {
      throw new Error('You are not assigned to this branch');
    }
  }

  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, isActive: true, deletedAt: null },
    select: { id: true, name: true, email: true },
  });
  if (!employee) {
    throw new Error('Account not found');
  }

  const existing = await prisma.attendanceRecord.findUnique({
    where: {
      employeeId_branchId_attendanceDay: {
        employeeId: input.employeeId,
        branchId: parsed.branchId,
        attendanceDay: parsed.attendanceDay,
      },
    },
  });

  if (existing) {
    return {
      alreadyCheckedIn: true as const,
      record: formatAttendanceRecord(existing, employee.name, qrRow.branch.name),
    };
  }

  const record = await prisma.attendanceRecord.create({
    data: {
      employeeId: input.employeeId,
      branchId: parsed.branchId,
      attendanceDay: parsed.attendanceDay,
      checkedInAt: now,
    },
  });

  return {
    alreadyCheckedIn: false as const,
    record: formatAttendanceRecord(record, employee.name, qrRow.branch.name),
  };
}

function formatAttendanceRecord(
  row: { id: string; branchId: string; attendanceDay: string; checkedInAt: Date },
  employeeName: string,
  branchName: string
) {
  return {
    id: row.id,
    branchId: row.branchId,
    branchName,
    employeeName,
    attendanceDay: row.attendanceDay,
    checkedInAt: row.checkedInAt.toISOString(),
  };
}

export async function listAttendanceRecords(input: {
  viewerId: string;
  viewerRole: string;
  branchId?: string;
  attendanceDay?: string;
  employeeId?: string;
}) {
  const day = input.attendanceDay ?? getAttendanceDayKey();
  const where: {
    attendanceDay: string;
    branchId?: string;
    employeeId?: string;
  } = { attendanceDay: day };

  if (input.branchId) {
    where.branchId = input.branchId;
  }

  if (roleHasFullAccess(input.viewerRole)) {
    if (input.employeeId) {
      where.employeeId = input.employeeId;
    }
  } else {
    where.employeeId = input.viewerId;
  }

  const rows = await prisma.attendanceRecord.findMany({
    where,
    orderBy: { checkedInAt: 'desc' },
    include: {
      employee: { select: { name: true, email: true } },
      branch: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    branchId: row.branchId,
    branchName: row.branch.name,
    employeeId: row.employeeId,
    employeeName: row.employee.name,
    employeeEmail: row.employee.email,
    attendanceDay: row.attendanceDay,
    checkedInAt: row.checkedInAt.toISOString(),
  }));
}
