import { ERROR_MESSAGE, EVENT_TYPE } from '../../shared/constants.js';

export type ReservationRequestedEvent = {
  eventId: string;
  type: typeof EVENT_TYPE.RESERVATION_REQUESTED;
  payload: {
    orderId: string;
    groupKey: string;
    destination: { latitude: number; longitude: number };
  };
};

export function parseReservationRequestedEvent(value: unknown): ReservationRequestedEvent {
  if (typeof value !== 'object' || value === null) throw new Error(ERROR_MESSAGE.INVALID_QUEUE_EVENT);
  const event = value as Record<string, unknown>;
  const payload = event.payload;
  if (event.type !== EVENT_TYPE.RESERVATION_REQUESTED || !isRecord(payload)) {
    throw new Error(ERROR_MESSAGE.UNSUPPORTED_QUEUE_EVENT);
  }
  const destination = payload.destination;
  if (
    typeof event.eventId !== 'string' ||
    typeof payload.orderId !== 'string' ||
    typeof payload.groupKey !== 'string' ||
    !isRecord(destination) ||
    typeof destination.latitude !== 'number' ||
    typeof destination.longitude !== 'number'
  ) {
    throw new Error(ERROR_MESSAGE.INVALID_QUEUE_EVENT);
  }
  return value as ReservationRequestedEvent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
