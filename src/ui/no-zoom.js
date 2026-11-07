// Stops the browser zooming the page: pinch, double-tap and the iOS gesture events (iOS ignores user-scalable=no).
// If the page somehow ends up zoomed anyway, the viewport tag is re-applied to snap it back.
export function installNoZoom(doc = document, win = window) {
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) doc.addEventListener(g, stop, { passive: false });
  doc.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) stop(e); }, { passive: false });
  let lastEnd = 0;
  doc.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastEnd < 320) stop(e);                 // second tap of a double-tap
    lastEnd = now;
  }, { passive: false });
  doc.addEventListener('dblclick', stop, { passive: false });
  doc.addEventListener('wheel', (e) => { if (e.ctrlKey) stop(e); }, { passive: false });
  const meta = doc.querySelector('meta[name="viewport"]');
  const base = meta ? meta.getAttribute('content') : '';
  const vv = win.visualViewport;
  if (vv && meta) {
    vv.addEventListener('resize', () => {
      if (vv.scale > 1.02) {                          // zoomed: re-apply the viewport to reset it
        meta.setAttribute('content', base.replace('maximum-scale=1', 'maximum-scale=1.0001'));
        setTimeout(() => meta.setAttribute('content', base), 60);
      }
    });
  }
}
