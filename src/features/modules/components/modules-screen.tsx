import Link from "next/link";

import { Icon } from "@/features/auth/components/icon";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { SubmitButton } from "@/shared/ui";

import { createModuleAction } from "../actions/module-actions";
import { buildModuleHref, buildModulesHref, moduleMessages, moduleTitleMaxLength, modulesPageSize, type ModuleMessage } from "../modules";
import type { ModuleListPage } from "../queries/list-modules";

// The page heading, shared with the loading skeleton.
export const modulesHeading = "Modules";

interface ModulesScreenProps {
  message: ModuleMessage | null;
  modules: ModuleListPage;
  profile: Profile;
  search: string;
}

export function ModulesScreen({ message, modules, profile, search }: ModulesScreenProps) {
  const { page, pageCount, rows, total } = modules;
  const first = total === 0 ? 0 : (page - 1) * modulesPageSize + 1;
  const notice = message ? moduleMessages[message] : null;

  return (
    <RoleShell
      description="Build a topic once, then attach it to any number of programmes."
      heading={modulesHeading}
      profile={profile}
      title="Modules"
    >
      {notice ? (
        <p className={`notice ${notice.error ? "notice--error" : "notice--success"}`} role={notice.error ? "alert" : undefined}>
          {notice.text}
        </p>
      ) : null}

      <div className="list-bar">
        <p className="list-bar__count">
          {total === 0 ? "No modules match." : `Showing ${first}-${first + rows.length - 1} of ${total} modules`}
        </p>
        <form action="/admin/modules" className="row-form" method="get">
          <label className="visually-hidden" htmlFor="module-search">
            Search modules
          </label>
          <input className="input" defaultValue={search} id="module-search" name="q" placeholder="Search by title" type="search" />
          <SubmitButton pendingLabel="Searching…" variant="secondary">
            Search
          </SubmitButton>
          {search ? (
            <Link className="button button--ghost" href="/admin/modules">
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
          <h2>{search ? "No module by that title." : "No modules yet."}</h2>
          <p>A module is one topic, such as “Time and Work”, with its videos, documents, tests and readings in order.</p>
        </section>
      ) : (
        <section className="panel">
          <ul className="round-list">
            {rows.map((row) => (
              <li className="round-row" key={row.id}>
                <div className="round-row__main">
                  <h3>
                    <Link className="title-link" href={buildModuleHref(row.id)}>
                      {row.title}
                    </Link>
                  </h3>
                  <p>
                    {row.programmeCount === 0
                      ? "Not used in any programme"
                      : `Used in ${row.programmeCount} programme${row.programmeCount === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="round-row__actions">
                  <Link className="button button--secondary" href={buildModuleHref(row.id)}>
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="pagination">
          {page > 1 ? (
            <Link href={buildModulesHref({ page: page - 1, search })} rel="prev">
              Previous
            </Link>
          ) : (
            <span>Previous</span>
          )}
          <span>
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={buildModulesHref({ page: page + 1, search })} rel="next">
              Next
            </Link>
          ) : (
            <span>Next</span>
          )}
        </nav>
      ) : null}

      <section className="panel panel--narrow" id="new-module">
        <div className="panel__header">
          <div>
            <h2>Add a module</h2>
            <p className="muted">Name it, then add its items on the next screen.</p>
          </div>
        </div>
        <form action={createModuleAction} className="stack-form">
          <label className="field">
            <span className="field__label">Title</span>
            <input className="input" maxLength={moduleTitleMaxLength} name="title" placeholder="Time and Work" required type="text" />
          </label>
          <SubmitButton pendingLabel="Creating…" variant="primary">
            Create module
          </SubmitButton>
        </form>
      </section>
    </RoleShell>
  );
}
