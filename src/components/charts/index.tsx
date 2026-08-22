"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/cn";
import { formatWorkDate } from "@/lib/domain/time";
import { money, percent } from "@/lib/format";

/**
 * Chart conventions
 *  - five colour roles only (present / absent / leave / late / neutral); a colour
 *    always means the same thing, on every chart, on every page
 *  - no gridlines on the Y axis beyond faint horizontals, no 3D, no gradients
 *    that carry meaning
 *  - every chart answers one stated business question, written above it by the
 *    page that renders it
 */

const AXIS = {
  stroke: "var(--color-line-2)",
  tick: { fill: "var(--color-ink-3)", fontSize: 11 },
};

const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 10,
    border: "1px solid var(--color-line)",
    boxShadow: "var(--shadow-e2)",
    fontSize: 12,
    padding: "8px 10px",
  },
  labelStyle: { color: "var(--color-ink)", fontWeight: 600, marginBottom: 4 },
  itemStyle: { padding: 0 },
} as const;

export function ChartFrame({
  children,
  height = 240,
  className,
}: {
  children: React.ReactNode;
  height?: number;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as never}
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------ attendance trend */

export type TrendPoint = {
  workDate: string;
  present: number;
  absent: number;
  leave: number;
  late: number;
  expected: number;
  ratePct: number;
};

/**
 * Question answered: "is attendance improving, and where are the bad days?"
 * Stacked headcount bars carry the volume; the line carries the rate.
 */
export function AttendanceTrendChart({
  data,
  height = 260,
}: {
  data: TrendPoint[];
  height?: number;
}) {
  const points = data.filter((d) => d.expected > 0);
  const step = Math.max(1, Math.floor(points.length / 8));

  return (
    <ChartFrame height={height}>
      <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid vertical={false} stroke="var(--color-line)" />
        <XAxis
          dataKey="workDate"
          {...AXIS}
          tickLine={false}
          interval={step - 1}
          tickFormatter={(value: string) => formatWorkDate(value, "short")}
        />
        <YAxis {...AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          yAxisId="rate"
          orientation="right"
          domain={[0, 100]}
          hide
        />
        <Tooltip
          {...TOOLTIP_STYLE}
          labelFormatter={(value) => formatWorkDate(String(value), "long")}
          formatter={(value, name) =>
            name === "Presence rate"
              ? [percent(Number(value)), name]
              : [`${value} people`, name]
          }
        />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="circle"
          iconSize={7}
          wrapperStyle={{ fontSize: 11, color: "var(--color-ink-3)" }}
        />
        <Bar
          dataKey="present"
          name="Present"
          stackId="a"
          fill="var(--color-chart-present)"
          radius={[0, 0, 0, 0]}
          maxBarSize={22}
        />
        <Bar
          dataKey="leave"
          name="On leave"
          stackId="a"
          fill="var(--color-chart-leave)"
          maxBarSize={22}
        />
        <Bar
          dataKey="absent"
          name="Absent"
          stackId="a"
          fill="var(--color-chart-absent)"
          radius={[3, 3, 0, 0]}
          maxBarSize={22}
        />
        <Line
          yAxisId="rate"
          type="monotone"
          dataKey="ratePct"
          name="Presence rate"
          stroke="var(--color-ink)"
          strokeWidth={1.75}
          dot={false}
          activeDot={{ r: 3 }}
        />
      </ComposedChart>
    </ChartFrame>
  );
}

/** Question answered: "how have my own hours moved over the month?" */
export function HoursAreaChart({
  data,
  height = 180,
}: {
  data: { workDate: string; minutes: number; status: string }[];
  height?: number;
}) {
  const points = data
    .filter((d) => d.status !== "WEEK_OFF" && d.status !== "HOLIDAY")
    .map((d) => ({ ...d, hours: Math.round((d.minutes / 60) * 10) / 10 }));

  return (
    <ChartFrame height={height}>
      <ComposedChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: -22 }}>
        <CartesianGrid vertical={false} stroke="var(--color-line)" />
        <XAxis
          dataKey="workDate"
          {...AXIS}
          tickLine={false}
          interval={Math.max(1, Math.floor(points.length / 6)) - 1}
          tickFormatter={(value: string) => formatWorkDate(value, "short")}
        />
        <YAxis {...AXIS} tickLine={false} axisLine={false} unit="h" width={38} />
        <Tooltip
          {...TOOLTIP_STYLE}
          labelFormatter={(value) => formatWorkDate(String(value), "long")}
          formatter={(value) => [`${value} hours`, "Logged"]}
        />
        <Area
          type="monotone"
          dataKey="hours"
          stroke="var(--color-chart-present)"
          strokeWidth={2}
          fill="var(--color-brand-soft)"
        />
      </ComposedChart>
    </ChartFrame>
  );
}

