export const BRANCH_ID_BY_CODE: Record<string, string> = {
  A: 'B001',
  B: 'B002',
  C: 'B003',
  E: 'B004',
  F: 'B005',
  S: 'B000',
};

export const BRANCH_CODE_BY_ID: Record<string, string> = Object.fromEntries(
  Object.entries(BRANCH_ID_BY_CODE).map(([code, id]) => [id, code])
);

export function branchCodeToId(code: string): string | null {
  return BRANCH_ID_BY_CODE[code.toUpperCase()] ?? null;
}

export function branchIdToCode(branchId: string): string | null {
  return BRANCH_CODE_BY_ID[branchId] ?? null;
}
