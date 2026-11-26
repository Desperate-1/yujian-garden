/* ================================================================
   树洞日记 · 小精灵陪伴
   ----------------------------------------------------------------
   陪伴节奏（重点是「不打扰」）：
     · 进页面时小精灵打个招呼，然后安静趴着
     · 用户停笔 18 秒、且比上次回应多写了 30 字以上 → 轻声说一句
     · 每篇日记最多回应 3 次 —— 陪，但不吵
     · 用户一动笔，气泡就悄悄收起来
     · 点「写好啦」时小精灵说一句告别语（本地话术，不等接口，
       随后表单正常提交 —— 危机识别等原有流程完全不受影响）
   ================================================================ */
(function () {
  var spriteEl = document.getElementById('deskSprite');
  var bubble = document.getElementById('spriteBubble');
  var bubbleText = document.getElementById('spriteBubbleText');
  var typing = document.getElementById('spriteTyping');
  var textarea = document.getElementById('content');
  if (!spriteEl || !bubble || !textarea) return;

  var persona = { name: '小栖', kind: 'sprite' };
  try {
    var raw = document.getElementById('spritePersona');
    if (raw && raw.textContent) {
      var parsed = JSON.parse(raw.textContent);
      if (parsed && parsed.name) persona = parsed;
    }
  } catch (e) { /* 用默认小栖 */ }

  var PAUSE_MS = 8000;       // 停笔多久就算"停下来歇口气"（原 18s 太苛刻，实测用户停不了那么久）
  var MIN_NEW_CHARS = 15;    // 比上次回应至少多写这么多才值得说
  var MAX_REACTIONS = 5;     // 一篇日记最多说五次 —— 陪，但不吵
  var MILESTONES = [150, 400]; // 长文里程碑：写到这个字数主动开口夸，不用等停笔

  var pauseTimer = null;
  var hideTimer = null;
  var lastReactedLen = 0;
  var lastReactionAt = 0;
  var reactions = 0;
  var waiting = false;
  var milestonesHit = {};

  function showBubble(text) {
    bubbleText.textContent = text;
    bubbleText.hidden = false;
    typing.hidden = true;
    bubble.hidden = false;
    spriteEl.classList.add('is-chatting');
  }

  function showTyping() {
    bubbleText.hidden = true;
    typing.hidden = false;
    bubble.hidden = false;
    spriteEl.classList.add('is-chatting');
  }

  function hideBubble() {
    bubble.hidden = true;
    spriteEl.classList.remove('is-chatting');
  }

  function scheduleHide(delay) {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hideBubble, delay);
  }

  /* ---- 打招呼：让桌角先"有人" ---- */
  var greeting = persona.kind === 'script'
    ? '是我呀，' + persona.name + '。你写，我在桌角陪着你。'
    : '嗨，我是' + persona.name + '。你写，我在桌角陪着你。';
  window.setTimeout(function () {
    showBubble(greeting);
    scheduleHide(6000);
  }, 900);

  /* ---- 停笔检测 + 长文里程碑 ---- */
  function onInput() {
    window.clearTimeout(pauseTimer);
    pauseTimer = window.setTimeout(maybeReact, PAUSE_MS);
    // 一动笔就把气泡悄悄收走，不挡视线（多留 4 秒，免得回复一闪而过）
    if (!bubble.hidden && typing.hidden) scheduleHide(4000);

    // 里程碑：写到 150 / 400 字时主动开口，不管停没停笔
    var len = textarea.value.trim().length;
    for (var i = 0; i < MILESTONES.length; i++) {
      var m = MILESTONES[i];
      if (len >= m && !milestonesHit[m]) {
        if (!waiting && reactions < MAX_REACTIONS &&
            Date.now() - lastReactionAt > 8000) {
          milestonesHit[m] = true;
          window.setTimeout(maybeReact, 1200);
        }
        break;
      }
    }
  }
  textarea.addEventListener('input', onInput);

  async function maybeReact() {
    if (waiting || reactions >= MAX_REACTIONS) return;
    var text = textarea.value.trim();
    if (text.length - lastReactedLen < MIN_NEW_CHARS) return;
    lastReactedLen = text.length;
    lastReactionAt = Date.now();
    reactions += 1;
    waiting = true;
    showTyping();
    try {
      var res = await fetch('/journal/companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: text.slice(-800) }),
      });
      var data = await res.json();
      if (data && data.ok && data.reply) {
        showBubble(data.reply);
        scheduleHide(14000);   // 说完了多留一会儿，让用户慢慢读完
      } else {
        hideBubble();
      }
    } catch (e) {
      hideBubble();            // 网络异常就安静待着，不报错吓人
    } finally {
      waiting = false;
    }
  }

  /* ---- 收进树洞时的告别（本地话术，随后表单正常提交）---- */
  var form = textarea.closest('form');
  if (form) {
    form.addEventListener('submit', function () {
      window.clearTimeout(pauseTimer);
      window.clearTimeout(hideTimer);
      showBubble('写好啦？我帮你把它轻轻放进树洞里…… 🌱');
    });
  }
})();
