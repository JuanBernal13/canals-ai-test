export type DependencyChecks = {
  database: () => Promise<void>;
  payments: () => Promise<void>;
  queue: () => Promise<void>;
};
