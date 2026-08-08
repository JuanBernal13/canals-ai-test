import type { OrderEventRepository } from '../ports/order-event-repository.js';
import type { OrderPaidEvent } from '../../domain/events/order-paid.event.js';

export class ProcessOrderPaid {
  constructor(private readonly orders: OrderEventRepository) {}

  async execute(event: OrderPaidEvent): Promise<void> {
    await this.orders.markReadyFromEvent(event.eventId, event.payload.orderId);
  }
}
