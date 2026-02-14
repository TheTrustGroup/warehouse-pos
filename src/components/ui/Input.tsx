/**
 * Single source of truth for form inputs. Applies input-field class and optional label/error.
 * Labels are always visible when provided; validation errors are inline and reserve space (no overlap).
 */
import { InputHTMLAttributes, SelectHTMLAttributes, ReactNode, forwardRef } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label?: ReactNode;
  error?: string;
  /** Extra class names (e.g. w-full, pl-10). */
  className?: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  label?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}

const fieldClass = 'input-field';

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className = '', ...props },
  ref
) {
  const combined = [fieldClass, className].filter(Boolean).join(' ');
  const wrapperClass = error ? 'block mb-2' : 'block';
  return (
    <label className={wrapperClass}>
      {label != null && label !== '' && <span className="block text-sm font-medium text-slate-600 mb-1.5">{label}</span>}
      <input ref={ref} className={combined} aria-invalid={!!error} {...props} />
      {error && <span className="block text-sm text-red-600 mt-1 mb-1" role="alert">{error}</span>}
    </label>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, className = '', children, ...props },
  ref
) {
  const combined = [fieldClass, className].filter(Boolean).join(' ');
  const wrapperClass = error ? 'block mb-2' : 'block';
  return (
    <label className={wrapperClass}>
      {label != null && label !== '' && <span className="block text-sm font-medium text-slate-600 mb-1.5">{label}</span>}
      <div className="input-select-wrapper">
        <select ref={ref} className={combined} aria-invalid={!!error} {...props}>
          {children}
        </select>
      </div>
      {error && <span className="block text-sm text-red-600 mt-1 mb-1" role="alert">{error}</span>}
    </label>
  );
});
