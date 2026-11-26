/* Animated details are registered to source-image pixels. The overlay uses the
 * same cover crop as its image, so camera transforms and card resizing stay in sync.
 * The panorama masters use a 3584 × 2016 artboard, detail cards use 1536 × 1024.
 */
(() => {
  'use strict';

  // Each water jet is a quadratic Bézier: nozzle, control point, landing point.
  // The local coordinate frame is the artist's crop (box) measured at view size.
  const art = {
    cute: {
      // Water surface and occluders (pedestal/duck), in the same local coordinates as the jets.
      pool: [[210, 258, 124, 30], [207, 229, 34, 25], [246, 266, 25, 19]],
      detailPool: [[216, 144, 157, 18], [226, 113, 37, 43], [165, 143, 16, 17]],
      clock: [802, 452, 69, 77],
      sun: [2728, 363, 99],
      water: {box: [2180, 825, 850, 1010], view: [370, 440], jets: [
        [198, 33, 162, -17, 144, 118], [214, 34, 258, -10, 276, 122],
        [161, 150, 135, 147, 117, 244], [178, 154, 155, 157, 151, 261],
        [239, 153, 258, 144, 268, 251], [287, 145, 308, 149, 313, 247]
      ]},
      detail: [[209, 33, 161, -46, 124, 142], [239, 36, 289, -48, 340, 143],
               [199, 38, 155, -11, 128, 145], [240, 38, 264, -2, 269, 137]]
    },
    fresh: {
      pool: [[209, 169, 88, 12], [211, 143, 22, 21]],
      detailPool: [[258, 231, 214, 75], [314, 148, 31, 43], [8, 254, 78, 41]],
      clock: [852, 874, 25, 25],
      sun: [3086, 496, 57],
      water: {box: [2120, 840, 930, 1000], view: [394, 424], jets: [
        [202, 68, 161, -8, 135, 160], [214, 67, 251, -10, 278, 160],
        [175, 79, 173, 104, 175, 157], [243, 78, 241, 115, 241, 157]
      ]},
      detail: [[312, 67, 297, 6, 296, 69], [312, 67, 328, 16, 333, 68],
               [220, 72, 213, 111, 205, 187], [242, 73, 232, 114, 231, 177],
               [362, 75, 371, 116, 368, 168]]
    },
    ugly: {
      pool: [[191, 282, 102, 23], [189, 256, 23, 27], [225, 281, 22, 23]],
      detailPool: [[205, 156, 148, 25], [222, 105, 49, 61], [151, 164, 29, 24]],
      clock: [700, 917, 41, 46],
      // The original already has eyes. During a blink, sample adjacent paper
      // from the same image to lift the printed eyes and compress their shapes.
      sun: [2870, 478, 140],
      water: {box: [2110, 1140, 550, 670], view: [361, 440], jets: [
        [193, 133, 189, 68, 149, 110], [194, 133, 204, 75, 220, 100],
        [150, 211, 125, 215, 115, 287], [240, 208, 266, 214, 272, 285]
      ]},
      detail: [[233, 45, 209, -32, 157, 135], [240, 43, 276, -31, 296, 139],
               [168, 103, 113, 75, 98, 159], [275, 115, 314, 86, 334, 164],
               [211, 140, 207, 155, 204, 174]]
    }
  };

  const viewport = document.querySelector('.g3d-viewport');
  if (!viewport) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const layers = [];
  const colors = getComputedStyle(document.documentElement);
  const ink = colors.getPropertyValue('--mg-ink').trim() || '#433e36';
  const paper = colors.getPropertyValue('--mg-paper').trim() || '#fff6df';
  const accent = colors.getPropertyValue('--mg-accent').trim() || '#a46e55';
  let frame = 0;
  let timeout = 0;
  let pointer = null;
  let pointerMoved = false;
  const wakeDuration = 1050;

  function ellipse(ctx, x, y, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function stroke(ctx, x, y, endX, endY, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  function paintClock(ctx, rx, ry, date) {
    // Preserve the stone bezel. Only the dial and the original fixed hands are covered.
    ctx.save();
    ctx.translate(rx + 2, ry + 2);
    ctx.scale(rx, ry);
    ellipse(ctx, 0, 0, 1, 1, paper);
    for (let hour = 0; hour < 12; hour++) {
      const a = Math.PI * hour / 6;
      const x = Math.sin(a), y = -Math.cos(a);
      stroke(ctx, x * .82, y * .82, x * .94, y * .94, hour % 3 ? .032 : .065, ink);
    }
    ctx.lineCap = 'round';
    const seconds = date.getSeconds(), minutes = date.getMinutes() + seconds / 60;
    const hands = [[(date.getHours() + minutes / 60) / 12, .51, .09, ink],
                   [minutes / 60, .74, .055, ink]];
    if (!motion.matches) hands.push([seconds / 60, .81, .032, accent]);
    for (const [turn, length, width, color] of hands) {
      const angle = turn * Math.PI * 2;
      stroke(ctx, 0, 0, Math.sin(angle) * length, -Math.cos(angle) * length, width, color);
    }
    ellipse(ctx, 0, 0, .077, .077, ink);
    ctx.restore();
  }

  function paintSun(layer, openness) {
    const {ctx, image, theme, view, gazeX, gazeY} = layer;
    const radius = view[0] / 2;
    if (theme === 'ugly') {
      if (openness === 1 && !gazeX && !gazeY) return;
      const sx = image.naturalWidth / 3584, sy = image.naturalHeight / 2016;
      for (const [x, y] of [[2779, 484], [2960, 476]]) {
        const left = x - 19, top = y - 21;
        const dx = left - layer.box[0], dy = top - layer.box[1];
        ctx.drawImage(image, left * sx, (top - 43) * sy, 38 * sx, 42 * sy, dx, dy, 38, 42);
        const height = Math.max(5, 42 * openness);
        ctx.drawImage(image, left * sx, top * sy, 38 * sx, 42 * sy,
                      dx + gazeX, dy + (42 - height) / 2 + gazeY, 38, height);
      }
      return;
    }
    const eyeY = radius * .84;
    for (const x of [.50, 1.50]) {
      ellipse(ctx, x * radius + gazeX, eyeY + gazeY, radius * .102, radius * (.034 + .113 * openness), ink);
    }
    ctx.strokeStyle = ink;
    ctx.lineCap = 'round';
    ctx.lineWidth = radius * .06;
    ctx.beginPath();
    ctx.moveTo(.78 * radius, 1.22 * radius);
    ctx.quadraticCurveTo(radius, 1.47 * radius, 1.22 * radius, 1.22 * radius);
    ctx.stroke();
  }

  function paintWater(ctx, jets, seconds) {
    ctx.lineCap = 'round';
    jets.forEach(([x, y, cx, cy, endX, endY], index) => {
      const phase = seconds * (.74 + index * .055) + index * .37;
      const crestY = cy + 3.6 * Math.sin(seconds * 2.7 + index);
      // A continuous strand with smaller glints advecting towards the pool.
      ctx.strokeStyle = paper;
      ctx.globalAlpha = .56;
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(cx, crestY, endX, endY);
      ctx.stroke();
      ctx.globalAlpha = .95;
      ctx.lineWidth = 2.8;
      for (let i = 0; i < 6; i++) {
        const t = (phase + i / 6) % 1;
        const v = 1 - t;
        const px = v*v*x + 2*v*t*cx + t*t*endX;
        const py = v*v*y + 2*v*t*crestY + t*t*endY;
        const dt = .026;
        stroke(ctx, px, py, px + 2*dt*(v*(cx-x) + t*(endX-cx)),
               py + 2*dt*(v*(crestY-y) + t*(endY-crestY)), 2.8, paper);
      }
      for (let ring = 0; ring < 2; ring++) {
        const t = (phase + ring * .5) % 1;
        ctx.globalAlpha = .78 * (1 - t);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(endX, endY, 2 + 13*t, 1 + 3.7*t, 0, 0, 2*Math.PI);
        ctx.stroke();
        const dir = ring ? 1 : -1;
        ellipse(ctx, endX + dir * 9*t, endY - 33*t*(1-t), 1.3, 1.7, paper);
      }
    });
    ctx.globalAlpha = 1;
  }

  // The camera translates and scales each plane. Using the projected canvas rect
  // also accounts for object-fit cropping and the independently moving close-up.
  function pointerInArt(layer) {
    if (!pointer) return null;
    const r = layer.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {x: (pointer.x - r.left) / r.width * layer.view[0],
            y: (pointer.y - r.top) / r.height * layer.view[1]};
  }

  function insideOval(point, [cx, cy, rx, ry]) {
    return ((point.x - cx) / rx) ** 2 + ((point.y - cy) / ry) ** 2 < 1;
  }

  function disturbWater(layer, point, now) {
    const [surface, ...obstacles] = layer.pool;
    if (!point || !insideOval(point, surface) || obstacles.some(oval => insideOval(point, oval))) {
      layer.lastTouch = null;
      return;
    }
    const last = layer.lastTouch;
    const distance = last ? Math.hypot(point.x - last.x, point.y - last.y) : 0;
    if (last && (distance < 8 || now - last.time < 110)) return;
    const size = last ? 23 + Math.min(16, 50 * distance / (now - last.time)) : 24;
    const ring = {...point, time: now, size};
    layer.lastTouch = ring;
    layer.ripples.push(ring);
    if (layer.ripples.length > 6) layer.ripples.shift();
  }

  function paintRipples(layer, now) {
    const {ctx, ripples} = layer;
    while (ripples.length && now - ripples[0].time >= wakeDuration) ripples.shift();
    if (!ripples.length) return;
    ctx.save();
    ctx.clip(layer.surface);
    ctx.clip(layer.clearWater, 'evenodd');
    for (const ring of ripples) {
      const life = (now - ring.time) / wakeDuration;
      const radius = 3 + (1 - (1-life)**2) * ring.size;
      // A light crest beside a thin dark trough also reads on pale printed water.
      for (const [band, color, weight] of [[1, ink, .95], [.86, paper, 1.7]]) {
        ctx.globalAlpha = (1-life) * (1-life) * .90;
        ctx.strokeStyle = color;
        ctx.lineWidth = weight;
        ctx.beginPath();
        ctx.ellipse(ring.x, ring.y, radius * band, radius * .29 * band, 0, 0, 2*Math.PI);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function followGaze(current, target) {
    if (motion.matches) return 0;
    const next = Math.abs(target - current) < .2 ? target : current + .3 * (target - current);
    return Math.round(next * 10) / 10;
  }

  function draw(layer, now, date) {
    const {ctx, canvas, view, type} = layer;
    if (!canvas.width || !canvas.height) return;
    let gazeChanged = false;
    if (type === 'sun') {
      const point = !motion.matches && pointerInArt(layer);
      const radius = view[0] / 2;
      const dx = point ? (point.x-radius)/radius : 0;
      const dy = point ? (point.y-radius)/radius : 0;
      const reach = Math.max(0, Math.min(1, 2 - Math.hypot(dx, dy)));
      const gx = followGaze(layer.gazeX, radius * .12 * dx * reach);
      const gy = followGaze(layer.gazeY, radius * .08 * dy * reach);
      gazeChanged = gx !== layer.gazeX || gy !== layer.gazeY;
      layer.gazeX = gx;
      layer.gazeY = gy;
    }
    const blinkTime = (now / 1000 + 2.85) % 4.8;
    const openness = motion.matches ? 1 : Math.min(1, Math.abs(blinkTime - 4.42) / .14);
    const state = type === 'clock' ? Math.floor(date.getTime() / (motion.matches ? 60000 : 1000))
                : type === 'sun' ? openness : motion.matches ? 0 : now;
    if (!gazeChanged && layer.lastState === state) return;
    layer.lastState = state;
    ctx.setTransform(canvas.width / view[0], 0, 0, canvas.height / view[1], 0, 0);
    ctx.clearRect(0, 0, ...view);
    if (type === 'clock') paintClock(ctx, ...layer.dial, date);
    else if (type === 'sun') paintSun(layer, openness);
    else if (!motion.matches) {
      if (pointerMoved) disturbWater(layer, pointerInArt(layer), now);
      paintWater(ctx, layer.jets, now / 1000);
      paintRipples(layer, now);
    }
  }

  function render(now) {
    frame = 0;
    if (document.hidden) return;
    const closeup = viewport.classList.contains('near-open');
    const date = new Date();
    let visible = false;
    for (const layer of layers) {
      if (layer.scene ? !closeup || !layer.scene.classList.contains('on') : closeup) continue;
      draw(layer, now, date);
      visible = true;
    }
    pointerMoved = false;
    if (visible) {
      // The reduced-motion view keeps local time with minute-boundary updates.
      const delay = motion.matches ? 60000 - date.getTime() % 60000 : 24;
      timeout = window.setTimeout(schedule, delay);
    }
  }

  function schedule() {
    clearTimeout(timeout);
    cancelAnimationFrame(frame);
    frame = document.hidden ? 0 : requestAnimationFrame(render);
  }

  function register(image) {
    const type = image.dataset.gardenEffect;
    const theme = document.documentElement.dataset.theme || 'cute';
    const config = art[theme];
    const detail = type === 'water-detail';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.className = 'g3d-live-art';
    canvas.setAttribute('aria-hidden', 'true');
    image.after(canvas);

    const layer = {type, image, theme, canvas, ctx, scene: image.closest('.g3d-near-scene')};
    if (type === 'clock') {
      const [x, y, rx, ry] = config.clock;
      layer.box = [x-rx-2, y-ry-2, 2*rx+4, 2*ry+4];
      layer.dial = [rx, ry];
    } else if (type === 'sun') {
      const [x, y, r] = config.sun;
      layer.box = [x-r, y-r, r*2, r*2];
      layer.gazeX = layer.gazeY = 0;
    } else if (detail) {
      layer.box = [0, 0, 1536, 1024];
      layer.view = [394, 263];
      layer.jets = config.detail;
    } else {
      Object.assign(layer, config.water);
    }
    layer.view ||= layer.box.slice(2);
    if (type === 'water' || detail) {
      layer.pool = detail ? config.detailPool : config.pool;
      layer.ripples = [];
      layer.surface = new Path2D();
      layer.surface.ellipse(...layer.pool[0], 0, 0, 2*Math.PI);
      layer.clearWater = new Path2D();
      layer.clearWater.rect(0, 0, ...layer.view);
      for (const [cx, cy, rx, ry] of layer.pool.slice(1)) {
        layer.clearWater.moveTo(cx + rx, cy);
        layer.clearWater.ellipse(cx, cy, rx, ry, 0, 0, 2*Math.PI);
      }
    }
    layers.push(layer);
    // Observe the image content box. getBoundingClientRect includes perspective
    // and would apply the camera zoom twice; clientWidth/Height are in local pixels.
    const resize = () => {
      const width = image.clientWidth, height = image.clientHeight;
      const masterW = detail ? 1536 : 3584, masterH = detail ? 1024 : 2016;
      const fit = Math.max(width / masterW, height / masterH);
      const [x, y, w, h] = layer.box;
      const cssW = w*fit, cssH = h*fit;
      // The sky favors its upper-right corner to keep the sun in view.
      const positionX = type === 'sun' ? 1 : .5;
      const positionY = type === 'sun' ? 0 : .5;
      Object.assign(canvas.style, {
        left: (image.offsetLeft + (width - masterW*fit)*positionX + x*fit) + 'px',
        top: (image.offsetTop + (height - masterH*fit)*positionY + y*fit) + 'px',
        width: cssW + 'px', height: cssH + 'px'
      });
      const density = Math.min(2.5, Math.max(1.5, window.devicePixelRatio));
      canvas.width = Math.max(1, Math.round(cssW * density));
      canvas.height = Math.max(1, Math.round(cssH * density));
      layer.lastState = null;
      schedule();
    };
    new ResizeObserver(resize).observe(image);
    resize();
  }

  viewport.querySelectorAll('img[data-garden-effect]').forEach(image => {
    if (image.complete && image.naturalWidth) register(image);
    else image.addEventListener('load', () => register(image), {once: true});
  });
  function releasePointer() {
    pointer = null;
    pointerMoved = true;
    for (const layer of layers) layer.lastTouch = null;
  }
  viewport.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || motion.matches ||
        event.target.closest('.g3d-hud,.g3d-near-copy,.g3d-spot-label,.g3d-spot-hint')) {
      if (pointer) releasePointer();
      return;
    }
    pointer = {x: event.clientX, y: event.clientY};
    pointerMoved = true;
  }, {passive: true});
  viewport.addEventListener('pointerleave', releasePointer);
  viewport.addEventListener('pointercancel', releasePointer);
  window.addEventListener('blur', releasePointer);

  // Keyboard visitors get the same single swell through the existing fountain
  // entrance. Decorative art does not add extra stops to the navigation order.
  viewport.addEventListener('focusin', event => {
    if (motion.matches || !event.target.matches(':focus-visible')) return;
    const detail = event.target.closest('[data-scene="fountain"] .g3d-near-enter');
    if (!detail && !event.target.closest('[data-water-entry]')) return;
    const water = layers.find(layer => layer.type === (detail ? 'water-detail' : 'water'));
    if (!water) return;
    const [cx, cy, rx] = water.pool[0];
    water.lastTouch = null;
    disturbWater(water, {x: cx - .55 * rx, y: cy}, performance.now());
  });
  new MutationObserver(() => {
    releasePointer();
    schedule();
  }).observe(viewport, {attributes: true, attributeFilter: ['class']});
  viewport.addEventListener('garden:view', () => { releasePointer(); schedule(); });
  motion.addEventListener('change', () => {
    releasePointer();
    layers.forEach(layer => {
      layer.lastState = null;
      if (layer.ripples) layer.ripples.length = 0;
    });
    schedule();
  });
  document.addEventListener('visibilitychange', () => {
    releasePointer();
    schedule();
  });
})();
