import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { Order, OrderStatus, OrderItem, PaymentStatus, DeliveryInfo } from '../types/order';
import { useInventory } from './InventoryContext';
import { useToast } from './ToastContext';
import { v4 as uuidv4 } from 'uuid';

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
  const { showToast } = useToast();

  // Load orders from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('orders');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const ordersWithDates = parsed.map((o: Order & { createdAt?: string; updatedAt?: string; statusHistory?: Array<{ timestamp: string }> }) => ({
          ...o,
          createdAt: o.createdAt ? new Date(o.createdAt) : new Date(),
          updatedAt: o.updatedAt ? new Date(o.updatedAt) : new Date(),
          statusHistory: (o.statusHistory || []).map((h: { timestamp: string; [k: string]: unknown }) => ({
            ...h,
            timestamp: new Date(h.timestamp),
          })),
        }));
        setOrders(ordersWithDates);
      } catch {
        setOrders([]);
      }
    }
    setIsLoading(false);
  }, []);

  // Save orders to localStorage
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
        console.log(`Reserved ${item.quantity} of ${product.name}`);
      } else {
        throw new Error(`Insufficient stock for ${item.productName}`);
      }
    });
  }, [products]);

  // Deduct stock when order goes out for delivery
  const deductStock = useCallback((items: OrderItem[]) => {
    items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        updateProduct(product.id, {
          quantity: product.quantity - item.quantity,
        });
      }
    });
  }, [products, updateProduct]);

  // Return stock to inventory (delivery failed or cancelled)
  const returnStock = useCallback((items: OrderItem[]) => {
    items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        updateProduct(product.id, {
          quantity: product.quantity + item.quantity,
        });
      }
    });
  }, [products, updateProduct]);

  // Create new order
  const createOrder = async (orderData: Partial<Order>): Promise<Order> => {
    try {
      // Validate stock availability
      if (orderData.items && orderData.items.length > 0) {
        reserveStock(orderData.items);
      }

      const newOrder: Order = {
        id: uuidv4(),
        orderNumber: generateOrderNumber(),
        type: orderData.type || 'delivery',
        customer: orderData.customer!,
        items: orderData.items || [],
        subtotal: orderData.subtotal ?? 0,
        deliveryFee: orderData.deliveryFee ?? 0,
        tax: orderData.tax ?? 0,
        discount: orderData.discount ?? 0,
        total: orderData.total ?? 0,
        status: 'pending',
        statusHistory: [
          {
            status: 'pending',
            timestamp: new Date(),
            updatedBy: 'system',
            notes: 'Order created',
          },
        ],
        delivery: orderData.delivery,
        payment: orderData.payment ?? {
          method: 'cash_on_delivery',
          status: 'pending',
          paidAmount: 0,
        },
        inventory: {
          reserved: true,
          deducted: false,
          reservedAt: new Date(),
        },
        notes: orderData.notes,
        createdBy: 'current-user',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setOrders(prev => [...prev, newOrder]);
      showToast('success', `Order ${newOrder.orderNumber} created successfully`);
      return newOrder;
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
      deductStock(order.items);
      order.inventory.deducted = true;
      order.inventory.deductedAt = new Date();
    }

    // Return stock if delivery failed
    if (status === 'failed' && order.inventory.deducted) {
      returnStock(order.items);
      order.inventory.deducted = false;
    }

    const updatedOrder: Order = {
      ...order,
      status,
      statusHistory: [
        ...order.statusHistory,
        {
          status,
          timestamp: new Date(),
          updatedBy: 'current-user',
          notes: notes ?? `Status updated to ${status}`,
        },
      ],
      updatedAt: new Date(),
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
    if (!order) return;

    const updatedOrder: Order = {
      ...order,
      delivery: {
        ...order.delivery,
        assignedTo: uuidv4(),
        driverName,
        driverPhone,
        attempts: (order.delivery?.attempts ?? 0) + 1,
      } as Order['delivery'],
      updatedAt: new Date(),
    };

    setOrders(prev => prev.map(o => (o.id === orderId ? updatedOrder : o)));
    await updateOrderStatus(orderId, 'out_for_delivery', `Assigned to driver: ${driverName}`);
  };

  // Mark as delivered
  const markAsDelivered = async (orderId: string, proof?: Partial<NonNullable<DeliveryInfo['deliveryProof']>>) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const deliveryProof = proof
      ? { ...proof, receivedAt: proof.receivedAt ?? new Date() }
      : undefined;

    const updatedOrder: Order = {
      ...order,
      delivery: order.delivery
        ? {
            ...order.delivery,
            actualTime: new Date(),
            deliveryProof,
          }
        : order.delivery,
      payment: {
        ...order.payment,
        status: 'paid' as PaymentStatus,
        paidAt: new Date(),
      },
      updatedAt: new Date(),
    };

    setOrders(prev => prev.map(o => (o.id === orderId ? updatedOrder : o)));
    await updateOrderStatus(orderId, 'delivered', 'Order delivered successfully');
  };

  // Mark as failed
  const markAsFailed = async (orderId: string, reason: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const updatedOrder: Order = {
      ...order,
      delivery: order.delivery
        ? { ...order.delivery, failureReason: reason }
        : order.delivery,
      updatedAt: new Date(),
    };

    setOrders(prev => prev.map(o => (o.id === orderId ? updatedOrder : o)));
    await updateOrderStatus(orderId, 'failed', `Delivery failed: ${reason}`);
  };

  // Cancel order
  const cancelOrder = async (orderId: string, reason: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Return stock if it was deducted
    if (order.inventory.deducted) {
      returnStock(order.items);
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
