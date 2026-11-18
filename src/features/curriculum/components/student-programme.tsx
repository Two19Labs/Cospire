import Link from "next/link";

import { Icon } from "@/features/auth/components/icon";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { SubmitButton } from "@/shared/ui";

import { markTextReadAction, openDocumentItemAction } from "../actions/record-progress";
import { itemTypeLabels, splitSections, studentItemHref, studentReturnHref, type CurriculumItemType } from "../curriculum";
import type { CurriculumSection } from "../queries/get-curriculum";
import type { ModuleView, ProgrammeView, StudentProgrammeRow } from "../queries/student-programmes";

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
        <section className="empty-state">
          <span aria-hidden="true" className="empty-state__mark">
            <Icon name="book" />
          </span>
          <h2>No programmes yet.</h2>
          <p>When an administrator adds you to a programme, it appears here.</p>
        </section>
      ) : (
        // `card-grid--wide`, not `--two`: `--two` uses auto-fit, which collapses
        // the empty track, so a student with one programme got a card stretched
        // across the whole page and reading as a panel rather than a card.
        <div className="card-grid card-grid--wide">
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

interface ActionItem {
  id: number;
  refId: number | null;
  type: CurriculumItemType;
}

function ItemAction({ courseId, done, item, moduleId }: { courseId: number; done: boolean; item: ActionItem; moduleId: number | null }) {
  if (item.type === "document") {
    return (
      <form action={openDocumentItemAction}>
        <input name="courseId" type="hidden" value={courseId} />
        <input name="itemId" type="hidden" value={item.id} />
        {moduleId === null ? null : <input name="moduleId" type="hidden" value={moduleId} />}
        <SubmitButton compact pendingLabel="Opening…" variant={done ? "secondary" : "primary"}>
          {done ? "Open again" : "Open"}
        </SubmitButton>
      </form>
    );
  }
  const href = studentItemHref(courseId, item, moduleId);
  if (!href) return null;
  return (
    <Link
      className={`button button--compact ${done ? "button--secondary" : "button--primary"}`}
      href={href}
    >
      {item.type === "test"
        ? done ? "View test" : "Start test"
        : item.type === "video"
          ? done ? "Watch again" : "Watch"
          : done ? "Read again" : "Read"}
    </Link>
  );
}

function ItemRows({
  complete,
  courseId,
  items,
  moduleId = null,
}: {
  complete: Set<number>;
  courseId: number;
  items: (ActionItem & { title: string })[];
  moduleId?: number | null;
}) {
  return (
    <ol className="round-list">
      {items.map((item, index) => {
        const done = complete.has(item.id);
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
                <span className={`pill pill--${done ? "active" : "disabled"}`}>{done ? "Complete" : "Not started"}</span>
              </p>
            </div>
            <div className="round-row__actions">
              <ItemAction courseId={courseId} done={done} item={item} moduleId={moduleId} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SectionPanel({
  courseId,
  modules,
  section,
  view,
}: {
  courseId: number;
  modules: ProgrammeView["modules"] extends Map<number, infer M> ? M : never;
  section: CurriculumSection;
  view: ProgrammeView;
}) {
  const count = section.items.length + modules.length;
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>{section.title}</h2>
          <p className="muted">
            {modules.length > 0 ? `${modules.length} ${modules.length === 1 ? "module" : "modules"} · ` : ""}
            {section.items.length} {section.items.length === 1 ? "item" : "items"}
          </p>
        </div>
      </div>
      {count === 0 ? <p className="panel-empty">Nothing here yet.</p> : null}
      {modules.length > 0 ? (
        <div className="card-grid card-grid--wide">
          {modules.map((module) => (
            <Link className="course-card course-card--link" href={`/student/programmes/${courseId}/modules/${module.id}`} key={module.id}>
              <h3>{module.title}</h3>
              <ProgressMeter complete={module.complete} percent={module.percent} total={module.total} />
              <span className="course-card__bottom">
                <span>{module.percent}% complete</span>
                <span aria-hidden="true">{module.complete === 0 ? "Start" : module.complete === module.total ? "Review" : "Continue"} →</span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
      {section.items.length > 0 ? <ItemRows complete={view.complete} courseId={courseId} items={section.items} /> : null}
    </section>
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
  const { mocks, subjects } = splitSections(view.sections);

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
        <ProgressMeter complete={view.complete.size} percent={view.percent} total={view.total} />
        <p className="muted">{view.percent}% complete</p>
      </section>

      {subjects.length === 0 && !mocks ? (
        <section className="panel">
          <p className="panel-empty">Nothing has been added to this programme yet.</p>
        </section>
      ) : null}

      {subjects.map((section) => (
        <SectionPanel courseId={courseId} key={section.id} modules={view.modules.get(section.id) ?? []} section={section} view={view} />
      ))}

      {mocks ? (
        <section aria-label="Full mocks" className="panel">
          <div className="panel__header">
            <div>
              <h2>Full mocks</h2>
              <p className="muted">
                {mocks.items.length} {mocks.items.length === 1 ? "mock" : "mocks"}
              </p>
            </div>
          </div>
          {mocks.items.length === 0 ? <p className="panel-empty">No mocks yet.</p> : <ItemRows complete={view.complete} courseId={courseId} items={mocks.items} />}
        </section>
      ) : null}
    </RoleShell>
  );
}

export function StudentModuleScreen({ profile, progressFailed = false, view }: { profile: Profile; progressFailed?: boolean; view: ModuleView }) {
  const courseId = view.programme.id;
  return (
    <RoleShell
      back={{ href: `/student/programmes/${courseId}`, label: `Back to ${view.programme.title}` }}
      description="Every item is open: take them in order, or in the order that suits you."
      profile={profile}
      title={view.module.title}
    >
      {progressFailed ? (
        <p className="notice notice--error" role="alert">
          Your progress could not be saved. Try again.
        </p>
      ) : null}
      <section aria-label="Your progress in this programme" className="panel panel--strip">
        <ProgressMeter complete={view.complete.size} percent={view.percent} total={view.total} />
        <p className="muted">{view.percent}% complete in {view.programme.title}</p>
      </section>
      <section className="panel">
        {view.items.length === 0 ? (
          <p className="panel-empty">Nothing has been added to this module yet.</p>
        ) : (
          <ItemRows complete={view.complete} courseId={courseId} items={view.items} moduleId={view.module.id} />
        )}
      </section>
    </RoleShell>
  );
}

export function StudentReadingScreen({
  courseId,
  done,
  item,
  moduleId = null,
  moduleTitle = null,
  profile,
  programmeTitle,
}: {
  courseId: number;
  done: boolean;
  item: { body: string | null; id: number; title: string | null };
  moduleId?: number | null;
  moduleTitle?: string | null;
  profile: Profile;
  programmeTitle: string;
}) {
  return (
    <RoleShell
      back={{ href: studentReturnHref(courseId, moduleId), label: `Back to ${moduleId === null ? programmeTitle : (moduleTitle ?? "the module")}` }}
      description="Reading"
      profile={profile}
      title={item.title ?? "Reading"}
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
