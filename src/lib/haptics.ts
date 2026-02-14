/**
 * Haptic feedback (vibrate API). No-op when unsupported or when user prefers reduced motion.
 */
export function hapticFeedback(pattern: number | number[] = 10) {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}
