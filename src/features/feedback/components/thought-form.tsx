"use client";

import { useRef, useState } from "react";

import { createBrowserSupabaseClient } from "@/shared/db/supabase/browser";
import { Button, Input } from "@/shared/ui";

import { addThoughtAction, feedbackUploadTicketAction } from "../actions";
import { imageTypes, maxScreenshotBytes, maxScreenshots } from "../feedback";
import styles from "./feedback.module.css";

// The Client's form: a title, the thought, an urgent tick and screenshots,
// chosen from disk or pasted straight into the thought box. Screenshots go
// from the browser to storage on a ticket from the server, so this form needs
// JavaScript, as the document upload does.
export function ThoughtForm({ code }: { code: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [shots, setShots] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  function addShots(files: File[]) {
    const images = files.filter((file) => imageTypes[file.type]);
    if (!images.length) return;
    if (images.some((file) => file.size > maxScreenshotBytes)) return setError("Each screenshot must be under 5 MB.");
    setError(null);
    setShots((current) => [...current, ...images].slice(0, maxScreenshots));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      const paths: string[] = [];
      for (const file of shots) {
        const ticket = await feedbackUploadTicketAction(code, file.type);
        if ("error" in ticket) return setError(ticket.error);
        const { error: uploadError } = await createBrowserSupabaseClient().storage.from("feedback").uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
        if (uploadError) return setError("A screenshot could not be uploaded. Try again.");
        paths.push(ticket.path);
      }
      const result = await addThoughtAction(code, {
        authorName: data.get("authorName"),
        body: data.get("body"),
        screenshots: paths,
        title: data.get("title"),
        urgent: data.get("urgent") === "on",
      });
      if ("error" in result) return setError(result.error);
      form.current?.reset();
      setShots([]);
      setSent(true);
    } catch {
      setError("That could not be sent. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack-form stack-form--wide" onSubmit={submit} ref={form}>
      <Input label="Title" maxLength={200} name="title" placeholder="A few words on what this is about" required />
      <label className="field" htmlFor="feedback-body">
        <span className="field__label">Your thought</span>
        <textarea
          className="input"
          id="feedback-body"
          maxLength={5000}
          name="body"
          onPaste={(event) => addShots([...event.clipboardData.files])}
          placeholder="A change, something new, something that is not working, anything. You can paste a screenshot here."
          required
          rows={6}
        />
      </label>
      <Input label="Your name (optional)" maxLength={80} name="authorName" />
      <label className="field" htmlFor="feedback-shots">
        <span className="field__label">Screenshots (optional, up to {maxScreenshots})</span>
        <input
          accept={Object.keys(imageTypes).join(",")}
          id="feedback-shots"
          multiple
          onChange={(event) => {
            addShots([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
          type="file"
        />
      </label>
      {shots.length ? (
        <ul className={styles.chosen}>
          {shots.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              {file.name || "Pasted screenshot"}{" "}
              <button className="button button--secondary" onClick={() => setShots((current) => current.filter((_, i) => i !== index))} type="button">
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className={styles.urgent}>
        <input name="urgent" type="checkbox" /> This is urgent
      </label>
      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}
      {sent ? (
        <p className="notice notice--success" role="status">
          Logged. It is in the list below.
        </p>
      ) : null}
      <Button disabled={busy} type="submit">
        {busy ? "Sending…" : "Log this thought"}
      </Button>
    </form>
  );
}
