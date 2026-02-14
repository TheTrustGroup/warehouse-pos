/**
 * Zod schemas for form input validation and type coercion.
 * Use before submission to ensure required fields, types, and ranges.
 */

import { z } from 'zod';

// ---- Login ----
export const loginFormSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address').transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1, 'Password is required'),
});

export type LoginFormData = z.infer<typeof loginFormSchema>;

/** Validate login form; returns { success, data } or { success: false, errors: Record<field, string> }. */
export function validateLoginForm(email: string, password: string): { success: true; data: LoginFormData } | { success: false; errors: Record<string, string> } {
  const result = loginFormSchema.safeParse({ email: email.trim(), password });
  if (result.success) return { success: true, data: result.data };
  const errors: Record<string, string> = {};
  const fe = result.error.flatten().fieldErrors;
  if (fe?.email?.[0]) errors.email = fe.email[0];
  if (fe?.password?.[0]) errors.password = fe.password[0];
  return { success: false, errors };
}

// ---- Product form (add/edit) ----
const productFormLocationSchema = z.object({
  warehouse: z.string().default('Main Store'),
  aisle: z.string().default(''),
  rack: z.string().default(''),
  bin: z.string().default(''),
});

const productFormSupplierSchema = z.object({
  name: z.string().default(''),
  contact: z.string().default(''),
  email: z.string().max(200).optional().transform((s) => (s && s.trim() ? s : '')).default(''),
});

export const productFormSchema = z
  .object({
    name: z.string().min(1, 'Product name is required').max(500),
    sku: z.string().min(1, 'SKU is required').max(100),
    barcode: z.string().max(100).default(''),
    description: z.string().default(''),
    category: z.string().min(1, 'Category is required').max(200),
    quantity: z.coerce.number().min(0, 'Quantity must be 0 or more').finite(),
    costPrice: z.coerce.number().min(0, 'Cost price must be 0 or more').finite(),
    sellingPrice: z.coerce.number().min(0, 'Selling price must be 0 or more').finite(),
    reorderLevel: z.coerce.number().min(0, 'Reorder level must be 0 or more').finite(),
    location: productFormLocationSchema,
    supplier: productFormSupplierSchema,
    sizeKind: z.enum(['na', 'one_size', 'sized']).default('na'),
    quantityBySize: z.array(z.object({ sizeCode: z.string(), quantity: z.coerce.number().min(0).finite() })).default([]),
  })
  .refine((d) => d.sellingPrice >= 0 && d.costPrice >= 0, { message: 'Prices must be non-negative', path: ['sellingPrice'] });

export type ProductFormDataValidated = z.infer<typeof productFormSchema>;

/** Validate product form payload; returns parsed data or throws with message. */
export function validateProductForm(data: unknown): ProductFormDataValidated {
  const parsed = productFormSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first?.message ?? 'Please check required fields and values.';
    throw new Error(msg);
  }
  return parsed.data;
}

/** Safe parse: returns { success, data } or { success: false, message: string }. */
export function safeValidateProductForm(data: unknown): { success: true; data: ProductFormDataValidated } | { success: false; message: string } {
  const parsed = productFormSchema.safeParse(data);
  if (parsed.success) return { success: true, data: parsed.data };
  const first = parsed.error.issues[0];
  return { success: false, message: (first?.message as string) ?? 'Please check required fields and values.' };
}

// ---- Business profile ----
export const businessProfileSchema = z.object({
  businessName: z.string().min(1, 'Business name is required').max(200),
  address: z.string().min(1, 'Address is required').max(500),
  phone: z.string().min(1, 'Phone is required').max(50),
  email: z.string().min(1, 'Email is required').email('Enter a valid email').max(200),
  taxRate: z.coerce.number().min(0, 'Tax rate must be 0 or more').max(100).finite(),
  currency: z.string().max(10).default('GHS'),
  logo: z.string().optional(),
});

export type BusinessProfileFormData = z.infer<typeof businessProfileSchema>;

export function validateBusinessProfile(data: unknown): BusinessProfileFormData {
  const parsed = businessProfileSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error((first?.message as string) ?? 'Please check required fields.');
  }
  return parsed.data;
}

// ---- System preferences ----
export const systemPreferencesSchema = z.object({
  lowStockThreshold: z.coerce.number().min(0).max(10000).finite(),
  autoBackup: z.boolean(),
  emailNotifications: z.boolean(),
  receiptFooter: z.string().max(500).default(''),
  defaultWarehouse: z.string().max(100).default(''),
});

export type SystemPreferencesFormData = z.infer<typeof systemPreferencesSchema>;

export function validateSystemPreferences(data: unknown): SystemPreferencesFormData {
  const parsed = systemPreferencesSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error((first?.message as string) ?? 'Invalid settings.');
  }
  return parsed.data;
}

// ---- Payment (amounts) ----
export const paymentAmountSchema = z.coerce.number().min(0, 'Amount must be 0 or more').finite();

export function validatePaymentAmount(value: unknown): number {
  const parsed = paymentAmountSchema.safeParse(value);
  if (!parsed.success) throw new Error('Enter a valid amount.');
  return parsed.data;
}
