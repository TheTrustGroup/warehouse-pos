import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { Product, type QuantityBySizeItem } from '../../types';
import { generateSKU, getCategoryDisplay } from '../../lib/utils';
import { safeValidateProductForm } from '../../lib/validationSchemas';
import { useWarehouse } from '../../contexts/WarehouseContext';
import { useInventory } from '../../contexts/InventoryContext';
import { useToast } from '../../contexts/ToastContext';
import { useNetworkStatusContext } from '../../contexts/NetworkStatusContext';
import { API_BASE_URL } from '../../lib/api';
import { apiGet } from '../../lib/apiClient';
import { compressImage, MAX_IMAGE_BASE64_LENGTH } from '../../lib/imageUtils';
import { setProductImages } from '../../lib/productImagesStore';
import { Button } from '../ui/Button';
import { X, Upload, Plus, Trash2, CloudOff } from 'lucide-react';

const MAX_PRODUCT_IMAGES = 5;

export type SizeKind = 'na' | 'one_size' | 'sized';

interface SizeCodeOption {
  size_code: string;
  size_label: string;
  size_order: number;
}

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When editing, pass editingProductId so the parent always updates that product (never creates a duplicate). */
  onSubmit: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { warehouseId?: string }, editingProductId?: string | null) => void | Promise<void>;
  product?: Product | null;
  /** Phase 5: when true, form is read-only (last saved data). Submit disabled. */
  readOnlyMode?: boolean;
}

