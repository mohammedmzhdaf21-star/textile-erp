import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  DEFAULT_EMPLOYEE_SECTIONS,
  parseAllowedSections,
  roleHasFullAccess,
  type EmployeeSectionKey,
} from './employeeSections';

function mergeEmployeeSections(current: EmployeeSectionKey[]): EmployeeSectionKey[] {
  const merged = new Set<EmployeeSectionKey>(current);
  for (const section of DEFAULT_EMPLOYEE_SECTIONS) {
    merged.add(section);
  }
  return [...merged];
}

/** Ensure existing staff accounts include default sections such as customerQueue. */
export async function backfillEmployeeAllowedSections() {
  const employees = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      role: { in: ['EMPLOYEE', 'TRUSTEE'] },
    },
    select: { id: true, role: true, allowedSections: true },
  });

  let updated = 0;

  for (const employee of employees) {
    if (roleHasFullAccess(employee.role)) continue;

    const parsed = parseAllowedSections(employee.allowedSections);
    const current = parsed ?? [];
    const next = mergeEmployeeSections(current);

    const changed =
      next.length !== current.length || next.some((section) => !current.includes(section));

    if (!changed) continue;

    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        allowedSections: next as Prisma.InputJsonValue,
      },
    });
    updated += 1;
  }

  return { updated };
}
