import { randomUUID } from 'node:crypto';

const baseUrl = (process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const idempotencyKey = `smoke-${randomUUID()}`;

const orderPayload = {
  customerId: '00000000-0000-4000-8000-000000000001',
  shippingAddress: {
    line1: 'Calle 1',
    city: 'Bogota',
    region: 'Bogota',
    postalCode: '110111',
    country: 'CO',
  },
  items: [{ productId: '00000000-0000-4000-8000-000000000101', quantity: 1 }],
  payment: { creditCardNumber: '4242424242424242' },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

async function waitUntilReady() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const { response, body } = await request('/status');
      if (response.status === 200) {
        console.log(`OK  Dependencies ready: ${body.status}`);
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`The API was not ready at ${baseUrl} after 30 seconds`);
}

async function waitForOrder(orderId) {
  const terminalStatuses = new Set([
    'PAID',
    'PAYMENT_FAILED',
    'RESERVATION_FAILED',
    'READY_TO_FULFILL',
  ]);
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const result = await request(`/orders/${orderId}`);
    assert(
      result.response.status === 200,
      `Get order: expected 200, received ${result.response.status}: ${JSON.stringify(result.body)}`,
    );
    if (terminalStatuses.has(result.body?.status)) return result.body;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Order ${orderId} did not finish asynchronous processing after 30 seconds`);
}

async function main() {
  console.log(`Testing API at ${baseUrl}`);
  await waitUntilReady();

  const headers = {
    'content-type': 'application/json',
    'idempotency-key': idempotencyKey,
  };

  const created = await request('/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify(orderPayload),
  });
  if (
    created.response.status === 409 &&
    created.body?.error === 'No warehouse can fulfill the complete order'
  ) {
    throw new Error(
      'No compatible inventory is available. Run npm run prepare:data to load the current code and fixtures.',
    );
  }
  assert(
    created.response.status === 202,
    `Create order: expected 202, received ${created.response.status}: ${JSON.stringify(created.body)}`,
  );
  assert(typeof created.body?.id === 'string', 'Create order: the response does not contain an id');
  assert(
    created.body?.status === 'PENDING_RESERVATION',
    `Create order: expected PENDING_RESERVATION, received ${created.body?.status}`,
  );
  console.log(`OK  Order accepted: ${created.body.id}`);

  const replayed = await request('/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify(orderPayload),
  });
  assert(
    replayed.response.status === 202,
    `Replay: expected 202, received ${replayed.response.status}: ${JSON.stringify(replayed.body)}`,
  );
  assert(replayed.body?.id === created.body.id, 'Replay: returned a different order');
  assert(
    replayed.response.headers.get('idempotency-replayed') === 'true',
    'Replay: missing Idempotency-Replayed: true header',
  );
  console.log('OK  Idempotency verified');

  const fetched = await waitForOrder(created.body.id);
  assert(fetched.id === created.body.id, 'Get order: returned a different id');
  assert(
    fetched.status === 'PAID' || fetched.status === 'READY_TO_FULFILL',
    `Order processing failed with status ${fetched.status}`,
  );
  console.log(`OK  Asynchronous processing completed with status: ${fetched.status}`);

  const conflictingPayload = {
    ...orderPayload,
    items: [{ ...orderPayload.items[0], quantity: 2 }],
  };
  const conflict = await request('/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify(conflictingPayload),
  });
  assert(
    conflict.response.status === 409,
    `Idempotency conflict: expected 409, received ${conflict.response.status}: ${JSON.stringify(conflict.body)}`,
  );
  console.log('OK  Invalid Idempotency-Key reuse rejected');

  console.log('Smoke test completed successfully');
}

main().catch((error) => {
  console.error(`ERROR  ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
