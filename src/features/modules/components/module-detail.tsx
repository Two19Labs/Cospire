import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { Hidden, MoveButtons, RefSelect } from "@/features/curriculum/components/curriculum-builder";
import { itemTypeLabels } from "@/features/curriculum/curriculum";
import type { PickerPage } from "@/features/curriculum/queries/list-picker";
import { DeleteLink } from "@/features/delete/components/delete-link";
import { SubmitButton } from "@/shared/ui";

import {
  addModuleItemAction,
  duplicateModuleAction,
  moveModuleItemAction,
  removeModuleItemAction,
  renameModuleAction,
} from "../actions/module-actions";
import { moduleMessages, moduleTitleMaxLength, type ModuleMessage } from "../modules";
import type { ModuleDetail } from "../queries/get-module";

export type ModulePickerName = "documentsPage" | "mocksPage" | "videosPage";

interface ModuleDetailProps {
  documents: PickerPage;
  message: ModuleMessage | null;
  mocks: PickerPage;
  module: ModuleDetail;
  profile: Profile;
  videos: PickerPage;
}

function Pager({ id, name, page, pages }: { id: number; name: ModulePickerName; page: PickerPage; pages: Record<ModulePickerName, number> }) {
  if (page.pageCount <= 1) return null;
  const href = (target: number) =>
    `/admin/modules/${id}?${new URLSearchParams(
      Object.entries({ ...pages, [name]: target }).map(([key, value]) => [key, String(value)]),
    ).toString()}#add-item`;
  return (
    <p className="muted">
      Page {page.page} of {page.pageCount}
      {page.page > 1 ? <> · <Link href={href(page.page - 1)}>Previous</Link></> : null}
      {page.page < page.pageCount ? <> · <Link href={href(page.page + 1)}>Next</Link></> : null}
    </p>
  );
}

export function ModuleDetailScreen({ documents, message, mocks, module, profile, videos }: ModuleDetailProps) {
  const notice = message ? moduleMessages[message] : null;
  const pages = { documentsPage: documents.page, mocksPage: mocks.page, videosPage: videos.page };
  const libraryForm = (type: "document" | "test" | "video", heading: string, label: string, button: string, page: PickerPage, name: ModulePickerName, empty: string) => (
    <form action={addModuleItemAction} className="stack-form">
      <h3>{heading}</h3>
      <Hidden fields={{ moduleId: module.id, type }} />
      {page.options.length === 0 ? <p className="muted">{empty}</p> : <RefSelect label={label} page={page} />}
      <Pager id={module.id} name={name} page={page} pages={pages} />
      {page.options.length === 0 ? null : <SubmitButton pendingLabel="Adding…">{button}</SubmitButton>}
    </form>
  );

  return (
    <RoleShell
      actions={
        <>
          <form action={duplicateModuleAction}>
            <Hidden fields={{ moduleId: module.id }} />
            <SubmitButton pendingLabel="Duplicating…" variant="secondary">
              Duplicate module
            </SubmitButton>
          </form>
          <DeleteLink id={module.id} type="module" />
        </>
      }
      back={{ href: "/admin/modules", label: "Back to modules" }}
      description={`Module · ${module.items.length} item${module.items.length === 1 ? "" : "s"}`}
      profile={profile}
      title={module.title}
    >
      {notice ? (
        <p className={`notice ${notice.error ? "notice--error" : "notice--success"}`} role={notice.error ? "alert" : undefined}>
          {notice.text}
        </p>
      ) : null}

      <section className="panel panel--narrow">
        <div className="panel__header">
          <h2>Title</h2>
        </div>
        <form action={renameModuleAction} className="stack-form">
          <Hidden fields={{ moduleId: module.id }} />
          <label className="field">
            <span className="field__label">Module title</span>
            <input className="input" defaultValue={module.title} maxLength={moduleTitleMaxLength} name="title" required type="text" />
          </label>
          <SubmitButton pendingLabel="Saving…" variant="secondary">
            Rename
          </SubmitButton>
        </form>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Used in</h2>
            <p className="muted">Attach a module to a programme from the programme&apos;s page.</p>
          </div>
        </div>
        {module.programmes.length === 0 ? (
          <p className="panel-empty">Not attached to any programme yet.</p>
        ) : (
          <ul>
            {module.programmes.map((programme) => (
              <li key={programme.id}>
                <Link href={`/admin/courses/${programme.id}`}>{programme.title}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="section-heading" id="items">
        <h2>Items</h2>
        <p>Videos, documents, tests and readings in order. Every item is open to a student on a programme that uses this module.</p>
      </div>
      <section className="panel">
        {module.items.length === 0 ? (
          <p className="panel-empty">No items yet. Add the first one below.</p>
        ) : (
          <ol className="round-list">
            {module.items.map((item, index) => (
              <li className="round-row" key={item.id}>
                <span aria-hidden="true" className="round-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="round-row__main">
                  <h3>{item.title}</h3>
                  <p>{itemTypeLabels[item.type]}</p>
                </div>
                <div className="round-row__actions">
                  <MoveButtons
                    action={moveModuleItemAction}
                    fields={{ itemId: item.id, moduleId: module.id }}
                    first={index === 0}
                    last={index === module.items.length - 1}
                  />
                  <form action={removeModuleItemAction}>
                    <Hidden fields={{ itemId: item.id, moduleId: module.id }} />
                    <SubmitButton compact pendingLabel="Removing…" variant="danger">
                      Remove
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel" id="add-item">
        <div className="panel__header">
          <div>
            <h2>Add an item</h2>
            <p className="muted">Added items go to the end. To add a new video or PDF, upload it to its library first.</p>
          </div>
        </div>
        {libraryForm("video", "Video", "Video", "Add video", videos, "videosPage", "No videos in the library yet. Upload one under Videos.")}
        {libraryForm("document", "Document", "Document", "Add document", documents, "documentsPage", "No documents in the library yet. Upload one under Documents.")}
        {libraryForm("test", "Test", "Mock", "Add test", mocks, "mocksPage", "No mocks built yet. Build one under Mock tests first.")}
        <form action={addModuleItemAction} className="stack-form">
          <h3>Reading</h3>
          <Hidden fields={{ moduleId: module.id, type: "text" }} />
          <label className="field">
            <span className="field__label">Title</span>
            <input className="input" maxLength={200} name="title" required type="text" />
          </label>
          <label className="field">
            <span className="field__label">Text</span>
            <textarea className="input input--area" maxLength={20000} name="body" required rows={6} />
          </label>
          <SubmitButton pendingLabel="Adding…">Add reading</SubmitButton>
        </form>
      </section>
    </RoleShell>
  );
}
