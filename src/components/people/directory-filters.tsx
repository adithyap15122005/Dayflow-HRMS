"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useDebouncedQuery, useQueryState } from "@/lib/client/use-query-state";
import {
  EMPLOYEE_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
} from "@/lib/domain/constants";

/**
 * Directory filters.
 *
 * Search is debounced and every control writes to the URL, so the server
 * component re-renders with the new query and the view stays shareable.
 */
export function DirectoryFilters({
  departments,
  total,
}: {
  departments: { id: string; name: string; headcount: number }[];
  total: number;
}) {
  const { params, set, reset, pending } = useQueryState();
  const [term, setTerm] = useDebouncedQuery("q");

  const departmentId = params.get("departmentId") ?? "";
  const status = params.get("status") ?? "";
  const employmentType = params.get("employmentType") ?? "";
  const active = Boolean(
    params.get("q") || departmentId || status || employmentType,
  );

  return (
    <div className="border-b border-line px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-4" />
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search name, ID, role or email"
            aria-label="Search employees"
            className="h-9 w-full rounded-md border border-line-2 bg-surface pr-3 pl-9 text-sm text-ink shadow-e1 placeholder:text-ink-4 focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 focus-visible:outline-none"
          />
        </div>

        <FilterSelect
          label="Department"
          value={departmentId}
          onChange={(value) => set({ departmentId: value })}
          options={departments.map((d) => ({
            value: d.id,
            label: `${d.name} (${d.headcount})`,
          }))}
        />

        <FilterSelect
          label="Status"
          value={status}
          onChange={(value) => set({ status: value })}
          options={EMPLOYEE_STATUSES.map((s) => ({
            value: s,
            label: EMPLOYEE_STATUS_LABEL[s],
          }))}
        />

        <FilterSelect
          label="Type"
          value={employmentType}
          onChange={(value) => set({ employmentType: value })}
          options={EMPLOYMENT_TYPES.map((t) => ({
            value: t,
            label: EMPLOYMENT_TYPE_LABEL[t],
          }))}
        />

        {active ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            <X className="size-3.5" />
            Clear
          </Button>
        ) : null}

        <p
          className={cn(
            "ml-auto flex items-center gap-1.5 text-[0.75rem] text-ink-3",
            pending && "opacity-60",
          )}
        >
          <SlidersHorizontal className="size-3.5" />
          {total} {total === 1 ? "person" : "people"}
        </p>
      </div>
    </div>
  );
}

function FilterSelect({
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
  const id = `filter-${label.toLowerCase()}`;
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
          value ? "border-brand bg-brand-soft font-medium text-brand-ink" : "border-line-2 text-ink-2",
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
