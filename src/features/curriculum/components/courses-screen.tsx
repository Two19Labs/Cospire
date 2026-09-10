import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/shared/ui";

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
    <RoleShell profile={profile} title="Programmes">
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Programmes</h2>
            <p className="muted">
              {total === 0
                ? "No programmes match."
                : `Showing ${firstOnPage}-${lastOnPage} of ${total}.`}
            </p>
          </div>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {courseListErrors[error]}
          </p>
        ) : null}

        {notice ? <p className="muted">{courseNotices[notice]}</p> : null}

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
          <button className="button button--secondary" type="submit">
            Search
          </button>
          {search ? (
            <Link className="button button--ghost" href="/admin/courses">
              Clear
            </Link>
          ) : null}
        </form>

        {rows.length === 0 ? (
          <p className="muted">
            Programmes are how content is grouped: one per target institution
            per content type, such as “Ashoka — aptitude prep”. Create the first
            one below.
          </p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Programme</TableHeaderCell>
                <TableHeaderCell>Created</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((course) => (
                <TableRow key={course.id}>
                  <TableCell>
                    <Link href={buildCourseHref({ courseId: course.id })}>
                      {course.title}
                    </Link>
                  </TableCell>
                  <TableCell>{course.createdAt.slice(0, 10)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
              <span className="muted">Previous</span>
            )}
            <span className="muted">
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
              <span className="muted">Next</span>
            )}
          </nav>
        ) : null}
      </section>

      <section className="panel panel--narrow">
        <div>
          <h2>Add a programme</h2>
          <p className="muted">
            Nothing here is a fixed list. Name the programme however your team
            refers to it; students reach its content by being granted it.
          </p>
        </div>

        {/*
          The Server Action is passed straight to the form, so this works with
          JavaScript disabled. No return URL travels in a field: the action
          rebuilds every destination from a literal path.
        */}
        <form action={createCourseAction} className="stack-form">
          <label className="field">
            <span>Name</span>
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

          <button className="button" type="submit">
            Create programme
          </button>
        </form>
      </section>
    </RoleShell>
  );
}
