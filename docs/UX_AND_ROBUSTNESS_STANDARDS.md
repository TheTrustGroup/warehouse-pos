# UX & Robustness Standards

Make every click, flow, and component feel professional and robust—like the work of an engineer who knows the system. Use this as a **checklist** when building or reviewing features.

---

## 1. Feedback on every action

| Rule | What to do | Current status |
|------|------------|----------------|
| **Mutating actions** | Show clear feedback: loading state on the button (e.g. "Saving…", "Updating…") and disable the button until the request completes. | ✅ ProductFormModal, Login, Orders status buttons, SystemPreferences. ⚠️ PaymentPanel "Complete sale" does not show "Processing…" during `onComplete`—parent POSContext handles the async; consider a `isCompleting` prop to disable and show state. |
| **Success** | After a successful mutation, show a toast (e.g. "Product saved.", "Order confirmed."). | ✅ Add/update/delete product, Login, many settings. Verify every mutation path has a success toast. |
| **Errors** | Show a toast or inline message with a clear, user-friendly message. Offer "Retry" where applicable. | ✅ InventoryContext, Login, OrderContext. ⚠️ Some `.catch(() => {})` (e.g. Dashboard fetch) swallow errors—surface a non-intrusive toast or inline error. |
| **Destructive actions** | Always confirm before delete/irreversible action. Use a consistent confirmation pattern (modal preferred over `confirm()` for consistency). | ✅ Delete product (confirm). ⚠️ Several places use `confirm()`; consider a shared `<ConfirmDialog>` for consistent look and accessibility. |

**Delete and cross-device:** Product delete requires **admin** role (API returns 403 otherwise). After a successful delete, the list updates immediately on the device that deleted (optimistic). Other devices see the change within **~10 seconds** (automatic background poll when the Inventory tab is visible), or **immediately** if the user clicks the **Refresh list** button (next to "Updated X ago") or switches away and back to the tab.

**Edits:** Product edits (name, price, image, etc.) are saved to the server and reflected on the **current device** right away. Other devices get the updated product on the next automatic poll (~10s) or when they use **Refresh list** or return to the tab.

**Recommendation:** Add a small `ConfirmDialog` component (title, message, Confirm/Cancel) and use it everywhere you currently use `confirm()`. Ensures consistent styling and works better with screen readers.

---

## 2. Loading states

| Rule | What to do | Current status |
|------|------------|----------------|
| **Initial page load** | Never show a blank content area. Use a skeleton that matches the final layout, or a centered spinner with a short message. | ✅ CriticalDataGate (app-level), Inventory (InventoryListSkeleton when products.length === 0), Orders (skeleton grid). ⚠️ Dashboard fetches transactions without a skeleton—show a lightweight skeleton or "Loading dashboard…" until data is ready. |
| **Background refresh** | When refetching without replacing the whole screen, show a small indicator (e.g. "Updating…" with spinner) so the user knows something is happening. | ✅ Inventory "Updating…" when isBackgroundRefreshing. Reuse this pattern on Orders, Reports, any list that refetches. |
| **Buttons** | While a mutation is in progress, disable the submit button and show loading text or spinner inside it. | ✅ ProductFormModal, Login, SystemPreferences, Orders status buttons. Audit all submit/mutation buttons. |

**Recommendation:** For Dashboard, add a simple loading state (skeleton for stat cards + chart area) while `todaySales` / `salesByStore` are loading. Replace silent `.catch(() => {})` with at least a toast on failure.

---

## 3. Empty states

| Rule | What to do | Current status |
|------|------------|----------------|
| **Lists** | When there are no items, show a dedicated empty state: icon, short title, one-sentence explanation, and primary action (e.g. "Add first product"). | ✅ Inventory "No products yet", ProductTableView/ProductGridView "No products found", LocalStorageCacheView. Apply same pattern to Orders (no orders), Reports (no data), any list. |
| **Search/filter** | When filters return zero results but the list isn’t globally empty, say so clearly (e.g. "No products match your filters") and offer "Clear filters". | ✅ Inventory filtered count. Ensure message is visible and action is obvious. |

**Recommendation:** Standardize empty state layout: icon (e.g. in a circle), `h2` title, one line of description, single primary button. Reuse one component, e.g. `<EmptyState icon={Package} title="No products yet" description="Add your first product to get started." action={<Button>Add first product</Button>} />`.

---

## 4. Error handling

| Rule | What to do | Current status |
|------|------------|----------------|
| **Route-level errors** | Wrap route trees in an error boundary. Show a friendly message and "Try again" / "Refresh page". | ✅ RouteErrorBoundary used in App. |
| **Data-loading errors** | Don’t leave the user with a blank screen or stale data without explanation. Show an inline error (banner or card) with a Retry button. | ✅ Inventory server-unavailable banner, cache fallback toast. ⚠️ Dashboard/Orders fetch errors are often swallowed; surface them. |
| **Form validation** | Show field-level errors next to inputs. Use `aria-invalid` and `aria-describedby` for screen readers. | ✅ Login. Replicate in ProductFormModal for any inline validation beyond toast. |
| **Network/5xx** | Use a consistent message (e.g. "Can’t reach the server. Check your connection and try again.") and offer Retry. | ✅ loadProducts error messages. Use same wording app-wide. |

**Recommendation:** Define a small set of error messages in one place (e.g. `lib/errorMessages.ts` or `getUserFriendlyMessage`) and use them everywhere. Add Retry to any view that loads data (Dashboard, Orders, Reports).

