# Canals Order API

I built this service for the Canals backend assessment using Fastify, PostgreSQL/Prisma, and SQS through LocalStack.

## Architecture

```mermaid
graph LR
    client[Client] -->|POST orders| api[Fastify API]
    api -->|202 Accepted| client
    api -->|atomic write| db[Order and Outbox]
    db -->|ReservationRequested| inventoryQueue[Inventory FIFO queue]
    inventoryQueue --> reservation[Reservation worker]
    inventoryQueue -->|after 3 failed receives| inventoryDlq[Inventory FIFO DLQ]
    reservation -->|nearest complete warehouse| inventory[Inventory]
    reservation -->|PaymentRequested| paymentQueue[Payment queue]
    paymentQueue --> payment[Payment worker]
    paymentQueue -->|after 5 failed receives| paymentDlq[Payment DLQ]
    payment -->|creditCardNumber, amount, description| provider[Mock payment API]
    provider -->|approved| paid[OrderPaid event]
    provider -->|declined| failed[Payment failed and stock released]
    paid --> orderQueue[Order events queue]
    orderQueue --> fulfillment[Fulfillment worker]
    orderQueue -->|after 3 failed receives| orderDlq[Order events DLQ]
    fulfillment -->|READY_TO_FULFILL| db
```

I used hexagonal architecture for the project organization, separating the domain logic, application use cases, ports, and infrastructure adapters so business rules remain independent from frameworks and external services.

## Main decisions

- `POST /orders` is asynchronous and returns `202 PENDING_RESERVATION`.
- The outbox and PostgreSQL `SERIALIZABLE` transactions keep database state and events consistent.
- Inventory uses FIFO messages grouped by product set; payment and fulfillment use Standard queues.
- The nearest warehouse is selected only when it can fulfill the complete order.
- Idempotency keys prevent duplicate orders and charges; inbox records protect duplicate events.
- The payment mock receives exactly `creditCardNumber`, `amount` in minor currency units, and `description`.
- For this assessment, the original card number is stored temporarily. In production I would use provider tokenization or a PCI-scoped vault.

## Reliability behavior

- `202 Accepted` means the order was persisted and queued, not that payment and fulfillment have finished. Use `GET /orders/:id` to observe the final state.
- Repeating the same request with the same `Idempotency-Key` replays the original response. Reusing that key with a different body returns `409`.
- Inventory reservations run in `SERIALIZABLE` transactions with up to 8 retries, exponential backoff from 20 to 500 ms, and up to 50 ms of jitter.
- FIFO message groups are derived from the requested product set. Conflicting combinations remain ordered while unrelated combinations can run concurrently.
- After an ambiguous payment response, the worker queries the provider with the same idempotency key. Connection failures are protected by a circuit breaker, and expired pending payments are handled by reconciliation.
- Failed messages are left in SQS for retry and are moved automatically to a DLQ after the configured receive limit.

| Queue | Dead-letter queue | Receive limit |
| --- | --- | ---: |
| `inventory-reservations.fifo` | `inventory-reservations-dlq.fifo` | 3 |
| `payment-requests` | `payment-requests-dlq` | 5 |
| `order-events` | `order-events-dlq` | 3 |

## Order states

```mermaid
graph LR
    pendingReservation[PENDING_RESERVATION] -->|stock reserved| pendingPayment[PENDING_PAYMENT]
    pendingReservation -->|no warehouse or conflict| reservationFailed[RESERVATION_FAILED]
    pendingPayment -->|payment approved| paid[PAID]
    pendingPayment -->|payment declined| paymentFailed[PAYMENT_FAILED]
    paid -->|OrderPaid processed| ready[READY_TO_FULFILL]
```

## Run locally

```bash
docker compose up --build
npm run prepare:data
```

The API runs at `http://localhost:3000`.

Create an order:

```bash
curl -X POST http://localhost:3000/orders \
  -H "content-type: application/json" \
  -H "Idempotency-Key: demo-order-001" \
  -d '{
    "customerId":"00000000-0000-4000-8000-000000000001",
    "shippingAddress":{"line1":"Calle 1","city":"Bogota","region":"Bogota","postalCode":"110111","country":"CO"},
    "items":[{"productId":"00000000-0000-4000-8000-000000000101","quantity":2}],
    "payment":{"creditCardNumber":"4242424242424242"}
  }'
```

