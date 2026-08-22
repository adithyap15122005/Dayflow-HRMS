import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Table rules
 *  - 40px header row, 52px body rows: dense enough to scan, tall enough to tap
 *  - numeric columns are right-aligned and tabular
 *  - the whole table scrolls horizontally inside its card rather than pushing
 *    the page wide; on small screens pages render a card list instead
 */

export function TableScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("-mx-px overflow-x-auto", className)}>
      <div className="min-w-full align-middle">{children}</div>
    </div>
  );
}

export function Table({ className, children, ...rest }: ComponentProps<"table">) {
  return (
    <table {...rest} className={cn("w-full border-collapse text-sm", className)}>
      {children}
    </table>
  );
}

export function THead({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <thead className={cn("bg-surface-2", className)}>
      <tr className="border-b border-line">{children}</tr>
    </thead>
  );
}

export function TH({
  children,
  align = "left",
  className,
  width,
  scope = "col",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  width?: string;
  scope?: "col" | "row";
}) {
  return (
    <th
      scope={scope}
      style={width ? { width } : undefined}
      className={cn(
        "h-10 px-3 text-[0.6875rem] font-semibold tracking-wider whitespace-nowrap text-ink-3 uppercase",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function TR({
  children,
  className,
  interactive,
  ...rest
}: ComponentProps<"tr"> & { interactive?: boolean }) {
  return (
    <tr
      {...rest}
      className={cn(
        "transition-colors",
        interactive && "hover:bg-surface-2",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  align = "left",
  className,
  colSpan,
  nowrap,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  colSpan?: number;
  nowrap?: boolean;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "h-13 px-3 align-middle text-ink-2",
        align === "right" && "text-right",
        align === "center" && "text-center",
        nowrap && "whitespace-nowrap",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function TFootRow({ children }: { children: ReactNode }) {
  return (
    <tfoot className="border-t-2 border-line-2 bg-surface-2 font-semibold text-ink">
      <tr>{children}</tr>
    </tfoot>
  );
}

/**
 * Column header that also acts as a sort control.
 *
 * The sort state is announced through the accessible name rather than `aria-sort`,
 * because `aria-sort` belongs on the `columnheader`, not on a link inside it.
 */
export function SortHeader({
  label,
  active,
  direction,
  href,
  align = "left",
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  href: string;
  align?: "left" | "right";
}) {
  const next = active && direction === "asc" ? "descending" : "ascending";
  return (
    <a
      href={href}
      aria-label={
        active
          ? `${label}, sorted ${direction === "asc" ? "ascending" : "descending"}. Sort ${next}.`
          : `Sort by ${label}`
      }
      className={cn(
        "group inline-flex items-center gap-1 rounded transition-colors hover:text-ink",
        active && "text-brand-ink",
        align === "right" && "flex-row-reverse",
      )}
    >
      {label}
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className={cn(
          "size-3 transition-opacity",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-50",
          active && direction === "desc" && "rotate-180",
        )}
      >
        <path d="M6 2.5 9.5 7h-7L6 2.5Z" className="fill-current" />
      </svg>
    </a>
  );
}

/** Mobile equivalent of a table row: a stacked card. */
export function RecordCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-line p-4 last:border-b-0", className)}>
      {children}
    </div>
  );
}

export function RecordMeta({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[0.8125rem]">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[0.6875rem] font-semibold tracking-wide text-ink-4 uppercase">
            {item.label}
          </dt>
          <dd className="truncate text-ink-2">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
