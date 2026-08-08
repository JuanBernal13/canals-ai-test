import { describe, expect, it, vi } from 'vitest';
import { CreateOrder } from '../../src/application/use-cases/create-order.js';
import type { Geocoder } from '../../src/application/ports/geocoder.js';
import type { OrderRepository } from '../../src/application/ports/order-repository.js';
import type { CreateOrderInput, OrderResult } from '../../src/domain/orders/order.types.js';
import { CURRENCY, ORDER_STATUS } from '../../src/shared/constants.js';

const input: CreateOrderInput = {
  customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  shippingAddress: {
    line1: 'Calle 1',
    city: 'Bogota',
    region: 'Bogota',
    postalCode: '110111',
    country: 'CO',
  },
  items: [{ productId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', quantity: 2 }],
  payment: { creditCardNumber: '4242424242424242' },
};

const queuedOrder: OrderResult = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  customerId: input.customerId,
  warehouseId: null,
  status: ORDER_STATUS.PENDING_RESERVATION,
  totalMinor: 1000n,
  currency: CURRENCY.USD,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

function dependencies() {
  const orders: OrderRepository = {
    findById: vi.fn(),
    findByPaymentKey: vi.fn(),
    findPendingPayment: vi.fn(),
    findPendingPayments: vi.fn(),
    enqueue: vi.fn().mockResolvedValue(queuedOrder),
    reservePending: vi.fn(),
    markReservationFailed: vi.fn(),
    markPaid: vi.fn(),
    markPaymentFailedAndRelease: vi.fn(),
  };
  const geocoder: Geocoder = {
    geocode: vi.fn().mockResolvedValue({ latitude: 4.711, longitude: -74.0721 }),
  };
  return { orders, geocoder };
}

describe('CreateOrder', () => {
  it('queues the original card number for the assessment payment API', async () => {
    const { orders, geocoder } = dependencies();
    const result = await new CreateOrder(orders, geocoder).execute(input, 'checkout-1');

    expect(orders.enqueue).toHaveBeenCalledWith(
      {
        customerId: input.customerId,
        shippingAddress: input.shippingAddress,
        items: input.items,
        paymentCardNumber: input.payment.creditCardNumber,
      },
      { latitude: 4.711, longitude: -74.0721 },
      'checkout-1',
    );
    expect(result.status).toBe(ORDER_STATUS.PENDING_RESERVATION);
  });

  it('recovers a queued order by payment key', async () => {
    const { orders, geocoder } = dependencies();
    vi.mocked(orders.findByPaymentKey).mockResolvedValue(queuedOrder);
    const createOrder = new CreateOrder(orders, geocoder);

    await expect(createOrder.recover('checkout-1')).resolves.toEqual(queuedOrder);
  });
});
