import Link from "next/link";

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
}

export function AdminProcesses({ error, notice, processes, profile }: AdminProcessesProps) {
  return (
    <RoleShell profile={profile} title="ARS">
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Admission readiness processes</h2>
            <p className="muted">
              The rounds a candidate works through for one institution. Learning
              content — aptitude preparation, video curriculums — lives under
              Programmes instead.
            </p>
          </div>
          <Link className="button button--secondary" href="/admin/report-templates">
            Report templates
          </Link>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {courseListErrors[error]}
          </p>
        ) : null}
        {notice ? <p className="muted">{courseNotices[notice]}</p> : null}

        {processes.length === 0 ? (
          <p className="muted">No processes yet. Create one below.</p>
        ) : (
          <div className="report-list">
            {processes.map((process) => (
              <article className="report-list__item" key={process.courseId}>
                <div>
                  <strong>{process.courseTitle}</strong>
                  <p className="muted">
                    {process.roundCount} {process.roundCount === 1 ? "round" : "rounds"}
                  </p>
                </div>
                <Link
                  className="button button--primary"
                  href={`/admin/ars/${process.courseId}`}
                >
                  {process.roundCount ? "Manage process" : "Build process"}
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <form action={createCourseAction} className="panel stack-form">
        <h3>Add a process</h3>
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
          <span className="field__hint">
            The Client&apos;s convention is institution plus content type.
          </span>
        </label>

        <button className="button button--primary" type="submit">
          Add process
        </button>
      </form>
    </RoleShell>
  );
}
