import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { normalizeStoredAmount } from './currency';

export type PlainClothRecord = {
  id: string;
  name: string;
  pricePerM: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function toRecord(row: {
  id: string;
  name: string;
  pricePerM: Prisma.Decimal;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): PlainClothRecord {
  return {
    id: row.id,
    name: row.name,
    pricePerM: normalizeStoredAmount(parseFloat(row.pricePerM.toString())),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function slugPlainClothId(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return `PLAIN_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  const hash = crypto
    .createHash('sha256')
    .update(trimmed, 'utf8')
    .digest('hex')
    .slice(0, 10)
    .toUpperCase();

  const ascii = trimmed
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);

  if (ascii) {
    return `${ascii}_${hash}`.slice(0, 50);
  }

  return `PC_${hash}`.slice(0, 50);
}

export async function listPlainClothPricing(options?: { includeInactive?: boolean }) {
  const rows = await prisma.plainClothPricing.findMany({
    where: options?.includeInactive ? undefined : { isActive: true },
    orderBy: { name: 'asc' },
  });
  return rows.map(toRecord);
}

export async function getPlainClothPricingByName(name: string) {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const row = await prisma.plainClothPricing.findFirst({
    where: { name: { equals: trimmed, mode: 'insensitive' }, isActive: true },
  });
  return row ? toRecord(row) : null;
}

export async function createPlainClothPricing(input: { name: string; pricePerM: number }) {
  const name = input.name?.trim();
  if (!name) throw new Error('Plain cloth name is required');

  const pricePerM = normalizeStoredAmount(input.pricePerM);
  if (!Number.isFinite(pricePerM) || pricePerM < 0) {
    throw new Error('Price per meter must be a non-negative number');
  }

  let id = slugPlainClothId(name);
  const existingId = await prisma.plainClothPricing.findUnique({ where: { id } });
  if (existingId) {
    id = `${id}_${Date.now().toString(36).toUpperCase()}`.slice(0, 50);
  }

  const duplicateName = await prisma.plainClothPricing.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, isActive: true },
  });
  if (duplicateName) throw new Error('A plain cloth type with this name already exists');

  const row = await prisma.plainClothPricing.create({
    data: {
      id,
      name,
      pricePerM: new Prisma.Decimal(pricePerM.toFixed(2)),
      isActive: true,
    },
  });

  return toRecord(row);
}

export async function updatePlainClothPricing(
  id: string,
  input: { name?: string; pricePerM?: number; isActive?: boolean }
) {
  const existing = await prisma.plainClothPricing.findUnique({ where: { id } });
  if (!existing) throw new Error('Plain cloth type not found');

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  if (!name) throw new Error('Plain cloth name is required');

  let pricePerM = parseFloat(existing.pricePerM.toString());
  if (input.pricePerM !== undefined) {
    pricePerM = normalizeStoredAmount(input.pricePerM);
    if (!Number.isFinite(pricePerM) || pricePerM < 0) {
      throw new Error('Price per meter must be a non-negative number');
    }
  }

  if (input.name !== undefined) {
    const duplicateName = await prisma.plainClothPricing.findFirst({
      where: {
        id: { not: id },
        name: { equals: name, mode: 'insensitive' },
        isActive: true,
      },
    });
    if (duplicateName) throw new Error('A plain cloth type with this name already exists');
  }

  const row = await prisma.plainClothPricing.update({
    where: { id },
    data: {
      name,
      pricePerM: new Prisma.Decimal(pricePerM.toFixed(2)),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  return toRecord(row);
}

export async function deletePlainClothPricing(id: string) {
  const existing = await prisma.plainClothPricing.findUnique({ where: { id } });
  if (!existing) throw new Error('Plain cloth type not found');

  await prisma.plainClothPricing.update({
    where: { id },
    data: { isActive: false },
  });

  return { id, deleted: true };
}

/** Restore plain cloth types from past sales when pricing rows are missing. */
export async function recoverPlainClothNamesFromSales() {
  const grouped = await prisma.saleItem.groupBy({
    by: ['plainClothName'],
    where: {
      isPlainCloth: true,
      plainClothName: { not: null },
    },
    _avg: { soldPrice: true },
  });

  let recovered = 0;

  for (const row of grouped) {
    const name = row.plainClothName?.trim();
    if (!name) continue;

    const existing = await prisma.plainClothPricing.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });

    const avgPrice = row._avg.soldPrice
      ? normalizeStoredAmount(parseFloat(row._avg.soldPrice.toString()))
      : 0;

    if (existing) {
      if (!existing.isActive) {
        await prisma.plainClothPricing.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            ...(avgPrice > 0 ? { pricePerM: new Prisma.Decimal(avgPrice.toFixed(2)) } : {}),
          },
        });
        recovered += 1;
      }
      continue;
    }

    let id = slugPlainClothId(name);
    const existingId = await prisma.plainClothPricing.findUnique({ where: { id } });
    if (existingId) {
      id = `${id}_${Date.now().toString(36).toUpperCase()}`.slice(0, 50);
    }

    await prisma.plainClothPricing.create({
      data: {
        id,
        name,
        pricePerM: new Prisma.Decimal(Math.max(0, avgPrice).toFixed(2)),
        isActive: true,
      },
    });
    recovered += 1;
  }

  return { recovered };
}
