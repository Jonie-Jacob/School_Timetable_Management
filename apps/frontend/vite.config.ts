import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const apiProxy = (target: string) => ({
  target,
  changeOrigin: true,
  // Only proxy XHR/fetch requests (not browser navigation)
  bypass(req: { headers: { accept?: string } }) {
    if (req.headers.accept?.includes('text/html')) {
      return '/index.html';
    }
  },
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
      '/auth': apiProxy('http://localhost:4001'),
      '/academic-years': apiProxy('http://localhost:4002'),
      '/config': apiProxy('http://localhost:4003'),
      '/subjects': apiProxy('http://localhost:4004'),
      '/teachers': apiProxy('http://localhost:4005'),
      '/classes': apiProxy('http://localhost:4006'),
      '/assignments': apiProxy('http://localhost:4007'),
      '/divisions': apiProxy('http://localhost:4007'),
      '/elective-groups': apiProxy('http://localhost:4007'),
      '/timetables': apiProxy('http://localhost:4008'),
      '/dashboard': apiProxy('http://localhost:4009'),
      '/export': apiProxy('http://localhost:4010'),
      '/notifications': apiProxy('http://localhost:4012'),
    },
  },
});
