import {
  Bell,
  CalendarDays,
  ChartColumn,
  Clock,
  LayoutDashboard,
  Settings,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { isManagement, type Role } from "@/lib/domain/constants";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Short label used by the mobile bottom bar. */
  short: string;
  /** Key used to look up a live badge count. */
  badge?: "pendingLeave" | "unreadNotifications" | "attention";
  description: string;
};

export type NavGroup = { title: string; items: NavItem[] };

/**
 * Navigation is organised around what people *do*, not around database tables:
 * an employee's day, then the organisation, then the account. Management-only
 * destinations are removed from the tree entirely rather than hidden with CSS.
 */
export function navigationFor(role: Role): NavGroup[] {
  const management = isManagement(role);

  const workspace: NavItem[] = [
    {
      href: "/overview",
      label: management ? "Command centre" : "Overview",
      short: "Home",
      icon: LayoutDashboard,
      badge: management ? "attention" : undefined,
      description: management
        ? "What needs a decision today"
        : "Your day at a glance",
    },
    {
      href: "/attendance",
      label: management ? "Attendance" : "My attendance",
      short: "Time",
      icon: Clock,
      description: management
        ? "Organisation-wide presence and corrections"
        : "Check in, check out and review your history",
    },
    {
      href: "/leave",
      label: management ? "Leave approvals" : "Time off",
      short: "Leave",
      icon: CalendarDays,
      badge: management ? "pendingLeave" : undefined,
      description: management
        ? "Approve or reject requests with context"
        : "Balances, requests and upcoming leave",
    },
    {
      href: "/payroll",
      label: management ? "Payroll" : "My payroll",
      short: "Pay",
      icon: Wallet,
      description: management
        ? "Salary structures, runs and payslips"
        : "Salary breakdown and payslips",
    },
  ];

  const organisation: NavItem[] = management
    ? [
        {
          href: "/people",
          label: "People",
          short: "People",
          icon: Users,
          description: "Directory, records and onboarding",
        },
        {
          href: "/reports",
          label: "Reports",
          short: "Reports",
          icon: ChartColumn,
          description: "Attendance, leave, payroll and headcount",
        },
      ]
    : [];

  const account: NavItem[] = [
    {
      href: "/profile",
      label: "My profile",
      short: "Profile",
      icon: UserRound,
      description: "Personal details and documents",
    },
    {
      href: "/notifications",
      label: "Notifications",
      short: "Alerts",
      icon: Bell,
      badge: "unreadNotifications",
      description: "Approvals, payslips and announcements",
    },
    {
      href: "/settings",
      label: "Settings",
      short: "Settings",
      icon: Settings,
      description: management
        ? "Work policy, leave types and holidays"
        : "Preferences and security",
    },
  ];

  return [
    { title: "Workspace", items: workspace },
    ...(organisation.length ? [{ title: "Organisation", items: organisation }] : []),
    { title: "Account", items: account },
  ];
}

/** Four destinations for the mobile bottom bar, plus "More" in the shell. */
export function mobileNavFor(role: Role): NavItem[] {
  const groups = navigationFor(role);
  const all = groups.flatMap((g) => g.items);
  const wanted = isManagement(role)
    ? ["/overview", "/people", "/leave", "/attendance"]
    : ["/overview", "/attendance", "/leave", "/payroll"];
  return wanted
    .map((href) => all.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));
}

export type BadgeCounts = {
  pendingLeave: number;
  unreadNotifications: number;
  attention: number;
};
