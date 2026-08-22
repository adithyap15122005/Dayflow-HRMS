/**
 * Calendar + clock helpers.
 *
 * The whole product has exactly one timezone: the organisation's (`OrgSetting.timezone`).
 * A "work date" is a plain calendar day in that timezone, always represented as a
 * `YYYY-MM-DD` string so it can never drift when it crosses a process boundary.
 *
 * Rules of the road:
 *  - Anything stored as `DateTime` is an absolute instant (UTC in SQLite).
 *  - Anything stored as `String` in `YYYY-MM-DD` form is an org-local calendar day.
 *  - Calendar arithmetic on work dates uses UTC internally so it is DST-proof.
 */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export type WorkDate = string; // YYYY-MM-DD

const WORK_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isWorkDate(value: unknown): value is WorkDate {
  if (typeof value !== "string" || !WORK_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
  );
}

export function isClockTime(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

/** Minutes that `tz` is ahead of UTC at the given instant. */
export function timezoneOffsetMinutes(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  // Drop sub-second noise before differencing.
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** The org-local calendar day that an instant falls on. */
export function toWorkDate(instant: Date, tz: string = DEFAULT_TIMEZONE): WorkDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  // en-CA formats as YYYY-MM-DD.
  return parts;
}

/** Org-local wall-clock time of an instant, as "HH:mm". */
export function toClockTime(instant: Date, tz: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

/** Minutes since org-local midnight for an instant. */
export function minutesSinceMidnight(
  instant: Date,
  tz: string = DEFAULT_TIMEZONE,
): number {
  const [h, m] = toClockTime(instant, tz).split(":").map(Number);
  return h * 60 + m;
}

/** The instant at which an org-local calendar day begins. */
export function workDateStartUtc(
  date: WorkDate,
  tz: string = DEFAULT_TIMEZONE,
): Date {
  const [y, m, d] = date.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  // Two passes settle DST boundaries: the first offset may belong to the wrong side.
  let guess = naive - timezoneOffsetMinutes(new Date(naive), tz) * 60000;
  guess = naive - timezoneOffsetMinutes(new Date(guess), tz) * 60000;
  return new Date(guess);
}

/** Exclusive end of an org-local calendar day. */
export function workDateEndUtc(
  date: WorkDate,
  tz: string = DEFAULT_TIMEZONE,
): Date {
  return workDateStartUtc(addWorkDays(date, 1), tz);
}

/** Combine an org-local work date + "HH:mm" into an absolute instant. */
export function workDateTimeUtc(
  date: WorkDate,
  time: string,
  tz: string = DEFAULT_TIMEZONE,
): Date {
  const [h, min] = time.split(":").map(Number);
  return new Date(workDateStartUtc(date, tz).getTime() + (h * 60 + min) * 60000);
}

/* ------------------------------------------------ pure calendar arithmetic */

function toUtcNoon(date: WorkDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function fromUtc(d: Date): WorkDate {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** Shift a work date by whole days. */
export function addWorkDays(date: WorkDate, days: number): WorkDate {
  const d = toUtcNoon(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function addWorkMonths(date: WorkDate, months: number): WorkDate {
  const [y, m, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1, 12));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fromUtc(target);
}

/** 0 = Sunday … 6 = Saturday. Timezone independent. */
export function weekdayOf(date: WorkDate): number {
  return toUtcNoon(date).getUTCDay();
}

/** Inclusive difference in days (b - a). */
export function diffWorkDays(a: WorkDate, b: WorkDate): number {
  return Math.round(
    (toUtcNoon(b).getTime() - toUtcNoon(a).getTime()) / 86_400_000,
  );
}

/**
 * Every calendar day from `start` to `end`, inclusive.
 *
 * An inverted range yields an empty array rather than a single day, so callers
 * cannot silently act on a backwards window. `cap` bounds the worst case.
 */
export function eachWorkDate(
  start: WorkDate,
  end: WorkDate,
  cap = 800,
): WorkDate[] {
  if (diffWorkDays(start, end) < 0) return [];
  const out: WorkDate[] = [];
  let cursor = start;
  while (out.length < cap) {
    out.push(cursor);
    if (cursor >= end) break;
    cursor = addWorkDays(cursor, 1);
  }
  return out;
}

/** Monday-based start of the ISO week containing `date`. */
export function startOfWeek(date: WorkDate): WorkDate {
  const dow = weekdayOf(date);
  return addWorkDays(date, dow === 0 ? -6 : 1 - dow);
}

export function endOfWeek(date: WorkDate): WorkDate {
  return addWorkDays(startOfWeek(date), 6);
}

export function startOfMonth(date: WorkDate): WorkDate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: WorkDate): WorkDate {
  const [y, m] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export function daysInMonth(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
}

/** "YYYY-MM" period key for a work date. */
export function periodOf(date: WorkDate): string {
  return date.slice(0, 7);
}

export function addPeriods(period: string, months: number): string {
  return periodOf(addWorkMonths(`${period}-01`, months));
}

/* ----------------------------------------------------------- presentation */

export function formatWorkDate(
  date: WorkDate,
  style: "short" | "medium" | "long" | "dayMonth" | "weekday" = "medium",
): string {
  const d = toUtcNoon(date);
  const base: Intl.DateTimeFormatOptions = { timeZone: "UTC" };
  const opts: Intl.DateTimeFormatOptions =
    style === "short"
      ? { ...base, day: "2-digit", month: "short" }
      : style === "dayMonth"
        ? { ...base, day: "numeric", month: "long" }
        : style === "weekday"
          ? { ...base, weekday: "short", day: "numeric", month: "short" }
          : style === "long"
            ? { ...base, weekday: "long", day: "numeric", month: "long", year: "numeric" }
            : { ...base, day: "2-digit", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat("en-GB", opts).format(d);
}

export function formatPeriod(period: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(toUtcNoon(`${period}-01`));
}

/** Human range: "12 – 16 Aug 2026" style, collapsing shared month/year. */
export function formatWorkDateRange(start: WorkDate, end: WorkDate): string {
  if (start === end) return formatWorkDate(start);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  if (sameMonth) {
    return `${Number(start.slice(8))} – ${formatWorkDate(end)}`;
  }
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatWorkDate(start, sameYear ? "short" : "medium")} – ${formatWorkDate(end)}`;
}

/** "8h 12m" / "45m" — never "0h 0m". */
export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "09:30" -> "9:30 AM" */
export function formatClockTime(time: string | null | undefined): string {
  if (!time || !isClockTime(time)) return "—";
  const [h, m] = time.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatInstantTime(
  instant: Date | string | null | undefined,
  tz: string = DEFAULT_TIMEZONE,
): string {
  if (!instant) return "—";
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return "—";
  return formatClockTime(toClockTime(d, tz));
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 hours ago", "in 2 days", "just now". */
export function formatRelative(
  instant: Date | string,
  now: Date = new Date(),
): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return "—";
  const delta = d.getTime() - now.getTime();
  const abs = Math.abs(delta);
  if (abs < 60_000) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (abs >= ms) return rtf.format(Math.round(delta / ms), unit);
  }
  return "just now";
}
