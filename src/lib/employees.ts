import bcrypt from 'bcryptjs';
import { EmployeeApprovalStatus, Prisma, UserRole } from '@prisma/client';
import { prisma } from './prisma';
import {
  DEFAULT_EMPLOYEE_SECTIONS,
  EmployeeSectionKey,
  parseAllowedSections,
  roleHasFullAccess,
} from './employeeSections';
import { markRegistrationNotificationsRead } from './notifications';

const SALT_ROUNDS = 10;

export type EmployeePublic = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  approvalStatus: EmployeeApprovalStatus;
  assignedWork: string | null;
  registrationNote: string | null;
  allowedSections: EmployeeSectionKey[] | null;
  branchIds: string[];
  lastLoginAt: string | null;
  createdAt: string;
};

const formatEmployee = (employee: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  approvalStatus: EmployeeApprovalStatus;
  assignedWork: string | null;
  registrationNote: string | null;
  allowedSections: unknown;
  lastLoginAt: Date | null;
  createdAt: Date;
  branches: Array<{ branchId: string; isActive: boolean }>;
}): EmployeePublic => ({
  id: employee.id,
  name: employee.name,
  email: employee.email,
  phone: employee.phone,
  role: employee.role,
  isActive: employee.isActive,
  approvalStatus: employee.approvalStatus,
  assignedWork: employee.assignedWork,
  registrationNote: employee.registrationNote,
  allowedSections: roleHasFullAccess(employee.role)
    ? null
    : parseAllowedSections(employee.allowedSections),
  branchIds: employee.branches.filter((link) => link.isActive).map((link) => link.branchId),
  lastLoginAt: employee.lastLoginAt?.toISOString() ?? null,
  createdAt: employee.createdAt.toISOString(),
});

const employeeInclude = {
  branches: {
    where: { isActive: true },
    select: { branchId: true, isActive: true },
  },
} satisfies Prisma.EmployeeInclude;

export async function listEmployees() {
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null },
    include: employeeInclude,
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  return employees.map(formatEmployee);
}

export async function listPendingEmployees() {
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null, approvalStatus: 'PENDING' },
    include: employeeInclude,
    orderBy: { createdAt: 'asc' },
  });
  return employees.map(formatEmployee);
}

export async function listBranches() {
  return prisma.branch.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
}

export async function getEmployeeById(id: string) {
  const employee = await prisma.employee.findFirst({
    where: { id, deletedAt: null },
    include: employeeInclude,
  });
  if (!employee) return null;
  return formatEmployee(employee);
}

export async function createEmployee(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: UserRole;
  assignedWork?: string;
  allowedSections?: EmployeeSectionKey[];
  branchIds?: string[];
  performedById: string;
  performedByEmail: string;
}) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.employee.findUnique({ where: { email } });
  if (existing && !existing.deletedAt) {
    throw new Error('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const sections =
    roleHasFullAccess(input.role) ? null : input.allowedSections ?? DEFAULT_EMPLOYEE_SECTIONS;

  const employee = await prisma.employee.create({
    data: {
      name: input.name.trim(),
      email,
      phone: input.phone?.trim() || null,
      role: input.role,
      passwordHash,
      isActive: true,
      approvalStatus: 'APPROVED',
      assignedWork: input.assignedWork?.trim() || null,
      allowedSections: sections,
      branches: input.branchIds?.length
        ? {
            create: input.branchIds.map((branchId) => ({ branchId })),
          }
        : undefined,
    },
    include: employeeInclude,
  });

  await prisma.auditLog.create({
    data: {
      entityType: 'Employee',
      entityId: employee.id,
      action: 'CREATE',
      performedById: input.performedById,
      performedByEmail: input.performedByEmail,
      changes: {
        email: employee.email,
        role: employee.role,
        allowedSections: sections,
        approvalStatus: employee.approvalStatus,
      },
    },
  });

  return formatEmployee(employee);
}

export async function updateEmployee(
  id: string,
  input: {
    name?: string;
    phone?: string | null;
    role?: UserRole;
    assignedWork?: string | null;
    allowedSections?: EmployeeSectionKey[] | null;
    branchIds?: string[];
    isActive?: boolean;
    password?: string;
    performedById: string;
    performedByEmail: string;
  }
) {
  const existing = await prisma.employee.findFirst({
    where: { id, deletedAt: null },
    include: employeeInclude,
  });
  if (!existing) {
    throw new Error('Employee not found');
  }

  if (input.isActive === true && existing.approvalStatus !== 'APPROVED') {
    throw new Error('Employee must be approved before the account can be activated');
  }

  const nextRole = input.role ?? existing.role;
  let nextSections: EmployeeSectionKey[] | null = null;
  if (roleHasFullAccess(nextRole)) {
    nextSections = null;
  } else if (input.allowedSections !== undefined) {
    nextSections = input.allowedSections ?? DEFAULT_EMPLOYEE_SECTIONS;
  } else {
    nextSections = parseAllowedSections(existing.allowedSections) ?? DEFAULT_EMPLOYEE_SECTIONS;
  }

  const data: Prisma.EmployeeUpdateInput = {
    name: input.name?.trim() ?? undefined,
    phone: input.phone === undefined ? undefined : input.phone?.trim() || null,
    role: input.role,
    assignedWork: input.assignedWork === undefined ? undefined : input.assignedWork?.trim() || null,
    allowedSections: nextSections,
    isActive: input.isActive,
  };

  if (input.password) {
    data.passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  }

  const employee = await prisma.employee.update({
    where: { id },
    data,
    include: employeeInclude,
  });

  if (input.branchIds) {
    await prisma.branchEmployee.updateMany({
      where: { employeeId: id, isActive: true },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    for (const branchId of input.branchIds) {
      await prisma.branchEmployee.upsert({
        where: { branchId_employeeId: { branchId, employeeId: id } },
        create: { branchId, employeeId: id },
        update: { isActive: true, deactivatedAt: null },
      });
    }
  }

  const refreshed = await prisma.employee.findFirstOrThrow({
    where: { id },
    include: employeeInclude,
  });

  await prisma.auditLog.create({
    data: {
      entityType: 'Employee',
      entityId: id,
      action: 'UPDATE',
      performedById: input.performedById,
      performedByEmail: input.performedByEmail,
      changes: {
        role: refreshed.role,
        isActive: refreshed.isActive,
        allowedSections: nextSections,
      },
    },
  });

  return formatEmployee(refreshed);
}

export async function getEmployeeAuthProfile(employeeId: string) {
  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      deletedAt: null,
      isActive: true,
    },
    include: employeeInclude,
  });
  if (!employee) return null;
  return formatEmployee(employee);
}

