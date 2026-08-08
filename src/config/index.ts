function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export const config = {
  api: {
    host: process.env.HOST ?? '0.0.0.0',
    port: Number(process.env.PORT ?? 3000),
    logLevel: process.env.LOG_LEVEL ?? 'warn',
  },
  database: {
    url: process.env.DATABASE_URL ?? 'postgresql://canals:canals@localhost:5432/canals',
    poolMax: positiveInteger('DATABASE_POOL_MAX', 20),
    transaction: {
      attempts: positiveInteger('TRANSACTION_ATTEMPTS', 8),
      maxWaitMs: positiveInteger('TRANSACTION_MAX_WAIT_MS', 10_000),
      timeoutMs: positiveInteger('TRANSACTION_TIMEOUT_MS', 10_000),
      backoffBaseMs: positiveInteger('TRANSACTION_BACKOFF_BASE_MS', 20),
      backoffMaxMs: positiveInteger('TRANSACTION_BACKOFF_MAX_MS', 500),
      jitterMs: positiveInteger('TRANSACTION_JITTER_MS', 50),
    },
  },
  idempotencySecret: process.env.IDEMPOTENCY_SECRET ?? 'local-development-secret-change-in-production',
  payment: {
    baseUrl: process.env.PAYMENT_BASE_URL ?? 'http://localhost:3001',
    timeoutMs: Number(process.env.PAYMENT_TIMEOUT_MS ?? 2000),
  },
  sqs: {
    region: process.env.AWS_REGION ?? 'us-east-1',
    endpoint: process.env.SQS_ENDPOINT ?? 'http://localhost:4566',
    queueUrl: process.env.ORDER_EVENTS_QUEUE_URL ?? 'http://localhost:4566/000000000000/order-events',
    reservationQueueUrl:
      process.env.INVENTORY_RESERVATIONS_QUEUE_URL ??
      'http://localhost:4566/000000000000/inventory-reservations.fifo',
    paymentQueueUrl:
      process.env.PAYMENT_REQUESTS_QUEUE_URL ??
      'http://localhost:4566/000000000000/payment-requests',
  },
};
