import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

import type { AdminProcessRow } from "../queries/list-processes";

export function AdminProcesses({ profile, processes }: { profile: Profile; processes: AdminProcessRow[] }) {
  return <RoleShell profile={profile} title="ARS">
    <section className="panel">
      <div className="panel__header"><div><h2>Admission readiness processes</h2><p className="muted">Build and manage the rounds students complete. Programme membership and access stay under Programmes.</p></div><Link className="button button--secondary" href="/admin/report-templates">Report templates</Link></div>
      {processes.length === 0 ? <p className="muted">Create a programme first, then its ARS process will appear here.</p> : <div className="report-list">{processes.map((process) => <article className="report-list__item" key={process.courseId}><div><strong>{process.courseTitle}</strong><p className="muted">{process.roundCount} {process.roundCount === 1 ? "round" : "rounds"}</p></div><Link className="button button--primary" href={`/admin/ars/${process.courseId}`}>{process.roundCount ? "Manage process" : "Build process"}</Link></article>)}</div>}
    </section>
  </RoleShell>;
}
