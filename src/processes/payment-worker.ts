import { ProcessPaymentRequested } from '../application/use-cases/process-payment-requested.js';
import { config } from '../config/index.js';
import { prisma } from '../infrastructure/database/prisma-client.js';
import { PrismaOrderRepositoryAdapter } from '../infrastructure/database/repositories/prisma-order-repository.js';
import { sqsClient } from '../infrastructure/messaging/sqs/sqs-client.js';
import { SqsPaymentConsumerAdapter } from '../infrastructure/messaging/sqs/sqs-payment-consumer.js';
import { CircuitBreakerPaymentGatewayAdapter } from '../infrastructure/payments/circuit-breaker-payment-gateway.js';
import { HttpPaymentGatewayAdapter } from '../infrastructure/payments/http-payment-gateway.js';
import { LIMIT } from '../shared/constants.js';

const consumer = new SqsPaymentConsumerAdapter(
  sqsClient,
  config.sqs.paymentQueueUrl,
  new ProcessPaymentRequested(
    new PrismaOrderRepositoryAdapter(prisma),
    new CircuitBreakerPaymentGatewayAdapter(
      new HttpPaymentGatewayAdapter(config.payment.baseUrl, config.payment.timeoutMs),
      LIMIT.PAYMENT_CIRCUIT_FAILURE_THRESHOLD,
      LIMIT.PAYMENT_CIRCUIT_RESET_MS,
    ),
  ),
);

let running = true;
process.once('SIGINT', () => {
  running = false;
});
process.once('SIGTERM', () => {
  running = false;
});

while (running) await consumer.pollOnce();
await prisma.$disconnect();
sqsClient.destroy();
