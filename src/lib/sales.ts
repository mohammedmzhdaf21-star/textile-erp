import { prisma } from './prisma';
import { Prisma } from '@prisma/client';
import {
  deductInventoryForSaleItem,
  restoreInventoryForSaleItem,
} from './inventoryDeduction';
import {
  recordCommissionForSaleItem,
  removePendingCommissionsForSale,
} from './commissions';

// ============================================================
// SALES BUSINESS LOGIC
// ============================================================

// ---- Types ----
export interface SaleItemInput {
  inventoryItemId?: string;
  isPlainCloth?: boolean;
  plainClothName?: string;
  colorId: string;
  soldAsUnit: 'METER' | 'PIECE';
  quantitySold: number;
  soldPrice: number;
  lineDiscount?: number;
  isPiecePackage?: boolean;
  packageSaleMode?: 'FULL' | 'PARTIAL';
  packagesSold?: number;
  packageComponentsSold?: Array<{ name: string; quantity: number }>;
  qrCodeValue?: string;
  qrCodeDataUrl?: string;
}

const resolveSaleItemQr = (
  item: SaleItemInput,
  invItem?: { id: string; qrCodeValue: string | null; qrCodeDataUrl: string | null } | null
) => {
  if (item.qrCodeDataUrl) {
    return {
      qrCodeValue: item.qrCodeValue ?? item.inventoryItemId ?? null,
      qrCodeDataUrl: item.qrCodeDataUrl,
    };
  }
  if (invItem?.qrCodeDataUrl) {
    return {
      qrCodeValue: invItem.qrCodeValue ?? invItem.id,
      qrCodeDataUrl: invItem.qrCodeDataUrl,
    };
  }
  return { qrCodeValue: null, qrCodeDataUrl: null };
};

export interface CreateSaleInput {
  branchId: string;
  employeeId: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  items: SaleItemInput[];
  discount?: number;
  paymentMethod?: 'CASH' | 'FIB' | 'CARD' | 'TRANSFER' | 'CREDIT';
  notes?: string;
}

export interface ListSalesParams {
  branchId?: string;
  employeeId?: string;
  customerPhone?: string;
  search?: string;
  fromDate?: Date;
  toDate?: Date;
  includeVoided?: boolean;
  page?: number;
  pageSize?: number;
}

export interface RefundInput {
  amount: number;
  method: 'CASH' | 'CARD' | 'STORE_CREDIT';
  reason: string;
}

export interface ExchangeReturnedInventoryInput {
  inventoryItemId: string;
  soldAsUnit: 'METER' | 'PIECE';
  quantityReturned: number;
  returnPrice: number;
}

export interface ExchangeReturnedPlainInput {
  clothName: string;
  meters: number;
  returnPricePerMeter: number;
  note?: string;
}

export interface ProcessExchangeInput {
  branchId: string;
  employeeId: string;
  customerName: string;
  customerPhone: string;
  returnedInventory?: ExchangeReturnedInventoryInput[];
  returnedPlain?: ExchangeReturnedPlainInput[];
  replacementItems?: SaleItemInput[];
  paymentStatus?: 'FULL' | 'PARTIAL';
  amountPaid?: number;
  notes?: string;
}

async function applyPackageSaleToInventory(
  tx: Prisma.TransactionClient,
  invItem: {
    id: string;
    quantity: number;
    packageComponents: unknown;
    packageComponentStock: unknown;
    isPiecePackage: boolean;
    version?: number;
  },
  item: SaleItemInput,
  direction: 'deduct' | 'restore'
) {
  await (direction === 'deduct' ? deductInventoryForSaleItem : restoreInventoryForSaleItem)(tx, {
    inventoryItemId: invItem.id,
    soldAsUnit: 'PIECE',
    quantitySold: item.packageSaleMode === 'FULL'
      ? Math.floor(item.packagesSold ?? item.quantitySold)
      : parseFloat(String(item.quantitySold)),
    isPiecePackage: true,
    packageSaleMode: item.packageSaleMode,
    packagesSold: item.packagesSold,
    packageComponentsSold: item.packageComponentsSold,
  });
}

