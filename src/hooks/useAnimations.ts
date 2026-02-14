/**
 * Hook: should we run UI animations? Respects prefers-reduced-motion and settings toggle.
 */
import { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';

export function useAnimations() {
  const { systemSettings } = useSettings();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = () => setPrefersReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const reduced = prefersReducedMotion || !systemSettings.animationsEnabled;
  const soundEffects = systemSettings.soundEffects ?? false;
  return { reduced, soundEffects };
}
