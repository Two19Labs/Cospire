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

import { assignMentorAction } from "../actions/assign-mentor";
import {
  buildUsersHref,
  userListErrors,
  usersPageSize,
  type UserListError,
} from "../list-params";
import type { MentorOption } from "../queries/list-mentors";
import type { UserListPage } from "../queries/list-users";

const roleLabels: Record<Profile["role"], string> = {
  admin: "Admin",
  mentor: "Mentor",
  student: "Student",
};

interface UsersScreenProps {
  error: UserListError | null;
  mentorByStudent: Map<string, MentorOption>;
  mentors: MentorOption[];
  profile: Profile;
  search: string;
  users: UserListPage;
}

export function UsersScreen({
  error,
  mentorByStudent,
  mentors,
  profile,
  search,
  users,
}: UsersScreenProps) {
  const { page, pageCount, rows, total } = users;
  const firstOnPage = total === 0 ? 0 : (page - 1) * usersPageSize + 1;
  const lastOnPage = (page - 1) * usersPageSize + rows.length;

  return (
    <RoleShell profile={profile} title="Users">
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>People in your organisation</h2>
            <p className="muted">
              {total === 0
                ? "No users match."
                : `Showing ${firstOnPage}-${lastOnPage} of ${total}.`}
            </p>
          </div>
          <Link className="button button--primary" href="/admin/users/new">
            Create user
          </Link>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {userListErrors[error]}
          </p>
        ) : null}

        {/*
          A plain GET form. Search belongs in the URL so a result page can be
          linked, reloaded and bookmarked, and it keeps this whole screen a
          Server Component with no hydration cost.
        */}
        <form action="/admin/users" className="toolbar" method="get">
          <label className="field field--inline" htmlFor="user-search">
            <span className="field__label">Search</span>
            <input
              className="input"
              defaultValue={search}
              id="user-search"
              name="q"
              placeholder="Name or email"
              type="search"
            />
          </label>
          <button className="button button--secondary" type="submit">
            Search
          </button>
          {search ? (
            <Link className="muted" href="/admin/users">
              Clear
            </Link>
          ) : null}
        </form>

        {rows.length === 0 ? (
          <p className="muted">
            {search
              ? "No user matches that search."
              : "No users yet. Create the first one."}
          </p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Role</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Mentor</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const currentMentor = mentorByStudent.get(row.id);

                return (
                  <TableRow key={row.id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{roleLabels[row.role]}</TableCell>
                    <TableCell>
                      <span className={`pill pill--${row.status}`}>
                        {row.status === "active" ? "Active" : "Disabled"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.role !== "student" ? (
                        <span className="muted">Not applicable</span>
                      ) : mentors.length === 0 ? (
                        <span className="muted">No mentors yet</span>
                      ) : (
                        // The Server Action is passed straight to the form, so
                        // assignment works with JavaScript disabled. The page
                        // and search term travel as values, never as a URL:
                        // the action rebuilds the destination itself, which is
                        // what stops this being an open redirect.
                        <form action={assignMentorAction} className="row-form">
                          <input name="page" type="hidden" value={page} />
                          <input name="q" type="hidden" value={search} />
                          <input
                            name="studentId"
                            type="hidden"
                            value={row.id}
                          />
                          <label
                            className="visually-hidden"
                            htmlFor={`mentor-${row.id}`}
                          >
                            Mentor for {row.name}
                          </label>
                          <select
                            className="input input--compact"
                            defaultValue={currentMentor?.id ?? ""}
                            id={`mentor-${row.id}`}
                            name="mentorId"
                          >
                            <option value="">Unassigned</option>
                            {mentors.map((mentor) => (
                              <option key={mentor.id} value={mentor.id}>
                                {mentor.name}
                              </option>
                            ))}
                          </select>
                          <button
                            className="button button--secondary button--compact"
                            type="submit"
                          >
                            Save
                          </button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {pageCount > 1 ? (
          <nav aria-label="Pagination" className="pagination">
            {page > 1 ? (
              <Link
                href={buildUsersHref({ page: page - 1, search })}
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
                href={buildUsersHref({ page: page + 1, search })}
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
    </RoleShell>
  );
}
