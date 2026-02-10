import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { Transaction, TransactionItem, Payment } from '../types';
import { useInventory } from './InventoryContext';
import { useAuth } from './AuthContext';
import { useWarehouse } from './WarehouseContext';
import { useStore } from './StoreContext';
import { useToast } from './ToastContext';
import { generateTransactionNumber, calculateTotal } from '../lib/utils';
import { getStoredData, setStoredData, isStorageAvailable } from '../lib/storage';
import { getPosEventCounts, enqueuePosEvent, isPosEventQueueAvailable } from '../lib/posEventQueue';
import { syncPendingPosEvents } from '../lib/offlineSync';
import {
  getOfflineTransactionQueue,
  isIndexedDBAvailable,
} from '../lib/offlineDb';

interface POSContextType {
  cart: TransactionItem[];
  addToCart: (productId: string, quantity?: number) => boolean;
  updateCartItem: (productId: string, quantity: number) => boolean;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  calculateSubtotal: () => number;
  calculateTax: () => number;
  calculateTotal: () => number;
  discount: number;
  setDiscount: (amount: number) => void;
  processTransaction: (payments: Payment[], customer?: any) => Promise<Transaction>;
  isOnline: boolean;
  /** Pending + failed events (Phase 4). User-visible so sync failure is not silent. */
  pendingSyncCount: number;
  refreshPendingSyncCount: () => Promise<void>;
  /** Manual "Sync now" for pending events. */
  syncNow: () => Promise<void>;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

// Ghana VAT is 15%
const TAX_RATE = 0.15;

export function POSProvider({ children }: { children: ReactNode }) {
  const { products, refreshProducts } = useInventory();
  const { user } = useAuth();
  const { currentWarehouseId, isWarehouseSelectedForPOS } = useWarehouse();
  const { currentStoreId } = useStore();
  const { showToast } = useToast();
  const [cart, setCart] = useState<TransactionItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const refreshPendingSyncCount = useCallback(async () => {
    try {
      if (isPosEventQueueAvailable()) {
        const { pending, failed } = await getPosEventCounts();
        setPendingSyncCount(pending + failed);
      } else if (isIndexedDBAvailable()) {
        const q = await getOfflineTransactionQueue<Transaction>();
        setPendingSyncCount(Array.isArray(q) ? q.length : 0);
      } else if (isStorageAvailable()) {
        const q = getStoredData<Transaction[]>('offline_transactions', []);
        setPendingSyncCount(Array.isArray(q) ? q.length : 0);
      } else {
        setPendingSyncCount(0);
      }
    } catch {
      setPendingSyncCount(0);
    }
  }, []);

  /** Phase 4: Sync pending POS events (oldest first). Idempotent; no double deduction. */
  const syncPending = useCallback(async () => {
    const result = await syncPendingPosEvents();
    await refreshPendingSyncCount();
    if (result.failed > 0) {
      showToast('error', `${result.failed} sale(s) could not be synced (e.g. insufficient stock). Check sync status.`);
    }
    if (result.synced > 0 && result.pending === 0) {
      showToast('success', 'All pending sales synced.');
    }
  }, [showToast, refreshPendingSyncCount]);

  const syncNow = useCallback(async () => {
    await syncPending();
  }, [syncPending]);

  // On app load and when coming online: sync pending events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncPending();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (navigator.onLine) {
      refreshPendingSyncCount();
      syncPending();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPending, refreshPendingSyncCount]);

  const addToCart = (productId: string, quantity: number = 1): boolean => {
    if (!productId || quantity <= 0) {
      console.error('Invalid productId or quantity');
      return false;
    }
    if (!isWarehouseSelectedForPOS) {
      showToast('error', 'Select a warehouse before adding items to the cart');
      return false;
    }

    const product = products.find(p => p.id === productId);
    if (!product) {
      console.error(`Product with id ${productId} not found`);
      return false;
    }

    if (product.quantity < quantity) {
      console.error(`Insufficient stock. Available: ${product.quantity}, Requested: ${quantity}`);
      return false;
    }

    const existingItem = cart.find(item => item.productId === productId);
    
    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      if (newQuantity > product.quantity) {
        console.error(`Cannot add ${quantity} items. Total would exceed available stock.`);
        return false;
      }
      updateCartItem(productId, newQuantity);
    } else {
      const unitPrice = product.sellingPrice || 0;
      const subtotal = Math.round(unitPrice * quantity * 100) / 100;
      
      const newItem: TransactionItem = {
        productId: product.id,
        productName: product.name || 'Unknown Product',
        sku: product.sku || '',
        quantity,
        unitPrice,
        subtotal,
      };
      setCart([...cart, newItem]);
    }
    
    return true;
  };

  const updateCartItem = (productId: string, quantity: number): boolean => {
    if (!productId) {
      console.error('Invalid productId');
      return false;
    }

    if (quantity <= 0) {
      removeFromCart(productId);
      return true;
    }

    const product = products.find(p => p.id === productId);
    if (!product) {
      console.error(`Product with id ${productId} not found`);
      return false;
    }

    if (quantity > product.quantity) {
      console.error(`Cannot update quantity to ${quantity}. Available stock: ${product.quantity}`);
      return false;
    }

    setCart(cart.map(item => {
      if (item.productId === productId) {
        const unitPrice = item.unitPrice || 0;
        const subtotal = Math.round(unitPrice * quantity * 100) / 100;
        return { ...item, quantity, subtotal };
      }
      return item;
    }));
    
    return true;
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
  };

  const calculateSubtotal = (): number => {
    if (!cart || cart.length === 0) return 0;
    return calculateTotal(cart.map(item => ({
      unitPrice: item.unitPrice || 0,
      quantity: item.quantity || 0,
    })));
  };

  const calculateTax = (): number => {
    const subtotal = calculateSubtotal() - discount;
    if (subtotal <= 0) return 0;
    const tax = subtotal * TAX_RATE;
    return Math.round(tax * 100) / 100;
  };

  const calculateTotalAmount = (): number => {
    const subtotal = calculateSubtotal();
    const tax = calculateTax();
    const total = subtotal - discount + tax;
    return Math.round(total * 100) / 100;
  };

  const processTransaction = async (payments: Payment[], customer?: any): Promise<Transaction> => {
    if (!payments || payments.length === 0) {
      throw new Error('At least one payment method is required');
    }

    if (cart.length === 0) {
      throw new Error('Cart is empty');
    }

    if (!currentWarehouseId || !isWarehouseSelectedForPOS) {
      throw new Error('Select a warehouse to complete the sale');
    }

    const subtotal = calculateSubtotal();
    const tax = calculateTax();
    const total = calculateTotalAmount();

    const transaction: Transaction = {
      id: crypto.randomUUID(),
      transactionNumber: generateTransactionNumber(),
      type: 'sale',
      items: [...cart],
      subtotal,
      tax,
      discount,
      total,
      paymentMethod: payments.length === 1 ? payments[0].method : 'mixed',
      payments,
      cashier: user?.fullName || user?.email || user?.id || 'system',
      customer,
      status: 'completed',
      syncStatus: isOnline ? 'synced' : 'pending',
      createdAt: new Date(),
      completedAt: new Date(),
      warehouseId: currentWarehouseId,
    };

    const transactionPayload = {
      ...transaction,
      createdAt: transaction.createdAt.toISOString(),
      completedAt: transaction.completedAt?.toISOString() ?? null,
    };

    // Phase 4: always enqueue event (idempotency key = event_id). UI success immediate; sync in background.
    const eventId = crypto.randomUUID();
    if (isPosEventQueueAvailable()) {
      await enqueuePosEvent({
        event_id: eventId,
        type: 'SALE',
        payload: transactionPayload as Record<string, unknown>,
        warehouse_id: currentWarehouseId,
        store_id: currentStoreId ?? null,
        pos_id: null,
        operator_id: null,
        created_at: new Date().toISOString(),
        status: 'PENDING',
      });
    } else {
      throw new Error('Offline queue not available. Please try again.');
    }

    if (isStorageAvailable()) {
      const transactions = getStoredData<Transaction[]>('transactions', []);
      setStoredData('transactions', [...transactions, transaction]);
    }
    clearCart();
    refreshPendingSyncCount();
    syncPending(); // background; no await so UI stays fast
    refreshProducts().catch(() => {});

    return transaction;
  };

  return (
    <POSContext.Provider value={{
      cart,
      addToCart,
      updateCartItem,
      removeFromCart,
      clearCart,
      calculateSubtotal,
      calculateTax,
      calculateTotal: calculateTotalAmount,
      discount,
      setDiscount,
      processTransaction,
      isOnline,
      pendingSyncCount,
      refreshPendingSyncCount,
      syncNow,
    }}>
      {children}
    </POSContext.Provider>
  );
}

export function usePOS() {
  const context = useContext(POSContext);
  if (!context) {
    throw new Error('usePOS must be used within POSProvider');
  }
  return context;
}
