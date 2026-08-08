export const ORDER_STATUS = {
  PENDING_RESERVATION: 'PENDING_RESERVATION',
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID: 'PAID',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  RESERVATION_FAILED: 'RESERVATION_FAILED',
  READY_TO_FULFILL: 'READY_TO_FULFILL',
} as const;

export const PAYMENT_STATUS = {
  SUCCEEDED: 'succeeded',
  DECLINED: 'declined',
  NOT_FOUND: 'not_found',
} as const;

export const IDEMPOTENCY_STATUS = {
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
} as const;

export const EVENT_TYPE = {
  RESERVATION_REQUESTED: 'ReservationRequested',
  PAYMENT_REQUESTED: 'PaymentRequested',
  ORDER_PAID: 'OrderPaid',
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  BAD_REQUEST: 400,
  UNPROCESSABLE_ENTITY: 422,
  PAYMENT_REQUIRED: 402,
  REQUEST_TIMEOUT: 408,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const HEADER = {
  CONTENT_TYPE: 'content-type',
  IDEMPOTENCY_KEY: 'idempotency-key',
  IDEMPOTENCY_REPLAYED: 'Idempotency-Replayed',
} as const;

export const CONTENT_TYPE = { JSON: 'application/json' } as const;

export const ROUTE = {
  ORDERS: '/orders',
  ORDER_BY_ID: '/orders/:orderId',
  PAYMENTS: '/payments',
  PAYMENT_BY_KEY: '/payments/:key',
  PAYMENT_HEALTH: '/health/ready',
  LIVENESS: '/health/live',
  READINESS: '/health/ready',
  STATUS: '/status',
  OPENAPI: '/openapi.json',
  DOCUMENTATION: '/docs',
} as const;

export const HEALTH_STATUS = {
  OK: 'ok',
  READY: 'ready',
  NOT_READY: 'not-ready',
  UP: 'up',
  DOWN: 'down',
} as const;

export const ERROR_MESSAGE = {
  INVALID_REQUEST: 'Invalid request',
  ORDER_NOT_FOUND: 'Order not found',
  UNKNOWN_PRODUCT: 'Unknown product',
  UNKNOWN_CUSTOMER: 'Unknown customer',
  MIXED_CURRENCIES: 'All products in an order must use the same currency',
  NO_WAREHOUSE: 'No warehouse can fulfill the complete order',
  ADDRESS_NOT_GEOCODABLE: 'Shipping city cannot be geocoded by the mock provider',
  WAREHOUSE_CHANGED: 'Warehouse inventory changed',
  INVENTORY_CHANGED: 'Inventory changed while creating the order; please retry',
  RESERVATION_FAILED: 'Inventory reservation failed',
  RESERVATION_MISSING: 'Inventory reservation is missing',
  ORDER_NOT_PENDING: 'Order is not pending payment',
  INVALID_ORDER_TRANSITION: 'Invalid order status transition',
  INVALID_CIRCUIT_BREAKER_CONFIG: 'Circuit breaker limits must be positive',
  RATE_LIMIT_EXCEEDED: 'Too many order requests; try again later',
  REQUEST_TOO_LARGE: 'Request body is too large',
  INTERNAL_SERVER_ERROR: 'Internal server error',
  PAYMENT_DECLINED: 'Payment declined',
  PAYMENT_UNAVAILABLE: 'Payment provider unavailable',
  PAYMENT_UNKNOWN: 'Payment result is unknown',
  PAYMENT_CONNECTION: 'Payment provider connection failed',
  PAYMENT_UNCONFIRMED: 'Payment could not be confirmed before the reservation expired',
  PAYMENT_NOT_READY: 'Payment provider is not ready',
  INVALID_PAYMENT_REQUEST: 'Invalid payment request',
  IDEMPOTENCY_CONFLICT: 'Idempotency-Key was already used with a different request',
  IDEMPOTENCY_PROCESSING: 'A request with this Idempotency-Key is still processing',
  INVALID_QUEUE_EVENT: 'Invalid queue event',
  UNSUPPORTED_QUEUE_EVENT: 'Unsupported queue event',
} as const;

export const LIMIT = {
  BODY_BYTES: 64 * 1024,
  PAYMENT_BODY_BYTES: 16 * 1024,
  MAX_ITEMS: 50,
  MAX_QUANTITY_PER_PRODUCT: 100,
  IDEMPOTENCY_KEY_LENGTH: 128,
  PAYMENT_RECONCILIATION_ATTEMPTS: 3,
  PAYMENT_RECONCILIATION_BACKOFF_MS: 100,
  PAYMENT_CIRCUIT_FAILURE_THRESHOLD: 5,
  PAYMENT_CIRCUIT_RESET_MS: 30_000,
  ORDER_RATE_LIMIT_MAX: 200,
  ORDER_RATE_LIMIT_WINDOW_MS: 1_000,
  OUTBOX_BATCH_SIZE: 20,
  OUTBOX_POLL_MS: 500,
  OUTBOX_CLAIM_SECONDS: 30,
  OUTBOX_RETRY_BASE_MS: 500,
  OUTBOX_MAX_BACKOFF_EXPONENT: 10,
  SQS_BATCH_SIZE: 10,
  SQS_WAIT_SECONDS: 10,
  SQS_VISIBILITY_SECONDS: 30,
  IDEMPOTENCY_RETENTION_MS: 24 * 60 * 60 * 1000,
  IDEMPOTENCY_PROCESSING_TIMEOUT_MS: 30 * 1000,
  INITIAL_INVENTORY: 100,
  RESERVATION_TTL_MS: 15 * 60 * 1000,
  RECONCILIATION_BATCH_SIZE: 50,
  RECONCILIATION_POLL_MS: 1000,
} as const;

export const VALIDATION = {
  ADDRESS_LINE_LENGTH: 200,
  CITY_LENGTH: 100,
  REGION_LENGTH: 100,
  POSTAL_CODE_LENGTH: 20,
  COUNTRY_CODE_LENGTH: 2,
  CARD_MIN_LENGTH: 12,
  CARD_MAX_LENGTH: 19,
  PAYMENT_DESCRIPTION_LENGTH: 200,
} as const;

export const PAYMENT = {
  DECLINED_CARD_SUFFIX: '0000',
  REFERENCE_PREFIX: 'pay_',
  DESCRIPTION_PREFIX: 'Order',
} as const;

export const CURRENCY = { USD: 'USD' } as const;

export const CRYPTO = { HASH_ALGORITHM: 'sha256' } as const;

export const DATABASE_ERROR_CODE = {
  UNIQUE_CONSTRAINT: 'P2002',
  FOREIGN_KEY_CONSTRAINT: 'P2003',
  RAW_QUERY_FAILED: 'P2010',
  TRANSACTION_API_ERROR: 'P2028',
  TRANSACTION_CONFLICT: 'P2034',
  SERIALIZATION_CONFLICT: '40001',
} as const;

export const SQS = { QUEUE_ARN_ATTRIBUTE: 'QueueArn' } as const;
