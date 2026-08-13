import { Prisma, AuditAction } from '@prisma/client';
import prisma from './prisma';

export type WriteAuditLogInput = {
  entityType: string;
  entityId: string;
  action: AuditAction;
  performedById?: string | null;
  performedByEmail?: string | null;
  branchId?: string | null;
  changes?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type ListAuditLogsParams = {
  page?: number;
  pageSize?: number;
  fromDate?: string;
  toDate?: string;
  action?: AuditAction;
  entityType?: string;
  performedById?: string;
  search?: string;
  viewerId: string;
  viewerRole: string;
};

export async function writeAuditLog(input: WriteAuditLogInput) {
  return prisma.auditLog.create({
    data: {
      entityType: input.entityType.slice(0, 50),
      entityId: input.entityId.slice(0, 100),
      action: input.action,
      performedById: input.performedById ?? null,
      performedByEmail: input.performedByEmail ?? null,
      branchId: input.branchId ?? null,
      changes: input.changes ?? undefined,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ? input.userAgent.slice(0, 500) : null,
    },
  });
}

export async function listAuditLogs(params: ListAuditLogsParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 50, 1), 200);
  const skip = (page - 1) * pageSize;

  const where: Prisma.AuditLogWhereInput = {};

  const isAdmin = params.viewerRole === 'ADMIN' || params.viewerRole === 'MANAGER';
  if (!isAdmin) {
    where.performedById = params.viewerId;
  } else if (params.performedById) {
    where.performedById = params.performedById;
  }

  if (params.action) {
    where.action = params.action;
  }

  if (params.entityType?.trim()) {
    where.entityType = params.entityType.trim();
  }

  if (params.fromDate || params.toDate) {
    where.createdAt = {};
    if (params.fromDate) {
      where.createdAt.gte = new Date(`${params.fromDate}T00:00:00.000Z`);
    }
    if (params.toDate) {
      where.createdAt.lte = new Date(`${params.toDate}T23:59:59.999Z`);
    }
  }

  if (params.search?.trim()) {
    const term = params.search.trim();
    where.OR = [
      { performedByEmail: { contains: term, mode: 'insensitive' } },
      { entityId: { contains: term, mode: 'insensitive' } },
      { entityType: { contains: term, mode: 'insensitive' } },
      {
        performedBy: {
          is: {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
            ],
          },
        },
      },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        performedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        branch: {
          select: { id: true, name: true },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: items.map((row) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      performedById: row.performedById,
      performedByEmail: row.performedByEmail,
      performedBy: row.performedBy,
      branchId: row.branchId,
      branch: row.branch,
      changes: row.changes,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function listAuditLogEntityTypes(viewerId: string, viewerRole: string) {
  const isAdmin = viewerRole === 'ADMIN' || viewerRole === 'MANAGER';
  const rows = await prisma.auditLog.findMany({
    where: isAdmin ? undefined : { performedById: viewerId },
    distinct: ['entityType'],
    select: { entityType: true },
    orderBy: { entityType: 'asc' },
  });
  return rows.map((r) => r.entityType);
}
