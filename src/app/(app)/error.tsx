"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Route-level error boundary.
 *
 * Server code throws `AppError`s with user-facing messages, but a boundary only
 * receives a digest in production. So this explains what happened at the level we
 * can honestly guarantee, and always offers a way forward.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dayflow] route error:", error);
  }, [error]);

  const isPermission = /permission|not allowed|limited to/i.test(error.message);

  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-xl border border-danger/20 bg-danger-soft">
        <svg aria-hidden viewBox="0 0 20 20" className="size-6 fill-danger">
          <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3.4a.9.9 0 0 1 .9.9v4a.9.9 0 0 1-1.8 0v-4a.9.9 0 0 1 .9-.9Zm0 7a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
        </svg>
      </span>
      <h1 className="mt-4 text-lg font-semibold">
        {isPermission ? "You do not have access to this" : "This screen could not load"}
      </h1>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-2">
        {isPermission
          ? "Your role does not include this area. Head back to your overview to see the records you own."
          : "Dayflow hit an unexpected error while preparing this page. Nothing was changed."}
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[0.6875rem] text-ink-4">
          Reference {error.digest}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" onClick={reset}>
          <RotateCcw className="size-4" />
          Try again
        </Button>
        <Link
          href="/overview"
          className="inline-flex h-9.5 items-center rounded-md border border-line-2 bg-surface px-3.5 text-sm font-medium text-ink shadow-e1 transition-colors hover:bg-surface-2"
        >
          Back to overview
        </Link>
      </div>
    </Card>
  );
}
