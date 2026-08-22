import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/format";

/**
 * Badge rules: soft background + darker ink of the same hue, never a saturated
 * fill, so a table of twenty badges stays calm. A leading dot carries the status
 * meaning for anyone who cannot rely on colour alone.
 */
const TONES: Record<Tone, { chip: string; dot: string }> = {
  brand: { chip: "bg-brand-soft text-brand-ink", dot: "bg-brand" },
  success: { chip: "bg-success-soft text-success-ink", dot: "bg-success" },
  warning: { chip: "bg-warning-soft text-warning-ink", dot: "bg-warning" },
  danger: { chip: "bg-danger-soft text-danger-ink", dot: "bg-danger" },
  info: { chip: "bg-info-soft text-info-ink", dot: "bg-info" },
  neutral: { chip: "bg-neutral-soft text-neutral-ink", dot: "bg-ink-4" },
};

export function Badge({
  children,
  tone = "neutral",
  dot = false,
  live = false,
  className,
  size = "md",
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  /** Adds a pulsing ring — only for genuinely live state. */
  live?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[0.6875rem]" : "px-2.5 py-1 text-xs",
        t.chip,
        className,
      )}
    >
      {dot ? (
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            t.dot,
            live && "animate-live",
          )}
        />
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Small monospace identifier chip, e.g. an employee code. */
export function CodeChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-line bg-surface-3 px-1.5 py-0.5 font-mono text-[0.6875rem] text-ink-3">
      {children}
    </span>
  );
}

/** Numeric count pill used on nav items and tabs. */
export function CountPill({
  value,
  tone = "neutral",
}: {
  value: number;
  tone?: Tone;
}) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold",
        TONES[tone].chip,
      )}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}
