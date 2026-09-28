import Link from "next/link";

import { Icon } from "@/features/auth/components/icon";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

import { createTemplateAction } from "../actions/template-actions";
import {
  buildTemplatesHref,
  templateErrorMessages,
  templateNoticeMessages,
  type TemplateError,
  type TemplateNotice,
} from "../list-params";
import type { TemplateListPage } from "../queries/list-templates";
import { SubmitButton } from "@/shared/ui";

// The page heading, shared with the loading skeleton.
export const templatesHeading = "Feedback with a shared language.";

export function TemplatesScreen({
  error,
  notice,
  profile,
  templates,
}: {
  error: TemplateError | null;
  notice: TemplateNotice | null;
  profile: Profile;
  templates: TemplateListPage;
}) {
  const { page, pageCount, rows, total } = templates;

  return (
    <RoleShell
      actions={
        <>
          <Link className="button button--secondary" href="/admin/report-templates/import">
            Build from a document
          </Link>
          {/* An anchor to the form further down: no JavaScript needed. */}
          <a className="button button--primary" href="#new-template">
            <Icon name="plus" />
            New template
          </a>
        </>
      }
      description="Give every mentor a consistent framework for meaningful feedback: the components of a report, their weightages, and the words a mentor may choose from."
      heading={templatesHeading}
      profile={profile}
      title="Report templates"
    >
      {error ? <p className="notice notice--error" role="alert">{templateErrorMessages[error]}</p> : null}
      {notice ? <p className="notice notice--success">{templateNoticeMessages[notice]}</p> : null}

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>ARS report templates</h2>
            <p className="muted">A mentor cannot start a report until one exists.</p>
          </div>
          {total > 0 ? <span className="tag">{total} {total === 1 ? "template" : "templates"}</span> : null}
        </div>

        {rows.length === 0 ? (
          <p className="panel-empty">No template yet. Create one below, or build one from a document.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Template</th>
                  <th scope="col">Programme</th>
                  <th scope="col">Components</th>
                  <th scope="col">Weightage</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/admin/report-templates/${row.id}`}>{row.name}</Link>
                    </td>
                    <td>{row.courseTitle ?? <span className="muted">Any programme</span>}</td>
                    <td>{row.componentCount}</td>
                    <td>
                      {row.weightageTotal === 100 ? (
                        <span className="pill pill--active">{row.weightageTotal}% · Ready</span>
                      ) : (
                        // A template that does not total 100 cannot be released
                        // against, so the list says so rather than letting a
                        // mentor discover it at the end of writing a report.
                        <span className="pill pill--disabled">{row.weightageTotal}% · Incomplete</span>
                      )}
                    </td>
                    <td>
                      <span className={row.isActive ? "tag tag--sage" : "tag"}>
                        {row.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="table__actions">
                      <Link className="title-link" href={`/admin/report-templates/${row.id}`}>Edit →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 ? (
          <nav aria-label="Pagination" className="pagination">
            {page > 1 ? (
              <Link href={buildTemplatesHref({ page: page - 1 })} rel="prev">Previous</Link>
            ) : (
              <span>Previous</span>
            )}
            <span>Page {page} of {pageCount}</span>
            {page < pageCount ? (
              <Link href={buildTemplatesHref({ page: page + 1 })} rel="next">Next</Link>
            ) : (
              <span>Next</span>
            )}
          </nav>
        ) : null}
      </section>

      <section className="panel panel--narrow" id="new-template">
        <div className="panel__header">
          <div>
            <h2>New template</h2>
            <p className="muted">Leave the programme blank for a template any programme may use.</p>
          </div>
        </div>
        <form action={createTemplateAction} className="stack-form">
          <label className="field" htmlFor="template-name">
            <span className="field__label">Name</span>
            <input
              className="input"
              id="template-name"
              maxLength={120}
              name="name"
              placeholder="Application Readiness — Final Assessment"
              required
              type="text"
            />
          </label>
          <SubmitButton variant="primary" pendingLabel="Creating…">Create template</SubmitButton>
        </form>
      </section>
    </RoleShell>
  );
}