export function ProductFormModal({ isOpen, onClose, onSubmit, product, readOnlyMode = false }: ProductFormModalProps) {
  const { warehouses, currentWarehouseId } = useWarehouse();
  const { savePhase } = useInventory();
  const { showToast } = useToast();
  const { isOnline } = useNetworkStatusContext();
  const [formData, setFormData] = useState({
    sku: '',
    barcode: '',
    name: '',
    description: '',
    category: '',
    tags: [] as string[],
    quantity: 0,
    costPrice: 0,
    sellingPrice: 0,
    reorderLevel: 0,
    warehouseId: '' as string,
    location: {
      warehouse: 'Main Store',
      aisle: '',
      rack: '',
      bin: '',
    },
    supplier: {
      name: '',
      contact: '',
      email: '',
    },
    images: [] as string[],
    expiryDate: null as Date | null,
    variants: {} as { size?: string; color?: string; unit?: string },
    createdBy: 'admin',
    sizeKind: 'na' as SizeKind,
    quantityBySize: [] as { sizeCode: string; quantity: number }[],
  });

  const [tagInput, setTagInput] = useState('');
  const [imagePreview, setImagePreview] = useState<string[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sizeCodes, setSizeCodes] = useState<SizeCodeOption[]>([]);
  const [sizeCodesLoading, setSizeCodesLoading] = useState(false);
  const wasOpenRef = useRef(false);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  /** Current image count so handleImageUpload always sees latest (avoids stale closure). */
  const imagesLengthRef = useRef(0);
  /** Latest images at submit time (avoids stale formData.images when load runs right after add). */
  const formDataImagesRef = useRef<string[]>([]);
  /** When true, init effect must not overwrite imagePreview/formData.images (user just added image). */
  const imageUploadingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    imagesLengthRef.current = formData.images.length;
  }, [formData.images.length]);
  useEffect(() => {
    formDataImagesRef.current = formData.images;
  }, [formData.images]);
  /** Only focus first field when modal first opens; avoid re-running on every render (unstable onClose) so typing doesn't lose focus / dismiss keyboard. */
  const didInitialFocusRef = useRef(false);
  /** Track last focused form field so we can restore focus when mobile browser or re-render steals it. */
  const lastFocusedInModalRef = useRef<HTMLElement | null>(null);
  /** Refs for uncontrolled text fields so we don't re-render on keystroke (keeps mobile keyboard open). */
  const nameRef = useRef<HTMLInputElement>(null);
  const skuRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  /** Initial values for uncontrolled inputs; stable when modal is open so no remount. */
  const initialTextValues = useMemo(() => {
    if (!isOpen) return null;
    if (product) {
      return {
        name: product.name,
        sku: product.sku,
        barcode: product.barcode ?? '',
        category: getCategoryDisplay(product.category),
        description: product.description ?? '',
      };
    }
    return {
      name: '',
      sku: generateSKU(),
      barcode: '',
      category: '',
      description: '',
    };
  }, [isOpen, product]);

  // Only sync form when the modal *first* opens (isOpen: false -> true). Do not overwrite image state if user just added an image (imageUploadingRef).
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      imageUploadingRef.current = false;
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    if (!justOpened) return;

    const currentProduct = product;
    const warehouseId = currentWarehouseId;
    const skipImageOverwrite = imageUploadingRef.current;

    if (currentProduct) {
      const qtyBySize = (currentProduct.quantityBySize ?? []).map((q: QuantityBySizeItem) => ({ sizeCode: q.sizeCode, quantity: q.quantity }));
      const validImages = Array.isArray(currentProduct.images)
        ? currentProduct.images.filter(
            (img): img is string =>
              typeof img === 'string' &&
              img.length > 0 &&
              (img.startsWith('data:') || img.startsWith('http://') || img.startsWith('https://'))
          )
        : [];
      setFormData((prev) => ({
        sku: currentProduct.sku,
        barcode: currentProduct.barcode,
        name: currentProduct.name,
        description: currentProduct.description,
        category: getCategoryDisplay(currentProduct.category),
        tags: currentProduct.tags,
        quantity: currentProduct.quantity,
        costPrice: currentProduct.costPrice,
        sellingPrice: currentProduct.sellingPrice,
        reorderLevel: currentProduct.reorderLevel,
        warehouseId: (currentProduct as any).warehouseId ?? warehouseId,
        location: currentProduct.location && typeof currentProduct.location === 'object'
          ? { warehouse: (currentProduct.location as any).warehouse ?? 'Main Store', aisle: (currentProduct.location as any).aisle ?? '', rack: (currentProduct.location as any).rack ?? '', bin: (currentProduct.location as any).bin ?? '' }
          : { warehouse: 'Main Store', aisle: '', rack: '', bin: '' },
        supplier: currentProduct.supplier && typeof currentProduct.supplier === 'object'
          ? { name: (currentProduct.supplier as any).name ?? '', contact: (currentProduct.supplier as any).contact ?? '', email: (currentProduct.supplier as any).email ?? '' }
          : { name: '', contact: '', email: '' },
        images: skipImageOverwrite ? prev.images : validImages,
        expiryDate: currentProduct.expiryDate,
        variants: currentProduct.variants || {},
        createdBy: currentProduct.createdBy,
        sizeKind: (currentProduct.sizeKind ?? 'na') as SizeKind,
        quantityBySize: qtyBySize.length > 0 ? qtyBySize : [],
      }));
      if (!skipImageOverwrite) {
        setImagePreview(validImages);
        formDataImagesRef.current = validImages;
        imagesLengthRef.current = validImages.length;
      }
    } else {
      setFormData((prev) => ({
        sku: generateSKU(),
        barcode: '',
        name: '',
        description: '',
        category: '',
        tags: [],
        quantity: 0,
        costPrice: 0,
        sellingPrice: 0,
        reorderLevel: 0,
        warehouseId,
        location: { warehouse: 'Main Store', aisle: '', rack: '', bin: '' },
        supplier: { name: '', contact: '', email: '' },
        images: skipImageOverwrite ? prev.images : [],
        expiryDate: null,
        variants: {},
        createdBy: 'admin',
        sizeKind: 'na',
        quantityBySize: [],
      }));
      if (!skipImageOverwrite) {
        setImagePreview([]);
        formDataImagesRef.current = [];
        imagesLengthRef.current = 0;
      }
    }
    // Intentionally only isOpen: re-run only when modal opens, not when product/warehouse refs change while open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isOnline) return;
    setSizeCodesLoading(true);
    apiGet<{ data: SizeCodeOption[] }>(API_BASE_URL, '/api/size-codes')
      .then((res) => setSizeCodes(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setSizeCodes([]))
      .finally(() => setSizeCodesLoading(false));
  }, [isOpen, isOnline]);

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const processSelectedFiles = useCallback(
    async (fileArray: File[]) => {
      if (fileArray.length === 0) {
        showToast('warning', 'No image received. Try selecting again or use Camera.');
        return;
      }
      const currentLen = imagesLengthRef.current;
      const toAdd = Math.min(MAX_PRODUCT_IMAGES - currentLen, fileArray.length);
      if (toAdd <= 0) {
        if (currentLen >= MAX_PRODUCT_IMAGES) {
          showToast('warning', `Maximum ${MAX_PRODUCT_IMAGES} images. Remove one to add more.`);
        }
        return;
      }

      const filesToProcess = fileArray.slice(0, toAdd).filter((file) => {
        const isImage = !file.type || file.type.startsWith('image/');
        if (!isImage) {
          showToast('error', `Skipped non-image: ${file.name}`);
          return false;
        }
        return true;
      });
      if (filesToProcess.length === 0) return;

      imageUploadingRef.current = true;
      setImageUploading(true);

      const objectUrls: string[] = [];
      for (let i = 0; i < filesToProcess.length; i++) {
        objectUrls.push(URL.createObjectURL(filesToProcess[i]));
      }
      const newPreviewCount = objectUrls.length;
      setImagePreview((prev) => [...prev, ...objectUrls].slice(0, MAX_PRODUCT_IMAGES));
      imagesLengthRef.current = Math.min(imagesLengthRef.current + newPreviewCount, MAX_PRODUCT_IMAGES);

      try {
        const newDataUrls: string[] = [];
        for (let i = 0; i < filesToProcess.length; i++) {
          const file = filesToProcess[i];
          let dataUrl: string;
          try {
            dataUrl = await readFileAsDataUrl(file);
            if (!dataUrl || typeof dataUrl !== 'string') throw new Error('Empty result');
          } catch {
            showToast('error', `Could not read image: ${file.name}`);
            continue;
          }
          if (!product) {
            try {
              const compressed = await compressImage(file, MAX_IMAGE_BASE64_LENGTH);
              if (compressed && compressed.length <= MAX_IMAGE_BASE64_LENGTH) {
                dataUrl = compressed;
              }
            } catch {
              // Keep uncompressed dataUrl so preview and save still work
            }
          }
          newDataUrls.push(dataUrl);
        }

        if (newDataUrls.length === 0) {
          setImagePreview((prev) => prev.slice(0, -newPreviewCount));
          imagesLengthRef.current = Math.max(0, imagesLengthRef.current - newPreviewCount);
          return;
        }

        setImagePreview((prev) => {
          const withoutNew = prev.slice(0, prev.length - newPreviewCount);
          return [...withoutNew, ...newDataUrls].slice(0, MAX_PRODUCT_IMAGES);
        });
        const combined = [...formDataImagesRef.current, ...newDataUrls].slice(0, MAX_PRODUCT_IMAGES);
        formDataImagesRef.current = combined;
        setFormData((prev) => ({ ...prev, images: combined }));
        imagesLengthRef.current = combined.length;
      } finally {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        imageUploadingRef.current = false;
        setImageUploading(false);
      }
    },
    [showToast, product]
  );

  const processFilesRef = useRef(processSelectedFiles);
  processFilesRef.current = processSelectedFiles;

  // Native change listener so Safari/iOS reliably gets the event and we copy FileList before it can be cleared
  useEffect(() => {
    if (!isOpen) return;
    let cleanup: (() => void) | undefined;
    const handler = (e: Event) => {
      const el = e.target as HTMLInputElement;
      const fileArray = el.files ? Array.from(el.files) : [];
      el.value = '';
      processFilesRef.current(fileArray);
    };
    const attach = () => {
      const input = fileInputRef.current;
      if (!input) return false;
      input.addEventListener('change', handler);
      cleanup = () => input.removeEventListener('change', handler);
      return true;
    };
    if (!attach()) {
      const t = setTimeout(() => {
        attach();
      }, 50);
      return () => {
        clearTimeout(t);
        cleanup?.();
      };
    }
    return () => cleanup?.();
  }, [isOpen]);

  const removeImage = (index: number) => {
    const next = formData.images.filter((_, i) => i !== index);
    formDataImagesRef.current = next;
    setFormData(prev => ({ ...prev, images: next }));
    setImagePreview(prev => prev.filter((_, i) => i !== index));
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({ ...prev, tags: [...prev.tags, tagInput.trim()] }));
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (import.meta.env?.DEV) console.time('ProductForm Submit (total)');
    const validSizeRows = (formData.quantityBySize ?? []).filter((r) => (r.sizeCode ?? '').trim() !== '');
    if (formData.sizeKind === 'sized' && validSizeRows.length === 0) {
      showToast('error', 'Add at least one size row to save.');
      return;
    }
    const name = nameRef.current?.value ?? formData.name;
    const sku = skuRef.current?.value ?? formData.sku;
    const barcode = barcodeRef.current?.value ?? formData.barcode;
    const category = categoryRef.current?.value ?? formData.category;
    const description = descriptionRef.current?.value ?? formData.description;
    const toValidate = {
      name,
      sku,
      barcode,
      description,
      category,
      quantity: formData.sizeKind === 'sized' ? validSizeRows.reduce((s, r) => s + (r.quantity || 0), 0) : formData.quantity,
      costPrice: formData.costPrice,
      sellingPrice: formData.sellingPrice,
      reorderLevel: formData.reorderLevel,
      location: formData.location,
      supplier: formData.supplier,
      sizeKind: formData.sizeKind,
      quantityBySize: formData.sizeKind === 'sized' ? validSizeRows : formData.quantityBySize,
    };
    const validated = safeValidateProductForm(toValidate);
    if (!validated.success) {
      showToast('error', validated.message);
      return;
    }
    const effectiveWarehouseId = (formData.warehouseId?.trim() || currentWarehouseId?.trim() || '').trim() || undefined;
    if (warehouses.length > 0 && !effectiveWarehouseId) {
      showToast('error', 'Please select a warehouse.');
      return;
    }
    setIsSubmitting(true);
    try {
      const quantity =
        formData.sizeKind === 'sized' && validSizeRows.length > 0
          ? validSizeRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
          : Number(formData.quantity) || 0;
      const imagesToSubmit = formDataImagesRef.current?.length ? formDataImagesRef.current : formData.images;
      const payloadImages = Array.isArray(imagesToSubmit) ? imagesToSubmit : [];
      const payload = {
        ...formData,
        name,
        sku,
        barcode,
        category,
        description,
        quantity,
        quantityBySize: formData.sizeKind === 'sized' ? validSizeRows : formData.quantityBySize,
        images: payloadImages,
        ...(effectiveWarehouseId && { warehouseId: effectiveWarehouseId }),
      };
      // Persist images to client store before async submit so list shows them even if API/state path fails or is delayed
      if (product?.id && payloadImages.length > 0) {
        setProductImages(product.id, payloadImages);
      }
      await Promise.resolve(onSubmit(payload, product?.id ?? null));
      onClose();
    } catch {
      // Parent shows toast; keep modal open
    } finally {
      setIsSubmitting(false);
      if (import.meta.env?.DEV) console.timeEnd('ProductForm Submit (total)');
    }
  };

  useEffect(() => {
    if (!isOpen) {
      didInitialFocusRef.current = false;
      lastFocusedInModalRef.current = null;
      return;
    }
    const lock = () => document.body.classList.add('scroll-lock');
    const unlock = () => document.body.classList.remove('scroll-lock');
    // Skip scroll-lock on touch devices: body overflow:hidden + touch-action:none can make the keyboard dismiss or misbehave on mobile.
    const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;
    if (!isTouch) lock();
    previousActiveRef.current = document.activeElement as HTMLElement | null;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !modalContentRef.current) return;
      const root = modalContentRef.current;
      const focusable = root.querySelectorAll<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      const list = Array.from(focusable).filter((el) => el.tabIndex >= 0 || el === document.activeElement || /^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(el.tagName));
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    // Only focus first field when modal first opens; avoid re-running when effect re-runs (e.g. unstable onClose) so typing doesn't steal focus / dismiss keyboard.
    let rafId = 0;
    if (!didInitialFocusRef.current) {
      rafId = requestAnimationFrame(() => {
        didInitialFocusRef.current = true;
        const root = modalContentRef.current;
        if (!root) return;
        const focusable = root.querySelectorAll<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        );
        const first = Array.from(focusable).find((el) => el.tabIndex >= 0 || /^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(el.tagName));
        if (first) first.focus();
      });
    }
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      if (!isTouch) unlock();
      const prev = previousActiveRef.current;
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        prev.focus();
      }
    };
  }, [isOpen, onClose]);

  // Restore focus when mobile browser or React re-render steals it (controlled input DOM update can blur on iOS).
  useLayoutEffect(() => {
    if (!isOpen || !modalContentRef.current) return;
    const modal = modalContentRef.current;
    const active = document.activeElement as HTMLElement | null;
    const last = lastFocusedInModalRef.current;
    if (!last || !document.contains(last)) return;
    if (active && modal.contains(active)) return;
    last.focus();
  }, [isOpen, formData]);

  if (!isOpen) return null;

  /* Modal: opaque panel so form is readable (no background bleed-through). Backdrop click + Escape close. Scroll lock when open. */
  return (
    <div
      className="fixed inset-0 solid-overlay flex items-center justify-center z-[var(--z-modal,50)] modal-overlay-padding"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-form-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={modalContentRef}
        className="solid-panel rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col modal-content-fit mx-2 sm:mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 solid-panel border-b border-slate-200/80 px-4 sm:px-6 py-4 flex items-center justify-between z-10 flex-shrink-0">
          <h2 id="product-form-title" className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight truncate pr-2">
            {product ? 'Edit product' : 'Add product'}
          </h2>
          <Button type="button" variant="action" onClick={onClose} className="rounded-lg min-h-[44px] min-w-[44px] flex-shrink-0" aria-label="Close">
            <X className="w-5 h-5 text-slate-600" />
          </Button>
        </div>

        <form
          key={product?.id ?? 'new'}
          onSubmit={handleSubmit}
          className="p-4 sm:p-6 lg:p-8 space-y-6 overflow-y-auto flex-1 min-h-0"
          autoComplete="off"
          onFocus={(e) => {
            const el = e.target instanceof HTMLElement ? e.target : null;
            if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
              lastFocusedInModalRef.current = el;
            }
          }}
        >
          {readOnlyMode && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-center gap-2 text-amber-900 text-sm font-medium" role="status">
              <CloudOff className="w-5 h-5 flex-shrink-0" aria-hidden />
              <span>Last saved data — read-only. Writes disabled until connection is restored.</span>
            </div>
          )}
          {/* Basic info: labels calm (font-medium), inputs min-h-touch */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Product name *
              </label>
              <input
                ref={nameRef}
                type="text"
                required
                autoComplete="off"
                defaultValue={initialTextValues?.name ?? ''}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                SKU *
              </label>
              <input
                ref={skuRef}
                type="text"
                required
                autoComplete="off"
                defaultValue={initialTextValues?.sku ?? ''}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Barcode
              </label>
              <input
                ref={barcodeRef}
                type="text"
                autoComplete="off"
                defaultValue={initialTextValues?.barcode ?? ''}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Category *
              </label>
              <input
                ref={categoryRef}
                type="text"
                required
                autoComplete="off"
                defaultValue={initialTextValues?.category ?? ''}
                placeholder="e.g., Electronics, Office"
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              Description
            </label>
            <textarea
              ref={descriptionRef}
              className="input-field"
              rows={3}
              autoComplete="off"
              defaultValue={initialTextValues?.description ?? ''}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {formData.sizeKind !== 'sized' && (
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  Quantity *
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  required
                  min="0"
                  value={formData.quantity}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                  className="input-field"
                />
              </div>
            )}
            {formData.sizeKind === 'sized' && (
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  Total quantity
                </label>
                <div className="min-h-[44px] px-4 py-3 rounded-xl border border-[#e2e8f0] bg-slate-50 text-slate-700 flex items-center">
                  {formData.quantityBySize.reduce((s, e) => s + (e.quantity || 0), 0)}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Cost price *
              </label>
              <input
                type="number"
                inputMode="decimal"
                required
                min="0"
                step="0.01"
                value={formData.costPrice}
                onChange={(e) => setFormData(prev => ({ ...prev, costPrice: Number(e.target.value) }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Selling price *
              </label>
              <input
                type="number"
                inputMode="decimal"
                required
                min="0"
                step="0.01"
                value={formData.sellingPrice}
                onChange={(e) => setFormData(prev => ({ ...prev, sellingPrice: Number(e.target.value) }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Reorder level *
              </label>
              <input
                type="number"
                inputMode="numeric"
                required
                min="0"
                value={formData.reorderLevel}
                onChange={(e) => setFormData(prev => ({ ...prev, reorderLevel: Number(e.target.value) }))}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              Size type
            </label>
            <div className="flex flex-wrap gap-2 min-h-touch">
              {(['na', 'one_size', 'sized'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setFormData(prev => {
                    if (kind !== 'sized') return { ...prev, sizeKind: kind, quantityBySize: [] };
                    // When switching to Multiple sizes on edit: pre-fill one row with current stock so stock is not zeroed (critical fix)
                    const currentQty = product ? (Number(product.quantity ?? 0) || 0) : 0;
                    const hasExistingSizes = Array.isArray(prev.quantityBySize) && prev.quantityBySize.length > 0 && prev.quantityBySize.some(r => Number(r.quantity ?? 0) > 0);
                    const quantityBySize = hasExistingSizes
                      ? prev.quantityBySize
                      : currentQty > 0
                        ? [{ sizeCode: '', quantity: currentQty }]
                        : prev.quantityBySize.length > 0 ? prev.quantityBySize : [{ sizeCode: '', quantity: 0 }];
                    return { ...prev, sizeKind: kind, quantityBySize };
                  })}
                  className={`min-h-[44px] min-w-[44px] px-4 rounded-xl border text-sm font-medium transition-colors ${
                    formData.sizeKind === kind
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {kind === 'na' ? 'No sizes' : kind === 'one_size' ? 'One size' : 'Multiple sizes'}
                </button>
              ))}
            </div>
          </div>

          {formData.sizeKind === 'sized' && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Quantity by size
                {sizeCodesLoading && (
                  <span className="ml-2 text-slate-400 font-normal">(Loading sizes…)</span>
                )}
              </label>
              {formData.quantityBySize.length === 0 && (
                <p className="text-amber-600 text-sm mb-2">Add at least one size row to save.</p>
              )}
              <div className="space-y-2">
                <datalist id="size-codes-datalist">
                  {sizeCodes.map((s) => (
                    <option key={s.size_code} value={s.size_code} label={s.size_label} />
                  ))}
                </datalist>
                {formData.quantityBySize.map((row, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 min-h-touch">
                    <input
                      type="text"
                      list="size-codes-datalist"
                      value={row.sizeCode}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        quantityBySize: prev.quantityBySize.map((r, i) =>
                          i === idx ? { ...r, sizeCode: e.target.value } : r
                        ),
                      }))}
                      placeholder="Pick or type size (e.g. US 9, EU 42)"
                      className="input-field flex-1 min-w-[120px] min-h-[44px]"
                      autoComplete="off"
                    />
                    <input
                      type="number"
                      min="0"
                      value={row.quantity}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        quantityBySize: prev.quantityBySize.map((r, i) =>
                          i === idx ? { ...r, quantity: Number(e.target.value) || 0 } : r
                        ),
                      }))}
                      className="input-field w-24 min-h-[44px]"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        quantityBySize: prev.quantityBySize.filter((_, i) => i !== idx),
                      }))}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                      aria-label="Remove size row"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    quantityBySize: [...prev.quantityBySize, { sizeCode: '', quantity: 0 }],
                  }))}
                  className="min-h-[44px] px-4 rounded-xl border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-2 text-sm font-medium"
                >
                  <Plus className="w-5 h-5" />
                  Add size
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div className="input-select-wrapper">
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Warehouse *
              </label>
              <select
                required
                value={formData.warehouseId || currentWarehouseId}
                onChange={(e) => {
                  const id = e.target.value;
                  const wh = warehouses.find((w) => w.id === id);
                  setFormData(prev => ({
                    ...prev,
                    warehouseId: id,
                    location: { ...prev.location, warehouse: wh?.name ?? prev.location.warehouse },
                  }));
                }}
                className="input-field"
              >
                {warehouses.length === 0 ? (
                  <option value={currentWarehouseId}>Main Store</option>
                ) : (
                  warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Aisle
              </label>
              <input
                type="text"
                value={formData.location.aisle}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  location: { ...prev.location, aisle: e.target.value }
                }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Rack
              </label>
              <input
                type="text"
                value={formData.location.rack}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  location: { ...prev.location, rack: e.target.value }
                }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Bin
              </label>
              <input
                type="text"
                value={formData.location.bin}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  location: { ...prev.location, bin: e.target.value }
                }))}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Supplier name
              </label>
              <input
                type="text"
                value={formData.supplier.name}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  supplier: { ...prev.supplier, name: e.target.value }
                }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Contact
              </label>
              <input
                type="text"
                value={formData.supplier.contact}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  supplier: { ...prev.supplier, contact: e.target.value }
                }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Email
              </label>
              <input
                type="email"
                autoComplete="off"
                value={formData.supplier.email}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  supplier: { ...prev.supplier, email: e.target.value }
                }))}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              Tags
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                autoComplete="off"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                className="input-field flex-1"
                placeholder="Add a tag and press Enter"
              />
              <Button type="button" variant="secondary" onClick={addTag}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.tags.map((tag) => (
                <span
                  key={tag}
                  className="badge badge-info inline-flex items-center gap-1.5"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="hover:text-blue-900 transition-colors text-base leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              Product images
            </label>
            <p className="text-slate-500 text-xs mb-2">
              Up to {MAX_PRODUCT_IMAGES} images. Each is auto-resized to under ~100KB so sync works reliably.
            </p>
            {!isOnline && (
              <p className="text-amber-700 text-xs mb-2">Images are stored locally only when offline. Cloud upload when back online.</p>
            )}
            <div className="flex flex-wrap gap-4 mb-4">
              {imagePreview.map((img, index) => (
                <div key={`preview-${index}`} className="relative">
                  <img src={img} alt={`Preview ${index + 1}`} className="w-24 h-24 object-cover rounded-lg bg-slate-100" loading="eager" />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {imageUploading && (
              <p className="text-slate-500 text-xs mb-2" role="status">Adding image…</p>
            )}
            <label
              className={`flex items-center gap-2 min-h-touch px-4 py-2.5 border border-slate-200/80 rounded-xl w-fit transition-colors text-sm font-medium text-slate-700 ${isOnline && !imageUploading ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed opacity-60'}`}
              onClick={() => { imagesLengthRef.current = imagePreview.length; }}
            >
              <Upload className="w-5 h-5 text-slate-600" />
              <span>{imageUploading ? 'Adding…' : isOnline ? 'Upload images' : 'Upload (local only when offline)'}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={!isOnline || imageUploading}
                aria-label="Upload product images"
              />
            </label>
          </div>

          {/* One primary action = Save; Cancel secondary, de-emphasized */}
          <div className="flex justify-end gap-3 pt-6 border-t border-slate-200/80 sticky bottom-0 bg-white -mx-6 lg:-mx-8 px-6 lg:px-8 pb-6">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || readOnlyMode || savePhase === 'saving'}
              aria-busy={isSubmitting || savePhase === 'saving'}
              title={readOnlyMode ? 'Read-only. Writes disabled until connection is restored.' : undefined}
            >
              {(isSubmitting || savePhase === 'saving')
                ? (savePhase === 'verifying' ? 'Verifying…' : 'Saving…')
                : product
                  ? 'Update product'
                  : 'Add product'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
