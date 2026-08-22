import Link from "next/link";

import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/domain/time";
import { AUDIT_LABEL, AUDIT_TONE, type Tone } from "@/lib/format";
import { EmptyState } from "@/components/ui/states";
import { Activity } from "lucide-react";

const DOT: Record<Tone, string> = {
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-ink-4",
};

export type ActivityItem = {
  id: string;
  action: string;
  actorName: string;
  summary: string;
  createdAt: string;
  employeeId?: string | null;
};

/**
 * Activity feed.
 *
 * Every row is a row of the AuditEvent table written by a service when something
 * actually happened — check-ins, decisions, salary revisions, payroll runs. There
 * is no synthetic filler here, which is why the feed doubles as an audit trail.
 */
export function ActivityFeed({
  items,
  showActor = true,
  linkPeople = false,
}: {
  items: ActivityItem[];
  showActor?: boolean;
  linkPeople?: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Activity className="size-5" />}
        title="No activity yet"
        description="Check-ins, leave decisions and payroll runs are recorded here as they happen."
        compact
      />
    );
  }

  return (
    <ol className="relative px-4 py-3.5 sm:px-5">
      <span
        aria-hidden
        className="absolute top-5 bottom-5 left-[1.4375rem] w-px bg-line sm:left-[1.6875rem]"
      />
      {items.map((item) => {
        const tone = AUDIT_TONE[item.action] ?? "neutral";
        const body = (
          <>
            <span className="block text-[0.8125rem] leading-snug text-ink">
              {item.summary}
            </span>
            <span className="mt-0.5 block text-[0.6875rem] text-ink-4">
              {showActor ? `${item.actorName} · ` : ""}
              {AUDIT_LABEL[item.action] ?? item.action} ·{" "}
              {formatRelative(item.createdAt)}
            </span>
          </>
        );
        return (
          <li key={item.id} className="relative flex gap-3 py-2">
            <span
              aria-hidden
              className={cn(
                "z-1 mt-1.5 size-2 shrink-0 rounded-full ring-3 ring-surface",
                DOT[tone],
              )}
            />
            <div className="min-w-0 flex-1">
              {linkPeople && item.employeeId ? (
                <Link
                  href={`/people/${item.employeeId}`}
                  className="block rounded transition-colors hover:text-brand"
                >
                  {body}
                </Link>
              ) : (
                body
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