// ============================================================
// CREATE SALE (the big one!)
// ============================================================
export async function createSale(
  input: CreateSaleInput,
  performedById?: string,
  performedByEmail?: string
) {
  if (!input.items || input.items.length === 0) {
    throw new Error('Sale must have at least one item');
  }

  // Calculate total from items
  let totalPrice = 0;
  for (const item of input.items) {
    if (item.quantitySold <= 0) throw new Error('Quantity must be positive');
    if (item.soldPrice < 0) throw new Error('Price cannot be negative');
    const lineDiscount = item.lineDiscount || 0;
    totalPrice += item.soldPrice * item.quantitySold - lineDiscount;
  }

  const totalDiscount = input.discount || 0;
  totalPrice -= totalDiscount;

  if (totalPrice < 0) {
    throw new Error('Total price cannot be negative after discounts');
  }

  // Run everything in a transaction
  const sale = await prisma.$transaction(async (tx) => {
    // Verify branch exists
    const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
    if (!branch) throw new Error('Branch not found');

    // Verify employee exists
    const employee = await tx.employee.findUnique({
      where: { id: input.employeeId },
    });
    if (!employee) throw new Error('Employee not found');

    // Verify or link customer
    let customerId = input.customerId;
    if (!customerId && input.customerPhone) {
      const existingCustomer = await tx.customer.findUnique({
        where: { phone: input.customerPhone },
      });
      if (existingCustomer) {
        customerId = existingCustomer.id;
      }
    }

    // Create the sale
    const createdSale = await tx.sale.create({
      data: {
        branchId: input.branchId,
        employeeId: input.employeeId,
        customerId: customerId || null,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        totalPrice: new Prisma.Decimal(totalPrice.toFixed(2)),
        discount: new Prisma.Decimal(totalDiscount.toFixed(2)),
        paymentMethod: input.paymentMethod || 'CASH',
        notes: input.notes || null,
      },
    });

    // Process each item
    for (const item of input.items) {
      let invItem: {
        id: string;
        type: string;
        meters: Prisma.Decimal | null;
        quantity: number;
        isArchived: boolean;
        isPiecePackage: boolean;
        packageComponents: unknown;
        packageComponentStock: unknown;
        qrCodeValue: string | null;
        qrCodeDataUrl: string | null;
      } | null = null;

      // If it has an inventoryItemId, deduct from inventory
      if (item.inventoryItemId) {
        invItem = await deductInventoryForSaleItem(tx, {
          inventoryItemId: item.inventoryItemId,
          soldAsUnit: item.soldAsUnit,
          quantitySold: item.quantitySold,
          isPiecePackage: item.isPiecePackage,
          packageSaleMode: item.packageSaleMode,
          packagesSold: item.packagesSold,
          packageComponentsSold: item.packageComponentsSold,
        });
      }

      // Verify or create a plain cloth color placeholder when needed
      let colorId = item.colorId;
      if (item.isPlainCloth) {
        const plainClothColor = await tx.color.upsert({
          where: { name: 'Plain Cloth' },
          update: {},
          create: {
            id: colorId || 'PLAIN',
            name: 'Plain Cloth',
            hexCode: '#CCCCCC',
          },
        });
        colorId = plainClothColor.id;
      } else {
        const color = await tx.color.findUnique({ where: { id: item.colorId } });
        if (!color) throw new Error(`Color ${item.colorId} not found`);
      }

      const qrSnapshot = resolveSaleItemQr(item, invItem);

      // Create the sale item
      const createdSaleItem = await tx.saleItem.create({
        data: {
          saleId: createdSale.id,
          inventoryItemId: item.inventoryItemId || null,
          isPlainCloth: item.isPlainCloth || false,
          plainClothName: item.plainClothName || null,
          colorId,
          soldAsUnit: item.soldAsUnit,
          quantitySold: new Prisma.Decimal(item.quantitySold.toFixed(2)),
          soldPrice: new Prisma.Decimal(item.soldPrice.toFixed(2)),
          lineDiscount: new Prisma.Decimal((item.lineDiscount || 0).toFixed(2)),
          isPiecePackage: item.isPiecePackage || false,
          packageSaleMode: item.packageSaleMode || null,
          packagesSold: item.packagesSold ?? null,
          packageComponentsSold: item.packageComponentsSold
            ? (item.packageComponentsSold as Prisma.InputJsonValue)
            : undefined,
          qrCodeValue: qrSnapshot.qrCodeValue,
          qrCodeDataUrl: qrSnapshot.qrCodeDataUrl,
        },
      });

      await recordCommissionForSaleItem(tx, {
        employeeId: input.employeeId,
        saleId: createdSale.id,
        saleItemId: createdSaleItem.id,
        inventoryItemId: item.inventoryItemId,
        soldPrice: item.soldPrice,
        quantitySold: item.quantitySold,
        isPlainCloth: item.isPlainCloth,
        plainClothName: item.plainClothName,
      });
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        entityType: 'Sale',
        entityId: createdSale.id,
        action: 'CREATE',
        performedById: performedById || null,
        performedByEmail: performedByEmail || null,
        branchId: input.branchId,
        changes: {
          totalPrice,
          itemCount: input.items.length,
          customer: input.customerName,
        } as Prisma.InputJsonValue,
      },
    });

    // Fetch the complete sale with items
    return await tx.sale.findUnique({
      where: { id: createdSale.id },
      include: {
        items: { include: { color: true, inventoryItem: true } },
        branch: true,
        employee: { select: { id: true, name: true, email: true } },
        customer: true,
      },
    });
  });

  return sale;
}

