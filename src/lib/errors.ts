/**
 * One error type for the whole application.
 *
 * Every failure that a user could plausibly cause is expressed as an `AppError`
 * with a stable machine `code`, an HTTP status, and a message that is safe *and*
 * useful to show in the UI. Anything that is not an `AppError` is treated as an
 * internal fault: it is logged server-side and reported generically.
 */

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INVALID_STATE"
  | "INTERNAL";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INVALID_STATE: 409,
  INTERNAL: 500,
};

export type FieldErrors = Record<string, string>;

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  /** Per-field messages, for form rendering. */
  readonly fields?: FieldErrors;
  /** Short actionable next step shown under the message. */
  readonly hint?: string;

  constructor(
    code: AppErrorCode,
    message: string,
    options: { fields?: FieldErrors; hint?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.fields = options.fields;
    this.hint = options.hint;
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

/* --------------------------------------------------------------- shortcuts */

export const unauthenticated = (
  message = "Your session has expired. Please sign in again.",
) => new AppError("UNAUTHENTICATED", message);

export const forbidden = (
  message = "You do not have permission to perform this action.",
  hint?: string,
) => new AppError("FORBIDDEN", message, { hint });

export const notFound = (what = "Record") =>
  new AppError("NOT_FOUND", `${what} could not be found.`);

export const validation = (message: string, fields?: FieldErrors, hint?: string) =>
  new AppError("VALIDATION", message, { fields, hint });

export const conflict = (message: string, hint?: string) =>
  new AppError("CONFLICT", message, { hint });

export const invalidState = (message: string, hint?: string) =>
  new AppError("INVALID_STATE", message, { hint });
