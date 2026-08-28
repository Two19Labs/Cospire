import type { NextConfig } from "next";

// Sent on every response. The audit found none of these present, which left the
// sign-in page embeddable in a frame on any site.
const securityHeaders = [
  // Clickjacking. `frame-ancestors` is the modern rule and X-Frame-Options is
  // kept for older browsers. Deliberately scoped to who may frame us: a wider
  // CSP would need care around Next.js inline scripts, and later around PDF.js
  // and the VdoCipher player, so it belongs with those features rather than here.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },

  // Stops a browser second-guessing a declared Content-Type, which is how a
  // served file gets treated as script.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Keeps full URLs, which will carry attempt and submission ids, out of the
  // Referer header on cross-origin requests.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Camera and microphone are excluded from scope by Annexure B, so no part of
  // this product should ever ask for them. Denying them means an injected script
  // cannot either.
  { key: "Permissions-Policy", value: "camera=(), microphone=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
