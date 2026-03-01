import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFileSync } from 'fs';
import { join } from 'path';

const buildVersion = String(Date.now());

function versionPlugin() {
  let outDir = 'dist';
  return {
    name: 'version-json',
    config() {
      return { define: { __APP_BUILD_VERSION__: JSON.stringify(buildVersion) } };
    },
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      try {
        writeFileSync(
          join(outDir, 'version.json'),
          JSON.stringify({ version: buildVersion }),
          'utf-8'
        );
      } catch {
        // ignore
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), versionPlugin()],
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
