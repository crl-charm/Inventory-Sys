import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't advertise the framework version in responses.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Never let a browser guess a response's type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // The shop app is never embedded in a frame (clickjacking defense).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
