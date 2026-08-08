import { LIMIT, VALIDATION } from '../../shared/constants.js';
import { errorResponseSchema, orderResponseSchema } from './common.schemas.js';

const shippingAddressSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['line1', 'city', 'region', 'postalCode', 'country'],
  properties: {
    line1: nonBlankString(VALIDATION.ADDRESS_LINE_LENGTH),
    city: nonBlankString(VALIDATION.CITY_LENGTH),
    region: nonBlankString(VALIDATION.REGION_LENGTH),
    postalCode: nonBlankString(VALIDATION.POSTAL_CODE_LENGTH),
    country: {
      type: 'string',
      minLength: VALIDATION.COUNTRY_CODE_LENGTH,
      maxLength: VALIDATION.COUNTRY_CODE_LENGTH,
    },
  },
} as const;

const createOrderBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['customerId', 'shippingAddress', 'items', 'payment'],
  properties: {
    customerId: { type: 'string', format: 'uuid' },
    shippingAddress: shippingAddressSchema,
    items: {
      type: 'array',
      minItems: 1,
      maxItems: LIMIT.MAX_ITEMS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['productId', 'quantity'],
        properties: {
          productId: { type: 'string', format: 'uuid' },
          quantity: {
            type: 'integer',
            minimum: 1,
            maximum: LIMIT.MAX_QUANTITY_PER_PRODUCT,
          },
        },
      },
    },
    payment: {
      type: 'object',
      additionalProperties: false,
      required: ['creditCardNumber'],
      properties: {
        creditCardNumber: {
          type: 'string',
          minLength: VALIDATION.CARD_MIN_LENGTH,
          maxLength: VALIDATION.CARD_MAX_LENGTH,
          pattern: '^\\d+$',
        },
      },
    },
  },
} as const;

export const createOrderRouteSchema = {
  tags: ['orders'],
  summary: 'Submit an order for asynchronous reservation and payment',
  headers: {
    type: 'object',
    required: ['idempotency-key'],
    properties: {
      'idempotency-key': {
        type: 'string',
        pattern: `^[\\x21-\\x7E]{1,${LIMIT.IDEMPOTENCY_KEY_LENGTH}}$`,
      },
    },
  },
  body: createOrderBodySchema,
  response: {
    202: orderResponseSchema,
    400: errorResponseSchema,
    409: errorResponseSchema,
    422: errorResponseSchema,
    429: errorResponseSchema,
    500: errorResponseSchema,
  },
} as const;

export const getOrderRouteSchema = {
  tags: ['orders'],
  summary: 'Get an order',
  params: {
    type: 'object',
    additionalProperties: false,
    required: ['orderId'],
    properties: { orderId: { type: 'string', format: 'uuid' } },
  },
  response: {
    200: {
      ...orderResponseSchema,
      required: [...orderResponseSchema.required, 'shippingAddress', 'paymentReference', 'items'],
      properties: {
        ...orderResponseSchema.properties,
        shippingAddress: shippingAddressSchema,
        paymentReference: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['productId', 'quantity', 'unitPriceMinor'],
            properties: {
              productId: { type: 'string', format: 'uuid' },
              quantity: { type: 'integer', minimum: 1 },
              unitPriceMinor: { type: 'integer', minimum: 0 },
            },
          },
        },
      },
    },
    400: errorResponseSchema,
    404: errorResponseSchema,
  },
} as const;

function nonBlankString(maxLength: number) {
  return { type: 'string', minLength: 1, maxLength, pattern: '.*\\S.*' } as const;
}
