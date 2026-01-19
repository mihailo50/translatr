import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === 'production';

// Bundle analyzer configuration (enabled via ANALYZE=true env var)
let withBundleAnalyzer: (config: NextConfig) => NextConfig = (config) => config;

if (process.env.ANALYZE === 'true') {
  // Dynamic import for bundle analyzer (only when needed)
  withBundleAnalyzer = require('@next/bundle-analyzer')({
    enabled: true,
  });
}

const nextConfig: NextConfig = {
  // React Strict Mode: enables additional runtime checks and warnings
  reactStrictMode: true,

  // Image optimization: restrict to trusted domains only
  images: {
    remotePatterns: [
      // Supabase Storage domains
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.supabase.co',
        pathname: '/**',
      },
      // Google OAuth profile images
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
        pathname: '/**',
      },
      // Google APIs (for profile pictures)
      {
        protocol: 'https',
        hostname: '*.googleapis.com',
        pathname: '/**',
      },
      // Placeholder images (for development/fallbacks)
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        pathname: '/**',
      },
    ],
    // Image optimization settings
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  async headers() {
    // Build CSP directives based on environment
    // Next.js requires 'unsafe-inline' for hydration, 'unsafe-eval' for dev HMR
    const scriptSrc = isProduction
      ? "'self' 'unsafe-inline' 'unsafe-eval'" // Production: Next.js hydration requires unsafe-inline
      : "'self' 'unsafe-inline' 'unsafe-eval'"; // Dev: Next.js requires these for HMR

    const cspDirectives = [
      // Default source: deny everything by default
      "default-src 'self'",
      // Scripts: allow unsafe-inline for Next.js hydration (required), Vercel Live feedback, and blob: as fallback for workers
      `script-src ${scriptSrc} https://vercel.live blob:`,
      // Workers: allow self and blob URLs (LiveKit uses blob URLs for Web Workers)
      "worker-src 'self' blob:",
      // Styles: self and inline (Tailwind and component styles require inline)
      "style-src 'self' 'unsafe-inline'",
      // Images: self, data URIs, blob URIs, Supabase Storage, Google Auth avatars, Google APIs, placeholder images, and Vercel assets
      "img-src 'self' data: blob: https://*.supabase.co https://storage.supabase.co https://*.googleusercontent.com https://*.googleapis.com https://picsum.photos https://fastly.picsum.photos https://vercel.com https://*.vercel.com https://grainy-gradients.vercel.app",
      // Fonts: self and data URIs
      "font-src 'self' data:",
      // Connect: self, Supabase API, and LiveKit (WebSocket and HTTPS)
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co wss://*.livekit.cloud https://*.livekit.cloud",
      // Frame sources: allow Vercel Live for development/preview feedback
      "frame-src 'self' https://vercel.live",
      // Media: self, blob, and Supabase Storage (for voice messages, videos)
      "media-src 'self' blob: https://*.supabase.co https://storage.supabase.co",
      // Object/embed: deny (no Flash, plugins, etc.)
      "object-src 'none'",
      // Base URI: self only (prevent base tag injection)
      "base-uri 'self'",
      // Form action: self only (prevent form hijacking)
      "form-action 'self'",
      // Frame ancestors: deny (prevent embedding in iframes)
      "frame-ancestors 'none'",
      // Upgrade insecure requests (force HTTPS)
      "upgrade-insecure-requests",
    ];

    return [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: [
          // DNS Prefetch Control: enable DNS prefetching for performance
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          // HSTS: Force HTTPS for 2 years (63072000 seconds)
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // Prevent clickjacking
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // Prevent MIME type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Referrer policy: origin-when-cross-origin (as requested)
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          // Permissions Policy (restrict browser features)
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=()',
          },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: cspDirectives.join('; '),
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
