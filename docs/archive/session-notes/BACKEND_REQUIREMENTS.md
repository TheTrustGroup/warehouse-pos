# Backend API Requirements for Warehouse POS System

**Frontend Domain:** `https://warehouse.extremedeptkidz.com`  
**API Base URL:** `https://extremedeptkidz.com/api`  
**Date:** January 28, 2026

---

## 🎯 Overview

The frontend application requires a REST API backend with authentication and CRUD operations for products, orders, and transactions. This document specifies all required endpoints, request/response formats, and CORS configuration.

---

## 🔐 CORS Configuration (CRITICAL)

**The backend MUST allow requests from:**
- `https://warehouse.extremedeptkidz.com` (production)
- `http://localhost:5173` (local development)

**Required CORS Headers:**
```
Access-Control-Allow-Origin: https://warehouse.extremedeptkidz.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Accept, X-CSRF-TOKEN
Access-Control-Allow-Credentials: true
```

**Without proper CORS configuration, the frontend will not be able to communicate with the API.**

---

## 📋 Required API Endpoints

### Authentication Endpoints

#### 1. POST `/api/auth/login`

**Purpose:** Authenticate user and create session

**Request:**
```http
POST /api/auth/login
Content-Type: application/json
Accept: application/json

{
  "email": "info@extremedeptkidz.com",
  "password": "Admin123!@#"
}
```

**Success Response (200 OK):**
```json
{
  "user": {
    "id": "1",
    "email": "info@extremedeptkidz.com",
    "username": "admin",
    "role": "admin",
    "fullName": "Administrator",
    "avatar": null,
    "permissions": ["*"],
    "isActive": true,
    "lastLogin": "2026-01-28T00:00:00Z",
    "createdAt": "2026-01-28T00:00:00Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." 
}
```

**Note:** The `token` field is optional if using httpOnly cookies for authentication.

**Error Responses:**
- `401 Unauthorized` - Invalid email or password
  ```json
  {
    "message": "Invalid email or password"
  }
  ```
- `422 Unprocessable Entity` - Validation errors
  ```json
  {
    "message": "Validation failed",
    "errors": {
      "email": ["The email field is required."],
      "password": ["The password field is required."]
    }
  }
  ```

---

#### 2. GET `/api/auth/user`

**Purpose:** Get current authenticated user

**Request:**
```http
GET /api/auth/user
Accept: application/json
Authorization: Bearer <token>  (if using Bearer tokens)
```

**OR** (if using httpOnly cookies):
```http
GET /api/auth/user
Accept: application/json
Cookie: session=...; laravel_session=...
```

**Success Response (200 OK):**
```json
{
  "id": "1",
  "email": "info@extremedeptkidz.com",
  "username": "admin",
  "role": "admin",
  "fullName": "Administrator",
  "avatar": null,
  "permissions": ["*"],
  "isActive": true,
  "lastLogin": "2026-01-28T00:00:00Z",
  "createdAt": "2026-01-28T00:00:00Z"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
  ```json
  {
    "message": "Authentication required"
  }
  ```
- `403 Forbidden` - Session expired
  ```json
  {
    "message": "Session expired"
  }
  ```

---

#### 3. POST `/api/auth/logout`

**Purpose:** Logout and invalidate session

**Request:**
```http
POST /api/auth/logout
Authorization: Bearer <token>  (if using Bearer tokens)
```

**Success Response (200 OK):**
```json
{
  "message": "Logged out successfully"
}
```

---

### Products Endpoints

#### 4. GET `/api/products`

**Purpose:** Get all products

**Request:**
```http
GET /api/products
Accept: application/json
Authorization: Bearer <token>
```

**Success Response (200 OK):**
```json
[
  {
    "id": "1",
    "name": "Product Name",
    "sku": "SKU-001",
    "description": "Product description",
    "category": "Electronics",
    "price": 99.99,
    "cost": 50.00,
    "stock": 100,
    "minStock": 10,
    "unit": "piece",
    "supplier": "Supplier Name",
    "location": "A1-B2",
    "status": "active",
    "image": "https://example.com/image.jpg",
    "createdAt": "2026-01-28T00:00:00Z",
    "updatedAt": "2026-01-28T00:00:00Z"
  }
]
```

**Empty Response (200 OK):**
```json
[]
```

---

#### 5. POST `/api/products`

**Purpose:** Create new product

**Request:**
```http
POST /api/products
Content-Type: application/json
Accept: application/json
Authorization: Bearer <token>

{
  "name": "New Product",
  "sku": "SKU-002",
  "description": "Product description",
  "category": "Electronics",
  "price": 49.99,
  "cost": 25.00,
  "stock": 50,
  "minStock": 5,
  "unit": "piece",
  "supplier": "Supplier Name",
  "location": "B1-C2",
  "status": "active",
  "image": "https://example.com/image.jpg"
}
```

**Success Response (201 Created):**
```json
{
  "id": "2",
  "name": "New Product",
  "sku": "SKU-002",
  ...
  "createdAt": "2026-01-28T00:00:00Z",
  "updatedAt": "2026-01-28T00:00:00Z"
}
```

---

#### 6. PUT `/api/products/:id`

**Purpose:** Update product

**Request:**
```http
PUT /api/products/1
Content-Type: application/json
Accept: application/json
Authorization: Bearer <token>

