/* The lobby moves the sun in the current scene. Other theme pickers reload
   so their server-rendered illustrations match the saved choice. */
(() => {
  'use strict';

  function showVeil(name) {
    const veil = document.querySelector('.theme-veil');
    if (!veil) return;
    const text = veil.querySelector('.theme-veil-text');
    if (text && name) text.textContent = '正在把花园换成「' + name + '」…';
    veil.classList.add('on');
  }
  window.MGTheme = { veil: showVeil };

  async function saveTheme(theme) {
    const response = await fetch('/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    });
    if (!response.ok) throw new Error('Theme save failed');
    const data = await response.json();
    if (!data.ok || data.theme !== theme) throw new Error('Theme was not confirmed');
    return data;
  }

  const times = {
    cute: { period: 'morning', x: 16 },
    fresh: { period: 'noon', x: 50 },
    ugly: { period: 'night', x: 80 },
  };

  function sunOrbit(anchor, initialX) {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let x = initialX, destination = x, velocity = 0, frame = 0, lastTime = 0;

    function paint() {
      // One parabola through morning (16,20), noon (50,11) and night (80,20).
      const y = 20 + 9 * (x - 16) * (x - 80) / 1020;
      anchor.style.setProperty('--sun-x', x.toFixed(4) + '%');
      anchor.style.setProperty('--sun-y', y.toFixed(4) + '%');
    }
    function settle() {
      cancelAnimationFrame(frame);
      frame = 0;
      velocity = 0;
      x = destination;
      paint();
    }
    function step(now) {
      const dt = Math.max(0, (now - lastTime) / 1000);
      lastTime = now;
      // A critically damped spring retains its velocity when someone chooses
      // another time halfway through the journey.
      const rate = 9, offset = x - destination;
      const slope = velocity + rate * offset;
      const decay = Math.exp(-rate * dt);
      x = destination + (offset + slope * dt) * decay;
      velocity = (velocity - rate * slope * dt) * decay;
      if (Math.abs(x - destination) < .015 && Math.abs(velocity) < .2) {
        settle();
        return;
      }
      paint();
      frame = requestAnimationFrame(step);
    }
    motion.addEventListener('change', () => { if (motion.matches) settle(); });
    paint();
    return function moveTo(newX) {
      destination = newX;
      if (motion.matches) settle();
      else if (!frame && destination !== x) {
        lastTime = performance.now();
        frame = requestAnimationFrame(step);
      }
    };
  }

  function enableLobby(lobby) {
    const choices = Array.from(lobby.querySelectorAll('[data-theme-choice]'));
    const status = lobby.querySelector('#lobbyStatus');
    const enter = lobby.querySelector('#enterGarden');
    let saved = document.documentElement.dataset.theme;
    let selected = saved;
    const moveSun = sunOrbit(lobby.querySelector('#lobbySunAnchor'), times[saved].x);
    let saving = false, unconfirmed = false, nextLink = null;
    let preview;

    function warmCover() {
      if (!enter) return;
      const choice = choices.find(button => button.dataset.themeChoice === selected);
      if (!preview || preview.getAttribute('src') !== choice.dataset.cover) {
        preview = new Image();
        preview.src = choice.dataset.cover;
      }
    }

    function leave(link) {
      if (link === enter && window.GardenPassage) {
        warmCover();
        window.GardenPassage.depart(link.href, choices.find(button => button.dataset.themeChoice === selected));
      } else window.location.assign(link.href);
    }
    enter?.addEventListener('pointerenter', warmCover);
    enter?.addEventListener('focus', warmCover);

    function select(key) {
      selected = key;
      document.documentElement.dataset.theme = key;
      lobby.dataset.period = times[key].period;
      for (const button of choices) {
        const active = button.dataset.themeChoice === key;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      }
      moveSun(times[key].x);
    }

    async function synchronize() {
      if (saving) return;
      saving = true;
      status.textContent = '';
      // The session cookie and a signed-in user's preference both use the last
      // completed POST. Only one may be in flight; intermediate clicks coalesce.
      while (selected !== saved || unconfirmed) {
        const key = selected;
        try {
          await saveTheme(key);
          saved = key;
          unconfirmed = false;
        } catch {
          // A lost response may have reached the server. Send the latest
          // choice explicitly on retry, even if it matches the old selection.
          unconfirmed = true;
          if (selected !== key) continue;
          nextLink = null;
          select(saved);
          status.textContent = '未能确认风格已保存，请再点一次想要的时段。';
          break;
        }
      }
      saving = false;
      if (nextLink) {
        const link = nextLink;
        nextLink = null;
        leave(link);
      }
    }

    lobby.addEventListener('click', event => {
      const choice = event.target.closest('[data-theme-choice]');
      if (choice) {
        event.preventDefault();
        select(choice.dataset.themeChoice);
        warmCover();
        synchronize();
        return;
      }
      const link = event.target.closest('a[href]');
      if (!link || event.defaultPrevented ||
          event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey ||
          event.altKey || (link.target && link.target !== '_self')) return;
      if (!saving && !unconfirmed && (link !== enter || !window.GardenPassage)) return;
      event.preventDefault();
      if (saving || unconfirmed) {
        nextLink = link;
        synchronize();
      } else leave(link);
    });
    // Returning from a page restored by the back/forward cache must not reuse
    // the previous navigation when the next theme is selected.
    window.addEventListener('pageshow', () => { nextLink = null; });
  }

  const lobby = document.querySelector('#homeGarden');
  if (lobby) enableLobby(lobby);

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-theme-choice]');
    if (!button || lobby?.contains(button) || button.classList.contains('is-active')) return;
    event.preventDefault();
    const choices = document.querySelectorAll('[data-theme-choice]');
    choices.forEach(choice => { choice.disabled = true; });
    showVeil(button.querySelector('.tc-name')?.textContent);
    try {
      const data = await saveTheme(button.dataset.themeChoice);
      showVeil(data.name);
      window.setTimeout(() => window.location.reload(), 750);
    } catch {
      choices.forEach(choice => { choice.disabled = false; });
      document.querySelector('.theme-veil')?.classList.remove('on');
      alert('风格切换失败，请再试一次');
    }
  });
})();
