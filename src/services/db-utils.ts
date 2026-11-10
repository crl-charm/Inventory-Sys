import { DatabaseUnavailableError, isDatabaseConnectionError } from "@/lib/errors";

/**
 * Shared DB plumbing for services: convert connection-level driver errors
 * into the friendly "start MySQL in XAMPP" error; rethrow everything else.
 */
export function wrapDbError(error: unknown): never {
  if (isDatabaseConnectionError(error)) throw new DatabaseUnavailableError(error);
  throw error;
}

/** mysql2 duplicate-key detection for a named unique index. */
export function isDuplicateKeyError(error: unknown, indexName: string): boolean {
  const errno = (error as { errno?: number }).errno;
  if (errno !== 1062) return false;
  const message = String((error as { sqlMessage?: string }).sqlMessage ?? "");
  return message.toLowerCase().includes(indexName.toLowerCase());
}
