# Cross-Device Responsiveness

Mobile-first layout, touch targets, and responsive tables/modals are implemented so the app works on phones, tablets, and desktops.

## Tables

- **Horizontal scroll on mobile**: Every data table is wrapped in a container with the `.table-scroll-wrap` class (or equivalent), which provides:
  - `overflow-x: auto` so wide tables scroll horizontally on small viewports
  - `-webkit-overflow-scrolling: touch` for smooth scrolling on iOS
  - `overscroll-behavior-x: contain` to avoid scroll chaining
- Tables use a minimum width (e.g. `min-w-[280px]`, `min-w-[320px]`, or `min-w-[800px]` for the product table) so columns stay readable when scrolling.
- Used in: Dashboard (Sales by store, Warehouse → Store), Reports (Category Performance, Top Value, Inventory by Category), TopProductsTable, UserManagement, ProductTableView, LocalStorageCacheView, Receipt.

## Fixed-Width and Layout

- **POS store/warehouse selects**: Use `w-full sm:max-w-[180px] min-w-0` so on narrow screens they can use full width and don’t overflow.
- **Header warehouse select**: Uses `w-full min-w-0 max-w-[200px]`; the header block is `hidden sm:flex` so it only appears from the `sm` breakpoint up.
- **Sidebar**: Fixed `w-[280px]` on desktop; hidden on `lg` below and replaced by MobileMenu.
- **Main content**: `max-w-[1600px]`, `overflow-x-hidden`, and padding use `max(1rem, var(--safe-*))` for safe areas.

## Modals and Popups

- **Overlay**: `.modal-overlay-padding` adds safe-area padding and `overflow-y: auto` with `-webkit-overflow-scrolling: touch` so the overlay can scroll on small screens.
- **Content**: Modals use `.modal-content-fit` (max-height `min(90vh, calc(100dvh - 2rem))`) and `mx-2 sm:mx-4` so they don’t touch screen edges on mobile.
- **ProductFormModal, Receipt**: Sticky header, scrollable body with `min-h-0` and `overflow-y-auto`, and 44×44px close button.
- **KeyboardShortcuts**: Same overlay padding and `max-h-[85vh] overflow-y-auto` on the inner panel.
- **Modal.tsx**: Wrapper uses `max-h-[90vh] overflow-y-auto` and padding so modal content scrolls on small viewports.

## Touch Targets (44×44px)

- **CSS**: `--touch-min: 44px`; Tailwind `min-h-touch` / `min-w-touch` map to 44px. Buttons and icon buttons use these or explicit `min-h-[44px] min-w-[44px]`.
- **Copy button (UserManagement)**: `min-h-[44px] min-w-[44px]` and `inline-flex items-center justify-center`.
- **Payment method buttons**: `min-h-touch` and `touch-manipulation`.
- **Nav items**: `min-height: var(--touch-min)` in `.nav-item`.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` shortens animations/transitions.

## Hover and Touch

- **Table rows**: `.table-row` uses `:hover` and `:focus-within`; `@media (hover: none)` adds `:active` for touch feedback.
- **Nav items**: `.nav-item` has `:hover`, `:focus-visible`, and `:active` for keyboard and touch.
- **Payment method and quick-amount buttons**: `active:bg-slate-300` / `active:bg-slate-50` and `touch-manipulation`.
- **Global**: `@media (hover: none)` adds `touch-action: manipulation` to buttons and links to reduce tap delay.

## Forms and Keyboards (Mobile)

- **Input types**: `type="email"` (Login, UserManagement, BusinessProfile), `type="tel"` (BusinessProfile phone), `type="number"` (quantity, prices, discount, cash), `type="date"` (DateRangePicker), `type="search"` (Header search).
- **inputmode**: `inputMode="decimal"` for money/decimals (PaymentPanel discount/cash, ProductFormModal cost/selling price); `inputMode="numeric"` for integers (quantity, reorder level); `inputMode="search"` for the header search.
- **Date inputs**: DateRangePicker uses `id` / `htmlFor`, `aria-label`, and `autoComplete="off"` for Safari-friendly behavior.
- **Labels**: Form labels are associated with inputs via `htmlFor` and `id` where applicable.

## Breakpoints (Mobile-First)

Tailwind breakpoints (no prefix = mobile, then up):

- **sm**: 640px
- **md**: 768px
- **lg**: 1024px (sidebar visible, mobile menu hidden)

Layout and visibility use these consistently (e.g. `grid-cols-1 lg:grid-cols-4`, `hidden sm:flex`, `p-4 sm:p-6`).

## Testing on Real Devices

- **iOS Safari**: Check horizontal table scroll, modal scroll and safe areas, date inputs, and 44px tap targets. Use “Add to Home Screen” if testing PWA behavior.
- **Chrome Android**: Check same table/modal behavior, numeric/decimal keyboards for amount fields, and touch feedback on buttons.
- **DevTools**: Use device emulation (e.g. iPhone SE, Pixel 5) and throttle CPU; verify no hover-only actions and that touch targets are at least 44×44px.
