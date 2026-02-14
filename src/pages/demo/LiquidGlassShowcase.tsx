/**
 * Demo page: all liquid glass animations in one place.
 * Route: /demo/liquid-glass-showcase
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { useAnimations } from '../../hooks/useAnimations';
import {
  glassReveal,
  glassHover,
  liquidMorph,
  rippleVariants,
  floatingBlur,
  shimmerSweep,
  modalOverlayVariants,
  modalContentVariants,
  buttonMorphVariants,
  syncBarVariants,
  pulseVariants,
  inputFocusVariants,
} from '../../animations/liquidGlass';
import { hapticFeedback } from '../../lib/haptics';
import { triggerConfetti } from '../../lib/confetti';

export function LiquidGlassShowcase() {
  const { reduced } = useAnimations();
  const [modalOpen, setModalOpen] = useState(false);
  const [ripple, setRipple] = useState<{ x: number; y: number; id: number } | null>(null);
  const [shimmerKey, setShimmerKey] = useState(0);

  const reveal = glassReveal(reduced);
  const hover = glassHover(reduced);
  const morph = liquidMorph(reduced);
  const rippleV = rippleVariants(reduced);
  const float = floatingBlur(reduced);
  const overlayV = modalOverlayVariants(reduced);
  const contentV = modalContentVariants(reduced);
  const buttonMorph = buttonMorphVariants(reduced);
  const barV = syncBarVariants(reduced);
  const pulse = pulseVariants(reduced);
  const inputFocus = inputFocusVariants(reduced);

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          Liquid Glass Animation Showcase
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          All variants from <code className="text-sm bg-slate-100 dark:bg-slate-800 px-1 rounded">/src/animations/liquidGlass.js</code>.
          Toggle &quot;Enable animations&quot; in Settings to see reduced-motion behavior.
        </p>
      </div>

      <section className="glass-card p-6 rounded-2xl">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">glassReveal</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Smooth scale + opacity fade-in on mount.</p>
        <div className="flex flex-wrap gap-4">
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              {...glassReveal(reduced)}
              className="w-24 h-24 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold"
            >
              {i}
            </motion.div>
          ))}
        </div>
      </section>

      <section className="glass-card p-6 rounded-2xl">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">glassHover + liquidMorph</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Hover: lift + glow; border radius morphs.</p>
        <motion.div
          {...reveal}
          {...hover}
          {...morph}
          className="w-48 h-32 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300"
        >
          Hover me
        </motion.div>
      </section>

      <section className="glass-card p-6 rounded-2xl">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Ripple effect on click</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Click the card to see radial ripple.</p>
        <motion.div
          className="relative w-64 h-40 rounded-2xl bg-primary-50 dark:bg-primary-900/20 cursor-pointer overflow-hidden"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: Date.now() });
            hapticFeedback(8);
            setTimeout(() => setRipple(null), 400);
          }}
        >
          <span className="absolute inset-0 flex items-center justify-center text-slate-700 dark:text-slate-300 font-medium">
            Click anywhere
          </span>
          <AnimatePresence>
            {ripple && (
              <motion.span
                key={ripple.id}
                className="absolute rounded-full bg-primary-400/50 pointer-events-none"
                style={{
                  left: ripple.x,
                  top: ripple.y,
                  width: 20,
                  height: 20,
                  marginLeft: -10,
                  marginTop: -10,
                }}
                initial="initial"
                animate="animate"
                exit="exit"
                variants={rippleV}
              />
            )}
          </AnimatePresence>
        </motion.div>
      </section>

      <section className="glass-card p-6 rounded-2xl">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">floatingBlur</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Subtle floating motion (decorative).</p>
        <motion.div
          {...float}
          className="w-20 h-20 rounded-full bg-primary-200/80 dark:bg-primary-800/50 flex items-center justify-center"
        />
      </section>

      <section className="glass-card p-6 rounded-2xl">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Shimmer sweep</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Left-to-right sweep (e.g. on success).</p>
        <div className="relative h-12 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <motion.div
            key={shimmerKey}
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
          />
          <span className="relative flex items-center justify-center h-full text-slate-600 dark:text-slate-400 text-sm">
            Trigger below
          </span>
        </div>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => { setShimmerKey((k) => k + 1); hapticFeedback(5); }}
        >
          Trigger shimmer
        </Button>
      </section>

      <section className="glass-card p-6 rounded-2xl">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Modal (slide up + backdrop)</h2>
        <Button variant="primary" onClick={() => setModalOpen(true)}>Open modal</Button>
        <AnimatePresence mode="wait">
          {modalOpen && (
            <motion.div
              key="demo-overlay"
              initial="initial"
              animate="animate"
              exit="exit"
              variants={overlayV}
              className="fixed inset-0 glass-overlay flex items-center justify-center z-50"
              onClick={() => setModalOpen(false)}
            >
              <motion.div
                variants={contentV}
                initial="initial"
                animate="animate"
                exit="exit"
                className="glass-primary rounded-2xl p-6 max-w-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-semibold mb-2">Demo modal</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
                  Spring physics: damping 20, stiffness 300.
                </p>
                <Button variant="primary" onClick={() => setModalOpen(false)}>Close</Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section className="glass-card p-6 rounded-2xl">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Button morph (border-radius)</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Hover: rounded-lg → rounded-full.</p>
        <motion.button
          {...buttonMorph}
          className="px-6 py-3 rounded-lg bg-primary-500 text-white font-medium"
        >
          Hover me
        </motion.button>
      </section>

      <section className="glass-card p-6 rounded-2xl">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Sync bar + pulse</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Slide from bottom with bounce; pulse when syncing.</p>
        <motion.div
          initial="initial"
          animate="animate"
          variants={barV}
          className="rounded-xl bg-blue-600 text-white px-4 py-3 flex items-center justify-center gap-2"
        >
          <motion.span {...pulse}>Syncing…</motion.span>
        </motion.div>
      </section>

      <section className="glass-card p-6 rounded-2xl">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Input focus (expand/lift)</h2>
        <motion.input
          {...inputFocus}
          type="text"
          placeholder="Focus me"
          className="w-full max-w-xs px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
        />
      </section>

      <section className="glass-card p-6 rounded-2xl">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Confetti</h2>
        <Button variant="primary" onClick={() => { triggerConfetti(50); hapticFeedback([10, 50, 10]); }}>
          Trigger confetti
        </Button>
      </section>
    </div>
  );
}
