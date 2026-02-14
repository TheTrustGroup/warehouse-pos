/**
 * Liquid glass animation variants for Framer Motion.
 * GPU-friendly (transform + opacity only). Use reduced: true when prefers-reduced-motion or user disables animations.
 */

const spring = { type: 'spring', stiffness: 300, damping: 20 };
const springBounce = { type: 'spring', stiffness: 400, damping: 25 };
const tween = { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] };

function whenReduced(reduced, full, fallback = {}) {
  return reduced ? { ...fallback, transition: { duration: 0 } } : full;
}

/**
 * Smooth scale + opacity fade-in (mount).
 */
export function glassReveal(reduced = false) {
  return whenReduced(
    reduced,
    {
      initial: { opacity: 0, scale: 0.96 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.98 },
      transition: tween,
    },
    { initial: { opacity: 1, scale: 1 }, animate: {}, exit: {} }
  );
}

/**
 * Subtle lift + glow on hover.
 */
export function glassHover(reduced = false) {
  return whenReduced(
    reduced,
    {
      whileHover: {
        y: -4,
        boxShadow: '0 12px 40px 0 rgba(31, 38, 135, 0.15)',
        transition: tween,
      },
      whileTap: { scale: 0.99, transition: { duration: 0.1 } },
    },
    {}
  );
}

/**
 * Shape-shifting border radius on hover (rounded-lg -> more rounded).
 */
export function liquidMorph(reduced = false) {
  return whenReduced(
    reduced,
    {
      initial: { borderRadius: 16 },
      whileHover: {
        borderRadius: 24,
        transition: tween,
      },
    },
    {}
  );
}

/**
 * For ripple: use with a child that animates scale/opacity from click position (handled in component).
 */
export function rippleVariants(reduced = false) {
  return whenReduced(
    reduced,
    {
      initial: { opacity: 0, scale: 0 },
      animate: { opacity: 0.4, scale: 2.5 },
      exit: { opacity: 0, transition: { duration: 0.4 } },
      transition: { duration: 0.25 },
    },
    { initial: {}, animate: {}, exit: {} }
  );
}

/**
 * Subtle floating motion (for decorative elements; use sparingly).
 */
export function floatingBlur(reduced = false) {
  return whenReduced(
    reduced,
    {
      animate: {
        y: [0, -6, 0],
        opacity: [0.9, 1, 0.9],
        transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
      },
    },
    {}
  );
}

/**
 * Left-to-right shimmer (for load/success state).
 */
export function shimmerSweep(reduced = false) {
  return whenReduced(
    reduced,
    {
      initial: { x: '-100%' },
      animate: { x: '100%' },
      transition: { duration: 0.8, ease: 'easeInOut' },
    },
    {}
  );
}

/**
 * Modal: slide up + backdrop fade. Backdrop and content separate.
 */
export function modalOverlayVariants(reduced = false) {
  return whenReduced(
    reduced,
    {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.2 },
    },
    { initial: { opacity: 1 }, animate: {}, exit: {} }
  );
}

export function modalContentVariants(reduced = false) {
  return whenReduced(
    reduced,
    {
      initial: { opacity: 0, y: 24 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 12 },
      transition: spring,
    },
    { initial: { opacity: 1, y: 0 }, animate: {}, exit: {} }
  );
}

/**
 * Button: morph border-radius on hover (rounded-lg -> rounded-full subtle).
 */
export function buttonMorphVariants(reduced = false) {
  return whenReduced(
    reduced,
    {
      whileHover: {
        borderRadius: 9999,
        transition: tween,
      },
      whileTap: { scale: 0.98, transition: { duration: 0.1 } },
    },
    {}
  );
}

/**
 * Sync bar: slide from bottom with bounce.
 */
export function syncBarVariants(reduced = false) {
  return whenReduced(
    reduced,
    {
      initial: { y: 80, opacity: 0 },
      animate: { y: 0, opacity: 1 },
      exit: { y: 80, opacity: 0 },
      transition: springBounce,
    },
    { initial: { y: 0, opacity: 1 }, animate: {}, exit: {} }
  );
}

/**
 * Pulse for syncing state (scale loop).
 */
export function pulseVariants(reduced = false) {
  return whenReduced(
    reduced,
    {
      animate: {
        scale: [1, 1.02, 1],
        transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
      },
    },
    {}
  );
}

/**
 * Input focus: expand/lift.
 */
export function inputFocusVariants(reduced = false) {
  return whenReduced(
    reduced,
    {
      initial: { scale: 1, y: 0 },
      whileFocus: {
        scale: 1.01,
        y: -1,
        transition: { duration: 0.2 },
      },
    },
    {}
  );
}

/** Spring config for modals (damping: 20, stiffness: 300) */
export const modalSpring = spring;
