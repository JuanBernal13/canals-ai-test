import { setTimeout as delay } from 'node:timers/promises';
import { ReconcilePendingPayments } from '../application/use-cases/reconcile-pending-payments.js';
import { config } from '../config/index.js';
import { prisma } from '../infrastructure/database/prisma-client.js';
import { PrismaOrderRepositoryAdapter } from '../infrastructure/database/repositories/prisma-order-repository.js';
import { CircuitBreakerPaymentGatewayAdapter } from '../infrastructure/payments/circuit-breaker-payment-gateway.js';
import { HttpPaymentGatewayAdapter } from '../infrastructure/payments/http-payment-gateway.js';
import { LIMIT } from '../shared/constants.js';

const reconcilePayments = new ReconcilePendingPayments(
  new PrismaOrderRepositoryAdapter(prisma),
  new CircuitBreakerPaymentGatewayAdapter(
    new HttpPaymentGatewayAdapter(config.payment.baseUrl, config.payment.timeoutMs),
    LIMIT.PAYMENT_CIRCUIT_FAILURE_THRESHOLD,
    LIMIT.PAYMENT_CIRCUIT_RESET_MS,
  ),
);
let running = true;
process.once('SIGINT', () => { running = false; });
process.once('SIGTERM', () => { running = false; });

while (running) {
  await reconcilePayments.execute(LIMIT.RECONCILIATION_BATCH_SIZE);
  await delay(LIMIT.RECONCILIATION_POLL_MS);
}
await prisma.$disconnect();
