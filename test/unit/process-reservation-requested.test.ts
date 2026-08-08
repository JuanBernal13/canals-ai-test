import { describe, expect, it, vi } from 'vitest';
import type { OrderRepository } from '../../src/application/ports/order-repository.js';
import { ProcessReservationRequested } from '../../src/application/use-cases/process-reservation-requested.js';
import type { ReservationRequestedEvent } from '../../src/domain/events/reservation-requested.event.js';
import { OrderError } from '../../src/domain/orders/order.error.js';
import { ERROR_MESSAGE, EVENT_TYPE, HTTP_STATUS } from '../../src/shared/constants.js';

const event: ReservationRequestedEvent = {
  eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  type: EVENT_TYPE.RESERVATION_REQUESTED,
  payload: {
    orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    groupKey: 'inventory-group',
    destination: { latitude: 4.711, longitude: -74.0721 },
  },
};

describe('ProcessReservationRequested', () => {
  it('reserves the order and leaves payment to the next event', async () => {
    const orders = orderRepository();

    await new ProcessReservationRequested(orders).execute(event);

    expect(orders.reservePending).toHaveBeenCalledWith(
      event.payload.orderId,
      event.payload.destination,
    );
    expect(orders.markReservationFailed).not.toHaveBeenCalled();
  });

  it('marks a terminal reservation failure when no warehouse can fulfill the order', async () => {
    const orders = orderRepository();
    vi.mocked(orders.reservePending).mockRejectedValue(
      new OrderError(ERROR_MESSAGE.NO_WAREHOUSE, HTTP_STATUS.CONFLICT),
    );

    await new ProcessReservationRequested(orders).execute(event);

    expect(orders.markReservationFailed).toHaveBeenCalledWith(event.payload.orderId);
  });

  it('rethrows transient inventory contention so SQS can retry it', async () => {
    const orders = orderRepository();
    vi.mocked(orders.reservePending).mockRejectedValue(
      new OrderError(ERROR_MESSAGE.INVENTORY_CHANGED, HTTP_STATUS.CONFLICT),
    );

    await expect(new ProcessReservationRequested(orders).execute(event)).rejects.toMatchObject({
      message: ERROR_MESSAGE.INVENTORY_CHANGED,
    });

    expect(orders.markReservationFailed).not.toHaveBeenCalled();
  });
});

function orderRepository(): OrderRepository {
  return {
    findById: vi.fn(),
    findByPaymentKey: vi.fn(),
    findPendingPayment: vi.fn(),
    findPendingPayments: vi.fn(),
    enqueue: vi.fn(),
    reservePending: vi.fn(),
    markReservationFailed: vi.fn(),
    markPaid: vi.fn(),
    markPaymentFailedAndRelease: vi.fn(),
  };
}
