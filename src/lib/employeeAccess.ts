import { prisma } from './prisma';

export type EmployeeAccessCheck = {
  ok: true;
  employee: {
    id: string;
    email: string;
    role: string;
    isActive: boolean;
  };
};

export type EmployeeAccessDenied = {
  ok: false;
  error: string;
  status: 401 | 403;
};

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
    },
  });

  if (!employee) {
    return { ok: false, error: 'Account not found', status: 401 };
  }

  if (!employee.isActive) {
    return { ok: false, error: 'Account is inactive', status: 403 };
  }

  return { ok: true, employee };
}

export function assertEmployeeRecordCanSignIn(employee: {
  isActive: boolean;
  deletedAt: Date | null;
}) {
  if (!employee.isActive || employee.deletedAt) {
    throw new Error('Account is inactive');
  }
}
