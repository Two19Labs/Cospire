import type { CSSProperties } from "react";

// How far through a programme a student is: a gold bar and the count, as the
// approved prototype draws it on the student home. The figure is said in words
// as well, so the bar itself is decoration to a screen reader.
export function ProgressMeter({ complete, percent, total }: { complete: number; percent: number; total: number }) {
  return (
    <div className="progress-meter">
      <div
        aria-hidden="true"
        className="step-progress__track"
        // The value is data, not design.
        style={{ "--progress": `${percent}%` } as CSSProperties}
      >
        <span className="step-progress__fill" />
      </div>
      <p className="progress-meter__label">
        {total === 0 ? "Nothing added yet" : `${complete} of ${total} items complete`}
      </p>
    </div>
  );
}
