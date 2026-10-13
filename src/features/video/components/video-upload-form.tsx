"use client";

import { useRef, useState } from "react";

import { Button, Input } from "@/shared/ui";

import { startVideoUploadAction } from "../actions/videos";

// Like the document upload form, this needs JavaScript: the file goes from the
// browser straight to VdoCipher's storage and never through this application
// (manual §8), which a plain form post to a Server Action cannot do.
export function VideoUploadForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    const title = String(new FormData(event.currentTarget).get("title") ?? "");
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a video file to upload.");
      return;
    }

    setBusy(true);
    try {
      setProgress("Preparing the upload…");
      const ticket = await startVideoUploadAction(title);
      if ("error" in ticket) {
        setError(ticket.error);
        return;
      }

      // Field order follows VdoCipher's browser-upload docs: the policy fields
      // first, the file last, as S3 requires.
      const { uploadLink, ...fields } = ticket.clientPayload;
      const body = new FormData();
      for (const [name, value] of Object.entries(fields)) body.append(name, value);
      body.append("success_action_status", "201");
      body.append("success_action_redirect", "");
      body.append("file", file);

      setProgress("Transferring the file to VdoCipher. Keep this page open…");
      const response = await fetch(uploadLink, { body, method: "POST" });
      if (response.status !== 201) {
        setError("The transfer to VdoCipher failed. The video is listed as waiting for upload.");
        return;
      }
      window.location.assign("/admin/videos?notice=upload-ready");
    } catch {
      setError("The upload did not complete. The video is listed as waiting for upload.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form className="stack-form" noValidate onSubmit={onSubmit}>
      <Input label="Title" maxLength={200} name="title" required />
      <label className="field">
        <span className="field__label">Video file</span>
        <input accept="video/*" className="input" ref={fileRef} required type="file" />
      </label>
      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}
      {progress ? <p className="muted" role="status">{progress}</p> : null}
      <Button disabled={busy} type="submit">
        {busy ? "Uploading…" : "Upload video"}
      </Button>
    </form>
  );
}
