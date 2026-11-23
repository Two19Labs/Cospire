import type { Metadata } from "next";

import { BulkStudentsForm } from "@/features/admin/components/bulk-students-form";
import { SectionTabs } from "@/features/admin/components/section-views";
import { userViews } from "@/features/admin/components/users-screen";
import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";
import { listCourses } from "@/features/curriculum/queries/list-courses";

export const metadata: Metadata = { title: "Add students from a spreadsheet" };

// The upload's Server Action runs on this route. A class of 100 invitations
// takes a little over two minutes (`bulk-create-students.ts`).
export const maxDuration = 300;

export default async function BulkStudentsPage() {
  const profile = await requireRole("admin");
  // The courses an upload can enrol the class on (End-to-End, D62).
  const [programmes, processes] = await Promise.all([
    listCourses({ kind: "programme", page: 1, search: "" }),
    listCourses({ kind: "ars_process", page: 1, search: "" }),
  ]);

  return (
    <RoleShell
      back={{ href: "/admin/users?view=list", label: "Back to users" }}
      description="Create a class of student accounts and email each one an invitation."
      profile={profile}
      title="Add students from a spreadsheet"
    >
      <SectionTabs current="bulk" views={userViews} />
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Upload a class</h2>
            <p className="muted">
              Every student is created, or none is. A class of 100 takes about
              two minutes to invite; keep this page open until it reports back.
            </p>
          </div>
          <span className="tag tag--gold">Students</span>
        </div>
        <BulkStudentsForm processes={processes.rows} programmes={programmes.rows} />
      </section>
    </RoleShell>
  );
}
