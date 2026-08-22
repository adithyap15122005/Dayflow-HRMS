import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIMEZONE,
  addWorkDays,
  addWorkMonths,
  daysInMonth,
  diffWorkDays,
  eachWorkDate,
  endOfMonth,
  endOfWeek,
  formatClockTime,
  formatDuration,
  formatWorkDateRange,
  isClockTime,
  isWorkDate,
  minutesSinceMidnight,
  startOfMonth,
  startOfWeek,
  timezoneOffsetMinutes,
  toClockTime,
  toWorkDate,
  weekdayOf,
  workDateEndUtc,
  workDateStartUtc,
  workDateTimeUtc,
} from "@/lib/domain/time";

const IST = "Asia/Kolkata";
const NY = "America/New_York";

describe("isWorkDate", () => {
  it("accepts real calendar days, including a leap day", () => {
    expect(isWorkDate("2026-08-22")).toBe(true);
    expect(isWorkDate("2026-01-01")).toBe(true);
    expect(isWorkDate("2026-12-31")).toBe(true);
    expect(isWorkDate("2024-02-29")).toBe(true);
  });

  it("rejects days that do not exist in the calendar", () => {
    expect(isWorkDate("2026-02-30")).toBe(false);
    expect(isWorkDate("2026-04-31")).toBe(false);
    expect(isWorkDate("2026-02-29")).toBe(false); // 2026 is not a leap year
  });
  it("rejects out-of-range month and day numbers", () => {
    expect(isWorkDate("2026-13-01")).toBe(false);
    expect(isWorkDate("2026-00-10")).toBe(false);
    expect(isWorkDate("2026-08-00")).toBe(false);
    expect(isWorkDate("2026-08-32")).toBe(false);
  });

  it("rejects anything that is not a YYYY-MM-DD string", () => {
    expect(isWorkDate("20260101")).toBe(false);
    expect(isWorkDate("2026-8-2")).toBe(false);
    expect(isWorkDate("2026-08-22T00:00:00Z")).toBe(false);
    expect(isWorkDate("")).toBe(false);
    expect(isWorkDate(20260101)).toBe(false);
    expect(isWorkDate(null)).toBe(false);
    expect(isWorkDate(undefined)).toBe(false);
    expect(isWorkDate(new Date("2026-08-22"))).toBe(false);
    expect(isWorkDate({ year: 2026 })).toBe(false);
  });
});

describe("isClockTime", () => {
  it("accepts 24h HH:mm and rejects everything else", () => {
    expect(isClockTime("00:00")).toBe(true);
    expect(isClockTime("23:59")).toBe(true);
    expect(isClockTime("09:30")).toBe(true);
    expect(isClockTime("24:00")).toBe(false);
    expect(isClockTime("9:30")).toBe(false);
    expect(isClockTime("09:60")).toBe(false);
    expect(isClockTime(930)).toBe(false);
  });
});

