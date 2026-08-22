import type { Metadata } from "next";

import { ProfileView } from "@/components/people/profile-view";
import { loadProfile } from "@/lib/services/profile-loader";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const { profile } = await loadProfile(id, "personal");
    return { title: profile.fullName, description: `${profile.jobTitle} · Dayflow record` };
  } catch {
    return { title: "Employee" };
  }
}

export default async function EmployeeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const loaded = await loadProfile(id, tab);

  return (
    <ProfileView
      profile={loaded.profile}
      tab={loaded.tab}
      data={loaded.data}
      timezone={loaded.org.timezone}
      today={loaded.org.today}
      departments={loaded.departments}
      managers={loaded.managers}
      backHref={loaded.profile.isSelf ? null : "/people"}
      isSelfView={false}
    />
  );
}
