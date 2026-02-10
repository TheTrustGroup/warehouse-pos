import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Fail production build if inventory API env is missing (P0 reliability: no default = no desync).
function failBuildIfEnvMissing() {
  return {
    name: 'fail-build-if-env-missing',
    config(_, { mode }) {
      if (mode === 'production') {
        const env = loadEnv(mode, process.cwd(), '');
        const url = env.VITE_API_BASE_URL;
        if (!url || String(url).trim() === '') {
          throw new Error(
            '[INVENTORY RELIABILITY] Production build requires VITE_API_BASE_URL. Set it in .env.production so warehouse and storefront use the same backend.'
          );
        }
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode: _mode }) => ({
  plugins: [failBuildIfEnvMissing(), react()],
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
