export type OrderStatus =
  | 'pending'           // Order placed, awaiting confirmation
  | 'confirmed'         // Order confirmed, items available
  | 'processing'        // Being picked and packed
  | 'ready'             // Ready for delivery/pickup
  | 'out_for_delivery'  // Driver assigned, in transit
  | 'delivered'         // Successfully delivered
  | 'failed'            // Delivery failed
  | 'cancelled';        // Order cancelled

export type OrderType = 'in-store' | 'delivery' | 'pickup';

export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'partial';

export interface DeliveryAddress {
  street: string;
  area: string;
  city: string;
  landmark?: string;
  gpsCoordinates?: {
    lat: number;
    lng: number;
  };
}

export interface Customer {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  address?: DeliveryAddress;
  isRegistered: boolean;
}

export interface OrderItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  reservedQuantity?: number; // Track reserved stock
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  timestamp: Date;
  updatedBy: string;
  notes?: string;
  location?: string;
}

export interface DeliveryInfo {
  assignedTo?: string;        // Driver ID
  driverName?: string;
  driverPhone?: string;
  estimatedTime?: Date;
  actualTime?: Date;
  attempts: number;
  failureReason?: string;
  deliveryInstructions?: string;
  deliveryProof?: {
    signature?: string;        // Base64 image
    photo?: string;            // Base64 image
    recipientName?: string;
    receivedAt?: Date;
  };
}

export interface Order {
  id: string;
  orderNumber: string;        // ORD-260125-001
  type: OrderType;

  // Customer Information
  customer: Customer;

  // Items
  items: OrderItem[];

  // Pricing
  subtotal: number;
  deliveryFee: number;
  tax: number;
  discount: number;
  total: number;

  // Status
  status: OrderStatus;
  statusHistory: StatusHistoryEntry[];

  // Delivery
  delivery?: DeliveryInfo;

  // Payment
  payment: {
    method: 'cash' | 'card' | 'mobile_money' | 'bank_transfer' | 'cash_on_delivery';
    status: PaymentStatus;
    paidAmount: number;
    paidAt?: Date;
  };

  // Inventory Management
  inventory: {
    reserved: boolean;         // Stock reserved but not deducted
    deducted: boolean;         // Stock actually deducted
    reservedAt?: Date;
    deductedAt?: Date;
  };

  // Metadata
  notes?: string;
  internalNotes?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
