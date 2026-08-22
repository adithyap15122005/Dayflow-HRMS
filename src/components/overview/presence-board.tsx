import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatInstantTime } from "@/lib/domain/time";
import { attendanceLabel, ATTENDANCE_TONE, hours } from "@/lib/format";
import type { AttendanceStatus } from "@/lib/domain/constants";

export type PresenceRow = {
  employeeId: string;
  employeeCode: string;
  name: string;
  jobTitle: string;
  department: string | null;
  avatarColor: string;
  status: AttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
};

const GROUP_ORDER: {
  key: string;
  label: string;
  description: string;
  match: (row: PresenceRow) => boolean;
}[] = [
  {
    key: "working",
    label: "Working now",
    description: "Checked in, day still open",
    match: (r) => Boolean(r.checkInAt) && !r.checkOutAt,
  },
  {
    key: "done",
    label: "Finished",
    description: "Checked out for the day",
    match: (r) => Boolean(r.checkOutAt),
  },
  {
    key: "leave",
    label: "On approved leave",
    description: "Balance already deducted",
    match: (r) => r.status === "LEAVE",
  },
  {
    key: "unaccounted",
    label: "Unaccounted",
    description: "No check-in and no approved leave",
    match: (r) => r.status === "ABSENT" && !r.checkInAt,
  },
];

/**
 * Today's presence board, grouped by what an HR user actually needs to know:
 * who is in, who has finished, who is legitimately away, and who is unexplained.
 */
export function PresenceBoard({
  rows,
  timezone,
  limitPerGroup = 6,
}: {
  rows: PresenceRow[];
  timezone: string;
  limitPerGroup?: number;
}) {
  const groups = GROUP_ORDER.map((group) => ({
    ...group,
    rows: rows.filter(group.match),
  })).filter((group) => group.rows.length > 0);

  if (groups.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-[0.8125rem] text-ink-3">
        No working-day activity recorded — today is a week off or public holiday for
        everyone.
      </p>
    );
  }

  return (
    <div className="divide-y divide-line">
      {groups.map((group) => (
        <section key={group.key} className="px-4 py-3.5 sm:px-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[0.8125rem] font-semibold text-ink">
              {group.label}
              <span className="ml-1.5 font-normal text-ink-3">{group.rows.length}</span>
            </h3>
            <p className="truncate text-[0.6875rem] text-ink-4">{group.description}</p>
          </div>

          <ul className="mt-2.5 space-y-1">
            {group.rows.slice(0, limitPerGroup).map((row) => (
              <li key={row.employeeId}>
                <Link
                  href={`/people/${row.employeeId}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
                >
                  <Avatar name={row.name} tone={row.avatarColor} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] font-medium text-ink">
                      {row.name}
                    </span>
                    <span className="block truncate text-[0.6875rem] text-ink-3">
                      {row.department ?? "Unassigned"}
                    </span>
                  </span>

                  {row.checkInAt ? (
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-[0.75rem] text-ink-2">
                        {formatInstantTime(row.checkInAt, timezone)}
                        {row.checkOutAt
                          ? ` – ${formatInstantTime(row.checkOutAt, timezone)}`
                          : ""}
                      </span>
                      <span
                        className={cn(
                          "block text-[0.625rem]",
                          row.lateMinutes > 0 ? "text-warning-ink" : "text-ink-4",
                        )}
                      >
                        {row.lateMinutes > 0
                          ? `${row.lateMinutes} min late`
                          : row.workedMinutes > 0
                            ? hours(row.workedMinutes)
                            : "on time"}
                      </span>
                    </span>
                  ) : (
                    <Badge tone={ATTENDANCE_TONE[row.status]} size="sm">
                      {attendanceLabel(row.status)}
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          {group.rows.length > limitPerGroup ? (
            <Link
              href="/attendance"
              className="mt-2 inline-block px-2 text-[0.75rem] font-medium text-brand hover:underline"
            >
              +{group.rows.length - limitPerGroup} more in attendance
            </Link>
          ) : null}
        </section>
      ))}
    </div>
  );
}
