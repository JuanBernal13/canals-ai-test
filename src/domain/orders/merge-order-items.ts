import { OrderError } from './order.error.js';
import type { OrderItemInput } from './order.types.js';
import { HTTP_STATUS, LIMIT } from '../../shared/constants.js';

export function mergeOrderItems(items: OrderItemInput[]): OrderItemInput[] {
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  if ([...quantities.values()].some(quantity => quantity > LIMIT.MAX_QUANTITY_PER_PRODUCT)) {
    throw new OrderError(
      `Maximum quantity per product is ${LIMIT.MAX_QUANTITY_PER_PRODUCT}`,
      HTTP_STATUS.BAD_REQUEST,
    );
  }
  return [...quantities]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((left, right) => left.productId.localeCompare(right.productId));
}
