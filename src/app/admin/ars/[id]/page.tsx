import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RoundsPanel, roundModeShortLabels } from "@/features/ars/components/rounds-panel";
import {
  parseRoundError,
  parseRoundNotice,
  roundErrorKey,
  roundNoticeKey,
} from "@/features/ars/list-params";
import { listRounds } from "@/features/ars/queries/list-rounds";
import { Icon } from "@/features/auth/components/icon";
import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";
import {
  CourseAccessPanel,
  CourseMoveForm,
} from "@/features/curriculum/components/course-access-panel";
import {
  courseListErrors,
  courseNotices,
  parseCourseId,
  parseCourseListError,
  parseCourseNotice,
} from "@/features/curriculum/list-params";
import { getCourse } from "@/features/curriculum/queries/get-course";
import { listCourseAccess } from "@/features/curriculum/queries/list-course-access";

export const metadata: Metadata = { title: "ARS process" };

function firstValue(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

export default async function AdminArsProcessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");

  const courseId = parseCourseId((await params).id);
  if (courseId === null) notFound();

  // A row this admin may not see comes back as null and becomes a 404, for the
  // same reason the programme detail page does it: telling another
  // organisation's admin that something exists but is not theirs is itself a
  // disclosure.
  const [course, rounds, students] = await Promise.all([
    getCourse(courseId),
    listRounds(courseId),
    listCourseAccess(courseId),
  ]);
  if (!course) notFound();

  const query = await searchParams;
  const error = parseCourseListError(firstValue(query.error));
  const notice = parseCourseNotice(firstValue(query.notice));

  const granted = students.filter((student) => student.granted).length;
  const modes = [...new Set(rounds.map((round) => round.submissionMode))];

  return (
    <RoleShell
      actions={
        <>
          {/*
            The two ways to build a process, side by side. Adding rounds by
            hand remains the default; the importer is for an institution's
            whole admission process written down in a document.
          */}
          <Link className="button button--secondary" href={`/admin/ars/${courseId}/import`}>
            Build from a document
          </Link>
          <a className="button button--primary" href="#add-round">
            <Icon name="plus" />
            Add a round
          </a>
        </>
      }
      back={{ href: "/admin/ars", label: "All ARS processes" }}
      description="An admission readiness process. Build a thoughtful journey, one round at a time."
      profile={profile}
      title={course.title}
    >
      {/* In-page sections rather than tabs that need JavaScript. */}
      <nav aria-label="Page sections" className="tabs">
        <a className="tabs__link tabs__link--current" href="#rounds">
          Rounds
        </a>
        <a className="tabs__link" href="#students">
          Student access
        </a>
        <a className="tabs__link" href="#settings">
          Process settings
        </a>
      </nav>

      {error ? (
        <p className="notice notice--error" role="alert">
          {courseListErrors[error]}
        </p>
      ) : null}
      {notice ? <p className="notice notice--success">{courseNotices[notice]}</p> : null}

      <div className="two-col">
        <div className="two-col__main">
          <RoundsPanel
            courseId={courseId}
            error={parseRoundError(firstValue(query[roundErrorKey]))}
            notice={parseRoundNotice(firstValue(query[roundNoticeKey]))}
            rounds={rounds}
          />
        </div>

        <aside className="summary-rail">
          <section className="panel">
            <div className="panel__header">
              <h2>At a glance</h2>
            </div>
            <div>
              <p className="summary-row">
                <span>Rounds</span>
                <strong>{rounds.length}</strong>
              </p>
              <p className="summary-row">
                <span>Round types</span>
                <strong>
                  {modes.length === 0 ? "None yet" : modes.map((mode) => roundModeShortLabels[mode]).join(", ")}
                </strong>
              </p>
              <p className="summary-row">
                <span>Student access</span>
                <strong>
                  {granted} student{granted === 1 ? "" : "s"}
                </strong>
              </p>
            </div>
            <Link className="button button--secondary button--compact" href="/admin/report-templates">
              Manage report templates
            </Link>
          </section>
        </aside>
      </div>

      {/*
        Granting lives here as well as on the programme screen. Before this the
        only way to put a student on an ARS process was through Programmes,
        which is precisely what made the two sections inseparable.
      */}
      <CourseAccessPanel courseId={courseId} kind="ars_process" students={students} />

      <section className="panel" id="settings">
        <div className="panel__header">
          <div>
            <h2>Process classification</h2>
            <p className="muted">
              Keep programme and admission-readiness content organised. If this
              belongs with teaching content, move it to Programmes.
            </p>
          </div>
        </div>
        <CourseMoveForm courseId={courseId} kind="ars_process" />
      </section>
    </RoleShell>
  );
}
