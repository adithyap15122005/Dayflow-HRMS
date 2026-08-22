import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type TabDef = {
  id: string;
  label: string;
  count?: number;
  icon?: ReactNode;
};

/**
 * URL-driven tabs.
 *
 * Each tab is a real link, so tabs are shareable, work without JavaScript and let
 * the server render only the panel being viewed instead of shipping them all.
 */
export function Tabs({
  tabs,
  active,
  hrefFor,
  className,
}: {
  tabs: TabDef[];
  active: string;
  hrefFor: (id: string) => string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "no-scrollbar -mb-px flex gap-1 overflow-x-auto border-b border-line px-2 sm:px-4",
        className,
      )}
      role="tablist"
      aria-label="Sections"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={hrefFor(tab.id)}
            role="tab"
            aria-selected={isActive}
            scroll={false}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 rounded-t-md px-3 py-2.5 text-[0.8125rem] font-medium whitespace-nowrap transition-colors",
              isActive
                ? "text-brand-ink"
                : "text-ink-3 hover:bg-surface-2 hover:text-ink",
            )}
          >
            {tab.icon}
            {tab.label}
            {typeof tab.count === "number" && tab.count > 0 ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold",
                  isActive ? "bg-brand-soft2 text-brand-ink" : "bg-surface-3 text-ink-3",
                )}
              >
                {tab.count}
              </span>
            ) : null}
            {isActive ? (
              <span
                aria-hidden
                className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-brand"
              />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

/** Segmented control for small, mutually exclusive view switches. */
export function SegmentedLinks({
  options,
  active,
  hrefFor,
  label,
}: {
  options: { id: string; label: string }[];
  active: string;
  hrefFor: (id: string) => string;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-3 p-0.5"
    >
      {options.map((option) => {
        const isActive = option.id === active;
        return (
          <Link
            key={option.id}
            href={hrefFor(option.id)}
            scroll={false}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-[0.75rem] font-medium transition-colors",
              isActive
                ? "bg-surface text-ink shadow-e1"
                : "text-ink-3 hover:text-ink",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
