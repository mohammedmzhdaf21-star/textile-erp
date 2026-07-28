export const REMNANT_THRESHOLD_METERS = 2;

const roundMeters = (value: number) => Math.round(value * 100) / 100;

export const isBelowRemnantThreshold = (meters: number) => {
  const rounded = roundMeters(meters);
  return rounded > 0 && rounded < REMNANT_THRESHOLD_METERS;
};

export const shouldConvertRollToRemnant = (meters: number) =>
  isBelowRemnantThreshold(meters);

export type InventoryTypeInput = {
  type: 'ROLL' | 'PIECE' | 'REMANENT';
  meters?: number;
  pieceLength?: number;
  quantity?: number;
  isPiecePackage?: boolean;
};

export type NormalizedInventoryShape = {
  type: 'ROLL' | 'PIECE' | 'REMANENT';
  meters?: number;
  pieceLength?: number;
  quantity?: number;
};

export function normalizeInventoryShape(input: InventoryTypeInput): NormalizedInventoryShape {
  if (input.isPiecePackage) {
    return {
      type: 'PIECE',
      pieceLength: 0,
      quantity: input.quantity ?? 1,
    };
  }

  if (input.type === 'PIECE') {
    const pieceLength = roundMeters(Number(input.pieceLength ?? 0));
    const quantity = Math.max(0, Number(input.quantity ?? 1));
    if (isBelowRemnantThreshold(pieceLength)) {
      return {
        type: 'REMANENT',
        meters: roundMeters(pieceLength * quantity),
        quantity: 1,
      };
    }
    return { type: 'PIECE', pieceLength, quantity };
  }

  const meters = roundMeters(Number(input.meters ?? 0));
  if (input.type === 'ROLL' && isBelowRemnantThreshold(meters)) {
    return { type: 'REMANENT', meters, quantity: 1 };
  }

  if (input.type === 'REMANENT') {
    return { type: 'REMANENT', meters, quantity: 1 };
  }

  return { type: 'ROLL', meters, quantity: 1 };
}

export function remnantPromotionForRollMeters(meters: number) {
  return shouldConvertRollToRemnant(meters) ? { type: 'REMANENT' as const } : null;
}

export function meterStockUpdateAfterDeduction(
  itemType: 'ROLL' | 'PIECE' | 'REMANENT',
  remainingMeters: number
) {
  const meters = Math.round(remainingMeters * 100) / 100;
  const update: { meters: number; type?: 'REMANENT' } = { meters };
  if (itemType === 'ROLL') {
    const promotion = remnantPromotionForRollMeters(meters);
    if (promotion) update.type = promotion.type;
  }
  return update;
}
