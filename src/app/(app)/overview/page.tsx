import type { Metadata } from "next";

import { requireActor } from "@/lib/auth/guard";
import { isManagement } from "@/lib/domain/constants";
import { getTodayState } from "@/lib/services/attendance";
import { getCommandCentre, getEmployeeHome } from "@/lib/services/insights";
import { ErrorState } from "@/components/ui/states";
import { ButtonLink } from "@/components/ui/button";

import { CommandCentreView } from "./command-centre";
import { EmployeeHomeView } from "./employee-home";

export const metadata: Metadata = {
  title: "Overview",
  description: "Live workforce status, attention queue and analytics.",
};

// Attendance and approvals change constantly; never serve a cached overview.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const { user, actor } = await requireActor();

  if (isManagement(user.role)) {
    const data = await getCommandCentre();
    return <CommandCentreView data={data} firstName={user.firstName} />;
  }

  if (!actor.employeeId) {
    return (
      <ErrorState
        title="No employee record linked"
        description="Your login exists but is not attached to an employee profile, so there is nothing to show yet."
        hint="Ask your HR team to link your account, or sign in with a seeded demo account."
        action={
          <ButtonLink href="/settings" variant="primary" size="sm">
            Open settings
          </ButtonLink>
        }
      />
    );
  }

  const [data, today] = await Promise.all([
    getEmployeeHome(actor, actor.employeeId),
    getTodayState(actor.employeeId),
  ]);

  return <EmployeeHomeView data={data} today={today} firstName={user.firstName} />;
}