// ============================================================
// PROCESS EXCHANGE
// ============================================================
export async function processExchange(
  input: ProcessExchangeInput,
  performedById?: string,
  performedByEmail?: string
) {
  const returnedInventory = input.returnedInventory || [];
  const returnedPlain = input.returnedPlain || [];
  const replacementItems = input.replacementItems || [];

  if (
    returnedInventory.length === 0 &&
    returnedPlain.length === 0 &&
    replacementItems.length === 0
  ) {
    throw new Error('Exchange must include returned items or replacement items');
  }

  const returnedInventoryTotal = returnedInventory.reduce((sum, item) => {
    if (item.quantityReturned <= 0) throw new Error('Returned quantity must be positive');
    if (item.returnPrice < 0) throw new Error('Returned price cannot be negative');
    return sum + item.quantityReturned * item.returnPrice;
  }, 0);

  const returnedPlainTotal = returnedPlain.reduce((sum, item) => {
    if (item.meters <= 0) throw new Error('Returned plain cloth meters must be positive');
    if (item.returnPricePerMeter < 0) {
      throw new Error('Returned plain cloth price cannot be negative');
    }
    return sum + item.meters * item.returnPricePerMeter;
  }, 0);

  let replacementTotal = 0;
  for (const item of replacementItems) {
    if (item.quantitySold <= 0) throw new Error('Quantity must be positive');
    if (item.soldPrice < 0) throw new Error('Price cannot be negative');
    replacementTotal += item.soldPrice * item.quantitySold - (item.lineDiscount || 0);
  }

  const returnedTotal = returnedInventoryTotal + returnedPlainTotal;
  const netDue = Number((replacementTotal - returnedTotal).toFixed(2));
  const refundAmount = Math.max(0, Number((-netDue).toFixed(2)));
  const saleTotal = Math.max(0, netDue);
  const amountPaid =
    saleTotal > 0
      ? input.paymentStatus === 'PARTIAL'
        ? Number((input.amountPaid || 0).toFixed(2))
        : saleTotal
      : refundAmount > 0
      ? -refundAmount
      : 0;

  if (saleTotal > 0 && input.paymentStatus === 'PARTIAL') {
    if (amountPaid <= 0 || amountPaid >= saleTotal) {
      throw new Error('Partial exchange payments must be greater than 0 and less than the net amount due');
    }
  }

  const sale = await prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
    if (!branch) throw new Error('Branch not found');

    const employee = await tx.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new Error('Employee not found');

    let customerId: string | undefined;
    if (input.customerPhone) {
      const existingCustomer = await tx.customer.findUnique({
        where: { phone: input.customerPhone },
      });
      customerId = existingCustomer?.id;
    }

    for (const returned of returnedInventory) {
      const invItem = await tx.inventoryItem.findUnique({
        where: { id: returned.inventoryItemId },
      });

      if (!invItem) throw new Error(`Inventory item ${returned.inventoryItemId} not found`);
      if (invItem.isArchived) {
        throw new Error(`Inventory item ${returned.inventoryItemId} is archived`);
      }

      if (returned.soldAsUnit === 'PIECE') {
        await tx.inventoryItem.update({
          where: { id: returned.inventoryItemId },
          data: {
            quantity: { increment: Math.floor(returned.quantityReturned) },
            version: { increment: 1 },
          },
        });
      } else {
        const currentMeters = invItem.meters ? parseFloat(invItem.meters.toString()) : 0;
        await tx.inventoryItem.update({
          where: { id: returned.inventoryItemId },
          data: {
            meters: new Prisma.Decimal(
              (currentMeters + returned.quantityReturned).toFixed(2)
            ),
            version: { increment: 1 },
          },
        });
      }
    }

    const paymentNote =
      saleTotal > 0
        ? `Paid ${amountPaid.toFixed(2)} now, due ${(saleTotal - amountPaid).toFixed(2)}.`
        : refundAmount > 0
        ? `Refunded ${refundAmount.toFixed(2)} to customer.`
        : 'Even exchange. Paid 0.00 now, due 0.00.';

    const exchangeNotes = [
      'EXCHANGE',
      `Replacement ${replacementTotal.toFixed(2)}`,
      `Returned ${returnedTotal.toFixed(2)}`,
      `Net ${netDue.toFixed(2)}`,
      paymentNote,
      input.notes,
    ]
      .filter(Boolean)
      .join(' | ');

    const createdSale = await tx.sale.create({
      data: {
        branchId: input.branchId,
        employeeId: input.employeeId,
        customerId: customerId || null,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        totalPrice: new Prisma.Decimal(saleTotal.toFixed(2)),
        discount: new Prisma.Decimal(Math.min(returnedTotal, replacementTotal).toFixed(2)),
        paymentMethod:
          saleTotal > 0 && input.paymentStatus === 'PARTIAL' ? 'CREDIT' : 'CASH',
        notes: exchangeNotes,
      },
    });

    for (const item of replacementItems) {
      let invItem: {
        id: string;
        type: string;
        meters: Prisma.Decimal | null;
        quantity: number;
        isArchived: boolean;
        isPiecePackage: boolean;
        packageComponents: unknown;
        packageComponentStock: unknown;
        qrCodeValue: string | null;
        qrCodeDataUrl: string | null;
      } | null = null;

      if (item.inventoryItemId) {
        invItem = await deductInventoryForSaleItem(tx, {
          inventoryItemId: item.inventoryItemId,
          soldAsUnit: item.soldAsUnit,
          quantitySold: item.quantitySold,
          isPiecePackage: item.isPiecePackage,
          packageSaleMode: item.packageSaleMode,
          packagesSold: item.packagesSold,
          packageComponentsSold: item.packageComponentsSold,
        });
      }

      let colorId = item.colorId;
      if (item.isPlainCloth) {
        const plainClothColor = await tx.color.upsert({
          where: { name: 'Plain Cloth' },
          update: {},
          create: {
            id: colorId || 'PLAIN',
            name: 'Plain Cloth',
            hexCode: '#CCCCCC',
          },
        });
        colorId = plainClothColor.id;
      } else {
        const color = await tx.color.findUnique({ where: { id: item.colorId } });
        if (!color) throw new Error(`Color ${item.colorId} not found`);
      }

      const qrSnapshot = resolveSaleItemQr(item, invItem);

      const createdSaleItem = await tx.saleItem.create({
        data: {
          saleId: createdSale.id,
          inventoryItemId: item.inventoryItemId || null,
          isPlainCloth: item.isPlainCloth || false,
          plainClothName: item.plainClothName || null,
          colorId,
          soldAsUnit: item.soldAsUnit,
          quantitySold: new Prisma.Decimal(item.quantitySold.toFixed(2)),
          soldPrice: new Prisma.Decimal(item.soldPrice.toFixed(2)),
          lineDiscount: new Prisma.Decimal((item.lineDiscount || 0).toFixed(2)),
          isPiecePackage: item.isPiecePackage || false,
          packageSaleMode: item.packageSaleMode || null,
          packagesSold: item.packagesSold ?? null,
          packageComponentsSold: item.packageComponentsSold
            ? (item.packageComponentsSold as Prisma.InputJsonValue)
            : undefined,
          qrCodeValue: qrSnapshot.qrCodeValue,
          qrCodeDataUrl: qrSnapshot.qrCodeDataUrl,
        },
      });

      await recordCommissionForSaleItem(tx, {
        employeeId: input.employeeId,
        saleId: createdSale.id,
        saleItemId: createdSaleItem.id,
        inventoryItemId: item.inventoryItemId,
        soldPrice: item.soldPrice,
        quantitySold: item.quantitySold,
        isPlainCloth: item.isPlainCloth,
        plainClothName: item.plainClothName,
      });
    }

    await tx.auditLog.create({
      data: {
        entityType: 'Exchange',
        entityId: createdSale.id,
        action: 'CREATE',
        performedById: performedById || null,
        performedByEmail: performedByEmail || null,
        branchId: input.branchId,
        changes: {
          replacementTotal,
          returnedTotal,
          netDue,
          amountPaid,
          refundAmount,
          returnedInventoryCount: returnedInventory.length,
          returnedPlainCount: returnedPlain.length,
          replacementCount: replacementItems.length,
        } as Prisma.InputJsonValue,
      },
    });

    return await tx.sale.findUnique({
      where: { id: createdSale.id },
      include: {
        items: { include: { color: true, inventoryItem: true } },
        branch: true,
        employee: { select: { id: true, name: true, email: true } },
        customer: true,
      },
    });
  });

  return {
    sale,
    summary: {
      replacementTotal,
      returnedTotal,
      netDue,
      amountPaid,
      refundAmount,
    },
  };
}

