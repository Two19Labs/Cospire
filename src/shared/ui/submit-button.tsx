"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { classNames } from "@/shared/utils/class-names";

type ButtonVariant = "primary" | "secondary" | "danger";

export interface SubmitButtonProps {
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
  // What the button says while the server is working. A verb in the present
  // tense, because "Creating…" tells someone their click landed and "Loading…"
  // does not.
  pendingLabel?: string;
  variant?: ButtonVariant;
}

// A submit button that admits it has been pressed.
//
// Admin pages answer in about 1.3 seconds against the hosted database. Until
// now a submit looked identical before and after the click, so the click read
// as unregistered -- and the honest response to that is to click again, which
// on a create form is how you end up with two of something.
//
// `useFormStatus` is the whole mechanism. It reports the state of the form this
// button sits inside, which is why this must be a child of the `<form>` rather
// than the thing that owns it.
//
// **It degrades to exactly today's behaviour.** With scripting off there is no
// hook, no disabling and no label change: the form posts natively and the
// browser shows its own progress, as it does now. So this adds feedback where
// JavaScript is available and takes nothing away where it is not -- which is
// the rule every form in this application is built to.
export function SubmitButton({
  children,
  className,
  compact = false,
  pendingLabel,
  variant = "primary",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const slow = useSlow(pending);

  const button = (
    <button
      // Disabled only while this form is in flight. The double-submit it stops
      // is the one a person makes on purpose, believing the first click missed.
      aria-busy={pending || undefined}
      className={classNames(
        "button",
        `button--${variant}`,
        compact && "button--compact",
        pending && "button--pending",
        className,
      )}
      disabled={pending}
      type="submit"
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );

  // A way out when the save has outlived any reasonable wait. The 2026-10-09
  // UI audit caught Next's client sometimes never following an action's
  // redirect -- the write had landed, but the button stayed pending for good
  // (reproduced on the deployed URL; see docs/ui-audit-2026-10-09.md, C2).
  // A full load of the same address shows the saved state.
  if (!slow) return button;
  return (
    <span className="submit-slow">
      {button}
      <a className="submit-slow__reload" href="">
        Taking too long? Reload
      </a>
    </span>
  );
}

const slowAfterMs = 8000;

function useSlow(pending: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), slowAfterMs);
    return () => window.clearTimeout(timer);
  }, [pending]);
  return slow;
}
