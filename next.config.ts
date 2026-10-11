import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Lets the dev server be opened from other devices on the local network
  // (e.g. http://192.168.1.145:3000); without it Next blocks the dev JS/CSS.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],
};

export default nextConfig;
