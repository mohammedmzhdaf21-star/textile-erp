import prisma from './prisma';
import { branchCodeToId, branchIdToCode } from './branchCodes';
import { roleHasFullAccess } from './employeeSections';

export type BranchTaskDto = {
  id: string;
  branch: string;
  templateKey: string;
  title: string;
  assignedTo: string;
  note: string;
  schedule: string;
  status: 'TODO' | 'DONE';
  createdAt: string;
  checkedBy?: string;
  checkedAt?: string;
  dueAt?: string;
  sourceSaleId?: string;
  sourceItemId?: string;
  code?: number;
  colorName?: string;
};

export type TaskAssignmentDto = {
  id: string;
  branch: string;
  templateKey: string;
  title: string;
  assignedTo: string;
  note: string;
  schedule: string;
  updatedAt: string;
};

const formatTask = (row: {
  id: string;
  branchId: string;
  templateKey: string;
  title: string;
  assignedToEmail: string;
  note: string;
  schedule: string;
  status: string;
  checkedBy: string | null;
  checkedAt: Date | null;
  dueAt: Date | null;
  sourceSaleId: string | null;
  sourceItemId: string | null;
  code: number | null;
  colorName: string | null;
  createdAt: Date;
}): BranchTaskDto => ({
  id: row.id,
  branch: branchIdToCode(row.branchId) ?? row.branchId,
  templateKey: row.templateKey,
  title: row.title,
  assignedTo: row.assignedToEmail,
  note: row.note,
  schedule: row.schedule,
  status: row.status === 'DONE' || row.checkedAt ? 'DONE' : 'TODO',
  createdAt: row.createdAt.toISOString(),
  checkedBy: row.checkedBy ?? undefined,
  checkedAt: row.checkedAt?.toISOString(),
  dueAt: row.dueAt?.toISOString(),
  sourceSaleId: row.sourceSaleId ?? undefined,
  sourceItemId: row.sourceItemId ?? undefined,
  code: row.code ?? undefined,
  colorName: row.colorName ?? undefined,
});

const formatAssignment = (row: {
  id: string;
  branchId: string;
  templateKey: string;
  title: string;
  assignedToEmail: string;
  note: string;
  schedule: string;
  updatedAt: Date;
}): TaskAssignmentDto => ({
  id: `${branchIdToCode(row.branchId) ?? row.branchId}-${row.templateKey}`,
  branch: branchIdToCode(row.branchId) ?? row.branchId,
  templateKey: row.templateKey,
  title: row.title,
  assignedTo: row.assignedToEmail,
  note: row.note,
  schedule: row.schedule,
  updatedAt: row.updatedAt.toISOString(),
});

async function resolveAssignee(assignedTo: string) {
  const trimmed = assignedTo.trim();
  if (!trimmed) {
    return { assignedToEmail: 'Unassigned', assignedToId: null as string | null };
  }

  const employee = await prisma.employee.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { email: { equals: trimmed, mode: 'insensitive' } },
        { name: { equals: trimmed, mode: 'insensitive' } },
      ],
    },
    select: { id: true, email: true, name: true },
  });

  if (employee) {
    return {
      assignedToEmail: employee.email,
      assignedToId: employee.id,
    };
  }

  return { assignedToEmail: trimmed, assignedToId: null as string | null };
}

function assigneeFilter(userId: string, userEmail: string) {
  return {
    OR: [
      { assignedToId: userId },
      { assignedToEmail: { equals: userEmail, mode: 'insensitive' as const } },
    ],
  };
}

export async function listBranchTasks(input: {
  branch?: string;
  viewerId: string;
  viewerEmail: string;
  viewerRole: string;
  mine?: boolean;
}) {
  const where: Record<string, unknown> = {};

  if (input.branch) {
    const branchId = branchCodeToId(input.branch);
    if (!branchId) throw new Error('Invalid branch code');
    where.branchId = branchId;
  }

  const canSeeAll = roleHasFullAccess(input.viewerRole) && !input.mine;
  if (!canSeeAll) {
    Object.assign(where, assigneeFilter(input.viewerId, input.viewerEmail));
  }

  const rows = await prisma.branchTaskEntry.findMany({
    where,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  return rows.map(formatTask);
}

export async function countOpenBranchTasks(input: {
  viewerId: string;
  viewerEmail: string;
  viewerRole: string;
  mine?: boolean;
}) {
  const where: Record<string, unknown> = {
    status: 'TODO',
    checkedAt: null,
  };

  const canSeeAll = roleHasFullAccess(input.viewerRole) && !input.mine;
  if (!canSeeAll) {
    Object.assign(where, assigneeFilter(input.viewerId, input.viewerEmail));
  }

  return prisma.branchTaskEntry.count({ where });
}

export async function listBranchTaskAssignments(branch?: string) {
  const where: Record<string, unknown> = {};
  if (branch) {
    const branchId = branchCodeToId(branch);
    if (!branchId) throw new Error('Invalid branch code');
    where.branchId = branchId;
  }

  const rows = await prisma.branchTaskAssignment.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  });

  return rows.map(formatAssignment);
}

