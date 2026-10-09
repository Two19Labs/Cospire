import { describe, expect, it } from "vitest";

import { clientIpFrom, sessionIdFromAccessToken } from "./activity-input";

describe("clientIpFrom", () => {
  it("takes the first address", () => {
    expect(clientIpFrom("203.0.113.9, 10.0.0.1")).toBe("203.0.113.9");
    expect(clientIpFrom(" 2001:db8::1 ")).toBe("2001:db8::1");
  });

  it("drops anything that is not an address", () => {
    expect(clientIpFrom(null)).toBeNull();
    expect(clientIpFrom("")).toBeNull();
    expect(clientIpFrom("'; drop table activity_log; --")).toBeNull();
    expect(clientIpFrom("unknown, 203.0.113.9")).toBeNull();
  });
});

describe("sessionIdFromAccessToken", () => {
  const token = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

  it("reads the session_id claim", () => {
    expect(sessionIdFromAccessToken(token({ session_id: "abc", sub: "u" }))).toBe("abc");
  });

  it("returns null for anything else", () => {
    expect(sessionIdFromAccessToken(undefined)).toBeNull();
    expect(sessionIdFromAccessToken("not-a-token")).toBeNull();
    expect(sessionIdFromAccessToken("h.%%%.s")).toBeNull();
    expect(sessionIdFromAccessToken(token({ session_id: 5 }))).toBeNull();
  });
});
