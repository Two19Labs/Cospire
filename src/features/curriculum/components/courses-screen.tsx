import Link from "next/link";

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
export const programmesHeading = "Room to learn.";

interface CoursesScreenProps {
  courses: CourseListPage;
  error: CourseListError | null;
  notice: CourseNotice | null;
  profile: Profile;
  search: string;
}

export function CoursesScreen({
  courses,
  error,
  notice,
  profile,
  search,
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
          {/* An anchor to the form further down: no JavaScript needed. */}
          <a className="button button--primary" href="#new-programme">
            <Icon name="plus" />
            New programme
          </a>
        </>
      }
      description="Organise learning programmes and the students who can access them."
      heading={programmesHeading}
      profile={profile}
      title="Programmes"
    >
      {/*
        What this section is FOR, said before what it currently holds.

        Programmes and ARS processes were the same `courses` row until
        2026-09-20, so this list showed admission processes and the ARS list
        showed learning content. `kind` separates them, and this line says what
        belongs here now that it can be answered.
      */}
      <p className="notice">
        Teachable content a student works through. Admission readiness processes
        are managed separately, under <Link href="/admin/ars">ARS</Link>.
      </p>

      {error ? (
        <p className="notice notice--error" role="alert">
          {courseListErrors[error]}
        </p>
      ) : null}

      {notice ? <p className="notice notice--success">{courseNotices[notice]}</p> : null}

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
            <Link className="button button--ghost" href="/admin/courses">
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

      {/*
        The two cards are honest placeholders: neither aptitude preparation nor
        video curriculums is built, and both are whole phases away. They are
        shown rather than hidden so the shape of the section is visible, and
        marked so nobody demonstrates them by accident.
      */}
      <section className="panel">
        <div className="panel__header">
          <h2>Curriculum capabilities</h2>
        </div>
        <div className="card-grid card-grid--two">
          <div>
            <h3>
              Aptitude preparation <span className="tag">Not built yet</span>
            </h3>
            <p className="field__hint">
              Quantitative, verbal and logical reasoning, with topic tests and
              full-length mocks. Needs the question bank and the test engine.
            </p>
          </div>
          <div>
            <h3>
              Video curriculums <span className="tag">Not built yet</span>
            </h3>
            <p className="field__hint">
              Video lessons, documents and tests in an ordered sequence, with
              progress tracking. Waiting on VdoCipher access.
            </p>
          </div>
        </div>
      </section>

      <section className="panel panel--narrow" id="new-programme">
        <div className="panel__header">
          <div>
            <h2>Add a programme</h2>
            <p className="muted">
              Nothing here is a fixed list. Name the programme however your team
              refers to it; students reach its content by being granted it.
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
      </section>
    </RoleShell>
  );
}
