import { prisma } from './prisma';
import { roleHasFullAccess } from './employeeSections';
import { writeAuditLog } from './auditLog';
import { getAttendanceDayKey, getAttendanceWindow, ATTENDANCE_TIMEZONE } from './attendance';
import {
  resolveSnapshotStartIndex,
  shouldApplyMaghribRollover,
  shouldCaptureMaghribSnapshot,
} from './greetingQueueMaghrib';
import { formatMaghribLocalTime, getCalendarDayKey, hasMaghribPassed } from './sulaymaniyahMaghrib';

export type QueueEmployee = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type GreetingQueueState = {
  branchId: string;
  branchName: string;
  currentIndex: number;
  queue: QueueEmployee[];
  current: QueueEmployee | null;
  next: QueueEmployee | null;
  isMyTurn: boolean;
  totalToday: number;
  maghribTimeLabel: string;
  maghribPassedToday: boolean;
  nextDayStartsWith: QueueEmployee | null;
};

async function assertBranch(branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, isActive: true, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!branch) {
    throw new Error('Branch not found');
  }
  return branch;
}

export async function listBranchQueueEmployees(branchId: string): Promise<QueueEmployee[]> {
  const links = await prisma.branchEmployee.findMany({
    where: {
      branchId,
      isActive: true,
      employee: {
        isActive: true,
        deletedAt: null,
        role: { in: ['EMPLOYEE', 'TRUSTEE', 'MANAGER'] },
      },
    },
    include: {
      employee: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
    orderBy: { employee: { name: 'asc' } },
  });

  return links.map((link) => link.employee);
}

export function pickCurrentAndNext(queue: QueueEmployee[], currentIndex: number) {
  if (queue.length === 0) {
    return { current: null, next: null, normalizedIndex: 0 };
  }
  const normalizedIndex = ((currentIndex % queue.length) + queue.length) % queue.length;
  const current = queue[normalizedIndex] ?? null;
  const next = queue[(normalizedIndex + 1) % queue.length] ?? null;
  return { current, next, normalizedIndex };
}

function buildMaghribMeta(now: Date, queue: QueueEmployee[], row: {
  maghribSnapshotIndex: number | null;
  maghribSnapshotEmployeeId: string | null;
  maghribSnapshotDay: string | null;
}) {
  const calendarDayKey = getCalendarDayKey(now, ATTENDANCE_TIMEZONE);
  const maghribTimeLabel = formatMaghribLocalTime(calendarDayKey, ATTENDANCE_TIMEZONE);
  const maghribPassedToday = hasMaghribPassed(now, ATTENDANCE_TIMEZONE);

  let nextDayStartsWith: QueueEmployee | null = null;
  if (row.maghribSnapshotDay === calendarDayKey && maghribPassedToday) {
    const startIndex = resolveSnapshotStartIndex(
      queue,
      row.maghribSnapshotIndex,
      row.maghribSnapshotEmployeeId
    );
    nextDayStartsWith = queue[startIndex] ?? null;
  }

  return { maghribTimeLabel, maghribPassedToday, nextDayStartsWith };
}

async function applyMaghribRolloverIfNeeded(
  branchId: string,
  row: {
    branchId: string;
    currentIndex: number;
    maghribSnapshotIndex: number | null;
    maghribSnapshotEmployeeId: string | null;
    maghribSnapshotDay: string | null;
    queueDayAppliedKey: string | null;
  },
  queue: QueueEmployee[],
  now: Date = new Date()
) {
  if (
    !shouldApplyMaghribRollover({
      now,
      maghribSnapshotDay: row.maghribSnapshotDay,
      queueDayAppliedKey: row.queueDayAppliedKey,
    })
  ) {
    return row;
  }

  const nextIndex = resolveSnapshotStartIndex(
    queue,
    row.maghribSnapshotIndex,
    row.maghribSnapshotEmployeeId
  );
  const attendanceDayKey = getAttendanceDayKey(now, ATTENDANCE_TIMEZONE);

  const updated = await prisma.branchGreetingQueue.update({
    where: { branchId },
    data: {
      currentIndex: nextIndex,
      queueDayAppliedKey: attendanceDayKey,
    },
  });

  await writeAuditLog({
    action: 'UPDATE',
    entityType: 'GREETING_QUEUE',
    entityId: branchId,
    branchId,
    changes: {
      maghribRollover: true,
      appliedForDay: attendanceDayKey,
      maghribSnapshotDay: row.maghribSnapshotDay,
      startIndex: nextIndex,
      startEmployeeId: row.maghribSnapshotEmployeeId,
    },
  });

  return updated;
}

async function syncQueueRow(branchId: string, now: Date = new Date()) {
  const row = await prisma.branchGreetingQueue.upsert({
    where: { branchId },
    create: { branchId, currentIndex: 0 },
    update: {},
  });
  const queue = await listBranchQueueEmployees(branchId);
  return applyMaghribRolloverIfNeeded(branchId, row, queue, now);
}

async function getOrCreateQueueRow(branchId: string, now: Date = new Date()) {
  return syncQueueRow(branchId, now);
}

export async function captureMaghribQueueSnapshots(now: Date = new Date()) {
  const branches = await prisma.branch.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true },
  });

  for (const branch of branches) {
    const row = await prisma.branchGreetingQueue.findUnique({
      where: { branchId: branch.id },
    });
    if (!row) continue;

    if (
      !shouldCaptureMaghribSnapshot({
        now,
        maghribSnapshotDay: row.maghribSnapshotDay,
      })
    ) {
      continue;
    }

    const queue = await listBranchQueueEmployees(branch.id);
    if (queue.length === 0) continue;

    const { normalizedIndex, current } = pickCurrentAndNext(queue, row.currentIndex);
    const calendarDayKey = getCalendarDayKey(now, ATTENDANCE_TIMEZONE);

    await prisma.branchGreetingQueue.update({
      where: { branchId: branch.id },
      data: {
        maghribSnapshotIndex: normalizedIndex,
        maghribSnapshotEmployeeId: current?.id ?? null,
        maghribSnapshotDay: calendarDayKey,
      },
    });

    await writeAuditLog({
      action: 'UPDATE',
      entityType: 'GREETING_QUEUE',
      entityId: branch.id,
      branchId: branch.id,
      changes: {
        maghribSnapshot: true,
        snapshotDay: calendarDayKey,
        snapshotIndex: normalizedIndex,
        snapshotEmployeeId: current?.id ?? null,
        snapshotEmployeeName: current?.name ?? null,
      },
    });
  }
}

