export const TAILOR_GARMENTS = [
  { id: 'kawa', mode: 'count' },
  { id: 'kras', mode: 'count' },
  { id: 'helak', mode: 'count' },
  { id: 'salta', mode: 'count' },
  { id: 'underDress', mode: 'oneOrTwo' },
  { id: 'collar', mode: 'count' },
  { id: 'tara', mode: 'count' },
  { id: 'handwork', mode: 'count' },
  { id: 'repair', mode: 'count' },
] as const;

export type TailorGarmentId = (typeof TAILOR_GARMENTS)[number]['id'];

export type TailorGarmentSelection = {
  id: TailorGarmentId;
  pieces: number;
};

export type TailorGarmentParseError = 'GARMENTS_REQUIRED' | 'GARMENTS_INVALID';

const MAX_PIECES = 20;

const garmentById = new Map(TAILOR_GARMENTS.map((garment) => [garment.id, garment]));

function isGarmentId(value: string): value is TailorGarmentId {
  return garmentById.has(value as TailorGarmentId);
}

export function parseTailorGarments(
  value: unknown
): { ok: true; garments: TailorGarmentSelection[] } | { ok: false; code: TailorGarmentParseError } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, code: 'GARMENTS_REQUIRED' };
  }

  const seen = new Set<string>();
  const parsed: TailorGarmentSelection[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, code: 'GARMENTS_INVALID' };
    }
    const raw = entry as Record<string, unknown>;
    const id = String(raw.id ?? '');
    if (!isGarmentId(id) || seen.has(id)) {
      return { ok: false, code: 'GARMENTS_INVALID' };
    }
    const pieces = Number(raw.pieces);
    if (!Number.isInteger(pieces)) {
      return { ok: false, code: 'GARMENTS_INVALID' };
    }
    const mode = garmentById.get(id)!.mode;
    if (mode === 'oneOrTwo') {
      if (pieces !== 1 && pieces !== 2) {
        return { ok: false, code: 'GARMENTS_INVALID' };
      }
    } else if (pieces < 1 || pieces > MAX_PIECES) {
      return { ok: false, code: 'GARMENTS_INVALID' };
    }
    seen.add(id);
    parsed.push({ id, pieces });
  }

  return {
    ok: true,
    garments: TAILOR_GARMENTS.flatMap((garment) => {
      const match = parsed.find((item) => item.id === garment.id);
      return match ? [match] : [];
    }),
  };
}

export function readStoredTailorGarments(value: unknown): TailorGarmentSelection[] {
  const parsed = parseTailorGarments(value);
  return parsed.ok ? parsed.garments : [];
}
