import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ loading */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

/** Placeholder that matches the shape of a stat tile row. */
export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-4 shadow-e1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-3 h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder rows for a table body. */
export function TableSkeleton({
  rows = 6,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="divide-y divide-line" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          {Array.from({ length: columns - 1 }).map((__, c) => (
            <Skeleton
              key={c}
              className={cn("h-3.5", c === 0 ? "w-40" : c % 2 ? "w-20" : "w-24")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface p-5 shadow-e1", className)}>
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-2 h-3 w-52" />
      <Skeleton className="mt-5 h-40 w-full" />
    </div>
  );
}

/** Full-page loading shell used by route-level `loading.tsx` files. */
export function PageSkeleton() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="h-6 w-52" />
        <Skeleton className="mt-2 h-3.5 w-72" />
      </div>
      <StatSkeleton />
      <div className="grid gap-5 xl:grid-cols-3">
        <CardSkeleton className="xl:col-span-2" />
        <CardSkeleton />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- empty */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  /** Teach the user what to do next — never just "No data". */
  description: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
        className,
      )}
    >
      {icon ? (
        <span className="mb-3.5 grid size-11 place-items-center rounded-xl border border-line bg-surface-3 text-ink-3">
          {icon}
        </span>
      ) : null}
      <h3 className="text-[0.9375rem] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[0.8125rem] leading-relaxed text-ink-3">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------- error */

export function ErrorState({
  title = "Something needs attention",
  description,
  hint,
  action,
  compact = false,
}: {
  title?: string;
  description: string;
  hint?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-4 py-8" : "px-6 py-12",
      )}
    >
      <span className="mb-3.5 grid size-11 place-items-center rounded-xl border border-danger/20 bg-danger-soft">
        <svg aria-hidden viewBox="0 0 20 20" className="size-5 fill-danger">
          <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3.4a.9.9 0 0 1 .9.9v4a.9.9 0 0 1-1.8 0v-4a.9.9 0 0 1 .9-.9Zm0 7a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
        </svg>
      </span>
      <h3 className="text-[0.9375rem] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-[0.8125rem] leading-relaxed text-ink-2">
        {description}
      </p>
      {hint ? <p className="mt-1 max-w-md text-[0.75rem] text-ink-3">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Inline notice for a partial failure inside an otherwise working page. */
export function InlineWarning({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-[0.8125rem] text-warning-ink">
      <svg aria-hidden viewBox="0 0 16 16" className="mt-0.5 size-3.5 shrink-0 fill-current">
        <path d="M8 1.5 15 14H1L8 1.5Zm0 4.25a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0V6.5A.75.75 0 0 0 8 5.75Zm0 5a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z" />
      </svg>
      <span>{children}</span>
    </p>
  );
}
