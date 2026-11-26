/* MindGarden · 花园伪3D 相机
 *
 * 核心是**真透视**：图层放在不同 Z 深度，相机推进时浏览器自己做透视缩放，
 * 而不是手动给每层算位移。所以纵深是"真的"，不是"感觉上像"。
 *
 * ── 相机数学（推导一次，后面都用它）────────────────────────
 *   .g3d-viewport { perspective: P }
 *   .g3d-camera   { transform: translate3d(cx, cy, cz) }
 *   .g3d-plane    { transform: translateZ(z) scale(s) }
 *
 *   屏幕上的偏移 = ((fx-0.5)·vw·s + cx) · A
 *   其中 A = P / (P - (z + cz)) 是透视放大率，fx 是景点在层内的横向占比。
 *
 *   要让景点居中（偏移=0），解得 **cx = -(fx-0.5)·vw·s** ——
 *   注意 A 被约掉了，所以 cx 与 cz 无关，可以先算 cx 再动画 cz，不会互相干扰。
 *   cz 取 **-z + ZOOM**：-z 让该层正好落到屏幕平面，ZOOM 再多推进一点当作"凑近看"。
 * ────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  const viewport = document.querySelector('.g3d-viewport');
  if (!viewport) return;
  const camera = viewport.querySelector('.g3d-camera');
  if (!camera) return;

  const P = parseFloat(getComputedStyle(viewport).perspective) || 1200;
  const ZOOM = 190;      // 聚焦时多推进的距离，制造"凑近看"的压迫感
  const EASE = 0.07;     // 跟随鼠标的缓动系数
  /* 自由环视幅度。原来只有 74px，实际几乎看不出场景在动 —— 调到 170 才有明显纵深 */
  const PAN = 170;

  /* 隐藏阈值。**这里踩过坑**：
     一开始写成"effective Z > -80 就隐藏"，结果近景层在静止机位时
     effective Z 正好是 0，恒大于 -80 → 糖果小屋和镜池被永久隐藏。
     正确语义是"**接近相机平面时才隐藏**"（否则会放大到无穷）。
     透视放大率 A = P/(P-eff)，取 eff = 0.62P 时 A≈2.6 倍，刚好在爆掉之前收掉。 */
  /* 素材画布相对构图区放大的倍数。
     ⚠️ 必须与素材实际倍数一致（见 工作稿/脚本/_expand_garden_canvas.py）。
     原来图层缩放正好等于视口，相机一平移就露出边缘（实测"鼠标晃快点
     就看到地图外面"）。放大 1.4 后每侧多出 20% 余量，环视才够用。
     注：景点坐标用的是"构图区占比"，画布放大后该占比会被 1/BLEED 抵消，
     所以 positionSpots 的投影公式不受影响，无需改动。 */
  const BLEED = 1.4;

  const HIDE_AT = 0.62;

  const planes = Array.from(camera.querySelectorAll('.g3d-plane')).map((el) => ({
    el,
    z: parseFloat(el.dataset.z || '0'),
    scale: 1,
  }));
  const spots = Array.from(viewport.querySelectorAll('.g3d-spot')).map((el) => ({
    el,
    z: parseFloat(el.dataset.z || '0'),
    fx: parseFloat(el.dataset.fx || '0.5'),
    fy: parseFloat(el.dataset.fy || '0.5'),
  }));

  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduceMotion = motionPreference.matches;
  const portrait = window.matchMedia('(max-aspect-ratio: 1/1)');
  const stage = camera.parentElement;

  let vw = 0, vh = 0;
  let camX = 0, camY = 0, camZ = 0;
  let wantX = 0, wantY = 0;
  let rafId = 0;
  let busy = false;          // 正在做聚焦动画时不响应自由环视

  /* 每层的基准 scale：让它在**静止机位**下正好铺满取景框。
     少了这一步，远层会缩成一小块。
     再乘 BLEED：素材画布比构图区大，不放大回来画面会偏小；
     放大后多出的余量正好供相机平移，避免露出边缘。 */
  function measure() {
    vw = Math.max(1, stage.clientWidth);
    vh = Math.max(1, stage.clientHeight);
    for (const p of planes) {
      // Sky needs less bleed: its distant plane only travels a fraction of
      // the foreground pan. Keep the sun within the illustrated frame.
      const bleed = p.z === -2600 ? 1.18 : BLEED;
      p.scale = ((P + Math.abs(p.z)) / P) * bleed;
      p.el.style.transform = 'translateZ(' + p.z + 'px) scale(' + p.scale + ')';
    }
  }

  /* 把每层的有效 Z 算出来，太贴近相机的层隐藏掉 ——
     否则"飞过去"之后那些层会以几十倍放大糊在镜头上。

     ⚠️ 这里**只切 class、不直接改 style.pointerEvents**：
     之前写 `p.el.style.pointerEvents = 'auto'` 会覆盖 CSS 里的
     `.g3d-plane { pointer-events: none }`，导致最近的层重新可点，
     把樱花树、艺术回廊的入口全挡住（实测就是点不动的原因）。
     现在隐藏态交给 CSS 的 .is-hidden 处理。 */
  function updateClipping() {
    for (const p of planes) {
      const eff = p.z + camZ;
      p.el.classList.toggle('is-hidden', eff > P * HIDE_AT);
    }
    updateDepthMeter();
  }

  function updateDepthMeter() {
    const dots = document.querySelectorAll('.g3d-depth-dots i');
    if (!dots.length) return;
    // 相机越往前，代表"离得越近"，点亮越多点
    const prog = Math.max(0, Math.min(1, camZ / 1900));
    const lit = Math.round(prog * dots.length);
    dots.forEach((d, i) => d.classList.toggle('on', i < lit));
  }

  /* 把景点入口投影到屏幕上。
   *
   * 为什么不把按钮直接放进 3D 层里：
   *   实测放进 perspective + preserve-3d 的层之后，中景/远景的按钮会被容器
   *   吃掉命中（elementFromPoint 返回 .g3d-camera），点了完全没反应。
   *   所以改成扁平层 + 自己算屏幕坐标：命中测试走普通 2D 路径，稳定可靠。
   *
   * 投影公式与相机推导一致：
   *   s = (P + |z|) / P                            该层的基准放大
   *   A = P / (P - (z + camZ))                     当前透视放大率
   *   屏幕坐标 = 视口中心 + ((fx-0.5)·vw·s + camX) · A
   */
  function positionSpots() {
    if (portrait.matches) return;  // In portrait the four links share a two-column dock.
    for (const sp of spots) {
      const s = (P + Math.abs(sp.z)) / P;
      const denom = P - (sp.z + camZ);
      const A = denom > 1 ? P / denom : 0;
      const x = vw / 2 + ((sp.fx - 0.5) * vw * s + camX) * A;
      const y = vh / 2 + ((sp.fy - 0.5) * vh * s + camY) * A;
      const hidden = A <= 0 || (sp.z + camZ) > P * HIDE_AT || x < -160 || x > vw + 160;
      sp.el.style.left = x.toFixed(1) + 'px';
      sp.el.style.top = y.toFixed(1) + 'px';
      // 远处标签不要缩得太小，否则看不清也难点（下限 0.78 实测手感合适）
      sp.el.style.transform =
        'translate(-50%,-50%) scale(' + Math.max(0.78, Math.min(A, 2.1)).toFixed(3) + ')';
      sp.el.style.opacity = hidden ? '0' : '1';
      sp.el.style.pointerEvents = hidden ? 'none' : 'auto';
    }
  }

  function applyCamera() {
    camera.style.transform =
      'translate3d(' + camX.toFixed(2) + 'px,' + camY.toFixed(2) + 'px,' + camZ.toFixed(2) + 'px)';
    updateClipping();
    positionSpots();
  }

  let idle = 0;
  function syncCameraLoop() {
    cancelAnimationFrame(rafId);
    rafId = !document.hidden && !reduceMotion && !portrait.matches ? requestAnimationFrame(tick) : 0;
  }
  function tick() {
    if (!busy && !reduceMotion && !portrait.matches) {
      idle += 0.0045;
      const gx = Math.sin(idle) * 0.34;
      const gy = Math.cos(idle * 0.77) * 0.22;
      camX += ((wantX + gx * PAN) - camX) * EASE;
      camY += ((wantY + gy * PAN * 0.5) - camY) * EASE;
      applyCamera();
    } else if (nearActive && !reduceMotion) {
      /* 近景打开时相机停住，但近景图层自己还有一套小视差：
         用 CSS 的 translate 属性（与 transform 独立），不和入场动画打架 */
      nearPx += (wantX - nearPx) * 0.06;
      nearPy += (wantY - nearPy) * 0.06;
      nearActive.querySelectorAll('[data-depth]').forEach((el) => {
        const d = parseFloat(el.dataset.depth || '0.2');
        el.style.translate = (nearPx * d * 0.14).toFixed(1) + 'px '
                           + (nearPy * d * 0.10).toFixed(1) + 'px';
      });
    }
    rafId = requestAnimationFrame(tick);
  }

  /* ---------- 自由环视 ---------- */
  function onPointerMove(e) {
    // busy（近景打开）时也要更新 wantX/wantY：近景视差在读它们
    const r = viewport.getBoundingClientRect();
    wantX = -((e.clientX - r.left) / r.width - 0.5) * 2 * PAN;
    wantY = -((e.clientY - r.top) / r.height - 0.5) * 2 * PAN * 0.5;
  }

  let touchStart = null;
  function onTouchStart(e) {
    const t = e.touches[0];
    if (t) touchStart = { x: t.clientX, y: t.clientY, cx: wantX, cy: wantY };
  }
  function onTouchMove(e) {
    if (busy || !touchStart) return;
    const t = e.touches[0];
    if (!t) return;
    wantX = Math.max(-PAN, Math.min(PAN, touchStart.cx + (t.clientX - touchStart.x) * 0.55));
    wantY = Math.max(-PAN * 0.5, Math.min(PAN * 0.5, touchStart.cy + (t.clientY - touchStart.y) * 0.4));
  }

  /* ---------- 近景场景（全景 ↔ 近景图层切换） ----------
     旧做法：相机一路推进扎进景点的平面图 —— 图被放大发虚，效果差。
     新做法：相机只轻推一小段，闪光切换，展开一张独立构图的近景卡片；
     确认「走进去」才真正跳转。两层是明确的两幅画面，切换一眼可辨。 */
  const nearRoot = document.getElementById('g3dNear');
  const spotPanel = viewport.querySelector('.g3d-spots');
  const nearScenes = Array.from(document.querySelectorAll('.g3d-near-scene'));
  const flash = document.querySelector('.g3d-flash');
  let nearActive = null;
  let returnTimer = 0;
  let nearPx = 0, nearPy = 0;

  function sceneFor(sp) {
    const href = sp.el.dataset.href;
    return nearScenes.find((s) => s.dataset.href === href) || null;
  }

  function openNear(scene) {
    nearActive = scene;
    nearPx = 0; nearPy = 0;
    if (flash && !reduceMotion) flash.classList.add('on');
    window.setTimeout(() => {
      if (nearActive !== scene) return;
      viewport.classList.add('near-open');
      spotPanel.inert = true;
      if (nearRoot) {
        nearRoot.classList.add('on');
        nearRoot.setAttribute('aria-hidden', 'false');
      }
      scene.classList.add('on');
      scene.setAttribute('aria-hidden', 'false');
      if (flash) window.setTimeout(() => flash.classList.remove('on'), 240);
      const enter = scene.querySelector('.g3d-near-enter');
      if (enter) enter.focus({ preventScroll: true });
    }, reduceMotion ? 0 : 200);
  }

  function closeNear() {
    if (!nearActive) return;
    const scene = nearActive;
    nearActive = null;
    if (flash && !reduceMotion) flash.classList.add('on');
    window.setTimeout(() => {
      viewport.classList.remove('near-open');
      spotPanel.inert = false;
      if (nearRoot) {
        nearRoot.classList.remove('on');
        nearRoot.setAttribute('aria-hidden', 'true');
      }
      scene.classList.remove('on');
      scene.setAttribute('aria-hidden', 'true');
      spots.find(sp => sp.el.dataset.href === scene.dataset.href)?.el.focus({ preventScroll: true });
      if (flash) window.setTimeout(() => flash.classList.remove('on'), 240);
      // 相机退回全景机位
      const dur = reduceMotion || portrait.matches ? 0 : 700;
      camera.style.transition = 'transform ' + dur + 'ms cubic-bezier(.30,.74,.18,1)';
      camX = 0; camY = 0; camZ = 0; wantX = 0; wantY = 0;
      applyCamera();
      returnTimer = window.setTimeout(() => {
        returnTimer = 0;
        camera.style.transition = '';
        busy = false;
      }, dur + 40);
    }, reduceMotion ? 0 : 180);
  }

  function enterNear(scene) {
    const href = scene.dataset.href;
    if (!href) return;
    const title = scene.querySelector('h2');
    const text = document.querySelector('.g3d-transit-text');
    if (text) text.textContent = '正在前往 · ' + (title ? title.textContent.trim() : '');
    document.querySelector('.g3d-transit')?.classList.add('on');
    window.setTimeout(() => { window.location.href = href; }, reduceMotion ? 60 : 720);
  }

  /* ---------- 聚焦某个景点：轻推镜头 → 切到近景 ---------- */
  function focusSpot(sp) {
    if (busy && !returnTimer) return;
    // The buttons are visible again while the camera is travelling home.
    // A new visit takes over that transition immediately.
    if (returnTimer) {
      window.clearTimeout(returnTimer);
      returnTimer = 0;
      camera.style.transition = '';
    }
    const scene = sceneFor(sp);
    if (!scene) { go(sp); return; }   // 没配近景的景点保持旧行为
    busy = true;

    if (reduceMotion || portrait.matches) {
      openNear(scene);
      return;
    }

    // 只推一半距离：够"凑近"即可，真正的画面切换交给近景层
    const z = sp.z;
    const s = (P + Math.abs(z)) / P;
    const tx = -(sp.fx - 0.5) * vw * s * 0.55;
    const ty = -(sp.fy - 0.5) * vh * s * 0.55;
    const tz = (-z + ZOOM) * 0.5;

    const dur = 780;
    camera.style.transition = 'transform ' + dur + 'ms cubic-bezier(.30,.74,.18,1)';
    camX = tx; camY = ty; camZ = tz;
    applyCamera();

    window.setTimeout(() => openNear(scene), dur - 60);
  }

  function go(sp) {
    const href = sp.el.dataset.href;
    if (!href) return;
    window.location.href = href;
  }

  /* ---------- 初始化 ---------- */
  function init() {
    measure();
    applyCamera();

    // 注意 sp 是数据对象（不是 DOM 元素），事件要绑在 sp.el 上 ——
    // 漏了 .el 会在初始化时抛 TypeError，导致后面全部中断
    // （入场光幕不消失、mode 也没设上，实测踩过）。
    spots.forEach((sp) => {
      sp.el.addEventListener('click', (e) => { e.preventDefault(); focusSpot(sp); });
    });

    // 近景场景：走进去 / 返回 / 点背景关闭 / Esc 关闭
    nearScenes.forEach((scene) => {
      scene.querySelector('.g3d-near-enter')?.addEventListener('click', () => enterNear(scene));
      scene.querySelector('.g3d-near-back')?.addEventListener('click', closeNear);
      scene.addEventListener('click', (e) => {
        if (e.target === scene || e.target.classList.contains('g3d-near-bg')) closeNear();
      });
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nearActive) closeNear();
    });

    document.documentElement.dataset.g3dMode = reduceMotion ? 'reduced' : 'active';

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    viewport.addEventListener('touchstart', onTouchStart, { passive: true });
    viewport.addEventListener('touchmove', onTouchMove, { passive: true });

    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (portrait.matches && !busy) camX = camY = wantX = wantY = 0;
        measure();
        applyCamera();
      }, 100);
    }, { passive: true });

    document.addEventListener('visibilitychange', syncCameraLoop);
    portrait.addEventListener('change', syncCameraLoop);

    motionPreference.addEventListener('change', () => {
      reduceMotion = motionPreference.matches;
      document.documentElement.dataset.g3dMode = reduceMotion ? 'reduced' : 'active';
      if (!busy) {
        camX = camY = wantX = wantY = 0;
        applyCamera();
      }
      syncCameraLoop();
    });
    syncCameraLoop();

    // 入场：相机从远处推进来，配一层柔光遮罩淡出
    const veil = document.querySelector('.g3d-enter-veil');
    if (reduceMotion || portrait.matches) {
      veil?.remove();
      return;
    }
    if (veil) {
      camZ = -980;
      applyCamera();
      window.requestAnimationFrame(() => {
        camera.style.transition = 'transform 1500ms cubic-bezier(.22,.72,.18,1)';
        camZ = 0;
        applyCamera();
        veil.classList.add('gone');
        window.setTimeout(() => { camera.style.transition = ''; veil.remove(); }, 1700);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 供本地验收脚本读取，不暴露用户数据
  window.__garden3d = {
    ready: true,
    cam: () => ({ x: camX, y: camY, z: camZ }),
    planes: () => planes.map((p) => ({
      z: p.z, scale: p.scale,
      hidden: p.el.classList.contains('is-hidden'),
      transform: p.el.style.transform,
    })),
    focus: (i) => spots[i] && focusSpot(spots[i]),
    near: () => (nearActive ? nearActive.dataset.scene : null),
    closeNear: () => closeNear(),
    mode: () => document.documentElement.dataset.g3dMode,
    perspective: P,
  };
})();
