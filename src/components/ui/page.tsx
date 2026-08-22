import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Standard page heading: title, one-line purpose, and the primary actions. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-3",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1.5 flex items-center gap-2 text-[0.75rem] font-medium text-ink-3">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-xl font-semibold sm:text-[1.375rem]">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[0.8125rem] leading-relaxed text-ink-3">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

/** Section heading inside a page, one level below PageHeader. */
export function SectionHeading({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[0.8125rem] text-ink-3">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-5", className)}>{children}</div>;
}

/** Filter/toolbar strip that sits above a table. */
export function Toolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Pagination footer. Renders nothing when there is only one page. */
export function Pagination({
  page,
  totalPages,
  total,
  perPage,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  hrefFor: (page: number) => string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2 px-4 py-3 sm:px-5">
      <p className="text-[0.8125rem] text-ink-3">
        Showing <span className="font-medium text-ink-2">{from}</span>–
        <span className="font-medium text-ink-2">{to}</span> of{" "}
        <span className="font-medium text-ink-2">{total}</span>
      </p>
      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <PageLink href={hrefFor(page - 1)} disabled={page <= 1} label="Previous">
            ‹
          </PageLink>
          {pageWindow(page, totalPages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="px-1.5 text-ink-4">
                …
              </span>
            ) : (
              <PageLink key={p} href={hrefFor(p)} current={p === page} label={`Page ${p}`}>
                {p}
              </PageLink>
            ),
          )}
          <PageLink href={hrefFor(page + 1)} disabled={page >= totalPages} label="Next">
            ›
          </PageLink>
        </nav>
      ) : null}
    </div>
  );
}

function PageLink({
  href,
  children,
  current,
  disabled,
  label,
}: {
  href: string;
  children: ReactNode;
  current?: boolean;
  disabled?: boolean;
  label: string;
}) {
  const base =
    "grid h-8 min-w-8 place-items-center rounded-md px-2 text-[0.8125rem] font-medium transition-colors";
  if (disabled) {
    return (
      <span aria-disabled className={cn(base, "text-ink-4")}>
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={cn(
        base,
        current
          ? "bg-brand text-white"
          : "border border-line-2 bg-surface text-ink-2 hover:border-line-strong hover:bg-surface-2",
      )}
    >
      {children}
    </a>
  );
}

/** Compact page list: 1 … 4 5 6 … 20 */
function pageWindow(page: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, page, page - 1, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (previous && p - previous > 1) out.push(null);
    out.push(p);
    previous = p;
  }
  return out;
}
