import { SQSClient } from '@aws-sdk/client-sqs';
import { config } from '../../../config/index.js';

export const sqsClient = new SQSClient({
  region: config.sqs.region,
  endpoint: config.sqs.endpoint,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});
