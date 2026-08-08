#!/bin/sh
set -eu

awslocal sqs create-queue --queue-name order-events-dlq >/dev/null
DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/order-events-dlq --attribute-names QueueArn --query Attributes.QueueArn --output text)
awslocal sqs create-queue --queue-name order-events \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}" >/dev/null

awslocal sqs create-queue --queue-name inventory-reservations-dlq.fifo \
  --attributes '{"FifoQueue":"true"}' >/dev/null
RESERVATION_DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/inventory-reservations-dlq.fifo --attribute-names QueueArn --query Attributes.QueueArn --output text)
awslocal sqs create-queue --queue-name inventory-reservations.fifo \
  --attributes "{\"FifoQueue\":\"true\",\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${RESERVATION_DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}" >/dev/null

awslocal sqs create-queue --queue-name payment-requests-dlq >/dev/null
PAYMENT_DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/payment-requests-dlq --attribute-names QueueArn --query Attributes.QueueArn --output text)
awslocal sqs create-queue --queue-name payment-requests \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${PAYMENT_DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"5\\\"}\"}" >/dev/null
