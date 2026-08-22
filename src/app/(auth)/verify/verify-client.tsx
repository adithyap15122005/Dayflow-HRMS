"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { api, ApiError } from "@/lib/client/api";

type State =
  | { status: "verifying" }
  | { status: "done"; email: string; alreadyVerified: boolean }
  | { status: "failed"; message: string; hint?: string };

export function VerifyClient({ token }: { token: string | null }) {
  const [state, setState] = useState<State>(
    token ? { status: "verifying" } : {
      status: "failed",
      message: "This link is missing its verification token.",
      hint: "Open the exact link generated during sign-up.",
    },
  );
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    void api
      .post<{ email: string; alreadyVerified: boolean }>("/api/auth/verify", { token })
      .then((result) =>
        setState({
          status: "done",
          email: result.email,
          alreadyVerified: result.alreadyVerified,
        }),
      )
      .catch((error) =>
        setState({
          status: "failed",
          message:
            error instanceof ApiError ? error.message : "Verification could not complete.",
          hint: error instanceof ApiError ? error.hint : undefined,
        }),
      );
  }, [token]);

  if (state.status === "verifying") {
    return (
      <div className="animate-fade-in">
        <span className="grid size-11 place-items-center rounded-xl bg-brand-soft">
          <span className="size-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </span>
        <h1 className="mt-4 text-[1.5rem] font-semibold tracking-tight">
          Verifying your email
        </h1>
        <p className="mt-2 text-sm text-ink-3">This only takes a moment.</p>
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div className="animate-rise">
        <span className="grid size-11 place-items-center rounded-xl bg-danger-soft">
          <svg aria-hidden viewBox="0 0 20 20" className="size-5 fill-danger">
            <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3.4a.9.9 0 0 1 .9.9v4a.9.9 0 0 1-1.8 0v-4a.9.9 0 0 1 .9-.9Zm0 7a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
          </svg>
        </span>
        <h1 className="mt-4 text-[1.5rem] font-semibold tracking-tight">
          Verification failed
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{state.message}</p>
        {state.hint ? <p className="mt-1 text-[0.8125rem] text-ink-3">{state.hint}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/sign-in"
            className="inline-flex h-11 items-center rounded-md bg-brand px-5 text-[0.9375rem] font-medium text-white shadow-e1 transition-colors hover:bg-brand-hover"
          >
            Go to sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-11 items-center rounded-md border border-line-2 bg-surface px-5 text-[0.9375rem] font-medium text-ink shadow-e1 transition-colors hover:bg-surface-2"
          >
            Register again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <span className="grid size-11 place-items-center rounded-xl bg-success-soft">
        <svg aria-hidden viewBox="0 0 20 20" className="size-5 fill-success">
          <path d="M10 1.7a8.3 8.3 0 1 0 0 16.6 8.3 8.3 0 0 0 0-16.6Zm4 6.3-4.9 4.9a1 1 0 0 1-1.4 0L5.9 11.1A1 1 0 1 1 7.3 9.7l1.1 1.1L12.6 6.6A1 1 0 0 1 14 8Z" />
        </svg>
      </span>
      <h1 className="mt-4 text-[1.5rem] font-semibold tracking-tight">
        {state.alreadyVerified ? "Already verified" : "Email verified"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        <span className="font-medium text-ink">{state.email}</span>{" "}
        {state.alreadyVerified
          ? "was verified earlier, so you can sign in straight away."
          : "is confirmed. You can sign in now."}
      </p>
      <Link
        href="/sign-in"
        className="mt-5 inline-flex h-11 items-center rounded-md bg-brand px-5 text-[0.9375rem] font-medium text-white shadow-e1 transition-colors hover:bg-brand-hover"
      >
        Continue to sign in
      </Link>
    </div>
  );
}
