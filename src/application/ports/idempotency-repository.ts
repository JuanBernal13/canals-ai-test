export type StoredResponse = { statusCode: number; body: Record<string, unknown> };
export type IdempotencyStart =
  | { kind: 'acquired' }
  | { kind: 'replay'; response: StoredResponse }
  | { kind: 'conflict' }
  | { kind: 'processing' };

export interface IdempotencyRepository {
  start(input: { key: string; customerId: string; fingerprint: string }): Promise<IdempotencyStart>;
  complete(key: string, response: StoredResponse): Promise<void>;
}
