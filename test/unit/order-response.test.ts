import { describe, expect, it } from 'vitest';
import { toOrderResponse } from '../../src/application/mappers/order-response.js';
import type { OrderResult } from '../../src/domain/orders/order.types.js';

describe('toOrderResponse', () => {
  it('only exposes fields from the public API contract', () => {
    const persistedOrder: OrderResult & {
      paymentKey: string;
      reservationExpiresAt: Date;
    } = {
      id: 'order-1',
      status: 'PAID',
      customerId: 'customer-1',
      warehouseId: 'warehouse-1',
      totalMinor: 2_500n,
      currency: 'USD',
      createdAt: new Date('2026-08-07T12:00:00.000Z'),
      paymentKey: 'secret-payment-key',
      reservationExpiresAt: new Date('2026-08-07T12:15:00.000Z'),
    };

    const response = toOrderResponse(persistedOrder);

    expect(response).toEqual({
      id: 'order-1',
      status: 'PAID',
      customerId: 'customer-1',
      warehouseId: 'warehouse-1',
      totalMinor: 2_500,
      currency: 'USD',
      createdAt: '2026-08-07T12:00:00.000Z',
    });
    expect(response).not.toHaveProperty('paymentKey');
    expect(response).not.toHaveProperty('reservationExpiresAt');
  });
});
