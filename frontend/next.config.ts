import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 blocks dev-server asset requests whose Host isn't in this list, so
  // opening the app on 127.0.0.1 (rather than localhost) returns 403 for every
  // JS chunk and the page renders its loading skeletons forever. Both spellings
  // are listed so either address works. Development only — it has no effect on
  // a production build.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
