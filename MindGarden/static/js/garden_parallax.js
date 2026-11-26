/* MindGarden · 花园伪3D 视差驱动
 *
 * 原理：把花园拆成五层，鼠标/手指/手机倾斜时各层按不同幅度平移 ——
 * 近层动得多、远层动得少，大脑据此读出纵深。
 *
 * 三个设计取舍：
 *   1. **缓动而非跟随**：直接跟鼠标会很"飘"，这里用 rAF 做指数逼近，手感更沉。
 *   2. **待机微漂移**：没有输入时也缓慢游走，画面不会"死"。
 *   3. **尊重 prefers-reduced-motion**：前庭敏感的用户直接关掉位移。
 */
(function () {
  'use strict';

  const stage = document.querySelector('.parallax-stage');
  if (!stage) return;

  const layers = Array.from(stage.querySelectorAll('.plx-layer'));
  if (!layers.length) return;

  // 每层的位移幅度（CSS 里的 data-depth 只是标注，真正算的是这个公式）
  const items = layers.map((el) => ({
    el,
    depth: parseFloat(el.dataset.depth || '0.2'),
    x: 0,
    y: 0,
    scale: 1,
  }));

  const MAX_SHIFT_BASE = 46;   // 桌面端最大位移基数（像素）
  const MAX_SHIFT_RATIO = 0.045; // 窄屏按宽度收缩，避免位移超过放大余量
  const IDLE_SPEED = 0.00022;  // 待机漂移速度
  const EASE = 0.075;          // 指数逼近系数，越小越"重"
  let maxShift = MAX_SHIFT_BASE;

  /**
   * 量取舞台尺寸，算出每层需要的放大量。
   *
   * ⚠️ 这里有个容易踩的坑：图层做了 translate 之后，如果放大不足以覆盖位移，
   *    一移就会在边缘露出底色。居中缩放 S 后每侧多出 width*(S-1)/2，
   *    只要它 ≥ 该层位移量就不会穿帮，所以 S 必须**由位移量反推**，
   *    不能写死一个固定值（实测写死 1.035 时最深层会露边）。
   */
  function measure() {
    const rect = stage.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    maxShift = Math.min(MAX_SHIFT_BASE, Math.max(10, w * MAX_SHIFT_RATIO));
    for (const it of items) {
      const shiftX = maxShift * it.depth;
      const shiftY = shiftX * 0.55;          // 纵向位移比横向小
      const needX = 1 + (2 * shiftX) / w;
      const needY = 1 + (2 * shiftY) / h;
      it.scale = Math.max(needX, needY) + 0.012; // +1.2% 余量
    }
  }

  const reduceMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let targetX = 0, targetY = 0;   // 归一化 -1 ~ 1
  let currentX = 0, currentY = 0;
  let tiltX = 0, tiltY = 0;
  let hasInput = false;
  let rafId = 0;

  function setTargetFromPointer(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    targetX = ((clientX - rect.left) / rect.width - 0.5) * 2;
    targetY = ((clientY - rect.top) / rect.height - 0.5) * 2;
    targetX = Math.max(-1, Math.min(1, targetX));
    targetY = Math.max(-1, Math.min(1, targetY));
    hasInput = true;
  }

  function apply() {
    const t = performance.now() * IDLE_SPEED;
    // 无输入时用正弦漂移生成目标，有输入时用指针位置
    const gx = hasInput ? targetX : Math.sin(t) * 0.32;
    const gy = hasInput ? targetY : Math.cos(t * 0.78) * 0.20;

    // 手机倾斜叠加（力度比指针小，避免和触摸打架）
    const mixX = Math.max(-1, Math.min(1, gx + tiltX * 0.55));
    const mixY = Math.max(-1, Math.min(1, gy + tiltY * 0.55));

    currentX += (mixX - currentX) * EASE;
    currentY += (mixY - currentY) * EASE;

    for (const it of items) {
      const dx = -currentX * maxShift * it.depth;
      const dy = -currentY * maxShift * it.depth * 0.55;
      it.el.style.transform =
        'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0) scale(' + it.scale.toFixed(4) + ')';
    }
    rafId = requestAnimationFrame(apply);
  }

  function start() {
    if (rafId) return;
    rafId = requestAnimationFrame(apply);
  }

  function stop() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function onPointerMove(e) {
    if (e.pointerType === 'touch') return; // 触摸屏用拖动/倾斜，不跟随手指悬浮
    setTargetFromPointer(e.clientX, e.clientY);
  }

  function onTouchMove(e) {
    const t = e.touches && e.touches[0];
    if (!t) return;
    setTargetFromPointer(t.clientX, t.clientY);
  }

  function onTilt(e) {
    if (e.gamma == null || e.beta == null) return;
    // gamma: 左右倾斜(-90~90)，beta: 前后(-180~180)。取小系数即可。
    tiltX = Math.max(-1, Math.min(1, e.gamma / 34));
    tiltY = Math.max(-1, Math.min(1, (e.beta - 45) / 40));
    hasInput = true;
  }

  function enableTilt() {
    if (!window.DeviceOrientationEvent) return;
    // iOS 13+ 需要用户手势后申请权限；失败也不影响其他交互。
    if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
      window.DeviceOrientationEvent.requestPermission()
        .then((state) => { if (state === 'granted') window.addEventListener('deviceorientation', onTilt); })
        .catch(() => {});
      return;
    }
    window.addEventListener('deviceorientation', onTilt);
  }

  function init() {
    // 先按 depth 从小到大排序，保证远的在文档流里靠前（配合 z-index 更稳）
    items.sort((a, b) => a.depth - b.depth);
    items.forEach((it, i) => { it.el.style.zIndex = String(10 + i); });
    measure();

    if (reduceMotion) {
      // 只保留静态构图，不做任何位移
      stage.dataset.parallaxMode = 'reduced';
      return;
    }

    stage.dataset.parallaxMode = 'active';
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    stage.addEventListener('touchmove', onTouchMove, { passive: true });
    enableTilt();

    // 窗口尺寸变了要重量一次 —— 放大量是按宽度反推的，不重算窄屏会露边
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measure, 160);
    }, { passive: true });

    // 页面切到后台时停掉 rAF，别白烧 CPU
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop(); else start();
    });
    start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 供本地验收脚本读取状态，不暴露任何用户数据
  window.__gardenParallax = {
    ready: true,
    layers: () => items.map((it) => ({
      depth: it.depth,
      scale: it.scale,
      transform: it.el.style.transform,
    })),
    mode: () => stage.dataset.parallaxMode,
    maxShift: () => maxShift,
  };
})();
