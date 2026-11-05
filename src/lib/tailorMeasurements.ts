export const TAILOR_MEASUREMENT_FIELDS = [
  'shoulderCm',
  'armCm',
  'waistCm',
  'chestCm',
  'heightCm',
  'buttCm',
] as const;

export type TailorMeasurementField = (typeof TAILOR_MEASUREMENT_FIELDS)[number];

export type TailorMeasurementInput = {
  customerName: string;
  phone: string;
  costIqd: number;
  paidIqd: number;
} & Record<TailorMeasurementField, number>;

export type TailorMeasurementErrorCode =
  | 'NAME_REQUIRED'
  | 'PHONE_INVALID'
  | 'MEASUREMENT_INVALID'
  | 'MONEY_INVALID'
  | 'PAID_EXCEEDS_COST';

export class TailorMeasurementError extends Error {
  code: TailorMeasurementErrorCode;

  constructor(code: TailorMeasurementErrorCode) {
    super(code);
    this.code = code;
  }
}

const MAX_CM = 400;
const MAX_IQD = 1_000_000_000;

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundCm(value: number) {
  return Math.round(value * 10) / 10;
}

export function parseTailorMeasurementInput(body: unknown): TailorMeasurementInput {
  if (!body || typeof body !== 'object') {
    throw new TailorMeasurementError('MEASUREMENT_INVALID');
  }

  const raw = body as Record<string, unknown>;
  const customerName = String(raw.customerName ?? '').trim();
  if (customerName.length < 2 || customerName.length > 200) {
    throw new TailorMeasurementError('NAME_REQUIRED');
  }

  const phone = String(raw.phone ?? '').trim().replace(/\s+/g, ' ');
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    throw new TailorMeasurementError('PHONE_INVALID');
  }

  const measurements = {} as Record<TailorMeasurementField, number>;
  for (const field of TAILOR_MEASUREMENT_FIELDS) {
    const value = Number(raw[field]);
    if (!Number.isFinite(value) || value <= 0 || value > MAX_CM) {
      throw new TailorMeasurementError('MEASUREMENT_INVALID');
    }
    measurements[field] = roundCm(value);
  }

  const costIqd = roundMoney(Number(raw.costIqd));
  const paidIqd = roundMoney(Number(raw.paidIqd));
  if (!Number.isFinite(costIqd) || !Number.isFinite(paidIqd) || costIqd <= 0 || costIqd > MAX_IQD || paidIqd < 0) {
    throw new TailorMeasurementError('MONEY_INVALID');
  }
  if (paidIqd > costIqd) {
    throw new TailorMeasurementError('PAID_EXCEEDS_COST');
  }

  return {
    customerName,
    phone,
    costIqd,
    paidIqd,
    ...measurements,
  };
}
