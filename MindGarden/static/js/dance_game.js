/**
 * 心灵喷泉 · 「舞动起来！」节奏跳舞游戏
 * --------------------------------------------------------------
 * 依附于 garden_pose.js：
 *   - garden_pose.js 每帧识别到人体后，会调用 window.__dancePoseHook(landmarks, now)
 *   - 本文件注册这个钩子做节奏判定；不开第二个摄像头、不开第二个 WebGL 上下文
 *
 * 玩法：
 *   1. 选「舞动起来！」→ 选歌 → 开始跳舞（自动开摄像头）
 *   2. 中间视口的领舞「小暖」按节拍示范动作（2D 木偶，裙子 + 丸子头）
 *   3. 每个动作到来前，对应关节处出现一个收缩圆圈（收缩 2 拍）
 *      圆圈缩到最小时，你的对应关节摆到目标位置 → PERFECT / GOOD，否则 MISS
 *   4. 歌曲播完或点「结束本局」→ 结算 + 排行榜（POST /garden/dance_score）
 */

(function () {
  'use strict';

  /* ---------- DOM ---------- */
  const modal = document.getElementById('bearMirrorModal');
  const grid = document.getElementById('mirrorStageGrid');
  const modePicker = document.getElementById('danceModePicker');
  const modeCards = Array.from(document.querySelectorAll('.dance-mode-card'));
  const trackRow = document.getElementById('danceTrackRow');
  const trackSelect = document.getElementById('danceTrackSelect');
  const startBtn = document.getElementById('danceStartBtn');
  const leadCard = document.getElementById('danceLeadCard');
  const leadCanvas = document.getElementById('danceStage');
  const hud = document.getElementById('danceHud');
  const scoreEl = document.getElementById('danceScore');
  const comboEl = document.getElementById('danceCombo');
  const judgeEl = document.getElementById('danceJudge');
  const quitBtn = document.getElementById('danceQuitBtn');
  const resultPanel = document.getElementById('danceResult');
  const resultScore = document.getElementById('resultScore');
  const resultSub = document.getElementById('resultSub');
  const boardTopBody = document.getElementById('boardTopBody');
  const boardMineBody = document.getElementById('boardMineBody');
  const againBtn = document.getElementById('danceAgainBtn');
  const backBtn = document.getElementById('danceBackBtn');

  if (!modal || !modePicker || !leadCanvas) return; // 不在喷泉页就什么都不做

  /* ---------- 常量 ---------- */
  // 每首歌的 BPM（按歌名关键字匹配，匹配不到用默认 96）
  const BPM_TABLE = [
    { kw: 'Parfait', bpm: 100 },
    { kw: 'SLEEPY', bpm: 76 },
    { kw: '风铃', bpm: 84 },
  ];
  const DEFAULT_BPM = 96;
  const MOVE_BEATS = 2;          // 每个动作持续 2 拍
  const CIRCLE_BEATS = 2;        // 圆圈收缩时长（拍）
  const HIT_PERFECT = 0.10;      // 归一化坐标距离阈值
  const HIT_GOOD = 0.18;
  const SCORE_PERFECT = 150;
  const SCORE_GOOD = 80;
  const JUDGE_JOINTS = [15, 16, 25, 26]; // 手腕 / 膝盖

  /* ---------- 编舞：在站立基准姿势上做的 6 组动作 ---------- */
  function idlePose() {
    const p = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
    Object.assign(p[0], { x: .5, y: .19 });
    Object.assign(p[11], { x: .42, y: .31 }); Object.assign(p[12], { x: .58, y: .31 });
    Object.assign(p[13], { x: .36, y: .43 }); Object.assign(p[14], { x: .64, y: .43 });
    Object.assign(p[15], { x: .34, y: .55 }); Object.assign(p[16], { x: .66, y: .55 });
    Object.assign(p[23], { x: .46, y: .58 }); Object.assign(p[24], { x: .54, y: .58 });
    Object.assign(p[25], { x: .45, y: .76 }); Object.assign(p[26], { x: .55, y: .76 });
    Object.assign(p[27], { x: .44, y: .94 }); Object.assign(p[28], { x: .56, y: .94 });
    return p;
  }
  const IDLE = idlePose();
  // 每个动作 = 对若干关节的覆盖坐标；judges = 这个动作要判定的关节
  const MOVES = [
    { name: '双手举高', judges: [15, 16],
      pose: { 15: { x: .30, y: .24 }, 16: { x: .70, y: .24 }, 13: { x: .33, y: .34 }, 14: { x: .67, y: .34 } } },
    { name: '左手挥舞', judges: [15],
      pose: { 15: { x: .28, y: .22 }, 13: { x: .32, y: .33 } } },
    { name: '右手挥舞', judges: [16],
      pose: { 16: { x: .72, y: .22 }, 14: { x: .68, y: .33 } } },
    { name: '蹲一蹲', judges: [25, 26],
      pose: { 23: { x: .46, y: .66 }, 24: { x: .54, y: .66 }, 25: { x: .43, y: .80 }, 26: { x: .57, y: .80 },
              11: { x: .42, y: .39 }, 12: { x: .58, y: .39 }, 0: { x: .5, y: .27 } } },
    { name: '大字伸展', judges: [15, 16],
      pose: { 15: { x: .20, y: .30 }, 16: { x: .80, y: .30 }, 13: { x: .30, y: .30 }, 14: { x: .70, y: .30 } } },
    { name: '左右点步', judges: [25, 26],
      pose: { 27: { x: .36, y: .94 }, 28: { x: .64, y: .94 }, 25: { x: .41, y: .76 }, 26: { x: .59, y: .76 },
              15: { x: .30, y: .50 }, 16: { x: .70, y: .50 } } },
  ];

  function moveAt(beat) {
    const idx = Math.floor(beat / MOVE_BEATS) % MOVES.length;
    const next = (idx + 1) % MOVES.length;
    const t = (beat % MOVE_BEATS) / MOVE_BEATS;
    // 余弦缓动：在节拍边界准确到达目标姿势
    const e = 0.5 - 0.5 * Math.cos(t * Math.PI);
    return { from: MOVES[idx], to: MOVES[next], e };
  }

  function leadPoseAt(beat) {
    const { from, to, e } = moveAt(beat);
    const pose = IDLE.map(p => ({ ...p }));
    const ids = new Set([...Object.keys(from.pose), ...Object.keys(to.pose)].map(Number));
    for (const id of ids) {
      const a = from.pose[id] || IDLE[id];
      const b = to.pose[id] || IDLE[id];
      pose[id].x = a.x + (b.x - a.x) * e;
      pose[id].y = a.y + (b.y - a.y) * e;
    }
    return pose;
  }

  // 某个偶数节拍 spawn 的圆圈：目标是下一个动作姿势中 judges 关节的位置
  function circleTargetsAt(spawnBeat) {
    const targetMove = MOVES[(Math.floor(spawnBeat / MOVE_BEATS) + 1) % MOVES.length];
    return targetMove.judges
      .filter(id => targetMove.pose[id])
      .map(id => ({ joint: id, x: targetMove.pose[id].x, y: targetMove.pose[id].y }));
  }

  /* ---------- 状态 ---------- */
  let mode = 'preview';           // 'preview' | 'dance'
  let tracks = [];
  let audio = null;
  let practiceStart = 0;
  const elapsedSeconds = () => audio ? audio.currentTime : (performance.now() - practiceStart) / 1000;
  let playing = false;
  let bpm = DEFAULT_BPM;
  let beatOffset = 0;             // audio.currentTime 起点
  let score = 0, combo = 0, maxCombo = 0;
  let hits = 0, misses = 0;
  let circles = [];               // {joint,x,y,spawnBeat,hitBeat,judged}
  let lastSpawnBeat = -1;
  let latestUserLm = null;
  let rafId = null;
  let judgeTimer = null;
  let audioCtx = null;

  /* ---------- 音效：WebAudio 合成「叮咚」，不需要素材 ---------- */
  function ensureAudioCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }
  function playDing(perfect) {
    ensureAudioCtx();
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    [perfect ? 880 : 660, perfect ? 1320 : 990].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.07 + 0.5);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + i * 0.07);
      osc.stop(t0 + i * 0.07 + 0.55);
    });
  }
  function playMiss() {
    ensureAudioCtx();
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, t0);
    osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.25);
    gain.gain.setValueAtTime(0.12, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0 + 0.32);
  }

  /* ---------- 判定钩子：garden_pose.js 每帧投喂 ---------- */
  window.__dancePoseHook = function (landmarks) {
    latestUserLm = landmarks;
  };

  function judgeCircle(c) {
    // 用户坐标做镜像（与领舞方向一致）：mx = 1 - lm.x
    const lm = latestUserLm && latestUserLm[c.joint];
    if (!lm || (lm.visibility != null && lm.visibility < 0.3)) { return miss(c); }
    const dx = (1 - lm.x) - c.x, dy = lm.y - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= HIT_PERFECT) return hit(c, SCORE_PERFECT, 'PERFECT!');
    if (dist <= HIT_GOOD) return hit(c, SCORE_GOOD, 'GOOD!');
    return miss(c);
  }
  function hit(c, base, label) {
    c.judged = true; c.result = 'hit';
    combo += 1; maxCombo = Math.max(maxCombo, combo); hits += 1;
    score += base + Math.min(combo, 20) * 10;
    showJudge(label, true);
    playDing(base === SCORE_PERFECT);
    updateHud();
  }
  function miss(c) {
    c.judged = true; c.result = 'miss';
    combo = 0; misses += 1;
    showJudge('MISS', false);
    playMiss();
    updateHud();
  }
  function showJudge(text, good) {
    judgeEl.textContent = text;
    judgeEl.classList.remove('is-good', 'is-bad', 'is-pop');
    judgeEl.classList.add(good ? 'is-good' : 'is-bad', 'is-pop');
    clearTimeout(judgeTimer);
    judgeTimer = setTimeout(() => { judgeEl.textContent = ''; judgeEl.classList.remove('is-good', 'is-bad', 'is-pop'); }, 700);
  }
  function updateHud() {
    scoreEl.textContent = String(score);
    comboEl.textContent = String(combo);
  }

  /* ---------- 领舞木偶绘制（2D canvas，裙子 + 丸子头女生） ---------- */
  const EDGES = [[11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28]];
  function drawLead(pose, nowSec) {
    const rect = leadCanvas.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width)), H = Math.max(1, Math.round(rect.height));
    if (leadCanvas.width !== W || leadCanvas.height !== H) { leadCanvas.width = W; leadCanvas.height = H; }
    const ctx = leadCanvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const pt = (i) => ({ x: pose[i].x * W, y: pose[i].y * H });
    const SKIN = '#f6c9a8', DRESS = '#ff8f7d', DRESS_DARK = '#e76f61', HAIR = '#5b4034';

    // 四肢（袖子色）
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const limb = (a, b, w, color) => {
      const A = pt(a), B = pt(b);
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
      ctx.beginPath(); ctx.arc(B.x, B.y, w / 2, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    };
    limb(23, 25, W * .055, SKIN); limb(25, 27, W * .045, SKIN);
    limb(24, 26, W * .055, SKIN); limb(26, 28, W * .045, SKIN);
    limb(11, 13, W * .048, DRESS); limb(13, 15, W * .040, SKIN);
    limb(12, 14, W * .048, DRESS); limb(14, 16, W * .040, SKIN);

    // 裙子：肩到胯的梯形裙摆
    const shL = pt(11), shR = pt(12), hipL = pt(23), hipR = pt(24);
    const kneeL = pt(25), kneeR = pt(26);
    const sway = Math.sin(nowSec * 2.2) * W * 0.012;
    const skirtL = { x: (hipL.x + kneeL.x) / 2 - W * .045 + sway, y: (hipL.y + kneeL.y) / 2 };
    const skirtR = { x: (hipR.x + kneeR.x) / 2 + W * .045 + sway, y: (hipR.y + kneeR.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(shL.x, shL.y); ctx.lineTo(shR.x, shR.y);
    ctx.lineTo(skirtR.x, skirtR.y); ctx.lineTo(skirtL.x, skirtL.y);
    ctx.closePath();
    ctx.fillStyle = DRESS; ctx.fill();
    ctx.strokeStyle = DRESS_DARK; ctx.lineWidth = Math.max(2, W * .006); ctx.stroke();

    // 头 + 丸子头
    const nose = pt(0);
    const headR = W * .070;
    const hx = nose.x, hy = nose.y - H * .015;
    ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(hx, hy, headR, 0, Math.PI * 2); ctx.fill();
    // 头发（后脑勺半圆 + 两个丸子）
    ctx.fillStyle = HAIR;
    ctx.beginPath(); ctx.arc(hx, hy - headR * .18, headR * 1.02, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.beginPath();
    ctx.arc(hx - headR * .62, hy - headR * .95, headR * .30, 0, Math.PI * 2);
    ctx.arc(hx + headR * .62, hy - headR * .95, headR * .30, 0, Math.PI * 2);
    ctx.fill();
    // 表情
    ctx.fillStyle = '#382a24';
    ctx.beginPath();
    ctx.arc(hx - headR * .32, hy, headR * .075, 0, Math.PI * 2);
    ctx.arc(hx + headR * .32, hy, headR * .075, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#382a24'; ctx.lineWidth = Math.max(1.5, headR * .08);
    ctx.beginPath(); ctx.arc(hx, hy + headR * .18, headR * .28, Math.PI * .15, Math.PI * .85); ctx.stroke();
    // 腮红
    ctx.fillStyle = 'rgba(255,143,125,.55)';
    ctx.beginPath();
    ctx.arc(hx - headR * .52, hy + headR * .22, headR * .14, 0, Math.PI * 2);
    ctx.arc(hx + headR * .52, hy + headR * .22, headR * .14, 0, Math.PI * 2);
    ctx.fill();

    // 收缩圆圈（画在对应关节上）
    const beat = currentBeat();
    for (const c of circles) {
      if (c.judged) continue;
      const progress = Math.min(1, Math.max(0, (beat - c.spawnBeat) / CIRCLE_BEATS));
      const radius = W * 0.085 * (1.6 - 0.6 * progress); // 从大到小收缩
      const cx = c.x * W, cy = c.y * H;
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 214, 102, ${0.95 - progress * 0.25})`;
      ctx.lineWidth = Math.max(3, W * .008);
      ctx.shadowColor = 'rgba(255,190,60,.9)'; ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // 目标点
      ctx.beginPath(); ctx.arc(cx, cy, W * 0.02, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,214,102,.9)'; ctx.fill();
    }
  }

  function currentBeat() {
    if (!playing) return 0;
    return Math.max(0, (elapsedSeconds() - beatOffset)) * bpm / 60;
  }

  /* ---------- 游戏主循环 ---------- */
  function tick() {
    if (!playing) return;
    rafId = requestAnimationFrame(tick);
    const beat = currentBeat();
    if (!audio && beat >= 96) { endGame(); return; }
    drawLead(leadPoseAt(beat), elapsedSeconds());

    // 每过一个偶数拍，为「下一个动作」生成收缩圆圈
    const spawnBeat = Math.floor(beat / MOVE_BEATS) * MOVE_BEATS;
    if (beat - spawnBeat < 0.15 && spawnBeat !== lastSpawnBeat) {
      lastSpawnBeat = spawnBeat;
      for (const t of circleTargetsAt(spawnBeat)) {
        circles.push({ ...t, spawnBeat, hitBeat: spawnBeat + CIRCLE_BEATS, judged: false });
      }
    }
    // 到点判定
    for (const c of circles) {
      if (!c.judged && beat >= c.hitBeat) judgeCircle(c);
    }
    // 清掉已判定 / 过期的圆圈
    circles = circles.filter(c => !c.judged && beat < c.hitBeat + 0.5);
  }

  /* ---------- 模式切换 ---------- */
  function setMode(next) {
    mode = next;
    modeCards.forEach(card => card.classList.toggle('is-active', card.dataset.mode === next));
    trackRow.hidden = next !== 'dance';
    if (next === 'dance' && !tracks.length) loadTracks();
  }
  modeCards.forEach(card => card.addEventListener('click', () => setMode(card.dataset.mode)));

  async function loadTracks() {
    try {
      const res = await fetch('/garden/music', { credentials: 'same-origin' });
      const data = await res.json();
      tracks = data.tracks || [];
    } catch (_) { tracks = []; }
    trackSelect.innerHTML = '';
    if (!tracks.length) {
      const opt = document.createElement('option');
      opt.value = 'practice'; opt.textContent = '无配乐练习 · 跟随领舞';
      trackSelect.appendChild(opt);
      startBtn.disabled = false;
      return;
    }
    startBtn.disabled = false;
    for (const t of tracks) {
      const opt = document.createElement('option');
      opt.value = t.url; opt.textContent = t.title;
      trackSelect.appendChild(opt);
    }
  }

  function bpmFor(title) {
    const row = BPM_TABLE.find(r => title && title.includes(r.kw));
    return row ? row.bpm : DEFAULT_BPM;
  }

  /* ---------- 开始 / 结束 ---------- */
  async function startGame() {
    const url = trackSelect.value;
    if (!url) return;
    // 摄像头没开就帮忙开（游戏必须有姿态输入才能判定）
    const pose = window.__gardenPose;
    if (pose && !pose.isCameraOn()) {
      showJudge('正在打开摄像头…', true);
      try { await pose.startCamera(); } catch (_) { /* 下面再检查一次 */ }
      const t0 = Date.now();
      while (!pose.isCameraOn() && Date.now() - t0 < 6000) {
        await new Promise(r => setTimeout(r, 200));
      }
      if (!pose.isCameraOn()) {
        showJudge('需要摄像头才能起舞哦', false);
        return;
      }
    }
    // 暂停花园背景音乐，避免和舞曲打架
    document.querySelectorAll('audio').forEach(a => { if (!a.paused) a.pause(); });

    const title = trackSelect.options[trackSelect.selectedIndex].textContent;
    bpm = bpmFor(title);
    score = 0; combo = 0; maxCombo = 0; hits = 0; misses = 0;
    circles = []; lastSpawnBeat = -1; latestUserLm = null;
    updateHud();

    audio = url === 'practice' ? null : new Audio(url);
    practiceStart = performance.now();
    if (audio) {
      let level = 12;
      try {
        const saved = localStorage.getItem('mindgarden.garden.music.volume');
        if (saved !== null && Number.isFinite(Number(saved))) level = Number(saved);
      } catch (_) { /* 私密浏览仍可使用默认音量。 */ }
      audio.volume = Math.max(0, Math.min(1, level / 100));
      audio.dataset.track = title;
      audio.addEventListener('ended', endGame);
    }

    modal.classList.add('dance-game-on');
    grid.classList.add('is-three-col');
    leadCard.hidden = false;
    hud.hidden = false;
    resultPanel.hidden = true;
    modePicker.style.display = 'none';

    playing = true;
    beatOffset = 0;
    try {
      if (audio) await audio.play();
      // 前奏 4 拍留白，让舞者站好
      beatOffset = 0;
      showJudge('预备——跟着小暖跳！', true);
    } catch (e) {
      showJudge('音乐播放失败，换一首试试', false);
      playing = false;
      return;
    }
    cancelAnimationFrame(rafId);
    tick();
  }

  async function endGame() {
    if (!playing && resultPanel.hidden === false) return;
    playing = false;
    cancelAnimationFrame(rafId);
    circles = [];
    if (audio) { try { audio.pause(); } catch (_) {} }
    const track = audio ? audio.dataset.track : '无配乐练习';
    hud.hidden = true;

    // 存分数 + 拉排行榜
    let best = null;
    try {
      const res = await fetch('/garden/dance_score', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track, score }),
      });
      const data = await res.json();
      if (data && data.ok) best = data.best;
    } catch (_) { /* 存不上也照常结算 */ }

    resultScore.textContent = String(score);
    const acc = hits + misses ? Math.round(hits / (hits + misses) * 100) : 0;
    resultSub.textContent =
      `曲目《${track}》 · 命中 ${hits} / 失误 ${misses} · 命中率 ${acc}% · 最高连击 ${maxCombo}` +
      (best != null ? ` · 历史最佳 ${best} 分` : '');
    resultPanel.hidden = false;
    loadBoard();
  }

  async function loadBoard() {
    let data = { top: [], mine: null };
    try {
      const res = await fetch('/garden/dance_scores', { credentials: 'same-origin' });
      data = await res.json();
    } catch (_) { /* 保持空表 */ }
    boardTopBody.innerHTML = '';
    (data.top || []).forEach((row, i) => {
      const tr = document.createElement('tr');
      const date = (row.created_at || '').slice(0, 10);
      tr.innerHTML = `<td>${i + 1}</td><td></td><td></td><td>${row.score}</td><td>${date}</td>`;
      tr.children[1].textContent = row.username;
      tr.children[2].textContent = row.track;
      boardTopBody.appendChild(tr);
    });
    if (!boardTopBody.children.length) {
      boardTopBody.innerHTML = '<tr><td colspan="5" class="dance-board-empty">还没有人上榜，等你来霸榜</td></tr>';
    }
    boardMineBody.innerHTML = '';
    if (data.mine) {
      const tr = document.createElement('tr');
      const date = (data.mine.created_at || '').slice(0, 10);
      tr.innerHTML = `<td></td><td>${data.mine.score}</td><td>${date}</td>`;
      tr.children[0].textContent = data.mine.track;
      boardMineBody.appendChild(tr);
    } else {
      boardMineBody.innerHTML = '<tr><td colspan="3" class="dance-board-empty">还没有成绩</td></tr>';
    }
  }

  function backToPicker() {
    // 返回模式选择；顺手关摄像头退出沉浸模式，界面恢复原样
    if (window.__gardenPose && window.__gardenPose.isCameraOn()) {
      window.__gardenPose.stopCamera();
    }
    modal.classList.remove('dance-game-on');
    grid.classList.remove('is-three-col');
    leadCard.hidden = true;
    hud.hidden = true;
    resultPanel.hidden = true;
    modePicker.style.display = '';
    setMode('preview');
  }

  startBtn.addEventListener('click', startGame);
  quitBtn.addEventListener('click', endGame);
  againBtn.addEventListener('click', () => { resultPanel.hidden = true; startGame(); });
  backBtn.addEventListener('click', backToPicker);

  // 离开页面时停止游戏
  window.addEventListener('beforeunload', () => {
    playing = false;
    if (audio) { try { audio.pause(); } catch (_) {} }
  });
})();
