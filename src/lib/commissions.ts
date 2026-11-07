import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { normalizeStoredAmount } from './currency';
import {
  getCommissionRate,
  getItemMinimumPrice,
} from './commissionSettings';
import { getPlainClothPricingByName } from './plainClothPricing';
import { baselineForSoldUnit, calculateSaleCommissions, type CommissionInputLine } from './commissionMath';

function positiveAmount(value: { toString(): string } | number | null | undefined) {
  if (value == null) return 0;
  const parsed = typeof value === 'number' ? value : parseFloat(value.toString());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function resolveMinimumPriceForCommission(
  tx: Prisma.TransactionClient,
  params: {
    inventoryItemId?: string | null;
    soldAsUnit?: 'METER' | 'PIECE';
    isPlainCloth?: boolean;
    plainClothName?: string | null;
  }
): Promise<number | null> {
  if (params.isPlainCloth && params.plainClothName) {
    const plainCloth = await getPlainClothPricingByName(params.plainClothName);
    return plainCloth?.pricePerM ?? null;
  }

  if (!params.inventoryItemId) return null;

  const soldAsUnit = params.soldAsUnit ?? 'PIECE';
  const sold = await tx.inventoryItem.findUnique({
    where: { id: params.inventoryItemId },
    select: {
      sourceItemId: true,
      pieceLength: true,
      meters: true,
      type: true,
      costPrice: true,
      subCode: true,
    },
  });

  const pieceMeters =
    positiveAmount(sold?.pieceLength) ||
    (sold?.type === 'REMANENT' ? positiveAmount(sold.meters) : 0);

  let cursor: string | null = params.inventoryItemId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor) && seen.size < 6) {
    seen.add(cursor);
    const saved = await getItemMinimumPrice(cursor);
    if (saved && saved.minimumPrice > 0) {
      return baselineForSoldUnit({
        minimumPrice: saved.minimumPrice,
        priceUnit: saved.unit,
        soldAsUnit,
        pieceMeters,
      });
    }

    if (cursor === params.inventoryItemId && sold?.sourceItemId) {
      cursor = sold.sourceItemId;
      continue;
    }

    const parent = await tx.inventoryItem.findUnique({
      where: { id: cursor },
      select: { sourceItemId: true },
    });
    cursor = parent?.sourceItemId ?? null;
  }

  const ownFallback = positiveAmount(sold?.costPrice) || positiveAmount(sold?.subCode);
  if (ownFallback > 0) return normalizeStoredAmount(ownFallback);

  return null;
}

export function calculateLineCommission(
  soldPrice: number,
  minimumPrice: number,
  quantitySold: number,
  ratePercent: number,
  baseAmountPerUnit = 0
): number {
  const [result] = calculateSaleCommissions(
    [
      {
        id: 'line',
        isPlainCloth: false,
        isRemnant: false,
        soldAsUnit: 'PIECE',
        soldPrice,
        quantitySold,
        minimumPrice,
      },
    ],
    ratePercent,
    baseAmountPerUnit
  );
  return result?.commission ?? 0;
}

export async function recordCommissionsForSale(
  tx: Prisma.TransactionClient,
  params: {
    employeeId: string;
    saleId: string;
    lines: Array<{
      id: string;
      inventoryItemId?: string | null;
      isPlainCloth?: boolean;
      plainClothName?: string | null;
      soldPrice: number;
      quantitySold: number;
      lineDiscount?: number;
      soldAsUnit: 'METER' | 'PIECE';
    }>;
  }
) {
  if (params.lines.length === 0) return [];

  const inventoryIds = params.lines
    .map((line) => line.inventoryItemId)
    .filter((id): id is string => Boolean(id));
  const inventoryRows = inventoryIds.length
    ? await tx.inventoryItem.findMany({
        where: { id: { in: inventoryIds } },
        select: { id: true, type: true },
      })
    : [];
  const typeById = new Map(inventoryRows.map((row) => [row.id, row.type]));
  const rate = await getCommissionRate();
  const priced: CommissionInputLine[] = [];

  for (const line of params.lines) {
    const minimumPrice = line.isPlainCloth
      ? null
      : await resolveMinimumPriceForCommission(tx, {
          inventoryItemId: line.inventoryItemId,
          soldAsUnit: line.soldAsUnit,
        });
    priced.push({
      id: line.id,
      isPlainCloth: Boolean(line.isPlainCloth),
      isRemnant: typeById.get(line.inventoryItemId || '') === 'REMANENT',
      soldAsUnit: line.soldAsUnit,
      soldPrice: line.soldPrice,
      quantitySold: line.quantitySold,
      lineDiscount: line.lineDiscount ?? 0,
      minimumPrice,
    });
  }

  const results = calculateSaleCommissions(priced, rate.ratePercent, rate.baseAmountPerUnit);
  const created = [];
  for (const result of results) {
    if (result.commission <= 0) continue;
    const line = params.lines.find((entry) => entry.id === result.id);
    created.push(
      await tx.employeeCommissionEntry.create({
        data: {
          employeeId: params.employeeId,
          saleId: params.saleId,
          saleItemId: result.id,
          inventoryItemId: line?.inventoryItemId ?? null,
          soldPrice: new Prisma.Decimal(result.soldPrice.toFixed(2)),
          minimumPrice: new Prisma.Decimal(result.minimumPrice.toFixed(2)),
          quantitySold: new Prisma.Decimal(result.quantitySold.toFixed(2)),
          ratePercent: new Prisma.Decimal(rate.ratePercent.toFixed(2)),
          commissionAmount: new Prisma.Decimal(result.commission.toFixed(2)),
          status: 'PENDING',
        },
      })
    );
  }

  return created;
}

