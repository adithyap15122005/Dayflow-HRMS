import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AppError, isAppError, type FieldErrors } from "./errors";

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    hint?: string;
    fields?: FieldErrors;
  };
};

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { status: 200, ...init });
}

export function jsonCreated<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

function zodToFields(error: ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/**
 * Convert anything thrown inside a route handler into a safe response.
 *
 * `AppError`s carry a user-facing message; everything else is logged with its
 * stack and reported as a generic 500 so internals never leak to the client.
 */
export function toErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ZodError) {
    const fields = zodToFields(error);
    const first = Object.values(fields)[0] ?? "Check the highlighted fields.";
    return NextResponse.json(
      { error: { code: "VALIDATION", message: first, fields } },
      { status: 422 },
    );
  }

  if (isAppError(error)) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.hint ? { hint: error.hint } : {}),
          ...(error.fields ? { fields: error.fields } : {}),
        },
      },
      { status: error.status },
    );
  }

  console.error("[dayflow] unhandled route error:", error);
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL",
        message: "Dayflow could not complete that request.",
        hint: "Try again in a moment. If it keeps happening, check the server logs.",
      },
    },
    { status: 500 },
  );
}

/** Wrap a route handler so every throw becomes a structured response. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse> | NextResponse,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/* ------------------------------------------------------------ rate limiting */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Fixed-window limiter, in process memory.
 *
 * Enough to blunt credential stuffing against a single-node deployment; a real
 * multi-instance deployment would move this to Redis. Documented in the README.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

export function enforceRateLimit(key: string, limit: number, windowMs: number): void {
  const result = rateLimit(key, limit, windowMs);
  if (!result.ok) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many attempts. Please wait before trying again.",
      { hint: `Try again in ${result.retryAfterSeconds} seconds.` },
    );
  }
}

/** Best-effort client identity for rate limiting. */
export function clientKey(request: Request, suffix: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "local";
  return `${suffix}:${ip}`;
}

/** Parse a JSON body, converting malformed payloads into a clean 422. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("VALIDATION", "The request body was not valid JSON.");
  }
}
