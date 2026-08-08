import { buildMockPaymentServer } from '../infrastructure/payments/mock-payment-server.js';

const app = buildMockPaymentServer();
const stop = async (): Promise<void> => app.close();

process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());

try {
  await app.listen({
    host: process.env.PAYMENT_HOST ?? '0.0.0.0',
    port: Number(process.env.PAYMENT_PORT ?? 3001),
  });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
