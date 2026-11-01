/** Pointer feedback is decorative and never changes chart or trading state. */
export function initGlassMotion() {
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = null, frame = 0, x = 0, y = 0;
  const enabled = () => finePointer.matches && !reducedMotion.matches;

  function clear() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (active) {
      active.classList.remove('pointer-active');
      for (const name of ['--pointer-x', '--pointer-y', '--tilt-x', '--tilt-y']) {
        active.style.removeProperty(name);
      }
    }
    active = null;
  }

  function paint() {
    frame = 0;
    if (!active?.isConnected || !enabled()) return clear();
    const rect = active.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    const py = Math.max(0, Math.min(1, (y - rect.top) / rect.height));
    active.style.setProperty('--pointer-x', `${px * 100}%`);
    active.style.setProperty('--pointer-y', `${py * 100}%`);
    active.style.setProperty('--tilt-x', `${(0.5 - py) * 3}deg`);
    active.style.setProperty('--tilt-y', `${(px - 0.5) * 3}deg`);
    active.classList.add('pointer-active');
  }

  // Delegation also covers agent cards replaced by live market updates.
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !enabled()) return;
    const card = event.target instanceof Element ? event.target.closest('.glass') : null;
    if (card !== active) { clear(); active = card; }
    if (!active) return;
    x = event.clientX; y = event.clientY;
    if (!frame) frame = requestAnimationFrame(paint);
  }, {passive: true});

  document.addEventListener('pointerout', event => {
    if (active && (!(event.relatedTarget instanceof Node) || !active.contains(event.relatedTarget))) clear();
  }, {passive: true});

  document.addEventListener('pointerdown', event => {
    if (!enabled() || event.pointerType !== 'mouse' || event.button !== 0) return;
    const button = event.target instanceof Element ? event.target.closest('.glass-button, .primary-button, .icon-button, .nav') : null;
    if (!button || button.disabled) return;
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'glass-ripple';
    ripple.setAttribute('aria-hidden', 'true');
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    ripple.style.setProperty('--ripple-size', `${Math.max(rect.width, rect.height) * 2}px`);
    button.append(ripple);
    // Timeout also cleans up when a preference changes during the animation.
    setTimeout(() => ripple.remove(), 700);
  }, {passive: true});

  window.addEventListener('blur', clear);
  window.addEventListener('scroll', clear, {passive: true, capture: true});
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  finePointer.addEventListener('change', clear);
  reducedMotion.addEventListener('change', clear);
}
