import { describe, expect, it } from "vitest";

import { isPhone } from "./device";

const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36";
const ipadDesktopMode = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";
const windows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

describe("reading the device from a request", () => {
  it("counts phones and tablets", () => {
    expect(isPhone(iphone)).toBe(true);
    expect(isPhone(android)).toBe(true);
  });

  it("counts an iPad posing as a Mac only when the form reports a touch screen", () => {
    expect(isPhone(ipadDesktopMode, true)).toBe(true);
    expect(isPhone(ipadDesktopMode, false)).toBe(false);
  });

  it("never takes a touch report on a Windows laptop for a tablet", () => {
    expect(isPhone(windows, true)).toBe(false);
  });

  it("treats a missing User-Agent as a desktop", () => {
    expect(isPhone(null)).toBe(false);
  });
});
