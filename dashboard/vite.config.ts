import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { transformDashboardHtmlForMode } from './poly-beta-html-metadata';

const isCloudDeploy = process.env.CF_PAGES === '1';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'poly-beta-truthful-html-metadata',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          return transformDashboardHtmlForMode(html, process.env.VITE_APP_MODE);
        },
      },
    },
  ],
  base: '/',
  build: {
    outDir: isCloudDeploy ? 'dist' : '../dist/dashboard',
    emptyOutDir: true,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    proxy: {
      '/api':
        process.env.VITE_POLY_BETA_API_URL ||
        (process.env.VITE_APP_MODE === 'poly-beta' ? 'http://127.0.0.1:8787' : 'http://localhost:3000'),
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
