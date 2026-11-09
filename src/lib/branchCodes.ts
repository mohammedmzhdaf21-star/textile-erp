const FALLBACK_BRANCH_ID_BY_CODE: Record<string, string> = {
  A: 'B001',
  B: 'B002',
  C: 'B003',
  E: 'B004',
  F: 'B005',
  S: 'B000',
};

let loaded = false;
let idByCode: Record<string, string> = { ...FALLBACK_BRANCH_ID_BY_CODE };
let codeById: Record<string, string> = Object.fromEntries(
  Object.entries(FALLBACK_BRANCH_ID_BY_CODE).map(([code, id]) => [id, code])
);

export function replaceBranchCodeCache(rows: Array<{ id: string; code: string }>) {
  const nextIdByCode: Record<string, string> = {};
  const nextCodeById: Record<string, string> = {};
  for (const row of rows) {
    const code = row.code.trim().toUpperCase();
    if (!code || !row.id) continue;
    nextIdByCode[code] = row.id;
    nextCodeById[row.id] = code;
  }
  if (Object.keys(nextIdByCode).length === 0) return;
  idByCode = nextIdByCode;
  codeById = nextCodeById;
  loaded = true;
}

export const BRANCH_ID_BY_CODE = new Proxy({} as Record<string, string>, {
  get: (_target, property) => {
    if (typeof property !== 'string') return undefined;
    return idByCode[property.toUpperCase()];
  },
  ownKeys: () => Object.keys(idByCode),
  getOwnPropertyDescriptor: (_target, property) => {
    if (typeof property !== 'string' || !(property.toUpperCase() in idByCode)) return undefined;
    return { enumerable: true, configurable: true, value: idByCode[property.toUpperCase()] };
  },
});

export const BRANCH_CODE_BY_ID = new Proxy({} as Record<string, string>, {
  get: (_target, property) => (typeof property === 'string' ? codeById[property] : undefined),
  ownKeys: () => Object.keys(codeById),
  getOwnPropertyDescriptor: (_target, property) => {
    if (typeof property !== 'string' || !(property in codeById)) return undefined;
    return { enumerable: true, configurable: true, value: codeById[property] };
  },
});

export function branchCodeToId(code: string): string | null {
  const key = code.trim().toUpperCase();
  if (loaded) return idByCode[key] ?? null;
  return idByCode[key] ?? FALLBACK_BRANCH_ID_BY_CODE[key] ?? null;
}

export function branchIdToCode(branchId: string): string | null {
  if (loaded) return codeById[branchId] ?? null;
  return codeById[branchId] ?? null;
}
