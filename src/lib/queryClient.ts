/**
 * React Query client and defaults.
 * Cache settings per plan: products 2m stale / 10m gc, dashboard 1m / 5m, sales 30s / 5m, POS products 5m / 30m.
 */
import { QueryClient } from '@tanstack/react-query';

const defaultStaleTime = 60 * 1000; // 1 minute fallback
const defaultGcTime = 5 * 60 * 1000; // 5 minutes (formerly cacheTime)

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: defaultStaleTime,
      gcTime: defaultGcTime,
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});

export default queryClient;
