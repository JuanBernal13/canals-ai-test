import { randomUUID } from 'node:crypto';

const baseUrl = (process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const totalRequests = parsePositiveInteger(process.env.BULK_REQUESTS ?? '190', 'BULK_REQUESTS');
const concurrency = Math.min(
  parsePositiveInteger(process.env.BULK_CONCURRENCY ?? String(totalRequests), 'BULK_CONCURRENCY'),
  totalRequests,
);
const requestTimeoutMs = parsePositiveInteger(
  process.env.BULK_TIMEOUT_MS ?? '30000',
  'BULK_TIMEOUT_MS',
);
const declineEvery = parseNonNegativeInteger(
  process.env.BULK_DECLINE_EVERY ?? '20',
  'BULK_DECLINE_EVERY',
);

const products = [
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000104',
  '00000000-0000-4000-8000-000000000105',
];

const destinations = [
  { city: 'Bogota', region: 'Bogota', postalCode: '110111', country: 'CO' },
  { city: 'Cali', region: 'Valle del Cauca', postalCode: '760001', country: 'CO' },
  { city: 'Medellin', region: 'Antioquia', postalCode: '050001', country: 'CO' },
  { city: 'New York', region: 'New York', postalCode: '10001', country: 'US' },
  { city: 'Chicago', region: 'Illinois', postalCode: '60601', country: 'US' },
  { city: 'Dallas', region: 'Texas', postalCode: '75201', country: 'US' },
  { city: 'Miami', region: 'Florida', postalCode: '33101', country: 'US' },
];

function parsePositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseNonNegativeInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function percentile(sortedValues, percentage) {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((percentage / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

function buildItems(index) {
  switch (index % 8) {
    case 0:
      return [{ productId: products[0], quantity: 1 }];
    case 1:
      return [{ productId: products[1], quantity: 2 }];
    case 2:
      return [{ productId: products[2], quantity: 1 }];
    case 3:
      return [
        { productId: products[3], quantity: 1 },
        { productId: products[4], quantity: 1 },
      ];
    case 4:
      return [
        { productId: products[0], quantity: 2 },
        { productId: products[1], quantity: 1 },
      ];
    case 5:
      return [
        { productId: products[0], quantity: 1 },
        { productId: products[2], quantity: 2 },
        { productId: products[3], quantity: 1 },
      ];
    case 6:
      return [
        { productId: products[1], quantity: 1 },
        { productId: products[3], quantity: 2 },
        { productId: products[4], quantity: 1 },
      ];
    default:
      return products.slice(0, 4).map((productId) => ({ productId, quantity: 1 }));
  }
}

function buildOrderPayload(index) {
  const destination = destinations[index % destinations.length];
  const declined = declineEvery > 0 && index % declineEvery === 0;
  return {
    customerId: '00000000-0000-4000-8000-000000000001',
    shippingAddress: {
      line1: `Bulk Avenue ${index}`,
      ...destination,
    },
    items: buildItems(index),
    payment: { creditCardNumber: `424242424242${declined ? '0000' : '4242'}` },
  };
}

async function waitUntilReady() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/status`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`The API was not ready at ${baseUrl} after 30 seconds`);
}

async function createOrder(index) {
  const payload = buildOrderPayload(index);
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `bulk-${index}-${randomUUID()}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const text = await response.text();
    return {
      status: String(response.status),
      durationMs: performance.now() - startedAt,
      body: text,
      lineCount: payload.items.length,
      totalUnits: payload.items.reduce((total, item) => total + item.quantity, 0),
    };
  } catch (error) {
    return {
      status: 'NETWORK_ERROR',
      durationMs: performance.now() - startedAt,
      body: error instanceof Error ? error.message : String(error),
      lineCount: payload.items.length,
      totalUnits: payload.items.reduce((total, item) => total + item.quantity, 0),
    };
  }
}

async function runWorkers() {
  const results = new Array(totalRequests);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= totalRequests) return;
      results[index] = await createOrder(index + 1);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function main() {
  console.log(`Bulk order submission test against ${baseUrl}`);
  console.log(
    `Requests: ${totalRequests}, concurrency: ${concurrency}, timeout: ${requestTimeoutMs} ms`,
  );
  console.log(
    `Variety: ${products.length} products, ${destinations.length} destinations, decline every ${declineEvery || 'never'} request(s)`,
  );
  await waitUntilReady();

  const startedAt = performance.now();
  const results = await runWorkers();
  const elapsedMs = performance.now() - startedAt;
  const measuredResults = results.filter(
    (result) => result.status !== 'NETWORK_ERROR' && Number(result.status) < 500,
  );
  const durations = measuredResults
    .map((result) => result.durationMs)
    .sort((a, b) => a - b);
  const averageLatency =
    durations.length === 0
      ? 0
      : durations.reduce((total, duration) => total + duration, 0) / durations.length;
  const statusCounts = results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    return counts;
  }, {});
  const generatedLines = results.reduce((total, result) => total + result.lineCount, 0);
  const generatedUnits = results.reduce((total, result) => total + result.totalUnits, 0);

  console.log('\nGenerated data');
  console.log(`  Product lines: ${generatedLines}`);
  console.log(`  Requested units: ${generatedUnits}`);
  console.log('\nResults');
  for (const [status, count] of Object.entries(statusCounts).sort()) {
    console.log(`  ${status}: ${count}`);
  }
  console.log(`  Elapsed: ${(elapsedMs / 1_000).toFixed(2)} s`);
  console.log(`  Throughput: ${(totalRequests / (elapsedMs / 1_000)).toFixed(2)} req/s`);
  console.log(`  Measured responses: ${durations.length}`);
  console.log(`  Average latency: ${averageLatency.toFixed(0)} ms`);
  console.log(`  Latency p50: ${percentile(durations, 50).toFixed(0)} ms`);
  console.log(`  Latency p95: ${percentile(durations, 95).toFixed(0)} ms`);
  console.log(`  Latency p99: ${percentile(durations, 99).toFixed(0)} ms`);

  const failures = results.filter(
    (result) => result.status === 'NETWORK_ERROR' || Number(result.status) >= 500,
  );
  if (failures.length > 0) {
    const examples = failures.slice(0, 3);
    for (const failure of examples) {
      console.error(`  Failure ${failure.status}: ${failure.body}`);
    }
    throw new Error(`${failures.length} request(s) failed with network or server errors`);
  }

  console.log('Bulk submission test completed without network or server errors');
}

main().catch((error) => {
  console.error(`ERROR  ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
