import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/auth': 'http://localhost:4001',
      '/academic-years': 'http://localhost:4002',
      '/config': 'http://localhost:4003',
      '/subjects': 'http://localhost:4004',
      '/teachers': 'http://localhost:4005',
      '/classes': 'http://localhost:4006',
      '/assignments': 'http://localhost:4007',
      '/timetables': 'http://localhost:4008',
      '/dashboard': 'http://localhost:4009',
      '/export': 'http://localhost:4010',
    },
  },
});
