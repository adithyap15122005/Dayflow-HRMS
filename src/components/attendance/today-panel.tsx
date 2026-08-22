"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, LogIn, LogOut, Timer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import {
  formatClockTime,
  formatInstantTime,
  formatWorkDate,
} from "@/lib/domain/time";
import { attendanceLabel, ATTENDANCE_TONE, hours } from "@/lib/format";
import type { AttendanceStatus } from "@/lib/domain/constants";

export type TodayState = {
  workDate: string;
  status: AttendanceStatus | "NOT_STARTED";
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  isOpen: boolean;
  nonWorking: "WEEK_OFF" | "HOLIDAY" | "LEAVE" | null;
  shiftStart: string;
  shiftEnd: string;
  standardWorkMinutes: number;
  canCheckIn: boolean;
  canCheckOut: boolean;
  blockedReason: string | null;
};

/**
 * The employee's primary control.
 *
 * While a day is open the elapsed time ticks locally from the server-supplied
 * check-in instant — no polling, and the displayed figure always reconciles with
 * what the server computes on the next request.
 */
export function TodayPanel({
  initial,
  timezone,
  firstName,
}: {
  initial: TodayState;
  timezone: string;
  firstName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(() => Date.now());

  // Adopt a fresh server snapshot (after router.refresh) without an effect.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setState(initial);
  }

  // Only run a timer while a day is genuinely open.
  useEffect(() => {
    if (!state.isOpen) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.isOpen]);

  const elapsedMinutes = useMemo(() => {
    if (!state.isOpen || !state.checkInAt) return state.workedMinutes;
    return Math.max(0, Math.floor((tick - new Date(state.checkInAt).getTime()) / 60000));
  }, [state.isOpen, state.checkInAt, state.workedMinutes, tick]);

  const elapsedSeconds = useMemo(() => {
    if (!state.isOpen || !state.checkInAt) return 0;
    return Math.max(0, Math.floor((tick - new Date(state.checkInAt).getTime()) / 1000) % 60);
  }, [state.isOpen, state.checkInAt, tick]);

  const progress = Math.min(
    100,
    Math.round((elapsedMinutes / Math.max(1, state.standardWorkMinutes)) * 100),
  );
  const remaining = Math.max(0, state.standardWorkMinutes - elapsedMinutes);

  async function act(action: "check-in" | "check-out") {
    setBusy(true);
    try {
      const result = await api.post<{ state: TodayState; message: string }>(
        `/api/attendance/today?action=${action}`,
        {},
      );
      setState(result.state);
      toast.success(action === "check-in" ? "Checked in" : "Checked out", result.message);
      router.refresh();
    } catch (error) {
      const described = describeError(error);
      toast.error(described.message, described.hint);
    } finally {
      setBusy(false);
    }
  }

  const statusTone =
    state.status === "NOT_STARTED"
      ? "neutral"
      : ATTENDANCE_TONE[state.status as AttendanceStatus];

  const headline =
    state.nonWorking === "LEAVE"
      ? "You are on approved leave today"
      : state.nonWorking === "HOLIDAY"
        ? "Today is a public holiday"
        : state.nonWorking === "WEEK_OFF"
          ? "Today is your weekly off"
          : state.checkOutAt
            ? "Workday complete"
            : state.isOpen
              ? "You are checked in"
              : `Good to see you, ${firstName}`;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
      <div className="relative border-b border-line bg-sidebar px-4 py-5 text-white sm:px-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-16 size-64 rounded-full bg-brand/25 blur-3xl"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[0.75rem] text-white/55">
              <CalendarDays className="size-3.5" />
              {formatWorkDate(state.workDate, "long")}
            </p>
            <h2 className="mt-1.5 text-xl font-semibold text-white sm:text-[1.375rem]">
              {headline}
            </h2>
            <p className="mt-1 text-[0.8125rem] text-white/60">
              Shift {formatClockTime(state.shiftStart)} – {formatClockTime(state.shiftEnd)} ·{" "}
              {timezone.replace("_", " ")}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[0.6875rem] tracking-wider text-white/45 uppercase">
              {state.isOpen ? "Working time" : "Logged today"}
            </p>
            <p className="mt-0.5 font-mono text-[1.75rem] leading-none font-semibold text-white tabular-nums">
              {String(Math.floor(elapsedMinutes / 60)).padStart(2, "0")}:
              {String(elapsedMinutes % 60).padStart(2, "0")}
              {state.isOpen ? (
                <span className="text-base text-white/45">
                  :{String(elapsedSeconds).padStart(2, "0")}
                </span>
              ) : null}
            </p>
          </div>
        </div>

        {/* Progress toward the standard day. */}
        <div className="relative mt-5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700",
                progress >= 100 ? "bg-success" : "bg-brand-soft2",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.75rem] text-white/55">
            <span>
              {progress >= 100
                ? "Full day complete"
                : state.isOpen
                  ? `${hours(remaining)} to a full day`
                  : `Standard day is ${hours(state.standardWorkMinutes)}`}
            </span>
            <span>{progress}%</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className="text-[0.625rem] font-semibold tracking-wider text-ink-4 uppercase">
              Checked in
            </dt>
            <dd className="mt-0.5 text-[0.9375rem] font-semibold text-ink">
              {formatInstantTime(state.checkInAt, timezone)}
            </dd>
          </div>
          <div>
            <dt className="text-[0.625rem] font-semibold tracking-wider text-ink-4 uppercase">
              Checked out
            </dt>
            <dd className="mt-0.5 text-[0.9375rem] font-semibold text-ink">
              {formatInstantTime(state.checkOutAt, timezone)}
            </dd>
          </div>
          <div>
            <dt className="text-[0.625rem] font-semibold tracking-wider text-ink-4 uppercase">
              Status
            </dt>
            <dd className="mt-1">
              <Badge tone={statusTone} dot live={state.isOpen}>
                {state.status === "NOT_STARTED"
                  ? "Not started"
                  : attendanceLabel(state.status)}
              </Badge>
            </dd>
          </div>
        </dl>

        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          {state.canCheckIn ? (
            <Button
              variant="primary"
              size="lg"
              loading={busy}
              onClick={() => void act("check-in")}
            >
              <LogIn className="size-4" />
              Check in
            </Button>
          ) : state.canCheckOut ? (
            <Button
              variant="primary"
              size="lg"
              loading={busy}
              onClick={() => void act("check-out")}
            >
              <LogOut className="size-4" />
              Check out
            </Button>
          ) : (
            <p className="max-w-xs text-[0.8125rem] leading-snug text-ink-3 sm:text-right">
              {state.blockedReason ??
                (state.checkOutAt
                  ? "Your day is closed. Ask HR if a correction is needed."
                  : "No action available today.")}
            </p>
          )}

          {state.lateMinutes > 0 ? (
            <p className="flex items-center gap-1.5 text-[0.75rem] text-warning-ink">
              <Timer className="size-3.5" />
              {state.lateMinutes} min after shift start
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
