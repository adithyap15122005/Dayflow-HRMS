import Link from "next/link";
import { ArrowRight, CircleCheck, Info, TriangleAlert, Zap } from "lucide-react";

import { cn } from "@/lib/cn";
import type { AttentionFlag, AttentionSeverity } from "@/lib/domain/rules";

const SEVERITY: Record<
  AttentionSeverity,
  { label: string; chip: string; bar: string; icon: typeof Zap }
> = {
  CRITICAL: {
    label: "Act now",
    chip: "bg-danger-soft text-danger-ink",
    bar: "bg-danger",
    icon: TriangleAlert,
  },
  WARNING: {
    label: "Review",
    chip: "bg-warning-soft text-warning-ink",
    bar: "bg-warning",
    icon: Zap,
  },
  INFO: {
    label: "For info",
    chip: "bg-info-soft text-info-ink",
    bar: "bg-info",
    icon: Info,
  },
};

/**
 * The attention queue — Dayflow's signature screen.
 *
 * Each row is produced by a named rule in `buildAttentionQueue`, and the rule is
 * printed underneath the headline. Nothing is scored, weighted or predicted, so
 * an HR user can always answer "why is this here?" — which is what makes the
 * queue trustworthy enough to work from every morning.
 */
export function AttentionQueue({ flags }: { flags: AttentionFlag[] }) {
  if (flags.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <span className="grid size-11 place-items-center rounded-xl bg-success-soft">
          <CircleCheck className="size-5.5 text-success" />
        </span>
        <h3 className="mt-3.5 text-[0.9375rem] font-semibold">Nothing needs your attention</h3>
        <p className="mt-1.5 max-w-sm text-[0.8125rem] leading-relaxed text-ink-3">
          No aging approvals, no unclosed attendance, no payroll blockers. Dayflow
          re-checks every rule on each page load.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {flags.map((flag) => {
        const severity = SEVERITY[flag.severity];
        const Icon = severity.icon;
        return (
          <li key={flag.id} className="group relative">
            <Link
              href={flag.href}
              className="flex items-start gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:px-5"
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-y-0 left-0 w-0.5 opacity-0 transition-opacity group-hover:opacity-100",
                  severity.bar,
                )}
              />
              <span
                className={cn(
                  "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                  severity.chip,
                )}
              >
                <Icon className="size-4" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[0.875rem] font-semibold text-ink">{flag.title}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase",
                      severity.chip,
                    )}
                  >
                    {severity.label}
                  </span>
                </span>
                <span className="mt-1 block text-[0.8125rem] leading-snug text-ink-3">
                  {flag.because}
                </span>
                <span className="mt-1.5 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-brand">
                  {flag.action}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
