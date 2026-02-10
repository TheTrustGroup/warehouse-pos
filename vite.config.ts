import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Ensure production build can run on Vercel; use .env.production or Vercel env. If unset, app uses default in api.ts.
function failBuildIfEnvMissing() {
  return {
    name: 'fail-build-if-env-missing',
    config(_, { mode }) {
      if (mode === 'production') {
        const env = loadEnv(mode, process.cwd(), '');
        const url = env.VITE_API_BASE_URL;
        if (!url || String(url).trim() === '') {
          console.warn(
            '[INVENTORY] VITE_API_BASE_URL is unset in production build. Set it in Vercel (Frontend project → Settings → Environment Variables) or .env.production so the app uses your API URL; otherwise default is used.'
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
