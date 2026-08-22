"use client";

import { CalendarDays, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useQueryState } from "@/lib/client/use-query-state";
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABEL } from "@/lib/domain/constants";
import { addWorkDays } from "@/lib/domain/time";

/** Date + department + status controls for the organisation attendance board. */
export function AttendanceFilters({
  departments,
  today,
  workDate,
  count,
}: {
  departments: { id: string; name: string; headcount: number }[];
  today: string;
  workDate: string;
  count: number;
}) {
  const { params, set, reset, pending } = useQueryState();
  const departmentId = params.get("departmentId") ?? "";
  const status = params.get("status") ?? "";
  const active = Boolean(departmentId || status || params.get("date"));

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous day"
          onClick={() => set({ date: addWorkDays(workDate, -1) })}
        >
          ‹
        </Button>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-4" />
          <input
            type="date"
            value={workDate}
            max={today}
            aria-label="Attendance date"
            onChange={(event) => set({ date: event.target.value || undefined })}
            className="h-9 rounded-md border border-line-2 bg-surface pr-2.5 pl-8 text-[0.8125rem] text-ink shadow-e1 focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 focus-visible:outline-none"
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next day"
          disabled={workDate >= today}
          onClick={() => set({ date: addWorkDays(workDate, 1) })}
        >
          ›
        </Button>
        {workDate !== today ? (
          <Button variant="ghost" size="sm" onClick={() => set({ date: undefined })}>
            Today
          </Button>
        ) : null}
      </div>

      <Picker
        label="Department"
        value={departmentId}
        onChange={(value) => set({ departmentId: value })}
        options={departments.map((d) => ({ value: d.id, label: `${d.name} (${d.headcount})` }))}
      />
      <Picker
        label="Status"
        value={status}
        onChange={(value) => set({ status: value })}
        options={ATTENDANCE_STATUSES.map((s) => ({
          value: s,
          label: ATTENDANCE_STATUS_LABEL[s],
        }))}
      />

      {active ? (
        <Button variant="ghost" size="sm" onClick={reset}>
          <X className="size-3.5" />
          Clear
        </Button>
      ) : null}

      <p className={cn("ml-auto text-[0.75rem] text-ink-3", pending && "opacity-60")}>
        {count} {count === 1 ? "record" : "records"}
      </p>
    </div>
  );
}

function Picker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = `att-${label.toLowerCase()}`;
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-9 cursor-pointer appearance-none rounded-md border bg-surface pr-8 pl-3 text-[0.8125rem] shadow-e1",
          "focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 focus-visible:outline-none",
          value
            ? "border-brand bg-brand-soft font-medium text-brand-ink"
            : "border-line-2 text-ink-2",
        )}
      >
        <option value="">{label}: all</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 right-2.5 size-3 -translate-y-1/2 fill-current opacity-50"
      >
        <path d="M4.2 6.2a.75.75 0 0 1 1.06 0L8 8.94l2.74-2.74a.75.75 0 1 1 1.06 1.06l-3.27 3.27a.75.75 0 0 1-1.06 0L4.2 7.26a.75.75 0 0 1 0-1.06Z" />
      </svg>
    </div>
  );
}
