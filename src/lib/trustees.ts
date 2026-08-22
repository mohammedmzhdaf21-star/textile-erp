import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

const BRANCH_CODE_TO_ID: Record<string, string> = {
  A: 'B001',
  B: 'B002',
  C: 'B003',
  E: 'B004',
  F: 'B005',
  S: 'B000',
};

const BRANCH_ID_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(BRANCH_CODE_TO_ID).map(([code, id]) => [id, code])
);

export type TrusteeRuleInput = {
  trusteeName: string;
  contactInfo?: string;
  branches: string[];
  percentage: number;
  isActive?: boolean;
};

export type TrusteeRuleDto = {
  id: string;
  trusteeName: string;
  contactInfo: string;
  branches: string[];
  percentage: number;
  isActive: boolean;
  updatedAt: string;
};

const normalizeBranchCodes = (branches: string[]) => {
  const codes = branches
    .map((branch) => branch.trim().toUpperCase())
    .filter((branch) => BRANCH_CODE_TO_ID[branch]);
  return [...new Set(codes)];
};

const branchIdsForCodes = (codes: string[]) =>
  codes.map((code) => BRANCH_CODE_TO_ID[code]).filter(Boolean);

function toDto(trustee: {
  id: string;
  name: string;
  contactInfo: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  updatedAt: Date;
  permissions: Array<{ branchId: string; percentage: Prisma.Decimal; isActive: boolean }>;
}): TrusteeRuleDto {
  const activePermissions = trustee.permissions.filter((permission) => permission.isActive);
  const branches = activePermissions
    .map((permission) => BRANCH_ID_TO_CODE[permission.branchId] || permission.branchId)
    .filter(Boolean);
  const percentages = activePermissions.map((permission) =>
    parseFloat(permission.percentage.toString())
  );
  const percentage = percentages.length > 0 ? percentages[0] : 0;

  return {
    id: trustee.id,
    trusteeName: trustee.name,
    contactInfo: trustee.contactInfo || '',
    branches,
    percentage,
    isActive: trustee.isActive && !trustee.deletedAt,
    updatedAt: trustee.updatedAt.toISOString(),
  };
}

export async function listTrusteeRules(options?: { includeInactive?: boolean }) {
  const includeInactive = options?.includeInactive ?? false;
  const trustees = await prisma.trustee.findMany({
    where: {
      deletedAt: null,
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: {
      permissions: includeInactive ? true : { where: { isActive: true } },
    },
    orderBy: { name: 'asc' },
  });

  return trustees.map(toDto);
}

export async function createTrusteeRule(input: TrusteeRuleInput) {
  const trusteeName = input.trusteeName?.trim();
  if (!trusteeName) throw new Error('Trustee name is required');

  const branches = normalizeBranchCodes(input.branches);
  if (branches.length === 0) throw new Error('At least one valid branch is required');

  const percentage = Number(input.percentage);
  if (!Number.isFinite(percentage) || percentage < 0) {
    throw new Error('Commission percentage must be a non-negative number');
  }

  const branchIds = branchIdsForCodes(branches);
  const existing = await prisma.trustee.findFirst({
    where: { name: trusteeName, deletedAt: null },
  });
  if (existing) throw new Error('A trustee with this name already exists');

  const trustee = await prisma.trustee.create({
    data: {
      name: trusteeName,
      contactInfo: input.contactInfo?.trim() || null,
      isActive: input.isActive ?? true,
      permissions: {
        create: branchIds.map((branchId) => ({
          branchId,
          percentage: new Prisma.Decimal(percentage.toFixed(2)),
          isActive: true,
        })),
      },
    },
    include: { permissions: true },
  });

  return toDto(trustee);
}

export async function updateTrusteeRule(id: string, input: TrusteeRuleInput) {
  const trusteeName = input.trusteeName?.trim();
  if (!trusteeName) throw new Error('Trustee name is required');

  const branches = normalizeBranchCodes(input.branches);
  if (branches.length === 0) throw new Error('At least one valid branch is required');

  const percentage = Number(input.percentage);
  if (!Number.isFinite(percentage) || percentage < 0) {
    throw new Error('Commission percentage must be a non-negative number');
  }

  const existing = await prisma.trustee.findFirst({
    where: { id, deletedAt: null },
    include: { permissions: true },
  });
  if (!existing) throw new Error('Trustee rule not found');

  const duplicate = await prisma.trustee.findFirst({
    where: {
      name: trusteeName,
      deletedAt: null,
      NOT: { id },
    },
  });
  if (duplicate) throw new Error('A trustee with this name already exists');

  const branchIds = branchIdsForCodes(branches);
  const branchIdSet = new Set(branchIds);

  await prisma.$transaction(async (tx) => {
    await tx.trustee.update({
      where: { id },
      data: {
        name: trusteeName,
        contactInfo: input.contactInfo?.trim() || null,
        isActive: input.isActive ?? existing.isActive,
      },
    });

    for (const permission of existing.permissions) {
      if (!branchIdSet.has(permission.branchId)) {
        await tx.trusteePermission.update({
          where: { id: permission.id },
          data: { isActive: false },
        });
      }
    }

    for (const branchId of branchIds) {
      await tx.trusteePermission.upsert({
        where: {
          trusteeId_branchId: {
            trusteeId: id,
            branchId,
          },
        },
        create: {
          trusteeId: id,
          branchId,
          percentage: new Prisma.Decimal(percentage.toFixed(2)),
          isActive: true,
        },
        update: {
          percentage: new Prisma.Decimal(percentage.toFixed(2)),
          isActive: true,
        },
      });
    }
  });

  const trustee = await prisma.trustee.findUniqueOrThrow({
    where: { id },
    include: { permissions: { where: { isActive: true } } },
  });

  return toDto(trustee);
}

export async function deleteTrusteeRule(id: string) {
  const existing = await prisma.trustee.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) throw new Error('Trustee rule not found');

  await prisma.$transaction(async (tx) => {
    await tx.trusteePermission.updateMany({
      where: { trusteeId: id },
      data: { isActive: false },
    });
    await tx.trustee.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });
  });

  return { id, deleted: true };
}
