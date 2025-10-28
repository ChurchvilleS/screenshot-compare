import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiHost = process.env.API_HOST || 'localhost';
const apiPort = Number(process.env.API_PORT || process.env.PORT || 5001);
const apiTarget = process.env.API_TARGET || `http://${apiHost}:${apiPort}`;

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: false
      },
      '/artifacts': {
        target: apiTarget,
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
