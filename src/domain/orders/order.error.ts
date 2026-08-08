export class OrderError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'OrderError';
  }
}
