import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["recharts", "lucide-react", "framer-motion"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' data:; connect-src 'self' http://localhost:*" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Sprint 18 §4.1: "Geography" was renamed to "Locations" (route, nav,
      // pill-nav). Redirect the old path so any bookmarked/shared link from
      // before the rename still lands on the live page instead of 404ing.
      // Plain path rewrite only — projectId flows through the dynamic
      // segment as Next.js already resolves it; the destination page still
      // runs assertProjectAccess exactly as before.
      {
        source: "/dashboard/projects/:projectId/geography",
        destination: "/dashboard/projects/:projectId/locations",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
