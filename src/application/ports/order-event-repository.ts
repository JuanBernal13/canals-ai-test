export interface OrderEventRepository {
  markReadyFromEvent(eventId: string, orderId: string): Promise<void>;
}
