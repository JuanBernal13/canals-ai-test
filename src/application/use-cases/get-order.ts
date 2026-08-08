import type { OrderRepository } from '../ports/order-repository.js';
import { OrderError } from '../../domain/orders/order.error.js';
import { ERROR_MESSAGE, HTTP_STATUS } from '../../shared/constants.js';
import { toOrderDetailsResponse } from '../mappers/order-response.js';

export class GetOrder {
  constructor(private readonly orders: OrderRepository) {}

  async execute(orderId: string) {
    const order = await this.orders.findById(orderId);
    if (!order) throw new OrderError(ERROR_MESSAGE.ORDER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    return toOrderDetailsResponse(order);
  }
}
