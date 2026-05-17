/**
 * Next.js config — MindAR / Three in iframe
 * -----------------------------------------
 * If the AR page is loaded only via **iframe** from Express (`/webar/index.html` with CDN import maps),
 * you do **not** need `transpilePackages: ['mind-ar']` or any MindAR-specific webpack rules here.
 * The Next bundle can keep `three@0.168` for React Three Fiber without conflicting with `three@0.151.3`
 * inside the isolated iframe document.
 *
 * Uncomment `transpilePackages` only if you import `mind-ar` or `three@0.151.x` **directly** in Next
 * (not recommended in the same app as R3F on r168 unless you split packages / workspaces carefully).
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /** Shared src tree with Vite — only App Router page files under src/app are for Next. */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  /**
   * Only App Router files named `page.page.tsx` / `layout.page.tsx` are treated as routes,
   * so `src/pages/*.tsx` (Vite + react-router screens) are not picked up by Next.
   */
  pageExtensions: ['page.tsx', 'page.ts', 'route.ts'],

  // Uncomment when bundling `mind-ar` in Next (iframe approach does NOT require this):
  // transpilePackages: ['mind-ar'],
};

export default nextConfig;
