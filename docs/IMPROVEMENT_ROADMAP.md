# Improvement roadmap — Sections 4 & 5 synthesis

**Purpose:** Prioritized list of improvements so the system is bulletproof, fast, and scalable for 10+ client deployments. Sections 1–3 (security, data integrity, performance) are already addressed in ENV_AND_SECRETS.md, DATA_INTEGRITY.md, and PERFORMANCE.md.

---

## Section 4 — UI/UX & operational excellence (audit summary)

| Area | Current state | Gap / recommendation |
|------|----------------|----------------------|
| **POS checkout flow** | Product grid → tap product → (size picker if sized) → cart bar → open cart sheet → choose payment → Charge. ~3–4 taps to complete a sale. CartSheet has payment options (cash, card, mobile_money, mixed). | Acceptable. Optional: one-tap “Quick charge (cash)” from cart bar without opening sheet for speed. |
| **Error states (network drops mid-sale)** | On POST /api/sales failure (non-409): toast “Sale not synced — deploy /api/sales”; cart clears; optimistic stock update; next loadProducts() resyncs. On 409: cart stays, toast “Insufficient stock…”. Circuit breaker in apiClient: when open, throws “Server temporarily unavailable…”. | **Gap:** No explicit “You’re offline” or “Sale didn’t reach server — retry?” when request fails. NetworkStatusContext shows offline/back-online banners; POS doesn’t block charge when circuit is open (request just throws). Consider: disable Charge when circuit open or show “Check connection and retry”. |
| **Offline capability** | loginOffline (auth), offlineDb, isOfflineEnabled (feature flag), sync queue. **Sales require server:** POST /api/sales is not queued for later sync; sale either succeeds or fails. | POS cannot complete sales without network. By design (no double-deduct). Document; optional: queue “pending sale” and sync when back online with idempotency. |
| **Barcode / QR scanner** | ProductSearch filters by name, SKU, or **barcode** (typed/pasted). Dependency `@ericblade/quagga2` present; **no camera/scanner UI** in POS — only Scan icon next to search. | **Gap:** No hardware or camera barcode scan. Add scanner input (e.g. Quagga2 camera or USB scanner that sends key events into search) for faster lookup. |
| **Mobile responsiveness** | Nav in config/navigation.tsx; Sidebar + MobileMenu; ENGINEERING_RULES §8 (mobile parity, cache, nav drift). Layout and touch targets (min-h-touch, etc.) in components. | Document target: tablets vs desktop. Ensure POS cart bar and charge button are thumb-friendly on tablets. |
| **Loading states** | POS: `loading` during loadProducts; `charging` during handleCharge (CartSheet blocks double-tap). Inventory: skeleton, polling. | Adequate. Optional: skeleton on POS product grid during first load. |
| **Optimistic UI** | POS: after Charge, stock deducts locally before server response; on failure, next loadProducts() restores truth. | Correct. Already documented in POSPage header. |
| **Keyboard shortcuts** | KeyboardShortcuts component: “/” focus search, Ctrl+K quick search, Esc close modal. ProductSearch: “/” focuses search. | Document for power users; consider F2/F4 for “New sale” / “Open cart” if POS is desktop-heavy. |

---

## Section 5 — Architecture & future-proofing (audit summary)

| Area | Current state | Gap / recommendation |
|------|----------------|----------------------|
| **Onboarding new client/warehouse** | Warehouses in DB; user_scopes (user_email, warehouse_id) for access. No single “onboarding wizard” or script. | **Gap:** Add runbook or script: create warehouse row, seed size_codes if needed, add user_scopes, set ALLOWED_WAREHOUSE_IDS or rely on user_scopes. Document in repo. |
| **Multi-currency / multi-tax** | Single currency in UI (GH₵). No tax fields in sales RPC or payload. | Future: add currency_code and tax fields to sales; config per warehouse or tenant. |
| **Reporting and analytics** | Dashboard, Reports (SalesMetrics, InventoryMetrics, TopProductsTable, SalesChart), Sales history (CSV export). GET /api/sales, /api/dashboard, etc. | Sufficient for current scope. Optional: saved date ranges, more breakdowns (by cashier, category). |
| **Receipt generation** | printReceipt (browser print), SaleSuccessScreen with receipt summary; sale_lines include product_image_url. No dedicated print server. | Digital receipt (print from browser) and on-screen. For thermal printers: integrate browser print or dedicated endpoint that returns receipt HTML/PDF. |
| **Webhook / integration readiness** | No outbound webhooks or accounting/Shopify hooks. | Future: webhook on sale (e.g. POST to configurable URL with sale payload); or event table + worker. |
| **Versioning and deploy** | Frontend: Vite build; vercel.json (rewrites, Cache-Control for /, index.html, version.json). Backend: Next.js (inventory-server) deploy separately (e.g. Vercel). Single repo warehouse-pos; inventory-server is subpath. | CI: `npm run ci` = ci:inventory + test + build. No explicit GitHub Actions shown in repo; document branch strategy and deploy pipeline (e.g. main → production). |
| **Test coverage** | Vitest (unit/integration): authRoleGuards, posFlow.simulation, InventoryContext.integration, ConflictModal, utils, printReceipt, imageUpload, dashboardStats, api, circuit, salesApi, InventoryPage, DashboardPage. Playwright (e2e): sw-update-toast. Backend: lint:auth script. | **Gap:** No E2E for full POS sale or inventory edit. Add at least one critical-path E2E (e.g. login → POS → add item → charge → success). |

