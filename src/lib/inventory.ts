import { prisma } from './prisma';
import { Prisma } from '@prisma/client';

// ============================================================
// INVENTORY BUSINESS LOGIC
// ============================================================

// ---- Types ----
export interface ListInventoryParams {
  branchId?: string;
  colorId?: string;
  type?: 'ROLL' | 'PIECE' | 'REMANENT';
  code?: number;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateInventoryInput {
  id: string;
  branchId: string;
  code: number;
  colorId: string;
  type: 'ROLL' | 'PIECE' | 'REMANENT';
  meters?: number;
  pieceLength?: number;
  quantity?: number;
  costPrice?: number;
  qrCodeValue?: string;
  qrCodeDataUrl?: string;
}

export interface UpdateInventoryInput {
  meters?: number;
  pieceLength?: number;
  quantity?: number;
  costPrice?: number;
  version: number;
}

// ============================================================
// LIST INVENTORY (with filters & pagination)
// ============================================================
export async function listInventory(params: ListInventoryParams) {
  const {
    branchId,
    colorId,
    type,
    code,
    includeArchived = false,
    page = 1,
    pageSize = 50,
  } = params;

  const where: Prisma.InventoryItemWhereInput = {};

  if (branchId) where.branchId = branchId;
  if (colorId) where.colorId = colorId;
  if (type) where.type = type;
  if (code !== undefined) where.code = code;
  if (!includeArchived) where.isArchived = false;

  const skip = (page - 1) * pageSize;
  const take = Math.min(pageSize, 200);

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      skip,
      take,
      orderBy: [{ branchId: 'asc' }, { code: 'asc' }],
      include: {
        color: { select: { id: true, name: true, hexCode: true } },
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.inventoryItem.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page,
      pageSize: take,
      total,
      totalPages: Math.ceil(total / take),
    },
  };
}

// ============================================================
// GET ONE INVENTORY ITEM
// ============================================================
export async function getInventoryItem(id: string) {
  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: {
      color: true,
      branch: true,
    },
  });

  if (!item) {
    throw new Error('Inventory item not found');
  }

  return item;
}

// ============================================================
// CREATE INVENTORY ITEM
// ============================================================
export async function createInventoryItem(
  input: CreateInventoryInput,
  performedById?: string,
  performedByEmail?: string
) {
  // Validate based on type
  if (input.type === 'ROLL' && (!input.meters || input.meters <= 0)) {
    throw new Error('ROLL items require positive meters value');
  }
  if (input.type === 'PIECE' && (!input.pieceLength || input.pieceLength <= 0)) {
    throw new Error('PIECE items require positive pieceLength value');
  }

  // Verify branch exists
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
  if (!branch) throw new Error('Branch not found');

  // Verify color exists
  const color = await prisma.color.findUnique({ where: { id: input.colorId } });
  if (!color) throw new Error('Color not found');

  // Create the item + audit log in a transaction
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.inventoryItem.create({
      data: {
        id: input.id,
        branchId: input.branchId,
        code: input.code,
        colorId: input.colorId,
        type: input.type,
        meters: input.meters,
        pieceLength: input.pieceLength,
        quantity: input.quantity ?? 1,
        costPrice: input.costPrice,
        qrCodeValue: input.qrCodeValue || input.id,
        qrCodeDataUrl: input.qrCodeDataUrl,
      },
      include: { color: true, branch: true },
    });

    await tx.auditLog.create({
      data: {
        entityType: 'InventoryItem',
        entityId: created.id,
        action: 'CREATE',
        performedById: performedById || null,
        performedByEmail: performedByEmail || null,
        branchId: created.branchId,
        changes: { created: input } as unknown as Prisma.InputJsonValue,
      },
    });

    return created;
  });

  return item;
}

