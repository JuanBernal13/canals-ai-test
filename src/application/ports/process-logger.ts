export type ProcessLogFields = Record<string, string | number | boolean | undefined>;

export interface ProcessLogger {
  info(event: string, fields?: ProcessLogFields): void;
  error(event: string, fields?: ProcessLogFields): void;
}
