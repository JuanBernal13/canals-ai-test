import { describe, expect, it, vi } from 'vitest';
import type { OrderRepository } from '../../src/application/ports/order-repository.js';
import type { PaymentGateway } from '../../src/application/ports/payment-gateway.js';
import { ProcessPaymentRequested } from '../../src/application/use-cases/process-payment-requested.js';
import type { PaymentRequestedEvent } from '../../src/domain/events/payment-requested.event.js';
import type { PendingPaymentOrder } from '../../src/domain/orders/order.types.js';
import { PaymentDeclinedError, PaymentUnavailableError } from '../../src/domain/payments/payment.error.js';
import { CURRENCY, EVENT_TYPE, ORDER_STATUS, PAYMENT_STATUS } from '../../src/shared/constants.js';

const event: PaymentRequestedEvent = {
  eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  type: EVENT_TYPE.PAYMENT_REQUESTED,
  payload: { orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
};

const pendingOrder: PendingPaymentOrder = {
  id: event.payload.orderId,
  customerId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  warehouseId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  status: ORDER_STATUS.PENDING_PAYMENT,
  totalMinor: 12_900n,
  currency: CURRENCY.USD,
  createdAt: new Date('2026-08-07T00:00:00.000Z'),
  paymentKey: 'checkout-1',
  paymentCardNumber: '4242424242424242',
  reservationExpiresAt: new Date('2026-08-07T00:15:00.000Z'),
};

describe('ProcessPaymentRequested', () => {
  it('charges and confirms a reserved order', async () => {
    const { orders, payments } = dependencies();

    await new ProcessPaymentRequested(orders, payments).execute(event);

    expect(payments.charge).toHaveBeenCalledWith({
      cardNumber: pendingOrder.paymentCardNumber,
      amountMinor: pendingOrder.totalMinor,
      currency: pendingOrder.currency,
      description: `Order ${pendingOrder.id}`,
      idempotencyKey: pendingOrder.paymentKey,
    });
    expect(orders.markPaid).toHaveBeenCalledWith(pendingOrder.id, 'pay_1');
  });

  it('releases inventory when payment is declined', async () => {
    const { orders, payments } = dependencies();
    vi.mocked(payments.charge).mockRejectedValue(new PaymentDeclinedError());

    await new ProcessPaymentRequested(orders, payments).execute(event);

    expect(orders.markPaymentFailedAndRelease).toHaveBeenCalledWith(pendingOrder.id);
    expect(orders.markPaid).not.toHaveBeenCalled();
  });

  it('keeps the reservation pending when the provider is unavailable', async () => {
    const { orders, payments } = dependencies();
    vi.mocked(payments.charge).mockRejectedValue(new PaymentUnavailableError());

    await expect(new ProcessPaymentRequested(orders, payments).execute(event)).rejects.toBeInstanceOf(
      PaymentUnavailableError,
    );

    expect(orders.markPaymentFailedAndRelease).not.toHaveBeenCalled();
  });

  it('ignores a duplicate event after the order leaves pending payment', async () => {
    const { orders, payments } = dependencies();
    vi.mocked(orders.findPendingPayment).mockResolvedValue(null);

    await new ProcessPaymentRequested(orders, payments).execute(event);

    expect(payments.charge).not.toHaveBeenCalled();
  });
});

function dependencies(): { orders: OrderRepository; payments: PaymentGateway } {
  return {
    orders: {
      findById: vi.fn(),
      findByPaymentKey: vi.fn(),
      findPendingPayment: vi.fn().mockResolvedValue(pendingOrder),
      findPendingPayments: vi.fn(),
      enqueue: vi.fn(),
      reservePending: vi.fn(),
      markReservationFailed: vi.fn(),
      markPaid: vi.fn(),
      markPaymentFailedAndRelease: vi.fn(),
    },
    payments: {
      charge: vi.fn().mockResolvedValue({ reference: 'pay_1' }),
      findByIdempotencyKey: vi.fn().mockResolvedValue({ status: PAYMENT_STATUS.NOT_FOUND }),
    },
  };
}
