export const errorResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: { type: 'string' },
    details: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  },
} as const;

export const orderResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'status', 'customerId', 'warehouseId', 'totalMinor', 'currency', 'createdAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    status: {
      type: 'string',
      enum: [
        'PENDING_RESERVATION',
        'PENDING_PAYMENT',
        'PAID',
        'PAYMENT_FAILED',
        'RESERVATION_FAILED',
        'READY_TO_FULFILL',
      ],
    },
    customerId: { type: 'string', format: 'uuid' },
    warehouseId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
    totalMinor: { type: 'integer', minimum: 0 },
    currency: { type: 'string', pattern: '^[A-Z]{3}$' },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;