export async function createBranchTask(input: {
  branch: string;
  templateKey: string;
  title: string;
  assignedTo: string;
  note?: string;
  schedule: string;
  dueAt?: string;
  sourceSaleId?: string;
  sourceItemId?: string;
  code?: number;
  colorName?: string;
}) {
  const branchId = branchCodeToId(input.branch);
  if (!branchId) throw new Error('Invalid branch code');

  const assignee = await resolveAssignee(input.assignedTo);

  const row = await prisma.branchTaskEntry.create({
    data: {
      branchId,
      templateKey: input.templateKey,
      title: input.title,
      assignedToEmail: assignee.assignedToEmail,
      assignedToId: assignee.assignedToId,
      note: input.note?.trim() ?? '',
      schedule: input.schedule,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      sourceSaleId: input.sourceSaleId ?? null,
      sourceItemId: input.sourceItemId ?? null,
      code: input.code ?? null,
      colorName: input.colorName ?? null,
    },
  });

  return formatTask(row);
}

export async function upsertBranchTaskAssignment(input: {
  branch: string;
  templateKey: string;
  title: string;
  assignedTo: string;
  note?: string;
  schedule: string;
}) {
  const branchId = branchCodeToId(input.branch);
  if (!branchId) throw new Error('Invalid branch code');

  const assignee = await resolveAssignee(input.assignedTo);

  const assignment = await prisma.branchTaskAssignment.upsert({
    where: {
      branchId_templateKey: {
        branchId,
        templateKey: input.templateKey,
      },
    },
    create: {
      branchId,
      templateKey: input.templateKey,
      title: input.title,
      assignedToEmail: assignee.assignedToEmail,
      assignedToId: assignee.assignedToId,
      note: input.note?.trim() ?? '',
      schedule: input.schedule,
    },
    update: {
      title: input.title,
      assignedToEmail: assignee.assignedToEmail,
      assignedToId: assignee.assignedToId,
      note: input.note?.trim() ?? '',
      schedule: input.schedule,
    },
  });

  const dueAt = new Date();
  const scheduleDays: Record<string, number> = {
    DAILY: 1,
    EVERY_2_DAYS: 2,
    WEEKLY: 7,
    MONTHLY: 30,
    YEARLY: 365,
  };
  dueAt.setDate(dueAt.getDate() + (scheduleDays[input.schedule] ?? 1));

  const task = await createBranchTask({
    branch: input.branch,
    templateKey: input.templateKey,
    title: input.title,
    assignedTo: assignee.assignedToEmail,
    note: input.note,
    schedule: input.schedule,
    dueAt: dueAt.toISOString(),
  });

  return { assignment: formatAssignment(assignment), task };
}

export async function completeBranchTask(taskId: string, checkedBy: string, viewer: {
  userId: string;
  email: string;
  role: string;
}) {
  const existing = await prisma.branchTaskEntry.findUnique({ where: { id: taskId } });
  if (!existing) throw new Error('Task not found');

  if (!roleHasFullAccess(viewer.role)) {
    const allowed =
      existing.assignedToId === viewer.userId ||
      existing.assignedToEmail.toLowerCase() === viewer.email.toLowerCase();
    if (!allowed) throw new Error('You do not have access to this task');
  }

  const row = await prisma.branchTaskEntry.update({
    where: { id: taskId },
    data: {
      status: 'DONE',
      checkedBy,
      checkedAt: new Date(),
    },
  });

  return formatTask(row);
}

export async function reopenBranchTask(taskId: string, viewer: {
  userId: string;
  email: string;
  role: string;
}) {
  const existing = await prisma.branchTaskEntry.findUnique({ where: { id: taskId } });
  if (!existing) throw new Error('Task not found');

  if (!roleHasFullAccess(viewer.role)) {
    throw new Error('Only managers can reopen tasks');
  }

  const row = await prisma.branchTaskEntry.update({
    where: { id: taskId },
    data: {
      status: 'TODO',
      checkedBy: null,
      checkedAt: null,
    },
  });

  return formatTask(row);
}

export async function deleteBranchTask(taskId: string) {
  const existing = await prisma.branchTaskEntry.findUnique({ where: { id: taskId } });
  if (!existing) throw new Error('Task not found');
  await prisma.branchTaskEntry.delete({ where: { id: taskId } });
  return { success: true };
}

export async function hasOpenCuttingTask(input: {
  branch: string;
  code?: number;
  colorName?: string;
}) {
  const branchId = branchCodeToId(input.branch);
  if (!branchId) return false;

  const count = await prisma.branchTaskEntry.count({
    where: {
      branchId,
      templateKey: 'CUTTING_FABRIC_ROLL',
      status: 'TODO',
      checkedAt: null,
      code: input.code ?? undefined,
      colorName: input.colorName ?? undefined,
    },
  });

  return count > 0;
}

export async function completeCuttingBranchTasks(input: {
  branch: string;
  rollItemId?: string;
  code?: number;
  colorName?: string;
}) {
  const branchId = branchCodeToId(input.branch);
  if (!branchId) return [];

  const orConditions: Array<Record<string, unknown>> = [];
  if (input.rollItemId) {
    orConditions.push({ sourceItemId: input.rollItemId });
  }
  if (input.code !== undefined) {
    orConditions.push({
      code: input.code,
      colorName: input.colorName ?? null,
    });
  }

  const rows = await prisma.branchTaskEntry.findMany({
    where: {
      branchId,
      templateKey: 'CUTTING_FABRIC_ROLL',
      status: 'TODO',
      checkedAt: null,
      ...(orConditions.length > 0 ? { OR: orConditions } : {}),
    },
  });

  const now = new Date();
  await prisma.branchTaskEntry.updateMany({
    where: { id: { in: rows.map((row) => row.id) } },
    data: {
      status: 'DONE',
      checkedBy: 'System (item conversion)',
      checkedAt: now,
    },
  });

  return rows.map(formatTask);
}
