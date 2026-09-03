"use client";

import { useId, useRef, useState } from "react";

import { createBrowserSupabaseClient } from "@/shared/db/supabase/browser";
import { Button, Input } from "@/shared/ui";

import { createDocumentUploadTicketAction } from "../actions/create-upload-ticket";
import { recordDocumentAction } from "../actions/record-document";
import {
  describeFileRejection,
  documentMimeType,
  type NewDocumentFieldErrors,
} from "../document-input";
import { documentsBucket } from "../storage";

// The only component in the product that requires JavaScript, and it is not a
// preference.
//
// Operating manual §8 forbids media bytes passing through the application
// server, and `CONTEXT.md` records the Vercel request payload limit as a High
// risk. A plain multipart form post would send the whole PDF to a Server Action,
// which works on a laptop and fails in production on anything sizeable. So the
// browser talks to Supabase Storage directly, and that needs a script.
//
// Everything else -- search, granting, revoking, assignment, user creation --
// still works with scripting disabled.
export function UploadForm({ folders }: { folders: string[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<NewDocumentFieldErrors>({});
  const [progress, setProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderListId = useId();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setError(null);
    setFieldErrors({});
    setProgress(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = String(formData.get("title") ?? "");
    const folder = String(formData.get("folder") ?? "");
    const file = fileRef.current?.files?.[0] ?? null;

    if (!file) {
      setError("Choose a PDF to upload.");
      return;
    }

    // Checked here so an admin learns about a 60MB scan before transferring it.
    // The bucket enforces the same two rules server-side, which is what actually
    // holds: `allowed_mime_types` and `file_size_limit` are declared on the
    // bucket in the migration, so a hand-crafted upload is refused by Storage
    // regardless of what this component does.
    const rejection = describeFileRejection({ size: file.size, type: file.type });
    if (rejection) {
      setError(rejection);
      return;
    }

    setBusy(true);

    try {
      setProgress("Preparing the upload...");
      const ticket = await createDocumentUploadTicketAction({ folder, title });

      if (!ticket.ok) {
        setError(ticket.error);
        setFieldErrors(ticket.fieldErrors);
        return;
      }

      setProgress("Transferring the file...");
      const supabase = createBrowserSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(documentsBucket)
        .uploadToSignedUrl(ticket.path, ticket.token, file, {
          contentType: documentMimeType,
        });

      if (uploadError) {
        setError(`The file could not be transferred: ${uploadError.message}`);
        return;
      }

      setProgress("Adding it to the library...");
      // Only now does a row get written. If the browser closes between the
      // transfer and this call, the result is an orphan object nobody can see,
      // rather than a library entry that opens as a 404.
      const failure = await recordDocumentAction({
        folder,
        path: ticket.path,
        title,
      });

      // Reached only on failure: the action redirects on success, and a redirect
      // from a Server Action never returns.
      setError(failure.error);
      setFieldErrors(failure.fieldErrors);
    } catch (cause) {
      // A redirect from a Server Action surfaces here as a thrown control-flow
      // signal in some Next versions. It carries a digest that identifies it, so
      // it is rethrown rather than shown to the admin as an error.
      if (
        cause &&
        typeof cause === "object" &&
        "digest" in cause &&
        typeof (cause as { digest?: unknown }).digest === "string" &&
        (cause as { digest: string }).digest.startsWith("NEXT_REDIRECT")
      ) {
        throw cause;
      }

      setError(
        cause instanceof Error
          ? cause.message
          : "The upload did not complete. Nothing was added to the library.",
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form className="auth-form" noValidate onSubmit={onSubmit}>
      <Input
        error={fieldErrors.title}
        label="Title"
        maxLength={200}
        name="title"
        placeholder="Number systems, set 1"
        required
      />

      <Input
        error={fieldErrors.folder}
        label="Folder (optional)"
        list={folders.length > 0 ? folderListId : undefined}
        maxLength={80}
        name="folder"
        placeholder="Quant"
      />
      {folders.length > 0 ? (
        <datalist id={folderListId}>
          {folders.map((folder) => (
            <option key={folder} value={folder} />
          ))}
        </datalist>
      ) : null}

      <label className="field" htmlFor="document-file">
        <span className="field__label">PDF file</span>
        <input
          accept="application/pdf"
          className="input"
          id="document-file"
          name="file"
          ref={fileRef}
          required
          type="file"
        />
      </label>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {progress ? (
        <p aria-live="polite" className="muted">
          {progress}
        </p>
      ) : null}

      <div className="form-actions">
        <Button disabled={busy} type="submit">
          {busy ? "Uploading..." : "Add document"}
        </Button>
      </div>
    </form>
  );
}
