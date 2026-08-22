import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/states";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Dayflow to manage attendance, leave and payroll.",
};

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-24 w-full" />
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
