import { prisma } from './prisma';
import { Prisma } from '@prisma/client';
import {
  buildPackageComponentStock,
  parsePackageComponents,
} from './packageStock';
import {
  buildInventoryItemId,
  resolveInventoryItemId,
  resolveMeteredInstanceKey,
} from './inventoryCodes';
import { normalizeInventoryShape } from './inventoryRules';

// ============================================================
// INVENTORY BUSINESS LOGIC
// ============================================================

// ---- Types ----
export interface ListInventoryParams {
  branchId?: string;
  colorId?: string;
  type?: 'ROLL' | 'PIECE' | 'REMANENT';
  code?: number;
  itemId?: string;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateInventoryInput {
  id: string;
  branchId: string;
  code: number;
  subCode: number;
  colorId: string;
  type: 'ROLL' | 'PIECE' | 'REMANENT';
  meters?: number;
  pieceLength?: number;
  quantity?: number;
  costPrice?: number;
  qrCodeValue?: string;
  qrCodeDataUrl?: string;
  pictureName?: string;
  pictureDataUrl?: string;
  description?: string;
  isPiecePackage?: boolean;
  packageKey?: string;
  packageComponents?: Array<{ name: string; countPerPackage: number }>;
}

export interface UpdateInventoryInput {
  meters?: number;
  pieceLength?: number;
  quantity?: number;
  costPrice?: number;
  code?: number;
  subCode?: number;
  colorId?: string;
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
    itemId,
    includeArchived = false,
    page = 1,
    pageSize = 50,
  } = params;

  const where: Prisma.InventoryItemWhereInput = {};

