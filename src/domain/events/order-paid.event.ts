import { ERROR_MESSAGE, EVENT_TYPE } from '../../shared/constants.js';

export type OrderPaidEvent = {
  eventId: string;
  type: typeof EVENT_TYPE.ORDER_PAID;
  payload: { orderId: string; warehouseId?: string };
};

export function parseOrderPaidEvent(value: unknown): OrderPaidEvent {
  if (typeof value !== 'object' || value === null) throw new Error(ERROR_MESSAGE.INVALID_QUEUE_EVENT);
  const event = value as Record<string, unknown>;
  const payload = event.payload;
  if (typeof event.eventId !== 'string' || event.type !== EVENT_TYPE.ORDER_PAID
    || typeof payload !== 'object' || payload === null
    || typeof (payload as Record<string, unknown>).orderId !== 'string') {
    throw new Error(ERROR_MESSAGE.UNSUPPORTED_QUEUE_EVENT);
  }
  return value as OrderPaidEvent;
}
