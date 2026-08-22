import type { Metadata } from "next";

import { prisma } from "@/lib/db";

import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Register for Dayflow and start tracking your workday.",
};

export default async function SignUpPage() {
  const departments = await prisma.department.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return <SignUpForm departments={departments} />;
}
