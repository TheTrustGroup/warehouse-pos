export interface UseNetworkStatusReturn {
  isOnline: boolean;
  isServerReachable: boolean;
  lastChecked: Date;
  checkConnection: () => Promise<boolean>;
}

export function useNetworkStatus(): UseNetworkStatusReturn;
