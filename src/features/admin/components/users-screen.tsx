import Link from "next/link";

import { Icon } from "@/features/auth/components/icon";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  SubmitButton,
} from "@/shared/ui";

import { assignMentorAction } from "../actions/assign-mentor";
import { setUserStatusAction } from "../actions/set-user-status";
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

// The page heading, shared with the loading skeleton so the two cannot drift.
export const usersHeading = "People, thoughtfully connected.";

// Two initials for the circle beside a name: first and last word.
function initialsOf(name: string, email: string): string {
  const words = (name || email).trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((word) => word.charAt(0).toUpperCase()).join("") || "?";
}

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
    <RoleShell
      actions={
        <Link className="button button--primary" href="/admin/users/new">
          <Icon name="plus" />
          Add a user
        </Link>
      }
      description="Manage accounts, roles and mentor assignments."
      heading={usersHeading}
      profile={profile}
      title="Users"
    >
      <section className="panel">
        {/*
          A plain GET form. Search belongs in the URL so a result page can be
          linked, reloaded and bookmarked, and it keeps this whole screen a
          Server Component with no hydration cost.
        */}
        <form action="/admin/users" className="toolbar toolbar--bleed" method="get">
          <label className="field field--inline" htmlFor="user-search">
            <span className="field__label">Search</span>
            <input
              className="input"
              defaultValue={search}
              id="user-search"
              name="q"
              placeholder="Search names or emails"
              type="search"
            />
          </label>
          <SubmitButton variant="secondary" pendingLabel="Searching…">
            Search
          </SubmitButton>
          {search ? (
            <Link className="button button--ghost" href="/admin/users">
              Clear
            </Link>
          ) : null}
        </form>

        {error ? (
          <p className="notice notice--error" role="alert">
            {userListErrors[error]}
          </p>
        ) : null}

        {rows.length === 0 ? (
          <p className="panel-empty">
            {search
              ? "No user matches that search. Try a different name or email."
              : "No users yet. Add the first one."}
          </p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name &amp; email</TableHeaderCell>
                <TableHeaderCell>Role</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Mentor</TableHeaderCell>
                <TableHeaderCell>
                  <span className="visually-hidden">Actions</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const currentMentor = mentorByStudent.get(row.id);

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="person">
                        <span aria-hidden="true" className="person__avatar">
                          {initialsOf(row.name, row.email)}
                        </span>
                        <div>
                          <strong>{row.name}</strong>
                          <span className="cell-sub">{row.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="tag tag--ink">{roleLabels[row.role]}</span>
                    </TableCell>
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
                          <SubmitButton variant="secondary" compact pendingLabel="Saving…">
                            Save
                          </SubmitButton>
                        </form>
                      )}
                    </TableCell>
                    <TableCell className="table__actions">
                      {/*
                        Deliberately absent on the admin's own row. The
                        database stops the last admin being disabled, but with
                        a second admin present it would happily let someone
                        lock themselves out of the console they are standing
                        in. The action refuses it too, in case the form is
                        posted by hand.
                      */}
                      {row.id === profile.id ? (
                        <span className="tag">Your account</span>
                      ) : (
                        <form action={setUserStatusAction}>
                          <input name="page" type="hidden" value={page} />
                          <input name="q" type="hidden" value={search} />
                          <input
                            name="userId"
                            type="hidden"
                            value={row.id}
                          />
                          <input
                            name="status"
                            type="hidden"
                            value={
                              row.status === "active" ? "disabled" : "active"
                            }
                          />
                          <SubmitButton
                            className="button--ghost"
                            compact
                            pendingLabel={row.status === "active" ? "Disabling…" : "Enabling…"}
                            variant="secondary"
                          >
                            {row.status === "active" ? "Disable" : "Enable"}
                          </SubmitButton>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <nav aria-label="Pagination" className="pagination">
          <span className="pagination__count">
            {total === 0
              ? "No users match."
              : `Showing ${firstOnPage}-${lastOnPage} of ${total} users`}
          </span>
          {pageCount > 1 ? (
            <>
              {page > 1 ? (
                <Link
                  href={buildUsersHref({ page: page - 1, search })}
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
                  href={buildUsersHref({ page: page + 1, search })}
                  rel="next"
                >
                  Next
                </Link>
              ) : (
                <span>Next</span>
              )}
            </>
          ) : null}
        </nav>
      </section>
    </RoleShell>
  );
}
