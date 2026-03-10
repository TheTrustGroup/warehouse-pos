/**
 * Upload product images to Supabase Storage (bucket: product-images).
 * Data URLs (base64) are uploaded and replaced with the public URL; existing HTTP(S) URLs are kept.
 * Requires bucket "product-images" to exist and be public. See docs/CDN_AND_IMAGE_OPTIMIZATION.md.
 */
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = 'product-images';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

function getExtFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);/);
  const mime = (match?.[1] ?? '').toLowerCase().trim();
  return MIME_EXT[mime] ?? 'jpg';
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid data URL');
  const contentType = match[1].trim().toLowerCase();
  const base64 = match[2];
  if (!base64) throw new Error('Empty base64 in data URL');
  const buffer = Buffer.from(base64, 'base64');
  return { buffer, contentType };
}

/**
 * Upload image array to Storage. Data URLs are uploaded and replaced with public URLs; HTTP(S) URLs are kept.
 * Path format: {productId}/{uuid}.{ext}
 * Returns array of URLs in same order as input. On upload failure for an item, that item is omitted (or keep original data URL - we'll skip and keep to avoid losing data).
 */
export async function uploadProductImages(
  images: string[],
  productId: string
): Promise<string[]> {
  if (!Array.isArray(images) || images.length === 0) return [];

  const supabase = getSupabaseAdmin();
  const results: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const raw = images[i];
    if (typeof raw !== 'string' || !raw.trim()) {
      results.push('');
      continue;
    }

    // Already an HTTP(S) URL — keep as-is (e.g. existing Storage URL)
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      results.push(raw.trim());
      continue;
    }

    // Data URL — upload to Storage
    if (!raw.startsWith('data:')) {
      results.push(raw);
      continue;
    }

    try {
      const { buffer, contentType } = dataUrlToBuffer(raw);
      const ext = getExtFromDataUrl(raw);
      const path = `${productId}/${crypto.randomUUID()}.${ext}`;

      const { data, error } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, {
          contentType: contentType || 'image/jpeg',
          upsert: true,
        });

      if (error) {
        console.error('[productImages] upload failed:', path, error.message);
        // Keep original data URL so product still has an image
        results.push(raw);
        continue;
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
      results.push(urlData.publicUrl);
    } catch (e) {
      console.error('[productImages] process failed for item', i, e);
      results.push(raw);
    }
  }

  return results;
}
