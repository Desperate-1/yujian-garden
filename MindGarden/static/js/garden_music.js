/* MindGarden · 花园背景音乐
 * ------------------------------------------------------------
 * 进花园就随机播一首（音乐库 = static/music/，由后端扫描后以 JSON 注入）。
 * 界面上只做三件事：播放/暂停、随机换一首、调音量。音量记在 localStorage，
 * 下次进花园还是上次那个大小。
 *
 * ── 两个必须处理的浏览器行为（踩过坑，别删）──────────────────
 * 1) 自动播放策略：`audio.play()` 可能被浏览器拒掉（NotAllowedError）。
 *    这时**不能**当作"坏了"，要切成"未播放"并挂一次性监听，
 *    等用户第一次点页面上任意位置（用户手势）再试着播。
 * 2) 坏文件 / 格式不支持：play() 的 reject 与 'error' 事件会**同时**来，
 *    所以 reject 里先用 `audio.error` 判一下，是文件问题就交给 'error'
 *    去换下一首，避免两边都动手导致重复跳过。
 * ──────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const dataEl = document.getElementById('g3dMusicData');
  const box = document.getElementById('g3dMusic');
  if (!dataEl || !box) return;

  let tracks = [];
  try {
    tracks = JSON.parse(dataEl.textContent) || [];
  } catch (e) {
    tracks = [];
  }
  if (!tracks.length) {
    box.remove();          // 音乐库是空的：整块收起来，不要让花园多个空壳子
    return;
  }

  const toggle = document.getElementById('g3dMusicToggle');
  const nextBtn = document.getElementById('g3dMusicNext');
  const titleEl = document.getElementById('g3dMusicTitle');
  const volEl = document.getElementById('g3dMusicVolume');
  const volTextEl = document.getElementById('g3dMusicVolumeText');

  const VOL_KEY = 'mindgarden.garden.music.volume';
  const DEFAULT_VOL = 60;

  /* 洗牌（Fisher-Yates）。每次进花园顺序都不一样 → 就是"随机播放" */
  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }

  const order = shuffle(tracks.slice());
  const audio = new Audio();
  audio.preload = 'auto';

  let pos = -1;
  let failed = 0;
  let armed = false;       // 是否正在等用户手势解禁自动播放
  let volume = DEFAULT_VOL;

  /* ---------- 音量 ---------- */
  function applyVolume(v, persist) {
    volume = Math.max(0, Math.min(100, Math.round(v)));
    audio.volume = volume / 100;
    if (volEl) {
      volEl.value = String(volume);
      // WebKit 用这个变量画"已填充"的一段轨道
      volEl.style.setProperty('--vol', volume + '%');
    }
    if (volTextEl) volTextEl.textContent = volume + '%';
    if (persist) {
      try { window.localStorage.setItem(VOL_KEY, String(volume)); } catch (e) { /* 隐私模式 */ }
    }
  }

  /* ---------- 界面状态 ---------- */
  function setPlaying(on) {
    box.classList.toggle('is-playing', !!on);
    if (on) box.classList.remove('needs-gesture');
    if (toggle) toggle.setAttribute('aria-label', on ? '暂停背景音乐' : '播放背景音乐');
  }

  function showTitle(text) {
    if (titleEl) titleEl.textContent = text;
  }

  function updateMediaSession(t) {
    if (!('mediaSession' in navigator) || typeof window.MediaMetadata !== 'function') return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: t.title,
        artist: 'MindGarden 医心艺意',
      });
    } catch (e) { /* 不支持就算了，不影响播放 */ }
  }

  /* ---------- 选曲 ---------- */
  function loadAt(i) {
    pos = ((i % order.length) + order.length) % order.length;
    const t = order[pos];
    audio.src = t.url;
    showTitle(t.title);
    updateMediaSession(t);
    try { audio.load(); } catch (e) { /* 个别老浏览器没有 load，忽略 */ }
  }

  /* ---------- 播放 ---------- */
  function attemptPlay() {
    if (!audio.src) loadAt(0);
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch((err) => {
        if (audio.error) return;                        // 文件问题 → 交给 'error'
        setPlaying(false);
        if (err && err.name === 'NotAllowedError') armGesture();   // 被自动播放策略拦下
      });
    }
  }

  /* 被拦下后：挂一次性监听，等用户在页面上做出手势再补播一次。
     注意点在播放器自己身上时直接放过 —— 否则 pointerdown 先补播、
     紧接着 click 又把刚播的音乐暂停掉，看起来就像"点了没反应"。 */
  function armGesture() {
    if (armed) return;
    armed = true;
    box.classList.add('needs-gesture');

    const kick = (ev) => {
      if (ev && ev.target && box.contains(ev.target)) return;
      disarm();
      if (audio.paused) attemptPlay();
    };

    document.addEventListener('pointerdown', kick, true);
    document.addEventListener('keydown', kick, true);
    document.addEventListener('touchstart', kick, true);
    armGesture.kick = kick;
  }

  function disarm() {
    if (!armed) return;
    armed = false;
    box.classList.remove('needs-gesture');
    const kick = armGesture.kick;
    if (kick) {
      document.removeEventListener('pointerdown', kick, true);
      document.removeEventListener('keydown', kick, true);
      document.removeEventListener('touchstart', kick, true);
      armGesture.kick = null;
    }
  }

  function nextTrack() {
    loadAt(pos + 1);
    // 正在放 → 接着放；刚才被浏览器拦着 → 这一下点击就是手势，正好开始
    if (box.classList.contains('is-playing') || box.classList.contains('needs-gesture')) {
      attemptPlay();
    }
  }

  /* ---------- 音频事件 ---------- */
  audio.addEventListener('playing', () => { failed = 0; setPlaying(true); });
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => { loadAt(pos + 1); attemptPlay(); });
  audio.addEventListener('error', () => {
    failed += 1;
    if (failed >= order.length) {          // 全都不行：停手，别死循环
      showTitle('音乐暂时放不出来');
      setPlaying(false);
      return;
    }
    loadAt(pos + 1);
    attemptPlay();
  });

  /* ---------- 界面事件 ---------- */
  if (toggle) {
    toggle.addEventListener('click', () => {
      disarm();
      if (audio.paused) attemptPlay();
      else audio.pause();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      disarm();
      nextTrack();
    });
  }

  if (volEl) {
    const onVolume = () => {
      disarm();                            // 动过音量就算有过用户手势
      applyVolume(parseInt(volEl.value, 10) || 0, true);
    };
    volEl.addEventListener('input', onVolume);
    volEl.addEventListener('change', onVolume);
  }

  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => attemptPlay());
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
    } catch (e) { /* 老浏览器不支持某些 action，忽略 */ }
  }

  /* ---------- 启动 ---------- */
  function init() {
    let saved = null;
    try { saved = window.localStorage.getItem(VOL_KEY); } catch (e) { saved = null; }
    const parsed = saved === null ? NaN : parseInt(saved, 10);
    applyVolume(isNaN(parsed) ? DEFAULT_VOL : parsed, false);

    loadAt(0);
    attemptPlay();      // 大多数情况（从首页点门进来 / localhost）能直接响
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 供本地验收脚本读取，不涉及用户数据
  window.__gardenMusic = {
    ready: true,
    playlist: () => order.map((t) => t.title),
    state: () => ({
      playing: !audio.paused,
      index: pos,
      title: titleEl ? titleEl.textContent : '',
      volume: volume,
      needsGesture: box.classList.contains('needs-gesture'),
      src: audio.currentSrc || audio.src,
    }),
    play: attemptPlay,
    pause: () => audio.pause(),
    next: nextTrack,
    setVolume: (v) => applyVolume(v, true),
  };
})();
