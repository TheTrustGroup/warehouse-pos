/**
 * Lightweight confetti burst (no dependency). Triggers a one-time burst of particles.
 * Safe: no rapid flashing; duration and frequency are modest.
 */
const COLORS = ['#ef4444', '#dc2626', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

function createParticle(x: number, y: number, color: string) {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = `
    position: fixed; left: ${x}px; top: ${y}px; width: 8px; height: 8px;
    background: ${color}; border-radius: 2px; pointer-events: none;
    z-index: 9999; transform-origin: center;
  `;
  const angle = Math.random() * 360;
  const velocity = 80 + Math.random() * 120;
  const tx = Math.cos((angle * Math.PI) / 180) * velocity;
  const ty = -50 - Math.random() * 100;
  el.animate(
    [
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${tx}px,${ty}px) rotate(720deg)`, opacity: 0.8 },
      {
        transform: `translate(${tx + (Math.random() - 0.5) * 80}px,${ty + 200 + Math.random() * 100}px) rotate(1080deg)`,
        opacity: 0,
      },
    ],
    { duration: 1800, easing: 'ease-out', fill: 'forwards' }
  );
  return el;
}

export function triggerConfetti(particleCount = 50) {
  if (typeof document === 'undefined') return;
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;';
  for (let i = 0; i < particleCount; i++) {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const x = centerX + (Math.random() - 0.5) * 200;
    const y = centerY + (Math.random() - 0.5) * 100;
    container.appendChild(createParticle(x, y, color));
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 2000);
}
