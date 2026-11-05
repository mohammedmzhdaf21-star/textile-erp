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
};

describe('parseTailorMeasurementInput', () => {
  it('accepts a customer with all six sizes', () => {
    const parsed = parseTailorMeasurementInput(valid);
    assert.equal(parsed.customerName, 'Amina Karim');
    assert.equal(parsed.phone, '07501234567');
    assert.equal(parsed.shoulderCm, 42);
    assert.equal(parsed.armCm, 60.5);
    assert.equal(parsed.buttCm, 98.2);
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
