import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { Order, OrderStatus, OrderItem, PaymentStatus, DeliveryInfo } from '../types/order';
import { useInventory } from './InventoryContext';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { API_BASE_URL, getApiHeaders, handleApiResponse } from '../lib/api';

interface OrderContextType {
  orders: Order[];
  isLoading: boolean;
  createOrder: (orderData: Partial<Order>) => Promise<Order>;
  updateOrderStatus: (orderId: string, status: OrderStatus, notes?: string) => Promise<void>;
  assignDriver: (orderId: string, driverName: string, driverPhone: string) => Promise<void>;
  markAsDelivered: (orderId: string, proof?: Partial<DeliveryInfo['deliveryProof']>) => Promise<void>;
  markAsFailed: (orderId: string, reason: string) => Promise<void>;
  cancelOrder: (orderId: string, reason: string) => Promise<void>;
  getOrder: (id: string) => Order | undefined;
  getOrdersByStatus: (status: OrderStatus) => Order[];
  getPendingOrders: () => Order[];
  getActiveDeliveries: () => Order[];
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { products, updateProduct } = useInventory();
  const { user } = useAuth();
  const { showToast } = useToast();

  /**
   * Load orders from API
   */
  const loadOrders = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/orders`, {
        headers: getApiHeaders(),
        credentials: 'include',
      });

      if (response.ok) {
        const data = await handleApiResponse<Order[]>(response);
        // Ensure we have an array (API may return { data: [] } or similar)
        const list = Array.isArray(data) ? data : (data && (data as any).data && Array.isArray((data as any).data) ? (data as any).data : []);
        
        // Convert date strings to Date objects
        const ordersWithDates = list.map((o: any) => ({
          ...o,
          createdAt: o.createdAt ? new Date(o.createdAt) : new Date(),
          updatedAt: o.updatedAt ? new Date(o.updatedAt) : new Date(),
          statusHistory: (o.statusHistory || []).map((h: any) => ({
            ...h,
            timestamp: new Date(h.timestamp),
          })),
          delivery: o.delivery ? {
            ...o.delivery,
            scheduledTime: o.delivery.scheduledTime ? new Date(o.delivery.scheduledTime) : null,
            actualTime: o.delivery.actualTime ? new Date(o.delivery.actualTime) : null,
            deliveryProof: o.delivery.deliveryProof ? {
              ...o.delivery.deliveryProof,
              receivedAt: o.delivery.deliveryProof.receivedAt ? new Date(o.delivery.deliveryProof.receivedAt) : null,
            } : null,
          } : null,
          payment: o.payment ? {
            ...o.payment,
            paidAt: o.payment.paidAt ? new Date(o.payment.paidAt) : null,
          } : null,
          inventory: o.inventory ? {
            ...o.inventory,
            reservedAt: o.inventory.reservedAt ? new Date(o.inventory.reservedAt) : null,
            deductedAt: o.inventory.deductedAt ? new Date(o.inventory.deductedAt) : null,
          } : null,
        }));
        
        setOrders(ordersWithDates);
      } else {
        setOrders([]);
      }
    } catch (error) {
      console.error('Error loading orders:', error);
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Load orders from API on mount
  useEffect(() => {
    loadOrders();
  }, []);

  // Save orders to localStorage for offline support (only real API data)
  useEffect(() => {
    if (!isLoading && orders.length > 0) {
      localStorage.setItem('orders', JSON.stringify(orders));
    }
  }, [orders, isLoading]);

  // Generate order number
  const generateOrderNumber = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `ORD-${year}${month}${day}-${random}`;
  };

  // Reserve stock for order items
  const reserveStock = useCallback((items: OrderItem[]) => {
    items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product && product.quantity >= item.quantity) {
        // Stock is available, reserve it (don't deduct yet)
      } else {
        throw new Error(`Insufficient stock for ${item.productName}`);
      }
    });
  }, [products]);

  // Deduct stock when order goes out for delivery
  const deductStock = useCallback(async (items: OrderItem[]) => {
    await Promise.all(
      items.map(async (item) => {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          await updateProduct(product.id, {
            quantity: product.quantity - item.quantity,
          });
        }
      })
    );
  }, [products, updateProduct]);

  // Return stock to inventory (delivery failed or cancelled)
  const returnStock = useCallback(async (items: OrderItem[]) => {
    await Promise.all(
      items.map(async (item) => {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          await updateProduct(product.id, {
            quantity: product.quantity + item.quantity,
          });
        }
      })
    );
  }, [products, updateProduct]);

  // Create new order
  const createOrder = async (orderData: Partial<Order>): Promise<Order> => {
    try {
      // Validate stock availability
      if (orderData.items && orderData.items.length > 0) {
        reserveStock(orderData.items);
      }

      const orderPayload = {
        orderNumber: generateOrderNumber(),
        type: orderData.type || 'delivery',
        customer: orderData.customer!,
        items: orderData.items || [],
        subtotal: orderData.subtotal ?? 0,
        deliveryFee: orderData.deliveryFee ?? 0,
        tax: orderData.tax ?? 0,
        discount: orderData.discount ?? 0,
        total: orderData.total ?? 0,
        status: 'pending' as OrderStatus,
        delivery: orderData.delivery,
        payment: orderData.payment ?? {
          method: 'cash_on_delivery',
          status: 'pending',
          paidAmount: 0,
        },
        notes: orderData.notes,
        createdBy: user?.id || user?.email || 'system',
      };

      // POST to API
      const response = await fetch(`${API_BASE_URL}/api/orders`, {
        method: 'POST',
        headers: getApiHeaders(),
        credentials: 'include',
        body: JSON.stringify(orderPayload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(err.message || err.errors?.[0]?.message || 'Failed to create order');
      }

      const savedRaw = await handleApiResponse<Order>(response);
      const savedOrder: Order = {
        ...savedRaw,
        createdAt: savedRaw.createdAt ? new Date(savedRaw.createdAt) : new Date(),
        updatedAt: savedRaw.updatedAt ? new Date(savedRaw.updatedAt) : new Date(),
        statusHistory: (savedRaw.statusHistory || []).map((h: any) => ({
          ...h,
          timestamp: new Date(h.timestamp),
        })),
      };

      setOrders(prev => [...prev, savedOrder]);
      showToast('success', `Order ${savedOrder.orderNumber} created successfully`);
      return savedOrder;
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to create order');
      throw error;
    }
  };

  // Update order status
  const updateOrderStatus = async (
    orderId: string,
    status: OrderStatus,
    notes?: string
  ) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) {
      showToast('error', 'Order not found');
      return;
    }

    // Deduct stock when going out for delivery
    if (status === 'out_for_delivery' && !order.inventory.deducted) {
      await deductStock(order.items);
      order.inventory.deducted = true;
      order.inventory.deductedAt = new Date();
    }

    // Return stock if delivery failed
    if (status === 'failed' && order.inventory.deducted) {
      await returnStock(order.items);
      order.inventory.deducted = false;
    }

    // PATCH to API
    const updatePayload = {
      status,
      notes: notes ?? `Status updated to ${status}`,
      updatedBy: user?.id || user?.email || 'system',
    };

    const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: getApiHeaders(),
      credentials: 'include',
      body: JSON.stringify(updatePayload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: response.statusText }));
      showToast('error', err.message || 'Failed to update order status');
      throw new Error(err.message || 'Failed to update order status');
    }

    const savedRaw = await handleApiResponse<Order>(response);
    const updatedOrder: Order = {
      ...savedRaw,
      createdAt: savedRaw.createdAt ? new Date(savedRaw.createdAt) : order.createdAt,
      updatedAt: savedRaw.updatedAt ? new Date(savedRaw.updatedAt) : new Date(),
      statusHistory: (savedRaw.statusHistory || order.statusHistory).map((h: any) => ({
        ...h,
        timestamp: new Date(h.timestamp),
      })),
    };

    setOrders(prev => prev.map(o => (o.id === orderId ? updatedOrder : o)));
    showToast('success', `Order status updated to ${status}`);
  };

  // Assign driver
  const assignDriver = async (
    orderId: string,
    driverName: string,
    driverPhone: string
  ) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) {
      showToast('error', 'Order not found');
      return;
    }

    // PATCH to API
    const updatePayload = {
      delivery: {
        driverName,
        driverPhone,
        attempts: (order.delivery?.attempts ?? 0) + 1,
      },
      updatedBy: user?.id || user?.email || 'system',
    };

    const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/assign-driver`, {
      method: 'PATCH',
      headers: getApiHeaders(),
      credentials: 'include',
      body: JSON.stringify(updatePayload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: response.statusText }));
      showToast('error', err.message || 'Failed to assign driver');
      throw new Error(err.message || 'Failed to assign driver');
    }

    const savedRaw = await handleApiResponse<Order>(response);
    const updatedOrder: Order = {
      ...savedRaw,
      createdAt: savedRaw.createdAt ? new Date(savedRaw.createdAt) : order.createdAt,
      updatedAt: savedRaw.updatedAt ? new Date(savedRaw.updatedAt) : new Date(),
      statusHistory: (savedRaw.statusHistory || order.statusHistory).map((h: any) => ({
        ...h,
        timestamp: new Date(h.timestamp),
      })),
    };

    setOrders(prev => prev.map(o => (o.id === orderId ? updatedOrder : o)));
    await updateOrderStatus(orderId, 'out_for_delivery', `Assigned to driver: ${driverName}`);
  };

  // Mark as delivered
  const markAsDelivered = async (orderId: string, proof?: Partial<NonNullable<DeliveryInfo['deliveryProof']>>) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) {
      showToast('error', 'Order not found');
      return;
    }

    const deliveryProof = proof
      ? { ...proof, receivedAt: proof.receivedAt ?? new Date() }
      : undefined;

    // PATCH to API
    const updatePayload = {
      status: 'delivered' as OrderStatus,
      delivery: {
        actualTime: new Date().toISOString(),
        deliveryProof,
      },
      payment: {
        status: 'paid' as PaymentStatus,
        paidAt: new Date().toISOString(),
      },
      updatedBy: user?.id || user?.email || 'system',
    };

    const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/deliver`, {
      method: 'PATCH',
      headers: getApiHeaders(),
      credentials: 'include',
      body: JSON.stringify(updatePayload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: response.statusText }));
      showToast('error', err.message || 'Failed to mark order as delivered');
      throw new Error(err.message || 'Failed to mark order as delivered');
    }

    const savedRaw = await handleApiResponse<Order>(response);
    const updatedOrder: Order = {
      ...savedRaw,
      createdAt: savedRaw.createdAt ? new Date(savedRaw.createdAt) : order.createdAt,
      updatedAt: savedRaw.updatedAt ? new Date(savedRaw.updatedAt) : new Date(),
      statusHistory: (savedRaw.statusHistory || order.statusHistory).map((h: any) => ({
        ...h,
        timestamp: new Date(h.timestamp),
      })),
    };

    setOrders(prev => prev.map(o => (o.id === orderId ? updatedOrder : o)));
    showToast('success', 'Order marked as delivered');
  };

  // Mark as failed
  const markAsFailed = async (orderId: string, reason: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) {
      showToast('error', 'Order not found');
      return;
    }

    // PATCH to API
    const updatePayload = {
      status: 'failed' as OrderStatus,
      delivery: {
        failureReason: reason,
      },
      notes: `Delivery failed: ${reason}`,
      updatedBy: user?.id || user?.email || 'system',
    };

    const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/fail`, {
      method: 'PATCH',
      headers: getApiHeaders(),
      credentials: 'include',
      body: JSON.stringify(updatePayload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: response.statusText }));
      showToast('error', err.message || 'Failed to mark order as failed');
      throw new Error(err.message || 'Failed to mark order as failed');
    }

    await updateOrderStatus(orderId, 'failed', `Delivery failed: ${reason}`);
  };

  // Cancel order
  const cancelOrder = async (orderId: string, reason: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) {
      showToast('error', 'Order not found');
      return;
    }

    // Return stock if it was deducted
    if (order.inventory.deducted) {
      await returnStock(order.items);
    }

    // PATCH to API
    const updatePayload = {
      status: 'cancelled' as OrderStatus,
      notes: `Order cancelled: ${reason}`,
      updatedBy: user?.id || user?.email || 'system',
    };

    const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/cancel`, {
      method: 'PATCH',
      headers: getApiHeaders(),
      credentials: 'include',
      body: JSON.stringify(updatePayload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: response.statusText }));
      showToast('error', err.message || 'Failed to cancel order');
      throw new Error(err.message || 'Failed to cancel order');
    }

    await updateOrderStatus(orderId, 'cancelled', `Order cancelled: ${reason}`);
  };

  // Helper functions
  const getOrder = (id: string) => orders.find(o => o.id === id);

  const getOrdersByStatus = (status: OrderStatus) =>
    orders.filter(o => o.status === status);

  const getPendingOrders = () =>
    orders.filter(o => ['pending', 'confirmed', 'processing', 'ready'].includes(o.status));

  const getActiveDeliveries = () =>
    orders.filter(o => o.status === 'out_for_delivery');

  return (
    <OrderContext.Provider
      value={{
        orders,
        isLoading,
        createOrder,
        updateOrderStatus,
        assignDriver,
        markAsDelivered,
        markAsFailed,
        cancelOrder,
        getOrder,
        getOrdersByStatus,
        getPendingOrders,
        getActiveDeliveries,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error('useOrders must be used within OrderProvider');
  }
  return context;
}