---

## 5. Accessibility (a11y)

| Rule | What to do | Current status |
|------|------------|----------------|
| **Focus** | Modals and dialogs should trap focus and return focus to the trigger when closed. Escape closes modals. | ✅ ProductFormModal: Escape handler, scroll lock. ⚠️ Add focus trap (focus first focusable, Tab cycles inside, focus return on close). |
| **Live regions** | When content updates dynamically (e.g. "Updating…", toast, list count), use `aria-live="polite"` and `role="status"` so screen readers announce it. | ✅ Inventory "Updating…", loading skeleton. Use for any dynamic status text. |
| **Buttons and links** | Every icon-only button must have `aria-label`. Primary actions should be keyboard-accessible. | ✅ Many buttons have aria-label. Audit icon-only actions (Edit, Delete, View) everywhere. |
| **Touch targets** | Buttons and clickable elements at least 44×44px (use `min-h-touch` / design tokens). | ✅ Button, many components. Verify nav items and table row actions. |
| **Color** | Don’t rely on color alone for status (e.g. success/error). Use icon + text. | ✅ Toasts and banners use icon + message. |

**Recommendation:** Add a focus trap utility (or use a small hook) for ProductFormModal and any other modal. Run a quick pass with a screen reader (e.g. VoiceOver) on Inventory, POS, and Login.

---

## 6. Navigation and layout

| Rule | What to do | Current status |
|------|------------|----------------|
| **Page structure** | Every page has a clear title (h1) and optional short description. Same vertical rhythm (e.g. title → filters → content). | ✅ Inventory, Orders. Ensure Dashboard, Reports, Settings tabs follow the same pattern. |
| **Active route** | Sidebar (and mobile nav) clearly shows the current page (e.g. active class on NavLink). | ✅ NavLink gets active class. Verify contrast and visibility. |
| **Breadcrumbs** | For deep flows (e.g. Settings → Users → Edit), breadcrumbs help. Optional for flat structure. | ⚠️ Not present; add if you add deeper hierarchies. |

**Recommendation:** Use a shared `<PageHeader title="…" description="…" />` (or similar) so every page has consistent title + optional description and spacing.

---

## 7. Consistency

| Rule | What to do | Current status |
|------|------------|----------------|
| **Buttons** | Use the shared `<Button>` component. Use `variant="danger"` for destructive actions, `variant="primary"` for the main action. | ✅ Most places use Button. Replace any raw `<button className="...">` with Button. |
| **Cards** | Use the same card style (e.g. `solid-card`) for content blocks so the app feels cohesive. | ✅ Widespread. Keep using it. |
| **Toasts** | Use the same toast API (`showToast('success' | 'error' | 'warning', message)`) for all user feedback. | ✅ ToastContext used across the app. |
| **Copy** | Use consistent wording: "Saving…" not "Save in progress"; "Try again" for retries; "Add first product" for empty state. | Document a short word list and stick to it. |

**Recommendation:** Add a one-page "Copy and patterns" section to this doc (or to CONTRIBUTING) with preferred labels for Save/Cancel/Retry/Delete/Confirm and for loading/success/error states.

---

## 8. Performance and perceived performance

| Rule | What to do | Current status |
|------|------------|----------------|
| **Don’t block the UI** | Heavy work (e.g. initial load, sync) should not freeze the main thread. Use async + loading states. | ✅ Data loading is async. |
| **Optimistic UI** | For fast-feeling mutations (e.g. add product), show the new item immediately and reconcile with server response. | ✅ Add product uses optimistic temp item. |
| **Skeleton over spinner** | Where the layout is known, prefer a skeleton to a spinner so the page doesn’t "jump" when content appears. | ✅ Inventory, Orders. Use for Dashboard and other list/dashboard views. |

---

## 9. Implementation priority

Tackle in this order for maximum impact with reasonable effort:

1. **High (do first)**  
   - Add loading state to Dashboard (skeleton or "Loading dashboard…").  
   - Surface errors for Dashboard/Orders fetches (toast or small banner + Retry).  
   - Add "Processing…" / disabled state to PaymentPanel "Complete sale" while the sale is submitting.  
   - Add focus trap to ProductFormModal (and any other modal).

2. **Medium**  
   - Introduce `<EmptyState>` and use it on Orders (no orders), Reports (no data).  
   - Introduce `<ConfirmDialog>` and replace `confirm()` in Inventory, AdminDashboard, CategoryManagement, Settings.  
   - Add `<PageHeader>` and use it on every main page for consistent title + description.

3. **Ongoing**  
   - Every new feature: loading state, success/error feedback, empty state if it’s a list, and a11y (aria-label, focus, live regions).  
   - Before release: quick pass with keyboard-only and one screen reader on critical flows (Login, Inventory, POS).

---

## 10. Quick audit checklist (per feature)

When adding or reviewing a feature, ask:

- [ ] Is there a loading state (skeleton or spinner)?
- [ ] On success, does the user get clear feedback (toast or inline)?
- [ ] On error, is the error shown and is there a Retry or next step?
- [ ] For lists: is there an empty state with a clear action?
- [ ] For destructive actions: is there a confirmation (ideally modal)?
- [ ] Are buttons disabled (and showing loading text) while a mutation is in progress?
- [ ] Do icon-only buttons have `aria-label`?
- [ ] If it’s a modal, does Escape close it and is focus trapped?

Using this checklist will keep every component, flow, and element at a high, consistent standard so the app feels robust and professional throughout.