// ============================================================
// UPDATE INVENTORY ITEM (with optimistic locking)
// ============================================================
export async function updateInventoryItem(
  id: string,
  input: UpdateInventoryInput,
  performedById?: string,
  performedByEmail?: string
) {
  const existing = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!existing) throw new Error('Inventory item not found');
  if (existing.isArchived) throw new Error('Cannot update archived item');

  // Optimistic locking check
  if (existing.version !== input.version) {
    throw new Error(
      'Item was modified by another user. Please refresh and try again.'
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.inventoryItem.update({
      where: { id },
      data: {
        meters: input.meters,
        pieceLength: input.pieceLength,
        quantity: input.quantity,
        costPrice: input.costPrice,
        version: { increment: 1 },
      },
      include: { color: true, branch: true },
    });

    await tx.auditLog.create({
      data: {
        entityType: 'InventoryItem',
        entityId: id,
        action: 'UPDATE',
        performedById: performedById || null,
        performedByEmail: performedByEmail || null,
        branchId: existing.branchId,
        changes: {
          before: {
            meters: existing.meters,
            pieceLength: existing.pieceLength,
            quantity: existing.quantity,
            costPrice: existing.costPrice,
          },
          after: input,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return result;
  });

  return updated;
}

// ============================================================
// ARCHIVE (soft delete) INVENTORY ITEM
// ============================================================
export async function archiveInventoryItem(
  id: string,
  performedById?: string,
  performedByEmail?: string
) {
  const existing = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!existing) throw new Error('Inventory item not found');
  if (existing.isArchived) throw new Error('Item is already archived');

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.inventoryItem.update({
      where: { id },
      data: { isArchived: true, deletedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        entityType: 'InventoryItem',
        entityId: id,
        action: 'DELETE',
        performedById: performedById || null,
        performedByEmail: performedByEmail || null,
        branchId: existing.branchId,
      },
    });

    return result;
  });

  return updated;
}

// ============================================================
// RESTORE ARCHIVED INVENTORY ITEM
// ============================================================
export async function restoreInventoryItem(
  id: string,
  performedById?: string,
  performedByEmail?: string
) {
  const existing = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!existing) throw new Error('Inventory item not found');
  if (!existing.isArchived) throw new Error('Item is not archived');

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.inventoryItem.update({
      where: { id },
      data: { isArchived: false, deletedAt: null },
    });

    await tx.auditLog.create({
      data: {
        entityType: 'InventoryItem',
        entityId: id,
        action: 'RESTORE',
        performedById: performedById || null,
        performedByEmail: performedByEmail || null,
        branchId: existing.branchId,
      },
    });

    return result;
  });

  return updated;
}

// ============================================================
// HARD DELETE (admin only)
// ============================================================
export async function deleteInventoryItem(
  id: string,
  performedById?: string,
  performedByEmail?: string
) {
  const existing = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!existing) throw new Error('Inventory item not found');

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        entityType: 'InventoryItem',
        entityId: id,
        action: 'DELETE',
        performedById: performedById || null,
        performedByEmail: performedByEmail || null,
        branchId: existing.branchId,
        changes: { deletedItem: existing } as unknown as Prisma.InputJsonValue,
      },
    });

    await tx.inventoryItem.delete({ where: { id } });
  });

  return { success: true, id };
}

// ============================================================
// INVENTORY STATS
// ============================================================
export async function getInventoryStats(branchId?: string) {
  const where: Prisma.InventoryItemWhereInput = { isArchived: false };
  if (branchId) where.branchId = branchId;

  const [totalItems, byType, byBranch] = await Promise.all([
    prisma.inventoryItem.count({ where }),
    prisma.inventoryItem.groupBy({
      by: ['type'],
      where,
      _count: { _all: true },
    }),
    prisma.inventoryItem.groupBy({
      by: ['branchId'],
      where,
      _count: { _all: true },
    }),
  ]);

  return {
    totalItems,
    byType: byType.map((t) => ({ type: t.type, count: t._count._all })),
    byBranch: byBranch.map((b) => ({ branchId: b.branchId, count: b._count._all })),
  };
}
