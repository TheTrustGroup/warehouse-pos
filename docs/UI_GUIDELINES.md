# UI Guidelines

This document describes the design system used in the Warehouse POS app: glassmorphism, components, animations, accessibility, and dark mode. Follow these guidelines to keep the UI consistent and maintainable.

---

## Table of Contents

1. [Glassmorphism Style Guide](#glassmorphism-style-guide)
2. [Component Library](#component-library)
3. [Animation Usage](#animation-usage)
4. [Accessibility Requirements](#accessibility-requirements)
5. [Dark Mode Support](#dark-mode-support)

---

## Glassmorphism Style Guide

The app uses a **glass** aesthetic: frosted, semi-transparent surfaces with blur and light borders. This is implemented in `src/styles/glassmorphism.css` and referenced from `src/index.css`.

### Design tokens (CSS variables)

Defined in `:root` and overridden in `.dark`:

| Token | Light | Dark | Purpose |
|-------|--------|------|---------|
| `--glass-bg-primary` | rgba(255,255,255,0.72) | rgba(30,41,59,0.72) | Main glass background |
| `--glass-bg-secondary` | rgba(255,255,255,0.55) | rgba(30,41,59,0.55) | Softer glass |
| `--glass-border` | rgba(255,255,255,0.18) | rgba(255,255,255,0.08) | Border |
| `--glass-border-strong` | rgba(255,255,255,0.35) | rgba(255,255,255,0.15) | Emphasized border |
| `--glass-blur` | 10px (6px on mobile) | same | Backdrop blur |
| `--glass-saturate` | 180% | same | Backdrop saturation |
| `--glass-shadow` | light shadow | darker shadow | Card shadow |

### Class reference

| Class | Use case |
|-------|----------|
| **.glass-card** | Primary card for content (inventory list, dashboard cards, settings panels). Rounded (1rem), hover brightens. |
| **.glass-primary** | Stronger glass panel. |
| **.glass-secondary** | Softer glass (nested or secondary panels). |
| **.glass** | Legacy alias; prefer .glass-card or .glass-primary. |
| **.glass-dark** | Dark glass (e.g. overlays). |
| **.glass-hover** | Add to glass elements for hover lift + glow (use sparingly). |
| **.glass-overlay** | Modal backdrop (dark + blur). |
| **.glass-border-gradient** | Gradient border via pseudo-element. |
| **.glass-shimmer** | Loading shimmer on glass. |

### Best practices

- **Performance:** Use at most **3 blur layers** per viewport. Avoid applying glass to long scrolling lists (prefer glass on headers, sidebars, modals, and fixed panels).
- **Fallback:** The stylesheet uses `@supports (backdrop-filter: ...)`; when unsupported, opaque backgrounds are used so layout and contrast remain.
- **Mobile:** Blur is reduced (`--glass-blur: 6px`) on viewports ≤768px for performance.
- **Reduced motion:** `prefers-reduced-motion: reduce` disables hover transform on `.glass-hover` and slows `.glass-shimmer`.

**Example:**

```html
<div class="glass-card p-6 rounded-2xl">
  <h2 class="text-lg font-semibold text-slate-900">Section title</h2>
  <p class="text-slate-600">Content...</p>
</div>
```

---

## Component Library

### Design tokens (from index.css)

- **Spacing:** `--space-section` (24px), `--space-block` (16px), `--space-inline` (12px).
- **Touch:** `--touch-min: 44px` (minimum hit area for buttons/links).
- **Input:** `--input-height: 44px`, `.input-field` for text inputs.
- **Radius:** `--radius-base: 10px`, `--radius-lg: 12px`.
- **Z-index:** `--z-header: 10`, `--z-modal: 50`, `--z-toast: 60`.
- **Safe areas:** `--safe-top/bottom/left/right` for notches and home indicators.

### Button (`src/components/ui/Button.tsx`)

Use the `<Button>` component instead of raw `<button>` with ad-hoc classes.

| Variant | Class / usage |
|---------|----------------|
| **primary** | Main CTA (Add product, Complete sale). Red gradient, one per screen when possible. |
| **secondary** | Cancel, back, secondary actions. |
| **action** | Icon-only or small actions (neutral). |
| **actionView** | View icon button. |
| **actionEdit** | Edit icon button. |
| **danger** | Delete, destructive. Red on hover. |
| **ghost** | Low emphasis, bordered. |

**Sizes:** `sm`, `md` (default), `lg`.

**Example:**

```tsx
import { Button } from '../components/ui/Button';

<Button variant="primary" onClick={handleSave}>Save</Button>
<Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
<Button variant="danger" onClick={handleDelete} aria-label="Delete">Trash icon</Button>
```

### Inputs

- Use **.input-field** for text inputs and selects (min-height 44px, rounded-xl, focus ring).
- Always pair with a **label** (visible or sr-only). Use `htmlFor` and `id` for association.
- For validation errors, add a class (e.g. `border-red-500`) and `aria-invalid`, and show an error message linked with `aria-describedby`.

### Badges

- **.badge** base; then **.badge-success**, **.badge-warning**, **.badge-error**, **.badge-info** for status (synced, pending, error, info).

### Cards and layout

- **.card** + **.glass-card**: Standard content card.
- **.table-container**, **.table-scroll-wrap**, **.table-header**, **.table-row**: Data tables with horizontal scroll on small screens.

### Modals

- Use **.glass-overlay** for the backdrop and a glass card for the dialog. Ensure focus trap and `aria-modal="true"`, and close on Escape.

---

## Animation Usage

- **Transitions:** Buttons and cards use `transition-colors` or `transition-all duration-200`. Avoid long durations (keep under ~300ms for micro-interactions).
- **Page/content:** The app uses **animate-fade-in-up** (or similar) for route content; defined in Tailwind or index.css.
- **Loading:** Use **.skeleton** or **.glass-shimmer** for loading states; prefer subtle pulse/shimmer over spinners where it fits.
- **Reduced motion:** Respect `prefers-reduced-motion: reduce`: disable or simplify hover transforms and decorative animations (e.g. `.glass-hover` already does this).

**Rule of thumb:** Animations should support clarity and feedback, not distract. One primary motion per interaction (e.g. button press scale, modal fade).

---

## Accessibility Requirements

- **Touch targets:** Minimum **44×44px** for buttons and interactive elements (use `min-h-[var(--touch-min)]` or Button component).
- **Focus:** All interactive elements must be focusable and have a visible focus ring (e.g. `focus:outline-none focus:ring-2` or `focus-visible:`).
- **Labels:** Every form control has an associated label; use `aria-label` for icon-only buttons.
- **Errors:** Use `aria-invalid` and `aria-describedby` for invalid fields; announce errors to screen readers.
- **Live regions:** Toasts use `role="alert"` so they are announced.
- **Heading hierarchy:** Use a single `<h1>` per page; then `<h2>`, `<h3>` in order. Don’t skip levels.
- **Color:** Don’t rely on color alone for status (e.g. sync status uses icon/text plus color).
- **Contrast:** Text and interactive elements meet WCAG AA contrast where possible (slate on white/glass, primary red on white).

---

## Dark Mode Support

Dark mode is supported via a **.dark** class (e.g. on `<html>` or a wrapper). The glassmorphism sheet defines dark overrides:

- **.dark** updates `--glass-bg-primary`, `--glass-border`, `--glass-shadow` for dark backgrounds.
- **.dark .glass-card**, **.dark .glass-primary**, **.dark .glass-secondary** adjust background and border.
- **.dark .glass-hover:hover** uses a darker glow.

Ensure text and icons have sufficient contrast in dark mode (e.g. light text on dark glass). Toggle the `.dark` class from your theme provider or settings (e.g. System Preferences → Admin & logs or a future theme toggle).

---

## File Reference

| File | Purpose |
|------|---------|
| `src/index.css` | Design tokens, base styles, buttons, inputs, badges, tables, nav. |
| `src/styles/glassmorphism.css` | All glass classes and dark mode glass. |
| `src/components/ui/Button.tsx` | Button variants and sizes. |
| `src/components/ui/Modal.tsx` | Modal wrapper (if used). |
| `src/pages/demo/LiquidGlassShowcase.tsx` | Demo of glass and liquid-style UI. |

Using these guidelines keeps the app visually consistent, performant, and accessible across devices and themes.