export async function removePendingCommissionsForSale(
  tx: Prisma.TransactionClient,
  saleId: string
) {
  await tx.employeeCommissionEntry.deleteMany({
    where: { saleId, status: 'PENDING' },
  });
}

export type PendingCommissionSaleDetail = {
  customerName: string;
  customerPhone: string;
  totalPrice: string;
  paymentMethod: string;
  branchId: string;
  branchName: string;
  notes?: string | null;
};

export type PendingCommissionItemDetail = {
  description: string;
  isPlainCloth: boolean;
  plainClothName?: string | null;
  soldAsUnit: string;
  lineTotal: string;
  colorName?: string | null;
};

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
  sale: PendingCommissionSaleDetail;
  item: PendingCommissionItemDetail;
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

function buildPendingItemDetail(
  saleItem: {
    isPlainCloth: boolean;
    plainClothName: string | null;
    inventoryItemId: string | null;
    soldAsUnit: string;
    soldPrice: Prisma.Decimal;
    quantitySold: Prisma.Decimal;
    color: { name: string } | null;
  },
  entryInventoryId: string | null
): PendingCommissionItemDetail {
  const soldPrice = parseFloat(saleItem.soldPrice.toString());
  const quantitySold = parseFloat(saleItem.quantitySold.toString());
  const lineTotal = (soldPrice * quantitySold).toFixed(2);

  let description: string;
  if (saleItem.isPlainCloth && saleItem.plainClothName) {
    description = saleItem.plainClothName;
  } else {
    description = saleItem.inventoryItemId || entryInventoryId || 'Inventory item';
  }

  return {
    description,
    isPlainCloth: saleItem.isPlainCloth,
    plainClothName: saleItem.plainClothName,
    soldAsUnit: saleItem.soldAsUnit,
    lineTotal,
    colorName: saleItem.color?.name ?? null,
  };
}

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
      sale: {
        select: {
          id: true,
          createdAt: true,
          customerName: true,
          customerPhone: true,
          totalPrice: true,
          paymentMethod: true,
          notes: true,
          branch: { select: { id: true, name: true } },
        },
      },
      saleItem: {
        select: {
          isPlainCloth: true,
          plainClothName: true,
          inventoryItemId: true,
          soldAsUnit: true,
          soldPrice: true,
          quantitySold: true,
          color: { select: { name: true } },
        },
      },
    },
    orderBy: [{ employee: { name: 'asc' } }, { createdAt: 'desc' }],
  });

  const grouped = new Map<string, PendingCommissionGroup>();

  for (const entry of entries) {
    const key = entry.employeeId;
    const existing = grouped.get(key);
    const itemDetail = entry.saleItem
      ? buildPendingItemDetail(entry.saleItem, entry.inventoryItemId)
      : {
          description: entry.inventoryItemId || 'Sale item',
          isPlainCloth: false,
          plainClothName: null,
          soldAsUnit: 'METER',
          lineTotal: (
            parseFloat(entry.soldPrice.toString()) * parseFloat(entry.quantitySold.toString())
          ).toFixed(2),
          colorName: null,
        };

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
      sale: {
        customerName: entry.sale.customerName,
        customerPhone: entry.sale.customerPhone,
        totalPrice: entry.sale.totalPrice.toString(),
        paymentMethod: entry.sale.paymentMethod,
        branchId: entry.sale.branch?.id ?? '',
        branchName: entry.sale.branch?.name ?? entry.sale.branch?.id ?? '—',
        notes: entry.sale.notes,
      },
      item: itemDetail,
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

    const employee = await tx.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, email: true },
    });

    if (!employee) {
      throw new Error('Employee not found');
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
          employeeName: employee.name,
          employeeEmail: employee.email,
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

export async function recalculatePendingCommissionEntries() {
  const rate = await getCommissionRate();
  const pending = await prisma.employeeCommissionEntry.findMany({
    where: { status: 'PENDING', sale: { isVoided: false } },
    include: {
      sale: {
        include: {
          items: { include: { inventoryItem: { select: { type: true } } } },
        },
      },
    },
  });

  let updated = 0;
  let removed = 0;
  const sales = new Map<string, (typeof pending)[number]['sale']>();
  for (const entry of pending) sales.set(entry.saleId, entry.sale);

  for (const sale of sales.values()) {
    const lines: CommissionInputLine[] = [];
    for (const item of sale.items) {
      const minimumPrice = item.isPlainCloth
        ? null
        : await resolveMinimumPriceForCommission(prisma, {
            inventoryItemId: item.inventoryItemId,
            soldAsUnit: item.soldAsUnit,
          });
      lines.push({
        id: item.id,
        isPlainCloth: item.isPlainCloth,
        isRemnant: item.inventoryItem?.type === 'REMANENT',
        soldAsUnit: item.soldAsUnit,
        soldPrice: parseFloat(item.soldPrice.toString()),
        quantitySold: parseFloat(item.quantitySold.toString()),
        lineDiscount: parseFloat(item.lineDiscount.toString()),
        minimumPrice,
      });
    }

    const results = new Map(
      calculateSaleCommissions(lines, rate.ratePercent, rate.baseAmountPerUnit).map((line) => [
        line.id,
        line,
      ])
    );
    const saleEntries = pending.filter((entry) => entry.saleId === sale.id);

    for (const entry of saleEntries) {
      const next = results.get(entry.saleItemId);
      if (!next || next.commission <= 0) {
        await prisma.employeeCommissionEntry.delete({ where: { id: entry.id } });
        removed += 1;
        continue;
      }

      const nextAmount = next.commission.toFixed(2);
      const nextRate = rate.ratePercent.toFixed(2);
      if (
        entry.commissionAmount.toString() !== nextAmount ||
        entry.ratePercent.toString() !== nextRate
      ) {
        await prisma.employeeCommissionEntry.update({
          where: { id: entry.id },
          data: {
            commissionAmount: new Prisma.Decimal(nextAmount),
            ratePercent: new Prisma.Decimal(nextRate),
            minimumPrice: new Prisma.Decimal(next.minimumPrice.toFixed(2)),
          },
        });
        updated += 1;
      }
    }
  }

  return { updated, removed };
}

export async function backfillCommissionEntries() {
  const [rate, sales] = await Promise.all([
    getCommissionRate(),
    prisma.sale.findMany({
      where: { isVoided: false },
      include: { items: { include: { inventoryItem: { select: { type: true } } } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  let created = 0;

  for (const sale of sales) {
    const lines: CommissionInputLine[] = [];
    for (const item of sale.items) {
      const minimumPrice = item.isPlainCloth
        ? null
        : await resolveMinimumPriceForCommission(prisma, {
            inventoryItemId: item.inventoryItemId,
            soldAsUnit: item.soldAsUnit,
          });
      lines.push({
        id: item.id,
        isPlainCloth: item.isPlainCloth,
        isRemnant: item.inventoryItem?.type === 'REMANENT',
        soldAsUnit: item.soldAsUnit,
        soldPrice: parseFloat(item.soldPrice.toString()),
        quantitySold: parseFloat(item.quantitySold.toString()),
        lineDiscount: parseFloat(item.lineDiscount.toString()),
        minimumPrice,
      });
    }

    const results = calculateSaleCommissions(lines, rate.ratePercent, rate.baseAmountPerUnit);
    for (const result of results) {
      if (result.commission <= 0) continue;
      const existing = await prisma.employeeCommissionEntry.findUnique({
        where: { saleItemId: result.id },
      });
      if (existing) continue;

      const item = sale.items.find((entry) => entry.id === result.id);
      await prisma.employeeCommissionEntry.create({
        data: {
          employeeId: sale.employeeId,
          saleId: sale.id,
          saleItemId: result.id,
          inventoryItemId: item?.inventoryItemId ?? null,
          soldPrice: new Prisma.Decimal(result.soldPrice.toFixed(2)),
          minimumPrice: new Prisma.Decimal(result.minimumPrice.toFixed(2)),
          quantitySold: new Prisma.Decimal(result.quantitySold.toFixed(2)),
          ratePercent: new Prisma.Decimal(rate.ratePercent.toFixed(2)),
          commissionAmount: new Prisma.Decimal(result.commission.toFixed(2)),
          status: 'PENDING',
        },
      });
      created += 1;
    }
  }

  return { created };
}
