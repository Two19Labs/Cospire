import type { Metadata } from "next";

import { SectionTabs } from "@/features/admin/components/section-views";
import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";
import { MockImportScreen } from "@/features/question-bank/components/mock-import-screen";
import { mockViews } from "@/features/question-bank/components/mocks-screen";

export const metadata: Metadata = { title: "Build a mock from a document" };

export default async function ImportMockPage() {
  const profile = await requireRole("admin");
  return (
    <RoleShell
      back={{ href: "/admin/mocks?view=list", label: "Back to mock tests" }}
      description="Write the mock as a plain document that quotes question IDs, paste it in, check what it resolves to, then build it."
      profile={profile}
      title="Build a mock from a document"
    >
      <SectionTabs current="import" views={mockViews} />
      <MockImportScreen />
    </RoleShell>
  );
}
