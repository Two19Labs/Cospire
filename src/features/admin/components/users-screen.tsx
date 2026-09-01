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

import { usersPageSize } from "../list-params";
import type { UserListPage } from "../queries/list-users";

function pageHref(page: number, search: string): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}

const roleLabels: Record<Profile["role"], string> = {
  admin: "Admin",
  mentor: "Mentor",
  student: "Student",
};

interface UsersScreenProps {
  profile: Profile;
  search: string;
  users: UserListPage;
}

export function UsersScreen({ profile, search, users }: UsersScreenProps) {
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
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.email}</TableCell>
                  <TableCell>{roleLabels[row.role]}</TableCell>
                  <TableCell>
                    <span className={`pill pill--${row.status}`}>
                      {row.status === "active" ? "Active" : "Disabled"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {pageCount > 1 ? (
          <nav aria-label="Pagination" className="pagination">
            {page > 1 ? (
              <Link href={pageHref(page - 1, search)} rel="prev">
                Previous
              </Link>
            ) : (
              <span className="muted">Previous</span>
            )}
            <span className="muted">
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? (
              <Link href={pageHref(page + 1, search)} rel="next">
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
