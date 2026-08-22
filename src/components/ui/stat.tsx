import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/format";

const VALUE_TONE: Record<Tone, string> = {
  brand: "text-brand-ink",
  success: "text-success-ink",
  warning: "text-warning-ink",
  danger: "text-danger-ink",
  info: "text-info-ink",
  neutral: "text-ink",
};

const ICON_TONE: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand-ink",
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
  info: "bg-info-soft text-info-ink",
  neutral: "bg-surface-3 text-ink-3",
};

/**
 * The single stat tile used everywhere.
 *
 * `caption` is mandatory in practice: a number without the rule behind it is a
 * vanity metric, so each tile explains what it counts.
 */
export function Stat({
  label,
  value,
  caption,
  icon,
  tone = "neutral",
  href,
  className,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  href?: string;
  className?: string;
  emphasis?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.75rem] font-medium text-ink-3">{label}</p>
        {icon ? (
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-lg",
              ICON_TONE[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-2 font-semibold tracking-tight",
          emphasis ? "text-[1.75rem] leading-8" : "text-2xl leading-7",
          VALUE_TONE[tone],
        )}
      >
        {value}
      </p>
      {caption ? (
        <p className="mt-1.5 text-[0.75rem] leading-snug text-ink-3">{caption}</p>
      ) : null}
    </>
  );

  const shell = cn(
    "block rounded-xl border border-line bg-surface p-4 shadow-e1",
    href && "transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-e2",
    className,
  );

  return href ? (
    <Link href={href} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

export function StatRow({
  children,
  columns = 4,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4 | 5;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-2 lg:grid-cols-4",
        columns === 5 && "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Compact label/value pair for inside cards. */
export function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <p className="truncate text-[0.6875rem] font-medium tracking-wide text-ink-4 uppercase">
        {label}
      </p>
      <p className={cn("mt-0.5 text-base font-semibold", VALUE_TONE[tone])}>{value}</p>
    </div>
  );
}

/** Horizontal meter used for leave balances and utilisation. */
export function Meter({
  value,
  max,
  tone = "brand",
  label,
  className,
}: {
  value: number;
  max: number;
  tone?: Tone;
  label?: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const fill: Record<Tone, string> = {
    brand: "bg-brand",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
    neutral: "bg-ink-4",
  };
  return (
    <div
      role="meter"
      aria-valuenow={Math.round(value * 10) / 10}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", fill[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Delta indicator that only renders when there is a real comparison. */
export function Trend({
  value,
  suffix = "",
  invert = false,
}: {
  value: number;
  suffix?: string;
  invert?: boolean;
}) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.05) {
    return <span className="text-[0.75rem] text-ink-4">no change</span>;
  }
  const up = value > 0;
  const good = invert ? !up : up;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[0.75rem] font-medium",
        good ? "text-success-ink" : "text-danger-ink",
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className={cn("size-3 fill-current", !up && "rotate-180")}
      >
        <path d="M6 2 10 8H2L6 2Z" />
      </svg>
      {Math.abs(Math.round(value * 10) / 10)}
      {suffix}
    </span>
  );
}
