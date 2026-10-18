import { CopyButton } from "@/shared/ui";

// Getting question IDs out of the platform without copying them one by one.
//
// The IDs are in the textarea, which is what makes this work with scripting off:
// the box can be selected and copied by hand, exactly as the Client does today
// out of a Google Doc. The button is the convenience on top.
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
  return (
    <div className="stack-form">
      <label className="field">
        <span className="field__label">{label}</span>
        <textarea aria-label={label} className="input input--area input--code" readOnly rows={rows} value={ids} />
        {hint ? <span className="field__hint">{hint}</span> : null}
      </label>
      <div className="toolbar">
        <CopyButton label="Copy the IDs" text={ids} />
      </div>
    </div>
  );
}
