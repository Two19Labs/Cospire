"use client";

import { useEffect, useState } from "react";

import { Button, type ButtonProps } from "./button";

// One click to copy a prompt, a paper's text or a list of IDs.
//
// Always placed beside a read-only box holding the same text, so it stays
// selectable and copyable by hand with scripting off or clipboard access
// refused. The button is the convenience on top: it says "Copied" only when the
// browser confirms the copy, never on a refusal.
export function CopyButton({
  label,
  text,
  variant = "secondary",
}: {
  label: string;
  text: string;
  variant?: ButtonProps["variant"];
}) {
  const [state, setState] = useState<"idle" | "copied" | "refused">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("refused");
    }
  }

  return (
    <Button aria-live="polite" onClick={copy} variant={variant}>
      {state === "copied" ? "Copied ✓" : state === "refused" ? "Select the box and copy it by hand" : label}
    </Button>
  );
}
