import Link from "next/link";

import { SectionCards, SectionTabs, type SectionView } from "@/features/admin/components/section-views";
import { Icon } from "@/features/auth/components/icon";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { SubmitButton } from "@/shared/ui";

import { createCourseAction } from "../actions/create-course";
import { courseTitleMaxLength } from "../course-input";
import {
  buildCourseHref,
  buildCoursesHref,
  courseListErrors,
  courseNotices,
  coursesPageSize,
  type CourseListError,
  type CourseNotice,
} from "../list-params";
import type { CourseListPage } from "../queries/list-courses";

// The page heading, shared with the loading skeleton.
export const programmesHeading = "Programmes";

export const programmeViews: SectionView[] = [
  { description: "Every programme, its curriculum and who can reach it.", href: "/admin/courses?view=list", key: "list", label: "View programmes" },
  { description: "Name a new programme, then build its curriculum.", href: "/admin/courses?view=add", key: "add", label: "Add a programme" },
];

interface CoursesScreenProps {
  courses: CourseListPage;
  error: CourseListError | null;
  notice: CourseNotice | null;
  profile: Profile;
  search: string;
  // null: the landing cards; otherwise the one view shown.
  view: string | null;
}

export function CoursesScreen({
  courses,
  error,
  notice,
  profile,
  search,
  view,
}: CoursesScreenProps) {
  const { page, pageCount, rows, total } = courses;
  const firstOnPage = total === 0 ? 0 : (page - 1) * coursesPageSize + 1;
  const lastOnPage = (page - 1) * coursesPageSize + rows.length;

  return (
    <RoleShell
      actions={
        <>
          <Link className="button button--secondary" href="/admin/ars">
            Go to ARS
          </Link>
        </>
      }
      description="Organise learning programmes and the students who can access them."
      heading={programmesHeading}
      profile={profile}
      title="Programmes"
    >
      {view === null ? <SectionCards views={programmeViews} /> : <SectionTabs current={view} views={programmeViews} />}

      {error ? (
        <p className="notice notice--error" role="alert">
          {courseListErrors[error]}
        </p>
      ) : null}

      {notice ? <p className="notice notice--success">{courseNotices[notice]}</p> : null}

      {view === "list" ? <>
      <div className="list-bar">
        <p className="list-bar__count">
          {total === 0
            ? "No programmes match."
            : `Showing ${firstOnPage}-${lastOnPage} of ${total} programmes`}
        </p>
        {/*
          A GET form, so searching is a link the browser builds and the result
          is a URL that can be shared or reloaded. It needs no JavaScript.
        */}
        <form action="/admin/courses" className="row-form" method="get">
          <label className="visually-hidden" htmlFor="course-search">
            Search programmes
          </label>
          <input
            className="input"
            defaultValue={search}
            id="course-search"
            name="q"
            placeholder="Search by name"
            type="search"
          />
          <SubmitButton variant="secondary" pendingLabel="Searching…">
            Search
          </SubmitButton>
          {search ? (
            <Link className="button button--ghost" href="/admin/courses?view=list">
              Clear
            </Link>
          ) : null}
        </form>
      </div>

      {rows.length === 0 ? (
        <section className="empty-state">
          <span aria-hidden="true" className="empty-state__mark">
            <Icon name="book" />
          </span>
          <h2>{search ? "No programme by that name." : "No programmes yet."}</h2>
          <p>
            Programmes are how content is grouped: one per target institution
            per content type, such as “Ashoka — aptitude prep”.
          </p>
          <a className="button button--primary" href="#new-programme">
            Create the first one
          </a>
        </section>
      ) : (
        <div className="card-grid">
          {rows.map((course) => (
            <article className="course-card" key={course.id}>
              <div className="course-card__top">
                <span aria-hidden="true" className="initial-block">
                  {course.title.trim().charAt(0).toUpperCase() || "P"}
                </span>
                <span className="tag">Programme</span>
              </div>
              <h2>{course.title}</h2>
              <div className="course-card__bottom">
                <span className="muted">Created {course.createdAt.slice(0, 10)}</span>
                <Link className="title-link" href={buildCourseHref({ courseId: course.id })}>
                  Manage →
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="pagination">
          {page > 1 ? (
            <Link
              href={buildCoursesHref({ page: page - 1, search })}
              rel="prev"
            >
              Previous
            </Link>
          ) : (
            <span>Previous</span>
          )}
          <span>
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={buildCoursesHref({ page: page + 1, search })}
              rel="next"
            >
              Next
            </Link>
          ) : (
            <span>Next</span>
          )}
        </nav>
      ) : null}

      </> : null}

      {view === "add" ? <section className="panel panel--narrow" id="new-programme">
        <div className="panel__header">
          <div>
            <h2>Add a programme</h2>
            <p className="muted">
              Students see a programme once they are granted it.
            </p>
          </div>
        </div>

        {/*
          The Server Action is passed straight to the form, so this works with
          JavaScript disabled. No return URL travels in a field: the action
          rebuilds every destination from a literal path.
        */}
        <form action={createCourseAction} className="stack-form">
          {/* Says which section this is, so the action creates the right kind
              and returns here rather than to ARS. */}
          <input name="kind" type="hidden" value="programme" />
          <label className="field">
            <span className="field__label">Name</span>
            <input
              className="input"
              maxLength={courseTitleMaxLength}
              name="title"
              placeholder="Ashoka — aptitude prep"
              required
              type="text"
            />
          </label>

          {/*
            There is deliberately no ordering field.

            To choose a sort key by hand an admin would need to know what keys
            the other programmes already hold, and no screen tells them. The
            column still exists and `validateNewCourse` still guards it, ready
            for the drag-to-reorder control that arrives with the curriculum
            builder; until then every programme is 0 and the list reads in
            creation order, which needs no explanation.
          */}

          <SubmitButton variant="primary" pendingLabel="Creating…">
            Create programme
          </SubmitButton>
        </form>
      </section> : null}
    </RoleShell>
  );
}
