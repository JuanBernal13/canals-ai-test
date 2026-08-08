import type { OrderRepository } from '../ports/order-repository.js';
import type { ReservationRequestedEvent } from '../../domain/events/reservation-requested.event.js';
import { OrderError } from '../../domain/orders/order.error.js';
import { ERROR_MESSAGE } from '../../shared/constants.js';

export class ProcessReservationRequested {
  constructor(private readonly orders: OrderRepository) {}

  async execute(event: ReservationRequestedEvent): Promise<void> {
    try {
      await this.orders.reservePending(event.payload.orderId, event.payload.destination);
    } catch (error) {
      if (error instanceof OrderError && error.message === ERROR_MESSAGE.NO_WAREHOUSE) {
        await this.orders.markReservationFailed(event.payload.orderId);
        return;
      }
      throw error;
    }
  }
}