export async function approveEmployee(
  id: string,
  input: {
    branchIds?: string[];
    allowedSections?: EmployeeSectionKey[];
    assignedWork?: string;
    performedById: string;
    performedByEmail: string;
  }
) {
  const existing = await prisma.employee.findFirst({
    where: { id, deletedAt: null, approvalStatus: 'PENDING' },
    include: employeeInclude,
  });
  if (!existing) {
    throw new Error('Pending registration not found');
  }

  const sections = input.allowedSections ?? DEFAULT_EMPLOYEE_SECTIONS;

  await prisma.employee.update({
    where: { id },
    data: {
      isActive: true,
      approvalStatus: 'APPROVED',
      approvedAt: new Date(),
      approvedById: input.performedById,
      assignedWork: input.assignedWork?.trim() || existing.assignedWork,
      allowedSections: sections,
    },
  });

  if (input.branchIds?.length) {
    await prisma.branchEmployee.updateMany({
      where: { employeeId: id, isActive: true },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    for (const branchId of input.branchIds) {
      await prisma.branchEmployee.upsert({
        where: { branchId_employeeId: { branchId, employeeId: id } },
        create: { branchId, employeeId: id },
        update: { isActive: true, deactivatedAt: null },
      });
    }
  }

  await markRegistrationNotificationsRead(id);

  await prisma.auditLog.create({
    data: {
      entityType: 'Employee',
      entityId: id,
      action: 'UPDATE',
      performedById: input.performedById,
      performedByEmail: input.performedByEmail,
      changes: { approvalStatus: 'APPROVED' },
    },
  });

  const refreshed = await prisma.employee.findFirstOrThrow({
    where: { id },
    include: employeeInclude,
  });
  return formatEmployee(refreshed);
}

export async function rejectEmployee(
  id: string,
  input: {
    performedById: string;
    performedByEmail: string;
    reason?: string;
  }
) {
  const existing = await prisma.employee.findFirst({
    where: { id, deletedAt: null, approvalStatus: 'PENDING' },
  });
  if (!existing) {
    throw new Error('Pending registration not found');
  }

  await prisma.employee.update({
    where: { id },
    data: {
      approvalStatus: 'REJECTED',
      isActive: false,
      approvedAt: new Date(),
      approvedById: input.performedById,
      registrationNote: input.reason?.trim()
        ? `${existing.registrationNote ?? ''}\nRejection: ${input.reason.trim()}`.trim()
        : existing.registrationNote,
    },
  });

  await markRegistrationNotificationsRead(id);

  await prisma.auditLog.create({
    data: {
      entityType: 'Employee',
      entityId: id,
      action: 'UPDATE',
      performedById: input.performedById,
      performedByEmail: input.performedByEmail,
      changes: { approvalStatus: 'REJECTED' },
    },
  });

  return { success: true };
}
