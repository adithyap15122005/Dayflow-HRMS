"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input, OptionCards, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { checkPasswordStrength, PASSWORD_RULES } from "@/lib/auth/password-policy";
import { api, ApiError } from "@/lib/client/api";
import { cn } from "@/lib/cn";

type Department = { id: string; name: string };

const STRENGTH_LABEL = ["Very weak", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_CLASS = [
  "bg-danger",
  "bg-danger",
  "bg-warning",
  "bg-info",
  "bg-success",
];

export function SignUpForm({ departments }: { departments: Department[] }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<{ message: string; hint?: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ verifyUrl: string; email: string } | null>(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    employeeCode: "",
    email: "",
    password: "",
    jobTitle: "",
    departmentId: departments[0]?.id ?? "",
    role: "EMPLOYEE" as "EMPLOYEE" | "HR",
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  const strength = useMemo(() => checkPasswordStrength(form.password), [form.password]);

  async function submit() {
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const result = await api.post<{ verifyUrl: string; email: string }>(
        "/api/auth/sign-up",
        form,
      );
      setDone({ verifyUrl: result.verifyUrl, email: result.email });
      toast.success("Account created", "One more step: verify your email address.");
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError({ message: error.message, hint: error.hint });
        if (error.fields) setFieldErrors(error.fields);
      } else {
        setFormError({ message: "Registration failed. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="animate-rise">
        <span className="grid size-11 place-items-center rounded-xl bg-success-soft">
          <svg aria-hidden viewBox="0 0 20 20" className="size-5 fill-success">
            <path d="M10 1.7a8.3 8.3 0 1 0 0 16.6 8.3 8.3 0 0 0 0-16.6Zm4 6.3-4.9 4.9a1 1 0 0 1-1.4 0L5.9 11.1A1 1 0 1 1 7.3 9.7l1.1 1.1L12.6 6.6A1 1 0 0 1 14 8Z" />
          </svg>
        </span>
        <h1 className="mt-4 text-[1.5rem] font-semibold tracking-tight">
          Verify your email
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          We created your Dayflow account for{" "}
          <span className="font-medium text-ink">{done.email}</span>. Email delivery is
          intentionally not wired up in this build, so the verification link is shown
          here and printed to the server console.
        </p>
        <div className="mt-5 rounded-lg border border-line bg-surface-2 p-4">
          <p className="text-[0.6875rem] font-semibold tracking-wider text-ink-4 uppercase">
            Verification link
          </p>
          <p className="mt-1.5 font-mono text-[0.75rem] break-all text-ink-2">
            {done.verifyUrl}
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={done.verifyUrl}
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand px-5 text-[0.9375rem] font-medium text-white shadow-e1 transition-colors hover:bg-brand-hover"
          >
            Verify now
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex h-11 items-center justify-center rounded-md border border-line-2 bg-surface px-5 text-[0.9375rem] font-medium text-ink shadow-e1 transition-colors hover:bg-surface-2"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <h1 className="text-[1.625rem] font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-sm text-ink-3">
        Registering creates an employee record on probation. HR confirms your
        employment details afterwards.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        noValidate
      >
        {formError ? <FormError message={formError.message} hint={formError.hint} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" error={fieldErrors.firstName} required>
            <Input
              id="firstName"
              autoComplete="given-name"
              required
              value={form.firstName}
              error={fieldErrors.firstName}
              onChange={(e) => set("firstName", e.target.value)}
            />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={fieldErrors.lastName} required>
            <Input
              id="lastName"
              autoComplete="family-name"
              required
              value={form.lastName}
              error={fieldErrors.lastName}
              onChange={(e) => set("lastName", e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Employee ID"
          htmlFor="employeeCode"
          error={fieldErrors.employeeCode}
          hint="Provided by your HR team, e.g. DF-0031."
          required
        >
          <Input
            id="employeeCode"
            required
            placeholder="DF-0031"
            value={form.employeeCode}
            error={fieldErrors.employeeCode}
            hint
            onChange={(e) => set("employeeCode", e.target.value.toUpperCase())}
          />
        </Field>

        <Field label="Work email" htmlFor="email" error={fieldErrors.email} required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@dayflow.io"
            value={form.email}
            error={fieldErrors.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          error={fieldErrors.password}
          required
          hint={PASSWORD_RULES.join(" · ")}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            error={fieldErrors.password}
            hint
            onChange={(e) => set("password", e.target.value)}
          />
          {form.password ? (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <div className="flex h-1 flex-1 gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-full flex-1 rounded-full transition-colors",
                        i < strength.score + (strength.ok ? 1 : 0)
                          ? STRENGTH_CLASS[strength.score]
                          : "bg-surface-3",
                      )}
                    />
                  ))}
                </div>
                <span className="text-[0.6875rem] font-medium text-ink-3">
                  {STRENGTH_LABEL[strength.score]}
                </span>
              </div>
              {!strength.ok ? (
                <p className="mt-1 text-[0.75rem] text-ink-3">{strength.problems[0]}</p>
              ) : null}
            </div>
          ) : null}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job title" htmlFor="jobTitle" error={fieldErrors.jobTitle} required>
            <Input
              id="jobTitle"
              required
              placeholder="Software Engineer"
              value={form.jobTitle}
              error={fieldErrors.jobTitle}
              onChange={(e) => set("jobTitle", e.target.value)}
            />
          </Field>
          <Field
            label="Department"
            htmlFor="departmentId"
            error={fieldErrors.departmentId}
            required
          >
            <Select
              id="departmentId"
              required
              value={form.departmentId}
              error={fieldErrors.departmentId}
              onChange={(e) => set("departmentId", e.target.value)}
            >
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div>
          <p className="mb-1.5 text-[0.8125rem] font-medium text-ink-2">Account type</p>
          <OptionCards
            name="Account type"
            value={form.role}
            onSelect={(value) => set("role", value)}
            options={[
              {
                value: "EMPLOYEE",
                label: "Employee",
                description: "Own profile, attendance, leave and payslips.",
              },
              {
                value: "HR",
                label: "HR officer",
                description: "Manage people, approve leave, run reports.",
              },
            ]}
          />
        </div>

        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-5 text-center text-[0.8125rem] text-ink-3">
        Already registered?{" "}
        <Link href="/sign-in" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
