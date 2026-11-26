/* MindGarden · 糖果小屋里的小女巫
 * ------------------------------------------------------------
 * 这一页只有一件事：用户问一句 → 女巫换个姿势、冒个气泡回答。
 * 所以没有会话列表、没有新建/删除对话 —— 一个女巫就一段对话，
 * 会话 id 由后端在渲染页面时给好（data-session）。
 *
 * 两个容易踩的点，都处理了：
 *   1) 中文输入法：拼音候选框里按 Enter 是"上屏"，不能当成发送
 *      （靠 e.isComposing / keyCode 229 判断）。
 *   2) 回复里的换行：气泡用 white-space: pre-wrap，且只走 textContent，
 *      不拼 HTML —— 既保留换行，也不会执行模型返回的奇怪内容。
 * ------------------------------------------------------------
 * 换姿势的规则：用户每问一个问题就换下一张立绘；刷新页面时按
 * "已经问过几句"对齐到对应的那张，不会每刷新一次都回到第一张。
 */
(function () {
  'use strict';

  const room = document.getElementById('candyRoom');
  const form = document.getElementById('candyForm');
  const input = document.getElementById('candyInput');
  const sendBtn = document.getElementById('candySend');
  const bubble = document.getElementById('candyBubble');
  const bubbleText = document.getElementById('candyBubbleText');
  const typing = document.getElementById('candyTyping');
  const echo = document.getElementById('candyEcho');
  const witchImg = document.getElementById('candyWitchImg');
  if (!room || !form || !input) return;

  const speaker = room.querySelector('.candy-speaker');
  const hostLabel = speaker.textContent;
  const SESSION_ID = room.dataset.session || '';

  let poses = [];
  const posesEl = document.getElementById('candyWitchPoses');
  if (posesEl) {
    try { poses = JSON.parse(posesEl.textContent) || []; } catch (e) { poses = []; }
  }

  const FAIL_TEXT = '刚才没听清，我们再试一次好吗？';

  let poseIndex = 0;
  let busy = false;

  // Restore history only until the first live exchange begins.
  let dialogueRevision = 0;

  /* ============================================================
   *  剧本疗愈模式（CrewAI 多智能体 CBT 治疗）
   * ------------------------------------------------------------
   *  点了「剧本疗愈」之后，这一个输入框就从「和小女巫闲聊」
   *  切换成「和治疗团队对话」：
   *    · 提交不再走 /chat/send，而是投给 /therapy/answer
   *    · 每 2 秒轮询 /therapy/state，拿到 agent 的新问题就冒泡
   *    · 按钮实时显示阶段（收集信息 → 生成剧本 → 角色扮演 → 总结）
   *    · 进行中再点一次按钮 = 主动结束本局
   *  女巫立绘照旧换姿势 —— 角色台词开头有「角色名：」，分得清是谁在说话。
   * ============================================================ */
  const therapyEntry = document.getElementById('therapyEntry');
  const therapy = {
    active: false,
    sid: null,
    pollTimer: null,
    lastQuestion: null,
    lastInviteTs: null,
    stage: -1,            // 进度条用：当前阶段
    scenarioShown: false, // 剧本卡一局只弹一次
  };

  /* ---- 浮层家族引用 ---- */
  const shelfEl = document.getElementById('therapyShelf');
  const shelfList = document.getElementById('shelfList');
  const setupEl = document.getElementById('therapySetup');
  const setupForm = document.getElementById('setupForm');
  const pickEl = document.getElementById('witchPick');
  const pickGrid = document.getElementById('witchPickGrid');
  const pickSub = document.getElementById('witchPickSub');
  const pickBack = document.getElementById('witchPickBack');
  const cardEl = document.getElementById('scenarioCard');
  const cardBody = document.getElementById('scenarioBody');
  const cardGo = document.getElementById('scenarioGo');
  const progressEl = document.getElementById('candyProgress');
  const visitorEl = document.getElementById('candyVisitor');
  const visitorImg = document.getElementById('candyVisitorImg');
  const visitorName = document.getElementById('candyVisitorName');
  const companionBtns = [document.getElementById('companionJournal'),
                         document.getElementById('companionDance')];
  const OVERLAYS = [shelfEl, setupEl, pickEl, cardEl];

  let openOverlay = null;
  let portraitRequest = 0;
  function showOverlay(el) {
    const previous = openOverlay;
    openOverlay = el;
    OVERLAYS.forEach((o) => { if (o) o.hidden = (o !== el); });
    room.querySelector('.candy-spread').inert = Boolean(el);
    room.querySelector('.candy-hud').inert = Boolean(el);
    // Keep the common return link reachable inside the active dialog's focus loop.
    const returnLink = room.querySelector('.destination-return');
    if (returnLink) (el || room.querySelector('.candy-hud')).prepend(returnLink);
    if (el) {
      const target = el.querySelector('.candy-card-title');
      target.tabIndex = -1;
      target.focus({preventScroll: true});
    } else if (previous && therapyEntry) {
      therapyEntry.focus({preventScroll: true});
    }
  }
  room.addEventListener('keydown', event => {
    if (!openOverlay || !openOverlay.contains(event.target)) return;
    if (event.key === 'Escape') {
      // Once a story start has been submitted, wait for its server response.
      if (pickBack && pickBack.disabled && openOverlay === pickEl) return;
      hideOverlays();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...openOverlay.querySelectorAll('button:not(:disabled), input, a[href]')]
      .filter(control => control.getClientRects().length > 0);
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0], last = controls[controls.length - 1];
    if ((event.shiftKey && (event.target === first || event.target.tabIndex < 0)) ||
        (!event.shiftKey && event.target === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  });
  function hideOverlays() { showOverlay(null); }

  /* 当前美术风格（开局表格与立绘生成跟着它走） */
  function currentStyle() {
    return document.documentElement.dataset.theme || 'cute';
  }

  function therapyBtn(text, active) {
    if (!therapyEntry) return;
    therapyEntry.textContent = text;
    therapyEntry.classList.toggle('is-active', !!active);
  }

  /* ---- 阶段进度条：女巫头顶的五个小圆点 ---- */
  function renderProgress(stage) {
    if (!progressEl || stage === undefined || stage === null) return;
    if (stage !== therapy.stage) therapy.stage = stage;
    progressEl.hidden = false;
    progressEl.querySelectorAll('i').forEach((dot) => {
      const s = parseInt(dot.dataset.s, 10);
      dot.classList.toggle('is-done', s < stage);
      dot.classList.toggle('is-now', s === stage);
    });
  }

  /* ---- 来做客的治愈女巫（相框小立绘）---- */
  function showVisitor(url, name) {
    if (!visitorEl || !visitorImg) return;
    if (!url) { visitorEl.hidden = true; return; }
    if (visitorImg.getAttribute('src') !== url) visitorImg.src = url;
    visitorName.textContent = name || '你的治愈女巫';
    visitorEl.hidden = false;
  }
  function hideVisitor() { if (visitorEl) visitorEl.hidden = true; }

  /* ---- 陪伴按钮：设过治愈女巫就一直亮着 ---- */
  async function refreshCompanionBtns() {
    try {
      const res = await fetch('/companion/current');
      const data = await res.json();
      const has = !!(data && data.ok && data.companion && data.companion.name);
      companionBtns.forEach((b) => { if (b) b.hidden = !has; });
    } catch (e) { /* 静默 */ }
  }
  if (companionBtns[0]) {
    companionBtns[0].addEventListener('click', () => { window.location.href = '/journal/create'; });
  }
  if (companionBtns[1]) {
    companionBtns[1].addEventListener('click', () => { window.location.href = '/garden/mirror'; });
  }

  /* ---- 剧本卡：剧本生成完弹一次 ---- */
  function _scenarioText(sc, keys) {
    for (const k of keys) { if (sc && sc[k]) return sc[k]; }
    return '';
  }
  function showScenarioCard(scenario) {
    if (!cardEl || !scenario) return;
    const topic = _scenarioText(scenario, ['scenario_topic', '治疗主题']) || '一段心灵旅程';
    const roles = _scenarioText(scenario, ['roles', '角色设定']) || [];
    const goals = _scenarioText(scenario, ['therapeutic_goals', '治疗目标']);
    let html = '<h4>主题</h4><div class="scenario-topic"></div>';
    if (roles.length) html += '<h4>你会遇见</h4><div class="scenario-roles"></div>';
    if (goals) html += '<h4>这一程的目标</h4><div class="scenario-goals"></div>';
    cardBody.innerHTML = html;
    cardBody.querySelector('.scenario-topic').textContent = topic;
    if (roles.length) {
      const box = cardBody.querySelector('.scenario-roles');
      roles.slice(0, 4).forEach((r) => {
        const chip = document.createElement('span');
        chip.className = 'scenario-role';
        chip.textContent = (r && (r.name || r['角色名'] || r['角色'])) || '神秘角色';
        box.appendChild(chip);
      });
    }
    if (goals) {
      const g = document.createElement('div');
      g.textContent = goals;
      cardBody.querySelector('.scenario-goals')?.appendChild(g);
    }
    showOverlay(cardEl);
  }
  if (cardGo) cardGo.addEventListener('click', hideOverlays);

  /* ---- 1. 入口：点大按钮 → 有历史开剧本架，没有直接开局表格 ---- */
  async function openTherapyEntry() {
    let sessions = [];
    try {
      const res = await fetch('/therapy/list');
      const data = await res.json();
      if (data && data.ok && Array.isArray(data.sessions)) sessions = data.sessions;
    } catch (e) { /* 列表失败就当没有历史 */ }
    if (sessions.length) renderShelf(sessions);
    else showSetupForm();
  }

  function _fmtDate(ts) {
    if (!ts) return '未知时间';
    const d = new Date(ts * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  const _STATUS_LABEL = { running: '进行中', done: '已走完', error: '中断' };
  let _lastPreset = null;   // 最近一次开局表格：开新本直接继承，只在第一次填表

  function renderShelf(sessions) {
    shelfList.innerHTML = '';
    _lastPreset = null;
    for (const s of sessions) {   // 列表已按创建时间倒序，第一个带表格的就是最近的开局
      if (s.preset && Object.values(s.preset).some((v) => String(v).trim())) {
        _lastPreset = s.preset;
        break;
      }
    }
    sessions.forEach((s) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'shelf-item';
      const sc = s.scenario || {};
      const name = sc.scenario_topic || sc['治疗主题'] || '未命名的剧本';
      const st = _STATUS_LABEL[s.status] || '中断';
      const main = document.createElement('span');
      main.className = 'shelf-item-main';
      const nm = document.createElement('div');
      nm.className = 'shelf-item-name';
      nm.textContent = name;
      const dates = document.createElement('div');
      dates.className = 'shelf-item-dates';
      dates.textContent = '创建 ' + _fmtDate(s.created_at) + ' · 最后对话 ' + _fmtDate(s.updated_at);
      const chip = document.createElement('span');
      chip.className = 'shelf-item-status' + (s.status === 'done' ? ' is-done' : '');
      chip.textContent = st;
      main.appendChild(nm); main.appendChild(dates);
      item.appendChild(main); item.appendChild(chip);
      item.addEventListener('click', () => resumeSession(s.session_id));
      shelfList.appendChild(item);
    });
    showOverlay(shelfEl);
  }

  /* ---- 2. 续接旧剧本：选中了就直接进，不再填表、不再等生图 ---- */
  async function resumeSession(sid) {
    try {
      const res = await fetch('/therapy/resume/' + sid, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        // 续不上（多半是还没来得及生成剧本就中断了）：留在剧本架，别把人推去填表
        shelfEl.querySelector('.candy-card-sub').textContent = '这本剧本还没写完，暂时无法续接。可以选另一本，或写一本新的。';
        return;
      }
      beginTherapy(sid, '欢迎回来，我们接着上次的地方继续走。');
    } catch (e) {
      shelfEl.querySelector('.candy-card-sub').textContent = '暂时无法连接，可以稍后再试。';
    }
  }

  /* ---- 3. 开局表格提交 → 生成 3 张女巫立绘 ---- */
  if (setupForm) {
    setupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(setupForm);
      const preset = {
        nickname: (fd.get('nickname') || '').toString().trim(),
        mood: (fd.get('mood') || '').toString().trim(),
        situation: (fd.get('situation') || '').toString().trim(),
        witch_look: (fd.get('witch_look') || '').toString().trim(),
        plot_pref: (fd.get('plot_pref') || '').toString().trim(),
        style: currentStyle(),
      };
      forgeWitches(preset);
    });
  }
  const setupBack = document.getElementById('setupBack');
  if (setupBack) setupBack.addEventListener('click', hideOverlays);
  const shelfClose = document.getElementById('shelfClose');
  if (shelfClose) shelfClose.addEventListener('click', hideOverlays);

  /* 开局表格只在第一次填：之后开新本直接继承，想改再点开改（预填上次的） */
  function showSetupForm() {
    if (_lastPreset && setupForm) {
      ['nickname', 'mood', 'situation', 'witch_look', 'plot_pref'].forEach((k) => {
        const f = setupForm.elements[k];
        if (f && _lastPreset[k]) f.value = _lastPreset[k];
      });
    }
    showOverlay(setupEl);
  }

  /* 二次起开新本：女巫带着记忆直接开始 —— 不填表、不等生图、沿用作伴的女巫 */
  async function quickStartNew() {
    hideOverlays();
    say('女巫记得你' + (_lastPreset && _lastPreset.nickname ? '，' + _lastPreset.nickname : '') +
        '——带着上次的开局直接出发，不用填表。');
    try {
      const res = await fetch('/therapy/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: { style: currentStyle() } }),  // 风格跟当下，其余后端继承
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        say('呜……' + ((data && data.msg) || '治疗团队没请到') + '。先去花园转转吧。');
        return;
      }
      beginTherapy(data.session_id,
        '治疗团队到啦，还是你熟悉的那位女巫。放轻松，想停随时再点一次右上角的剧本按钮。');
    } catch (err) {
      say('呜……连不上治疗团队了（' + ((err && err.message) || err) + '）');
    }
  }

  const shelfNew = document.getElementById('shelfNew');
  if (shelfNew) shelfNew.addEventListener('click', () => {
    if (_lastPreset) quickStartNew();
    else showSetupForm();
  });
  const shelfEdit = document.getElementById('shelfEdit');
  if (shelfEdit) shelfEdit.addEventListener('click', showSetupForm);

  /* 绘制中：三张微光占位卡 */
  function _renderForging() {
    pickSub.textContent = '魔法绘制中，大概需要一分钟……';
    pickBack.hidden = false;
    pickGrid.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const c = document.createElement('div');
      c.className = 'witch-card is-forging';
      c.innerHTML = '<span class="forge-shimmer"></span><span class="witch-card-name">绘制中…</span>';
      pickGrid.appendChild(c);
    }
    showOverlay(pickEl);
  }

  async function forgeWitches(preset) {
    const requestId = ++portraitRequest;
    _renderForging();
    let data = null;
    try {
      const res = await fetch('/therapy/witch_portraits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ look: preset.witch_look, style: preset.style }),
      });
      data = await res.json();
    } catch (e) { data = null; }
    if (requestId !== portraitRequest || openOverlay !== pickEl) return;
    if (data && data.ok && data.portraits && data.portraits.length) {
      renderWitchPick(data.portraits, preset);
    } else {
      // 云端没出图：改用屋里现成的立绘做「老朋友三选一」，流程不断
      renderWitchFallback(preset);
    }
  }

  /* 出图成功：三张候选卡 */
  function renderWitchPick(portraits, preset) {
    renderPortraitChoices(portraits, preset, true);
    pickSub.textContent = '选一位想和你一起走进故事的女巫。';
  }

  function renderWitchFallback(preset) {
    const storyPoses = JSON.parse(document.getElementById('storyPoses')?.textContent || '[]');
    renderPortraitChoices(storyPoses, preset, false);
    pickSub.textContent = storyPoses.length ? '暂时无法绘制新立绘，可以从小屋里的女巫中挑一位。' :
      '立绘暂时无法加载。可以返回修改描述，再试一次。';
  }

  function renderPortraitChoices(portraits, preset, personal) {
    pickBack.hidden = false;
    pickGrid.replaceChildren();
    portraits.slice(0, 3).forEach((url, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'witch-card';
      const img = document.createElement('img');
      img.src = url;
      img.alt = '女巫候选 ' + (index + 1);
      if (personal) img.dataset.personal = '';
      const caption = document.createElement('span');
      caption.className = 'witch-card-name';
      caption.textContent = '就选 TA';
      card.append(img, caption);
      card.addEventListener('click', () => {
        pickGrid.querySelectorAll('button').forEach(button => { button.disabled = true; });
        pickBack.disabled = true;
        chooseWitch({ url: url, desc: preset.witch_look }, preset)
          .finally(() => { pickBack.disabled = false; });
      });
      pickGrid.appendChild(card);
    });
  }
  if (pickBack) pickBack.addEventListener('click', showSetupForm);

  /* ---- 4. 选定女巫 → 登记陪伴者 → 开演 ---- */
  async function chooseWitch(witch, preset) {
    pickSub.textContent = '好，就是 TA 了。正在为你组建治疗团队……';
    try {
      await fetch('/companion/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '治愈女巫', description: preset.witch_look || '用户亲手选的治愈女巫',
          portrait: witch.url, topic: '',
        }),
      });
    } catch (e) { /* 陪伴者登记失败不挡路 */ }
    try {
      const res = await fetch('/therapy/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: preset, witch: witch }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        say('呜……' + ((data && data.msg) || '治疗团队没请到') + '。先去花园转转吧。');
        hideOverlays();
        return;
      }
      beginTherapy(data.session_id,
        '治疗团队到啦，你选的女巫也在里面。放轻松，想停随时再点一次右上角的剧本按钮。');
    } catch (err) {
      say('呜……连不上治疗团队了（' + ((err && err.message) || err) + '）');
      hideOverlays();
    }
  }

  /* ---- 5. 开演：统一入口（新局/续局都走这）---- */
  function beginTherapy(sid, hello) {
    hideOverlays();
    therapy.active = true;
    therapy.sid = sid;
    therapy.lastQuestion = null;
    therapy.lastInviteTs = null;
    therapy.stage = -1;
    therapy.scenarioShown = false;
    therapyBtn('准备中…', true);
    thinking();
    refreshCompanionBtns();
    if (hello) say(hello);
    therapyPoll();
    therapy.pollTimer = window.setInterval(therapyPoll, 2000);
  }

  async function therapyPoll() {
    if (!therapy.active || !therapy.sid) return;
    try {
      const res = await fetch('/therapy/state/' + therapy.sid);
      const data = await res.json();
      if (!data.ok) return;
      if (data.stage_name) therapyBtn(data.stage_name + '（点击结束）', true);
      if (data.stage !== undefined && data.stage !== null) renderProgress(data.stage);
      if (data.witch && data.witch.url) showVisitor(data.witch.url, null);
      // 剧本一生成就弹一次剧本卡，并将来做客的女巫换成剧本主角名
      if (data.scenario && !therapy.scenarioShown) {
        therapy.scenarioShown = true;
        showScenarioCard(data.scenario);
        const roles = data.scenario.roles || data.scenario['角色设定'] || [];
        if (roles.length && visitorEl && !visitorEl.hidden) {
          visitorName.textContent = (roles[0].name || roles[0]['角色名'] || '') + '（你的治愈女巫）';
        }
      }
      if (data.pending_question && data.pending_question !== therapy.lastQuestion) {
        therapy.lastQuestion = data.pending_question;
        nextPose();
        say(data.pending_question);
      }
      if (data.invitation && data.invitation.ts !== therapy.lastInviteTs) {
        therapy.lastInviteTs = data.invitation.ts;
        showInviteCard(data.invitation);
      }
      if (data.status === 'done') {
        therapyFinish('这一程走完了。治疗团队把这次的故事收进了你的剧本档案，谢谢你愿意走这一趟。');
      } else if (data.status === 'error') {
        console.log('[therapy] 中断原因:', data.error);
        therapyFinish('呜……治疗中途出了点状况，已为你保留记录，可以稍后从断点继续。');
      }
    } catch (e) { /* 轮询失败静默，下一次再试 */ }
  }

  function therapyFinish(msg) {
    window.clearInterval(therapy.pollTimer);
    therapy.active = false;
    therapy.sid = null;
    hideInviteCard();
    if (progressEl) progressEl.hidden = true;
    hideVisitor();
    hideOverlays();
    therapyBtn('剧本疗愈', false);
    if (msg) say(msg);
  }

  async function therapyStop() {
    if (!therapy.sid) return;
    const sid = therapy.sid;
    const hadScenario = therapy.stage >= 3;   // 剧本已生成，续接才有底气承诺
    try {
      await fetch('/therapy/stop/' + sid, { method: 'POST' });
    } catch (e) { /* 尽力而为 */ }
    therapyFinish(hadScenario
      ? '好，今天就到这里。剧本替你收好了，想继续的时候再来。'
      : '好，我们先走到这儿。这趟还没走出完整的剧本，下次来的时候我们重新出发。');
  }

  async function therapySend(text) {
    if (busy) return;
    busy = true;
    sendBtn.disabled = true;
    showEcho(text);
    input.value = '';
    autoGrow();
    nextPose();
    thinking();
    try {
      const res = await fetch('/therapy/answer/' + therapy.sid, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text }),
      });
      if (!res.ok) {
        say('呜……这句话没送到（HTTP ' + res.status + '），再说一次试试？');
      }
      /* 投递成功就先保持思考态，等轮询拿到下一个问题自然换上 */
    } catch (err) {
      say('呜……连不上治疗团队了（' + ((err && err.message) || err) + '）');
    } finally {
      busy = false;
      sendBtn.disabled = false;
      if (document.activeElement === sendBtn) input.focus({preventScroll: true});
    }
  }

  /* ---------------- 跨场馆邀请卡 ----------------
   * agent 调「场景邀请工具」→ state 里出现 invitation → 这里弹卡。
   * 10 秒倒计时结束自动跳转（老师说的「程序带用户飞转」），
   * 点「再坐会儿」随时取消 —— 去不去永远用户说了算。 */
  const inviteEl = document.getElementById('candyInvite');
  const inviteMsg = document.getElementById('candyInviteMsg');
  const inviteGo = document.getElementById('candyInviteGo');
  const inviteScene = document.getElementById('candyInviteScene');
  const inviteStay = document.getElementById('candyInviteStay');
  const inviteCount = document.getElementById('candyInviteCount');
  let inviteTimer = null;

  function hideInviteCard() {
    if (inviteTimer) { window.clearInterval(inviteTimer); inviteTimer = null; }
    if (inviteEl) inviteEl.hidden = true;
  }

  function showInviteCard(inv) {
    if (!inviteEl || !inv || !inv.url) return;
    hideInviteCard();
    nextPose();
    say('我觉得这会儿有个地方特别适合你，看看这张小卡片～');
    inviteMsg.textContent = inv.message || '';
    inviteScene.textContent = inv.name || '下一站';
    inviteGo.href = inv.url;
    let left = 10;
    inviteCount.textContent = left;
    inviteEl.hidden = false;
    inviteTimer = window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        hideInviteCard();
        window.location.href = inv.url;
        return;
      }
      inviteCount.textContent = left;
    }, 1000);
  }

  if (inviteStay) inviteStay.addEventListener('click', () => {
    hideInviteCard();
    say('好呀，那我们接着聊。');
  });
  if (inviteGo) inviteGo.addEventListener('click', hideInviteCard);

  if (therapyEntry) {
    therapyEntry.addEventListener('click', () => {
      if (therapy.active) therapyStop();
      else openTherapyEntry();
    });
  }
  refreshCompanionBtns();   // 进页面就看看有没有治愈女巫可以带着走


  /* ---------- 女巫的姿势 ---------- */
  function setPose(i, animate) {
    if (!witchImg || !poses.length) return;
    poseIndex = ((i % poses.length) + poses.length) % poses.length;
    const url = poses[poseIndex];
    if (!animate) { witchImg.src = url; return; }
    witchImg.classList.add('is-switching');
    window.setTimeout(() => {
      witchImg.src = url;
      witchImg.classList.remove('is-switching');
    }, 200);
  }
  function nextPose() { setPose(poseIndex + 1, true); }

  /* Sample the stationary button so a leaning portrait cannot move its own
     hit area. A tap or keyboard activation greets locally, without starting a chat. */
  const greet = document.getElementById('candyGreet');
  if (greet) {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const reply = document.getElementById('candyGreetReply');
    let frame = 0, timer = 0, pointerX = 0;

    function resetGreeting() {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      frame = 0;
      greet.classList.remove('is-near', 'is-greeting');
      greet.style.removeProperty('--greet-lean');
      reply.textContent = '';
    }
    function leanTowardPointer() {
      frame = 0;
      const bounds = greet.getBoundingClientRect();
      if (!bounds.width || motion.matches) return;
      const side = Math.max(-1, Math.min(1, (pointerX - bounds.left) * 2 / bounds.width - 1));
      greet.style.setProperty('--greet-lean', (2.8 * side).toFixed(2) + 'deg');
    }
    greet.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      greet.classList.add('is-near');
      pointerX = event.clientX;
      if (!motion.matches && !frame) frame = requestAnimationFrame(leanTowardPointer);
    }, {passive: true});
    greet.addEventListener('pointerleave', resetGreeting);
    greet.addEventListener('pointercancel', resetGreeting);
    window.addEventListener('blur', resetGreeting);
    motion.addEventListener('change', () => {
      cancelAnimationFrame(frame);
      frame = 0;
      greet.style.removeProperty('--greet-lean');
      if (!motion.matches && greet.classList.contains('is-near')) leanTowardPointer();
    });
    greet.addEventListener('click', () => {
      clearTimeout(timer);
      greet.classList.add('is-greeting');
      reply.textContent = room.dataset.gesture;
      timer = setTimeout(() => {
        greet.classList.remove('is-greeting');
        reply.textContent = '';
      }, 2600);
    });
  }

  /* ---------- 气泡 ---------- */
  const gotoChip = document.getElementById('candyGoto');
  function say(text) {
    speaker.textContent = hostLabel;
    dialogueRevision++;
    typing.hidden = true;
    bubbleText.hidden = false;
    bubbleText.textContent = text;      // 只给文本，不拼 HTML
    bubbleText.scrollTop = 0;
    bubble.classList.remove('is-thinking');
  }
  function showGoto(goto) {
    if (!gotoChip) return;
    if (goto && goto.url) {
      gotoChip.textContent = '→ 去' + goto.name;
      gotoChip.href = goto.url;
      gotoChip.hidden = false;
    } else {
      gotoChip.hidden = true;
    }
  }
  function thinking() {
    dialogueRevision++;
    bubbleText.hidden = true;
    typing.hidden = false;
    bubble.classList.add('is-thinking');
    showGoto(null);
  }

  /* ---------- 输入框：跟着内容长高，最多 132px ---------- */
  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 132) + 'px';
  }

  function showEcho(text) {
    if (!echo) return;
    echo.hidden = false;
    echo.textContent = '你：' + text;
  }

  /* ---------- 发消息 ---------- */
  async function send(text) {
    if (busy) return;
    busy = true;
    sendBtn.disabled = true;

    showEcho(text);
    input.value = '';
    autoGrow();
    nextPose();          // 每问一个问题就换一个姿势
    thinking();

    try {
      const res = await fetch('/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // persona='witch' 让后端换上小女巫的人设（俏皮魔法味 + 只说一两句）
        body: JSON.stringify({ message: text, session_id: SESSION_ID, persona: 'witch' }),
      });
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }

      if (!res.ok) {
        const why = (data && data.error) ? data.error : ('HTTP ' + res.status);
        say('呜……' + why + '。要不要再说一次？');
        showGoto(null);
      } else if (data && data.reply) {
        say(data.reply);
        showGoto(data.goto);          // 你说"想去哪"，气泡下面就出现直达芯片
      } else {
        say(FAIL_TEXT);
        showGoto(null);
      }
    } catch (err) {
      say('暂时没有连上（' + ((err && err.message) || err) + '）');
    } finally {
      busy = false;
      sendBtn.disabled = false;
      if (document.activeElement === sendBtn) input.focus({preventScroll: true});
    }
  }

  /* ---------- 交互绑定 ---------- */
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    if (therapy.active) therapySend(text);   // 剧本疗愈进行中 → 投给治疗团队
    else send(text);
  });

  input.addEventListener('input', autoGrow);

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    // 中文输入法正在选字：这个 Enter 属于输入法，不属于我们
    if (e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { cancelable: true }));
  });

  /* ---------- 进来先看看之前聊到哪了 ---------- */
  async function restore() {
    const revision = dialogueRevision;
    try {
      const res = await fetch('/chat/history');
      if (!res.ok) return;
      const msgs = await res.json();
      if (revision !== dialogueRevision || !Array.isArray(msgs) || !msgs.length) return;

      const asked = msgs.filter((m) => m.role === 'user');
      let lastReply = null;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') { lastReply = msgs[i]; break; }
      }

      // 接着上次聊，而不是又装作第一次见面
      if (lastReply && lastReply.content) {
        say(lastReply.content);
        speaker.textContent = '上次聊到这里';
      }
      if (asked.length) showEcho(asked[asked.length - 1].content);
      if (poses.length) setPose(asked.length, false);   // 姿势跟问过的次数对齐
    } catch (e) {
      /* 拿不到历史就保持打招呼，不影响继续聊 */
    }
  }

  /* ---------- 启动 ---------- */
  function init() {
    if (witchImg && poses.length) witchImg.src = poses[0];
    autoGrow();
    restore();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 供本地验收脚本读取
  window.__candyHouse = {
    ready: true,
    poses: () => poses.slice(),
    poseIndex: () => poseIndex,
    session: () => SESSION_ID,
    state: () => ({
      bubble: bubbleText.hidden ? '' : bubbleText.textContent,
      thinking: !typing.hidden,
      echo: echo && !echo.hidden ? echo.textContent : '',
      busy: busy,
    }),
    say: say,
  };
})();
