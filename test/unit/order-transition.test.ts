import { describe, expect, it } from 'vitest';
import { assertOrderTransition } from '../../src/domain/orders/order-transition.js';
import { OrderError } from '../../src/domain/orders/order.error.js';
import { ORDER_STATUS } from '../../src/shared/constants.js';

describe('assertOrderTransition', () => {
  it.each([
    [ORDER_STATUS.PENDING_RESERVATION, ORDER_STATUS.PENDING_PAYMENT],
    [ORDER_STATUS.PENDING_RESERVATION, ORDER_STATUS.RESERVATION_FAILED],
    [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAID],
    [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAYMENT_FAILED],
    [ORDER_STATUS.PAID, ORDER_STATUS.READY_TO_FULFILL],
  ])('allows %s -> %s', (from, to) => {
    expect(() => assertOrderTransition(from, to)).not.toThrow();
  });

  it('rejects transitions from a terminal state', () => {
    expect(() => assertOrderTransition(
      ORDER_STATUS.READY_TO_FULFILL,
      ORDER_STATUS.PAYMENT_FAILED,
    )).toThrow(OrderError);
  });
});
