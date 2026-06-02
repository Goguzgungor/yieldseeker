/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep native / heavy server-only deps out of the bundle so route + the
  // instrumentation loop load them via Node's require at runtime. better-sqlite3
  // is a native addon and MUST stay external; the Stellar/Blend SDKs are large
  // and pull in node built-ins that don't need bundling on the server.
  serverExternalPackages: [
    "better-sqlite3",
    "@stellar/stellar-sdk",
    "@blend-capital/blend-sdk",
    "@anthropic-ai/sdk",
  ],
};

export default nextConfig;
