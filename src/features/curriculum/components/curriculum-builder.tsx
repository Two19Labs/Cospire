import Link from "next/link";

import { SubmitButton } from "@/shared/ui";

import {
  addItemAction,
  addSectionAction,
  moveItemAction,
  moveSectionAction,
  removeItemAction,
  removeSectionAction,
} from "../actions/curriculum-builder";
import { curriculumMessages, itemTypeLabels, type CurriculumMessage } from "../curriculum";
import type { CurriculumSection } from "../queries/get-curriculum";
import type { PickerPage } from "../queries/list-picker";

// The curriculum builder: ordered sections, each an ordered list of mixed
// items. Every control is a plain form posting a Server Action, so it works
// with JavaScript disabled, like every other admin screen.

interface CurriculumBuilderProps {
  courseId: number;
  documents: PickerPage;
  message: CurriculumMessage | null;
  mocks: PickerPage;
  sections: CurriculumSection[];
}

function Hidden({ fields }: { fields: Record<string, string | number> }) {
  return (
    <>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
    </>
  );
}

function MoveButtons({
  action,
  fields,
  first,
  last,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string | number>;
  first: boolean;
  last: boolean;
}) {
  return (
    <>
      {first ? null : (
        <form action={action}>
          <Hidden fields={{ ...fields, direction: "up" }} />
          <SubmitButton compact pendingLabel="Moving…" variant="secondary">
            Up
          </SubmitButton>
        </form>
      )}
      {last ? null : (
        <form action={action}>
          <Hidden fields={{ ...fields, direction: "down" }} />
          <SubmitButton compact pendingLabel="Moving…" variant="secondary">
            Down
          </SubmitButton>
        </form>
      )}
    </>
  );
}

function PickerPager({
  courseId,
  name,
  other,
  page,
}: {
  courseId: number;
  name: "documentsPage" | "mocksPage";
  other: { name: string; page: number };
  page: PickerPage;
}) {
  if (page.pageCount <= 1) return null;
  const href = (target: number) =>
    `/admin/courses/${courseId}?${name}=${target}&${other.name}=${other.page}#add-item`;
  return (
    <p className="muted">
      Page {page.page} of {page.pageCount}
      {page.page > 1 ? (
        <>
          {" · "}
          <Link href={href(page.page - 1)}>Previous</Link>
        </>
      ) : null}
      {page.page < page.pageCount ? (
        <>
          {" · "}
          <Link href={href(page.page + 1)}>Next</Link>
        </>
      ) : null}
    </p>
  );
}

function SectionSelect({ sections }: { sections: CurriculumSection[] }) {
  return (
    <label className="field">
      <span className="field__label">Section</span>
      <select className="input" name="sectionId" required>
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {section.title}
          </option>
        ))}
      </select>
    </label>
  );
}

