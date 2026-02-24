import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Use autoUpdate for silent SW updates to reduce user disruption.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'BoardBrawl: The Ultimate Game Night Scorekeeper',
        short_name: 'BoardBrawl',
        description: 'Manage casual, multi-game tournaments with live leaderboards and rich stats.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F8F5F0',
        theme_color: '#D4AF37',
        icons: [
          {
            src: '/favicon.svg',
            sizes: '64x64 32x32 24x24 16x16',
            type: 'image/svg+xml',
          },
          {
            src: '/favicon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: '/favicon-32x32.png',
            sizes: '32x32',
            type: 'image/png',
          },
          {
            src: '/favicon-48x48.png',
            sizes: '48x48',
            type: 'image/png',
          },
          {
            src: '/favicon-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: '/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        categories: ['games', 'productivity', 'utilities'],
        shortcuts: [
          {
            name: 'New Tournament',
            short_name: 'New',
            url: '/new',
            description: 'Create a new tournament',
          },
          {
            name: 'Dashboard',
            short_name: 'Dashboard',
            url: '/dashboard',
            description: 'View current tournament standings',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