// ============================================================
// LIST SALES
// ============================================================
export async function listSales(params: ListSalesParams) {
  const {
    branchId,
    employeeId,
    customerPhone,
    search,
    fromDate,
    toDate,
    includeVoided = false,
    page = 1,
    pageSize = 50,
  } = params;

  const where: Prisma.SaleWhereInput = {};

  if (branchId) where.branchId = branchId;
  if (employeeId) where.employeeId = employeeId;
  if (customerPhone) where.customerPhone = customerPhone;
  if (!includeVoided) where.isVoided = false;

  if (search?.trim()) {
    const trimmed = search.trim();
    const phoneDigits = trimmed.replace(/\D/g, '');
    const searchConditions: Prisma.SaleWhereInput[] = [
      {
        items: {
          some: {
            inventoryItemId: {
              equals: trimmed,
              mode: 'insensitive',
            },
          },
        },
      },
      {
        items: {
          some: {
            inventoryItemId: {
              contains: trimmed,
              mode: 'insensitive',
            },
          },
        },
      },
      {
        customerPhone: {
          contains: trimmed,
          mode: 'insensitive',
        },
      },
      {
        customerName: {
          contains: trimmed,
          mode: 'insensitive',
        },
      },
    ];

    if (phoneDigits.length >= 3) {
      searchConditions.push({
        customerPhone: {
          contains: phoneDigits,
        },
      });
    }

    if (trimmed.length >= 8) {
      searchConditions.push({ id: trimmed });
    }

    where.OR = searchConditions;
  }

  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = fromDate;
    if (toDate) where.createdAt.lte = toDate;
  }

  const skip = (page - 1) * pageSize;
  const take = Math.min(pageSize, 200);

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { color: true } },
        branch: { select: { id: true, name: true } },
        employee: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.sale.count({ where }),
  ]);

  return {
    sales,
    pagination: {
      page,
      pageSize: take,
      total,
      totalPages: Math.ceil(total / take),
    },
  };
}

