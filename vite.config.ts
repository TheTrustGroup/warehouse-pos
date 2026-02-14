import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

// Fail production build if VITE_API_BASE_URL is unset (avoid accidental use of hardcoded default).
function failBuildIfEnvMissing() {
  return {
    name: 'fail-build-if-env-missing',
    config(_, { mode }) {
      if (mode === 'production') {
        const env = loadEnv(mode, process.cwd(), '');
        const url = env.VITE_API_BASE_URL;
        if (!url || String(url).trim() === '') {
          console.error(
            '[INVENTORY] VITE_API_BASE_URL is required in production. Set it in Vercel (Settings → Environment Variables) or .env.production.'
          );
          process.exit(1);
        }
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode: _mode }) => ({
  plugins: [
    failBuildIfEnvMissing(),
    react(),
    legacy({
      targets: ['defaults', 'not dead', 'supports es6-module'],
      modernPolyfills: true,
      renderLegacyChunks: true,
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'chart-vendor': ['recharts'],
          'ui-vendor': ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false, // Disable in production
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
}));
