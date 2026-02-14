export interface RegisterConfig {
  onUpdate?: () => void;
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
}

export function register(config?: RegisterConfig): Promise<ServiceWorkerRegistration | null>;
export function unregister(): Promise<boolean>;
