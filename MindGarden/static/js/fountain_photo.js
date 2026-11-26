/**
 * 心灵喷泉 · 舞厅拍照
 * --------------------------------------------------------------
 * 自由跟跳（舞厅预览）时，把好看的 pose 留下来：
 *   - 点「📸 拍一张」，或对着麦克风说「茄子 / 拍照」→ 3-2-1 倒数 → 抓拍
 *   - 拍完可以：重拍 / 存到本地 / 带去疗愈回廊生成 AI 作品
 * 隐私与喷泉一致：照片只存在浏览器本地，不上传、不留档。
 * 语音识别是渐进增强：浏览器不支持 / 网络不通 / 权限被拒 → 静默收起提示，
 * 拍照按钮永远可用。
 */
(function () {
  'use strict';

  const video = document.getElementById('gardenCamera');
  const shootBtn = document.getElementById('photoShootBtn');
  const voiceHint = document.getElementById('photoVoiceHint');
  const countdownEl = document.getElementById('photoCountdown');
  const previewEl = document.getElementById('photoPreview');
  const previewImg = document.getElementById('photoPreviewImg');
  const retakeBtn = document.getElementById('photoRetakeBtn');
  const cancelBtn = document.getElementById('photoCancelBtn');
  const saveBtn = document.getElementById('photoSaveBtn');
  const toGalleryBtn = document.getElementById('photoToGalleryBtn');
  if (!video || !shootBtn || !previewEl) return;   // 不在喷泉页就什么都不做

  let counting = false;        // 倒数中锁触发（语音连喊两次也只倒数一次）
  let lastShot = null;         // 最近一次抓拍的 dataURL

  /* ---------- 音效：倒数滴答 + 快门两连音，WebAudio 现场合成，零素材 ---------- */
  let audioCtx = null;
  function _ctx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function _beep(freq, when, dur, vol) {
    const ctx = _ctx(); if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  function tick() { _beep(660, 0, 0.12, 0.12); }
  function shutter() { _beep(990, 0, 0.06, 0.18); _beep(1320, 0.07, 0.06, 0.18); }

  /* ---------- 状态门：摄像头已开 + 当前在「舞厅预览」模式 才允许拍 ---------- */
  function cameraOn() {
    return !!(video.srcObject && video.videoWidth > 0);
  }
  function previewMode() {
    const card = document.querySelector('.dance-mode-card[data-mode="preview"]');
    return !card || card.classList.contains('is-active');
  }
  function refreshShootBtn() {
    shootBtn.disabled = counting || !cameraOn() || !previewMode();
  }
  setInterval(refreshShootBtn, 500);

  /* ---------- 轻提示：借 poseStatus 的文本位闪一句 ---------- */
  function pulseStatus(text) {
    const el = document.getElementById('poseStatus');
    if (!el) return;
    const old = el.textContent;
    el.textContent = text;
    setTimeout(() => { el.textContent = old; }, 2400);
  }

  /* ---------- 倒数 3-2-1 → 抓拍 ---------- */
  function startCountdown() {
    if (counting) return;
    if (!cameraOn()) { pulseStatus('先开启摄像头，再来拍照哦'); return; }
    if (!previewMode()) { pulseStatus('「舞动起来！」模式里不能拍照，切回舞厅预览吧'); return; }
    counting = true;
    refreshShootBtn();
    let n = 3;
    countdownEl.hidden = false;
    countdownEl.textContent = n;
    countdownEl.classList.add('is-pop');
    tick();
    const timer = setInterval(() => {
      n -= 1;
      if (n > 0) {
        countdownEl.textContent = n;
        countdownEl.classList.remove('is-pop');
        void countdownEl.offsetWidth;        // 重置弹跳动画
        countdownEl.classList.add('is-pop');
        tick();
      } else {
        clearInterval(timer);
        countdownEl.hidden = true;
        takeShot();
        counting = false;
        refreshShootBtn();
      }
    }, 750);
  }

  function takeShot() {
    if (!cameraOn()) return;
    // 与疗愈回廊同一规格：原始比例居中裁正方形 600×600，生成链路直接可用
    const vw = video.videoWidth, vh = video.videoHeight;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2, sy = (vh - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 600;
    const ctx = canvas.getContext('2d');
    // 画面显示是镜像的（CSS scaleX(-1)），照片水平翻转保持一致，所见即所得
    ctx.translate(600, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, side, side, 0, 0, 600, 600);
    lastShot = canvas.toDataURL('image/jpeg', 0.92);
    shutter();
    previewImg.src = lastShot;
    previewEl.hidden = false;
  }

  /* ---------- 预览卡动作 ---------- */
  shootBtn.addEventListener('click', startCountdown);
  retakeBtn.addEventListener('click', () => {
    previewEl.hidden = true;
    startCountdown();
  });
  /* 「不想拍了」：明确的退出出口。收起预览卡、丢掉这张，回到舞厅预览 */
  cancelBtn.addEventListener('click', () => {
    previewEl.hidden = true;
    lastShot = null;
    pulseStatus('好，这张不要啦～想拍随时再比 OK 或点拍一张');
  });
  saveBtn.addEventListener('click', () => {
    if (!lastShot) return;
    const a = document.createElement('a');
    a.href = lastShot;
    a.download = '心灵喷泉_' + new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-') + '.jpg';
    a.click();
  });
  toGalleryBtn.addEventListener('click', () => {
    if (!lastShot) return;
    try { sessionStorage.setItem('fountain_photo', lastShot); } catch (e) { /* 存储被禁也照跳 */ }
    window.location.href = '/create?from=fountain';
  });
  previewEl.addEventListener('click', (e) => {
    if (e.target === previewEl) previewEl.hidden = true;   // 点遮罩收起，照片还在
  });

  /* ---------- 语音唤醒：「茄子 / 拍照 / 拍一张 / 照相」 ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR && voiceHint) {
    voiceHint.hidden = false;
    let recog = null;
    let listening = false;
    let dead = false;          // 识别服务连不上（如国内 Chrome）就不再重试

    function _start() {
      if (dead || listening || counting || !cameraOn() || !previewMode() || !previewEl.hidden) return;
      try {
        recog = new SR();
        recog.lang = 'zh-CN';
        recog.continuous = true;
        recog.interimResults = true;
        recog.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const text = (e.results[i][0] && e.results[i][0].transcript) || '';
            if (/茄子|拍照|拍一张|照相/.test(text)) { startCountdown(); break; }
          }
        };
        recog.onerror = (e) => {
          listening = false; dead = true;
          // 别装死：告诉用户为什么语音没反应（Chrome 的识别走 Google，国内连不上；
          // Edge 走微软可以用）。入口降级为提示，按钮/OK 手势永远可用。
          voiceHint.textContent = '🎤 这个浏览器用不了语音，点「拍一张」或比 OK 一样拍';
          voiceHint.title = '语音识别失败：' + ((e && e.error) || '未知');
        };
        recog.onend = () => { listening = false; };
        recog.start();
        listening = true;
      } catch (e) { dead = true; voiceHint.textContent = '🎤 这个浏览器用不了语音，点「拍一张」或比 OK 一样拍'; }
    }
    function _stop() {
      if (recog && listening) { try { recog.stop(); } catch (e) { /* 尽力而为 */ } }
      listening = false;
    }
    // 跟着摄像头 / 模式 / 预览卡状态自动启停（onend 后下一轮自动复活）
    setInterval(() => {
      if (cameraOn() && previewMode() && previewEl.hidden && !listening && !dead) _start();
      else if ((!cameraOn() || !previewMode()) && listening) _stop();
    }, 1200);
  }

  /* ---------- 手势拍照：比 OK 👌 保持约半秒 → 自动倒数 ----------
     选型理由：OK 手势（拇指指尖贴食指指尖、其余三指伸直）特征强、
     和跳舞动作几乎不撞车；用 MediaPipe HandLandmarker 本地识别，
     与姿态识别同一套 wasm/runtime，模型已下载到 static/models/。
     开关状态存 localStorage；模型加载失败 → 静默收起开关，按钮拍照永远可用。 */
  const gestureToggle = document.getElementById('gesturePhotoToggle');
  if (gestureToggle) {
    const HAND_WASM = '/static/vendor/mediapipe/wasm';
    const HAND_MODEL = '/static/models/hand_landmarker.task';
    const HAND_MODULE = '/static/vendor/mediapipe/vision_bundle.mjs';
    const STORE_KEY = 'mg_gesture_photo';

    let handLandmarker = null;
    let handFailed = false;
    let okHold = 0;                 // OK 手势连续命中的检测轮数（防抖）
    let gestureLocked = false;      // 触发一次后锁住，看到手放下（非 OK 帧）才解锁——
                                    // 否则重拍完手还没放下，0.5s 后又自动倒数，像"一直重拍"
    let lastHandVideoTime = -1;
    let lastHandRunAt = 0;

    let enabled = true;
    try { enabled = localStorage.getItem(STORE_KEY) !== 'off'; } catch (e) { /* 隐私模式 */ }

    function renderToggle() {
      gestureToggle.textContent = enabled ? '👌 手势拍照·开' : '👌 手势拍照·关';
      gestureToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }
    renderToggle();

    gestureToggle.addEventListener('click', () => {
      enabled = !enabled;
      try { localStorage.setItem(STORE_KEY, enabled ? 'on' : 'off'); } catch (e) { /* ignore */ }
      okHold = 0;
      renderToggle();
      pulseStatus(enabled ? '手势拍照已开启：比个 OK 试试' : '手势拍照已关闭');
    });

    async function ensureHandLandmarker() {
      if (handLandmarker || handFailed) return;
      try {
        const { FilesetResolver, HandLandmarker } = await import(HAND_MODULE);
        const vision = await FilesetResolver.forVisionTasks(HAND_WASM);
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numHands: 1,
          // 置信度 0.5（MediaPipe 默认档）：0.4 误拍太多，手一晃就被当成 OK
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        gestureToggle.hidden = false;      // 模型就绪后才露出开关
      } catch (e) {
        console.warn('[FountainPhoto] 手势模型加载失败，收起手势开关', e);
        handFailed = true;
        gestureToggle.hidden = true;
      }
    }

    // OK 判定：拇指尖(4) 与食指尖(8) 贴近（按手掌尺度归一），且中/无名/小指伸直
    function isOkGesture(lm) {
      const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y, (lm[a].z || 0) - (lm[b].z || 0));
      const handSize = d(0, 9) || 1e-6;                  // 手腕到中指根，当手的大小标尺
      if (d(4, 8) / handSize > 0.50) return false;       // 拇指食指没捏上
      // 其余三指：指尖(12/16/20) 要比指根关节(10/14/18) 离手腕更远才算伸直
      // 留 5% 余量：指尖透视缩短时 3D 距离容易误判成"没伸直"
      return d(12, 0) > d(10, 0) * 0.95 && d(16, 0) > d(14, 0) * 0.95 && d(20, 0) > d(18, 0) * 0.95;
    }

    function handLoop(now) {
      if (!handLandmarker || !enabled || counting || !cameraOn() || !previewMode() || !previewEl.hidden) {
        okHold = 0;
        return;
      }
      if (now - lastHandRunAt < 100) return;             // 约 10fps，别和姿态识别抢 CPU
      if (video.readyState < 2 || video.currentTime === lastHandVideoTime) return;
      lastHandRunAt = now;
      lastHandVideoTime = video.currentTime;
      let result;
      try {
        result = handLandmarker.detectForVideo(video, now);
      } catch (e) { return; }                            // 单帧失败不影响下一轮
      const lm = result && result.landmarks && result.landmarks[0];
      if (lm && isOkGesture(lm)) {
        if (gestureLocked) return;                     // 手还没放下，不重复触发
        okHold += 1;
        if (okHold === 3) pulseStatus('👌 识别到 OK，保持住…');
        if (okHold >= 8) {                               // 连续约 0.8s 才触发，防误拍
          okHold = 0;
          gestureLocked = true;                          // 拍完先锁住：放下手再比才解锁
          startCountdown();
        }
      } else {
        okHold = 0;
        gestureLocked = false;                           // 手放下了，下次比 OK 才算数
      }
    }

    // 摄像头一开就备好模型（加载要几秒，提前异步做），之后常驻一个轻量检测环
    const bootTimer = setInterval(() => {
      if (handFailed) { clearInterval(bootTimer); return; }
      if (cameraOn()) { ensureHandLandmarker(); }
    }, 1500);
    (function tickGesture() {
      handLoop(performance.now());
      requestAnimationFrame(tickGesture);
    })();
  }
})();
