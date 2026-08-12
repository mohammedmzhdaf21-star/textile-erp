import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  getCommissionRate,
  getItemMinimumPrice,
  getItemMinimumPrices,
} from './commissionSettings';

const PRICE_EPS = 0.001;

export function calculateLineCommission(
  soldPrice: number,
  minimumPrice: number,
  quantitySold: number,
  ratePercent: number,
  baseAmountPerUnit = 0
): number {
  if (quantitySold <= 0 || soldPrice < minimumPrice - PRICE_EPS) {
    return 0;
  }

  // Sold at minimum price → flat amount per unit
  if (soldPrice <= minimumPrice + PRICE_EPS) {
    return Number((baseAmountPerUnit * quantitySold).toFixed(2));
  }

  // Sold above minimum → percentage of the amount above minimum (per unit × qty)
  const margin = soldPrice - minimumPrice;
  const commission = margin * quantitySold * (ratePercent / 100);
  return Number(commission.toFixed(2));
}

export async function recordCommissionForSaleItem(
  tx: Prisma.TransactionClient,
  params: {
    employeeId: string;
    saleId: string;
    saleItemId: string;
    inventoryItemId?: string | null;
    soldPrice: number;
    quantitySold: number;
  }
) {
  if (!params.inventoryItemId) return null;

  const minimum = await getItemMinimumPrice(params.inventoryItemId);
  if (!minimum) return null;

  const rate = await getCommissionRate();
  const commissionAmount = calculateLineCommission(
    params.soldPrice,
    minimum.minimumPrice,
    params.quantitySold,
    rate.ratePercent,
    rate.baseAmountPerUnit
  );

  if (commissionAmount <= 0) return null;

  return tx.employeeCommissionEntry.create({
    data: {
      employeeId: params.employeeId,
      saleId: params.saleId,
      saleItemId: params.saleItemId,
      inventoryItemId: params.inventoryItemId,
      soldPrice: new Prisma.Decimal(params.soldPrice.toFixed(2)),
      minimumPrice: new Prisma.Decimal(minimum.minimumPrice.toFixed(2)),
      quantitySold: new Prisma.Decimal(params.quantitySold.toFixed(2)),
      ratePercent: new Prisma.Decimal(rate.ratePercent.toFixed(2)),
      commissionAmount: new Prisma.Decimal(commissionAmount.toFixed(2)),
      status: 'PENDING',
    },
  });
}

export async function removePendingCommissionsForSale(
  tx: Prisma.TransactionClient,
  saleId: string
) {
  await tx.employeeCommissionEntry.deleteMany({
    where: { saleId, status: 'PENDING' },
  });
}

export type PendingCommissionLine = {
  id: string;
  saleId: string;
  saleItemId: string;
  inventoryItemId: string | null;
  soldPrice: string;
  minimumPrice: string;
  quantitySold: string;
  ratePercent: string;
  commissionAmount: string;
  createdAt: string;
  saleDate: string;
};

export type PendingCommissionGroup = {
  employee: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  totalPending: string;
  entries: PendingCommissionLine[];
};

export async function listPendingCommissions(options?: {
  employeeId?: string;
}): Promise<PendingCommissionGroup[]> {
  const entries = await prisma.employeeCommissionEntry.findMany({
    where: {
      status: 'PENDING',
      ...(options?.employeeId ? { employeeId: options.employeeId } : {}),
      sale: { isVoided: false },
    },
    include: {
      employee: { select: { id: true, name: true, email: true, role: true } },
      sale: { select: { createdAt: true } },
    },
    orderBy: [{ employee: { name: 'asc' } }, { createdAt: 'desc' }],
  });

  const grouped = new Map<string, PendingCommissionGroup>();

  for (const entry of entries) {
    const key = entry.employeeId;
    const existing = grouped.get(key);
    const line: PendingCommissionLine = {
      id: entry.id,
      saleId: entry.saleId,
      saleItemId: entry.saleItemId,
      inventoryItemId: entry.inventoryItemId,
      soldPrice: entry.soldPrice.toString(),
      minimumPrice: entry.minimumPrice.toString(),
      quantitySold: entry.quantitySold.toString(),
      ratePercent: entry.ratePercent.toString(),
      commissionAmount: entry.commissionAmount.toString(),
      createdAt: entry.createdAt.toISOString(),
      saleDate: entry.sale.createdAt.toISOString(),
    };

    if (existing) {
      existing.entries.push(line);
      existing.totalPending = (
        parseFloat(existing.totalPending) + parseFloat(line.commissionAmount)
      ).toFixed(2);
    } else {
      grouped.set(key, {
        employee: entry.employee,
        totalPending: parseFloat(entry.commissionAmount.toString()).toFixed(2),
        entries: [line],
      });
    }
  }

  return Array.from(grouped.values());
}

