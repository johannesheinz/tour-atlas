// Injected into the phone clips of tools/feature-clips.ts (Playwright init script): a soft dot where a finger
// touches, which follows a drag, and a ring that fills while a press is held, timed like the app's long press.
(() => {
  const LONG_PRESS_MS = 1000;
  const STYLE = `
    .demo-touch { position: fixed; left: 0; top: 0; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
      z-index: 2147483647; pointer-events: none; background: rgba(255, 255, 255, .32); border: 2px solid rgba(255, 255, 255, .75);
      box-shadow: 0 0 0 1px rgba(0, 0, 0, .25), 0 2px 10px rgba(0, 0, 0, .35); transform: scale(.6); opacity: 0;
      transition: transform .12s ease-out, opacity .12s ease-out; }
    .demo-touch.on { transform: scale(1); opacity: 1; }
    .demo-touch.off { transform: scale(1.25); opacity: 0; transition: transform .3s ease-out, opacity .3s ease-out; }
    .demo-touch::after { content: ''; position: absolute; inset: -10px; border-radius: 50%; border: 3px solid rgba(255, 255, 255, .85);
      transform: scale(.55); opacity: 0; }
    .demo-touch.holding::after { animation: demo-touch-hold ${LONG_PRESS_MS}ms linear forwards; }
    @keyframes demo-touch-hold { from { transform: scale(.55); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  `;

  function install() {
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);
    const dots = new Map();

    addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return;
      const dot = Object.assign(document.createElement('div'), { className: 'demo-touch' });
      dot.style.translate = `${event.clientX}px ${event.clientY}px`;
      document.body.append(dot);
      dots.set(event.pointerId, { dot, x: event.clientX, y: event.clientY });
      requestAnimationFrame(() => dot.classList.add('on', 'holding'));
    }, true);

    addEventListener('pointermove', (event) => {
      const touch = dots.get(event.pointerId);
      if (touch === undefined) return;
      touch.dot.style.translate = `${event.clientX}px ${event.clientY}px`;
      if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 8) touch.dot.classList.remove('holding');
    }, true);

    const lift = (event) => {
      const touch = dots.get(event.pointerId);
      if (touch === undefined) return;
      dots.delete(event.pointerId);
      touch.dot.classList.remove('holding');
      touch.dot.classList.add('off');
      setTimeout(() => touch.dot.remove(), 400);
    };
    addEventListener('pointerup', lift, true);
    addEventListener('pointercancel', lift, true);
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install);
  else install();
})();
