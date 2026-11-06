/** Lowest sale that can earn commission, except remnant pieces. */
export const COMMISSION_MINIMUM_SALE_IQD = 100_000;

const PRICE_EPS = 0.001;

export type CommissionInputLine = {
  id: string;
  isPlainCloth: boolean;
  isRemnant: boolean;
  soldAsUnit: 'METER' | 'PIECE';
  soldPrice: number;
  quantitySold: number;
  lineDiscount?: number;
  /** Per-unit baseline. Plain cloth and unknown items leave this empty. */
  minimumPrice: number | null;
};

export type CommissionResultLine = {
  id: string;
  commission: number;
  minimumPrice: number;
  soldPrice: number;
  quantitySold: number;
};

export function lineSaleAmount(line: {
  soldPrice: number;
  quantitySold: number;
  lineDiscount?: number;
}) {
  const amount = line.soldPrice * line.quantitySold - (line.lineDiscount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function baselineCommissionUnits(line: CommissionInputLine) {
  if (line.isRemnant) return line.soldAsUnit === 'METER' ? 1 : line.quantitySold;
  if (line.soldAsUnit === 'METER') return 1;
  return line.quantitySold;
}

/**
 * Plain cloth never earns commission. Its price is shared onto scanned items
 * and raises the line those items must clear. A normal item earns the base
 * amount only when its own price is at least its baseline and the sale
 * reaches the higher of 100,000 IQD and baseline plus plain cloth. The percent
 * applies only above that line. A remnant earns only the base amount once it
 * meets its own baseline, including sales under 100,000 IQD.
 */
export function calculateSaleCommissions(
  lines: CommissionInputLine[],
  ratePercent: number,
  baseAmount: number
): CommissionResultLine[] {
  const plainTotal = lines
    .filter((line) => line.isPlainCloth)
    .reduce((sum, line) => sum + Math.max(0, lineSaleAmount(line)), 0);

  const scanned = lines.filter(
    (line) =>
      !line.isPlainCloth &&
      line.minimumPrice != null &&
      line.minimumPrice > 0 &&
      line.quantitySold > 0
  );
  const normal = scanned.filter((line) => !line.isRemnant);
  const baselineSum = normal.reduce(
    (sum, line) => sum + (line.minimumPrice ?? 0) * line.quantitySold,
    0
  );

  return scanned.map((line) => {
    const baselineTotal = (line.minimumPrice ?? 0) * line.quantitySold;
    const itemTotal = lineSaleAmount(line);
    const plainShare = line.isRemnant
      ? 0
      : baselineSum > 0
        ? plainTotal * (baselineTotal / baselineSum)
        : plainTotal / Math.max(normal.length, 1);
    const result = {
      id: line.id,
      minimumPrice: line.minimumPrice ?? 0,
      soldPrice: line.soldPrice,
      quantitySold: line.quantitySold,
    };

    if (itemTotal < baselineTotal - PRICE_EPS) {
      return { ...result, commission: 0 };
    }

    if (line.isRemnant) {
      return {
        ...result,
        commission: roundMoney(baseAmount * baselineCommissionUnits(line)),
      };
    }

    const combined = itemTotal + plainShare;
    const threshold = Math.max(COMMISSION_MINIMUM_SALE_IQD, baselineTotal + plainShare);
    if (combined < threshold - PRICE_EPS) {
      return { ...result, commission: 0 };
    }

    const extra = Math.max(0, combined - threshold);
    return {
      ...result,
      commission: roundMoney(
        baseAmount * baselineCommissionUnits(line) + extra * (ratePercent / 100)
      ),
    };
  });
}
