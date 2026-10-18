import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { SubmitButton } from "@/shared/ui";

import { deleteContentAction } from "../actions/delete-actions";
import type { DeletePreview } from "../queries/delete-preview";
import { describeDeletion, deleteTargets } from "../targets";

const errors: Record<string, string> = {
  name: "That is not the name. Type it exactly as it appears above.",
  linked: "This mock is linked to an ARS round, which would be left pointing at nothing. Unlink it on the round first.",
  missing: "It is not there any more. Somebody may have deleted it already.",
  failed: "The delete failed and nothing was removed.",
};

// Step two of the three deliberate steps (D54): exactly what will be removed,
// with real counts, and then the name typed out. The typed name is checked on
// the server and again in `public.delete_content`.
export function DeleteScreen({ error, preview, profile }: { error?: string; preview: DeletePreview; profile: Profile }) {
  const target = deleteTargets[preview.type];
  const parts = describeDeletion(preview.type, preview.counts);
  const kept =
    preview.type === "mock"
      ? "The questions themselves stay in the question bank, and the record of any past rescore stays with them."
      : preview.type === "programme"
        ? "The documents, videos and mock tests this programme pointed at are not deleted: they stay in their own libraries."
        : null;

  return (
    <RoleShell
      back={{ href: target.detailHref(preview.id), label: preview.label }}
      description="Nothing is removed until the name below is typed exactly."
      heading={`Delete ${preview.label}?`}
      profile={profile}
      title={`Delete ${target.noun}`}
    >
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>This cannot be undone</h2>
            <p className="muted">Deleting removes:</p>
          </div>
        </div>
        <ul className="muted">
          {parts.map((part) => (
            <li key={part}>{part}</li>
          ))}
        </ul>
        {kept ? <p className="notice">{kept}</p> : null}
        {preview.blockedBy !== null ? (
          <p className="notice notice--error">
            Linked to the ARS round {preview.blockedBy}. Unlink it there first, then this can be deleted.
          </p>
        ) : null}
        {error && errors[error] ? <p className="notice notice--error">{errors[error]}</p> : null}

        <form action={deleteContentAction}>
          <input name="type" type="hidden" value={preview.type} />
          <input name="id" type="hidden" value={preview.id} />
          <label className="field">
            <span className="field__label">Type {preview.label} to confirm</span>
            <input autoComplete="off" className="input" maxLength={300} name="confirmName" required />
          </label>
          <div className="form-actions">
            <Link className="button button--secondary" href={target.detailHref(preview.id)}>
              Keep it
            </Link>
            {preview.blockedBy === null ? (
              <SubmitButton pendingLabel="Deleting…" variant="danger">
                Delete this {target.noun}
              </SubmitButton>
            ) : null}
          </div>
        </form>
      </section>
    </RoleShell>
  );
}
