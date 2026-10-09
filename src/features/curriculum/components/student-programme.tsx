import Link from "next/link";
import type { CSSProperties } from "react";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { SubmitButton } from "@/shared/ui";

import { markTextReadAction, openDocumentItemAction } from "../actions/record-progress";
import { itemTypeLabels, studentItemHref } from "../curriculum";
import type { CurriculumItem } from "../queries/get-curriculum";
import type { ProgrammeView, StudentProgramme } from "../queries/student-programmes";

export function StudentProgrammeList({
  page,
  pageCount,
  profile,
  rows,
}: {
  page: number;
  pageCount: number;
  profile: Profile;
  rows: StudentProgramme[];
}) {
  return (
    <RoleShell description="The programmes you have been given." profile={profile} title="Programmes">
      <section className="panel">
        {rows.length === 0 ? (
          <p className="panel-empty">No programmes yet. Your admin grants them.</p>
        ) : (
          <ol className="round-list">
            {rows.map((row, index) => (
              <li className="round-row" key={row.id}>
                <span aria-hidden="true" className="round-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="round-row__main">
                  <h3>
                    <Link className="title-link" href={`/student/programmes/${row.id}`}>
                      {row.title}
                    </Link>
                  </h3>
                </div>
              </li>
            ))}
          </ol>
        )}
        {pageCount > 1 ? (
          <p className="pagination">
            Page {page} of {pageCount}
            {page > 1 ? <Link href={`/student/programmes?page=${page - 1}`}> Previous</Link> : null}
            {page < pageCount ? <Link href={`/student/programmes?page=${page + 1}`}> Next</Link> : null}
          </p>
        ) : null}
      </section>
    </RoleShell>
  );
}

function ItemAction({ courseId, done, item }: { courseId: number; done: boolean; item: CurriculumItem }) {
  if (item.type === "document") {
    return (
      <form action={openDocumentItemAction}>
        <input name="courseId" type="hidden" value={courseId} />
        <input name="itemId" type="hidden" value={item.id} />
        <SubmitButton compact pendingLabel="Opening…" variant={done ? "secondary" : "primary"}>
          {done ? "Open again" : "Open"}
        </SubmitButton>
      </form>
    );
  }
  const href = studentItemHref(courseId, item);
  if (!href) return null;
  return (
    <Link
      className={`button button--compact ${done ? "button--secondary" : "button--primary"}`}
      href={href}
    >
      {item.type === "test" ? (done ? "View test" : "Start test") : done ? "Read again" : "Read"}
    </Link>
  );
}

export function StudentProgrammeScreen({
  profile,
  progressFailed,
  view,
}: {
  profile: Profile;
  progressFailed: boolean;
  view: ProgrammeView;
}) {
  const courseId = view.programme.id;
  const total = view.sections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <RoleShell
      back={{ href: "/student/programmes", label: "Back to programmes" }}
      description={`${view.complete.size} of ${total} items complete`}
      profile={profile}
      title={view.programme.title}
    >
      {progressFailed ? (
        <p className="notice notice--error" role="alert">
          Your progress could not be saved. Try again.
        </p>
      ) : null}

      <section className="panel">
        <div className="panel__header">
          <h2>Your progress</h2>
          <div className="step-progress">
            <p className="muted">{view.percent}% complete</p>
            <div
              aria-hidden="true"
              className="step-progress__track"
              // The value is data, not design.
              style={{ "--progress": `${view.percent}%` } as CSSProperties}
            >
              <span className="step-progress__fill" />
            </div>
          </div>
        </div>
      </section>

      {view.sections.length === 0 ? (
        <section className="panel">
          <p className="panel-empty">Nothing has been added to this programme yet.</p>
        </section>
      ) : null}

      {view.sections.map((section, sectionIndex) => (
        <section className="panel" key={section.id}>
          <div className="panel__header">
            <div>
              <h2>{section.title}</h2>
              <p className="muted">Section {sectionIndex + 1}</p>
            </div>
          </div>
          {section.items.length === 0 ? (
            <p className="panel-empty">Nothing here yet.</p>
          ) : (
            <ol className="round-list">
              {section.items.map((item, index) => {
                const done = view.complete.has(item.id);
                return (
                  <li className="round-row" key={item.id}>
                    <span aria-hidden="true" className="round-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="round-row__main">
                      <h3>{item.title}</h3>
                      <p>
                        {itemTypeLabels[item.type]}
                        {" · "}
                        <span className={`pill pill--${done ? "active" : "disabled"}`}>
                          {done ? "Complete" : "Not started"}
                        </span>
                      </p>
                    </div>
                    <div className="round-row__actions">
                      <ItemAction courseId={courseId} done={done} item={item} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ))}
    </RoleShell>
  );
}

export function StudentReadingScreen({
  courseId,
  done,
  item,
  profile,
  programmeTitle,
}: {
  courseId: number;
  done: boolean;
  item: CurriculumItem;
  profile: Profile;
  programmeTitle: string;
}) {
  return (
    <RoleShell
      back={{ href: `/student/programmes/${courseId}`, label: `Back to ${programmeTitle}` }}
      description="Reading"
      profile={profile}
      title={item.title}
    >
      <section className="panel">
        <div className="report-copy">
          {(item.body ?? "").split(/\n{2,}/).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        {done ? (
          <p className="notice notice--success">You have marked this as read.</p>
        ) : (
          <form action={markTextReadAction}>
            <input name="courseId" type="hidden" value={courseId} />
            <input name="itemId" type="hidden" value={item.id} />
            <SubmitButton pendingLabel="Saving…">Mark as read</SubmitButton>
          </form>
        )}
      </section>
    </RoleShell>
  );
}