---

## Prioritized improvement plan

### CRITICAL — Security or data integrity; fix before next client onboard

| # | Problem | Risk if unaddressed | Approach | Effort |
|---|--------|----------------------|----------|--------|
| 1 | **Cashier warehouse scope on GET products** | Cashiers could read other warehouses’ products by changing warehouse_id. | **Done.** GET /api/products and GET /api/products?id= enforce getEffectiveWarehouseId; 403 if out of scope. | — |
| 2 | **Weak auth on products/[...id]** | Any Bearer token could read/update/delete any product. | **Done.** requireAuth (GET) and requireAdmin (PUT/PATCH/DELETE) + scope. | — |
| 3 | **Negative stock / race on sale** | Two cashiers sell last unit → negative inventory. | **Done.** record_sale checks stock before deduct; INSUFFICIENT_STOCK + 409. | — |
| 4 | **receipt_seq missing** | record_sale fails on first sale if sequence doesn’t exist. | **Done.** Migration `20260301120000_receipt_seq.sql` creates sequence. | — |
| 5 | **RLS vs service role** | If RLS is ever enabled, service role bypasses it; ensure no accidental direct client access to DB. | **Done.** Documented in `docs/ENV_AND_SECRETS.md` (§ RLS and service role). | — |

---

### IMPORTANT — Robustness and UX that affect daily operations

| # | Problem | Risk if unaddressed | Approach | Effort |
|---|--------|----------------------|----------|--------|
| 6 | **No “sale didn’t reach server” recovery** | Cashier thinks sale went through; server never got it; stock wrong until next sync. | **Done.** On POST /api/sales failure (non-409): cart is kept, no success screen, toast: “Sale didn’t reach the server. Check your connection and tap Charge again.” Optional: disable Charge when circuit breaker is open and show banner. | — |
| 7 | **Manual sale fallback not atomic** | If RPC is missing, fallback can leave partial sale + partial deduction. | **Done.** Documented + warning log. Ensure record_sale migration is always applied in production. | — |
| 8 | **No barcode scanner** | Cashiers type/paste barcode; slower. | Add camera scan (Quagga2) or focus a “barcode input” that accepts USB scanner key events; on scan, search by barcode and add to cart or open size picker. | Medium |
| 9 | **New warehouse onboarding is ad hoc** | Inconsistent setup; missing user_scopes or size_codes. | **Done.** `docs/ONBOARDING_WAREHOUSE.md` runbook: create warehouse, seed size_codes, user_scopes, verify. | — |
| 10 | **No critical-path E2E** | Regressions in login or POS flow can ship. | **Done.** `e2e/pos-sale.spec.ts`: redirect when unauthenticated; full flow (login → POS → add → charge → success or known error) when `E2E_TEST_USER_EMAIL` and `E2E_TEST_USER_PASSWORD` are set. | — |

---

### ENHANCEMENT — Performance, analytics, future-proofing

| # | Problem | Risk if unaddressed | Approach | Effort |
|---|--------|----------------------|----------|--------|
| 11 | **Product list not paginated** | With >1000 products, single request is slow. | **Done.** Documented in PERFORMANCE.md. Add cursor pagination or “Load more” when catalog grows. | Medium (when needed) |
| 12 | **No audit trail for “who sold”** | Hard to resolve disputes or report by cashier. | Add sold_by_email (or populate sold_by from user id) in record_sale and POST /api/sales. | Small |
| 13 | **Idempotency in-memory only** | Duplicate POST from different instances can double-deduct. | Use Redis or DB table keyed by Idempotency-Key; return cached response when key seen. | Medium |
| 14 | **No webhooks** | Cannot push sales to accounting or other systems. | Add configurable webhook URL per tenant/warehouse; on sale completion, POST payload to URL (with retry and secret). | Large |
| 15 | **Multi-currency / multi-tax** | Cannot expand to regions with different currency or tax. | Add currency_code and tax fields to sales and UI; config per warehouse. | Large |
| 16 | **CI/CD not codified** | Deploy and branch strategy may drift. | **Done.** `.github/workflows/ci.yml` runs on push/PR to main: frontend lint + `npm run ci` + backend build. Deploy and branch strategy documented in `docs/ENGINEERING_RULES.md` §10. | — |

---

## Implementation order (suggested)

1. **Immediate:** #4 (receipt_seq), #5 (RLS/doc). — **Done.**  
2. **Before next client:** #9 (onboarding doc), #10 (E2E). — **Done.**  
3. **Next sprint:** #6 (recovery UX), #8 (barcode scanner), #12 (sold_by). (#6 done.)  
4. **When scaling:** #11 (pagination if catalog >1000), #13 (distributed idempotency). (#16 CI/CD done.)  
5. **When integrating:** #14 (webhooks), #15 (multi-currency/tax).

---

## References

- Security and env: `docs/ENV_AND_SECRETS.md`
- Data integrity: `docs/DATA_INTEGRITY.md`
- Performance: `docs/PERFORMANCE.md`
- Repo discipline: `docs/ENGINEERING_RULES.md`