function RefSelect({ label, page }: { label: string; page: PickerPage }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <select className="input" name="refId" required>
        {page.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CurriculumBuilder({
  courseId,
  documents,
  message,
  mocks,
  sections,
}: CurriculumBuilderProps) {
  const notice = message ? curriculumMessages[message] : null;

  return (
    <>
      <div className="section-heading" id="curriculum">
        <h2>Curriculum</h2>
        <p>
          Sections in order, each holding documents, tests and readings in order.
          Every item is open to a student on this programme: granting the
          programme grants everything in it.
        </p>
      </div>

      {notice ? (
        <p
          className={`notice ${notice.error ? "notice--error" : "notice--success"}`}
          role={notice.error ? "alert" : undefined}
        >
          {notice.text}
        </p>
      ) : null}

      {sections.length === 0 ? (
        <section className="panel">
          <p className="panel-empty">No sections yet. Add the first one below.</p>
        </section>
      ) : null}

      {sections.map((section, sectionIndex) => (
        <section className="panel" key={section.id}>
          <div className="panel__header">
            <div>
              <h2>{section.title}</h2>
              <p className="muted">
                Section {sectionIndex + 1} · {section.items.length} item
                {section.items.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="round-row__actions">
              <MoveButtons
                action={moveSectionAction}
                fields={{ courseId, sectionId: section.id }}
                first={sectionIndex === 0}
                last={sectionIndex === sections.length - 1}
              />
              <form action={removeSectionAction}>
                <Hidden fields={{ courseId, sectionId: section.id }} />
                <SubmitButton compact pendingLabel="Removing…" variant="danger">
                  Remove section
                </SubmitButton>
              </form>
            </div>
          </div>
          {section.items.length === 0 ? (
            <p className="panel-empty">No items in this section yet.</p>
          ) : (
            <ol className="round-list">
              {section.items.map((item, itemIndex) => (
                <li className="round-row" key={item.id}>
                  <span aria-hidden="true" className="round-number">
                    {String(itemIndex + 1).padStart(2, "0")}
                  </span>
                  <div className="round-row__main">
                    <h3>{item.title}</h3>
                    <p>{itemTypeLabels[item.type]}</p>
                  </div>
                  <div className="round-row__actions">
                    <MoveButtons
                      action={moveItemAction}
                      fields={{ courseId, itemId: item.id, sectionId: section.id }}
                      first={itemIndex === 0}
                      last={itemIndex === section.items.length - 1}
                    />
                    <form action={removeItemAction}>
                      <Hidden fields={{ courseId, itemId: item.id }} />
                      <SubmitButton
                        className="button--ghost"
                        compact
                        pendingLabel="Removing…"
                        variant="secondary"
                      >
                        Remove
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}

      <section className="panel">
        <div className="panel__header">
          <h2>Add a section</h2>
        </div>
        <form action={addSectionAction} className="stack-form">
          <Hidden fields={{ courseId }} />
          <label className="field">
            <span className="field__label">Section title</span>
            <input className="input" maxLength={200} name="title" required type="text" />
          </label>
          <SubmitButton pendingLabel="Adding…">Add section</SubmitButton>
        </form>
      </section>

      {sections.length === 0 ? null : (
        <section className="panel" id="add-item">
          <div className="panel__header">
            <div>
              <h2>Add an item</h2>
              <p className="muted">Added items go to the end of the chosen section.</p>
            </div>
          </div>

          <form action={addItemAction} className="stack-form">
            <h3>Document</h3>
            <Hidden fields={{ courseId, type: "document" }} />
            <SectionSelect sections={sections} />
            {documents.options.length === 0 ? (
              <p className="muted">No documents in the library yet.</p>
            ) : (
              <RefSelect label="Document" page={documents} />
            )}
            <PickerPager
              courseId={courseId}
              name="documentsPage"
              other={{ name: "mocksPage", page: mocks.page }}
              page={documents}
            />
            {documents.options.length === 0 ? null : (
              <SubmitButton pendingLabel="Adding…">Add document</SubmitButton>
            )}
          </form>

          <form action={addItemAction} className="stack-form">
            <h3>Test</h3>
            <Hidden fields={{ courseId, type: "test" }} />
            <SectionSelect sections={sections} />
            {mocks.options.length === 0 ? (
              <p className="muted">No mocks built yet.</p>
            ) : (
              <RefSelect label="Mock" page={mocks} />
            )}
            <PickerPager
              courseId={courseId}
              name="mocksPage"
              other={{ name: "documentsPage", page: documents.page }}
              page={mocks}
            />
            {mocks.options.length === 0 ? null : (
              <SubmitButton pendingLabel="Adding…">Add test</SubmitButton>
            )}
          </form>

          <form action={addItemAction} className="stack-form">
            <h3>Reading</h3>
            <Hidden fields={{ courseId, type: "text" }} />
            <SectionSelect sections={sections} />
            <label className="field">
              <span className="field__label">Title</span>
              <input className="input" maxLength={200} name="title" required type="text" />
            </label>
            <label className="field">
              <span className="field__label">Text</span>
              <textarea
                className="input input--area"
                maxLength={20000}
                name="body"
                required
                rows={6}
              />
            </label>
            <SubmitButton pendingLabel="Adding…">Add reading</SubmitButton>
          </form>
        </section>
      )}
    </>
  );
}
