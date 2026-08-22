import type { Metadata } from "next";

import { ProfileView } from "@/components/people/profile-view";
import { ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { requireActor } from "@/lib/auth/guard";
import { loadProfile } from "@/lib/services/profile-loader";

export const metadata: Metadata = {
  title: "My profile",
  description: "Your personal details, employment record, documents and activity.",
};

export const dynamic = "force-dynamic";

/** The employee's own record — the same component as /people/[id], self-scoped. */
export default async function MyProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { actor } = await requireActor();
  const { tab } = await searchParams;

  if (!actor.employeeId) {
    return (
      <ErrorState
        title="No employee record linked"
        description="Your sign-in exists but is not attached to an employee profile, so there is no record to show."
        hint="Ask HR to link your account, or sign in with one of the seeded demo accounts."
        action={
          <ButtonLink href="/overview" variant="primary" size="sm">
            Back to overview
          </ButtonLink>
        }
      />
    );
  }

  const loaded = await loadProfile(actor.employeeId, tab);

  return (
    <ProfileView
      profile={loaded.profile}
      tab={loaded.tab}
      data={loaded.data}
      timezone={loaded.org.timezone}
      today={loaded.org.today}
      departments={loaded.departments}
      managers={loaded.managers}
      backHref={null}
      isSelfView
    />
  );
}