export async function processGreetingQueueSchedule(now: Date = new Date()) {
  await captureMaghribQueueSnapshots(now);

  const rows = await prisma.branchGreetingQueue.findMany({
    select: {
      branchId: true,
      currentIndex: true,
      maghribSnapshotIndex: true,
      maghribSnapshotEmployeeId: true,
      maghribSnapshotDay: true,
      queueDayAppliedKey: true,
    },
  });

  for (const row of rows) {
    const queue = await listBranchQueueEmployees(row.branchId);
    await applyMaghribRolloverIfNeeded(row.branchId, row, queue, now);
  }
}

export async function getGreetingQueueState(input: {
  branchId: string;
  viewerId: string;
}): Promise<GreetingQueueState> {
  const now = new Date();
  const branch = await assertBranch(input.branchId);
  const queue = await listBranchQueueEmployees(input.branchId);
  const row = await getOrCreateQueueRow(input.branchId, now);
  const { current, next, normalizedIndex } = pickCurrentAndNext(queue, row.currentIndex);

  const attendanceDayKey = getAttendanceDayKey(now, ATTENDANCE_TIMEZONE);
  const { validFrom } = getAttendanceWindow(attendanceDayKey, ATTENDANCE_TIMEZONE);

  const totalToday = await prisma.greetingQueueEvent.count({
    where: {
      branchId: input.branchId,
      greetedAt: { gte: validFrom },
    },
  });

  const maghribMeta = buildMaghribMeta(now, queue, row);

  return {
    branchId: branch.id,
    branchName: branch.name,
    currentIndex: normalizedIndex,
    queue,
    current,
    next,
    isMyTurn: current?.id === input.viewerId,
    totalToday,
    ...maghribMeta,
  };
}

/** Move to the next salesperson in the branch line-up. No sale is required or checked. */
export async function advanceGreetingQueue(input: {
  branchId: string;
  employeeId: string;
  employeeRole: string;
}) {
  const now = new Date();
  const branch = await assertBranch(input.branchId);
  const queue = await listBranchQueueEmployees(input.branchId);

  if (queue.length === 0) {
    throw new Error('No sales employees are assigned to this branch');
  }

  const row = await getOrCreateQueueRow(input.branchId, now);
  const { current, normalizedIndex } = pickCurrentAndNext(queue, row.currentIndex);

  if (!current) {
    throw new Error('Queue is empty');
  }

  const canAdvance =
    roleHasFullAccess(input.employeeRole) || current.id === input.employeeId;

  if (!canAdvance) {
    throw new Error(`It is ${current.name}'s turn to greet the next customer`);
  }

  await prisma.greetingQueueEvent.create({
    data: {
      branchId: input.branchId,
      employeeId: current.id,
    },
  });

  const nextIndex = (normalizedIndex + 1) % queue.length;
  await prisma.branchGreetingQueue.update({
    where: { branchId: input.branchId },
    data: { currentIndex: nextIndex },
  });

  await writeAuditLog({
    action: 'UPDATE',
    entityType: 'GREETING_QUEUE',
    entityId: input.branchId,
    performedById: input.employeeId,
    branchId: input.branchId,
    changes: {
      greetedBy: current.id,
      greetedByName: current.name,
      nextIndex,
    },
  });

  const state = await getGreetingQueueState({
    branchId: input.branchId,
    viewerId: input.employeeId,
  });

  return {
    greeted: current,
    branchName: branch.name,
    state,
  };
}

export async function listRecentGreetingEvents(branchId: string, limit = 20) {
  await assertBranch(branchId);
  const events = await prisma.greetingQueueEvent.findMany({
    where: { branchId },
    orderBy: { greetedAt: 'desc' },
    take: limit,
    include: {
      employee: { select: { name: true, email: true } },
    },
  });

  return events.map((event) => ({
    id: event.id,
    employeeId: event.employeeId,
    employeeName: event.employee.name,
    employeeEmail: event.employee.email,
    greetedAt: event.greetedAt.toISOString(),
  }));
}
