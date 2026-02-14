import type { Product } from '../types';

export interface UseInventoryReturn {
  products: Product[] | undefined;
  unsyncedCount: number | undefined;
  addProduct: (productData: Record<string, unknown>) => Promise<string>;
  updateProduct: (id: string, updates: Record<string, unknown>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  forceSync: () => Promise<void>;
  clearFailedSync: (queueItemId: number) => Promise<void>;
  undoAddProduct: (productId: string) => Promise<void>;
  isLoading: boolean;
  isSyncing: boolean;
}

export function useInventory(): UseInventoryReturn;
export default useInventory;
