import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'RoomKhata Pro',
        short_name: 'RoomKhata',
        description: 'Premium tenant and rent management system.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'portrait',
        background_color: '#0B071A',
        theme_color: '#2D1B69',
        icons: [
          {
            src: '/favicon.svg',
            sizes: '64x64',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: '/favicon.svg',
            sizes: '64x64',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        navigateFallback: '/',
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}']
      }
    })
  ]
});
