import type { Geocoder } from '../ports/geocoder.js';
import type { OrderRepository } from '../ports/order-repository.js';
import { mergeOrderItems } from '../../domain/orders/merge-order-items.js';
import type { CreateOrderInput, OrderResult } from '../../domain/orders/order.types.js';

export class CreateOrder {
  constructor(
    private readonly orders: OrderRepository,
    private readonly geocoder: Geocoder,
  ) {}

  async execute(input: CreateOrderInput, idempotencyKey: string): Promise<OrderResult> {
    const destination = await this.geocoder.geocode(input.shippingAddress);
    return this.orders.enqueue(
      {
        customerId: input.customerId,
        shippingAddress: input.shippingAddress,
        items: mergeOrderItems(input.items),
        paymentCardNumber: input.payment.creditCardNumber,
      },
      destination,
      idempotencyKey,
    );
  }

  recover(idempotencyKey: string): Promise<OrderResult | null> {
    return this.orders.findByPaymentKey(idempotencyKey);
  }
}
