import type { OrderDetails, OrderResult } from '../../domain/orders/order.types.js';

export function toOrderResponse(order: OrderResult): Record<string, unknown> {
  return {
    id: order.id,
    status: order.status,
    customerId: order.customerId,
    warehouseId: order.warehouseId,
    totalMinor: Number(order.totalMinor),
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
  };
}

export function toOrderDetailsResponse(order: OrderDetails): Record<string, unknown> {
  return {
    ...toOrderResponse(order),
    shippingAddress: order.shippingAddress,
    paymentReference: order.paymentReference,
    items: order.items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPriceMinor: Number(item.unitPriceMinor),
    })),
  };
}