// ============================================================
// GET ONE SALE
// ============================================================
export async function getSale(id: string) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      items: { include: { color: true, inventoryItem: true } },
      branch: true,
      employee: { select: { id: true, name: true, email: true } },
      customer: true,
      refunds: { include: { processedBy: { select: { name: true, email: true } } } },
      voidedBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!sale) throw new Error('Sale not found');
  return sale;
}

// ============================================================
// VOID A SALE (restocks inventory)
// ============================================================
export async function voidSale(
  saleId: string,
  reason: string,
  voidedById: string,
  performedByEmail?: string
) {
  if (!reason || reason.trim().length === 0) {
    throw new Error('Void reason is required');
  }

  return await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    });

    if (!sale) throw new Error('Sale not found');
    if (sale.isVoided) throw new Error('Sale is already voided');

    // Restock each item back to inventory
    for (const item of sale.items) {
      if (!item.inventoryItemId) continue;

      if (item.isPiecePackage && item.packageSaleMode) {
        await applyPackageSaleToInventory(
          tx,
          {
            id: item.inventoryItemId,
            quantity: 0,
            packageComponents: null,
            packageComponentStock: null,
            isPiecePackage: true,
          },
          {
            inventoryItemId: item.inventoryItemId,
            colorId: item.colorId,
            soldAsUnit: 'PIECE',
            quantitySold: parseFloat(item.quantitySold.toString()),
            soldPrice: parseFloat(item.soldPrice.toString()),
            isPiecePackage: true,
            packageSaleMode: item.packageSaleMode as 'FULL' | 'PARTIAL',
            packagesSold: item.packagesSold ?? undefined,
            packageComponentsSold: Array.isArray(item.packageComponentsSold)
              ? (item.packageComponentsSold as Array<{ name: string; quantity: number }>)
              : undefined,
          },
          'restore'
        );
        continue;
      }

      await restoreInventoryForSaleItem(tx, {
        inventoryItemId: item.inventoryItemId,
        soldAsUnit: item.soldAsUnit,
        quantitySold: parseFloat(item.quantitySold.toString()),
      });
    }

    // Remove pending commission entries for voided sale
    await removePendingCommissionsForSale(tx, saleId);

    // Mark sale as voided
    const voidedSale = await tx.sale.update({
      where: { id: saleId },
      data: {
        isVoided: true,
        voidedById,
        voidedAt: new Date(),
        voidedReason: reason,
      },
      include: { items: true },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        entityType: 'Sale',
        entityId: saleId,
        action: 'VOID',
        performedById: voidedById,
        performedByEmail: performedByEmail || null,
        branchId: sale.branchId,
        changes: { reason } as Prisma.InputJsonValue,
      },
    });

    return voidedSale;
  });
}

