import { EmployeeApprovalStatus } from '@prisma/client';
import { prisma } from './prisma';

export type EmployeeAccessCheck = {
  ok: true;
  employee: {
    id: string;
    email: string;
    role: string;
    isActive: boolean;
    approvalStatus: EmployeeApprovalStatus;
  };
};

export type EmployeeAccessDenied = {
  ok: false;
  error: string;
  status: 401 | 403;
};

export function approvalStatusError(status: EmployeeApprovalStatus): string | null {
  if (status === 'PENDING') {
    return 'Account is pending administrator approval';
  }
  if (status === 'REJECTED') {
    return 'Registration was rejected by an administrator';
  }
  return null;
}

export async function checkEmployeeAccess(
  employeeId: string
): Promise<EmployeeAccessCheck | EmployeeAccessDenied> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      approvalStatus: true,
    },
  });

  if (!employee) {
    return { ok: false, error: 'Account not found', status: 401 };
  }

  if (!employee.isActive) {
    return { ok: false, error: 'Account is inactive', status: 403 };
  }

  const approvalError = approvalStatusError(employee.approvalStatus);
  if (approvalError) {
    return { ok: false, error: approvalError, status: 403 };
  }

  return { ok: true, employee };
}

export function assertEmployeeRecordCanSignIn(employee: {
  isActive: boolean;
  deletedAt: Date | null;
  approvalStatus: EmployeeApprovalStatus;
}) {
  if (!employee.isActive || employee.deletedAt) {
    throw new Error('Account is inactive');
  }

  const approvalError = approvalStatusError(employee.approvalStatus);
  if (approvalError) {
    throw new Error(approvalError);
  }
}
