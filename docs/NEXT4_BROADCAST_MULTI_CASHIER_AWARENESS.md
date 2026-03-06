# NEXT 4 — Broadcast: Multi-Cashier Awareness

When a cashier adds a low-stock item (remaining ≤ 3) to the cart, other cashiers on the same warehouse get a toast so they’re aware someone else is selling that product/size.

## What was implemented

1. **PresenceContext** (`src/contexts/PresenceContext.tsx`)
   - Same Realtime channel as presence (`warehouse-pos-presence`).
   - **Broadcast:** `sendLowStockAlert({ productName, sizeCode, sizeLabel, remaining, productId })` — context adds `senderEmail` and `senderName` from the current user and broadcasts a `low_stock_alert` message.
   - **Listen:** Incoming `low_stock_alert` messages (from other users only; ignores self by `senderEmail`) are appended to `receivedLowStockAlerts` with a unique `id` and `at` timestamp.
   - **Dismiss:** `dismissLowStockAlert(id)` removes an alert from the list (used after showing the toast).

2. **POS** (`src/pages/POSPage.tsx`)
   - **Helper:** `getRemainingForProduct(products, cart, productId, sizeCode, extraQty)` returns remaining stock for that product/size after subtracting cart and optional extra (sized products use `quantityBySize`).
   - **On add to cart:** After adding a line, if remaining (after this add) ≤ 3, calls `sendLowStockAlert` with product name, size, remaining, productId. Throttled: same product/size at most once per minute.
   - **On update qty (+1):** When increasing quantity, if remaining after the increase ≤ 3, same broadcast (with throttle).
   - **On receive:** `useEffect` on `receivedLowStockAlerts`; for each new alert, shows a warning toast: “⚠️ [senderName] is also selling [productName] · [size] ([remaining] remaining)” then calls `dismissLowStockAlert(id)`.

## Behaviour

- Only cashiers on the same Realtime channel see each other’s low-stock broadcasts (same app; channel is global but you can later scope by warehouse if needed).
- The sender does not see their own broadcast (filtered by `senderEmail` in context).
- Throttle (60s per product/size) avoids spam when repeatedly adding the same low-stock item.

## Optional

- Scope broadcasts by `warehouseId` so only cashiers in the same warehouse get the toast.
- Persist “last dismissed” in sessionStorage so toasts don’t re-appear after refresh for the same alert.