describe("timezoneOffsetMinutes", () => {
  it("reports minutes ahead of UTC", () => {
    expect(timezoneOffsetMinutes(new Date("2026-08-22T00:00:00Z"), IST)).toBe(330);
    expect(timezoneOffsetMinutes(new Date("2026-08-22T00:00:00Z"), "UTC")).toBe(0);
    expect(timezoneOffsetMinutes(new Date("2026-08-22T00:00:00Z"), NY)).toBe(-240);
  });

  it("follows DST for the given instant", () => {
    // 2026 US DST starts 08 Mar 07:00 UTC.
    expect(timezoneOffsetMinutes(new Date("2026-03-08T06:59:00Z"), NY)).toBe(-300);
    expect(timezoneOffsetMinutes(new Date("2026-03-08T07:01:00Z"), NY)).toBe(-240);
  });
});
describe("toWorkDate / workDateStartUtc", () => {
  it("puts a late-UTC instant on the NEXT org-local day in Asia/Kolkata", () => {
    // 19:00 UTC is 00:30 the next morning at +05:30.
    expect(toWorkDate(new Date("2026-08-21T19:00:00Z"), IST)).toBe("2026-08-22");
    // One second before local midnight is still the previous day.
    expect(toWorkDate(new Date("2026-08-21T18:29:59Z"), IST)).toBe("2026-08-21");
    expect(toWorkDate(new Date("2026-08-21T18:30:00Z"), IST)).toBe("2026-08-22");
  });

  it("defaults to the org timezone", () => {
    expect(DEFAULT_TIMEZONE).toBe(IST);
    expect(toWorkDate(new Date("2026-08-21T19:00:00Z"))).toBe("2026-08-22");
  });

  it("resolves the start of an IST day to 18:30 UTC the day before", () => {
    expect(workDateStartUtc("2026-08-22", IST).toISOString()).toBe(
      "2026-08-21T18:30:00.000Z",
    );
  });

  it("round-trips work date -> instant -> work date", () => {
    for (const date of ["2026-01-01", "2026-08-22", "2026-12-31", "2024-02-29"]) {
      expect(toWorkDate(workDateStartUtc(date, IST), IST)).toBe(date);
      // Last millisecond of the local day still belongs to the same date.
      const lastMs = new Date(workDateEndUtc(date, IST).getTime() - 1);
      expect(toWorkDate(lastMs, IST)).toBe(date);
    }
  });

  it("round-trips across DST transitions in a DST timezone", () => {
    // DST starts 08 Mar 2026 (local midnight is still EST) and ends 01 Nov 2026.
    expect(workDateStartUtc("2026-03-08", NY).toISOString()).toBe(
      "2026-03-08T05:00:00.000Z",
    );
    expect(workDateStartUtc("2026-11-01", NY).toISOString()).toBe(
      "2026-11-01T04:00:00.000Z",
    );
    for (const date of ["2026-03-07", "2026-03-08", "2026-03-09", "2026-11-01"]) {
      expect(toWorkDate(workDateStartUtc(date, NY), NY)).toBe(date);
    }
  });

  it("treats the day end as the exclusive start of the next day", () => {
    expect(workDateEndUtc("2026-08-22", IST).toISOString()).toBe(
      "2026-08-22T18:30:00.000Z",
    );
    expect(workDateEndUtc("2026-08-31", IST)).toEqual(
      workDateStartUtc("2026-09-01", IST),
    );
  });

  it("combines a work date and HH:mm into an instant", () => {
    expect(workDateTimeUtc("2026-08-22", "09:30", IST).toISOString()).toBe(
      "2026-08-22T04:00:00.000Z",
    );
    expect(workDateTimeUtc("2026-08-22", "00:00", IST)).toEqual(
      workDateStartUtc("2026-08-22", IST),
    );
  });
});
describe("calendar arithmetic", () => {
  it("adds days across a month boundary", () => {
    expect(addWorkDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addWorkDays("2026-09-01", -1)).toBe("2026-08-31");
    expect(addWorkDays("2026-01-31", 30)).toBe("2026-03-02");
    expect(addWorkDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("adds days across a year boundary", () => {
    expect(addWorkDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addWorkDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addWorkDays("2026-12-25", 10)).toBe("2027-01-04");
    expect(addWorkDays("2026-08-22", 0)).toBe("2026-08-22");
  });

  it("clamps month arithmetic to the last valid day", () => {
    expect(addWorkMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addWorkMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addWorkMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addWorkMonths("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("diffs work dates as signed whole days", () => {
    expect(diffWorkDays("2026-08-01", "2026-08-10")).toBe(9);
    expect(diffWorkDays("2026-08-10", "2026-08-01")).toBe(-9);
    expect(diffWorkDays("2026-08-22", "2026-08-22")).toBe(0);
    expect(diffWorkDays("2026-12-31", "2027-01-01")).toBe(1);
    // Unaffected by DST shifts because the maths runs on UTC noon.
    expect(diffWorkDays("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("enumerates an inclusive range and honours the cap", () => {
    const week = eachWorkDate("2026-08-20", "2026-08-24");
    expect(week).toEqual([
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
    ]);
    expect(eachWorkDate("2026-08-22", "2026-08-22")).toEqual(["2026-08-22"]);
    expect(eachWorkDate("2026-08-31", "2026-09-02")).toHaveLength(3);
    expect(eachWorkDate("2026-01-01", "2026-12-31", 5)).toHaveLength(5);
    expect(eachWorkDate("2020-01-01", "2030-01-01")).toHaveLength(800);
  });
});
describe("weekdayOf", () => {
  it("returns the weekday of the calendar date itself", () => {
    expect(weekdayOf("2026-08-17")).toBe(1); // Monday
    expect(weekdayOf("2026-08-21")).toBe(5); // Friday
    expect(weekdayOf("2026-08-22")).toBe(6); // Saturday
    expect(weekdayOf("2026-08-23")).toBe(0); // Sunday
  });

  it("is timezone independent", () => {
    // Even when the date is derived from an extreme zone's own midnight, the
    // weekday of the calendar day never shifts.
    for (const tz of ["UTC", IST, NY, "Pacific/Kiritimati", "Pacific/Niue"]) {
      const date = toWorkDate(workDateStartUtc("2026-08-23", tz), tz);
      expect(date).toBe("2026-08-23");
      expect(weekdayOf(date)).toBe(0);
    }
  });
});

describe("week and month boundaries", () => {
  it("starts the week on Monday, including on a Sunday", () => {
    expect(startOfWeek("2026-08-17")).toBe("2026-08-17"); // Monday -> itself
    expect(startOfWeek("2026-08-19")).toBe("2026-08-17");
    expect(startOfWeek("2026-08-22")).toBe("2026-08-17"); // Saturday
    expect(startOfWeek("2026-08-23")).toBe("2026-08-17"); // Sunday belongs to the week that started
    expect(startOfWeek("2026-08-24")).toBe("2026-08-24"); // next Monday
    expect(startOfWeek("2026-09-01")).toBe("2026-08-31"); // crosses the month
  });

  it("always lands on a Monday", () => {
    for (const date of eachWorkDate("2026-08-17", "2026-08-30")) {
      expect(weekdayOf(startOfWeek(date))).toBe(1);
    }
  });

  it("ends the week on the following Sunday", () => {
    expect(endOfWeek("2026-08-17")).toBe("2026-08-23");
    expect(endOfWeek("2026-08-23")).toBe("2026-08-23");
    expect(weekdayOf(endOfWeek("2026-08-19"))).toBe(0);
  });

  it("finds the first and last day of a month", () => {
    expect(startOfMonth("2026-08-22")).toBe("2026-08-01");
    expect(endOfMonth("2026-08-22")).toBe("2026-08-31");
    expect(endOfMonth("2026-04-15")).toBe("2026-04-30");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonth("2024-02-01")).toBe("2024-02-29");
  });

  it("counts days in February for leap and non-leap years", () => {
    expect(daysInMonth("2024-02")).toBe(29);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2000-02")).toBe(29);
    expect(daysInMonth("1900-02")).toBe(28);
    expect(daysInMonth("2026-08")).toBe(31);
    expect(daysInMonth("2026-04")).toBe(30);
  });
});
describe("formatDuration", () => {
  it("never renders a zero hour or zero minute part", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(492)).toBe("8h 12m");
    expect(formatDuration(510)).toBe("8h 30m");
  });

  it("rounds and floors at zero", () => {
    expect(formatDuration(59.6)).toBe("1h");
    expect(formatDuration(45.4)).toBe("45m");
    expect(formatDuration(-30)).toBe("0m");
  });
});

describe("formatClockTime", () => {
  it("converts to 12h with midnight and noon spelled as 12", () => {
    expect(formatClockTime("00:00")).toBe("12:00 AM");
    expect(formatClockTime("00:05")).toBe("12:05 AM");
    expect(formatClockTime("09:30")).toBe("9:30 AM");
    expect(formatClockTime("11:59")).toBe("11:59 AM");
    expect(formatClockTime("12:00")).toBe("12:00 PM");
    expect(formatClockTime("12:45")).toBe("12:45 PM");
    expect(formatClockTime("18:30")).toBe("6:30 PM");
    expect(formatClockTime("23:05")).toBe("11:05 PM");
  });

  it("falls back to an em dash for missing or malformed input", () => {
    expect(formatClockTime(null)).toBe("—");
    expect(formatClockTime(undefined)).toBe("—");
    expect(formatClockTime("")).toBe("—");
    expect(formatClockTime("24:00")).toBe("—");
    expect(formatClockTime("9:30")).toBe("—");
  });
});

describe("formatWorkDateRange", () => {
  it("collapses a shared month", () => {
    expect(formatWorkDateRange("2026-08-12", "2026-08-16")).toBe("12 – 16 Aug 2026");
  });

  it("keeps both months when the month differs but the year does not", () => {
    expect(formatWorkDateRange("2026-08-30", "2026-12-02")).toBe(
      "30 Aug – 02 Dec 2026",
    );
  });

  it("keeps both years when the year differs", () => {
    expect(formatWorkDateRange("2026-12-30", "2027-01-02")).toBe(
      "30 Dec 2026 – 02 Jan 2027",
    );
  });

  it("renders a single day once", () => {
    expect(formatWorkDateRange("2026-08-12", "2026-08-12")).toBe("12 Aug 2026");
  });
});
describe("minutesSinceMidnight", () => {
  it("uses org-local midnight, not UTC midnight", () => {
    // 19:00 UTC is 00:30 local in IST -> 30 minutes into the *next* local day.
    expect(minutesSinceMidnight(new Date("2026-08-21T19:00:00Z"), IST)).toBe(30);
    expect(minutesSinceMidnight(new Date("2026-08-21T18:30:00Z"), IST)).toBe(0);
    expect(minutesSinceMidnight(new Date("2026-08-22T04:00:00Z"), IST)).toBe(570);
    expect(minutesSinceMidnight(new Date("2026-08-22T18:29:00Z"), IST)).toBe(
      23 * 60 + 59,
    );
  });

  it("works for a negative-offset zone and for UTC", () => {
    expect(minutesSinceMidnight(new Date("2026-08-22T04:00:00Z"), NY)).toBe(0);
    expect(minutesSinceMidnight(new Date("2026-08-22T13:45:00Z"), "UTC")).toBe(825);
  });

  it("agrees with the clock-time rendering of the same instant", () => {
    const instant = new Date("2026-08-21T19:00:00Z");
    expect(toClockTime(instant, IST)).toBe("00:30");
    expect(formatClockTime(toClockTime(instant, IST))).toBe("12:30 AM");
  });
});
