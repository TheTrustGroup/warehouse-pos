// ============================================================
// ProductModal.tsx
// File: warehouse-pos/src/components/inventory/ProductModal.tsx
//
// Rules:
// - Single useState for entire form. Initialized ONCE on open.
// - Never re-initializes while open (no polling interference).
// - SizesSection is fully controlled — no size state lives here.
// - Bottom sheet on mobile, centered modal on desktop.
// - Sticky header + footer, scrollable body.
// - Images: file upload (→ base64) + URL fallback, up to 5 images.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import SizesSection, {
  type SizesSectionValue,
  type SizeCode,
  getValidationError,
} from './SizesSection';
import { uploadProductImage, isBase64, safeProductImageUrl } from '../../lib/imageUpload';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Product {
  id?: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  description?: string;
  sellingPrice: number;
  costPrice: number;
  reorderLevel?: number;
  sizeKind: 'na' | 'one_size' | 'sized';
  quantity: number;
  quantityBySize: Array<{ sizeCode: string; quantity: number }>;
  location?: { warehouse?: string; aisle?: string; rack?: string; bin?: string };
  supplier?: { name?: string; contact?: string; email?: string };
  tags?: string[];
  images?: string[];
  warehouseId?: string;
}

interface FormState {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  description: string;
  sellingPrice: number | '';
  costPrice: number | '';
  reorderLevel: number | '';
  sizes: SizesSectionValue;
  location: { aisle: string; rack: string; bin: string };
  supplier: { name: string; contact: string; email: string };
  images: string[];
}

interface ProductModalProps {
  isOpen: boolean;
  product?: Product | null;        // null/undefined = add mode
  sizeCodes?: SizeCode[];
  warehouseId?: string;
  warehouseName?: string;
  onSubmit: (payload: Omit<Product, 'id'> & { id?: string }, isEdit: boolean) => Promise<void>;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function generateSKU(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `SKU-${seg(6)}${seg(2)}-${seg(5)}`;
}

export function buildInitialForm(product?: Product | null): FormState {
  if (product) {
    return {
      name: product.name ?? '',
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      category: product.category ?? '',
      description: product.description ?? '',
      sellingPrice: product.sellingPrice ?? '',
      costPrice: product.costPrice ?? '',
      reorderLevel: product.reorderLevel ?? '',
      sizes: {
        sizeKind: product.sizeKind ?? 'na',
        quantity: product.quantity ?? 0,
        quantityBySize: (product.quantityBySize ?? []).map(r => ({
          sizeCode: r.sizeCode,
          quantity: r.quantity,
        })),
      },
      location: {
        aisle: product.location?.aisle ?? '',
        rack: product.location?.rack ?? '',
        bin: product.location?.bin ?? '',
      },
      supplier: {
        name: product.supplier?.name ?? '',
        contact: product.supplier?.contact ?? '',
        email: product.supplier?.email ?? '',
      },
      images: product.images ?? [],
    };
  }
  return {
    name: '',
    sku: generateSKU(),
    barcode: '',
    category: '',
    description: '',
    sellingPrice: '',
    costPrice: '',
    reorderLevel: '',
    sizes: { sizeKind: 'na', quantity: 0, quantityBySize: [] },
    location: { aisle: '', rack: '', bin: '' },
    supplier: { name: '', contact: '', email: '' },
    images: [],
  };
}

// ── Icons ──────────────────────────────────────────────────────────────────

const IconX = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconChevron = ({ open }: { open: boolean }) => (
  <svg
    width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
  >
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const IconRefresh = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

const IconSpinner = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
    style={{ animation: 'spin 0.8s linear infinite' }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

const IconUpload = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
);

const IconLink = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

// ── Field components ───────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, required, error, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-slate-600 flex items-center gap-1">
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[12px] text-slate-400">{hint}</p>}
      {error && <p className="text-[12px] text-red-500 font-medium">{error}</p>}
    </div>
  );
}

