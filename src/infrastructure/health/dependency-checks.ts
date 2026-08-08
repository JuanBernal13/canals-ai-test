import { GetQueueAttributesCommand, type SQSClient } from '@aws-sdk/client-sqs';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { DependencyChecks } from '../../application/ports/dependency-checks.js';
import { ERROR_MESSAGE, ROUTE, SQS } from '../../shared/constants.js';

export type DependencyCheckOptions = {
  database: PrismaClient;
  paymentBaseUrl: string;
  paymentTimeoutMs: number;
  queueClient: SQSClient;
  queueUrls: string[];
};

export function createDependencyChecks(options: DependencyCheckOptions): DependencyChecks {
  return {
    database: async () => {
      await options.database.$queryRaw`SELECT 1`;
    },
    payments: async () => {
      const response = await fetch(new URL(ROUTE.PAYMENT_HEALTH, options.paymentBaseUrl), {
        signal: AbortSignal.timeout(options.paymentTimeoutMs),
      });
      if (!response.ok) throw new Error(ERROR_MESSAGE.PAYMENT_NOT_READY);
      await response.body?.cancel();
    },
    queue: async () => {
      await Promise.all(
        options.queueUrls.map((queueUrl) =>
          options.queueClient.send(
            new GetQueueAttributesCommand({
              QueueUrl: queueUrl,
              AttributeNames: [SQS.QUEUE_ARN_ATTRIBUTE],
            }),
          ),
        ),
      );
    },
  };
}
