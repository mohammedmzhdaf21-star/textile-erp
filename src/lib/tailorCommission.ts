import type { TailorGarmentId, TailorGarmentSelection } from './tailorGarments';

/** Clothes that count toward the piece total for one customer visit. */
const CLOTH_PIECE_IDS = new Set<TailorGarmentId>(['kawa', 'kras', 'helak', 'salta', 'underDress']);

/**
 * One piece of clothes for the same customer at that time.
 * The price is the tailor's charge in IQD. A price between two steps uses the lower step.
 * At 65,000 and above the commission stays 20,000.
 */
const ONE_PIECE_TIERS = [
  { price: 25_000, commission: 5_000 },
  { price: 30_000, commission: 5_000 },
  { price: 35_000, commission: 10_000 },
  { price: 40_000, commission: 10_000 },
  { price: 45_000, commission: 15_000 },
  { price: 50_000, commission: 15_000 },
  { price: 55_000, commission: 20_000 },
  { price: 60_000, commission: 20_000 },
  { price: 65_000, commission: 20_000 },
] as const;

/**
 * Two pieces and three pieces use this schedule.
 * More than three pieces of clothes on the same visit uses it as well.
 */
const SEVERAL_PIECE_TIERS = [
  { price: 35_000, commission: 5_000 },
  { price: 40_000, commission: 5_000 },
  { price: 45_000, commission: 10_000 },
  { price: 50_000, commission: 15_000 },
  { price: 55_000, commission: 20_000 },
  { price: 60_000, commission: 20_000 },
  { price: 65_000, commission: 20_000 },
] as const;

export function tailorClothPieceCount(garments: Array<{ id: string; pieces: number }>) {
  return garments.reduce((total, garment) => {
    if (!CLOTH_PIECE_IDS.has(garment.id as TailorGarmentId)) return total;
    return total + garment.pieces;
  }, 0);
}

export function tailorCommissionIqd(pieces: number, priceIqd: number) {
  if (!Number.isInteger(pieces) || pieces < 1) return 0;
  if (!Number.isFinite(priceIqd) || priceIqd <= 0) return 0;
  const tiers = pieces === 1 ? ONE_PIECE_TIERS : SEVERAL_PIECE_TIERS;
  let commission = 0;
  for (const tier of tiers) {
    if (priceIqd + 0.001 >= tier.price) commission = tier.commission;
  }
  return commission;
}

export function tailorCommissionForGarments(garments: TailorGarmentSelection[], priceIqd: number) {
  return tailorCommissionIqd(tailorClothPieceCount(garments), priceIqd);
}
