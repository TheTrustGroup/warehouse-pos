/**
 * Image size limit for sync: each image (base64 data URL) must be under this length
 * so the total POST body stays under server limits (e.g. Vercel 4.5MB).
 * Sync includes at most 5 images; keeping each under ~100KB avoids "Load failed".
 */
export const MAX_IMAGE_BASE64_LENGTH = 100_000;

const MAX_DIMENSION_PX = 1200;
const JPEG_QUALITY_STEP = 0.15;
const MIN_QUALITY = 0.2;

/**
 * Resize and compress an image file so its data URL is under MAX_IMAGE_BASE64_LENGTH.
 * Uses canvas + JPEG; preserves aspect ratio. Call from the main thread (uses document.createElement).
 *
 * @param file - Image file from input
 * @param maxLength - Max length of the returned data URL (default MAX_IMAGE_BASE64_LENGTH)
 * @returns Data URL string (length <= maxLength), or original data URL if already small or not an image
 */
export function compressImage(
  file: File,
  maxLength: number = MAX_IMAGE_BASE64_LENGTH
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
      return;
    }

    const img = document.createElement('img');
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const dataUrl = compressImageElement(img, maxLength);
        resolve(dataUrl);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

function compressImageElement(img: HTMLImageElement, maxLength: number): string {
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (w <= 0 || h <= 0) return img.src;

  if (w > MAX_DIMENSION_PX || h > MAX_DIMENSION_PX) {
    if (w > h) {
      h = Math.round((h * MAX_DIMENSION_PX) / w);
      w = MAX_DIMENSION_PX;
    } else {
      w = Math.round((w * MAX_DIMENSION_PX) / h);
      h = MAX_DIMENSION_PX;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return img.src;
  ctx.drawImage(img, 0, 0, w, h);

  for (let q = 0.9; q >= MIN_QUALITY; q -= JPEG_QUALITY_STEP) {
    const dataUrl = canvas.toDataURL('image/jpeg', q);
    if (dataUrl.length <= maxLength) return dataUrl;
  }
  let dataUrl = canvas.toDataURL('image/jpeg', MIN_QUALITY);
  if (dataUrl.length <= maxLength) return dataUrl;
  // Scale down further and retry
  while (w > 100 || h > 100) {
    w = Math.max(100, Math.floor(w * 0.7));
    h = Math.max(100, Math.floor(h * 0.7));
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
    dataUrl = canvas.toDataURL('image/jpeg', MIN_QUALITY);
    if (dataUrl.length <= maxLength) return dataUrl;
  }
  return dataUrl;
}
