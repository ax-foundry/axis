const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: [
    'plotly.js',
    'react-plotly.js',
    'remark-gfm',
    'micromark-extension-gfm',
    'micromark-extension-gfm-autolink-literal',
    'micromark-extension-gfm-footnote',
    'micromark-extension-gfm-strikethrough',
    'micromark-extension-gfm-table',
    'micromark-extension-gfm-tagfilter',
    'micromark-extension-gfm-task-list-item',
    'mdast-util-gfm',
    'mdast-util-gfm-autolink-literal',
    'mdast-util-gfm-footnote',
    'mdast-util-gfm-strikethrough',
    'mdast-util-gfm-table',
    'mdast-util-gfm-task-list-item',
    'mdast-util-find-and-replace',
    'mdast-util-to-markdown',
    'ccount',
    'mdast-util-phrasing',
  ],
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 365,
  },
  async rewrites() {
    // Proxy /api/* to the backend so that asset paths like
    // /api/config/assets/branding/hero.jpg work from <img src> tags
    // in both local dev and production (Vercel).
    // INTERNAL_API_URL is for server-side rewrites (e.g. Docker where
    // the backend service name differs from the browser-reachable URL).
    const apiUrl =
      process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8500';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/images/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/branding/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/agents/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
    ];
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
};

module.exports = withBundleAnalyzer(nextConfig);
