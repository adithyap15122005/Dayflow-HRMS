import type { Metadata } from "next";

import { VerifyClient } from "./verify-client";

export const metadata: Metadata = {
  title: "Verify your email",
};

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <VerifyClient token={token ?? null} />;
}
