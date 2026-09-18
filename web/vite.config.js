import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Dev-server-only proxy. The API and uploaded files are served by the
    // backend on :5000; routing them through this origin puts the whole app on
    // ONE port. Two things need that: any tool that drives the app through a
    // single tunnel (TestSprite, ngrok) can only forward one port, and a
    // same-origin API makes the HttpOnly session cookie behave in dev exactly
    // as it will in production behind one domain.
    //
    // `server` applies to `vite dev` only - `npm run build` is untouched, and
    // production still uses the absolute VITE_API_URL baked in at build time.
    // Set VITE_API_URL="/api/v1" (e.g. in .env.local) to route through this.
    proxy: {
      '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:5000', changeOrigin: true },
    },
  },
});
