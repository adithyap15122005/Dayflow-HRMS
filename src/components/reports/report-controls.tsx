"use client";

import { Download, Printer, X } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useQueryState } from "@/lib/client/use-query-state";
import { qs } from "@/lib/client/api";

/** Date range + department filters, plus CSV export and print, for every report. */
export function ReportControls({
  report,
  departments,
  from,
  to,
  today,
  showRange,
}: {
  report: string;
  departments: { id: string; name: string }[];
  from: string;
  to: string;
  today: string;
  showRange: boolean;
}) {
  const { params, set, reset, pending } = useQueryState();
  const departmentId = params.get("departmentId") ?? "";
  const active = Boolean(params.get("from") || params.get("to") || departmentId);

  const csvHref = `/api/reports${qs({
    report,
    from: showRange ? from : undefined,
    to: showRange ? to : undefined,
    departmentId: departmentId || undefined,
    format: "csv",
  })}`;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
      {showRange ? (
        <>
          <label htmlFor="rep-from" className="text-[0.75rem] font-medium text-ink-3">
            From
          </label>
          <input
            id="rep-from"
            type="date"
            value={from}
            max={to}
            onChange={(event) => set({ from: event.target.value || undefined })}
            className="h-9 rounded-md border border-line-2 bg-surface px-2.5 text-[0.8125rem] text-ink shadow-e1 focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 focus-visible:outline-none"
          />
          <label htmlFor="rep-to" className="text-[0.75rem] font-medium text-ink-3">
            To
          </label>
          <input
            id="rep-to"
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(event) => set({ to: event.target.value || undefined })}
            className="h-9 rounded-md border border-line-2 bg-surface px-2.5 text-[0.8125rem] text-ink shadow-e1 focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 focus-visible:outline-none"
          />
        </>
      ) : null}

      <div className="relative">
        <label htmlFor="rep-dept" className="sr-only">
          Department
        </label>
        <select
          id="rep-dept"
          value={departmentId}
          onChange={(event) => set({ departmentId: event.target.value })}
          className={cn(
            "h-9 cursor-pointer appearance-none rounded-md border bg-surface pr-8 pl-3 text-[0.8125rem] shadow-e1",
            "focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 focus-visible:outline-none",
            departmentId
              ? "border-brand bg-brand-soft font-medium text-brand-ink"
              : "border-line-2 text-ink-2",
          )}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
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

      {active ? (
        <Button variant="ghost" size="sm" onClick={reset}>
          <X className="size-3.5" />
          Reset
        </Button>
      ) : null}

      <div className={cn("ml-auto flex gap-2", pending && "opacity-60")}>
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer className="size-3.5" />
          Print
        </Button>
        <ButtonLink href={csvHref} variant="primary" size="sm" prefetch={false}>
          <Download className="size-3.5" />
          Export CSV
        </ButtonLink>
      </div>
    </div>
  );
}