/* --------------------------------------------------------- horizontal bar */

export function HorizontalBarChart({
  data,
  valueKey,
  labelKey,
  unit = "",
  tone = "present",
  height = 220,
  valueLabel,
}: {
  data: Record<string, string | number>[];
  valueKey: string;
  labelKey: string;
  unit?: string;
  tone?: "present" | "absent" | "leave" | "late";
  height?: number;
  /** Suffix shown in the tooltip, e.g. "people" or "of expected days". */
  valueLabel?: string;
}) {
  return (
    <ChartFrame height={height}>
      <ComposedChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 20, bottom: 0, left: 4 }}
      >
        <CartesianGrid horizontal={false} stroke="var(--color-line)" />
        <XAxis type="number" {...AXIS} tickLine={false} axisLine={false} unit={unit} />
        <YAxis
          type="category"
          dataKey={labelKey}
          {...AXIS}
          tickLine={false}
          axisLine={false}
          width={104}
        />
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value) => [
            `${value}${unit}${valueLabel ? ` ${valueLabel}` : ""}`,
            "",
          ]}
        />
        <Bar
          dataKey={valueKey}
          fill={`var(--color-chart-${tone})`}
          radius={[0, 4, 4, 0]}
          maxBarSize={18}
        />
      </ComposedChart>
    </ChartFrame>
  );
}

/* ----------------------------------------------------------------- donut */

const PIE_COLORS = [
  "var(--color-chart-present)",
  "var(--color-tone-violet)",
  "var(--color-tone-teal)",
  "var(--color-chart-leave)",
  "var(--color-tone-sky)",
  "var(--color-chart-neutral)",
];

/** Question answered: "where does the salary commitment sit?" */
export function SharePie({
  data,
  nameKey,
  valueKey,
  height = 220,
  asMoney = false,
}: {
  data: Record<string, string | number>[];
  nameKey: string;
  valueKey: string;
  height?: number;
  asMoney?: boolean;
}) {
  return (
    <ChartFrame height={height}>
      <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value, name) => [
            asMoney ? money(Number(value)) : String(value),
            String(name),
          ]}
        />
        <Legend
          verticalAlign="bottom"
          align="center"
          iconType="circle"
          iconSize={7}
          wrapperStyle={{ fontSize: 11, color: "var(--color-ink-3)" }}
        />
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          innerRadius="52%"
          outerRadius="78%"
          paddingAngle={2}
          stroke="var(--color-surface)"
          strokeWidth={2}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ChartFrame>
  );
}

/** Compact bars for period totals (payroll net by month). */
export function PeriodBarChart({
  data,
  height = 200,
}: {
  data: { periodLabel: string; netPay: number }[];
  height?: number;
}) {
  return (
    <ChartFrame height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} stroke="var(--color-line)" />
        <XAxis dataKey="periodLabel" {...AXIS} tickLine={false} />
        <YAxis
          {...AXIS}
          tickLine={false}
          axisLine={false}
          width={54}
          tickFormatter={(value: number) =>
            value >= 100000 ? `${(value / 100000).toFixed(1)}L` : `${Math.round(value / 1000)}k`
          }
        />
        <Tooltip {...TOOLTIP_STYLE} formatter={(value) => [money(Number(value)), "Net paid"]} />
        <Bar
          dataKey="netPay"
          fill="var(--color-chart-present)"
          radius={[4, 4, 0, 0]}
          maxBarSize={44}
        />
      </ComposedChart>
    </ChartFrame>
  );
}
