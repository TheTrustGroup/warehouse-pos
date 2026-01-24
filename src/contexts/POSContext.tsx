import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Transaction, TransactionItem, Payment } from '../types';
import { useInventory } from './InventoryContext';
import { generateTransactionNumber, calculateTotal } from '../lib/utils';
import { getStoredData, setStoredData, isStorageAvailable } from '../lib/storage';

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
}

const POSContext = createContext<POSContextType | undefined>(undefined);

// Ghana VAT is 15%
const TAX_RATE = 0.15;

export function POSProvider({ children }: { children: ReactNode }) {
  const { products, updateProduct } = useInventory();
  const [cart, setCart] = useState<TransactionItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const addToCart = (productId: string, quantity: number = 1): boolean => {
    if (!productId || quantity <= 0) {
      console.error('Invalid productId or quantity');
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
      cashier: 'Current User', // Replace with actual user
      customer,
      status: 'completed',
      syncStatus: isOnline ? 'synced' : 'offline',
      createdAt: new Date(),
      completedAt: new Date(),
    };

    // Update inventory
    cart.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product && item.quantity > 0) {
        const newQuantity = Math.max(0, product.quantity - item.quantity);
        updateProduct(product.id, {
          quantity: newQuantity,
        });
      }
    });

    // Store transaction
    if (isStorageAvailable()) {
      const transactions = getStoredData<Transaction[]>('transactions', []);
      setStoredData('transactions', [...transactions, transaction]);

      // If offline, queue for sync
      if (!isOnline) {
        const offlineQueue = getStoredData<Transaction[]>('offline_transactions', []);
        setStoredData('offline_transactions', [...offlineQueue, transaction]);
      }
    } else {
      console.warn('localStorage not available. Transaction not persisted.');
    }

    clearCart();
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
