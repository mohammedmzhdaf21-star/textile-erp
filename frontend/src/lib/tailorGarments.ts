export const TAILOR_GARMENT_IDS = [
  'kawa',
  'kras',
  'helak',
  'salta',
  'underDress',
  'collar',
  'tara',
  'handwork',
  'repair',
] as const;

export type TailorGarmentId = (typeof TAILOR_GARMENT_IDS)[number];

export type TailorGarmentSelection = {
  id: TailorGarmentId;
  pieces: number;
};

export const TAILOR_GARMENT_MODE: Record<TailorGarmentId, 'count' | 'oneOrTwo'> = {
  kawa: 'count',
  kras: 'count',
  helak: 'count',
  salta: 'count',
  underDress: 'oneOrTwo',
  collar: 'count',
  tara: 'count',
  handwork: 'count',
  repair: 'count',
};

export type TailorGarmentDraft = Partial<Record<TailorGarmentId, number>>;

export function garmentsFromDraft(draft: TailorGarmentDraft): TailorGarmentSelection[] {
  return TAILOR_GARMENT_IDS.flatMap((id) => {
    const pieces = draft[id];
    if (!pieces || !Number.isInteger(pieces) || pieces < 1) return [];
    return [{ id, pieces }];
  });
}

export function draftFromGarments(garments: TailorGarmentSelection[]): TailorGarmentDraft {
  return Object.fromEntries(garments.map((garment) => [garment.id, garment.pieces]));
}
