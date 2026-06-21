import type { ErrorCode } from "./errors";

export interface SuccessResponse<T> {
  success: true;
  data: T;
  message: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode | string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

export function successResponse<T>(
  data: T,
  message = "",
): SuccessResponse<T> {
  return { success: true, data, message };
}

export function errorResponse(
  code: ErrorCode | string,
  message: string,
  details?: unknown,
): ErrorResponse {
  return {
    success: false,
    error: details === undefined ? { code, message } : { code, message, details },
  };
}