{
  "name": "Updated Product Name",
  "price": 59.99,
  "stock": 75
}
```

**Success Response (200 OK):**
```json
{
  "id": "1",
  "name": "Updated Product Name",
  ...
  "updatedAt": "2026-01-28T00:00:00Z"
}
```

---

#### 7. DELETE `/api/products/:id`

**Purpose:** Delete product

**Request:**
```http
DELETE /api/products/1
Authorization: Bearer <token>
```

**Success Response (200 OK or 204 No Content):**
```json
{
  "message": "Product deleted successfully"
}
```

---

### Orders Endpoints

#### 8. GET `/api/orders`

**Purpose:** Get all orders

**Request:**
```http
GET /api/orders
Accept: application/json
Authorization: Bearer <token>
```

**Success Response (200 OK):**
```json
[
  {
    "id": "1",
    "orderNumber": "ORD-2026-001",
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "items": [
      {
        "productId": "1",
        "productName": "Product Name",
        "quantity": 2,
        "price": 99.99,
        "subtotal": 199.98
      }
    ],
    "total": 199.98,
    "status": "pending",
    "createdAt": "2026-01-28T00:00:00Z",
    "updatedAt": "2026-01-28T00:00:00Z"
  }
]
```

---

#### 9. POST `/api/orders`

**Purpose:** Create new order

**Request:**
```http
POST /api/orders
Content-Type: application/json
Accept: application/json
Authorization: Bearer <token>

{
  "customerName": "John Doe",
  "customerEmail": "john@example.com",
  "items": [
    {
      "productId": "1",
      "quantity": 2
    }
  ],
  "total": 199.98
}
```

**Success Response (201 Created):**
```json
{
  "id": "1",
  "orderNumber": "ORD-2026-001",
  ...
  "createdAt": "2026-01-28T00:00:00Z"
}
```

---

#### 10. PUT `/api/orders/:id/status`

**Purpose:** Update order status

**Request:**
```http
PUT /api/orders/1/status
Content-Type: application/json
Accept: application/json
Authorization: Bearer <token>

{
  "status": "completed",
  "notes": "Order fulfilled"
}
```

**Success Response (200 OK):**
```json
{
  "id": "1",
  "status": "completed",
  ...
  "updatedAt": "2026-01-28T00:00:00Z"
}
```

---

### Transactions Endpoints

#### 11. GET `/api/transactions`

**Purpose:** Get all transactions

**Request:**
```http
GET /api/transactions
Accept: application/json
Authorization: Bearer <token>
```

**Success Response (200 OK):**
```json
[
  {
    "id": "1",
    "transactionNumber": "TXN-2026-001",
    "items": [
      {
        "productId": "1",
        "productName": "Product Name",
        "quantity": 1,
        "price": 99.99
      }
    ],
    "subtotal": 99.99,
    "discount": 0,
    "total": 99.99,
    "paymentMethod": "cash",
    "cashier": "admin",
    "status": "completed",
    "createdAt": "2026-01-28T00:00:00Z",
    "completedAt": "2026-01-28T00:00:00Z"
  }
]
```

---

#### 12. POST `/api/transactions`

**Purpose:** Create new transaction

**Request:**
```http
POST /api/transactions
Content-Type: application/json
Accept: application/json
Authorization: Bearer <token>

{
  "items": [
    {
      "productId": "1",
      "quantity": 1
    }
  ],
  "subtotal": 99.99,
  "discount": 0,
  "total": 99.99,
  "paymentMethod": "cash"
}
```

**Success Response (201 Created):**
```json
{
  "id": "1",
  "transactionNumber": "TXN-2026-001",
  ...
  "createdAt": "2026-01-28T00:00:00Z"
}
```

---

## 🔑 Authentication Methods

The frontend supports **both** authentication methods:

### Option 1: Bearer Token (JWT)
- Token returned in login response
- Token stored in `localStorage`
- Sent in `Authorization: Bearer <token>` header

### Option 2: HttpOnly Cookies (Recommended for Security)
- Session cookie set by backend after login
- Automatically sent by browser with `credentials: 'include'`
- More secure (not accessible via JavaScript)

**Recommendation:** Use httpOnly cookies for production, but support Bearer tokens for flexibility.

---

## 📝 User Roles

The system supports these roles:
- `admin` - Full access
- `manager` - Management access
- `cashier` - POS access
- `warehouse` - Inventory access
- `driver` - Delivery access
- `viewer` - Read-only access

---

## ✅ Testing Checklist

After implementing the API, please verify:

- [ ] `POST /api/auth/login` returns user and token/cookie
- [ ] `GET /api/auth/user` returns current user when authenticated
- [ ] `POST /api/auth/logout` invalidates session
- [ ] CORS allows requests from `warehouse.extremedeptkidz.com`
- [ ] All endpoints require authentication (except login)
- [ ] Error responses follow the format specified above
- [ ] Dates are returned in ISO 8601 format (`2026-01-28T00:00:00Z`)

---

## 🧪 Test Credentials

**Email:** `info@extremedeptkidz.com`  
**Password:** `Admin123!@#`

Please ensure this user exists in your system with `admin` role.

---

## 📞 Contact

If you have questions about these requirements or need clarification on any endpoint, please contact the frontend development team.

---

## 📎 Additional Resources

- See `BACKEND_API_SETUP.md` for framework-specific implementation examples
- See `API_TROUBLESHOOTING.md` for debugging guide
- Frontend repository: (add your repo URL here)

---

**Last Updated:** January 28, 2026
