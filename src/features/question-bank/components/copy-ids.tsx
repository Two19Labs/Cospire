"use client";

import { useState } from "react";

import { Button } from "@/shared/ui";

// Getting question IDs out of the platform without copying them one by one.
//
// The IDs are in the textarea, which is what makes this work with scripting off:
// the box can be selected and copied by hand, exactly as the Client does today
// out of a Google Doc. The button is the convenience on top, and it is the only
// part that needs JavaScript.
export function CopyIds({
  hint,
  ids,
  label,
  rows = 3,
}: {
  hint?: string;
  ids: string;
  label: string;
  rows?: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(ids);
      setCopied(true);
    } catch {
      // A browser that refuses clipboard access without a permission, or an
      // insecure origin. The box is still there to select, so say nothing
      // rather than claim a copy that did not happen.
      setCopied(false);
    }
  }

  return (
    <div className="stack-form">
      <label className="field">
        <span className="field__label">{label}</span>
        <textarea aria-label={label} className="input input--area input--code" readOnly rows={rows} value={ids} />
        {hint ? <span className="field__hint">{hint}</span> : null}
      </label>
      <div className="toolbar">
        <Button onClick={copy} variant="secondary">
          {copied ? "Copied" : "Copy the IDs"}
        </Button>
        <span className="muted">Or select the box and copy it by hand.</span>
      </div>
    </div>
  );
}
