/**
 * Typed client for Dayflow's own API.
 *
 * Every route answers with either the payload or `{ error: { code, message, hint,
 * fields } }`. This unwraps that envelope into an `ApiError` so a form can show a
 * field-level message and a toast can show the headline, without each component
 * re-implementing the parsing.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly hint?: string;
  readonly fields?: Record<string, string>;

  constructor(
    status: number,
    body: { code?: string; message?: string; hint?: string; fields?: Record<string, string> },
  ) {
    super(body.message ?? "The request could not be completed.");
    this.name = "ApiError";
    this.status = status;
    this.code = body.code ?? "INTERNAL";
    this.hint = body.hint;
    this.fields = body.fields;
  }
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    // Network-level failure: no response at all.
    throw new ApiError(0, {
      code: "OFFLINE",
      message: "Dayflow could not reach the server.",
      hint: "Check that the dev server is still running, then try again.",
    });
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? safeParse(text) : null;

  if (!response.ok) {
    const envelope =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { error: Record<string, never> }).error
        : { message: response.statusText };
    throw new ApiError(response.status, envelope);
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  get: <T,>(url: string) => request<T>("GET", url),
  post: <T,>(url: string, body?: unknown) => request<T>("POST", url, body),
  patch: <T,>(url: string, body?: unknown) => request<T>("PATCH", url, body),
  put: <T,>(url: string, body?: unknown) => request<T>("PUT", url, body),
  del: <T,>(url: string, body?: unknown) => request<T>("DELETE", url, body),
};

/** Normalise any thrown value into something safe to display. */
export function describeError(error: unknown): {
  message: string;
  hint?: string;
  fields?: Record<string, string>;
} {
  if (error instanceof ApiError) {
    return { message: error.message, hint: error.hint, fields: error.fields };
  }
  if (error instanceof Error) return { message: error.message };
  return { message: "Something went wrong. Please try again." };
}

/** Build a query string, dropping empty values so URLs stay clean. */
export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
