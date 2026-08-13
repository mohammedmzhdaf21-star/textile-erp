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

  const commissionEmployeeIds = [
    ...new Set(
      items.filter((row) => row.entityType === 'EmployeeCommission').map((row) => row.entityId)
    ),
  ];
  const commissionEmployees = new Map<string, { name: string; email: string }>();
  if (commissionEmployeeIds.length > 0) {
    const employees = await prisma.employee.findMany({
      where: { id: { in: commissionEmployeeIds } },
      select: { id: true, name: true, email: true },
    });
    for (const employee of employees) {
      commissionEmployees.set(employee.id, { name: employee.name, email: employee.email });
    }
  }

  return {
    items: items.map((row) => {
      const base = {
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
      };

      if (row.entityType === 'EmployeeCommission') {
        const recipient = commissionEmployees.get(row.entityId);
        if (recipient) {
          return {
            ...base,
            recipientName: recipient.name,
            recipientEmail: recipient.email,
          };
        }
      }

      return base;
    }),
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

function canViewAuditLog(
  row: { performedById: string | null },
  viewerId: string,
  viewerRole: string
) {
  const isAdmin = viewerRole === 'ADMIN' || viewerRole === 'MANAGER';
  return isAdmin || row.performedById === viewerId;
}

async function enrichAuditEntity(entityType: string, entityId: string, changes?: unknown) {
  switch (entityType) {
    case 'Sale': {
      const sale = await prisma.sale.findUnique({
        where: { id: entityId },
        include: {
          branch: { select: { id: true, name: true } },
          employee: { select: { id: true, name: true, email: true } },
          items: {
            take: 20,
            include: { color: { select: { name: true } } },
          },
        },
      });
      if (!sale) return null;
      return {
        linkPath: `/sales/${sale.id}`,
        label: sale.customerName,
        snapshot: {
          customerName: sale.customerName,
          customerPhone: sale.customerPhone,
          totalPrice: sale.totalPrice.toString(),
          paymentMethod: sale.paymentMethod,
          isVoided: sale.isVoided,
          itemCount: sale.items.length,
          employeeName: sale.employee.name,
          branchName: sale.branch.name,
          createdAt: sale.createdAt.toISOString(),
        },
      };
    }
    case 'InventoryItem': {
      const item = await prisma.inventoryItem.findFirst({
        where: {
          OR: [{ id: entityId }, { qrCodeValue: entityId }],
        },
        include: {
          branch: { select: { id: true, name: true } },
          color: { select: { name: true } },
        },
      });
      if (!item) return null;
      return {
        linkPath: '/inventory',
        label: item.id,
        snapshot: {
          id: item.id,
          code: item.code,
          subCode: item.subCode.toString(),
          type: item.type,
          colorName: item.color.name,
          branchName: item.branch.name,
          meters: item.meters?.toString() ?? null,
          pieceLength: item.pieceLength.toString(),
          isArchived: item.isArchived,
        },
      };
    }
    case 'Employee': {
      const employee = await prisma.employee.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          approvalStatus: true,
        },
      });
      if (!employee) return null;
      return {
        linkPath: '/employee-accounts',
        label: employee.name,
        snapshot: employee,
      };
    }
    case 'PlainClothPricing': {
      const row = await prisma.plainClothPricing.findUnique({ where: { id: entityId } });
      if (!row) return null;
      return {
        linkPath: '/plain-cloth',
        label: row.name,
        snapshot: {
          name: row.name,
          pricePerM: row.pricePerM.toString(),
          isActive: row.isActive,
        },
      };
    }
    case 'EmployeeCommission': {
      const employee = await prisma.employee.findUnique({
        where: { id: entityId },
        select: { id: true, name: true, email: true, role: true },
      });
      if (!employee) return null;

      const changeData =
        changes && typeof changes === 'object' && !Array.isArray(changes)
          ? (changes as Record<string, unknown>)
          : {};

      return {
        linkPath: '/commission-payouts',
        label: employee.name,
        snapshot: {
          paidTo: employee.name,
          employeeEmail: employee.email,
          employeeRole: employee.role,
          amountPaid:
            changeData.amountPaid !== undefined && changeData.amountPaid !== null
              ? String(changeData.amountPaid)
              : null,
          entryCount:
            changeData.entryCount !== undefined && changeData.entryCount !== null
              ? String(changeData.entryCount)
              : null,
        },
      };
    }
    default:
      return null;
  }
}

export async function getAuditLogById(id: string, viewerId: string, viewerRole: string) {
  const row = await prisma.auditLog.findUnique({
    where: { id },
    include: {
      performedBy: {
        select: { id: true, name: true, email: true, role: true },
      },
      branch: {
        select: { id: true, name: true },
      },
    },
  });

  if (!row) {
    throw new Error('Activity record not found');
  }

  if (!canViewAuditLog(row, viewerId, viewerRole)) {
    throw new Error('You do not have access to this activity record');
  }

  const relatedEntity = await enrichAuditEntity(row.entityType, row.entityId, row.changes);

  return {
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
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
    relatedEntity,
  };
}
