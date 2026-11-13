import Link from "next/link";

import { SectionCards, SectionTabs, type SectionView } from "@/features/admin/components/section-views";
import { Icon } from "@/features/auth/components/icon";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { createCourseAction } from "@/features/curriculum/actions/create-course";
import { courseTitleMaxLength } from "@/features/curriculum/course-input";
import {
  courseListErrors,
  courseNotices,
  type CourseListError,
  type CourseNotice,
} from "@/features/curriculum/list-params";

import type { AdminProcessRow } from "../queries/list-processes";
import { SubmitButton } from "@/shared/ui";

// The ARS section's own front page.
//
// It creates its own processes now. Until 2026-09-20 it could only list what
// the Programmes screen had made, and said so in its empty state -- "Create a
// programme first" -- which meant the two sections were separate in name and
// joined at the hip in practice. A section that cannot make the thing it is
// about is not a section.
//
// A process is still a `courses` row; `kind` is what makes it this one. The
// hidden field is a closed set, so it decides what is created and which screen
// the action returns to, and nothing else.

interface AdminProcessesProps {
  error: CourseListError | null;
  notice: CourseNotice | null;
  processes: AdminProcessRow[];
  profile: Profile;
  // null: the landing cards; otherwise the one view shown.
  view: string | null;
}

export const arsViews: SectionView[] = [
  { description: "Every institution's admission process and its rounds.", href: "/admin/ars?view=list", key: "list", label: "View processes" },
  { description: "Start a process for an institution, then add its rounds.", href: "/admin/ars?view=add", key: "add", label: "Add a process" },
];

// The page heading, shared with the loading skeleton.
export const arsHeading = "ARS processes";

export function AdminProcesses({ error, notice, processes, profile, view }: AdminProcessesProps) {
  return (
    <RoleShell
      actions={
        <>
          <Link className="button button--secondary" href="/admin/report-templates">
            Report templates
          </Link>
        </>
      }
      description="Create an admission journey for each institution: the rounds a candidate works through, from application to interview."
      heading={arsHeading}
      profile={profile}
      title="ARS"
    >
      {view === null ? <SectionCards views={arsViews} /> : <SectionTabs current={view} views={arsViews} />}
      {error ? (
        <p className="notice notice--error" role="alert">
          {courseListErrors[error]}
        </p>
      ) : null}
      {notice ? <p className="notice notice--success">{courseNotices[notice]}</p> : null}

      {view !== "list" ? null : processes.length === 0 ? (
        <section className="empty-state">
          <span aria-hidden="true" className="empty-state__mark">
            <Icon name="grid" />
          </span>
          <h2>No processes yet.</h2>
          <p>A process holds the rounds a candidate works through for one institution.</p>
          <Link className="button button--primary" href="/admin/ars?view=add">
            Create the first one
          </Link>
        </section>
      ) : (
        <div className="card-grid">
          {processes.map((process) => (
            <article className="course-card" key={process.courseId}>
              <div className="course-card__top">
                <span aria-hidden="true" className="initial-block">
                  {process.courseTitle.trim().charAt(0).toUpperCase() || "A"}
                </span>
                <span className={process.roundCount ? "tag tag--sage" : "tag"}>
                  {process.roundCount} {process.roundCount === 1 ? "round" : "rounds"}
                </span>
              </div>
              <h2>{process.courseTitle}</h2>
              <div className="course-card__bottom">
                <span className="muted">Application readiness</span>
                <Link className="title-link" href={`/admin/ars/${process.courseId}`}>
                  {process.roundCount ? "Manage process →" : "Build process →"}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {view === "add" ? <section className="panel panel--narrow" id="new-process">
        <div className="panel__header">
          <div>
            <h2>Add a process</h2>
            <p className="muted">One per institution, named the way your team refers to it.</p>
          </div>
        </div>
        <form action={createCourseAction} className="stack-form">
          {/*
            What makes this an ARS process rather than a programme. A closed set
            read server-side, so the form says which of two sections it belongs to
            and cannot steer the redirect anywhere else.
          */}
          <input name="kind" type="hidden" value="ars_process" />

          <label className="field">
            <span className="field__label">Name</span>
            <input
              className="input"
              maxLength={courseTitleMaxLength}
              name="title"
              placeholder="Masters' Union - ARS"
              required
              type="text"
            />
          </label>

          <SubmitButton variant="primary" pendingLabel="Adding…">
            Add process
          </SubmitButton>
        </form>
      </section> : null}
    </RoleShell>
  );
}
