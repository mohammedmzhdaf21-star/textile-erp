export type CombinedPriceLine = {
  id: string;
  isPlainCloth: boolean;
  /** Saved plain-cloth cost for this line, in stored IQD. Scanned items pass 0. */
  clothCost: number;
  /** Scanned-item baseline for the whole line. Plain cloth passes 0. */
  baseline: number;
};

export type CombinedPriceAllocation = {
  id: string;
  lineTotal: number;
};

function toCents(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100);
}

function fromCents(cents: number) {
  return cents / 100;
}

/** Split cents by weight. The last line receives any leftover cent. */
function splitCents(totalCents: number, weights: number[]) {
  if (weights.length === 0 || totalCents <= 0) return weights.map(() => 0);
  const safe = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0));
  const weightSum = safe.reduce((sum, weight) => sum + weight, 0);
  if (weightSum <= 0) {
    const base = Math.floor(totalCents / safe.length);
    const shares = safe.map(() => base);
    shares[shares.length - 1] += totalCents - base * safe.length;
    return shares;
  }
  const shares = safe.map((weight) => Math.floor((totalCents * weight) / weightSum));
  const used = shares.reduce((sum, share) => sum + share, 0);
  shares[shares.length - 1] += totalCents - used;
  return shares;
}

/**
 * Turn one sale total into line totals.
 * Plain cloth keeps its saved cost. The rest is split across scanned items
 * by baseline when every scanned item has one, and evenly otherwise.
 * A cloth-only sale uses the typed total, scaled by each cloth's saved cost.
 */
export function allocateCombinedSaleTotal(
  lines: CombinedPriceLine[],
  combinedTotal: number
): CombinedPriceAllocation[] {
  const totalCents = toCents(combinedTotal);
  const cents = lines.map(() => 0);
  if (totalCents <= 0 || lines.length === 0) {
    return lines.map((line) => ({ id: line.id, lineTotal: 0 }));
  }

  const clothIndexes: number[] = [];
  const scannedIndexes: number[] = [];
  lines.forEach((line, index) => {
    if (line.isPlainCloth) clothIndexes.push(index);
    else scannedIndexes.push(index);
  });

  const clothCosts = clothIndexes.map((index) => toCents(lines[index].clothCost));
  const clothSum = clothCosts.reduce((sum, cost) => sum + cost, 0);

  if (scannedIndexes.length === 0) {
    const shares = splitCents(
      totalCents,
      clothCosts.some((cost) => cost > 0) ? clothCosts : clothIndexes.map(() => 1)
    );
    shares.forEach((share, position) => {
      cents[clothIndexes[position]] = share;
    });
  } else if (clothSum >= totalCents) {
    const shares = splitCents(totalCents, clothCosts);
    shares.forEach((share, position) => {
      cents[clothIndexes[position]] = share;
    });
  } else {
    clothCosts.forEach((cost, position) => {
      cents[clothIndexes[position]] = cost;
    });
    const baselines = scannedIndexes.map((index) => lines[index].baseline);
    const everyBaseline = baselines.length > 0 && baselines.every((baseline) => baseline > 0);
    const shares = splitCents(
      totalCents - clothSum,
      everyBaseline ? baselines : scannedIndexes.map(() => 1)
    );
    shares.forEach((share, position) => {
      cents[scannedIndexes[position]] = share;
    });
  }

  return lines.map((line, index) => ({
    id: line.id,
    lineTotal: fromCents(cents[index]),
  }));
}
