import { describe, expect, it } from 'vitest';
import { mergeOrderItems } from '../../src/domain/orders/merge-order-items.js';
import { OrderError } from '../../src/domain/orders/order.error.js';
import { LIMIT } from '../../src/shared/constants.js';

describe('mergeOrderItems', () => {
  it('merges duplicate products and returns a stable order', () => {
    const items = mergeOrderItems([
      { productId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', quantity: 2 },
      { productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', quantity: 1 },
      { productId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', quantity: 3 },
    ]);

    expect(items).toEqual([
      { productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', quantity: 1 },
      { productId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', quantity: 5 },
    ]);
  });

  it('rejects a combined quantity above the product limit', () => {
    expect(() => mergeOrderItems([
      { productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', quantity: LIMIT.MAX_QUANTITY_PER_PRODUCT },
      { productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', quantity: 1 },
    ])).toThrow(OrderError);
  });
});
