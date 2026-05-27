# Backend API Setup Guide

## Current Status

❌ **API Endpoints Not Found**
- `GET /api/auth/user` → 404 (Not Found)
- `POST /api/auth/login` → 405 (Method Not Allowed)

This means the backend API endpoints need to be created or the API structure is different.

---

## Required Backend API Endpoints

Your backend needs to implement these endpoints for the frontend to work:

### 1. Authentication Endpoints

#### `POST /api/auth/login`
**Purpose:** Authenticate user and create session

**Request:**
```json
{
  "email": "info@extremedeptkidz.com",
  "password": "Admin123!@#"
}
```

**Response (200 OK):**
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
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." // Optional if using httpOnly cookies
}
```

**Error Responses:**
- `401 Unauthorized` - Invalid credentials
- `422 Unprocessable Entity` - Validation errors

---

#### `GET /api/auth/user`
**Purpose:** Get current authenticated user

**Headers:**
- `Authorization: Bearer <token>` (if using Bearer tokens)
- Or include session cookie (if using httpOnly cookies)

**Response (200 OK):**
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
- `403 Forbidden` - Session expired

---

#### `POST /api/auth/logout`
**Purpose:** Logout and invalidate session

**Response (200 OK):**
```json
{
  "message": "Logged out successfully"
}
```

---

### 2. Products Endpoints

#### `GET /api/products`
**Purpose:** Get all products

**Response (200 OK):**
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

#### `POST /api/products`
**Purpose:** Create new product

**Request:**
```json
{
  "name": "New Product",
  "sku": "SKU-002",
  "price": 49.99,
  "stock": 50,
  ...
}
```

#### `PUT /api/products/:id`
**Purpose:** Update product

#### `DELETE /api/products/:id`
**Purpose:** Delete product

---

### 3. Orders Endpoints

#### `GET /api/orders`
**Purpose:** Get all orders

#### `POST /api/orders`
**Purpose:** Create new order

#### `PUT /api/orders/:id/status`
**Purpose:** Update order status

---

### 4. Transactions Endpoints

#### `GET /api/transactions`
**Purpose:** Get all transactions

#### `POST /api/transactions`
**Purpose:** Create new transaction

---

## Backend Framework Examples

### Laravel/PHP Example

```php
// routes/api.php
Route::prefix('api')->group(function () {
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::get('/auth/user', [AuthController::class, 'user'])->middleware('auth:sanctum');
    Route::post('/auth/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
    
    Route::apiResource('products', ProductController::class)->middleware('auth:sanctum');
    Route::apiResource('orders', OrderController::class)->middleware('auth:sanctum');
    Route::apiResource('transactions', TransactionController::class)->middleware('auth:sanctum');
});

// app/Http/Controllers/AuthController.php
public function login(Request $request)
{
    $credentials = $request->validate([
        'email' => 'required|email',
        'password' => 'required',
    ]);
    
    if (Auth::attempt($credentials)) {
        $user = Auth::user();
        $token = $user->createToken('auth-token')->plainTextToken;
        
        return response()->json([
            'user' => $user,
            'token' => $token,
        ]);
    }
    
    return response()->json(['message' => 'Invalid credentials'], 401);
}

public function user(Request $request)
{
    return response()->json($request->user());
}
```

---

### Node.js/Express Example

```javascript
// routes/auth.js
const express = require('express');
const router = express.Router();
const { login, getUser, logout } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', login);
router.get('/user', authenticate, getUser);
router.post('/logout', authenticate, logout);

module.exports = router;

// app.js
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', authenticate, require('./routes/products'));
app.use('/api/orders', authenticate, require('./routes/orders'));
app.use('/api/transactions', authenticate, require('./routes/transactions'));
```

---

## CORS Configuration

**Critical:** Your backend MUST allow requests from:
- `https://warehouse.extremedeptkidz.com` (production)
- `http://localhost:5173` (local development)

See `API_TROUBLESHOOTING.md` Step 2 for detailed CORS configuration.

---

## Next Steps

1. **If you have backend access:**
   - Implement the endpoints listed above
   - Configure CORS
   - Test endpoints with curl/Postman
   - Update frontend if API structure differs

2. **If you DON'T have backend access:**
   - Contact your backend developer
   - Share this document with them
   - Provide the frontend domain: `warehouse.extremedeptkidz.com`
   - Request CORS configuration

3. **Once endpoints are ready:**
   - Test with the `test-api.sh` script
   - Verify in browser Network tab
   - Test login flow

---

## Testing After Backend Setup

```bash
# Test login
curl -X POST https://extremedeptkidz.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"info@extremedeptkidz.com","password":"Admin123!@#"}'

# Test user endpoint (with token from login)
curl https://extremedeptkidz.com/api/auth/user \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Alternative: Mock API for Testing

If you need to test the frontend before the backend is ready, you can use:
- **JSON Server** - Quick REST API mock
- **Mock Service Worker (MSW)** - API mocking library
- **Local backend** - Simple Express/FastAPI server

Let me know if you need help setting up a mock API for testing!
