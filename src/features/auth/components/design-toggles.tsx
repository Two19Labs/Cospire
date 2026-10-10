"use client";

import { useEffect, useState } from "react";

// Development-only switches so the owner can compare design candidates on
// localhost: the accent (plain or bright rust) and the fonts (the original
// Figtree with serif headings, or Inter throughout). RoleShell renders this
// only when NODE_ENV is "development"; a production build draws plain rust
// and Inter, with no switches.
//
// Each switch sets an attribute on <html> -- `data-accent`, `data-font` --
// that swaps variables in globals.css. Choices are kept in localStorage, inside
// try/catch because storage can be blocked.

interface Choice {
  attribute: "accent" | "font";
  label: string;
  // The value that sets the attribute; the default removes it.
  off: { label: string };
  on: { label: string; value: string };
}

const choices: Choice[] = [
  { attribute: "accent", label: "Accent", off: { label: "Rust" }, on: { label: "Bright", value: "bright" } },
  { attribute: "font", label: "Font", off: { label: "Inter" }, on: { label: "Original", value: "original" } },
];

const storageKey = (choice: Choice) => `cospire-${choice.attribute}`;

function apply(choice: Choice, on: boolean) {
  if (on) document.documentElement.dataset[choice.attribute] = choice.on.value;
  else delete document.documentElement.dataset[choice.attribute];
}

export function DesignToggles() {
  const [state, setState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    for (const choice of choices) {
      let saved: string | null = null;
      try {
        saved = window.localStorage.getItem(storageKey(choice));
      } catch {
        saved = null;
      }
      initial[choice.attribute] = saved === choice.on.value;
      apply(choice, initial[choice.attribute]);
    }
    setState(initial);
  }, []);

  function set(choice: Choice, on: boolean) {
    setState((current) => ({ ...current, [choice.attribute]: on }));
    apply(choice, on);
    try {
      window.localStorage.setItem(storageKey(choice), on ? choice.on.value : "default");
    } catch {
      // Storage blocked: the switch still works for this page view.
    }
  }

  return (
    <div aria-label="Design comparison (development only)" className="design-toggles" role="group">
      {choices.map((choice) => {
        const on = state[choice.attribute] ?? false;
        return (
          <div className="design-toggles__row" key={choice.attribute}>
            <span className="design-toggles__label">{choice.label}</span>
            <button aria-pressed={!on} className="design-toggles__option" onClick={() => set(choice, false)} type="button">
              {choice.off.label}
            </button>
            <button aria-pressed={on} className="design-toggles__option" onClick={() => set(choice, true)} type="button">
              {choice.on.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
