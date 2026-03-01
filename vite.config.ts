import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    target: 'es2020',
    reportCompressedSize: false,
    terserOptions: {
      compress: { drop_console: false },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) return 'recharts';
            if (id.includes('react-dom') || id.includes('/react/')) return 'react-vendor';
            if (id.includes('react-router')) return 'router';
            if (id.includes('dexie') || id.includes('idb')) return 'idb';
            if (id.includes('framer-motion')) return 'framer';
          }
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    chunkSizeWarningLimit: 600,
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
