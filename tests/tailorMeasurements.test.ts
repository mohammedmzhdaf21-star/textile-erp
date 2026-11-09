import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TailorMeasurementError,
  parseTailorMeasurementInput,
} from '../src/lib/tailorMeasurements';

const valid = {
  customerName: 'Amina Karim',
  phone: '07501234567',
  shoulderCm: 42,
  armCm: 60.5,
  waistCm: 80,
  chestCm: 96,
  heightCm: 165,
  buttCm: 98.2,
  costIqd: 25000,
  paidIqd: 10000,
  givenOn: '2026-11-05',
  returnOn: '2026-11-12',
  garments: [{ id: 'kras', pieces: 1 }],
};

describe('parseTailorMeasurementInput', () => {
  it('accepts a customer with all six sizes', () => {
    const parsed = parseTailorMeasurementInput(valid);
    assert.equal(parsed.customerName, 'Amina Karim');
    assert.equal(parsed.phone, '07501234567');
    assert.equal(parsed.shoulderCm, 42);
    assert.equal(parsed.armCm, 60.5);
    assert.equal(parsed.buttCm, 98.2);
    assert.equal(parsed.costIqd, 25000);
    assert.equal(parsed.paidIqd, 10000);
    assert.equal(parsed.givenOn, '2026-11-05');
    assert.equal(parsed.returnOn, '2026-11-12');
    assert.deepEqual(parsed.garments, [{ id: 'kras', pieces: 1 }]);
  });

  it('keeps clothes in tailor order and allows a two-piece under-dress', () => {
    const parsed = parseTailorMeasurementInput({
      ...valid,
      garments: [
        { id: 'repair', pieces: 1 },
        { id: 'underDress', pieces: 2 },
        { id: 'kawa', pieces: 3 },
      ],
    });
    assert.deepEqual(parsed.garments, [
      { id: 'kawa', pieces: 3 },
      { id: 'underDress', pieces: 2 },
      { id: 'repair', pieces: 1 },
    ]);
  });

  it('rejects clothes with no piece count or a three-piece under-dress', () => {
    assert.throws(
      () => parseTailorMeasurementInput({ ...valid, garments: [] }),
      (error: unknown) => error instanceof TailorMeasurementError && error.code === 'GARMENTS_REQUIRED'
    );
    assert.throws(
      () => parseTailorMeasurementInput({ ...valid, garments: [{ id: 'underDress', pieces: 3 }] }),
      (error: unknown) => error instanceof TailorMeasurementError && error.code === 'GARMENTS_INVALID'
    );
    assert.throws(
      () => parseTailorMeasurementInput({ ...valid, garments: [{ id: 'kawa', pieces: 21 }] }),
      (error: unknown) => error instanceof TailorMeasurementError && error.code === 'GARMENTS_INVALID'
    );
  });

  it('accepts a return on the same day it was given', () => {
    const parsed = parseTailorMeasurementInput({ ...valid, returnOn: '2026-11-05' });
    assert.equal(parsed.returnOn, '2026-11-05');
  });

  it('rejects a missing date or a return before the given day', () => {
    assert.throws(
      () => parseTailorMeasurementInput({ ...valid, givenOn: '2026-02-31' }),
      (error: unknown) => error instanceof TailorMeasurementError && error.code === 'DATE_INVALID'
    );
    assert.throws(
      () => parseTailorMeasurementInput({ ...valid, returnOn: '2026-11-04' }),
      (error: unknown) =>
        error instanceof TailorMeasurementError && error.code === 'RETURN_BEFORE_GIVEN'
    );
  });

  it('accepts a customer who has not paid yet', () => {
    const parsed = parseTailorMeasurementInput({ ...valid, paidIqd: 0 });
    assert.equal(parsed.paidIqd, 0);
  });

  it('rejects a missing cost or a payment above the cost', () => {
    assert.throws(
      () => parseTailorMeasurementInput({ ...valid, costIqd: 0 }),
      (error: unknown) => error instanceof TailorMeasurementError && error.code === 'MONEY_INVALID'
    );
    assert.throws(
      () => parseTailorMeasurementInput({ ...valid, paidIqd: 30000 }),
      (error: unknown) => error instanceof TailorMeasurementError && error.code === 'PAID_EXCEEDS_COST'
    );
  });

  it('trims the name and collapses phone spaces', () => {
    const parsed = parseTailorMeasurementInput({
      ...valid,
      customerName: '  Hana Ali  ',
      phone: '0750 123 4567',
    });
    assert.equal(parsed.customerName, 'Hana Ali');
    assert.equal(parsed.phone, '0750 123 4567');
  });

  it('rejects a missing name', () => {
    assert.throws(
      () => parseTailorMeasurementInput({ ...valid, customerName: ' ' }),
      (error: unknown) => error instanceof TailorMeasurementError && error.code === 'NAME_REQUIRED'
    );
  });

  it('rejects a phone that is too short', () => {
    assert.throws(
      () => parseTailorMeasurementInput({ ...valid, phone: '123' }),
      (error: unknown) => error instanceof TailorMeasurementError && error.code === 'PHONE_INVALID'
    );
  });

  it('rejects a missing or non-positive size', () => {
    assert.throws(
      () => parseTailorMeasurementInput({ ...valid, waistCm: 0 }),
      (error: unknown) =>
        error instanceof TailorMeasurementError && error.code === 'MEASUREMENT_INVALID'
    );
    assert.throws(
      () => parseTailorMeasurementInput({ ...valid, chestCm: '' }),
      (error: unknown) =>
        error instanceof TailorMeasurementError && error.code === 'MEASUREMENT_INVALID'
    );
  });
});
