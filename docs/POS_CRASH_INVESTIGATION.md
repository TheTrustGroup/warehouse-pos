# POS "Something went wrong" — Phase 1 & 2 Investigation

## What you need to do (to find the actual crash)

1. **Open DevTools → Console** (F12 or Cmd+Option+I). Leave it open.
2. **Reproduce the crash**: Add a product to cart, then proceed (open cart and/or tap Charge).
3. **Copy the FULL console error** including:
   - The error message
   - The stack trace (expand if needed)
   - Any `[RouteErrorBoundary] POS: ...` line (we log that in dev)
4. **Network tab**: When the crash happens, note:
   - Any request that failed (red) — URL, status code, response body
   - Whether the crash happens before or after a request
5. **In dev**, the RouteErrorBoundary shows a **gray box** with the raw error and stack. Copy that too.

**Without the exact error message and stack trace, we cannot pinpoint the throwing line.** The rest of this doc is the code-path analysis so that once you paste the error, we can map it to the fix.

---

## 3. RouteErrorBoundary (POS route)

**File:** `src/components/ui/RouteErrorBoundary.tsx`

- **Wraps POS at:** `src/App.tsx` — `<Route path="pos" element={<ProtectedRoute><RouteErrorBoundary routeName="POS"><POSPageRoute /></RouteErrorBoundary></ProtectedRoute>} />`
- **What it renders on error:** A card with title **"Something went wrong in POS"**, body from `getUserFriendlyMessage(error)`, and in **DEV only** a gray box with `error.message` and `error.stack`.
- **Does it swallow the error?** No. It **logs** in dev: `console.error('[RouteErrorBoundary] POS:', error.message, error.stack)` (see `componentDidCatch`). So the **exact error and stack are in the console** when you reproduce in development.
- **Recovery:** "Try again" resets the boundary state; "Refresh page" reloads the app.

---

## 4. Try/catch in the requested files

### POSPage.tsx

| Location | What it catches | On catch |
|----------|-----------------|----------|
| `apiFetch` (lines 232–261) | Fetch failure, non-ok response, JSON parse | Re-throws (timeout → "Request timed out"; others re-throw as-is) |
| `loadProducts` (lines 301–336) | `apiFetch` failure loading products | Sets `productsLoadError`, shows toast, does **not** re-throw |
| `handleCharge` verify-stock (650–681) | `apiFetch` for `/api/products/verify-stock` | Logs warning, **proceeds with sale** (server still validates) |
| `handleCharge` sale (684–698) | `saleMutation.mutateAsync` | Catches, shows toast if message not already handled, **does not re-throw** (prevents boundary) |
| Share receipt (731) | `navigator.share` | `.catch(() => {})` — no throw |

**Important:** `handleAddToCart` (544–591) has **no try/catch**. If anything inside it throws (e.g. `showToast`, `sendLowStockAlert`, or a bad value), the error will propagate to React and be caught by the RouteErrorBoundary.

### InventoryContext.tsx

- Multiple try/catch blocks around API calls (`apiGet`, `apiPost`, etc.). On failure they set error state, show toasts, or retry with fallback paths. None of these are in the POS add-to-cart path; POS uses **local** `products` state from POSPage (and optionally initial load from `safeInventoryProducts`).

### api.ts

- **Module load:** In **production**, if `VITE_API_BASE_URL` is unset, **throws** at load time (before any component runs). You ruled this out.
- `getAuthToken()`: try/catch returns `null` on error.

### Cart hook / cart context

- **POSPage does not use POSContext for the main POS flow.** It has its own `cart` state (`useState<CartLine[]>([])`) and `handleAddToCart` / `handleUpdateQty` / `handleRemoveLine` in POSPage. So the “add to cart” that can crash is **only** in POSPage.
- **POSContext** (`src/contexts/POSContext.tsx`) has its own `addToCart` and try/catch in `refreshPendingSyncCount` (returns 0 on catch). Not used by the POS route’s ProductGrid/CartSheet flow.

### Add-to-cart handler

- The handler that runs when you add an item in POS is **`handleAddToCart`** in **POSPage.tsx** (lines 544–591). It has **no try/catch**.

---

## 5. Exact code path: product card → add to cart

1. **Click product card**  
   - `POSProductCard` (`src/components/pos/POSProductCard.tsx`): `onClick={() => onSelect(product)}`.  
   - ProductGrid passes `onSelect={(product) => setActiveProduct(structuredClone(product))}`.  
   - So: **one tap** → `setActiveProduct(structuredClone(product))`. No API call.

