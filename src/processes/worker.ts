import { ProcessOrderPaid } from '../application/use-cases/process-order-paid.js';
import { config } from '../config/index.js';
import { prisma } from '../infrastructure/database/prisma-client.js';
import { PrismaOrderEventRepositoryAdapter } from '../infrastructure/database/repositories/prisma-order-event-repository.js';
import { sqsClient } from '../infrastructure/messaging/sqs/sqs-client.js';
import { SqsOrderPaidConsumerAdapter } from '../infrastructure/messaging/sqs/sqs-order-paid-consumer.js';

const consumer = new SqsOrderPaidConsumerAdapter(
  sqsClient,
  config.sqs.queueUrl,
  new ProcessOrderPaid(new PrismaOrderEventRepositoryAdapter(prisma)),
);
let running = true;
process.once('SIGINT', () => {
  running = false;
});
process.once('SIGTERM', () => {
  running = false;
});

while (running) {
  await consumer.pollOnce();
}
await prisma.$disconnect();
sqsClient.destroy();
