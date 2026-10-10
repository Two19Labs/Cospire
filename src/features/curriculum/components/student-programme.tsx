import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { SubmitButton } from "@/shared/ui";

import { markTextReadAction, openDocumentItemAction } from "../actions/record-progress";
import { itemTypeLabels, studentItemHref } from "../curriculum";
import type { CurriculumItem } from "../queries/get-curriculum";
import type { ProgrammeView, StudentProgrammeRow } from "../queries/student-programmes";

import { ProgressMeter } from "./progress-meter";

export function StudentProgrammeList({
  page,
  pageCount,
  profile,
  rows,
}: {
  page: number;
  pageCount: number;
  profile: Profile;
  rows: StudentProgrammeRow[];
}) {
  return (
    <RoleShell description="Every programme you have been given, and how far through each you are." profile={profile} title="Programmes">
      {rows.length === 0 ? (
        <section className="panel">
          <p className="panel-empty">No programmes yet. Your admin adds you to them.</p>
        </section>
      ) : (
        <div className="card-grid card-grid--two">
          {rows.map((row) => (
            <ProgrammeCard key={row.id} row={row} />
          ))}
        </div>
      )}
      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="pagination">
          {page > 1 ? <Link href={`/student/programmes?page=${page - 1}`} rel="prev">Previous</Link> : <span className="muted">Previous</span>}
          <span className="muted">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? <Link href={`/student/programmes?page=${page + 1}`} rel="next">Next</Link> : <span className="muted">Next</span>}
        </nav>
      ) : null}
    </RoleShell>
  );
}

// One programme as a card: the whole card is the link, so a phone has a large
// target, and the progress sits under the title as in the prototype.
export function ProgrammeCard({ row }: { row: StudentProgrammeRow }) {
  return (
    <Link className="course-card course-card--link" href={`/student/programmes/${row.id}`}>
      <h2>{row.title}</h2>
      <ProgressMeter complete={row.complete} percent={row.percent} total={row.total} />
      <span className="course-card__bottom">
        <span>{row.percent}% complete</span>
        <span aria-hidden="true">{row.complete === 0 ? "Start" : row.complete === row.total ? "Review" : "Continue"} →</span>
      </span>
    </Link>
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
      description="Every item is open: take them in order, or in the order that suits you."
      profile={profile}
      title={view.programme.title}
    >
      {progressFailed ? (
        <p className="notice notice--error" role="alert">
          Your progress could not be saved. Try again.
        </p>
      ) : null}

      <section aria-label="Your progress" className="panel panel--strip">
        <ProgressMeter complete={view.complete.size} percent={view.percent} total={total} />
        <p className="muted">{view.percent}% complete</p>
      </section>

      {view.sections.length === 0 ? (
        <section className="panel">
          <p className="panel-empty">Nothing has been added to this programme yet.</p>
        </section>
      ) : null}

      {view.sections.map((section) => (
        <section className="panel" key={section.id}>
          <div className="panel__header">
            <div>
              <h2>{section.title}</h2>
              <p className="muted">
                {section.items.length} {section.items.length === 1 ? "item" : "items"}
              </p>
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
