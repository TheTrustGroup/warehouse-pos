/**
 * Resize a base64 image so its data-URL length is at or under maxChars.
 * Used by sync queue to avoid 413 (request too large) while preserving data integrity:
 * we resize instead of silently omitting images.
 *
 * @param {string} dataUrl - data:image/...;base64,... (same-origin only for canvas)
 * @param {number} maxChars - max length of returned data URL (e.g. 95_000 to stay under 100KB payload)
 * @returns {Promise<string|null>} Resized data URL, or null if resize failed / image invalid
 */
export function resizeBase64ToMaxLength(dataUrl, maxChars) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return Promise.resolve(null);
  }
  if (dataUrl.length <= maxChars) {
    return Promise.resolve(dataUrl);
  }

  return new Promise((resolve) => {
    const img = typeof document !== 'undefined' ? new Image() : null;
    if (!img) {
      resolve(null);
      return;
    }
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const maxDim = 1024;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        const tryQuality = (quality) =>
          new Promise((res) => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  res(null);
                  return;
                }
                const reader = new FileReader();
                reader.onloadend = () => {
                  const result = reader.result;
                  res(typeof result === 'string' && result.length <= maxChars ? result : null);
                };
                reader.onerror = () => res(null);
                reader.readAsDataURL(blob);
              },
              'image/jpeg',
              quality
            );
          });

        (async () => {
          for (const q of [0.85, 0.7, 0.55, 0.4]) {
            const out = await tryQuality(q);
            if (out) {
              resolve(out);
              return;
            }
          }
          resolve(null);
        })();
      } catch {
        resolve(null);
      }
    };
    img.src = dataUrl;
  });
}
