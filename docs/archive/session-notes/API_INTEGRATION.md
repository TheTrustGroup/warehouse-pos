# API Integration Guide

This document describes how to integrate the Warehouse POS system with your backend API.

## API Base URL Configuration

The API base URL is configured in `.env.local`:

```env
VITE_API_BASE_URL=https://api.extremedeptkidz.com
```

For local development, you can set it to:
```env
VITE_API_BASE_URL=http://localhost:3000
```

## Authentication

### Authentication Endpoints

The system uses the following authentication endpoints:

#### POST /api/auth/login

**Endpoint:** `${API_BASE_URL}/api/auth/login`

**Method:** POST

**Request Body:**
```json
{
  "email": "info@extremedeptkidz.com",
  "password": "Admin123!@#"
}
```

**Headers:**
```
Content-Type: application/json
Accept: application/json
```

**Expected Response (200 OK):**
```json
{
  "user": {
    "id": "string",
    "email": "string",
    "username": "string",
    "role": "admin" | "manager" | "cashier" | "warehouse" | "driver" | "viewer",
    "fullName": "string",
    "avatar": "string" | null,
    "permissions": ["string"],
    "isActive": true,
    "lastLogin": "2026-01-28T00:00:00Z",
    "createdAt": "2026-01-28T00:00:00Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." // Optional if using httpOnly cookies
}
```

**Error Responses:**
```json
// 401 Unauthorized
{
  "message": "Invalid email or password"
}

// 403 Forbidden
{
  "message": "Account is inactive"
}
```

#### GET /api/auth/user

**Endpoint:** `${API_BASE_URL}/api/auth/user`

**Method:** GET

**Headers:**
```
Accept: application/json
```

**Expected Response (200 OK):**
```json
{
  "id": "string",
  "email": "string",
  "username": "string",
  "role": "admin" | "manager" | "cashier" | "warehouse" | "driver" | "viewer",
  "fullName": "string",
  "avatar": "string" | null,
  "permissions": ["string"],
  "isActive": true,
  "lastLogin": "2026-01-28T00:00:00Z",
  "createdAt": "2026-01-28T00:00:00Z"
}
```

**Error Responses:**
```json
// 401 Unauthorized - User not authenticated
// 403 Forbidden - Session expired
```

#### POST /api/auth/logout

**Endpoint:** `${API_BASE_URL}/api/auth/logout`

**Method:** POST

**Headers:**
```
Accept: application/json
```

**Expected Response (200 OK):**
```json
{
  "message": "Logged out successfully"
}
```

### Token Storage

The system supports multiple token storage methods:

1. **httpOnly Cookies (Recommended for Production)**
   - Tokens stored in httpOnly cookies are automatically sent by the browser
   - No manual token handling needed
   - Most secure option
   - Set cookie with `httpOnly`, `secure`, and `sameSite` flags

2. **localStorage Token Storage**
   - Store token as `auth_token`, `access_token`, or `token` in localStorage
   - Token will be automatically included in Authorization header
   - Less secure but easier to implement

3. **User Object Token**
   - If your login API returns a user object with `token` or `accessToken` property
   - The token will be extracted and used automatically

### User Data Normalization

The system automatically normalizes user data from your API response:
- If `username` is missing, it extracts from email (part before @)
- If `fullName` is missing, it uses `name` or falls back to email
- If `permissions` are missing, it assigns default permissions based on role
- Dates are automatically converted from ISO strings to Date objects

## Products API Endpoint

### GET /api/products

**Endpoint:** `${API_BASE_URL}/api/products`

**Method:** GET

**Headers:**
```
Content-Type: application/json
Accept: application/json
Authorization: Bearer <token>  // If using Bearer tokens
```

**Expected Response Format:**

```json
[
  {
    "id": "string",
    "sku": "string",
    "barcode": "string",
    "name": "string",
    "description": "string",
    "category": "string",
    "tags": ["string"],
    "quantity": 0,
    "costPrice": 0,
    "sellingPrice": 0,
    "reorderLevel": 0,
    "location": {
      "warehouse": "string",
      "aisle": "string",
      "rack": "string",
      "bin": "string"
    },
    "supplier": {
      "name": "string",
      "contact": "string",
      "email": "string"
    },
    "images": ["string"],
    "expiryDate": "2026-01-28T00:00:00Z" | null,
    "variants": {
      "size": "string",
      "color": "string",
      "unit": "string"
    },
    "createdAt": "2026-01-28T00:00:00Z",
    "updatedAt": "2026-01-28T00:00:00Z",
    "createdBy": "string"
  }
]
```

**Important Notes:**
- Dates should be in ISO 8601 format (e.g., `"2026-01-28T00:00:00Z"`)
- The system will automatically convert date strings to Date objects
- If `expiryDate` is null, it should be sent as `null` (not omitted)
- All fields are required except `variants` and `expiryDate`

**Error Responses:**

```json
// 401 Unauthorized
{
  "message": "Invalid or expired token"
}

// 403 Forbidden
{
  "message": "Insufficient permissions"
}

// 500 Internal Server Error
{
  "message": "Failed to load products"
}
```

## Date Format Handling

The system expects dates in ISO 8601 format:
- Format: `YYYY-MM-DDTHH:mm:ssZ` or `YYYY-MM-DDTHH:mm:ss.sssZ`
- Example: `"2026-01-28T10:30:00Z"` or `"2026-01-28T10:30:00.000Z"`

The frontend will automatically convert these strings to JavaScript Date objects.

## Offline Support

The system includes offline support:
- If the API is unavailable, it falls back to cached data in localStorage
- Cached data is automatically updated when API calls succeed
- Users can continue working with cached data when offline

## CORS Configuration

If your API is on a different domain, ensure CORS is properly configured:

```
Access-Control-Allow-Origin: https://warehouse.extremedeptkidz.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Accept
```

## Testing

To test the API integration:

1. Set `VITE_API_BASE_URL` in `.env.local`
2. Ensure your backend API is running
3. Log in to the application
4. Navigate to the Inventory page
5. Products should load from your API

If products don't load:
- Check browser console for errors
- Verify API endpoint is correct
- Verify authentication token is being sent
- Check network tab for API response
