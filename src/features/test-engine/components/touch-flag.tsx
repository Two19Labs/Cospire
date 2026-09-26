"use client";

import { useEffect, useRef } from "react";

// Marks a start form posted from a touch screen that reports itself as a Mac:
// iPadOS Safari does that by default, and an iPad is no easier to proctor than
// a phone. The server decides; this supplies the one fact it cannot read.
export function TouchFlag() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current && /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1) input.current.value = "1";
  }, []);
  return <input defaultValue="" name="touchDesktop" ref={input} type="hidden" />;
}
