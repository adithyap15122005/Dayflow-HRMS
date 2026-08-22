<div align="center">

# Dayflow HRMS

### The workforce operations platform that turns HR data into clear action

[![Live Demo](https://img.shields.io/badge/Live_Demo-AWS-FF9900?style=for-the-badge&logo=amazonwebservices&logoColor=white)](https://13-205-86-226.sslip.io)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-141_Passing-1F8A70?style=for-the-badge)](#testing)

**People · Attendance · Leave · Payroll · Reports · Notifications**

[Launch the live application](https://13-205-86-226.sslip.io) · [Explore features](#what-is-implemented) · [Run locally](#quick-start) · [Review in four minutes](#recommended-review-path-about-four-minutes)

</div>

> ## 🚀 Live AWS Demo
>
> **[OPEN DAYFLOW HRMS ON AWS →](https://13-205-86-226.sslip.io)**<br>
> **Public HTTPS deployment · Ready for evaluator access**

## Project Lead & Repository Overview

- **Project Lead & Maintainer:** [@adithyap15122005](https://github.com/adithyap15122005)
- **GitHub Repository:** [https://github.com/adithyap15122005/Dayflow-HRMS](https://github.com/adithyap15122005/Dayflow-HRMS)
- **AWS Live Deployment:** [https://13-205-86-226.sslip.io](https://13-205-86-226.sslip.io)
- **Stack & Features:** Next.js 16, TypeScript, Prisma SQLite, strict server-side RBAC, and real-time HR operations
- **Built for:** Hackathon showcase & enterprise workforce operations automation

---

Dayflow is a production-ready Human Resource Management System built around one
simple idea: an HR dashboard should tell a team what needs attention, why it
matters, and what action to take next. It brings employee records, daily
attendance, leave decisions, payroll, reporting, notifications and role-based
workflows into one coherent application.

> **Employee:** “I can understand my workday in seconds.”<br>
> **HR:** “I can understand the workforce in seconds.”

## Hackathon highlights

| What judges can evaluate | What Dayflow demonstrates |
| --- | --- |
| **A complete product** | Nine authenticated screens, 23 API routes and real workflows—not disconnected mock-ups |
| **Explainable decisions** | Every attention item exposes the exact business rule and source data behind it |
| **Role-aware UX** | Administrator, HR and employee experiences share one product while enforcing different permissions |
| **Workflow integrity** | Leave approval updates balances and attendance atomically; payroll derives loss of pay from attendance |
| **Engineering quality** | Strict TypeScript, server-side authorization, pure business rules and 141 passing unit tests |
| **Deployment readiness** | Public HTTPS deployment on AWS with a reproducible local setup and deterministic demo data |

## Live demo

The latest verified build is deployed on AWS:

### [https://13-205-86-226.sslip.io](https://13-205-86-226.sslip.io)

**➡️ [OPEN THE LIVE AWS APPLICATION](https://13-205-86-226.sslip.io)**

Use the one-click demo roles on the sign-in page to experience the same workflow
as an administrator, HR officer or employee. The deployment uses seeded showcase
data, so judges can safely explore approvals, attendance, reports and payroll.

> **Live Demo:** [https://13-205-86-226.sslip.io](https://13-205-86-226.sslip.io) — Deployed on AWS  
> **Repository:** [https://github.com/adithyap15122005/Dayflow-HRMS](https://github.com/adithyap15122005/Dayflow-HRMS)  
> **Maintainer:** [@adithyap15122005](https://github.com/adithyap15122005)

---

## Quick start

Requires Node 20+ (built and tested on Node 24) and nothing else — no database
server, no cloud account, no API key.

```bash
npm install
npm run setup     # writes .env, applies the schema to SQLite, loads demo data
npm run dev       # http://localhost:3000
```

`npm run setup` is idempotent: it never overwrites an existing `.env`.

### Demo accounts

Seeded locally by `npm run setup`. Password for all three: `Dayflow@2026`

| Email                 | Person         | Role          | What they can do                                     |
| --------------------- | -------------- | ------------- | ---------------------------------------------------- |
| `admin@dayflow.io`    | Neha Kapoor    | Administrator | Everything, including processing and paying payroll   |
| `hr@dayflow.io`       | Arjun Malhotra | HR Officer    | People, approvals, reports; can review payroll only   |
| `employee@dayflow.io` | Aarav Mehta    | Employee      | Own attendance, leave, payslips and profile           |

The sign-in screen has one-click buttons for each, so a reviewer can switch roles
without typing. These credentials are development-only fixtures created by the
seed script; they are not secrets and there are no secrets in the repository.

---

## What is implemented

**Authentication & authorisation**
Sign up with email verification, sign in with lockout after repeated failures,
sign out with true token revocation, session expiry, and a password policy that
reports exactly which requirement is unmet. Roles are `ADMIN`, `HR`, `EMPLOYEE`.

**People**
Directory with search, department/status/type filters, sorting and pagination.
A full employee record across eight tabs — Overview, Personal, Employment,
Attendance, Leave, Payroll, Documents, Activity — with each section gated by the
same rule the API enforces. HR onboarding creates the login and the employee
record in one transaction.

**Attendance**
Check in / check out with a live elapsed timer, late detection against each
person's own shift plus a configurable grace window, and Present / Half-day /
Absent / Leave / Week-off / Holiday states. Employees get a month calendar and a
day-by-day timeline; HR gets an organisation board for any date with filters and
in-place corrections. Days with no stored record are *derived* from the calendar,
so history needs no nightly backfill.

**Leave**
Balances where `remaining = entitled − approved − pending`, a request form whose
working-day count is computed by the server (weekends and public holidays
excluded), and an approval queue with aging badges. Approving deducts the balance
**and** writes the leave onto the attendance record in one transaction. Rejections
require a comment. Nobody can approve their own request, including an admin.

**Payroll**
Monthly salary structures with live validation (basic ≥ 30% of gross, deductions
< gross). A payroll run is a preview until an administrator commits it: earnings
are pro-rated on payable days and loss of pay comes from the attendance table, so
payroll and attendance can never disagree. Payslips have a real printable A4
document. A paid run is locked.

**Notifications**
Leave decisions, payslip availability, salary revisions, HR profile edits and
announcements — all written by the operation that caused them, with persisted
read state.

**Reports**
Attendance, leave, payroll and headcount, each with a stated business question,
date-range and department filters, charts, and a CSV export that contains exactly
the rows on screen (including the totals row).

**Ask Dayflow**
Natural-language questions answered from the database — see below.

---

## The differentiator: an attention queue you can audit

Most HR dashboards show you numbers. Dayflow's command centre shows you
**decisions**, and next to each one it prints the rule that produced it:

> **3 leave requests waiting over 48 hours** — Act now
> Oldest is from Nikhil Rao. Rule: pending longer than 48h.
> → Review the approval queue

The rules live in one pure, unit-tested function (`buildAttentionQueue` in
[`src/lib/domain/rules.ts`](src/lib/domain/rules.ts)) and currently detect: aging
approvals, employees with no salary structure (a real payroll blocker),
attendance checked in but never closed, employees repeatedly arriving late,
departmental absence above 15%, people unaccounted for today, and payroll that
has not been run. Nothing is scored, weighted or predicted — which is what makes
the queue trustworthy enough to work from every morning.

### Ask Dayflow

A deterministic natural-language search. A question is matched against a fixed
set of intents; the matched intent runs an ordinary Prisma query and the answer is
assembled from those rows. The panel prints the tables it read, so every figure is
auditable. It works offline and needs no external service. Answers are role-scoped: an
employee asking "how many leave requests are pending?" is told the question cannot
be verified for them.

---

## Architecture

```
Browser
  │  fetch (typed client, structured error envelope)
  ▼
proxy.ts ─────────── edge gate: verifies the session JWT, redirects early
  ▼
app/(app)/**  ────── server components; re-read the user on every request
app/api/**    ────── route handlers; parse with Zod, then authorise
  ▼
lib/services/**  ─── all database access, all notifications, all audit writes
  ▼
lib/domain/rules.ts  pure business rules — no Prisma, no clock, no I/O
  ▼
Prisma → SQLite (single file, committed schema, deterministic seed)
```

**Stack** — Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4,
Prisma 6 + SQLite, `jose` for JWT, `bcryptjs`, Zod, Recharts, Vitest.

Three deliberate choices worth calling out:

- **Business rules are pure functions.** `src/lib/domain/rules.ts` has no imports
  from Prisma and never reads the clock: services pass in the facts, the rules
  decide. That is why 141 unit tests can cover leave validation, attendance
  transitions, payroll pro-rating and the attention engine without a database.
- **One timezone, one date type.** A calendar day is a `YYYY-MM-DD` string in the
  organisation's timezone; an instant is a `DateTime`. Attendance can never drift
  a day because of where the server happens to run.
- **Fonts are a system stack, not a web font.** Instant render, no network at
  build or runtime, and it resolves to Segoe UI Variable on Windows and SF Pro on
  macOS.

### Project layout

```
prisma/
  schema.prisma          12 models; every status column is a validated string
  seed.ts                deterministic demo data, anchored to today
scripts/
  setup.mjs              one-command bootstrap
  smoke.sh               88 end-to-end HTTP assertions against a running server
  audit-pages.sh         renders every screen as every role, greps for defects
  prepare-dist.mjs       stops next dev and next build clobbering .next
src/
  app/(auth)/            sign-in, sign-up, verify
  app/(app)/             the authenticated shell and its nine screens
  app/api/               23 route handlers
  components/ui/         the design system primitives
  components/<feature>/  feature components (attendance, leave, payroll, …)
  lib/domain/            constants, time, rules  ← pure, tested
  lib/services/          org, people, attendance, leave, payroll, reports, …
  lib/auth/              session, guard, password policy
  proxy.ts               edge gate
```

---

## Design system

Every colour, radius, shadow and motion value is a token in
[`src/app/globals.css`](src/app/globals.css); screens cannot drift apart.

- **Surfaces** canvas / surface / surface-2 / surface-3, plus a dark sidebar
- **Ink** four text weights, from `ink` to `ink-4`
- **Semantic** brand, success, warning, danger, info — each with a soft fill and a
  darker ink for accessible contrast on that fill
- **Charts** exactly five roles — present, absent, leave, late, neutral. A colour
  always means the same thing on every chart on every page.
- **Elevation** three levels only (`e1` content, `e2` hover, `e3` overlay)
- **Motion** four named animations; all of them respect `prefers-reduced-motion`

Accessibility: one focus treatment everywhere, labels wired to every control via
`aria-describedby`, errors announced with `role="alert"`, dialogs built on native
`<dialog>` (real focus trap, real Escape handling), a skip link, and status
communicated by icon and text as well as colour.

Responsive: tables become card lists below `md`, the sidebar collapses (and the
preference persists), and mobile gets a bottom navigation bar. Charts and dialogs
were resized for narrow screens rather than left to wrap.

---

## Security

Authorisation is enforced **server-side, per request**. `proxy.ts` is only a fast
first gate — it verifies the JWT signature so unauthenticated visitors never reach
a render. The real boundary is `src/lib/auth/guard.ts`, which re-reads the user
row on every request, so a revoked session, a deactivated employee or a changed
role takes effect immediately rather than when a token expires.

| Concern | How it is handled |
| --- | --- |
| Session | HS256 JWT in an `httpOnly`, `sameSite=lax` cookie; `secure` in production; 12-hour default TTL |
| Sign-out | Bumps `sessionVersion`, invalidating every token already issued to that user — not just the cookie in that browser |
| Passwords | bcrypt (10 rounds); policy enforced on sign-up *and* on HR-set temporary passwords |
| Brute force | Per-IP rate limit plus a per-account lockout after 6 failures |
| Enumeration | Identical failure message and comparable timing for unknown and wrong-password |
| IDOR | Every read of another person's record goes through `canViewEmployee` / `canViewCompensation` |
| Privilege escalation | A patch is partitioned against the actor's permitted field list; an attempt to write `jobTitle`/`status`/`departmentId` as an employee is refused *by name* |
| Payroll | Processing and marking-paid are admin-only; HR can review but not commit |
| Self-approval | Nobody can decide their own leave request, including an admin |
| Input | Every route parses its body/query with Zod before doing anything |
| Errors | `AppError` carries a safe, useful message; anything else is logged server-side and reported generically |
| CSV | Leading `=`, `+`, `-`, `@` are neutralised against spreadsheet formula injection |
| Secrets | `SESSION_SECRET` is generated locally by `npm run setup`; `.env` is git-ignored and there are no credentials in the repository |

Verified adversarially — see `scripts/smoke.sh`, which asserts that an employee
cannot list the directory, read organisation attendance or leave, run reports,
preview payroll, read or write a colleague's salary, escalate their own role,
adjust attendance, broadcast an announcement, or approve their own leave; and that
HR cannot process payroll or change the work policy.

---

## Testing

```bash
npm run verify   # typecheck + lint + unit tests
npm test         # 141 unit tests
npm run build    # production build
npm run smoke    # 88 end-to-end HTTP assertions (needs npm run dev)
bash scripts/audit-pages.sh   # renders 56 screen/role combinations
```

| Layer | What it covers |
| --- | --- |
| **Unit** (141 tests, Vitest) | Timezone and calendar arithmetic incl. DST; access decisions per role; attendance transitions and status boundaries; leave validation (inverted ranges, half-day rules, overlaps, insufficient balance); payroll pro-rating, LOP clamping and zero-payable-day months; salary guard rails; the attention engine; the password policy. Plus regression coverage for edge cases found during review. |
| **End-to-end** (88 assertions) | The real HTTP API driven the way the UI drives it: auth, RBAC boundaries, the full attendance state machine, the leave workflow through to attendance being written, the payroll state machine including its locks, notifications, search, CSV export, the assistant, and session revocation. |
| **Rendered pages** (56 combinations) | Every screen fetched as every role, checked for `NaN`, `undefined`, `Invalid Date`, `[object Object]`, streaming errors, a required content marker, and absence of management-only surfaces from employee pages. |

Status at the last run: typecheck clean, lint clean (0 problems), 141/141 unit
tests, 88/88 end-to-end, 56/56 page audit, production build succeeds.

---

## Demo data

`prisma/seed.ts` is deterministic — the generator is seeded with a fixed value, so
two runs produce identical data — while every date is anchored to *today*, so the
dashboard is never stale. 26 people across six departments, ~2,000 attendance
rows over 96 days, 43 leave requests, two closed payroll periods, documents,
notifications and an audit trail.

It is also authored to tell a story, because the attention queue needs something
real to find: four people arrive late chronically, one attendance record was never
closed, one new joiner has no salary structure, one leave request has been pending
for four days, two people are on approved leave today, and the current month's
payroll has deliberately **not** been run so it can be processed live.

The organisation runs a six-day week (Sunday off) — configurable per employee, and
visible in Settings.

```bash
npm run db:reset   # wipe and re-seed
npm run db:studio  # browse the data
```

---

## Recommended review path (about four minutes)

**Start here: [Launch the AWS deployment](https://13-205-86-226.sslip.io)**

1. Open the live AWS application and sign in as **Administrator** from the one-click button.
2. Read the **attention queue** — note that each row names its rule.
3. Ask Dayflow *"Who is absent today?"* and look at the tables it cites.
4. **Attendance** → change the date, then correct someone's record.
5. **Leave** → approve the aging request; the balance and attendance both move.
6. **Payroll** → process the current month, then mark it paid, then try again.
7. **Reports** → switch report, filter, export CSV.
8. Sign out, sign in as **Employee**: check in, watch the timer, apply for leave,
   open a payslip and print it. Then try `/people` and see where you land.

---

## Known limitations

Honest list, all deliberate scope calls rather than oversights:

- **Documents are metadata only.** Records, categories and confidentiality are
  real and access control is enforced server-side, but the seeded files have no
  binary content, so there is nothing to download. Upload is not implemented.
- **Email is not sent.** Sign-up verification links are printed to the server
  console and shown in the UI, which keeps the flow demonstrable with no SMTP
  dependency. Notifications are in-app.
- **The rate limiter is in-process.** Fine for a single node; a multi-instance
  deployment would move it to Redis.
- **SQLite** suits a single-node deployment. The Prisma schema moves to Postgres
  by changing the datasource provider; no query code depends on SQLite.
- **Payroll pro-rating uses whole payable days.** A mid-month joiner is credited
  the full month's payable days; a real implementation would pro-rate from the
  joining date.
- **`npm audit`** reports 3 high advisories, all inside the Prisma CLI's own
  config dependency (`deepmerge-ts`). It is dev tooling only and is not reachable
  from the running application.
- **Light theme only.** A half-finished dark mode would cost more than it adds.

---

## AWS deployment

The public demo runs as a cost-conscious single-node deployment on AWS Lightsail
in the Mumbai region. Caddy terminates HTTPS and forwards traffic to the Next.js
service, while systemd keeps the application available after restarts. The SQLite
database is stored on the instance and remains separate from application releases.

```text
Browser
   │ HTTPS
   ▼
Caddy reverse proxy
   │ localhost:3000
   ▼
Next.js production service
   │
   ▼
Prisma + persistent SQLite database
```

This architecture keeps the hackathon deployment inexpensive and easy to operate.
For horizontal scaling, the application can move to PostgreSQL and external
session/rate-limit storage without changing its domain or service boundaries.

**🚀 PRODUCTION URL: [https://13-205-86-226.sslip.io](https://13-205-86-226.sslip.io)**

---

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite file, default `file:./dev.db` (resolved from `prisma/`) |
| `SESSION_SECRET` | Signs session JWTs; must be ≥ 32 characters. Generated by `npm run setup` |
| `SESSION_TTL_HOURS` | Session lifetime, default 12 |
| `DEV_SHOW_VERIFICATION_LINK` | Prints the sign-up verification link to the console |

See [`.env.example`](.env.example).

---

<div align="center">

Built to make every workday clear, accountable and actionable.

**[Open Dayflow](https://13-205-86-226.sslip.io)**

</div>
