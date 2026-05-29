import { prisma } from './prisma';
import { Prisma } from '@prisma/client';

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
}

export interface CreateSaleInput {
  branchId: string;
  employeeId: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  items: SaleItemInput[];
  discount?: number;
  paymentMethod?: 'CASH' | 'CARD' | 'TRANSFER' | 'CREDIT';
  notes?: string;
}

export interface ListSalesParams {
  branchId?: string;
  employeeId?: string;
  customerPhone?: string;
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
      // If it has an inventoryItemId, deduct from inventory
      if (item.inventoryItemId) {
        const invItem = await tx.inventoryItem.findUnique({
          where: { id: item.inventoryItemId },
        });

        if (!invItem) {
          throw new Error(`Inventory item ${item.inventoryItemId} not found`);
        }

        if (invItem.isArchived) {
          throw new Error(`Inventory item ${item.inventoryItemId} is archived`);
        }

        // Check stock & deduct
        if (item.soldAsUnit === 'METER') {
          const currentMeters = invItem.meters
            ? parseFloat(invItem.meters.toString())
            : 0;
          if (currentMeters < item.quantitySold) {
            throw new Error(
              `Not enough stock for ${item.inventoryItemId}. Available: ${currentMeters}m, Requested: ${item.quantitySold}m`
            );
          }
          await tx.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: {
              meters: new Prisma.Decimal((currentMeters - item.quantitySold).toFixed(2)),
              version: { increment: 1 },
            },
          });
        } else if (item.soldAsUnit === 'PIECE') {
          if (invItem.quantity < item.quantitySold) {
            throw new Error(
              `Not enough pieces for ${item.inventoryItemId}. Available: ${invItem.quantity}, Requested: ${item.quantitySold}`
            );
          }
          await tx.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: {
              quantity: { decrement: Math.floor(item.quantitySold) },
              version: { increment: 1 },
            },
          });
        }
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

      // Create the sale item
      await tx.saleItem.create({
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
        },
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
// LIST SALES
// ============================================================
export async function listSales(params: ListSalesParams) {
  const {
    branchId,
    employeeId,
    customerPhone,
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
      if (item.inventoryItemId) {
        const invItem = await tx.inventoryItem.findUnique({
          where: { id: item.inventoryItemId },
        });

        if (invItem && !invItem.isArchived) {
          if (item.soldAsUnit === 'METER') {
            const currentMeters = invItem.meters
              ? parseFloat(invItem.meters.toString())
              : 0;
            const qty = parseFloat(item.quantitySold.toString());
            await tx.inventoryItem.update({
              where: { id: item.inventoryItemId },
              data: {
                meters: new Prisma.Decimal((currentMeters + qty).toFixed(2)),
                version: { increment: 1 },
              },
            });
          } else if (item.soldAsUnit === 'PIECE') {
            await tx.inventoryItem.update({
              where: { id: item.inventoryItemId },
              data: {
                quantity: { increment: Math.floor(parseFloat(item.quantitySold.toString())) },
                version: { increment: 1 },
              },
            });
          }
        }
      }
    }

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
