import { ERROR_MESSAGE, EVENT_TYPE } from '../../shared/constants.js';

export type PaymentRequestedEvent = {
  eventId: string;
  type: typeof EVENT_TYPE.PAYMENT_REQUESTED;
  payload: { orderId: string };
};

export function parsePaymentRequestedEvent(value: unknown): PaymentRequestedEvent {
  if (typeof value !== 'object' || value === null) throw new Error(ERROR_MESSAGE.INVALID_QUEUE_EVENT);
  const event = value as Record<string, unknown>;
  const payload = event.payload;
  if (
    typeof event.eventId !== 'string' ||
    event.type !== EVENT_TYPE.PAYMENT_REQUESTED ||
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as Record<string, unknown>).orderId !== 'string'
  ) {
    throw new Error(ERROR_MESSAGE.UNSUPPORTED_QUEUE_EVENT);
  }
  return value as PaymentRequestedEvent;
}
