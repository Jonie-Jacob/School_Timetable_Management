import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const apiProxy = (target: string) => ({
  target,
  changeOrigin: true,
  rewrite: (p: string) => p.replace(/^\/api/, ''),
});

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
      '/api/auth': apiProxy('http://localhost:4001'),
      '/api/academic-years': apiProxy('http://localhost:4002'),
      '/api/config': apiProxy('http://localhost:4003'),
      '/api/subjects': apiProxy('http://localhost:4004'),
      '/api/teachers': apiProxy('http://localhost:4005'),
      '/api/classes': apiProxy('http://localhost:4006'),
      '/api/assignments': apiProxy('http://localhost:4007'),
      '/api/divisions': apiProxy('http://localhost:4007'),
      '/api/elective-groups': apiProxy('http://localhost:4007'),
      '/api/timetables': apiProxy('http://localhost:4008'),
      '/api/dashboard': apiProxy('http://localhost:4009'),
      '/api/export': apiProxy('http://localhost:4010'),
      '/api/notifications': apiProxy('http://localhost:4012'),
    },
  },
});