  if (branchId) where.branchId = branchId;
  if (colorId) where.colorId = colorId;
  if (type) where.type = type;
  if (code !== undefined) where.code = code;
  if (itemId?.trim()) {
    const normalizedItemId = itemId.trim();
    where.OR = [
      { id: { equals: normalizedItemId, mode: 'insensitive' } },
      { qrCodeValue: { equals: normalizedItemId, mode: 'insensitive' } },
    ];
  }
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
  const normalizedId = id.trim();
  const item = await prisma.inventoryItem.findFirst({
    where: {
      OR: [
        { id: normalizedId },
        { qrCodeValue: normalizedId },
        { id: { equals: normalizedId, mode: 'insensitive' } },
        { qrCodeValue: { equals: normalizedId, mode: 'insensitive' } },
      ],
    },
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
  const normalized = normalizeInventoryShape({
    type: input.type,
    meters: input.meters,
    pieceLength: input.pieceLength,
    quantity: input.quantity,
    isPiecePackage: input.isPiecePackage,
  });

  const effectiveType = normalized.type;
  const effectiveMeters =
    effectiveType === 'REMANENT' || effectiveType === 'ROLL'
      ? normalized.meters
      : input.meters;
  const pieceLength =
    effectiveType === 'PIECE' && !input.isPiecePackage ? normalized.pieceLength : 0;
  const effectiveQuantity = normalized.quantity ?? input.quantity ?? 1;

  // Validate based on type
  if (effectiveType === 'ROLL' && (!effectiveMeters || effectiveMeters <= 0)) {
    throw new Error('ROLL items require positive meters value');
  }
  if (effectiveType === 'PIECE' && input.isPiecePackage) {
    if (!input.packageComponents?.length) {
      throw new Error('Piece packages require at least one package component');
    }
  } else if (effectiveType === 'PIECE' && (!pieceLength || pieceLength <= 0)) {
    throw new Error('PIECE items require positive pieceLength value');
  }

  if (effectiveType === 'REMANENT' && (!effectiveMeters || effectiveMeters <= 0)) {
    throw new Error('REMANENT items require positive meters value');
  }

  let packageKey = input.isPiecePackage
    ? input.packageKey ?? ''
    : effectiveType === 'ROLL' || effectiveType === 'REMANENT'
      ? input.packageKey ?? ''
      : '';
  const packageComponents = input.isPiecePackage
    ? parsePackageComponents(input.packageComponents)
    : [];
  const packageQuantity = input.quantity ?? 1;
  const packageComponentStock =
    input.isPiecePackage && packageComponents.length > 0
      ? buildPackageComponentStock(packageComponents, packageQuantity)
      : undefined;

  // Verify branch exists
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
  if (!branch) throw new Error('Branch not found');

  // Verify color exists
  const color = await prisma.color.findUnique({ where: { id: input.colorId } });
  if (!color) throw new Error('Color not found');

  let itemId = input.id;
  let qrCodeValue = input.qrCodeValue || input.id;

  if (effectiveType === 'ROLL' || effectiveType === 'REMANENT') {
    const existingMeteredItems = await prisma.inventoryItem.findMany({
      where: {
        branchId: input.branchId,
        code: input.code,
        subCode: input.subCode,
        colorId: input.colorId,
        type: effectiveType,
      },
      select: {
        id: true,
        branchId: true,
        code: true,
        subCode: true,
        colorId: true,
        type: true,
        packageKey: true,
        costPrice: true,
      },
    });

    packageKey = resolveMeteredInstanceKey({
      type: effectiveType,
      items: existingMeteredItems.map((item) => ({
        branchId: item.branchId,
        code: item.code,
        subCode: item.subCode,
        costPrice: item.costPrice,
        colorId: item.colorId,
        type: item.type,
        packageKey: item.packageKey,
      })),
      branchId: input.branchId,
      familyCode: input.code,
      subCode: input.subCode,
      colorId: input.colorId,
    });

    itemId = buildInventoryItemId({
      branchId: input.branchId,
      familyCode: input.code,
      subCode: input.subCode,
      colorName: color.name,
      colorId: color.id,
      type: effectiveType,
      instanceKey: packageKey || undefined,
    });
    qrCodeValue = itemId;
  } else if (effectiveType !== input.type) {
    itemId = buildInventoryItemId({
      branchId: input.branchId,
      familyCode: input.code,
      subCode: input.subCode,
      colorName: color.name,
      colorId: color.id,
      type: effectiveType,
      pieceLength: effectiveType === 'PIECE' ? pieceLength : undefined,
      isPiecePackage: input.isPiecePackage,
      packageComponents: input.isPiecePackage
        ? parsePackageComponents(input.packageComponents)
        : undefined,
    });
    qrCodeValue = itemId;
  }

  // Create the item + audit log in a transaction
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.inventoryItem.create({
      data: {
        id: itemId,
        branchId: input.branchId,
        code: input.code,
        subCode: input.subCode,
        colorId: input.colorId,
        type: effectiveType,
        meters: effectiveMeters,
        pieceLength,
        quantity: effectiveQuantity,
        costPrice: input.costPrice ?? input.subCode,
        qrCodeValue,
        qrCodeDataUrl: input.qrCodeDataUrl,
        pictureName: input.pictureName,
        pictureDataUrl: input.pictureDataUrl,
        description: input.description,
        isPiecePackage: input.isPiecePackage ?? false,
        packageKey,
        packageComponents: input.packageComponents
          ? (input.packageComponents as Prisma.InputJsonValue)
          : undefined,
        packageComponentStock: packageComponentStock
          ? (packageComponentStock as Prisma.InputJsonValue)
          : undefined,
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
  const existing = await prisma.inventoryItem.findUnique({
    where: { id },
    include: { color: true, branch: true },
  });
  if (!existing) throw new Error('Inventory item not found');
  if (existing.isArchived) throw new Error('Cannot update archived item');

  if (existing.version !== input.version) {
    throw new Error(
      'Item was modified by another user. Please refresh and try again.'
    );
  }

  const nextCode = input.code ?? existing.code;
  const nextSubCode =
    input.subCode !== undefined ? input.subCode : Number(existing.subCode);
  const nextColorId = input.colorId ?? existing.colorId;
  const nextPieceLength =
    input.pieceLength !== undefined
      ? input.pieceLength
      : Number(existing.pieceLength);
  const nextMeters =
    input.meters !== undefined
      ? input.meters
      : existing.meters !== null
        ? Number(existing.meters)
        : undefined;
  const nextQuantity =
    input.quantity !== undefined ? input.quantity : existing.quantity;
  const nextCostPrice =
    input.costPrice !== undefined
      ? input.costPrice
      : existing.costPrice !== null
        ? Number(existing.costPrice)
        : nextSubCode;

  if (nextCode <= 0) throw new Error('Family code must be positive');
  if (nextSubCode < 0) throw new Error('Sub code must be non-negative');

  const color =
    nextColorId === existing.colorId
      ? existing.color
      : await prisma.color.findUnique({ where: { id: nextColorId } });
  if (!color) throw new Error('Color not found');

  if (existing.type === 'ROLL' && nextMeters !== undefined && nextMeters <= 0) {
    throw new Error('ROLL items require positive meters value');
  }
  if (existing.type === 'REMANENT' && nextMeters !== undefined && nextMeters <= 0) {
    throw new Error('REMANENT items require positive meters value');
  }
  if (
    existing.type === 'PIECE' &&
    !existing.isPiecePackage &&
    nextPieceLength <= 0
  ) {
    throw new Error('PIECE items require positive pieceLength value');
  }
  if (existing.type === 'PIECE' && nextQuantity < 0) {
    throw new Error('PIECE quantity cannot be negative');
  }

  const normalized = normalizeInventoryShape({
    type: existing.type,
    meters:
      existing.type === 'ROLL' || existing.type === 'REMANENT'
        ? nextMeters
        : undefined,
    pieceLength:
      existing.type === 'PIECE' && !existing.isPiecePackage ? nextPieceLength : undefined,
    quantity: nextQuantity,
    isPiecePackage: existing.isPiecePackage,
  });

  const effectiveType = normalized.type;
  const effectiveMeters =
    effectiveType === 'REMANENT' || effectiveType === 'ROLL'
      ? normalized.meters ?? nextMeters
      : nextMeters;
  const storedPieceLength =
    effectiveType === 'PIECE' && !existing.isPiecePackage
      ? normalized.pieceLength ?? nextPieceLength
      : 0;
  const effectiveQuantity = normalized.quantity ?? nextQuantity;

  if (effectiveType === 'ROLL' && effectiveMeters !== undefined && effectiveMeters <= 0) {
    throw new Error('ROLL items require positive meters value');
  }
  if (effectiveType === 'REMANENT' && effectiveMeters !== undefined && effectiveMeters <= 0) {
    throw new Error('REMANENT items require positive meters value');
  }
  if (effectiveType === 'PIECE' && !existing.isPiecePackage && storedPieceLength <= 0) {
    throw new Error('PIECE items require positive pieceLength value');
  }

  const nextId = resolveInventoryItemId({
    branchId: existing.branchId,
    code: nextCode,
    subCode: nextSubCode,
    colorName: color.name,
    colorId: nextColorId,
    type: effectiveType,
    pieceLength: storedPieceLength,
    isPiecePackage: existing.isPiecePackage,
    packageComponents: existing.packageComponents,
  });

  const identityChanged =
    nextId !== id ||
    nextCode !== existing.code ||
    Number(existing.subCode) !== nextSubCode ||
    nextColorId !== existing.colorId ||
    Number(existing.pieceLength) !== storedPieceLength ||
    effectiveType !== existing.type;

  if (identityChanged) {
    const duplicate = await prisma.inventoryItem.findFirst({
      where: {
        branchId: existing.branchId,
        code: nextCode,
        subCode: nextSubCode,
        colorId: nextColorId,
        type: effectiveType,
        pieceLength: storedPieceLength,
        packageKey: existing.packageKey,
        isArchived: false,
        NOT: { id },
      },
    });
    if (duplicate) {
      throw new Error(
        'Another item already exists with this family code, price, color, and size.'
      );
    }
  }

  if (nextId !== id) {
    const existingTarget = await prisma.inventoryItem.findUnique({
      where: { id: nextId },
    });
    if (existingTarget) {
      throw new Error(`Inventory item ${nextId} already exists`);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updateData = {
      code: nextCode,
      subCode: nextSubCode,
      colorId: nextColorId,
      type: effectiveType,
      pieceLength: storedPieceLength,
      meters: effectiveMeters,
      quantity: effectiveQuantity,
      costPrice: nextCostPrice,
      qrCodeValue: nextId,
      version: { increment: 1 },
    };

    if (nextId === id) {
      const result = await tx.inventoryItem.update({
        where: { id },
        data: updateData,
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
              code: existing.code,
              subCode: existing.subCode,
              colorId: existing.colorId,
              meters: existing.meters,
              pieceLength: existing.pieceLength,
              quantity: existing.quantity,
              costPrice: existing.costPrice,
            },
            after: {
              code: nextCode,
              subCode: nextSubCode,
              colorId: nextColorId,
              meters: nextMeters,
              pieceLength: storedPieceLength,
              quantity: nextQuantity,
              costPrice: nextCostPrice,
            },
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return result;
    }

    const migrated = await tx.inventoryItem.create({
      data: {
        id: nextId,
        branchId: existing.branchId,
        code: nextCode,
        subCode: nextSubCode,
        colorId: nextColorId,
        type: effectiveType,
        meters: effectiveMeters,
        pieceLength: storedPieceLength,
        quantity: effectiveQuantity,
        costPrice: nextCostPrice,
        qrCodeValue: nextId,
        qrCodeDataUrl: existing.qrCodeDataUrl,
        pictureName: existing.pictureName,
        pictureDataUrl: existing.pictureDataUrl,
        description: existing.description,
        isPiecePackage: existing.isPiecePackage,
        packageKey: existing.packageKey,
        packageComponents: existing.packageComponents ?? undefined,
        packageComponentStock: existing.packageComponentStock ?? undefined,
        version: existing.version + 1,
        isArchived: existing.isArchived,
      },
      include: { color: true, branch: true },
    });

    await tx.saleItem.updateMany({
      where: { inventoryItemId: id },
      data: { inventoryItemId: nextId },
    });

    await tx.inventoryItem.delete({ where: { id } });

    await tx.auditLog.create({
      data: {
        entityType: 'InventoryItem',
        entityId: nextId,
        action: 'UPDATE',
        performedById: performedById || null,
        performedByEmail: performedByEmail || null,
        branchId: existing.branchId,
        changes: {
          migratedFrom: id,
          before: {
            id: existing.id,
            code: existing.code,
            subCode: existing.subCode,
            colorId: existing.colorId,
            meters: existing.meters,
            pieceLength: existing.pieceLength,
            quantity: existing.quantity,
            costPrice: existing.costPrice,
          },
          after: {
            id: nextId,
            code: nextCode,
            subCode: nextSubCode,
            colorId: nextColorId,
            meters: nextMeters,
            pieceLength: storedPieceLength,
            quantity: nextQuantity,
            costPrice: nextCostPrice,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return migrated;
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
