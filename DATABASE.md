# Database Schema

Dayflow uses SQLite as its datasource, managed through Prisma ORM. The full schema lives in `prisma/schema.prisma` — this document explains what each table represents and how they connect.

## Design Notes

SQLite doesn't support native enums in Prisma, so status and role fields (`role`, `status`, and similar) are stored as plain strings. They are validated by Zod at the API boundary and narrowed by TypeScript union types in `src/lib/domain/constants.ts`.

Calendar days — a leave request's start date, an attendance record's work date — are stored as `YYYY-MM-DD` strings in the organisation's timezone, not the server's or the browser's. This keeps "which day does this belong to" unambiguous no matter where the app is deployed or accessed from. Absolute moments in time — a check-in timestamp, when a leave was decided — are stored as real `DateTime` values.

## Tables

### User

The login identity — one row per person who can sign in.

- Stores `email`, hashed password, and `role` (`ADMIN` | `HR` | `EMPLOYEE`)
- Tracks email verification, failed login attempts, and account lockout state
- `sessionVersion` is bumped to invalidate all existing sessions at once, for example after a password change
- Linked one-to-one with an `Employee` record

### Department

Lookup table for organisational departments.

- Unique `name` and `code`
- `headId` optionally points to the department head
- One department has many employees

### Employee

The core HR record — one per person employed at the company.

- Personal info: name, contact details, address, date of birth
- Job info: `jobTitle`, `employmentType` (`FULL_TIME` | `PART_TIME` | `CONTRACT` | `INTERN`), `status` (`ACTIVE` | `PROBATION` | `NOTICE_PERIOD` | `INACTIVE`)
- Belongs to a `Department` and optionally has a `manager` — a self-referencing relation, since a manager is just another `Employee`
- Defines each employee's expected `shiftStart` / `shiftEnd` and which weekdays are their off days (`weeklyOffCsv`)
- The parent record for attendance, leave requests, leave balances, salary structure, payslips, and documents

### Attendance

One row per employee, per calendar day.

- `workDate` (`YYYY-MM-DD`) plus `employeeId` together are unique — one attendance record per employee per day
- Tracks `checkInAt` / `checkOutAt` timestamps and computed `workedMinutes`, `lateMinutes`, `earlyExitMinutes`
- `status`: `PRESENT` | `ABSENT` | `HALF_DAY` | `LEAVE` | `WEEK_OFF` | `HOLIDAY`
- `source` records whether the entry was self-logged, adjusted by HR, or set by the system

### LeaveType

Configuration table defining the kinds of leave available — Paid, Sick, Casual, Unpaid.

- `defaultAnnualDays` — how many days of this type an employee gets per year by default
- `isPaid` and `requiresReason` control behaviour when applying

### LeaveBalance

Tracks how many days of a given leave type an employee has used, per year.

- Unique per `(employeeId, leaveTypeId, year)`
- `entitledDays` minus `usedDays` gives the remaining balance

### LeaveRequest

An individual leave application.

- `startDate` / `endDate` (strings) plus `workingDays` — the actual count, excluding weekends and holidays
- `status`: `PENDING` | `APPROVED` | `REJECTED` | `CANCELLED`
- Two relations to `Employee`: `employee` (who requested it) and `decidedBy` (the manager or HR who approved or rejected it)

### SalaryStructure

One row per employee, defining their current pay structure.

- Earning components: `basic`, `hra`, `specialAllowance`, `transportAllow`
- Deduction components: `providentFund`, `professionalTax`, `healthInsurance`
- `revision` increments every time the structure is updated, so changes are tracked over time

### PayrollRun

Represents a single payroll cycle for a given month.

- `period` (for example `"2026-08"`) is unique — one run per month
- `status`: `DRAFT` | `PROCESSED` | `PAID`
- Has many `Payslip` records, one per employee included in that run

### Payslip

The generated payslip for one employee, for one payroll period.

- `totalEarnings`, `totalDeductions`, `netPay`, `paidDays`, `lopDays` (loss-of-pay days)
- `breakdownJson` stores the full line-item breakdown as serialised JSON
- Unique per `(employeeId, period)` — one payslip per employee per month

### Notification

In-app notifications sent to users.

- `type` covers events like `LEAVE_SUBMITTED`, `LEAVE_APPROVED`, `PAYSLIP_READY`, `ATTENDANCE_MISSING`, `ANNOUNCEMENT`, and others
- `readAt` is null until the user views it

### Document

Files associated with an employee — contracts, ID proofs, certificates, policies.

- `category`: `CONTRACT` | `ID_PROOF` | `CERTIFICATE` | `POLICY` | `OTHER`
- `confidential` flags documents that need restricted visibility
- `storageKey` points to where the file lives in storage, null for seeded placeholder documents

### AuditEvent

A general-purpose audit log for tracking who did what.

- Captures `actorName`, `action`, `entityType` / `entityId`, and a human-readable `summary`
- Useful for tracing changes to sensitive data — salary updates, profile edits, leave decisions

### Holiday

Company-wide holidays.

- `date` is unique — one holiday per calendar day
- `optional` flags holidays that are optional or floating rather than mandatory

### OrgSetting

A single-row table (`id` is hardcoded to `"org"`) holding company-wide configuration.

- `companyName`, `legalName`, `timezone`, `currency`
- `standardWorkMinutes` and `halfDayMinutes` define what counts as a full or half working day
- `lateGraceMinutes` — how many minutes late an employee can be before it's flagged
- `payrollDayOfMonth` — which day of the month payroll is processed

## How It All Connects

```
User ──1:1── Employee ──┬── Attendance (1:many)
                         ├── LeaveRequest (1:many, as requester)
                         ├── LeaveBalance (1:many)
                         ├── SalaryStructure (1:1)
                         ├── Payslip (1:many)
                         ├── Document (1:many)
                         └── Department (many:1)

LeaveType ──1:many── LeaveBalance
LeaveType ──1:many── LeaveRequest

PayrollRun ──1:many── Payslip ──many:1── Employee
```

## Making Schema Changes

If you modify `prisma/schema.prisma`:

```bash
npm run db:push     # apply changes to your local dev database
npm run db:seed      # reseed sample data if needed
```

To inspect the database visually:

```bash
npm run db:studio
```
