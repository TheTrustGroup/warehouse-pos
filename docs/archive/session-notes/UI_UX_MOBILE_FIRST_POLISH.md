# UI/UX Mobile-First Polish

**Scope:** Refinement and consistency for the live POS & warehouse system (warehouse.extremedeptkidz.com). No new features, no backend/API changes, no new libraries or fonts.

**Principle:** Every decision works on ≤430px first. Desktop is an enhancement. Design like Apple: mobile-first, quiet confidence, no surprises.

---

## 1. Typography (Mobile-First Hierarchy)

### Decisions made
- **Single font family:** Inter only. Loaded once in `index.html` with weights 400, 500, 600, 700 (removed 300, 800 and duplicate import from CSS).
- **One scale:** Typography tokens documented in `src/index.css` (`:root`): `--text-xs` (12px) through `--text-2xl` (24px). Page titles use `text-2xl` on mobile so headings don’t overpower content; no larger than 24px for H1 on small screens.
- **Consistent usage:** Labels and helper text use `text-sm` / `text-xs` with `font-medium` where appropriate. Body uses `text-base` (16px) so no zoom is required on mobile (iOS avoids zoom when inputs are ≥16px).
- **Tailwind scale:** `fontSize` in `tailwind.config.js` (xs, sm, base, lg, xl, 2xl, 3xl) is used; no new sizes introduced. Hierarchy via size and spacing, not weight overload.

### Desktop
- Same scale. Slightly more breathing room via existing `lg:` padding and spacing. No new type sizes.

### Intentionally unchanged
- Logo and marketing gradient text styles.
- Badge and status label styles (success, warning, error, info).

---

## 2. Spacing & Vertical Rhythm

### Decisions made
- **Tokens in `:root`:** `--space-section` (24px), `--space-block` (16px), `--space-inline` (12px), `--touch-min` (44px), `--input-height` (44px), `--radius-base` (10px), `--radius-lg` (12px).
- **Main content:** `Layout.tsx` main uses `overflow-x-hidden`, `pl-[max(1rem,var(--safe-left))]`, `pr-[max(1rem,var(--safe-right))]`, `pb-[max(2rem,var(--safe-bottom))]`, and `mt-[calc(72px+var(--safe-top))]` so fixed header and safe areas don’t overlap content.
- **Touch targets:** Buttons and interactive elements use `min-h-touch` / `min-w-touch` (44px) or `input-field` (min-height 44px) for thumb-friendly use.

### Desktop
- Same tokens. `lg:px-8`, `lg:pt-8` add proportional spacing. Alignment and balance preserved.

### Intentionally unchanged
- Existing `space-y-6` / `space-y-4` patterns; no wholesale replacement of ad-hoc spacing to avoid regressions.

---

## 3. Dropdowns, Modals & Overlays

### Decisions made
- **Z-index order:** Header `z-10`, Mobile menu overlay `z-40`, Modals (ProductFormModal, Receipt) `z-50`, Toasts `z-[60]` so toasts always appear above modals.
- **Modals (ProductFormModal, Receipt):**
  - **Scroll lock:** When open, `document.body` gets class `scroll-lock` (overflow hidden, touch-action none); removed on close.
  - **Outside tap:** Clicking the backdrop (dark overlay) closes the modal; content div uses `stopPropagation` so clicks inside don’t close.
  - **Escape:** `keydown` listener for `Escape` closes the modal.
  - **Safe-area:** Overlay uses class `modal-overlay-padding` so the modal card sits inside safe-area insets (notch, home indicator).
- **Mobile menu:** When open, body gets `scroll-lock`; removed when closed.
- **Native selects:** All `<select>` elements use class `input-field` for consistent min-height (44px), border radius, and focus state. No custom dropdown component (no new libraries); native selects behave correctly on mobile (e.g. iOS system picker).

### Desktop
- Same behavior. No hover-only interactions; all actions work on click/tap.

### Intentionally unchanged
- Create delivery order flow still uses `window.prompt` (not replaced with a modal in this pass to avoid scope creep).
- Table view on very small viewports still scrolls horizontally with `min-w-[800px]` for readability (documented in original CSS comments).

---

## 4. Component Consistency

### Decisions made
- **Inputs and selects:** Shared class `input-field`: min-height 44px, `rounded-xl`, consistent border and focus (primary ring, no layout shift).
- **Buttons:** `btn-primary`, `btn-secondary`, `btn-action` already use `min-height` / `min-width` touch targets; no change.
- **Icons:** Lucide icons used with consistent sizes (`w-4 h-4`, `w-5 h-5`); aligned with text via `inline-flex items-center gap-2` (or equivalent) where needed.
- **Focus:** Global `*:focus-visible` outline with offset; `input-field` focus uses box-shadow so layout doesn’t shift.

### Desktop
- Same components and classes across breakpoints.

---

## 5. Cards, Tables & Lists

### Decisions made
- **Cards:** Existing `glass-card` and stacking unchanged. No clipped content.
- **Tables:** `ProductTableView` uses `overflow-x-auto` and `overscroll-x-contain` so horizontal scroll is contained and content isn’t clipped. `min-w-[800px]` kept for table readability.
- **Lists / cart:** Cart line items and quantity controls already use `min-w-touch` / `min-h-touch`; no change.

