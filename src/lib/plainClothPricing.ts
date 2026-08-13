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
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 45);
  return base || 'PLAIN_CLOTH';
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
