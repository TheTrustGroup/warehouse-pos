/**
 * UI component library — single source of truth for buttons, cards, inputs, modals, and shared primitives.
 * Prefer these over raw elements with Tailwind/design classes. See docs/COMPONENT_LIBRARY.md.
 */

export { Button } from './Button';
export type { ButtonProps, ButtonVariant } from './Button';
export { Card } from './Card';
export type { CardProps } from './Card';
export { Input, Select } from './Input';
export type { InputProps, SelectProps } from './Input';
export { Modal } from './Modal';
export type { ModalProps } from './Modal';
export { LoadingSpinner, PageLoader, SkeletonCard } from './LoadingSpinner';
export { Toast } from './Toast';
export { ErrorBoundary } from './ErrorBoundary';
export { RouteErrorBoundary } from './RouteErrorBoundary';