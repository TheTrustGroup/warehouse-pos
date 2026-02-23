// ============================================================
// imageUpload.ts — Supabase Storage helpers + optional client upload
//
// PRIMARY UPLOAD: Use POST /api/upload/product-image (server). Auth, validation,
// and logging live there; ProductFormModal already uses it.
//
// THIS MODULE:
//   - Helpers: isStorageUrl(), isBase64(), extractPathFromUrl() — use when
//     displaying or cleaning product.images[].
//   - deleteProductImage(path) — use when removing an image from Storage (e.g.
//     "remove image" that should delete the object, not only the DB reference).
//   - uploadProductImage(file, onProgress?) — optional client-direct upload
//     (e.g. if you need progress UX or server upload is unavailable). Requires
//     VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.
//
// SETUP: Run 20250222130000_master_sql_v2.sql (creates 'product-images' bucket).
// ============================================================

const BUCKET = 'product-images';

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

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

export interface UploadResult {
  url: string;
  path: string;
}

/**
 * Upload a product image to Supabase Storage.
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

  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(
      `Image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 2MB.`
    );
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image (JPG, PNG, WebP).');
  }

  const path = generatePath(file);
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
      'Content-Type': file.type,
      'Cache-Control': '3600',
    },
    body: file,
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

export function isStorageUrl(src: string): boolean {
  return src.startsWith('http') && src.includes('/storage/v1/object/');
}

export function isBase64(src: string): boolean {
  return src.startsWith('data:');
}

/** Allowed path for our bucket. Only URLs from our Supabase origin + this path are allowed. */
const STORAGE_OBJECT_PATH = '/storage/v1/object/';

/**
 * Returns a URL safe to use as img src: only our Supabase Storage (product-images) or data: base64.
 * Prevents XSS from arbitrary user-supplied URLs. For invalid URLs returns a 1x1 transparent GIF.
 */
export function safeProductImageUrl(src: string): string {
  if (typeof src !== 'string' || !src) return EMPTY_IMAGE_DATA_URL;
  const s = src.trim();
  if (isBase64(s)) return s;
  const base = getSupabaseUrl();
  if (base && s.startsWith(base) && s.includes(STORAGE_OBJECT_PATH) && s.includes(BUCKET)) return s;
  return EMPTY_IMAGE_DATA_URL;
}

const EMPTY_IMAGE_DATA_URL =
  'data:image/gif;base64,R0lGOODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