// ============================================================
// PROCESS REFUND
// ============================================================
export async function processRefund(
  saleId: string,
  input: RefundInput,
  processedById: string,
  performedByEmail?: string
) {
  if (input.amount <= 0) throw new Error('Refund amount must be positive');
  if (!input.reason || input.reason.trim().length === 0) {
    throw new Error('Refund reason is required');
  }

  return await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { refunds: true },
    });

    if (!sale) throw new Error('Sale not found');
    if (sale.isVoided) throw new Error('Cannot refund a voided sale');

    // Calculate already refunded amount
    const alreadyRefunded = sale.refunds.reduce(
      (sum, r) => sum + parseFloat(r.amount.toString()),
      0
    );
    const totalPrice = parseFloat(sale.totalPrice.toString());

    if (alreadyRefunded + input.amount > totalPrice) {
      throw new Error(
        `Refund exceeds remaining amount. Already refunded: ${alreadyRefunded}, Sale total: ${totalPrice}`
      );
    }

    const refund = await tx.refund.create({
      data: {
        saleId,
        amount: new Prisma.Decimal(input.amount.toFixed(2)),
        method: input.method,
        reason: input.reason,
        processedById,
      },
      include: { processedBy: { select: { name: true, email: true } } },
    });

    await tx.auditLog.create({
      data: {
        entityType: 'Sale',
        entityId: saleId,
        action: 'REFUND',
        performedById: processedById,
        performedByEmail: performedByEmail || null,
        branchId: sale.branchId,
        changes: {
          amount: input.amount,
          method: input.method,
          reason: input.reason,
        } as Prisma.InputJsonValue,
      },
    });

    return refund;
  });
}

// ============================================================
// SALES STATISTICS
// ============================================================
export async function getSalesStats(params: {
  branchId?: string;
  fromDate?: Date;
  toDate?: Date;
}) {
  const where: Prisma.SaleWhereInput = { isVoided: false };
  if (params.branchId) where.branchId = params.branchId;
  if (params.fromDate || params.toDate) {
    where.createdAt = {};
    if (params.fromDate) where.createdAt.gte = params.fromDate;
    if (params.toDate) where.createdAt.lte = params.toDate;
  }

  const [totalSales, aggregates, byPaymentMethod] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.aggregate({
      where,
      _sum: { totalPrice: true, discount: true },
      _avg: { totalPrice: true },
    }),
    prisma.sale.groupBy({
      by: ['paymentMethod'],
      where,
      _count: { _all: true },
      _sum: { totalPrice: true },
    }),
  ]);

  return {
    totalSales,
    totalRevenue: aggregates._sum.totalPrice?.toString() || '0',
    totalDiscount: aggregates._sum.discount?.toString() || '0',
    averageSale: aggregates._avg.totalPrice?.toString() || '0',
    byPaymentMethod: byPaymentMethod.map((p) => ({
      method: p.paymentMethod,
      count: p._count._all,
      revenue: p._sum.totalPrice?.toString() || '0',
    })),
  };
}
