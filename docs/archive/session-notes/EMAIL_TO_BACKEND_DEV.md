# Email Template for Backend Developer

**Subject:** Backend API Requirements for Warehouse POS System

---

Hi [Backend Developer Name],

I hope this email finds you well. We're working on the Warehouse POS System frontend and need the backend API endpoints to be implemented. 

I've prepared a comprehensive requirements document that specifies all the API endpoints, request/response formats, and CORS configuration needed for the frontend to function properly.

## Key Information

- **Frontend Domain:** `https://warehouse.extremedeptkidz.com`
- **API Base URL:** `https://extremedeptkidz.com/api`
- **Required Endpoints:** Authentication, Products, Orders, Transactions

## Critical Requirements

1. **CORS Configuration** - The backend MUST allow requests from `warehouse.extremedeptkidz.com`
2. **Authentication** - Support for Bearer tokens OR httpOnly cookies
3. **Test Credentials** - User: `info@extremedeptkidz.com` / Password: `Admin123!@#`

## Documentation

I've attached the following documents:

1. **`BACKEND_REQUIREMENTS.md`** - Complete API specification with all endpoints, request/response formats, and examples
2. **`BACKEND_API_SETUP.md`** - Framework-specific implementation examples (Laravel, Express, etc.)
3. **`API_TROUBLESHOOTING.md`** - Debugging guide for common issues

## Priority Endpoints

To get the frontend working, we need these endpoints first:

1. `POST /api/auth/login` - User authentication
2. `GET /api/auth/user` - Get current user
3. `POST /api/auth/logout` - Logout
4. `GET /api/products` - List products

The remaining endpoints (orders, transactions, CRUD operations) can be implemented incrementally.

## Testing

Once the endpoints are implemented, you can test them using:

```bash
# Test login
curl -X POST https://extremedeptkidz.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"info@extremedeptkidz.com","password":"Admin123!@#"}'
```

## Questions?

If you have any questions about the requirements or need clarification on any endpoint, please don't hesitate to reach out. I'm happy to discuss the implementation details.

Looking forward to working together on this!

Best regards,  
[Your Name]

---

**Attachments:**
- BACKEND_REQUIREMENTS.md
- BACKEND_API_SETUP.md
- API_TROUBLESHOOTING.md
