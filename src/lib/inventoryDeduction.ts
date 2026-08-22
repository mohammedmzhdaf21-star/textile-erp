import { Prisma } from '@prisma/client';
import { meterStockUpdateAfterDeduction } from './inventoryRules';
import {
  countCompletePackages,
  deductFullPackageSale,
  deductPartialPackageSale,
  parsePackageComponents,
  restoreFullPackageSale,
  restorePartialPackageSale,
  resolvePackageComponentStock,
  validateFullPackageSale,
  validatePartialPackageSale,
} from './packageStock';

export type SaleInventoryDeductionInput = {
  inventoryItemId: string;
  soldAsUnit: 'METER' | 'PIECE';
  quantitySold: number;
  isPiecePackage?: boolean;
  packageSaleMode?: 'FULL' | 'PARTIAL';
  packagesSold?: number;
  packageComponentsSold?: Array<{ name: string; quantity: number }>;
};

export type SaleInventoryItemSnapshot = {
  id: string;
  branchId: string;
  type: string;
  meters: Prisma.Decimal | null;
  quantity: number;
  isArchived: boolean;
  isPiecePackage: boolean;
  packageComponents: unknown;
  packageComponentStock: unknown;
  qrCodeValue: string | null;
  qrCodeDataUrl: string | null;
  version: number;
};

const concurrencyError = (inventoryItemId: string) =>
  `Inventory item ${inventoryItemId} was modified by another transaction. Please refresh and try again.`;

export const inventoryBranchMismatchMessage = (
  inventoryBranchId: string,
  saleBranchId: string,
  inventoryItemId: string
) => {
  if (inventoryBranchId === saleBranchId) return null;
  return `Inventory item ${inventoryItemId} belongs to branch ${inventoryBranchId}, but this sale is for branch ${saleBranchId}`;
};