export async function markEmployeeCommissionsPaid(
  employeeId: string,
  paidById: string,
  paidByEmail?: string
) {
  return prisma.$transaction(async (tx) => {
    const pending = await tx.employeeCommissionEntry.findMany({
      where: {
        employeeId,
        status: 'PENDING',
        sale: { isVoided: false },
      },
    });

    if (pending.length === 0) {
      throw new Error('No pending commission entries for this employee');
    }

    const totalAmount = pending.reduce(
      (sum, entry) => sum + parseFloat(entry.commissionAmount.toString()),
      0
    );

    const now = new Date();
    await tx.employeeCommissionEntry.updateMany({
      where: { id: { in: pending.map((entry) => entry.id) } },
      data: {
        status: 'PAID',
        paidAt: now,
        paidById,
      },
    });

    const payment = await tx.paidCommissionHistory.create({
      data: {
        employeeId,
        amountPaid: new Prisma.Decimal(totalAmount.toFixed(2)),
        paidAt: now,
        notes: `Paid ${pending.length} commission line(s)`,
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: 'EmployeeCommission',
        entityId: employeeId,
        action: 'UPDATE',
        performedById: paidById,
        performedByEmail: paidByEmail || null,
        changes: {
          action: 'mark_paid',
          entryCount: pending.length,
          amountPaid: totalAmount,
          paymentId: payment.id,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      payment,
      paidCount: pending.length,
      amountPaid: totalAmount.toFixed(2),
    };
  });
}

export async function backfillCommissionEntries() {
  const [rate, prices, sales] = await Promise.all([
    getCommissionRate(),
    getItemMinimumPrices(),
    prisma.sale.findMany({
      where: { isVoided: false },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  let created = 0;

  for (const sale of sales) {
    for (const item of sale.items) {
      if (!item.inventoryItemId) continue;

      const existing = await prisma.employeeCommissionEntry.findUnique({
        where: { saleItemId: item.id },
      });
      if (existing) continue;

      const minimum = prices[item.inventoryItemId];
      if (!minimum) continue;

      const soldPrice = parseFloat(item.soldPrice.toString());
      const quantitySold = parseFloat(item.quantitySold.toString());
      const commissionAmount = calculateLineCommission(
        soldPrice,
        minimum.minimumPrice,
        quantitySold,
        rate.ratePercent,
        rate.baseAmountPerUnit
      );

      if (commissionAmount <= 0) continue;

      await prisma.employeeCommissionEntry.create({
        data: {
          employeeId: sale.employeeId,
          saleId: sale.id,
          saleItemId: item.id,
          inventoryItemId: item.inventoryItemId,
          soldPrice: item.soldPrice,
          minimumPrice: new Prisma.Decimal(minimum.minimumPrice.toFixed(2)),
          quantitySold: item.quantitySold,
          ratePercent: new Prisma.Decimal(rate.ratePercent.toFixed(2)),
          commissionAmount: new Prisma.Decimal(commissionAmount.toFixed(2)),
          status: 'PENDING',
        },
      });
      created += 1;
    }
  }

  return { created };
}
