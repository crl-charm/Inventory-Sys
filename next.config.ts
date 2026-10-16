import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mysql2 is a native-ish CommonJS driver; keep it external to the server bundle.
  serverExternalPackages: ["mysql2"],
};

export default nextConfig;
