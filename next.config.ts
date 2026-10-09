import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/project-expiries", destination: "/dashboard", permanent: false },
      { source: "/projects-infra", destination: "/dashboard", permanent: false },
      { source: "/website-updates", destination: "/dashboard", permanent: false },
      { source: "/business-reports", destination: "/dashboard", permanent: false },
      { source: "/demand-sheets", destination: "/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;