const inputCls = (error?: string) => `
  w-full h-11 px-3.5 rounded-xl border-[1.5px]
  font-sans text-[14px] text-slate-900
  bg-slate-50 outline-none
  placeholder:text-slate-300
  focus:border-red-400 focus:bg-white focus:ring-[3px] focus:ring-red-100
  disabled:opacity-50 disabled:cursor-not-allowed
  transition-all duration-150
  ${error ? 'border-red-400 bg-red-50' : 'border-slate-200'}
`;

const priceCls = `
  w-full h-11 pl-10 pr-3.5 rounded-xl border-[1.5px] border-slate-200
  font-sans text-[14px] font-semibold text-slate-900
  bg-slate-50 outline-none
  placeholder:text-slate-300 placeholder:font-normal
  focus:border-red-400 focus:bg-white focus:ring-[3px] focus:ring-red-100
  transition-all duration-150
  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
  [&::-webkit-inner-spin-button]:appearance-none
`;

// ── Image Upload Section ───────────────────────────────────────────────────

const MAX_IMAGES = 5;
const MAX_FILE_SIZE_MB = 2;

interface ImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
  disabled?: boolean;
}

function ImageUpload({ images, onChange, disabled }: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [uploadError, setUploadError] = useState('');

  const canAdd = images.length < MAX_IMAGES;

  async function handleFiles(files: FileList | null) {
    if (!files || !canAdd) return;
    setUploading(true);
    setUploadError('');
    setUploadProgress(0);
    const newImages = [...images];
    const filesToUpload = Array.from(files).filter(f => f.type.startsWith('image/'));

    for (let i = 0; i < filesToUpload.length; i++) {
      if (newImages.length >= MAX_IMAGES) break;
      const file = filesToUpload[i];

      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setUploadError(`${file.name} exceeds ${MAX_FILE_SIZE_MB}MB limit.`);
        continue;
      }

      try {
        const result = await uploadProductImage(file, (pct) => {
          setUploadProgress(Math.round(((i / filesToUpload.length) + pct / 100 / filesToUpload.length) * 100));
        });
        newImages.push(result.url);
      } catch (storageErr: unknown) {
        const msg = storageErr instanceof Error ? storageErr.message : 'Upload failed';
        console.warn('[ImageUpload] Storage upload failed, using base64 fallback:', msg);
        try {
          const url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          newImages.push(url);
        } catch {
          setUploadError(`Failed to upload ${file.name}.`);
        }
      }
    }

    onChange(newImages);
    setUploading(false);
    setUploadProgress(0);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!disabled) handleFiles(e.dataTransfer.files);
  }

  function handleAddUrl() {
    setUrlError('');
    const url = urlInput.trim();
    if (!url) return;
    if (!/^https?:\/\/.+/.test(url)) {
      setUrlError('Must be a valid URL starting with http:// or https://');
      return;
    }
    if (images.includes(url)) {
      setUrlError('This image is already added');
      return;
    }
    onChange([...images, url]);
    setUrlInput('');
    setShowUrlInput(false);
  }

  function removeImage(idx: number) {
    onChange(images.filter((_, i) => i !== idx));
  }

  function moveImage(from: number, to: number) {
    const arr = [...images];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    onChange(arr);
  }

  return (
    <div className="flex flex-col gap-3">
      {images.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {images.map((src, idx) => (
              <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50">
                <img
                  src={safeProductImageUrl(src)}
                  alt={`Product image ${idx + 1}`}
                  className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).src = ''; }}
                />
                {idx === 0 && (
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-red-500 text-white text-[9px] font-bold uppercase tracking-wide">
                    Primary
                  </span>
                )}
                {isBase64(src) && (
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[8px] font-bold uppercase tracking-wide">
                    local
                  </span>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => moveImage(idx, idx - 1)}
                      className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/40 text-white text-[11px] font-bold flex items-center justify-center transition-colors"
                      title="Move left"
                    >←</button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="w-7 h-7 rounded-lg bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center transition-colors"
                    title="Remove"
                  >
                    <IconX />
                  </button>
                  {idx < images.length - 1 && (
                    <button
                      type="button"
                      onClick={() => moveImage(idx, idx + 1)}
                      className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/40 text-white text-[11px] font-bold flex items-center justify-center transition-colors"
                      title="Move right"
                    >→</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {images.some(isBase64) && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100">
              <span className="text-amber-500 text-[14px] mt-0.5">⚠</span>
              <p className="text-[11px] text-amber-700 font-medium leading-snug">
                Some images are stored locally (marked &quot;local&quot;). Set up Supabase Storage (run MASTER_SQL_V2.sql) for permanent image hosting. Re-upload these images once configured.
              </p>
            </div>
          )}
        </>
      )}

      {canAdd && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-xl
            flex flex-col items-center justify-center gap-2
            py-6 px-4 text-center cursor-pointer
            transition-all duration-150
            ${dragOver
              ? 'border-red-400 bg-red-50'
              : 'border-slate-200 bg-slate-50 hover:border-red-300 hover:bg-red-50/30'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-slate-500 w-full px-4">
              <IconSpinner />
              <span className="text-[13px] font-medium">Uploading…</span>
              {uploadProgress > 0 && (
                <div className="w-full bg-slate-200 rounded-full h-1.5">
                  <div
                    className="bg-red-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="w-10 h-10 rounded-xl bg-slate-200/70 flex items-center justify-center text-slate-400">
                <IconUpload />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-700">
                  {images.length === 0 ? 'Add product photos' : `Add more (${images.length}/${MAX_IMAGES})`}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Drag & drop or tap · JPG, PNG, WebP · Max {MAX_FILE_SIZE_MB}MB each
                </p>
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="sr-only"
            disabled={disabled || uploading}
            onChange={e => handleFiles(e.target.files)}
          />
        </div>
      )}

      {uploadError && (
        <p className="text-[12px] text-red-500 font-medium">{uploadError}</p>
      )}

      {canAdd && (
        <div>
          {!showUrlInput ? (
            <button
              type="button"
              onClick={() => setShowUrlInput(true)}
              className="flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-slate-600 transition-colors"
            >
              <IconLink />
              Add image from URL instead
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={e => { setUrlInput(e.target.value); setUrlError(''); }}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddUrl())}
                placeholder="https://example.com/image.jpg"
                className={`flex-1 h-10 px-3 rounded-xl border-[1.5px] text-[13px] bg-slate-50 outline-none transition-all
                  ${urlError ? 'border-red-400' : 'border-slate-200'}
                  focus:border-red-400 focus:bg-white focus:ring-[3px] focus:ring-red-100`}
              />
              <button
                type="button"
                onClick={handleAddUrl}
                className="h-10 px-4 rounded-xl bg-red-500 text-white text-[13px] font-bold hover:bg-red-600 transition-colors whitespace-nowrap"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => { setShowUrlInput(false); setUrlInput(''); setUrlError(''); }}
                className="h-10 px-3 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors text-[13px]"
              >
                Cancel
              </button>
            </div>
          )}
          {urlError && <p className="text-[12px] text-red-500 font-medium mt-1">{urlError}</p>}
        </div>
      )}

      {images.length > 1 && (
        <p className="text-[11px] text-slate-400">
          Tap and hold images to reorder · First image is the primary photo shown in POS
        </p>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function ProductModal({
  isOpen,
  product,
  sizeCodes = [],
  warehouseId: defaultWarehouseId,
  warehouseName,
  onSubmit,
  onClose,
}: ProductModalProps) {

  const isEdit = !!product?.id;

  // ── Form state — initialized ONCE on open ──────────────────────────────
  const [form, setForm] = useState<FormState>(() => buildInitialForm(product));
  const [attempted, setAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const hasInitialized = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize ONCE when modal opens — never again while open
  useEffect(() => {
    if (!isOpen) {
      hasInitialized.current = false;
      setAttempted(false);
      setErrors({});
      setDetailsOpen(false);
      return;
    }
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    setForm(buildInitialForm(product));
    setAttempted(false);
    setErrors({});
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trap body scroll on mobile when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, isSubmitting, onClose]);

  // ── Field updaters ─────────────────────────────────────────────────────

  const set = useCallback(<K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }));
  }, [errors]);

  const setNested = useCallback(<
    K extends 'location' | 'supplier',
    F extends keyof FormState[K]
  >(section: K, field: F, val: FormState[K][F]) => {
    setForm(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: val },
    }));
  }, []);

  // ── Validation ─────────────────────────────────────────────────────────

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) e.name = 'Product name is required.';
    if (!form.category.trim()) e.category = 'Category is required.';
    if (form.sellingPrice === '' || Number(form.sellingPrice) < 0)
      e.sellingPrice = 'Enter a valid selling price.';
    const sizeError = getValidationError(form.sizes);
    if (sizeError) (e as Partial<Record<keyof FormState, string>>).sizes = sizeError;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Submit ─────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (!validate()) {
      // Scroll to first error
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Omit<Product, 'id'> & { id?: string } = {
        ...(product?.id ? { id: product.id } : {}),
        name: form.name.trim(),
        sku: form.sku.trim(),
        barcode: form.barcode.trim(),
        category: form.category.trim(),
        description: form.description.trim(),
        sellingPrice: Number(form.sellingPrice) || 0,
        costPrice: Number(form.costPrice) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
        sizeKind: form.sizes.sizeKind,
        quantity: form.sizes.quantity,
        quantityBySize: form.sizes.quantityBySize,
        location: form.location,
        supplier: form.supplier,
        images: form.images,
        warehouseId: defaultWarehouseId,
      };
      await onSubmit(payload, isEdit);
      onClose();
    } catch {
      // Parent shows toast — keep modal open
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────

  const margin =
    form.sellingPrice !== '' && form.costPrice !== ''
      ? Number(form.sellingPrice) - Number(form.costPrice)
      : null;

  const marginPct =
    margin !== null && Number(form.sellingPrice) > 0
      ? ((margin / Number(form.sellingPrice)) * 100).toFixed(1)
      : null;

  // ── Render ─────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40 transition-opacity duration-200"
        onClick={() => !isSubmitting && onClose()}
      />

      {/* Modal — bottom sheet on mobile, centered on desktop */}
      <div
        className="
          fixed z-50
          bottom-0 left-0 right-0
          sm:bottom-auto sm:left-1/2 sm:top-1/2
          sm:-translate-x-1/2 sm:-translate-y-1/2
          sm:max-w-[580px] sm:w-full
          bg-white
          rounded-t-[24px] sm:rounded-[20px]
          shadow-2xl
          flex flex-col
          max-h-[92vh] sm:max-h-[88vh]
          transition-transform duration-300
        "
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle (mobile only) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            {form.images.length > 0 && (
              <div className="w-9 h-9 rounded-xl overflow-hidden border border-slate-200 flex-shrink-0">
                <img src={safeProductImageUrl(form.images[0])} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div>
              <h2 className="text-[17px] font-bold text-slate-900 leading-tight">
                {isEdit ? form.name || 'Edit product' : 'New product'}
              </h2>
            {isEdit && product?.sku && (
              <p className="text-[12px] font-mono text-slate-400 mt-0.5">{product.sku}</p>
            )}
            {!isEdit && warehouseName && (
              <p className="text-[12px] text-slate-500 mt-0.5" aria-live="polite">
                Adding to: <span className="font-medium text-slate-700">{warehouseName}</span>
              </p>
            )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="
              w-9 h-9 rounded-xl border border-slate-200 bg-slate-50
              text-slate-500 flex items-center justify-center
              hover:bg-slate-100 hover:text-slate-700
              disabled:opacity-40
              transition-all duration-150
            "
            aria-label="Close"
          >
            <IconX />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 flex flex-col gap-6"
        >
          <form id="product-form" onSubmit={handleSubmit} noValidate>

            {/* ── Section: Product Images ── */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">
                  Product Photos
                </p>
                <span className="text-[11px] text-slate-400 font-medium">
                  {form.images.length > 0 ? `${form.images.length}/${MAX_IMAGES} added` : 'Optional · shows in POS'}
                </span>
              </div>
              <ImageUpload
                images={form.images}
                onChange={imgs => set('images', imgs)}
                disabled={isSubmitting}
              />
            </div>

            {/* ── Divider ── */}
            <div className="h-px bg-slate-100 my-2" />

            {/* ── Section: Basic Info ── */}
            <div className="flex flex-col gap-4">
              <p className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">
                Basic info
              </p>

              {/* Name */}
              <Field label="Product name" required error={errors.name}>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Air Force 1 Black"
                  className={inputCls(errors.name)}
                  autoFocus={!isEdit}
                />
              </Field>

              {/* Category */}
              <Field label="Category" required error={errors.category}>
                <input
                  type="text"
                  list="category-datalist"
                  value={form.category}
                  onChange={e => set('category', e.target.value)}
                  placeholder="e.g. Sneakers"
                  className={inputCls(errors.category)}
                />
                <datalist id="category-datalist">
                  {['Sneakers','Slippers','Boots','Sandals','Accessories'].map(c => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>

              {/* SKU */}
              <Field label="SKU" hint="Auto-generated. Tap to edit.">
                <div className="relative">
                  <input
                    type="text"
                    value={form.sku}
                    onChange={e => set('sku', e.target.value)}
                    className={`${inputCls()} font-mono text-[13px] pr-24`}
                  />
                  <button
                    type="button"
                    onClick={() => set('sku', generateSKU())}
                    className="
                      absolute right-2 top-1/2 -translate-y-1/2
                      h-7 px-2.5 rounded-lg
                      text-[11px] font-semibold text-slate-500
                      bg-slate-100 hover:bg-slate-200
                      flex items-center gap-1
                      transition-colors duration-150
                    "
                  >
                    <IconRefresh /> Regenerate
                  </button>
                </div>
              </Field>

              {/* Barcode */}
              <Field label="Barcode" hint="Optional">
                <input
                  type="text"
                  value={form.barcode}
                  onChange={e => set('barcode', e.target.value)}
                  placeholder="Scan or type barcode"
                  className={inputCls()}
                />
              </Field>

              {/* Description */}
              <Field label="Description" hint="Optional">
                <textarea
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  placeholder="Brief product description…"
                  rows={3}
                  className="
                    w-full px-3.5 py-3 rounded-xl border-[1.5px] border-slate-200
                    font-sans text-[14px] text-slate-900 bg-slate-50
                    placeholder:text-slate-300 outline-none resize-none
                    focus:border-red-400 focus:bg-white focus:ring-[3px] focus:ring-red-100
                    transition-all duration-150
                  "
                />
              </Field>
            </div>

            {/* ── Divider ── */}
            <div className="h-px bg-slate-100 my-2" />

            {/* ── Section: Pricing ── */}
            <div className="flex flex-col gap-4">
              <p className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">
                Pricing
              </p>

              <div className="grid grid-cols-2 gap-3">
                {/* Selling price */}
                <Field label="Selling price" required error={errors.sellingPrice}>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-slate-400 pointer-events-none">
                      GH₵
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.sellingPrice}
                      onChange={e => set('sellingPrice', e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0.00"
                      className={priceCls}
                    />
                  </div>
                </Field>

                {/* Cost price */}
                <Field label="Cost price">
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-slate-400 pointer-events-none">
                      GH₵
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.costPrice}
                      onChange={e => set('costPrice', e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0.00"
                      className={priceCls}
                    />
                  </div>
                </Field>
              </div>

              {/* Margin display */}
              {margin !== null && (
                <div className={`
                  flex items-center justify-between px-3.5 py-2.5 rounded-xl
                  text-[13px] font-semibold
                  ${margin >= 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-600'
                  }
                `}>
                  <span>Profit margin</span>
                  <span>GH₵{margin.toFixed(2)} {marginPct !== null && `(${marginPct}%)`}</span>
                </div>
              )}

              {/* Reorder level */}
              <Field label="Reorder level" hint="Alert when stock falls below this number">
                <input
                  type="number"
                  min={0}
                  value={form.reorderLevel}
                  onChange={e => set('reorderLevel', e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className={inputCls()}
                />
              </Field>
            </div>

            {/* ── Divider ── */}
            <div className="h-px bg-slate-100 my-2" />

            {/* ── Section: Stock & Sizes ── */}
            {errors.sizes && (
              <div className="px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-100 text-[13px] font-medium text-red-600 mb-2">
                {errors.sizes}
              </div>
            )}
            <SizesSection
              value={form.sizes}
              sizeCodes={sizeCodes}
              onChange={sizes => set('sizes', sizes)}
              showValidation={attempted}
            />

            {/* ── Divider ── */}
            <div className="h-px bg-slate-100 my-2" />

            {/* ── Section: Details (collapsible) ── */}
            <div>
              <button
                type="button"
                onClick={() => setDetailsOpen(o => !o)}
                className="
                  w-full flex items-center justify-between
                  text-[13px] font-semibold text-slate-500 uppercase tracking-wide
                  py-1
                "
              >
                <span>Location &amp; Supplier</span>
                <IconChevron open={detailsOpen} />
              </button>

              {detailsOpen && (
                <div className="flex flex-col gap-4 mt-4">
                  <div className="grid grid-cols-3 gap-2">
                    {(['aisle', 'rack', 'bin'] as const).map(f => (
                      <Field key={f} label={f.charAt(0).toUpperCase() + f.slice(1)}>
                        <input
                          type="text"
                          value={form.location[f]}
                          onChange={e => setNested('location', f, e.target.value)}
                          placeholder={f}
                          className={inputCls()}
                        />
                      </Field>
                    ))}
                  </div>

                  <Field label="Supplier name">
                    <input
                      type="text"
                      value={form.supplier.name}
                      onChange={e => setNested('supplier', 'name', e.target.value)}
                      placeholder="Supplier name"
                      className={inputCls()}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Contact">
                      <input
                        type="text"
                        value={form.supplier.contact}
                        onChange={e => setNested('supplier', 'contact', e.target.value)}
                        placeholder="Phone"
                        className={inputCls()}
                      />
                    </Field>
                    <Field label="Email">
                      <input
                        type="email"
                        value={form.supplier.email}
                        onChange={e => setNested('supplier', 'email', e.target.value)}
                        placeholder="Email"
                        className={inputCls()}
                      />
                    </Field>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom padding for sticky footer */}
            <div className="h-4" />
          </form>
        </div>

        {/* ── Sticky footer ── */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-slate-100 bg-white rounded-b-[20px] flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="
              flex-1 h-12 rounded-xl border-[1.5px] border-slate-200
              font-sans text-[14px] font-semibold text-slate-500
              bg-white hover:bg-slate-50
              disabled:opacity-40
              transition-all duration-150
            "
          >
            Cancel
          </button>
          <button
            type="submit"
            form="product-form"
            disabled={isSubmitting}
            className="
              flex-[2] h-12 rounded-xl border-none
              bg-red-500 hover:bg-red-600
              font-sans text-[14px] font-semibold text-white
              flex items-center justify-center gap-2
              disabled:opacity-60 disabled:cursor-not-allowed
              active:scale-[0.98]
              transition-all duration-150
            "
          >
            {isSubmitting ? (
              <>
                <IconSpinner />
                {isEdit ? 'Saving…' : 'Adding…'}
              </>
            ) : (
              isEdit ? 'Save changes' : 'Add product'
            )}
          </button>
        </div>

      </div>

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
