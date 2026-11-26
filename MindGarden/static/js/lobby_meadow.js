// The foreground is drawn in small groups, like separate blocks of a print.
// Each shape is rooted at (0, 0); its tip is roughly one hundred units above it.
(() => {
  'use strict';
  const meadow = document.getElementById('lobbyMeadow');
  const garden = document.getElementById('homeGarden');
  if (!meadow || !garden) return;
  const ctx = meadow.getContext('2d');
  if (!ctx) return;

  const sprigs = {
    bent: new Path2D('M-2 4 Q0 -26 -13 -51 Q-19 -66 -32 -76 Q-17 -70 -5 -47 L-1 -41 Q-1 -80 12 -99 Q6 -76 7 -58 Q7 -36 4 -24 Q17 -49 34 -58 Q13 -38 8 -16 L5 3 Z'),
    reed: new Path2D('M-3 3 Q-9 -25 -26 -47 Q-34 -58 -35 -64 Q-20 -55 -9 -38 L-3 -28 Q-6 -57 -12 -77 L-16 -92 Q-2 -73 1 -48 Q2 -62 9 -75 Q21 -95 32 -98 Q18 -86 14 -66 Q12 -40 5 -22 L6 -20 Q18 -39 34 -43 Q18 -29 9 -7 L6 3 Z'),
    curl: new Path2D('M-3 4 Q-9 -17 -22 -27 Q-36 -39 -48 -34 Q-43 -43 -32 -42 Q-16 -40 -7 -26 Q-15 -53 -7 -79 Q-4 -92 8 -100 Q0 -85 1 -73 Q-2 -50 1 -38 Q9 -67 31 -77 Q16 -59 14 -47 Q10 -22 5 1 Z'),
    field: new Path2D('M-3 3 Q-5 -18 -12 -26 Q-27 -29 -32 -44 Q-16 -42 -9 -30 Q-14 -54 -2 -85 L2 -100 L5 -83 Q-5 -56 -4 -47 Q6 -56 17 -55 Q16 -41 -5 -35 Q-1 -16 3 -10 Q5 -22 20 -27 Q18 -15 6 -10 L5 3 Z'),
    stem: new Path2D('M-2 3 Q1 -21 -6 -37 Q-18 -39 -25 -51 Q-12 -52 -5 -40 Q-11 -65 -3 -85 L-1 -94 L1 -93 Q-6 -71 -6 -58 Q-3 -66 8 -68 Q7 -56 -5 -51 Q-4 -36 1 -23 Q4 -33 14 -35 Q13 -25 3 -20 L2 2 Z'),
    // The two blossoms have deliberately different silhouettes and perspectives.
    daisy: new Path2D('M-2 -92 C-10 -89 -18 -91 -16 -95 Q-15 -99 -6 -98 Q-15 -102 -13 -107 Q-10 -111 -4 -103 Q-6 -114 -2 -114 Q2 -115 2 -104 Q7 -113 10 -111 Q14 -108 6 -100 Q15 -104 18 -101 Q19 -97 9 -94 Q16 -92 13 -89 Q8 -87 3 -92 Q3 -88 0 -87 Q-2 -87 -2 -92 Z'),
    cup: new Path2D('M-1 -91 Q-12 -92 -19 -107 Q-14 -109 -8 -103 Q-13 -114 -6 -113 L-1 -105 Q-2 -116 4 -116 L5 -105 Q12 -115 16 -112 Q16 -106 11 -100 L18 -104 Q14 -93 4 -91 Q2 -89 -1 -91 Z'),
    pollen: new Path2D('M-5 -97 Q-2 -102 3 -99 Q7 -98 5 -94 Q3 -91 -2 -93 Q-6 -93 -5 -97 Z'),
    bud: new Path2D('M-2 -92 Q-12 -99 -10 -108 Q-4 -112 0 -101 Q0 -109 4 -111 Q10 -105 6 -98 L1 -92 Z'),
    leafCut: new Path2D('M-1 -12 Q0 -38 4 -50 Q2 -28 2 -17 Z'),
    grain: new Path2D('M-9 -38 L-14 -50 L-9 -41 Z M-11 -45 L-15 -54 L-13 -47 Z M1 -28 Q0 -46 3 -55 L2 -43 Z M3 -55 L6 -68 L4 -57 Z M8 -34 Q13 -49 21 -56 L15 -45 Z M13 -45 L20 -56 L14 -47 Z')
  };

  // Layout of the groups across the page, with a few low strays in the middle.
  // Each row supplies its centre, spread, height, and number of stalks.
  const patches = [
    [.014, .036, .79, 6], [.095, .051, .94, 8], [.185, .033, .49, 5],
    [.259, .039, .67, 5], [.331, .029, .33, 4], [.448, .024, .15, 2],
    [.566, .026, .19, 3], [.672, .040, .38, 4], [.750, .033, .64, 5],
    [.834, .042, .45, 5], [.918, .053, .91, 9], [.992, .025, .68, 4]
  ];
  const bladeNames = ['bent', 'reed', 'curl', 'field'];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0, height = 0, pixelRatio = 1;
  let plants = [], colors = {}, pointer = null;
  let raf = 0, lastFrame = 0, inView = true;

  function readInks() {
    const style = getComputedStyle(meadow);
    const ink = name => style.getPropertyValue('--meadow-' + name).trim();
    colors = {leaf: ink('leaf'), ink: ink('ink'), paper: ink('paper'), petal: ink('petal')};
  }

  function plantMeadow() {
    // A reproducible seed keeps the same flowers in place after a resize.
    let seed = 73211;
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    plants = [];
    const plantScale = Math.min(height, Math.max(92, width * .24), 205);
    for (const [centre, spread, tall, count] of patches) {
      const density = width < 560 ? .55 : 1;
      const n = Math.max(1, Math.round(count * density));
      for (let i = 0; i < n; i++) {
        const t = (i + random() * .65) / n;
        const root = centre + (t * 2 - 1) * spread;
        const size = plantScale * tall * (.43 + random() * .54);
        const back = i % 4 === 2;
        const flower = tall > .37 && (i === 1 || (i === 4 && n > 6));
        const kind = flower ? 'stem' : bladeNames[Math.floor(random() * bladeNames.length)];
        const blossoms = ['cup', 'daisy', 'bud'];
        const blossom = flower ? blossoms[Math.floor(random() * blossoms.length)] : null;
        plants.push({
          x: root * width, y: height + size * (.02 + random() * .07),
          size, kind, blossom, back,
          angle: (t - .49) * .56 + (random() - .5) * .28,
          flip: (random() > .51 ? 1 : -1) * (.70 + random() * .46),
          phase: random() * 6.28, speed: .88 + random() * .35,
          pushed: 0, bend: 0, velocity: 0
        });
      }
    }
    plants.sort((a, b) => Number(b.back) - Number(a.back) || b.size - a.size);
  }

  function fill(path, color) {
    ctx.fillStyle = color;
    ctx.fill(path);
  }

  function draw(when, dt) {
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const seconds = when / 1000;
    for (const p of plants) {
      let wind = 0;
      if (!motion.matches) {
        wind = .030 * Math.sin(seconds * 1.04 + p.x * .009)
             + .020 * Math.sin(seconds * 1.71 * p.speed + p.phase);
        p.pushed *= Math.exp(-dt * 4.6);
        p.velocity += ((p.pushed - p.bend) * 135 - p.velocity * 8.4) * dt;
        p.bend += p.velocity * dt;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle + wind + p.bend);
      ctx.scale(p.size / 100 * p.flip, p.size / 100);
      const stalkInk = p.back || p.kind === 'field' ? colors.ink : colors.leaf;
      fill(sprigs[p.kind], stalkInk);
      if (p.blossom) {
        fill(sprigs[p.blossom], p.blossom === 'daisy' ? colors.paper : colors.petal);
        if (p.blossom !== 'bud') fill(sprigs.pollen, p.blossom === 'daisy' ? colors.petal : colors.ink);
      } else if (p.size > 60) {
        // Small interrupted cuts follow the grain of the larger printed blades.
        ctx.clip(sprigs[p.kind]);
        const cut = stalkInk === colors.ink ? colors.leaf : colors.ink;
        if (p.kind === 'bent') fill(sprigs.leafCut, cut);
        fill(sprigs.grain, cut);
      }
      ctx.restore();
    }
  }

  function frame(now) {
    raf = 0;
    if (document.hidden || !inView || !width || !height) return;
    // Limited frame rate leaves room for the larger sun and sky transition.
    if (!lastFrame || now - lastFrame >= 30 || motion.matches) {
      const dt = Math.min((now - lastFrame) / 1000, .04);
      draw(now, dt);
      lastFrame = now;
    }
    if (!motion.matches) raf = requestAnimationFrame(frame);
  }

  function refresh() {
    cancelAnimationFrame(raf);
    lastFrame = 0;
    raf = requestAnimationFrame(frame);
  }
  function resize() {
    const w = meadow.clientWidth, h = meadow.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    if (w === width && h === height && pixelRatio === ratio) return;
    width = w; height = h; pixelRatio = ratio;
    meadow.width = Math.round(w * ratio);
    meadow.height = Math.round(h * ratio);
    pointer = null;
    plantMeadow();
    refresh();
  }

  function brush(event) {
    if (motion.matches || !inView) return;
    const rect = meadow.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    const now = event.timeStamp;
    if (y < -10 || y > height + 8 || x < 0 || x > width) {
      pointer = null;
      return;
    }
    // Use the segment between successive samples so a fast sweep contacts
    // every stalk it crossed, even when the browser coalesces pointer events.
    const recent = pointer && now - pointer.time < 120;
    const fromX = recent ? pointer.x : x, fromY = recent ? pointer.y : y;
    const dx = x - fromX, dy = y - fromY, distance2 = dx * dx + dy * dy;
    for (const p of plants) {
      const tipX = p.x + Math.sin(p.angle) * p.size * .64;
      const t = distance2 ? Math.max(0, Math.min(1, ((tipX - fromX) * dx + (p.y - p.size * .60 - fromY) * dy) / distance2)) : 1;
      const atX = fromX + t * dx, atY = fromY + t * dy;
      const vertical = Math.max(0, p.y - p.size * 1.13 - atY, atY - p.y);
      const radius = Math.min(67, 25 + p.size * .27);
      const reach = 1 - Math.hypot(tipX - atX, vertical * 1.4) / radius;
      if (reach <= 0) continue;
      const direction = Math.abs(dx) > 2 ? Math.sign(dx) : (Math.sign(tipX - atX) || 1);
      p.pushed = direction * (.42 + Math.min(.53, Math.abs(dx) / 40)) * Math.sqrt(reach);
      // An immediate impulse makes a quick brush legible before the spring settles.
      p.velocity = Math.max(-6, Math.min(6, p.velocity + p.pushed * .8));
    }
    pointer = {x, y, time: now};
  }

  readInks();
  resize();
  new ResizeObserver(resize).observe(meadow);
  window.addEventListener('resize', resize, {passive: true});
  const palette = new MutationObserver(() => { readInks(); refresh(); });
  palette.observe(garden, {attributes: true, attributeFilter: ['data-period']});
  palette.observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
  new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    refresh();
  }).observe(meadow);
  garden.addEventListener('pointerdown', brush, {passive: true});
  garden.addEventListener('pointermove', brush, {passive: true});
  garden.addEventListener('pointerleave', () => { pointer = null; });
  garden.addEventListener('pointercancel', () => { pointer = null; });
  motion.addEventListener('change', () => {
    pointer = null;
    for (const p of plants) p.pushed = p.bend = p.velocity = 0;
    refresh();
  });
  document.addEventListener('visibilitychange', refresh);
})();
