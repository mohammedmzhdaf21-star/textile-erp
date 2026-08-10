export const EMPLOYEE_SECTION_KEYS = [
  'dashboard',
  'inventory',
  'itemConversion',
  'sales',
  'dailySales',
  'historySales',
  'owedMoney',
  'tasks',
  'taskEmployee',
  'dataAnalysis',
  'trusteeCommission',
  'exchange',
  'itemInput',
] as const;

export type EmployeeSectionKey = (typeof EMPLOYEE_SECTION_KEYS)[number];

export const DEFAULT_EMPLOYEE_SECTIONS: EmployeeSectionKey[] = [
  'sales',
  'dailySales',
  'historySales',
  'taskEmployee',
];

export const parseAllowedSections = (value: unknown): EmployeeSectionKey[] | null => {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const filtered = value.filter(
    (entry): entry is EmployeeSectionKey =>
      typeof entry === 'string' &&
      (EMPLOYEE_SECTION_KEYS as readonly string[]).includes(entry)
  );
  return filtered;
};

export const roleHasFullAccess = (role: string) => role === 'ADMIN' || role === 'MANAGER';
