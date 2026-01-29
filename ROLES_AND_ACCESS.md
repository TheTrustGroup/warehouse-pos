# Roles & Access: Limiting Features by Employee Role

This app limits features by **role**. Each employee gets one role; the app shows or hides menus and actions based on that role’s permissions.

---

## 1. Where roles are defined (this app)

**File:** `src/types/permissions.ts`

- **PERMISSIONS** – List of every capability (e.g. `inventory.create`, `pos.access`, `orders.view`).
- **ROLES** – Each role has a **name**, **description**, and **permissions** array.

| Role ID   | Name                  | Typical use                          |
|-----------|------------------------|--------------------------------------|
| `admin`   | Administrator          | Full access                          |
| `manager` | Store Manager          | Operations, no user delete           |
| `cashier` | Sales Person / Cashier | POS, orders, limited discount        |
| `warehouse` | Warehouse Staff      | Inventory + orders                   |
| `driver`  | Delivery Driver        | Orders (view, update status)         |
| `viewer`  | View Only / Accountant | Reports, dashboard, view-only        |

The **sidebar**, **pages**, and **buttons** (Add Product, Edit, Delete, etc.) all use these permissions. If the current user’s role doesn’t include a permission, that item is hidden or blocked.

---

## 2. How you assign a role to an employee

**Role assignment is done in your backend / main admin**, not in this warehouse app’s UI.

### Default logins (other roles only)

Keep **admin** credentials as you already have them. For the **other roles** (manager, cashier, warehouse, driver, viewer) use this format:

| Role      | Email (login)                  | Password  |
|-----------|--------------------------------|-----------|
| Manager   | manager@extremedeptkidz.com    | EDK-!@#   |
| Cashier   | cashier@extremedeptkidz.com   | EDK-!@#   |
| Warehouse | warehouse@extremedeptkidz.com | EDK-!@#   |
| Driver    | driver@extremedeptkidz.com    | EDK-!@#   |
| Viewer    | viewer@extremedeptkidz.com    | EDK-!@#   |

**Password for these roles is the same:** `EDK-!@#`. Create these users in your backend with the emails above and this password.

1. **In your main store admin** (e.g. `extremedeptkidz.com/admin` or wherever you manage users):
   - **Admin:** Keep your existing admin email and password.
   - **Other roles:** Create or edit the user with **email** `{role}@extremedeptkidz.com` and **password** `EDK-!@#`. Set **role** to one of: `manager`, `cashier`, `warehouse`, `driver`, `viewer`.

2. **When they log in to the warehouse app**, the app calls your API (e.g. `/admin/api/me` or `/api/auth/user`). That API must return a user object that includes:
   - **`role`** – one of the role IDs above (e.g. `"manager"`, `"cashier"`).

   Optional but recommended:
   - **`permissions`** – array of permission strings (e.g. `["dashboard.view","inventory.view","inventory.create",...]`).  
   If you don’t send `permissions`, the app will derive them from **role** using the definitions in `permissions.ts`.

So: **you give access by assigning a role (and optionally permissions) to each employee in your backend; this app then limits features based on that role.**

---

## 3. Changing what each role can do

To change what a role is allowed to do **in this app**:

1. Open **`src/types/permissions.ts`**.
2. Find the role in **ROLES** (e.g. `CASHIER`, `WAREHOUSE`).
3. Edit its **`permissions`** array: add or remove permission constants from **PERMISSIONS**.

Example: allow Cashiers to also update inventory (e.g. adjust stock):

```ts
CASHIER: {
  id: 'cashier',
  name: 'Sales Person / Cashier',
  permissions: [
    PERMISSIONS.POS.ACCESS,
    PERMISSIONS.POS.APPLY_DISCOUNT,
    PERMISSIONS.POS.VIEW_DAILY_SALES,
    PERMISSIONS.INVENTORY.VIEW,
    PERMISSIONS.INVENTORY.UPDATE,        // add this
    PERMISSIONS.INVENTORY.ADJUST_STOCK,   // and/or this
    PERMISSIONS.ORDERS.VIEW,
    PERMISSIONS.ORDERS.CREATE,
    PERMISSIONS.ORDERS.UPDATE_STATUS,
  ],
  // ...
},
```

If your backend also stores role permissions, keep that in sync with `permissions.ts` so the API can return the same permissions and behavior is consistent.

---

## 4. Quick reference: what each role can do

| Feature              | Admin | Manager | Cashier | Warehouse | Driver | Viewer |
|----------------------|-------|---------|---------|-----------|--------|--------|
| Dashboard            | ✅    | ✅      | ❌      | ❌        | ❌     | ✅     |
| Inventory (view)     | ✅    | ✅      | ✅      | ✅        | ❌     | ✅     |
| Inventory (add/edit/delete) | ✅ | ✅   | ❌      | Update only | ❌  | ❌     |
| POS                  | ✅    | ✅      | ✅      | ❌        | ❌     | ✅     |
| Orders (view)        | ✅    | ✅      | ✅      | ✅        | ✅     | ✅     |
| Orders (create/update) | ✅  | ✅      | ✅      | ✅        | Status only | ❌ |
| Reports              | ✅    | ✅      | ✅      | ❌        | ❌     | ✅     |
| Users                | ✅    | ❌      | ❌      | ❌        | ❌     | ❌     |
| Settings             | ✅    | ✅      | ❌      | ❌        | ❌     | ❌     |

Details (and limits like max discount) are in **`src/types/permissions.ts`** under each role’s `permissions` and `limits`.

---

## 5. Role switcher in the app (demo only)

The **Role** dropdown in the sidebar (and mobile menu) is for **demo/testing**. It overrides the role from the API so you can see the app as different roles. It does **not** change the employee’s real role in your backend. For real access control, assign roles in your backend as in section 2.

---

## 6. Backend checklist for role-based access

- [ ] User model has a **role** field (values: `admin`, `manager`, `cashier`, `warehouse`, `driver`, `viewer`).
- [ ] When creating/editing a user, an admin can set **role**.
- [ ] `/admin/api/me` (or your auth endpoint) returns **`role`** (and optionally **`permissions`**) in the user object.
- [ ] CORS and cookies are set so the warehouse app can call this API after login.

If you want, we can add a “Backend role API” section with example request/response shapes for your stack.
