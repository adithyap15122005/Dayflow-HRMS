"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";

type DemoAccount = {
  email: string;
  label: string;
  role: string;
  detail: string;
};

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "admin@dayflow.io",
    label: "Neha Kapoor",
    role: "Administrator",
    detail: "Full access · payroll processing",
  },
  {
    email: "hr@dayflow.io",
    label: "Arjun Malhotra",
    role: "HR Officer",
    detail: "People, approvals, reports",
  },
  {
    email: "employee@dayflow.io",
    label: "Aarav Mehta",
    role: "Employee",
    detail: "Own attendance, leave, payslips",
  },
];

const DEMO_PASSWORD = "Dayflow@2026";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<{ message: string; hint?: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [needsVerification, setNeedsVerification] = useState(false);

  const nextPath = params.get("next");

  async function submit(nextEmail: string, nextPassword: string) {
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    setNeedsVerification(false);
    try {
      const result = await api.post<{ redirectTo: string; name: string }>(
        "/api/auth/sign-in",
        { email: nextEmail, password: nextPassword },
      );
      toast.success(`Welcome back, ${result.name.split(" ")[0]}`);
      const destination = nextPath && nextPath.startsWith("/") ? nextPath : result.redirectTo;
      startTransition(() => {
        router.replace(destination);
        router.refresh();
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError({ message: error.message, hint: error.hint });
        if (error.fields) setFieldErrors(error.fields);
        if (error.code === "FORBIDDEN" && /verify/i.test(error.message)) {
          setNeedsVerification(true);
        }
      } else {
        setFormError({ message: "Sign-in failed. Please try again." });
      }
      setBusy(false);
    }
  }

  const loading = busy || pending;

  return (
    <div className="animate-rise">
      <h1 className="text-[1.625rem] font-semibold tracking-tight">Sign in to Dayflow</h1>
      <p className="mt-1.5 text-sm text-ink-3">
        Use your work email. Sessions expire automatically for security.
      </p>

      <form
        className="mt-7 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(email, password);
        }}
        noValidate
      >
        {formError ? <FormError message={formError.message} hint={formError.hint} /> : null}

        {needsVerification ? (
          <p className="rounded-lg border border-info/20 bg-info-soft px-3.5 py-2.5 text-[0.8125rem] text-info-ink">
            This account still needs email verification. Check the server console for
            the link, or{" "}
            <Link href="/sign-up" className="font-semibold underline">
              register again
            </Link>
            .
          </p>
        ) : null}

        <Field label="Work email" htmlFor="email" error={fieldErrors.email} required>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            placeholder="you@dayflow.io"
            value={email}
            error={fieldErrors.email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          error={fieldErrors.password}
          required
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••••"
            value={password}
            error={fieldErrors.password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-5 text-center text-[0.8125rem] text-ink-3">
        New to Dayflow?{" "}
        <Link href="/sign-up" className="font-semibold text-brand hover:underline">
          Create an account
        </Link>
      </p>

      {/* ------------------------------------------------ demo quick access */}
      <div className="mt-8 rounded-xl border border-line bg-surface-2 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[0.8125rem] font-semibold text-ink">Demo accounts</p>
          <span className="font-mono text-[0.6875rem] text-ink-3">{DEMO_PASSWORD}</span>
        </div>
        <p className="mt-1 text-[0.75rem] leading-snug text-ink-3">
          Seeded locally by <code className="font-mono">npm run db:seed</code>. One click
          signs you in so you can compare what each role is allowed to see.
        </p>
        <ul className="mt-3 space-y-2">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email}>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setEmail(account.email);
                  setPassword(DEMO_PASSWORD);
                  void submit(account.email, DEMO_PASSWORD);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-line-2 bg-surface px-3 py-2.5 text-left transition-colors hover:border-brand hover:bg-brand-soft disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[0.8125rem] font-medium text-ink">
                    {account.label}
                    <span className="ml-1.5 font-normal text-ink-3">· {account.role}</span>
                  </span>
                  <span className="block truncate text-[0.75rem] text-ink-3">
                    {account.detail}
                  </span>
                </span>
                <svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  className="size-3.5 shrink-0 fill-ink-4"
                >
                  <path d="M6.2 3.3 10.9 8l-4.7 4.7-1.1-1.1L8.7 8 5.1 4.4l1.1-1.1Z" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
