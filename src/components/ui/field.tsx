import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Input rules
 *  - every control is wrapped by <Field>, which owns the label/hint/error ids
 *  - errors are announced (role="alert") and wired via aria-describedby
 *  - invalid state is communicated by border + icon + text, never colour alone
 */

const CONTROL =
  "w-full rounded-md border bg-surface px-3 text-sm text-ink shadow-e1 " +
  "transition-[border-color,box-shadow] placeholder:text-ink-4 " +
  "focus:outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 " +
  "disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-ink-3";

const HEIGHT = "h-9.5";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
  action,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[0.8125rem] font-medium text-ink-2">
          {label}
          {required ? (
            <span aria-hidden className="ml-0.5 text-danger">
              *
            </span>
          ) : null}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="mt-1.5 flex items-start gap-1 text-[0.75rem] font-medium text-danger-ink"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="mt-px size-3.5 shrink-0 fill-current">
            <path d="M8 1.5 15 14H1L8 1.5Zm0 4.25a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0V6.5A.75.75 0 0 0 8 5.75Zm0 5a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z" />
          </svg>
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-[0.75rem] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string | null, hint?: unknown) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export function Input({
  id,
  error,
  hint,
  className,
  ...rest
}: ComponentProps<"input"> & { id: string; error?: string | null; hint?: unknown }) {
  return (
    <input
      {...rest}
      id={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, error, hint)}
      className={cn(
        CONTROL,
        HEIGHT,
        error ? "border-danger" : "border-line-2",
        className,
      )}
    />
  );
}

export function Textarea({
  id,
  error,
  hint,
  className,
  ...rest
}: ComponentProps<"textarea"> & { id: string; error?: string | null; hint?: unknown }) {
  return (
    <textarea
      {...rest}
      id={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, error, hint)}
      className={cn(
        CONTROL,
        "min-h-20 resize-y py-2 leading-relaxed",
        error ? "border-danger" : "border-line-2",
        className,
      )}
    />
  );
}

export function Select({
  id,
  error,
  hint,
  className,
  children,
  ...rest
}: ComponentProps<"select"> & { id: string; error?: string | null; hint?: unknown }) {
  return (
    <div className="relative">
      <select
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(
          CONTROL,
          HEIGHT,
          "cursor-pointer appearance-none pr-9",
          error ? "border-danger" : "border-line-2",
          className,
        )}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 fill-ink-3"
      >
        <path d="M4.2 6.2a.75.75 0 0 1 1.06 0L8 8.94l2.74-2.74a.75.75 0 1 1 1.06 1.06l-3.27 3.27a.75.75 0 0 1-1.06 0L4.2 7.26a.75.75 0 0 1 0-1.06Z" />
      </svg>
    </div>
  );
}

export function Checkbox({
  id,
  label,
  hint,
  className,
  ...rest
}: ComponentProps<"input"> & { id: string; label: ReactNode; hint?: ReactNode }) {
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input
        {...rest}
        id={id}
        type="checkbox"
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-line-strong text-brand accent-brand"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-[0.8125rem] font-medium text-ink-2">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-[0.75rem] text-ink-3">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Radio-style segmented picker for a small set of options. */
export function OptionCards<T extends string>({
  name,
  value,
  options,
  onSelect,
  columns = 2,
}: {
  name: string;
  value: T;
  options: { value: T; label: string; description?: string; icon?: ReactNode }[];
  onSelect: (value: T) => void;
  columns?: 1 | 2 | 3;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={cn(
        "grid gap-2",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-3",
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(option.value)}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors",
              active
                ? "border-brand bg-brand-soft ring-1 ring-brand"
                : "border-line-2 bg-surface hover:border-line-strong hover:bg-surface-2",
            )}
          >
            <span className="flex items-center gap-2">
              {option.icon}
              <span
                className={cn(
                  "text-[0.8125rem] font-semibold",
                  active ? "text-brand-ink" : "text-ink",
                )}
              >
                {option.label}
              </span>
            </span>
            {option.description ? (
              <span className="mt-0.5 block text-[0.75rem] leading-snug text-ink-3">
                {option.description}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Form-level error banner for failures that are not tied to one field. */
export function FormError({ message, hint }: { message: string; hint?: string }) {
  return (
    <div
      role="alert"
      className="animate-rise flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3"
    >
      <svg aria-hidden viewBox="0 0 20 20" className="mt-px size-4 shrink-0 fill-danger">
        <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3.4a.9.9 0 0 1 .9.9v4a.9.9 0 0 1-1.8 0v-4a.9.9 0 0 1 .9-.9Zm0 7a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
      </svg>
      <div className="min-w-0 text-[0.8125rem]">
        <p className="font-semibold text-danger-ink">{message}</p>
        {hint ? <p className="mt-0.5 text-danger-ink/80">{hint}</p> : null}
      </div>
    </div>
  );
}

export function FormNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-info/20 bg-info-soft px-3.5 py-2.5 text-[0.8125rem] text-info-ink">
      {children}
    </div>
  );
}
