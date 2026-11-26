/* 晨日樱花街的背景歌单。记录手动音量、播放位置与暂停偏好。 */
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
    box.remove();          // 音乐库是空的：整块收起来，不要留个空壳子
    return;
  }

  const toggle = document.getElementById('g3dMusicToggle');
  const nextBtn = document.getElementById('g3dMusicNext');
  const titleEl = document.getElementById('g3dMusicTitle');
  const volEl = document.getElementById('g3dMusicVolume');
  const volTextEl = document.getElementById('g3dMusicVolumeText');

  const VOL_KEY = 'mindgarden.garden.music.volume';   // 沿用花园时代的键，音量偏好不断档
  const TRACK_KEY = 'mindgarden.music.track';         // 上次播的歌（按 url 认）
  const TIME_KEY = 'mindgarden.music.time';           // 上次播到第几秒
  const PAUSE_KEY = 'mindgarden.music.paused';        // 用户手动暂停过 → 别自作主张继续放
  const DEFAULT_VOL = 12;
  let fadeFrame = 0;
  let gain = 0;
  function fadeIn() {
    cancelAnimationFrame(fadeFrame);
    const start = performance.now();
    function rise(now) {
      gain = Math.max(0, Math.min(1, (now - start) / 1100));
      audio.volume = volume / 100 * gain;
      if (gain < 1 && !audio.paused) fadeFrame = requestAnimationFrame(rise);
    }
    fadeFrame = requestAnimationFrame(rise);
  }

  function store(key, val) { try { window.localStorage.setItem(key, String(val)); } catch (e) { /* 隐私模式 */ } }
  function read(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }

  /* 洗牌（Fisher-Yates）。顺序本身不持久化 —— 跨页续播靠 TRACK_KEY 认歌 */
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
  let resumeAt = 0;        // 本首歌要从第几秒接着放（仅生效一次）

  /* ---------- 音量 ---------- */
  function applyVolume(v, persist) {
    volume = Math.max(0, Math.min(100, Math.round(v)));
    audio.volume = volume / 100 * gain;
    if (volEl) {
      volEl.value = String(volume);
      volEl.style.setProperty('--vol', volume + '%');   // WebKit 画"已填充"轨道用
    }
    if (volTextEl) volTextEl.textContent = volume + '%';
    if (persist) store(VOL_KEY, volume);
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
  function loadAt(i, startSeconds) {
    pos = ((i % order.length) + order.length) % order.length;
    const t = order[pos];
    cancelAnimationFrame(fadeFrame);
    gain = 0; audio.volume = 0;
    audio.src = t.url;
    resumeAt = Math.max(0, startSeconds || 0);
    showTitle(t.title);
    updateMediaSession(t);
    try { audio.load(); } catch (e) { /* 个别老浏览器没有 load，忽略 */ }
    store(TRACK_KEY, t.url);
  }

  /* 元数据就绪后跳到续播点（只有跨页恢复时 resumeAt 才非 0） */
  audio.addEventListener('loadedmetadata', () => {
    if (resumeAt > 0 && isFinite(audio.duration)) {
      try { audio.currentTime = Math.min(resumeAt, Math.max(0, audio.duration - 1)); } catch (e) { /* 忽略 */ }
    }
    resumeAt = 0;
  });

  /* ---------- 播放 ---------- */
  function attemptPlay() {
    if (!audio.src) loadAt(0, 0);
    if (audio.paused) { gain = 0; audio.volume = 0; }
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
    loadAt(pos + 1, 0);
    // 正在放 → 接着放；刚才被浏览器拦着 → 这一下点击就是手势，正好开始
    if (box.classList.contains('is-playing') || box.classList.contains('needs-gesture')) {
      attemptPlay();
    }
  }

  /* ---------- 进度记忆：每 2 秒记一次 + 离开页面前记一次 ---------- */
  function remember() {
    if (!audio.src || audio.paused) return;
    store(TIME_KEY, audio.currentTime.toFixed(1));
  }
  window.setInterval(remember, 2000);
  window.addEventListener('pagehide', () => { remember(); disarm(); audio.pause(); });
  window.addEventListener('pageshow', e => { if (e.persisted && read(PAUSE_KEY) !== '1') attemptPlay(); });
  window.addEventListener('beforeunload', remember);

  /* ---------- 音频事件 ---------- */
  audio.addEventListener('playing', () => { failed = 0; fadeIn(); setPlaying(true); store(PAUSE_KEY, '0'); });
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => { loadAt(pos + 1, 0); attemptPlay(); });
  audio.addEventListener('error', () => {
    failed += 1;
    if (failed >= order.length) {          // 全都不行：停手，别死循环
      showTitle('音乐暂时放不出来');
      setPlaying(false);
      return;
    }
    loadAt(pos + 1, 0);
    attemptPlay();
  });

  /* ---------- 界面事件 ---------- */
  if (toggle) {
    toggle.addEventListener('click', () => {
      disarm();
      if (audio.paused) { store(PAUSE_KEY, '0'); attemptPlay(); }
      else { store(PAUSE_KEY, '1'); audio.pause(); }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      disarm();
      loadAt(pos + 1, 0);
      attemptPlay();
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
    const savedVol = read(VOL_KEY);
    const parsed = savedVol === null ? NaN : parseInt(savedVol, 10);
    applyVolume(isNaN(parsed) ? DEFAULT_VOL : parsed, false);

    const savedUrl = read(TRACK_KEY);
    const found = order.findIndex(t => t.url === savedUrl);
    loadAt(found >= 0 ? found : 0, found >= 0 ? parseFloat(read(TIME_KEY)) || 0 : 0);

    // 用户上次手动暂停过 → 尊重他，这个页面也不自动播
    if (read(PAUSE_KEY) === '1') {
      setPlaying(false);
      return;
    }
    attemptPlay();      // 从别的页面点链接进来（用户手势刚过）通常能直接响
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