2. **SizePickerSheet opens** (because `activeProduct` is set).  
   - For **sized** products: user picks a size and taps a size button.  
   - For **non-sized**: user taps “Add to cart — GH₵…”.

3. **Add to cart**  
   - SizePickerSheet `handleAdd` calls `onAdd({ productId, name, sku, sizeCode, sizeLabel, unitPrice, qty, imageUrl })`.  
   - That is **`handleAddToCart`** in POSPage.

4. **Inside `handleAddToCart` (POSPage.tsx 544–591)**  
   - `buildCartKey(input.productId, input.sizeCode ?? null)`  
   - `setCart(prev => ...)` — add or update line  
   - `showToast(...)` — local state  
   - `getRemainingForProduct(products, cart, ...)` — **note:** `cart` here is still the previous state (setState is async). Used only for low-stock broadcast.  
   - If `remaining <= LOW_STOCK_BROADCAST_THRESHOLD`: `sendLowStockAlert({ ... })` (PresenceContext).

5. **Where a throw would be caught by the boundary**  
   - Any **synchronous** throw in the above path (e.g. inside `handleAddToCart`, or inside `showToast` / `sendLowStockAlert` if they ever threw) would bubble to React and be caught by **RouteErrorBoundary**, showing “Something went wrong in POS”.  
   - If the crash happens **when opening the cart** (e.g. after add, when you tap to open the sheet), the throw is likely during **render** of POSPage or CartSheet (e.g. reading a property that is undefined).

---

## 6. Does add-to-cart trigger an API call?

**No.** Adding to cart in POS is **local state only**:

- `setCart(...)` in POSPage  
- `showToast(...)` (local state in POSPage’s `useToast`)  
- Optionally `sendLowStockAlert` (Supabase Realtime broadcast; if Supabase is not configured, `getSupabaseClient()` returns null and the broadcast is skipped).

**No** `/api/products`, `/api/sales`, or other HTTP call is made when you add an item to the cart. So if the crash happens on “add to cart” or “open cart”, it is a **code bug** (e.g. null/undefined access or a thrown helper), not a failed network request.

---

## 7. SizeSelectorPopover / SizePickerSheet

- **Component:** `SizePickerSheet` (`src/components/pos/SizePickerSheet.tsx`).  
- **When it opens:** When `activeProduct` is set (after tapping a product card).  
- **Selecting a size:** Calls `handleAdd` → `onAdd(...)` → `handleAddToCart` in POSPage.  
- **Could the crash be “before it opens”?** Yes — e.g. if `structuredClone(product)` threw (unlikely for API product shape), or if something in the parent re-render throws when `activeProduct` becomes non-null.  
- **Could the crash be when selecting a size?** Yes — then the throw is inside `handleAddToCart` or something it calls (`showToast`, `sendLowStockAlert`).

---

## 8. First item vs every add / specific products

- **First item only:** Could be consistent with a bug that only triggers when `cart` goes from empty to non-empty (e.g. a bad assumption when `cart.length === 0` or when a component first renders with one line).  
- **Every add:** Suggests the throw is inside `handleAddToCart` or in a re-render that always runs when cart updates.  
- **Specific products:** Could be a product with missing/weird field (e.g. `sellingPrice` undefined, or `quantityBySize` shape) that causes a null/undefined access or a type error in SizePickerSheet or in cart line rendering.

We can’t distinguish these without the **exact error and stack**.

---

## Phase 2 — What to report back

Once you have the crash:

1. **Exact error message** (e.g. `Cannot read properties of undefined (reading 'xyz')`).  
2. **Full stack trace** (which file and line).  
3. **Whether it is:**  
   - null/undefined access (e.g. `x.y` when `x` is undefined),  
   - failed API call (unlikely for add-to-cart),  
   - missing context value (you’d usually see “must be used within …”),  
   - or something else (e.g. `structuredClone`, or a non-function called as function).  
4. **Any failed network request** (URL, status, response body) at the moment of crash, if applicable.

**Do not apply a fix until we have the root cause.** After you paste the error and (if any) failed request here, we can point to the exact line and apply a minimal fix (Phase 3) following your rules (fix root cause, no swallowing with try/catch for cart ops, clear handling for charge/sale submission).
