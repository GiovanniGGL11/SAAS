import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Lets the dev server be opened from other devices on the local network
  // (e.g. http://192.168.1.145:3000); without it Next blocks the dev JS/CSS.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],
  // Link da ficha: respostas sensíveis — nada em cache, nada em buscador, sem Referer.
  async headers() {
    return [
      {
        source: '/ficha/:token*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default nextConfig;
