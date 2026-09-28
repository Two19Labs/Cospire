"use client";

import { useEffect } from "react";

// Submits a form as soon as the page loads. Used only after the countdown has
// run out, to carry the student straight on to the next section or the result
// instead of leaving them facing a button. Without JavaScript the button is
// still there.
export function AutoSubmit({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId);
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }, [formId]);
  return null;
}
