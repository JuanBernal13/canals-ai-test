import { OrderError } from './order.error.js';
import type { OrderStatus } from './order.types.js';
import { ERROR_MESSAGE, HTTP_STATUS, ORDER_STATUS } from '../../shared/constants.js';

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  [ORDER_STATUS.PENDING_RESERVATION]: [
    ORDER_STATUS.PENDING_PAYMENT,
    ORDER_STATUS.RESERVATION_FAILED,
  ],
  [ORDER_STATUS.PENDING_PAYMENT]: [ORDER_STATUS.PAID, ORDER_STATUS.PAYMENT_FAILED],
  [ORDER_STATUS.PAID]: [ORDER_STATUS.READY_TO_FULFILL],
  [ORDER_STATUS.PAYMENT_FAILED]: [],
  [ORDER_STATUS.RESERVATION_FAILED]: [],
  [ORDER_STATUS.READY_TO_FULFILL]: [],
};

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!transitions[from].includes(to)) {
    throw new OrderError(
      `${ERROR_MESSAGE.INVALID_ORDER_TRANSITION}: ${from} -> ${to}`,
      HTTP_STATUS.CONFLICT,
    );
  }
}
