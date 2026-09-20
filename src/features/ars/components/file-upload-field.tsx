"use client";

import { useRef, useState } from "react";

import { createBrowserSupabaseClient } from "@/shared/db/supabase/browser";

import {
  prepareArsUploadAction,
  recordArsUploadAction,
  removeArsUploadAction,
} from "../actions/upload-actions";
import type { FormField } from "../form-schema";
import {
  arsUploadMimeExtensions,
  arsUploadsBucket,
  describeArsUploadRejection,
  isStoredArsUpload,
} from "../upload";

const acceptByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  mov: "video/quicktime",
  mp4: "video/mp4",
  pdf: "application/pdf",
  png: "image/png",
  webm: "video/webm",
};

export function FileUploadField({
  field,
  roundId,
  value,
}: {
  field: FormField;
  roundId: number;
  value: unknown;
}) {
  const existing = isStoredArsUpload(value) ? value : null;
  const [current, setCurrent] = useState(existing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const accepted = field.accept ?? [...new Set(Object.values(arsUploadMimeExtensions))];
  const accept = accepted.map((extension) => acceptByExtension[extension]).filter(Boolean).join(",");

  async function upload(file: File) {
    const rejection = describeArsUploadRejection(file, accepted);
    if (rejection) {
      setError(rejection);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setProgress("Preparing your private upload...");
      const prepared = await prepareArsUploadAction({
        fieldKey: field.key,
        mimeType: file.type,
        originalName: file.name,
        roundId,
        size: file.size,
      });
      if (!prepared.ok) {
        setError(prepared.error);
        return;
      }
      setProgress("Uploading...");
      const supabase = createBrowserSupabaseClient();
      const transferred = await supabase.storage.from(arsUploadsBucket).upload(prepared.path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (transferred.error) {
        setError(`The file could not be uploaded: ${transferred.error.message}`);
        return;
      }
      setProgress("Attaching it to your draft...");
      const recorded = await recordArsUploadAction({
        fieldKey: field.key,
        mimeType: file.type,
        originalName: file.name,
        path: prepared.path,
        roundId,
        size: file.size,
      });
      if (!recorded.ok) {
        await supabase.storage.from(arsUploadsBucket).remove([prepared.path]);
        setError(recorded.error);
        return;
      }
      if (recorded.oldPath) await supabase.storage.from(arsUploadsBucket).remove([recorded.oldPath]);
      setCurrent({ mimeType: file.type, originalName: file.name, size: file.size, storagePath: prepared.path });
      if (inputRef.current) inputRef.current.value = "";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The upload did not complete.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const result = await removeArsUploadAction({ fieldKey: field.key, roundId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const supabase = createBrowserSupabaseClient();
      const removed = await supabase.storage.from(arsUploadsBucket).remove([result.path]);
      if (removed.error) {
        setError("The draft was cleared, but the old upload could not be removed. You can upload again.");
      }
      setCurrent(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <label className="field__label" htmlFor={`f-${field.key}`}>
        {field.label}
        {field.required ? null : <span className="field__optional">Optional</span>}
      </label>
      {field.helpText ? <p className="field__hint">{field.helpText}</p> : null}
      {current ? (
        <div className="upload-status">
          <div>
            <strong>{current.originalName}</strong>
            <p className="field__hint">{(current.size / 1024 / 1024).toFixed(1)} MB · saved privately</p>
          </div>
          <button className="button button--secondary" disabled={busy} onClick={remove} type="button">
            Remove
          </button>
        </div>
      ) : null}
      <input
        accept={accept}
        className="input"
        disabled={busy}
        id={`f-${field.key}`}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void upload(file);
        }}
        ref={inputRef}
        type="file"
      />
      <p className="field__hint">Allowed: {accepted.join(", ").toUpperCase()}. Maximum 50 MB.</p>
      {progress ? <p aria-live="polite" className="muted">{progress}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  );
}
