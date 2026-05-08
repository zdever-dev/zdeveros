import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],  // ← tohle vyřeší problém
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api':  { target: 'http://localhost:3001', changeOrigin: true },
      '/pdfs': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});