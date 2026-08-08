import type { OrderRepository } from '../ports/order-repository.js';
import type { PaymentGateway } from '../ports/payment-gateway.js';
import type { PaymentRequestedEvent } from '../../domain/events/payment-requested.event.js';
import { PaymentDeclinedError } from '../../domain/payments/payment.error.js';
import { PAYMENT } from '../../shared/constants.js';

export class ProcessPaymentRequested {
  constructor(
    private readonly orders: OrderRepository,
    private readonly payments: PaymentGateway,
  ) {}

  async execute(event: PaymentRequestedEvent): Promise<void> {
    const order = await this.orders.findPendingPayment(event.payload.orderId);
    if (!order) return;
    try {
      const payment = await this.payments.charge({
        cardNumber: order.paymentCardNumber,
        amountMinor: order.totalMinor,
        currency: order.currency,
        description: `${PAYMENT.DESCRIPTION_PREFIX} ${order.id}`,
        idempotencyKey: order.paymentKey,
      });
      await this.orders.markPaid(order.id, payment.reference);
    } catch (error) {
      if (error instanceof PaymentDeclinedError) {
        await this.orders.markPaymentFailedAndRelease(order.id);
        return;
      }
      throw error;
    }
  }
}
