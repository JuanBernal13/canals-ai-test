import type { CreateOrderInput } from '../../domain/orders/order.types.js';

export interface RequestFingerprint {
  create(input: CreateOrderInput): string;
}
