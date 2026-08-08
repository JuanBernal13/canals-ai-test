import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { PublishPendingEvents } from '../application/use-cases/publish-pending-events.js';
import { config } from '../config/index.js';
import { prisma } from '../infrastructure/database/prisma-client.js';
import { PrismaOutboxRepositoryAdapter } from '../infrastructure/database/repositories/prisma-outbox-repository.js';
import { sqsClient } from '../infrastructure/messaging/sqs/sqs-client.js';
import { SqsEventPublisherAdapter } from '../infrastructure/messaging/sqs/sqs-event-publisher.js';
import { logQueueEvent } from '../infrastructure/messaging/sqs/queue-log.js';
import { LIMIT } from '../shared/constants.js';

const publishPendingEvents = new PublishPendingEvents(
  new PrismaOutboxRepositoryAdapter(prisma),
  new SqsEventPublisherAdapter(sqsClient, {
    orderEvents: config.sqs.queueUrl,
    reservations: config.sqs.reservationQueueUrl,
    payments: config.sqs.paymentQueueUrl,
  }),
  randomUUID(),
  {
    info: (event, fields) => logQueueEvent('outbox-publisher', event, fields),
    error: (event, fields) => logQueueEvent('outbox-publisher', event, fields, 'error'),
  },
);
let running = true;
process.once('SIGINT', () => { running = false; });
process.once('SIGTERM', () => { running = false; });

while (running) {
  const publishedCount = await publishPendingEvents.execute(LIMIT.OUTBOX_BATCH_SIZE);
  if (publishedCount === 0) await delay(LIMIT.OUTBOX_POLL_MS);
}
await prisma.$disconnect();
sqsClient.destroy();
