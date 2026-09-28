import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/pdfjs-dist')) return 'pdf-renderer';
          if (id.includes('node_modules/pdf-lib')) return 'pdf-editor';
          if (id.includes('node_modules/react')) return 'react-vendor';
        },
      },
    },
  },
});
