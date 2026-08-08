import { ProcessReservationRequested } from '../application/use-cases/process-reservation-requested.js';
import { config } from '../config/index.js';
import { prisma } from '../infrastructure/database/prisma-client.js';
import { PrismaOrderRepositoryAdapter } from '../infrastructure/database/repositories/prisma-order-repository.js';
import { sqsClient } from '../infrastructure/messaging/sqs/sqs-client.js';
import { SqsReservationConsumerAdapter } from '../infrastructure/messaging/sqs/sqs-reservation-consumer.js';

const consumer = new SqsReservationConsumerAdapter(
  sqsClient,
  config.sqs.reservationQueueUrl,
  new ProcessReservationRequested(new PrismaOrderRepositoryAdapter(prisma)),
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
