# API Discovery Template

**Fill this out after discovering your existing admin API, then share it with me.**

---

## 🔗 API Base Information

**API Base URL:** `_________________________`
*(e.g., `https://extremedeptkidz.com/api` or `https://extremedeptkidz.com/admin/api`)*

**Admin Panel URL:** `_________________________`
*(Where you log into the admin panel)*

**Admin Panel Type:** `_________________________`
*(Laravel, WordPress, Shopify, Custom, etc.)*

---

## 🔐 Authentication

**Authentication Method:** `_________________________`
- [ ] Bearer Token (JWT)
- [ ] Session Cookies (httpOnly)
- [ ] API Key
- [ ] OAuth
- [ ] Other: _______________

**How to get auth token/cookie:**
*(Describe the login flow - what endpoint, what response format)*

**Token/Cookie Name:** `_________________________`
*(e.g., `auth_token`, `laravel_session`, `access_token`)*

---

## 📋 API Endpoints

### Authentication

**Login Endpoint:**
- Method: `POST`
- URL: `_________________________`
- Request Body Format:
  ```json
  {
    "email": "...",
    "password": "..."
  }
  ```
- Response Format:
  ```json
  {
    "user": {...},
    "token": "..."
  }
  ```

**Get Current User:**
- Method: `GET`
- URL: `_________________________`
- Headers Required: `_________________________`

**Logout:**
- Method: `POST`
- URL: `_________________________`

---

### Products/Inventory

**Get All Products:**
- Method: `GET`
- URL: `_________________________`
- Response Format: `_________________________`

**Create Product:**
- Method: `POST`
- URL: `_________________________`

**Update Product:**
- Method: `PUT` or `PATCH`
- URL: `_________________________`

**Delete Product:**
- Method: `DELETE`
- URL: `_________________________`

---

### Orders

**Get All Orders:**
- Method: `GET`
- URL: `_________________________`

**Create Order:**
- Method: `POST`
- URL: `_________________________`

**Update Order Status:**
- Method: `PUT` or `PATCH`
- URL: `_________________________`

---

### Transactions

**Get All Transactions:**
- Method: `GET`
- URL: `_________________________`

**Create Transaction:**
- Method: `POST`
- URL: `_________________________`

---

## 📝 Sample API Response

**Paste a sample API response here** (from Products or User endpoint):

```json
{
  "example": "response"
}
```

---

## 🔒 CORS Configuration

**Does the API allow requests from `warehouse.extremedeptkidz.com`?**
- [ ] Yes
- [ ] No (needs to be configured)
- [ ] Not sure

---

## ✅ Once Filled Out

Share this completed template, and I will:

1. ✅ Update all frontend API calls to match your endpoints
2. ✅ Configure authentication to match your method
3. ✅ Update environment variables
4. ✅ Test the connection
5. ✅ Fix any data format mismatches

---

**Ready to fill this out?** Follow the steps in `HOW_TO_FIND_EXISTING_API.md` first!
