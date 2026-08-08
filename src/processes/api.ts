import { CreateOrder } from '../application/use-cases/create-order.js';
import { GetOrder } from '../application/use-cases/get-order.js';
import { IdempotentCreateOrder } from '../application/use-cases/idempotent-create-order.js';
import { FastifyHttpAdapter } from '../api/fastify-http-adapter.js';
import { config } from '../config/index.js';
import { prisma } from '../infrastructure/database/prisma-client.js';
import { PrismaOrderRepositoryAdapter } from '../infrastructure/database/repositories/prisma-order-repository.js';
import { PrismaIdempotencyRepositoryAdapter } from '../infrastructure/database/repositories/prisma-idempotency-repository.js';
import { MockGeocoderAdapter } from '../infrastructure/geocoding/mock-geocoder.js';
import { HmacRequestFingerprintAdapter } from '../infrastructure/idempotency/create-request-fingerprint.js';
import { sqsClient } from '../infrastructure/messaging/sqs/sqs-client.js';
import { createDependencyChecks } from '../infrastructure/health/dependency-checks.js';

const repository = new PrismaOrderRepositoryAdapter(prisma);
const httpAdapter = new FastifyHttpAdapter({
  createOrder: new IdempotentCreateOrder(
    new CreateOrder(
      repository,
      new MockGeocoderAdapter(),
    ),
    new PrismaIdempotencyRepositoryAdapter(prisma),
    new HmacRequestFingerprintAdapter(config.idempotencySecret),
  ),
  getOrder: new GetOrder(repository),
  dependencyChecks: createDependencyChecks({
    database: prisma,
    paymentBaseUrl: config.payment.baseUrl,
    paymentTimeoutMs: config.payment.timeoutMs,
    queueClient: sqsClient,
    queueUrls: [
      config.sqs.queueUrl,
      config.sqs.reservationQueueUrl,
      config.sqs.paymentQueueUrl,
    ],
  }),
});
const app = await httpAdapter.build({
  closeResources: async () => {
    try {
      await prisma.$disconnect();
    } finally {
      sqsClient.destroy();
    }
  },
});

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await app.close();
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
try {
  await app.listen({ host: config.api.host, port: config.api.port });
} catch (error) {
  app.log.error(error);
  await stop();
  process.exitCode = 1;
}
