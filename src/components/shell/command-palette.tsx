"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChartColumn,
  Clock,
  CornerDownLeft,
  LayoutDashboard,
  Search,
  Settings,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { api, qs } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { isManagement, type Role } from "@/lib/domain/constants";

type SearchResult = {
  employees: {
    id: string;
    name: string;
    jobTitle: string;
    employeeCode: string;
    department: string | null;
    avatarColor: string;
    href: string;
  }[];
  leave: { id: string; label: string; detail: string; href: string }[];
};

type Jump = { label: string; href: string; icon: typeof Search; hint: string };

/**
 * Command palette (⌘K / Ctrl+K).
 *
 * Search hits the same authorised API the pages use, so an employee's palette
 * can never surface a record they are not allowed to open.
 */
export function CommandPalette({
  open,
  onClose,
  role,
}: {
  open: boolean;
  onClose: () => void;
  role: Role;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);

  const jumps = useMemo<Jump[]>(() => {
    const management = isManagement(role);
    const base: Jump[] = [
      {
        label: management ? "Command centre" : "Overview",
        href: "/overview",
        icon: LayoutDashboard,
        hint: "Dashboard",
      },
      { label: "Attendance", href: "/attendance", icon: Clock, hint: "Presence" },
      { label: "Time off", href: "/leave", icon: CalendarDays, hint: "Leave" },
      { label: "Payroll", href: "/payroll", icon: Wallet, hint: "Money" },
      { label: "My profile", href: "/profile", icon: UserRound, hint: "Account" },
      { label: "Settings", href: "/settings", icon: Settings, hint: "Configure" },
    ];
    if (management) {
      base.splice(4, 0, { label: "People", href: "/people", icon: Users, hint: "Directory" });
      base.splice(5, 0, { label: "Reports", href: "/reports", icon: ChartColumn, hint: "Analytics" });
    }
    return base;
  }, [role]);

  useEffect(() => {
    if (!open) {
      setTerm("");
      setResults(null);
      setCursor(0);
      return;
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(timer);
  }, [open]);

  // Debounced search so typing does not flood the API.
  useEffect(() => {
    if (!open) return;
    const query = term.trim();
    if (query.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      void api
        .get<SearchResult>(`/api/search${qs({ q: query })}`)
        .then((data) => setResults(data))
        .catch(() => setResults({ employees: [], leave: [] }))
        .finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [term, open]);

  const filteredJumps = useMemo(() => {
    const query = term.trim().toLowerCase();
    if (!query) return jumps;
    return jumps.filter(
      (j) => j.label.toLowerCase().includes(query) || j.hint.toLowerCase().includes(query),
    );
  }, [jumps, term]);

  const flat = useMemo(() => {
    const rows: { href: string; key: string }[] = [];
    filteredJumps.forEach((j) => rows.push({ href: j.href, key: `jump-${j.href}` }));
    results?.employees.forEach((e) => rows.push({ href: e.href, key: `emp-${e.id}` }));
    results?.leave.forEach((l) => rows.push({ href: l.href, key: `leave-${l.id}` }));
    return rows;
  }, [filteredJumps, results]);

  useEffect(() => {
    setCursor(0);
  }, [term]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-90">
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 bg-ink/45 backdrop-blur-[1px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search Dayflow"
        className="animate-rise absolute inset-x-3 top-[12vh] mx-auto max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-e3"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setCursor((c) => Math.min(flat.length - 1, c + 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setCursor((c) => Math.max(0, c - 1));
          }
          if (event.key === "Enter" && flat[cursor]) {
            event.preventDefault();
            go(flat[cursor].href);
          }
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-ink-4" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search people, leave requests or jump to a page…"
            aria-label="Search"
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-4"
          />
          {loading ? (
            <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          ) : null}
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {filteredJumps.length > 0 ? (
            <Group title="Go to">
              {filteredJumps.map((jump, index) => {
                const Icon = jump.icon;
                return (
                  <Row
                    key={jump.href}
                    active={flat[cursor]?.key === `jump-${jump.href}`}
                    onSelect={() => go(jump.href)}
                    onHover={() => setCursor(index)}
                  >
                    <Icon className="size-4 shrink-0 text-ink-3" />
                    <span className="flex-1 truncate font-medium text-ink">{jump.label}</span>
                    <span className="text-[0.6875rem] text-ink-4">{jump.hint}</span>
                  </Row>
                );
              })}
            </Group>
          ) : null}

          {results && results.employees.length > 0 ? (
            <Group title="People">
              {results.employees.map((person) => (
                <Row
                  key={person.id}
                  active={flat[cursor]?.key === `emp-${person.id}`}
                  onSelect={() => go(person.href)}
                >
                  <Avatar name={person.name} tone={person.avatarColor} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{person.name}</span>
                    <span className="block truncate text-[0.6875rem] text-ink-3">
                      {person.jobTitle}
                      {person.department ? ` · ${person.department}` : ""}
                    </span>
                  </span>
                  <span className="font-mono text-[0.625rem] text-ink-4">
                    {person.employeeCode}
                  </span>
                </Row>
              ))}
            </Group>
          ) : null}

          {results && results.leave.length > 0 ? (
            <Group title="Leave requests">
              {results.leave.map((item) => (
                <Row
                  key={item.id}
                  active={flat[cursor]?.key === `leave-${item.id}`}
                  onSelect={() => go(item.href)}
                >
                  <CalendarDays className="size-4 shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{item.label}</span>
                    <span className="block truncate text-[0.6875rem] text-ink-3">
                      {item.detail}
                    </span>
                  </span>
                </Row>
              ))}
            </Group>
          ) : null}

          {term.trim().length >= 2 &&
          !loading &&
          results &&
          results.employees.length === 0 &&
          results.leave.length === 0 &&
          filteredJumps.length === 0 ? (
            <p className="px-3 py-8 text-center text-[0.8125rem] text-ink-3">
              Nothing matched “{term.trim()}”. Try a name, employee ID or job title.
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2 px-4 py-2 text-[0.6875rem] text-ink-4">
          <span className="flex items-center gap-1.5">
            <CornerDownLeft className="size-3" /> to open
          </span>
          <span>↑ ↓ to navigate · Esc to close</span>
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 last:mb-0">
      <p className="px-3 py-1.5 text-[0.625rem] font-semibold tracking-[0.12em] text-ink-4 uppercase">
        {title}
      </p>
      <ul>{children}</ul>
    </div>
  );
}

function Row({
  children,
  active,
  onSelect,
  onHover,
}: {
  children: React.ReactNode;
  active: boolean;
  onSelect: () => void;
  onHover?: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        onMouseEnter={onHover}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[0.8125rem] transition-colors",
          active ? "bg-brand-soft" : "hover:bg-surface-3",
        )}
      >
        {children}
      </button>
    </li>
  );
}