async function applyPackageSaleToInventoryWithLock(
  tx: Prisma.TransactionClient,
  invItem: SaleInventoryItemSnapshot,
  item: SaleInventoryDeductionInput,
  direction: 'deduct' | 'restore'
) {
  if (!invItem.isPiecePackage) return;

  const freshItem = await tx.inventoryItem.findUnique({
    where: { id: invItem.id },
  });
  if (!freshItem) throw new Error(`Inventory item ${invItem.id} not found`);
  if (freshItem.isArchived) throw new Error(`Inventory item ${invItem.id} is archived`);

  const components = parsePackageComponents(freshItem.packageComponents);
  const currentStock = resolvePackageComponentStock({
    packageComponents: freshItem.packageComponents,
    packageComponentStock: freshItem.packageComponentStock,
    quantity: freshItem.quantity,
  });

  if (item.packageSaleMode === 'FULL') {
    const packagesSold = Math.floor(item.packagesSold ?? item.quantitySold);
    const error =
      direction === 'deduct'
        ? validateFullPackageSale(components, currentStock, packagesSold)
        : null;
    if (error) throw new Error(error);

    const nextStock =
      direction === 'deduct'
        ? deductFullPackageSale(components, currentStock, packagesSold)
        : restoreFullPackageSale(components, currentStock, packagesSold);

    const result = await tx.inventoryItem.updateMany({
      where: {
        id: invItem.id,
        version: freshItem.version,
        isArchived: false,
        ...(direction === 'deduct' ? { quantity: { gte: packagesSold } } : {}),
      },
      data: {
        packageComponentStock: nextStock as Prisma.InputJsonValue,
        quantity:
          direction === 'deduct'
            ? { decrement: packagesSold }
            : { increment: packagesSold },
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new Error(concurrencyError(invItem.id));
    }
    return;
  }

  if (item.packageSaleMode === 'PARTIAL') {
    const componentsSold = item.packageComponentsSold ?? [];
    const error =
      direction === 'deduct'
        ? validatePartialPackageSale(currentStock, componentsSold)
        : null;
    if (error) throw new Error(error);

    const nextStock =
      direction === 'deduct'
        ? deductPartialPackageSale(currentStock, componentsSold)
        : restorePartialPackageSale(currentStock, componentsSold);

    const result = await tx.inventoryItem.updateMany({
      where: {
        id: invItem.id,
        version: freshItem.version,
        isArchived: false,
      },
      data: {
        packageComponentStock: nextStock as Prisma.InputJsonValue,
        quantity: countCompletePackages(components, nextStock),
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new Error(concurrencyError(invItem.id));
    }
  }
}

export async function deductInventoryForSaleItem(
  tx: Prisma.TransactionClient,
  item: SaleInventoryDeductionInput,
  saleBranchId: string
): Promise<SaleInventoryItemSnapshot> {
  const invItem = await tx.inventoryItem.findUnique({
    where: { id: item.inventoryItemId },
  });

  if (!invItem) {
    throw new Error(`Inventory item ${item.inventoryItemId} not found`);
  }
  if (invItem.isArchived) {
    throw new Error(`Inventory item ${item.inventoryItemId} is archived`);
  }

  const branchError = inventoryBranchMismatchMessage(
    invItem.branchId,
    saleBranchId,
    item.inventoryItemId
  );
  if (branchError) {
    throw new Error(branchError);
  }

  if (item.soldAsUnit === 'METER') {
    const currentMeters = invItem.meters ? parseFloat(invItem.meters.toString()) : 0;
    if (currentMeters < item.quantitySold) {
      throw new Error(
        `Not enough stock for ${item.inventoryItemId}. Available: ${currentMeters}m, Requested: ${item.quantitySold}m`
      );
    }

    const remainingMeters = currentMeters - item.quantitySold;
    const meterUpdate = meterStockUpdateAfterDeduction(invItem.type, remainingMeters);
    const result = await tx.inventoryItem.updateMany({
      where: {
        id: item.inventoryItemId,
        version: invItem.version,
        isArchived: false,
        meters: { gte: new Prisma.Decimal(item.quantitySold.toFixed(2)) },
      },
      data: {
        meters: new Prisma.Decimal(meterUpdate.meters.toFixed(2)),
        ...(meterUpdate.type ? { type: meterUpdate.type } : {}),
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new Error(concurrencyError(item.inventoryItemId));
    }
  } else if (invItem.isPiecePackage && item.isPiecePackage) {
    await applyPackageSaleToInventoryWithLock(tx, invItem, item, 'deduct');
  } else if (item.soldAsUnit === 'PIECE') {
    const quantityToDeduct = Math.floor(item.quantitySold);
    if (invItem.quantity < quantityToDeduct) {
      throw new Error(
        `Not enough pieces for ${item.inventoryItemId}. Available: ${invItem.quantity}, Requested: ${item.quantitySold}`
      );
    }

    const result = await tx.inventoryItem.updateMany({
      where: {
        id: item.inventoryItemId,
        version: invItem.version,
        isArchived: false,
        quantity: { gte: quantityToDeduct },
      },
      data: {
        quantity: { decrement: quantityToDeduct },
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new Error(concurrencyError(item.inventoryItemId));
    }
  }

  return invItem;
}

export async function restoreInventoryForSaleItem(
  tx: Prisma.TransactionClient,
  item: SaleInventoryDeductionInput
) {
  const invItem = await tx.inventoryItem.findUnique({
    where: { id: item.inventoryItemId },
  });

  if (!invItem || invItem.isArchived) return;

  if (item.soldAsUnit === 'METER') {
    const currentMeters = invItem.meters ? parseFloat(invItem.meters.toString()) : 0;
    const result = await tx.inventoryItem.updateMany({
      where: {
        id: item.inventoryItemId,
        version: invItem.version,
        isArchived: false,
      },
      data: {
        meters: new Prisma.Decimal((currentMeters + item.quantitySold).toFixed(2)),
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new Error(concurrencyError(item.inventoryItemId));
    }
    return;
  }

  if (invItem.isPiecePackage && item.isPiecePackage && item.packageSaleMode) {
    await applyPackageSaleToInventoryWithLock(tx, invItem, item, 'restore');
    return;
  }

  if (item.soldAsUnit === 'PIECE') {
    const quantityToRestore = Math.floor(item.quantitySold);
    const result = await tx.inventoryItem.updateMany({
      where: {
        id: item.inventoryItemId,
        version: invItem.version,
        isArchived: false,
      },
      data: {
        quantity: { increment: quantityToRestore },
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new Error(concurrencyError(item.inventoryItemId));
    }
  }
}
