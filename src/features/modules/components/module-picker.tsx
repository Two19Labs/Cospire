import Link from "next/link";

import { Hidden } from "@/features/curriculum/components/curriculum-builder";
import { SubmitButton } from "@/shared/ui";

import { attachModuleAction } from "../actions/attachment-actions";
import type { ModuleListPage } from "../queries/list-modules";

// Attach a library module to a subject: a searchable, paginated list. The
// search is a GET so it works without JavaScript and the page is linkable.
export function ModulePicker({
  courseId,
  pages,
  picker,
  search,
  subjects,
}: {
  courseId: number;
  // The other pickers' current pages, so paging modules leaves them where they are.
  pages: Record<string, number>;
  picker: ModuleListPage;
  search: string;
  subjects: { id: number; title: string }[];
}) {
  const href = (page: number) => {
    const params = new URLSearchParams(Object.entries(pages).map(([key, value]) => [key, String(value)]));
    if (search) params.set("mq", search);
    if (page > 1) params.set("mpage", String(page));
    return `/admin/courses/${courseId}?${params.toString()}#attach-module`;
  };

  return (
    <section className="panel" id="attach-module">
      <div className="panel__header">
        <div>
          <h2>Attach a module</h2>
          <p className="muted">Choose a subject, then a module from the library. Added to the end of the subject.</p>
        </div>
      </div>

      <form action={`/admin/courses/${courseId}`} className="row-form" method="get">
        <label className="visually-hidden" htmlFor="module-picker-search">
          Search modules
        </label>
        <input className="input" defaultValue={search} id="module-picker-search" name="mq" placeholder="Search modules by title" type="search" />
        <SubmitButton pendingLabel="Searching…" variant="secondary">
          Search
        </SubmitButton>
        {search ? (
          <Link className="button button--ghost" href={`/admin/courses/${courseId}#attach-module`}>
            Clear
          </Link>
        ) : null}
      </form>

      {picker.rows.length === 0 ? (
        <p className="panel-empty">
          {search ? "No module by that title." : "The library is empty."}{" "}
          <Link href="/admin/modules">Build one in Modules</Link>.
        </p>
      ) : (
        <form action={attachModuleAction} className="stack-form">
          <Hidden fields={{ courseId }} />
          <label className="field">
            <span className="field__label">Subject</span>
            <select className="input" name="sectionId" required>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Module</span>
            <select className="input" name="moduleId" required>
              {picker.rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            Page {picker.page} of {picker.pageCount}
            {picker.page > 1 ? (
              <>
                {" · "}
                <Link href={href(picker.page - 1)}>Previous</Link>
              </>
            ) : null}
            {picker.page < picker.pageCount ? (
              <>
                {" · "}
                <Link href={href(picker.page + 1)}>Next</Link>
              </>
            ) : null}
          </p>
          <SubmitButton pendingLabel="Attaching…">Attach module</SubmitButton>
        </form>
      )}
    </section>
  );
}
