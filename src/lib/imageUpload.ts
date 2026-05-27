// ============================================================
// imageUpload.ts — Supabase Storage upload/delete (client-direct).
//
// Display + URL rules: productImageUrl.ts (single source of truth).
// Persistence (no base64 in DB): inventory-server lib/storage/productImages.ts
//
// Preferred upload path: POST /api/upload/product-image (service role) via
// uploadProductImageForSave(). Client-direct upload is fallback only.
// ============================================================

import { PRODUCT_IMAGES_BUCKET } from './productImageUrl';

export {
  isStorageUrl,
  isBase64,
  safeProductImageUrl,
  EMPTY_IMAGE_DATA_URL,
  isPersistableImageUrl,
} from './productImageUrl';

const BUCKET = PRODUCT_IMAGES_BUCKET;

/** Max upload size in bytes. Must match API and Supabase bucket file_size_limit. */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_IMAGE_SIZE_MB = MAX_IMAGE_SIZE_BYTES / (1024 * 1024);
const MAX_SIZE_BYTES = MAX_IMAGE_SIZE_BYTES;

/** Vite env for Supabase (this app is Vite-only; no process.env). */
function getEnv(): { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string } {
  if (typeof import.meta !== 'undefined' && import.meta.env != null) {
    return import.meta.env as { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string };
  }
  return {};
}

function getSupabaseUrl(): string {
  const env = getEnv();
  return env.VITE_SUPABASE_URL ?? '';
}

function getSupabaseAnonKey(): string {
  const env = getEnv();
  return env.VITE_SUPABASE_ANON_KEY ?? '';
}

function generatePath(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `products/${ts}-${rand}.${ext}`;
}

/** Max dimension (width or height) for compressed product images. */
const MAX_DIMENSION = 1920;

/**
 * Compress image to stay under maxBytes using Canvas. Preserves aspect ratio.
 * Returns original file if already under limit or not a supported image.
 * Output is always JPEG for smaller size. Uses no dependencies.
 */
async function compressImageIfNeeded(
  file: File,
  maxBytes: number
): Promise<File> {
  if (file.size <= maxBytes) return file;
  if (!file.type.startsWith('image/')) return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = document.createElement('img');
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode image'));
      el.src = url;
    });

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return file;

    let maxDim = MAX_DIMENSION;
    const qualities = [0.92, 0.85, 0.75, 0.6, 0.5];

    for (const q of qualities) {
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);

      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, cw, ch);

      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, 'image/jpeg', q)
      );
      if (!blob) continue;
      if (blob.size <= maxBytes) {
        const name = file.name.replace(/\.[a-z]+$/i, '.jpg');
        return new File([blob], name, { type: 'image/jpeg' });
      }
      maxDim = Math.round(maxDim * 0.85);
    }
  } finally {
    URL.revokeObjectURL(url);
  }

  return file;
}

export interface UploadResult {
  url: string;
  path: string;
}

/**
 * Upload a product image to Supabase Storage.
 * Large images are compressed client-side to stay under the size limit.
 * Returns { url, path } on success.
 * Throws on failure.
 *
 * @param file - The File object from <input type="file">
 * @param onProgress - Optional progress callback (0-100)
 */
export async function uploadProductImage(
  file: File,
  onProgress?: (pct: number) => void
): Promise<UploadResult> {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      'Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
    );
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image (JPG, PNG, WebP).');
  }

  onProgress?.(5);
  const toUpload = await compressImageIfNeeded(file, MAX_SIZE_BYTES);
  onProgress?.(15);

  if (toUpload.size > MAX_SIZE_BYTES) {
    throw new Error(
      `Image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max ${MAX_SIZE_BYTES / 1024 / 1024}MB. Compress or resize the image and try again.`
    );
  }

  const path = generatePath(toUpload);
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`;

  let authToken = '';
  try {
    authToken =
      localStorage.getItem('auth_token') ??
      localStorage.getItem('access_token') ??
      localStorage.getItem('token') ??
      '';
  } catch {
    /* localStorage not available */
  }

  onProgress?.(10);

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: authToken ? `Bearer ${authToken}` : `Bearer ${anonKey}`,
      'Content-Type': toUpload.type,
      'Cache-Control': '3600',
    },
    body: toUpload,
  });

  onProgress?.(80);

  if (!res.ok) {
    let msg = `Upload failed (${res.status})`;
    try {
      const body = await res.json();
      msg = (body as { message?: string; error?: string }).message ?? (body as { message?: string; error?: string }).error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  onProgress?.(100);

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
  return { url: publicUrl, path };
}

export async function deleteProductImage(path: string): Promise<void> {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!supabaseUrl || !anonKey) return;

  let authToken = '';
  try {
    authToken =
      localStorage.getItem('auth_token') ??
      localStorage.getItem('access_token') ??
      localStorage.getItem('token') ??
      '';
  } catch {
    /* ok */
  }

  await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'DELETE',
    headers: {
      apikey: anonKey,
      Authorization: authToken ? `Bearer ${authToken}` : `Bearer ${anonKey}`,
    },
  });
}

export function extractPathFromUrl(url: string): string | null {
  try {
    const match = url.match(/\/object\/public\/product-images\/(.+)$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Upload via API (service role) first, then client Storage. Returns null if both fail.
 * When online, does not return base64 — keeps DB/Storage as the only durable store.
 */
export async function uploadProductImageForSave(
  file: File,
  options: {
    apiBaseUrl: string;
    getHeaders: () => Record<string, string>;
    isOnline: boolean;
    onProgress?: (pct: number) => void;
  }
): Promise<string | null> {
  const { apiBaseUrl, getHeaders, isOnline, onProgress } = options;
  if (!isOnline) return null;

  try {
    const form = new FormData();
    form.append('file', file, file.name);
    const headers = getHeaders();
    const { 'Content-Type': _omitCt, ...rest } = headers;
    void _omitCt;
    const res = await fetch(`${apiBaseUrl}/api/upload/product-image`, {
      method: 'POST',
      headers: rest,
      body: form,
    });
    if (res.ok) {
      const data = (await res.json()) as { url?: string };
      if (typeof data?.url === 'string' && data.url.trim()) return data.url.trim();
    }
  } catch {
    /* try client upload */
  }

  try {
    const { url } = await uploadProductImage(file, onProgress);
    return url?.trim() || null;
  } catch {
    return null;
  }
}
