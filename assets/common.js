// Shared scroll follower. Native scrolling stays untouched; only the animation value is smoothed.
window.CWG = {
  clamp: (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)),
  map: (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a))),
  lerp: (a, b, t) => a + (b - a) * t,
  smooth: t => t * t * (3 - 2 * t),
  cubicOut: t => 1 - Math.pow(1 - t, 3),
  expoOut: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  expoInOut: t => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  capture: new URLSearchParams(location.search).has('capture'),
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,

  progress(stage) {
    const r = stage.getBoundingClientRect();
    const total = r.height - innerHeight;
    return total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
  },

  // render(p, dt) draws one frame; busy() says an intro is still running.
  driver(stage, render, busy = () => false) {
    let cur = this.progress(stage), last = 0, running = false;
    const tick = now => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const target = this.progress(stage);
      cur += (target - cur) * (1 - Math.exp(-dt * 7));
      if (Math.abs(target - cur) < 0.00015) cur = target;
      render(cur, dt);
      if (cur !== target || busy()) requestAnimationFrame(tick);
      else { running = false; last = 0; }
    };
    const wake = () => { if (!running && !this.capture) { running = true; requestAnimationFrame(tick); } };
    addEventListener('scroll', wake, { passive: true });
    addEventListener('resize', wake);
    return { wake, set(p) { cur = p; } };
  },
};