### Desktop
- Tables use available width; no cramped density changes.

---

## 6. Navigation & Fixed Elements

### Decisions made
- **Header:** Fixed; `min-h-[72px]`, `pt-[var(--safe-top)]`, horizontal padding `pl-[max(1rem,var(--safe-left))]` and `pr-[max(1rem,var(--safe-right))]` so content respects safe area.
- **Main:** `mt-[calc(72px+var(--safe-top))]` so content starts below header including safe area. `overflow-x-hidden` to avoid horizontal scroll.
- **Toast container:** Fixed at `bottom-[max(1rem,var(--safe-bottom))]`, `right-[max(1rem,var(--safe-right))]`, `z-[60]`. Stack limited by `max-h-[min(50vh,320px)]` with `overflow-y-auto` for multiple toasts. Container has `pointer-events-none` and children `pointer-events-auto` so taps pass through when not on a toast.
- **Mobile menu:** Toggle remains at 44px touch target; overlay and aside unchanged except scroll lock.

### Desktop
- Header and main alignment unchanged; no stretched or empty zones.

---

## 7. Design System Consolidation

### Tokens (in `src/index.css` and `tailwind.config.js`)
- **Spacing:** `--space-section`, `--space-block`, `--space-inline`, `--touch-min`, `--input-height`; Tailwind `spacing.touch`, `minHeight.touch`, `minWidth.touch`.
- **Typography:** CSS vars `--text-xs` … `--text-2xl` for reference; Tailwind `fontSize` and `fontFamily.sans` (Inter).
- **Radius:** `--radius-base`, `--radius-lg`; Tailwind `borderRadius.lg`, `xl`, `2xl`.
- **Safe area:** `--safe-top`, `--safe-bottom`, `--safe-left`, `--safe-right` (env(safe-area-inset-*)).

### Shared components
- **Button:** `btn-primary`, `btn-secondary`, `btn-action` (and variants).
- **Input:** `input-field` (used for text inputs and `<select>`).
- **Card:** `glass-card`, `card`, `glass`.
- **Modal:** Pattern: fixed overlay with `modal-overlay-padding`, scroll lock in effect, backdrop click and Escape to close.
- **Dropdown:** Native `<select>` with `input-field`; no custom dropdown component.

### Cleanup
- Removed duplicate Inter font import from `index.css` (font loaded in `index.html` only).
- Font weights in `index.html` reduced to 400, 500, 600, 700.
- Replaced ad-hoc select/input styles with `input-field` where safe (Header, Sidebar, MobileMenu, POS, Orders, Login; InventoryFilters and ProductFormModal/UserManagement already used it).

---

## 8. Mobile-First QA Checklist

**On real phone widths (≤430px):**
- [x] No horizontal scrolling (main has `overflow-x-hidden`; table scrolls inside its container).
- [x] No overlapping components (header/main/toast z-order and safe-area applied).
- [x] Consistent typography (single font, one scale).
- [x] Dropdowns: native selects with 44px touch target; modals fully visible with safe-area padding.
- [x] Touch targets ≥44px (inputs, buttons, nav items use `min-h-touch` / `input-field`).
- [x] UI calm and deliberate (no new visual noise; existing glass and hierarchy preserved).

**Desktop:**
- [x] No stretched or broken layouts.
- [x] Visual balance maintained; spacing scales with existing breakpoints.

---

## 9. What Was Intentionally Unchanged

- **Backend / API:** No changes.
- **Create delivery order:** Still uses `prompt()`; not replaced with a modal in this task.
- **Table horizontal scroll:** Intentional on very small viewports for table readability; no card-style replacement.
- **Existing flows and behavior:** No feature or logic changes; only visual and interaction polish (scroll lock, backdrop close, Escape, safe-area, consistent inputs/selects).
- **Libraries and fonts:** No new dependencies; Inter remains the only font.

---

## 10. Files Touched (Summary)

- `index.html` – Inter font weights trimmed to 400,500,600,700.
- `src/index.css` – Font import removed; typography/safe-area tokens added; `scroll-lock`, `modal-overlay-padding` utilities.
- `src/components/layout/Header.tsx` – Safe-area padding; select uses `input-field`.
- `src/components/layout/Layout.tsx` – Main safe-area and overflow.
- `src/components/layout/MobileMenu.tsx` – Scroll lock when open; role select uses `input-field`.
- `src/components/layout/Sidebar.tsx` – Role select uses `input-field`.
- `src/components/inventory/ProductFormModal.tsx` – Scroll lock, Escape, backdrop click close; safe-area overlay padding.
- `src/components/inventory/ProductTableView.tsx` – `overscroll-x-contain` on table wrapper.
- `src/components/pos/Receipt.tsx` – Scroll lock, Escape, backdrop click close; safe-area overlay padding.
- `src/contexts/ToastContext.tsx` – Toast container safe-area, z-[60], max-height and pointer-events for stacking.
- `src/pages/Login.tsx` – Email/password inputs use `input-field`.
- `src/pages/Orders.tsx` – Page title to `text-2xl`; status select uses `input-field`.
- `src/pages/POS.tsx` – Warehouse/store selects use `input-field`.

---

*Last updated: Refinement pass for mobile-first polish; no functional regressions intended.*
