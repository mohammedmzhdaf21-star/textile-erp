"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listInventory = listInventory;
exports.getInventoryItem = getInventoryItem;
exports.createInventoryItem = createInventoryItem;
exports.updateInventoryItem = updateInventoryItem;
exports.archiveInventoryItem = archiveInventoryItem;
exports.restoreInventoryItem = restoreInventoryItem;
exports.deleteInventoryItem = deleteInventoryItem;
exports.getInventoryStats = getInventoryStats;
const prisma_1 = require("./prisma");
const packageStock_1 = require("./packageStock");
const inventoryCodes_1 = require("./inventoryCodes");
// ============================================================
// LIST INVENTORY (with filters & pagination)
// ============================================================
async function listInventory(params) {
    const { branchId, colorId, type, code, includeArchived = false, page = 1, pageSize = 50, } = params;
    const where = {};
    if (branchId)
        where.branchId = branchId;
    if (colorId)
        where.colorId = colorId;
    if (type)
        where.type = type;
    if (code !== undefined)
        where.code = code;
    if (!includeArchived)
        where.isArchived = false;
    const skip = (page - 1) * pageSize;
    const take = Math.min(pageSize, 200);
    const [items, total] = await Promise.all([
        prisma_1.prisma.inventoryItem.findMany({
            where,
            skip,
            take,
            orderBy: [{ branchId: 'asc' }, { code: 'asc' }],
            include: {
                color: { select: { id: true, name: true, hexCode: true } },
                branch: { select: { id: true, name: true } },
            },
        }),
        prisma_1.prisma.inventoryItem.count({ where }),
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
async function getInventoryItem(id) {
    const item = await prisma_1.prisma.inventoryItem.findUnique({
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
async function createInventoryItem(input, performedById, performedByEmail) {
    // Validate based on type
    if (input.type === 'ROLL' && (!input.meters || input.meters <= 0)) {
        throw new Error('ROLL items require positive meters value');
    }
    if (input.type === 'PIECE' && input.isPiecePackage) {
        if (!input.packageComponents?.length) {
            throw new Error('Piece packages require at least one package component');
        }
    }
    else if (input.type === 'PIECE' && (!input.pieceLength || input.pieceLength <= 0)) {
        throw new Error('PIECE items require positive pieceLength value');
    }
    if (input.type === 'REMANENT' && (!input.meters || input.meters <= 0)) {
        throw new Error('REMANENT items require positive meters value');
    }
    const pieceLength = input.type === 'PIECE' && !input.isPiecePackage ? input.pieceLength : 0;
    const packageKey = input.isPiecePackage
        ? input.packageKey ?? ''
        : input.type === 'ROLL' || input.type === 'REMANENT'
            ? input.packageKey ?? ''
            : '';
    const packageComponents = input.isPiecePackage
        ? (0, packageStock_1.parsePackageComponents)(input.packageComponents)
        : [];
    const packageQuantity = input.quantity ?? 1;
    const packageComponentStock = input.isPiecePackage && packageComponents.length > 0
        ? (0, packageStock_1.buildPackageComponentStock)(packageComponents, packageQuantity)
        : undefined;
    // Verify branch exists
    const branch = await prisma_1.prisma.branch.findUnique({ where: { id: input.branchId } });
    if (!branch)
        throw new Error('Branch not found');
    // Verify color exists
    const color = await prisma_1.prisma.color.findUnique({ where: { id: input.colorId } });
    if (!color)
        throw new Error('Color not found');
    // Create the item + audit log in a transaction
    const item = await prisma_1.prisma.$transaction(async (tx) => {
        const created = await tx.inventoryItem.create({
            data: {
                id: input.id,
                branchId: input.branchId,
                code: input.code,
                subCode: input.subCode,
                colorId: input.colorId,
                type: input.type,
                meters: input.meters,
                pieceLength,
                quantity: input.quantity ?? 1,
                costPrice: input.costPrice ?? input.subCode,
                qrCodeValue: input.qrCodeValue || input.id,
                qrCodeDataUrl: input.qrCodeDataUrl,
                pictureName: input.pictureName,
                pictureDataUrl: input.pictureDataUrl,
                description: input.description,
                isPiecePackage: input.isPiecePackage ?? false,
                packageKey,
                packageComponents: input.packageComponents
                    ? input.packageComponents
                    : undefined,
                packageComponentStock: packageComponentStock
                    ? packageComponentStock
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
                changes: { created: input },
            },
        });
        return created;
    });
    return item;
}
// ============================================================
// UPDATE INVENTORY ITEM (with optimistic locking)
// ============================================================
async function updateInventoryItem(id, input, performedById, performedByEmail) {
    const existing = await prisma_1.prisma.inventoryItem.findUnique({
        where: { id },
        include: { color: true, branch: true },
    });
    if (!existing)
        throw new Error('Inventory item not found');
    if (existing.isArchived)
        throw new Error('Cannot update archived item');
    if (existing.version !== input.version) {
        throw new Error('Item was modified by another user. Please refresh and try again.');
    }
    const nextCode = input.code ?? existing.code;
    const nextSubCode = input.subCode !== undefined ? input.subCode : Number(existing.subCode);
    const nextColorId = input.colorId ?? existing.colorId;
    const nextPieceLength = input.pieceLength !== undefined
        ? input.pieceLength
        : Number(existing.pieceLength);
    const nextMeters = input.meters !== undefined
        ? input.meters
        : existing.meters !== null
            ? Number(existing.meters)
            : undefined;
    const nextQuantity = input.quantity !== undefined ? input.quantity : existing.quantity;
    const nextCostPrice = input.costPrice !== undefined
        ? input.costPrice
        : existing.costPrice !== null
            ? Number(existing.costPrice)
            : nextSubCode;
    if (nextCode <= 0)
        throw new Error('Family code must be positive');
    if (nextSubCode < 0)
        throw new Error('Sub code must be non-negative');
    const color = nextColorId === existing.colorId
        ? existing.color
        : await prisma_1.prisma.color.findUnique({ where: { id: nextColorId } });
    if (!color)
        throw new Error('Color not found');
    if (existing.type === 'ROLL' && nextMeters !== undefined && nextMeters <= 0) {
        throw new Error('ROLL items require positive meters value');
    }
    if (existing.type === 'REMANENT' && nextMeters !== undefined && nextMeters <= 0) {
        throw new Error('REMANENT items require positive meters value');
    }
    if (existing.type === 'PIECE' &&
        !existing.isPiecePackage &&
        nextPieceLength <= 0) {
        throw new Error('PIECE items require positive pieceLength value');
    }
    if (existing.type === 'PIECE' && nextQuantity < 0) {
        throw new Error('PIECE quantity cannot be negative');
    }
    const storedPieceLength = existing.type === 'PIECE' && !existing.isPiecePackage ? nextPieceLength : 0;
    const nextId = (0, inventoryCodes_1.resolveInventoryItemId)({
        branchId: existing.branchId,
        code: nextCode,
        subCode: nextSubCode,
        colorName: color.name,
        colorId: nextColorId,
        type: existing.type,
        pieceLength: storedPieceLength,
        isPiecePackage: existing.isPiecePackage,
        packageComponents: existing.packageComponents,
    });
    const identityChanged = nextId !== id ||
        nextCode !== existing.code ||
        Number(existing.subCode) !== nextSubCode ||
        nextColorId !== existing.colorId ||
        Number(existing.pieceLength) !== storedPieceLength;
    if (identityChanged) {
        const duplicate = await prisma_1.prisma.inventoryItem.findFirst({
            where: {
                branchId: existing.branchId,
                code: nextCode,
                subCode: nextSubCode,
                colorId: nextColorId,
                type: existing.type,
                pieceLength: storedPieceLength,
                packageKey: existing.packageKey,
                isArchived: false,
                NOT: { id },
            },
        });
        if (duplicate) {
            throw new Error('Another item already exists with this family code, price, color, and size.');
        }
    }
    if (nextId !== id) {
        const existingTarget = await prisma_1.prisma.inventoryItem.findUnique({
            where: { id: nextId },
        });
        if (existingTarget) {
            throw new Error(`Inventory item ${nextId} already exists`);
        }
    }
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
        const updateData = {
            code: nextCode,
            subCode: nextSubCode,
            colorId: nextColorId,
            pieceLength: storedPieceLength,
            meters: nextMeters,
            quantity: nextQuantity,
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
                    },
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
                type: existing.type,
                meters: nextMeters,
                pieceLength: storedPieceLength,
                quantity: nextQuantity,
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
                },
            },
        });
        return migrated;
    });
    return updated;
}
// ============================================================
// ARCHIVE (soft delete) INVENTORY ITEM
// ============================================================
async function archiveInventoryItem(id, performedById, performedByEmail) {
    const existing = await prisma_1.prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing)
        throw new Error('Inventory item not found');
    if (existing.isArchived)
        throw new Error('Item is already archived');
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
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
async function restoreInventoryItem(id, performedById, performedByEmail) {
    const existing = await prisma_1.prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing)
        throw new Error('Inventory item not found');
    if (!existing.isArchived)
        throw new Error('Item is not archived');
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
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
async function deleteInventoryItem(id, performedById, performedByEmail) {
    const existing = await prisma_1.prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing)
        throw new Error('Inventory item not found');
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.auditLog.create({
            data: {
                entityType: 'InventoryItem',
                entityId: id,
                action: 'DELETE',
                performedById: performedById || null,
                performedByEmail: performedByEmail || null,
                branchId: existing.branchId,
                changes: { deletedItem: existing },
            },
        });
        await tx.inventoryItem.delete({ where: { id } });
    });
    return { success: true, id };
}
// ============================================================
// INVENTORY STATS
// ============================================================
async function getInventoryStats(branchId) {
    const where = { isArchived: false };
    if (branchId)
        where.branchId = branchId;
    const [totalItems, byType, byBranch] = await Promise.all([
        prisma_1.prisma.inventoryItem.count({ where }),
        prisma_1.prisma.inventoryItem.groupBy({
            by: ['type'],
            where,
            _count: { _all: true },
        }),
        prisma_1.prisma.inventoryItem.groupBy({
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
//# sourceMappingURL=inventory.js.map