export type OutboxEvent = { id: string; type: string; payload: unknown; attempts: number };

export interface OutboxRepository {
  claimPending(limit: number, workerId: string): Promise<OutboxEvent[]>;
  markPublished(id: string, workerId: string): Promise<void>;
  markFailed(id: string, workerId: string, attempts: number): Promise<void>;
}
