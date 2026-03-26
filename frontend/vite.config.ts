import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

// https://vite.dev/config/
const backendOrigin = process.env.VITE_BACKEND_ORIGIN ?? 'http://localhost:8000';

export default defineConfig({
  server: {
    proxy: {
      '/api': backendOrigin,
      '/ws': { target: backendOrigin.replace(/^http/, 'ws'), ws: true },
    },
  },
  plugins: [
    react(),
    ...(process.env.ANALYZE
      ? [visualizer({ open: true, filename: 'dist/stats.html', gzipSize: true })]
      : []),
  ],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/test/setup.ts',
    css: true,
    exclude: ['e2e/**', 'node_modules/**'],
    maxWorkers: 3,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 56,
        functions: 56,
        branches: 56,
        statements: 56,
      },
    },
  },
});
