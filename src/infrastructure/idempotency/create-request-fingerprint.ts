import { createHmac } from 'node:crypto';
import type { CreateOrderInput } from '../../domain/orders/order.types.js';
import type { RequestFingerprint } from '../../application/ports/request-fingerprint.js';
import { CRYPTO } from '../../shared/constants.js';

export class HmacRequestFingerprintAdapter implements RequestFingerprint {
  constructor(private readonly secret: string) {}

  create(input: CreateOrderInput): string {
    return createRequestFingerprint(input, this.secret);
  }
}

export function createRequestFingerprint(input: CreateOrderInput, secret: string): string {
  return createHmac(CRYPTO.HASH_ALGORITHM, secret).update(canonicalJson(input)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
