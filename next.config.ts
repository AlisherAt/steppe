import type { NextConfig } from 'next';
const imageHosts = (process.env.PRODUCT_IMAGE_HOSTS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const config: NextConfig = {
  distDir: process.env.STEPPE_E2E === 'true' ? '.next-e2e' : '.next',
  devIndicators: false,
  turbopack: { root: process.cwd() },
  images: {
    remotePatterns: [
      'images.unsplash.com',
      'i.ebayimg.com',
      'images.stockx.com',
      'images.puma.com',
      'assets.adidas.com',
      'www.reebok.com',
      'cdn.shopify.com',
      'images.ctfassets.net',
      'www.brooksrunning.com',
      'www.skechers.com',
      'images.skechers.com',
      'www.fila.de',
      ...imageHosts,
    ].map((hostname) => ({
      protocol: 'https' as const,
      hostname,
    })),
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
export default config;
