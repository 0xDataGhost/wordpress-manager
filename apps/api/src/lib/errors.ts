/** Stable, machine-readable error codes returned in the API error envelope. */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

interface AppErrorOptions {
  statusCode?: number;
  code?: ErrorCode;
  details?: unknown;
  /** Operational errors are expected (e.g. bad input); non-operational are bugs. */
  isOperational?: boolean;
  cause?: unknown;
}

/** Base class for all known/handled application errors. */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;
    Error.captureStackTrace(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super(message, { statusCode: 400, code: "VALIDATION_ERROR", details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, { statusCode: 401, code: "UNAUTHORIZED" });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, { statusCode: 403, code: "FORBIDDEN" });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, { statusCode: 404, code: "NOT_FOUND" });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict", details?: unknown) {
    super(message, { statusCode: 409, code: "CONFLICT", details });
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please try again later.", details?: unknown) {
    super(message, { statusCode: 429, code: "RATE_LIMITED", details });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service temporarily unavailable", details?: unknown) {
    super(message, { statusCode: 503, code: "SERVICE_UNAVAILABLE", details });
  }
}
