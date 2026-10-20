// Injected into every page of a desktop feature clip (Playwright init script): a visible mouse cursor,
// captions and the title card. Driven by tools/feature-clips.ts through globalThis.__demo.
(() => {
  const SVG = 'http://www.w3.org/2000/svg';
  const STYLE = `
    #demo-cursor { position: fixed; left: 0; top: 0; width: 28px; height: 28px; z-index: 2147483647; pointer-events: none;
      transform: translate(-100px, -100px); transition: none; filter: drop-shadow(0 2px 4px rgba(0,0,0,.6)); }
    #demo-cursor.down svg { transform: scale(.85); transform-origin: 3px 3px; }
    #demo-caption { position: fixed; left: 50%; bottom: 56px; z-index: 2147483646; pointer-events: none;
      transform: translate(-50%, 16px); opacity: 0; transition: opacity .45s ease, transform .45s ease;
      padding: 16px 34px; border-radius: 14px; background: rgba(10, 12, 20, .82); color: #fff;
      font: 400 38px/1.15 'Inter Tight', sans-serif; letter-spacing: .01em; white-space: nowrap;
      box-shadow: 0 10px 40px rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.12); backdrop-filter: blur(6px); }
    #demo-caption.on { opacity: 1; transform: translate(-50%, 0); }
    #demo-card { position: fixed; inset: 0; z-index: 2147483645; pointer-events: none; display: grid; place-content: center;
      text-align: center; gap: 22px; color: #fff; opacity: 0; transition: opacity .7s ease;
      background: radial-gradient(ellipse at center, rgba(14,16,28,.80) 0%, rgba(6,7,12,.96) 75%); backdrop-filter: blur(10px); }
    #demo-card.on { opacity: 1; }
    #demo-card h1 { margin: 0; font: 700 150px/1 'Inter Tight', sans-serif; }
    #demo-card .wordmark-space { font-size: 0; }
    #demo-card .wordmark-light { font-weight: 300; }
    #demo-card p { margin: 0; font: 400 44px/1.3 'Inter Tight', sans-serif; color: rgba(255,255,255,.82); }
  `;

  function cursorArrow() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('width', '28');
    svg.setAttribute('height', '28');
    svg.setAttribute('viewBox', '0 0 28 28');
    const arrow = document.createElementNS(SVG, 'path');
    arrow.setAttribute('d', 'M3 2 L3 22 L8.5 17 L12.5 26 L16 24.5 L12 15.5 L19.5 15.5 Z');
    arrow.setAttribute('fill', '#fff');
    arrow.setAttribute('stroke', '#111');
    arrow.setAttribute('stroke-width', '1.6');
    arrow.setAttribute('stroke-linejoin', 'round');
    svg.append(arrow);
    return svg;
  }

  // The wordmark as the app sets it in Stage lights: a real space for screen readers, hidden on screen.
  function cardLine([kind, ...texts]) {
    if (kind === 'p') return Object.assign(document.createElement('p'), { textContent: texts[0] });
    if (kind !== 'wordmark') throw new Error(`unknown card line ${kind}`);
    const [heavy, light] = texts;
    const heading = document.createElement('h1');
    heading.append(
      heavy,
      Object.assign(document.createElement('span'), { className: 'wordmark-space', textContent: ' ' }),
      Object.assign(document.createElement('span'), { className: 'wordmark-light', textContent: light }),
    );
    return heading;
  }

  function install() {
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);
    const cursor = Object.assign(document.createElement('div'), { id: 'demo-cursor' });
    cursor.append(cursorArrow());
    const caption = Object.assign(document.createElement('div'), { id: 'demo-caption' });
    const card = Object.assign(document.createElement('div'), { id: 'demo-card' });
    document.body.append(cursor, caption, card);
    addEventListener('mousemove', (event) => { cursor.style.transform = `translate(${event.clientX - 3}px, ${event.clientY - 2}px)`; }, true);
    addEventListener('mousedown', () => cursor.classList.add('down'), true);
    addEventListener('mouseup', () => cursor.classList.remove('down'), true);
    globalThis.__demo = {
      caption(text) {
        if (text === null) {
          caption.classList.remove('on');
          return;
        }
        caption.textContent = text;
        caption.classList.add('on');
      },
      card(lines) {
        cursor.style.opacity = lines === null ? '1' : '0';
        if (lines === null) {
          card.classList.remove('on');
          return;
        }
        card.replaceChildren(...lines.map(cardLine));
        card.classList.add('on');
      },
    };
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install);
  else install();
})();
