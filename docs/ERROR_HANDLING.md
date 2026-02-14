# Error Handling

The app uses a consistent error-handling flow: React Error Boundaries for render errors, try/catch with user-friendly toasts for async operations, central reporting for logging and external services, and Retry where it makes sense.

## 1. React Error Boundaries

- **Root**: The whole app is wrapped in `<ErrorBoundary>` in `main.tsx`. If an uncaught render error occurs, it shows a full-screen message with the user-friendly description and a "Refresh page" button.
- **Per-route**: Each major route is wrapped in `<RouteErrorBoundary routeName="...">`. A failure in one route (e.g. Inventory) shows a card with "Something went wrong in Inventory", a short explanation, **Try again** (resets the boundary and re-renders the route), and **Refresh page**.

Both boundaries call `reportError(error, context)` so errors are logged in development and sent to the configured reporting service (e.g. Sentry).

## 2. Try-catch and async operations

- Async work (API calls, save/delete, login, etc.) should be in try/catch (or .catch()).
- On catch:
  - Show a toast with a **user-friendly message** (use `getUserFriendlyMessage(error)` from `src/lib/errorMessages.ts`).
  - Optionally call `reportError(error, { context: '...' })` when you want the error tracked (e.g. critical flows).
- Prefer the **useErrorHandler** hook for UI that has access to ToastContext: it reports, logs in dev, and shows an error toast in one call.

## 3. User-friendly messages

- **`getUserFriendlyMessage(error)`** in `src/lib/errorMessages.ts` maps common errors to short, actionable text:
  - Network: "Connection problem. Check your network and try again."
  - Timeout: "Request took too long. Check your connection and try again."
  - 401: "Session expired. Please sign in again."
  - 403: "You don't have permission to do that."
  - 404: "The requested item was not found."
  - 409: "This was changed elsewhere. Please refresh and try again."
  - 5xx: "Server error. Please try again in a moment."
  - And others; add new mappings as needed.
- Use this for toasts and for the text shown in Error Boundary fallbacks (as we do in `ErrorBoundary` and `RouteErrorBoundary`).

## 4. Logging in development

- **`reportError(error, context)`** (from `src/lib/errorReporting.ts`):
  - In development: logs to console (`console.error('[Error]', err, context)`).
  - Always forwards to the observability layer, which may send to an external service when configured.
- Use **`logErrorForDev(error, context)`** when you already show a toast and only want a dev-only log (no external report).

## 5. Error reporting service integration

- **Observability** (`src/lib/observability.ts`) is initialized in `main.tsx` with an optional `reportError` callback.
- To plug in **Sentry** (or similar):
  1. Set `VITE_SENTRY_DSN` in env.
  2. Install `@sentry/react` and init Sentry in `main.tsx`.
  3. In `initObservability({ reportError: (err, ctx) => Sentry.captureException(err, { extra: ctx }) })`.
- All calls to `reportError` from Error Boundaries, CriticalDataContext, InventoryContext, OrderContext, and any explicit `reportError` in catch blocks will then be sent to Sentry (or the service you wire).

## 6. Retry

- **RouteErrorBoundary**: "Try again" clears the boundary state and re-renders the route (no full reload).
- **Critical data load**: On initial load failure, the Layout banner shows the error and a "Retry" button that triggers `reloadCriticalData()`.
- **Lazy chunks**: `lazyWithRetry` retries failed chunk loads a few times before failing.
- **API client**: `apiRequest` in `apiClient.ts` already retries with backoff for retryable methods/statuses.
- For other flows (e.g. "Sync failed"): show a toast with the friendly message and a **Retry** button in the UI that re-runs the same action (e.g. sync again).

## 7. Where things are used

- **ErrorBoundary / RouteErrorBoundary**: `reportError` + `getUserFriendlyMessage` for fallback UI.
- **Login**: `getUserFriendlyMessage` for login error toasts (with special case for server unreachable + offline option).
- **POS**: `getUserFriendlyMessage` when sale completion fails.
- **Inventory**: `getUserFriendlyMessage` for delete and bulk-delete toasts; context still uses `reportError` for persistence/verify failures.
- **UserManagement**: `getUserFriendlyMessage` for save and POS access toasts.
- **CriticalDataContext**: `getUserFriendlyMessage` for the banner message and `reportError` for tracking.

Adding new features: wrap async work in try/catch, show `getUserFriendlyMessage(error)` in toasts, and call `reportError` (or use `useErrorHandler`) when you want the error tracked and logged in dev.
