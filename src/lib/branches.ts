import { prisma } from './prisma';
import { replaceBranchCodeCache } from './branchCodes';

export type ShopBranchRecord = {
  id: string;
  code: string;
  name: string;
};

const CODE_PATTERN = /^[A-Z][A-Z0-9]{0,2}$/;

export function nextBranchId(existingIds: string[]) {
  let max = 0;
  for (const id of existingIds) {
    const match = /^B(\d+)$/.exec(id);
    if (!match) continue;
    const value = Number(match[1]);
    if (value > max) max = value;
  }
  const next = `B${String(max + 1).padStart(3, '0')}`;
  if (next.length > 5) throw new Error('No branch ids left');
  return next;
}

export function normalizeBranchCode(value: string) {
  return value.trim().toUpperCase();
}

export async function refreshBranchCodeCache() {
  const rows = await prisma.branch.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, code: true },
  });
  replaceBranchCodeCache(rows);
  return rows;
}

export async function listShopBranches(): Promise<ShopBranchRecord[]> {
  return prisma.branch.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, code: true, name: true },
    orderBy: { id: 'asc' },
  });
}

export async function createShopBranch(input: { code: string; name: string }) {
  const code = normalizeBranchCode(input.code);
  const name = input.name.trim();
  if (!CODE_PATTERN.test(code)) {
    throw new Error('Branch code must be 1 to 3 letters or numbers, starting with a letter');
  }
  if (code === 'S') {
    throw new Error('S is reserved for storage');
  }
  if (!name) throw new Error('Branch name is required');

  const taken = await prisma.branch.findFirst({
    where: { code, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (taken) throw new Error(`Branch ${code} already exists`);

  const existing = await prisma.branch.findMany({ select: { id: true } });
  const id = nextBranchId(existing.map((row) => row.id));
  const created = await prisma.branch.create({
    data: { id, code, name },
    select: { id: true, code: true, name: true },
  });
  await refreshBranchCodeCache();
  return created;
}

export async function removeShopBranch(id: string) {
  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch || !branch.isActive || branch.deletedAt) {
    throw new Error('Branch not found');
  }
  if (branch.code === 'S' || branch.id === 'B000') {
    throw new Error('Storage must stay');
  }

  const activeCount = await prisma.branch.count({
    where: { isActive: true, deletedAt: null },
  });
  if (activeCount <= 1) {
    throw new Error('At least one branch must stay');
  }

  await prisma.branch.update({
    where: { id },
    data: {
      isActive: false,
      deletedAt: new Date(),
      code: id,
    },
  });
  await refreshBranchCodeCache();
  return { id, removed: true };
}
