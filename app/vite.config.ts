import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Koroboi - School Mental Health Screening',
        short_name: 'Koroboi',
        description: 'Tablet-first offline PWA for school mental health triage',
        theme_color: '#0d9488',
        background_color: '#f0fdf4',
        display: 'standalone',
        orientation: 'any'
      }
    })
  ],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/tests/setup.ts']
  }
});
