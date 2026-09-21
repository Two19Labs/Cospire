"use client";

import { useState } from "react";

import { createBrowserSupabaseClient } from "@/shared/db/supabase/browser";

import { maxImages } from "../question-input";
import {
  buildQuestionImagePath,
  describeImageRejection,
  questionImagesBucket,
  questionImageTypes,
} from "../storage";

// Images on a question, added by file or by pasting from the clipboard (clause
// 3.17). The bytes go from the browser straight to Storage under the author's
// own session, so the `question_images_*` Storage policies decide, and nothing
// passes through the application server (operating manual §8).
//
// What the form posts is only the list of paths, one hidden input each. So the
// editor still saves without JavaScript; it just cannot add an image.

interface ImageEntry {
  path: string;
  url: string | null;
}

export function ImageField({
  initialImages,
  initialUrls,
  orgId,
}: {
  initialImages: string[];
  initialUrls: Record<string, string>;
  orgId: number;
}) {
  const [images, setImages] = useState<ImageEntry[]>(
    initialImages.map((path) => ({ path, url: initialUrls[path] ?? null })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(files: File[]) {
    setError(null);
    const room = maxImages - images.length;
    if (room <= 0) {
      setError(`A question can carry at most ${maxImages} images.`);
      return;
    }

    const chosen = files.slice(0, room);
    for (const file of chosen) {
      const rejection = describeImageRejection(file);
      if (rejection) {
        setError(rejection);
        return;
      }
    }

    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const added: ImageEntry[] = [];
      for (const file of chosen) {
        const path = buildQuestionImagePath({ objectId: crypto.randomUUID(), orgId, type: file.type });
        const { error: uploadError } = await supabase.storage
          .from(questionImagesBucket)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) {
          setError(`The image could not be uploaded: ${uploadError.message}`);
          break;
        }
        added.push({ path, url: URL.createObjectURL(file) });
      }
      setImages((current) => [...current, ...added]);
    } finally {
      setBusy(false);
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;
    event.preventDefault();
    void add(files);
  }

  return (
    <div className="field">
      <span className="field__label">Images (optional)</span>

      {images.map((image) => (
        <input key={image.path} name="images" type="hidden" value={image.path} />
      ))}

      {images.length > 0 ? (
        <ul className="image-list">
          {images.map((image, index) => (
            <li className="image-tile" key={image.path}>
              {image.url ? (
                // A signed or local preview URL, not a static asset, so
                // next/image's optimiser has nothing to do here.
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={`Image ${index + 1}`} src={image.url} />
              ) : (
                <span className="muted">Image {index + 1}</span>
              )}
              <button
                className="button button--secondary button--compact"
                onClick={() => setImages((current) => current.filter((entry) => entry.path !== image.path))}
                type="button"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div
        aria-label="Paste an image here"
        className="paste-zone"
        onPaste={onPaste}
        role="group"
        tabIndex={0}
      >
        <span>Click here and press Ctrl+V to paste an image, or</span>
        <label className="button button--secondary button--compact">
          Choose a file
          <input
            accept={questionImageTypes.join(",")}
            className="visually-hidden"
            disabled={busy}
            multiple
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              void add(files);
            }}
            type="file"
          />
        </label>
      </div>

      <span className="field__hint">
        PNG, JPEG, GIF or WebP, up to 5 MB each. Use an image for anything plain
        text cannot show, such as a chart or a stacked fraction.
      </span>
      {busy ? (
        <span aria-live="polite" className="muted">
          Uploading…
        </span>
      ) : null}
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
