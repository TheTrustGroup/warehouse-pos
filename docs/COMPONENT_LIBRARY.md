# Component library

Single source of truth for shared UI. Prefer these over raw HTML + Tailwind classes so behavior and accessibility stay consistent.

**Location:** `src/components/ui/`

---

## When to use what

| Use case | Component | Import |
|----------|-----------|--------|
| Primary action (Submit, Save, Login) | `Button` variant="primary" | `import { Button } from '../components/ui';` |
| Secondary / Cancel | `Button` variant="secondary" | same |
| Icon-only or ghost (delete, edit, close) | `Button` variant="action" or variant="danger" | same |
| Card surface (panels, modals content) | `Card` | same |
| Text / number input, select | `Input`, `Select` | same |
| Modal overlay (dialog) | `Modal` | same |
| Full-page or inline loading | `LoadingSpinner`, `PageLoader` | same |
| Error boundary (route or app) | `RouteErrorBoundary`, `ErrorBoundary` | same |
| Toast message (via ToastContext) | `Toast` (used by context) | — |

---

## Button

Use **Button** instead of `<button className="btn-primary">` (or btn-secondary, btn-action, btn-action-delete).

```tsx
import { Button } from '../components/ui';

<Button variant="primary" type="submit">Save</Button>
<Button variant="secondary" onClick={onCancel}>Cancel</Button>
<Button variant="action" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></Button>
<Button variant="danger" onClick={onDelete} aria-label="Delete"><Trash2 className="w-4 h-4" /></Button>
```

- **Variants:** `primary` | `secondary` | `action` | `actionView` | `actionEdit` | `danger` | `ghost`
- **Props:** All native button props (disabled, type, onClick, etc.) plus `className` for layout (e.g. `w-full`, `inline-flex gap-2`).

---

## Card

Use **Card** instead of `<div className="glass-card ...">` for consistent surface styling.

```tsx
import { Card } from '../components/ui';

<Card padding="default">...</Card>
<Card padding="compact" className="max-w-md">...</Card>
```

- **padding:** `none` | `compact` (p-4) | `default` (p-5) | `loose` (p-6)
- **className:** Optional extra classes.

---

## Input & Select

Use **Input** and **Select** for form fields so label and error are handled in one place.

```tsx
import { Input, Select } from '../components/ui';

<Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
<Input label="Quantity" type="number" error={errors.quantity} className="w-24" />
<Select label="Category" value={cat} onChange={e => setCat(e.target.value)}>
  <option value="">Select...</option>
</Select>
```

- **Input/Select** apply the `input-field` class; pass `className` for width/layout.
- **label** and **error** are optional.

---

## Modal

Use **Modal** for any overlay dialog so scroll lock, Escape, and backdrop click are consistent.

```tsx
import { Modal } from '../components/ui';

<Modal isOpen={isOpen} onClose={onClose} titleId="my-dialog-title" overlayClassName="modal-overlay-padding">
  <Card className="max-w-2xl">...</Card>
</Modal>
```

- **titleId:** Optional; set on the modal and pass the same id to your heading for a11y.

---

## Loading & skeletons

- **LoadingSpinner** – `<LoadingSpinner size="md" />` (sm | md | lg)
- **PageLoader** – Full-screen overlay with spinner and “Loading...”
- **SkeletonCard** – Placeholder card while content loads

---

## Error boundaries

- **ErrorBoundary** – App-level (e.g. in main.tsx). Shows “Something went wrong” + Refresh.
- **RouteErrorBoundary** – Per-route. Shows “Something went wrong in [RouteName]” + Try again + Refresh. Pass **routeName** for the title.

---

## Duplicate / similarly named components

- **SalesChart** exists in two places with different APIs:
  - **Dashboard:** `components/dashboard/SalesChart.tsx` – props: `{ data: { date, sales, revenue }[] }`, LineChart, last 7 days.
  - **Reports:** `components/reports/SalesChart.tsx` – props: `{ report: SalesReport }`, BarChart + PieChart.
  - Use the one that matches your page (Dashboard vs Reports). Do not mix imports; the names are the same but the props and behavior differ.

---

## Other components (feature-specific)

These live outside `ui/` and are used by specific pages:

- **StatCard** – Dashboard stats (title, value, icon, trend). `components/dashboard/StatCard.tsx`
- **SyncRejectionsCard** – Dashboard failed-sync list. `components/dashboard/SyncRejectionsCard.tsx`
- **ProductFormModal** – Inventory add/edit product. `components/inventory/ProductFormModal.tsx`
- **DateRangePicker**, **SalesMetrics**, **InventoryMetrics**, **TopProductsTable** – Reports. `components/reports/*`
- **BusinessProfile**, **SystemPreferences**, **CategoryManagement**, **UserManagement**, **LocalStorageCacheView** – Settings. `components/settings/*`

Use the **ui** primitives (Button, Card, Input, Modal) inside these when adding or refactoring UI.
