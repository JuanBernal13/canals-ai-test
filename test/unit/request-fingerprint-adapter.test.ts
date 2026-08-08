import { describe, expect, it } from 'vitest';
import { HmacRequestFingerprintAdapter } from '../../src/infrastructure/idempotency/create-request-fingerprint.js';
import type { CreateOrderInput } from '../../src/domain/orders/order.types.js';

const input: CreateOrderInput = {
  customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  shippingAddress: {
    line1: 'Main Street 1',
    city: 'New York',
    region: 'NY',
    postalCode: '10001',
    country: 'US',
  },
  items: [{ productId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', quantity: 1 }],
  payment: { creditCardNumber: '4242424242424242' },
};

describe('HmacRequestFingerprintAdapter', () => {
  it('produces a stable fingerprint independent of object key order', () => {
    const adapter = new HmacRequestFingerprintAdapter('test-secret');
    const reordered = {
      payment: input.payment,
      items: input.items,
      shippingAddress: input.shippingAddress,
      customerId: input.customerId,
    } as CreateOrderInput;

    expect(adapter.create(reordered)).toBe(adapter.create(input));
    expect(adapter.create(input)).toMatch(/^[a-f0-9]{64}$/);
  });
});