Then query the order with the returned ID:

```bash
curl http://localhost:3000/orders/ORDER_UUID
```

Swagger UI: `http://localhost:3000/docs/`  
Readiness: `http://localhost:3000/status`  
OpenAPI: `http://localhost:3000/openapi.json`

Cards ending in `0000` are declined by the local payment mock.

## Seed data

- One demo customer: `00000000-0000-4000-8000-000000000001`.
- Five products: backpack, bottle, headphones, mug, and keyboard.
- Seven warehouses: Bogota, Cali, New York, Chicago, Dallas, Los Angeles, and Miami.
- Every warehouse starts with 100 units of every product. The mock geocoder supports these destinations and additional predefined cities.

Run a concurrent bulk load:

```powershell
$env:BULK_REQUESTS='190'
$env:BULK_CONCURRENCY='190'
$env:BULK_TIMEOUT_MS='30000'
npm run test:bulk
```

## Verification

```bash
npm run test:api
npm run test:bulk
npm run typecheck
npm test
npm run build
npx prisma validate
```

Queue logs:

```powershell
docker compose logs -f localstack outbox-publisher reservation-worker payment-worker worker
```

The API uses `LOG_LEVEL=warn` by default. Queue logs remain controlled separately through `QUEUE_LOGGING`.

## Configuration

| Variable | Purpose | Local default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://canals:canals@localhost:5432/canals` |
| `DATABASE_POOL_MAX` | Connections per process | `20` |
| `TRANSACTION_ATTEMPTS` | Serializable retry limit | `8` |
| `PAYMENT_TIMEOUT_MS` | Payment HTTP timeout | `2000` |
| `IDEMPOTENCY_SECRET` | Request fingerprint secret | local development value |
| `LOG_LEVEL` | API log level | `warn` |
| `QUEUE_LOGGING` | Queue lifecycle logs | `true` |
| `SQS_ENDPOINT` | SQS or LocalStack endpoint | `http://localhost:4566` |

## Operations

Check containers and follow application logs:

```powershell
docker compose ps
docker compose logs -f api outbox-publisher reservation-worker payment-worker worker
```

Open PostgreSQL or list all queues:

```powershell
docker compose exec -T db psql -U canals -d canals
docker compose exec localstack awslocal sqs list-queues
```

Inspect DLQ counts:

```powershell
docker compose exec localstack awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/inventory-reservations-dlq.fifo --attribute-names ApproximateNumberOfMessages
docker compose exec localstack awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/payment-requests-dlq --attribute-names ApproximateNumberOfMessages
docker compose exec localstack awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/order-events-dlq --attribute-names ApproximateNumberOfMessages
```

Restart while preserving data:

```powershell
docker compose down
docker compose up -d --build
```

To deliberately delete the local database and rebuild from zero, use `docker compose down -v` before starting the stack again.

## Results

The automated suite passes 13 test files with 36 tests. I also verified the TypeScript build, Prisma schema, and bulk script syntax.

For five bulk runs with 190 requests, concurrency 190, and a 30-second timeout, every request returned `202` without network or server errors:

| Metric | Mean |
| --- | ---: |
| Throughput | 109.61 requests/s |
| Average latency | 1,649 ms |
| p50 latency | 1,686 ms |
| p95 latency | 1,742 ms |
| p99 latency | 1,749 ms |

These values are a local reference under that exact load, not a production capacity guarantee.

## Production notes

For production I would replace LocalStack and mocks with managed services, use card tokenization, store secrets in a secret manager, run migrations as a deployment step, and monitor queue age, DLQs, payment latency, database retries, and pending orders.

## Structure

```text
src/domain          Business rules
src/application     Use cases and ports
src/infrastructure  Prisma, SQS, geocoder, payment adapters
src/api             Fastify routes and schemas
src/processes       Worker composition and lifecycle
```
