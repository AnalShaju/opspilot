/**
 * Maps PostgREST / Supabase failures to safe, actionable server errors.
 * Never includes connection strings or the service-role key.
 */

export class StorageError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "STORAGE_ERROR") {
    super(message);
    this.name = "StorageError";
    this.status = status;
    this.code = code;
  }
}

type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

export function throwStorageError(
  operation: string,
  error: SupabaseLikeError | null | undefined,
): never {
  const message = error?.message ?? "Unknown database error";
  const code = error?.code ?? "";
  const lower = message.toLowerCase();

  if (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound")
  ) {
    throw new StorageError(
      `Database connection failed while ${operation}`,
      503,
      "STORAGE_UNAVAILABLE",
    );
  }

  if (code === "22P02" || lower.includes("invalid input syntax for type uuid")) {
    throw new StorageError(
      `Invalid id while ${operation}`,
      400,
      "INVALID_ID",
    );
  }

  if (code === "23505" || lower.includes("duplicate key")) {
    throw new StorageError(
      `Duplicate record while ${operation}`,
      409,
      "STORAGE_CONFLICT",
    );
  }

  if (code === "23503" || lower.includes("foreign key")) {
    throw new StorageError(
      `Related record missing while ${operation}`,
      400,
      "STORAGE_CONSTRAINT",
    );
  }

  if (code === "23514" || lower.includes("check constraint")) {
    throw new StorageError(
      `Invalid data while ${operation}`,
      400,
      "STORAGE_CONSTRAINT",
    );
  }

  if (code === "PGRST116" || lower.includes("0 rows")) {
    throw new StorageError(
      `Record not found while ${operation}`,
      404,
      "STORAGE_NOT_FOUND",
    );
  }

  throw new StorageError(`Database ${operation} failed: ${message}`, 500);
}

export function requireRow<T>(
  operation: string,
  data: T | null,
  error: SupabaseLikeError | null,
): T {
  if (error) throwStorageError(operation, error);
  if (data == null) {
    throw new StorageError(
      `Record not found while ${operation}`,
      404,
      "STORAGE_NOT_FOUND",
    );
  }
  return data;
}
