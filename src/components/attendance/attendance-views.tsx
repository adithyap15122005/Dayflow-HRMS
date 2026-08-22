import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatInstantTime, formatWorkDate, weekdayOf } from "@/lib/domain/time";
import { attendanceLabel, ATTENDANCE_TONE, hours } from "@/lib/format";
import type { AttendanceStatus } from "@/lib/domain/constants";

export type AttendanceDayView = {
  workDate: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  note: string | null;
  derived: boolean;
};

const CELL_TONE: Record<string, string> = {
  PRESENT: "bg-chart-present/12 text-brand-ink border-chart-present/25",
  HALF_DAY: "bg-warning-soft text-warning-ink border-warning/25",
  ABSENT: "bg-danger-soft text-danger-ink border-danger/25",
  LEAVE: "bg-info-soft text-info-ink border-info/25",
  WEEK_OFF: "bg-surface-3 text-ink-4 border-line",
  HOLIDAY: "bg-tone-violet/10 text-tone-violet border-tone-violet/25",
};

const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Month calendar.
 *
 * The grid is the fastest way to read a month: colour carries the status, the
 * corner marker flags a late arrival, and hovering gives the exact times. Days in
 * the future are rendered as neutral rather than as absences.
 */
export function AttendanceCalendar({
  days,
  timezone,
  today,
  monthLabel,
}: {
  days: AttendanceDayView[];
  timezone: string;
  today: string;
  monthLabel: string;
}) {
  if (days.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-[0.8125rem] text-ink-3">
        No days in this range.
      </p>
    );
  }

  // Monday-first grid: pad the first week so weekday columns line up.
  const firstWeekday = weekdayOf(days[0].workDate);
  const leadingBlanks = (firstWeekday + 6) % 7;

  return (
    <div className="p-4 sm:p-5">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="text-[0.8125rem] font-semibold text-ink">{monthLabel}</p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-ink-3">
          {(["PRESENT", "HALF_DAY", "LEAVE", "ABSENT", "WEEK_OFF"] as const).map((status) => (
            <li key={status} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn("size-2 rounded-sm border", CELL_TONE[status])}
              />
              {attendanceLabel(status)}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEK_LABELS.map((label) => (
          <div
            key={label}
            className="pb-1 text-center text-[0.625rem] font-semibold tracking-wide text-ink-4 uppercase"
          >
            {label}
          </div>
        ))}

        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} aria-hidden />
        ))}

        {days.map((day) => {
          const isToday = day.workDate === today;
          const isFuture = day.workDate > today;
          const tone = isFuture ? CELL_TONE.WEEK_OFF : (CELL_TONE[day.status] ?? CELL_TONE.WEEK_OFF);
          const title = [
            formatWorkDate(day.workDate, "long"),
            isFuture ? "Upcoming" : attendanceLabel(day.status),
            day.checkInAt
              ? `${formatInstantTime(day.checkInAt, timezone)}–${formatInstantTime(day.checkOutAt, timezone)}`
              : null,
            day.workedMinutes > 0 ? hours(day.workedMinutes) : null,
            day.lateMinutes > 0 ? `${day.lateMinutes} min late` : null,
            day.note,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <div
              key={day.workDate}
              title={title}
              className={cn(
                "relative aspect-square rounded-md border p-1 sm:p-1.5",
                tone,
                isToday && "ring-2 ring-brand ring-offset-1",
                isFuture && "opacity-45",
              )}
            >
              <span className="text-[0.6875rem] font-semibold">
                {Number(day.workDate.slice(8))}
              </span>
              {!isFuture && day.workedMinutes > 0 ? (
                <span className="absolute bottom-1 left-1 hidden text-[0.5625rem] font-medium tabular-nums opacity-80 sm:block">
                  {(day.workedMinutes / 60).toFixed(1)}h
                </span>
              ) : null}
              {day.lateMinutes > 0 ? (
                <span
                  aria-hidden
                  title={`${day.lateMinutes} minutes late`}
                  className="absolute top-1 right-1 size-1.5 rounded-full bg-warning"
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Chronological list — better than the grid for scanning exact times. */
export function AttendanceTimeline({
  days,
  timezone,
  today,
  limit = 40,
}: {
  days: AttendanceDayView[];
  timezone: string;
  today: string;
  limit?: number;
}) {
  const rows = [...days]
    .filter((d) => d.workDate <= today)
    .reverse()
    .slice(0, limit);

  if (rows.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-[0.8125rem] text-ink-3">
        No attendance recorded in this range yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {rows.map((day) => (
        <li
          key={day.workDate}
          className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 sm:px-5"
        >
          <span className="w-24 shrink-0 text-[0.8125rem] font-medium text-ink">
            {formatWorkDate(day.workDate, "weekday")}
          </span>
          <Badge tone={ATTENDANCE_TONE[day.status as AttendanceStatus]} size="sm" dot>
            {attendanceLabel(day.status)}
          </Badge>
          <span className="font-mono text-[0.75rem] text-ink-2">
            {day.checkInAt
              ? `${formatInstantTime(day.checkInAt, timezone)} – ${
                  day.checkOutAt ? formatInstantTime(day.checkOutAt, timezone) : "open"
                }`
              : "—"}
          </span>
          <span className="text-[0.75rem] text-ink-3">
            {day.workedMinutes > 0 ? hours(day.workedMinutes) : ""}
          </span>
          {day.lateMinutes > 0 ? (
            <Badge tone="warning" size="sm">
              {day.lateMinutes} min late
            </Badge>
          ) : null}
          {day.note ? (
            <span className="min-w-0 flex-1 truncate text-[0.75rem] text-ink-4 sm:text-right">
              {day.note}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
