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

// Build version for cache invalidation and cross-browser consistency (log on app start).
const buildVersion = process.env.VITE_BUILD_VERSION || `build-${Date.now()}`;

// https://vitejs.dev/config/
export default defineConfig(({ mode: _mode }) => ({
  define: {
    __APP_BUILD_VERSION__: JSON.stringify(buildVersion),
  },
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
    target: 'es2020',
    minify: true,
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) return 'react-vendor';
          if (id.includes('node_modules/recharts')) return 'chart-vendor';
          if (id.includes('node_modules/lucide-react')) return 'ui-vendor';
          if (id.includes('node_modules/dexie') || id.includes('node_modules/idb')) return 'db-vendor';
          if (id.includes('node_modules/framer-motion')) return 'motion-vendor';
          if (id.includes('/pages/Dashboard')) return 'page-dashboard';
          if (id.includes('/pages/Inventory') || id.includes('/pages/Reports')) return 'page-inventory-reports';
          if (id.includes('/pages/POS')) return 'page-pos';
          if (id.includes('/pages/Orders')) return 'page-orders';
          if (id.includes('/pages/Settings')) return 'page-settings';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
    reportCompressedSize: true,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
}));
