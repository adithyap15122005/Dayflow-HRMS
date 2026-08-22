import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Card rules
 *  - one elevation level (e1) for content, e2 reserved for hover/interactive
 *  - 1px line border always, so cards read as structure rather than decoration
 *  - padding is p-4 on mobile, p-5 from sm up; headers own their own divider
 */
export function Card({
  className,
  children,
  as = "section",
  ...rest
}: ComponentProps<"section"> & { as?: "section" | "div" | "article" }) {
  const As = as as "section";
  return (
    <As
      {...rest}
      className={cn("rounded-xl border border-line bg-surface shadow-e1", className)}
    >
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
  dense,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-line",
        dense ? "px-4 py-3" : "px-4 py-3.5 sm:px-5 sm:py-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-[0.9375rem] font-semibold">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-3">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export function CardBody({
  className,
  children,
  padded = true,
}: {
  className?: string;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <div className={cn(padded && "p-4 sm:p-5", className)}>{children}</div>
  );
}

export function CardFooter({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <footer
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2 px-4 py-3 sm:px-5",
        "rounded-b-xl",
        className,
      )}
    >
      {children}
    </footer>
  );
}

/** A labelled block of key/value detail, used across profile and payslip views. */
export function DetailList({
  items,
  columns = 2,
  className,
}: {
  items: { label: string; value: ReactNode; span?: boolean }[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className={cn("min-w-0", item.span && "sm:col-span-full")}>
          <dt className="text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-4">
            {item.label}
          </dt>
          <dd className="mt-1 break-words text-sm text-ink">{item.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
