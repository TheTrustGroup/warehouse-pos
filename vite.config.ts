import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
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
  plugins: [
    react(),
    versionPlugin(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG ?? '',
      project: process.env.SENTRY_PROJECT ?? '',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: 'hidden',
    minify: 'terser',
    target: 'es2020',
    reportCompressedSize: false,
    modulePreload: false,
    terserOptions: {
      compress: { drop_console: true },
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
