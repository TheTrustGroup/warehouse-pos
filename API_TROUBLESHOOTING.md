# API Troubleshooting Guide

This guide will help you diagnose and fix the "Failed to fetch" error when connecting to the backend API.

## Step 1: Verify API Endpoint Accessibility

### Test the API endpoint directly in your browser or terminal:

```bash
# Test the auth/user endpoint (should return 401 if not authenticated, which is OK)
curl -v https://extremedeptkidz.com/api/auth/user

# Test with credentials included
curl -v https://extremedeptkidz.com/api/auth/user \
  -H "Accept: application/json" \
  --cookie "your_session_cookie_here"
```

**Expected Results:**
- ✅ **200 OK** - API is working, user is authenticated
- ✅ **401 Unauthorized** - API is working, user is not authenticated (this is OK for initial check)
- ❌ **Connection refused / Timeout** - API server is down or unreachable
- ❌ **404 Not Found** - API endpoint doesn't exist at that path
- ❌ **CORS error** - API is blocking requests from your domain

### Test from Browser Console:

1. Open your deployed app: `https://warehouse.extremedeptkidz.com`
2. Open browser DevTools (F12)
3. Go to Console tab
4. Run this command:

```javascript
fetch('https://extremedeptkidz.com/api/auth/user', {
  method: 'GET',
  headers: { 'Accept': 'application/json' },
  credentials: 'include'
})
  .then(r => console.log('Status:', r.status, r.statusText))
  .catch(e => console.error('Error:', e));
```

**Check the Network tab** to see the actual request/response details.

---

## Step 2: Configure CORS on Your Backend API

If you're getting CORS errors, your backend needs to allow requests from your frontend domain.

### For Laravel/PHP Backend:

**File: `config/cors.php` or middleware**

```php
<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => [
        'https://warehouse.extremedeptkidz.com',
        'http://localhost:5173', // For local development
    ],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true, // Important for cookies!
];
```

**Or in your middleware:**

```php
// In app/Http/Middleware/Cors.php or similar
public function handle($request, Closure $next)
{
    return $next($request)
        ->header('Access-Control-Allow-Origin', 'https://warehouse.extremedeptkidz.com')
        ->header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        ->header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-CSRF-TOKEN')
        ->header('Access-Control-Allow-Credentials', 'true');
}
```

### For Node.js/Express Backend:

```javascript
const cors = require('cors');

app.use(cors({
  origin: [
    'https://warehouse.extremedeptkidz.com',
    'http://localhost:5173' // For local development
  ],
  credentials: true, // Important for cookies!
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-CSRF-TOKEN']
}));
```

### For Django Backend:

**File: `settings.py`**

```python
CORS_ALLOWED_ORIGINS = [
    "https://warehouse.extremedeptkidz.com",
    "http://localhost:5173",  # For local development
]

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]
```

---

## Step 3: Verify API Server Status

### Check if your API server is running:

```bash
# Check if the API responds
curl -I https://extremedeptkidz.com/api/auth/user

# Check server logs for errors
# (Location depends on your hosting: cPanel, Vercel, AWS, etc.)
```

### Common Issues:

1. **API Server Not Running**
   - Check your hosting provider's dashboard
   - Verify the API service is started
   - Check server logs for errors

2. **Wrong API URL**
   - Verify the API is actually at `https://extremedeptkidz.com/api`
   - It might be at `https://api.extremedeptkidz.com` instead
   - Check your backend deployment configuration

3. **SSL Certificate Issues**
   - Ensure SSL certificate is valid for `extremedeptkidz.com`
   - Check for mixed content warnings (HTTP/HTTPS mismatch)

---

## Step 4: Update Environment Variables

### For Production Deployment:

Make sure your production build uses the correct environment variables. If deploying to Vercel/Netlify:

1. **Vercel:**
   - Go to Project Settings → Environment Variables
   - Add:
     - `VITE_API_BASE_URL` = `https://extremedeptkidz.com`
     - `VITE_API_URL` = `https://extremedeptkidz.com/api`
   - Redeploy

2. **Netlify:**
   - Go to Site Settings → Environment Variables
   - Add the same variables
   - Redeploy

3. **Other Hosting:**
   - Ensure `.env.production` is included in your build
   - Or set environment variables in your hosting dashboard

---

## Step 5: Test Authentication Flow

### Test Login Endpoint:

```bash
curl -X POST https://extremedeptkidz.com/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "email": "info@extremedeptkidz.com",
    "password": "Admin123!@#"
  }'
```

**Expected Response:**
```json
{
  "user": {
    "id": "...",
    "email": "info@extremedeptkidz.com",
    "role": "admin",
    ...
  },
  "token": "..." // Optional if using httpOnly cookies
}
```

---

## Step 6: Browser-Specific Debugging

### Check Browser Console:

1. Open DevTools (F12)
2. Go to **Network** tab
3. Try to log in
4. Look for the failed request
5. Check:
   - **Request URL** - Is it correct?
   - **Request Method** - GET/POST?
   - **Status Code** - What error?
   - **Response** - What does the server return?
   - **Headers** - Are credentials included?

### Common Network Tab Errors:

- **CORS error** → Backend CORS not configured
- **401 Unauthorized** → Credentials issue or session expired
- **404 Not Found** → Wrong API endpoint URL
- **500 Internal Server Error** → Backend server error (check backend logs)
- **Failed to fetch** → Network issue, server down, or CORS blocking

---

## Step 7: Quick Fixes to Try

### Option 1: Use Same Domain for API

If your frontend is at `warehouse.extremedeptkidz.com`, consider:
- Using a proxy/rewrite rule to serve API from same domain
- Or ensure CORS is properly configured

### Option 2: Check API Path

Your API might be at a different path. Try:
- `https://extremedeptkidz.com/api/auth/user` (current)
- `https://api.extremedeptkidz.com/auth/user`
- `https://extremedeptkidz.com/auth/user`

### Option 3: Verify Backend Routes

Ensure your backend has these routes:
- `GET /api/auth/user` - Check auth status
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout

---

## Step 8: Contact Your Backend Developer

If you don't have backend access, provide them with:

1. **Frontend Domain:** `warehouse.extremedeptkidz.com`
2. **Required Endpoints:**
   - `GET /api/auth/user`
   - `POST /api/auth/login`
   - `POST /api/auth/logout`
3. **CORS Requirements:** Allow origin `https://warehouse.extremedeptkidz.com`
4. **Authentication Method:** Cookie-based (httpOnly) or Bearer token

---

## Quick Diagnostic Checklist

- [ ] API endpoint is accessible (test with curl/browser)
- [ ] CORS is configured to allow `warehouse.extremedeptkidz.com`
- [ ] API server is running and responding
- [ ] SSL certificate is valid
- [ ] Environment variables are set correctly in production
- [ ] Backend routes exist (`/api/auth/user`, `/api/auth/login`)
- [ ] Browser console shows specific error (not just "Failed to fetch")
- [ ] Network tab shows request details

---

## Need More Help?

1. **Check Browser Console** - Look for specific error messages
2. **Check Network Tab** - See the actual HTTP request/response
3. **Check Backend Logs** - See what the server receives
4. **Test API Directly** - Use curl/Postman to isolate frontend vs backend issues
