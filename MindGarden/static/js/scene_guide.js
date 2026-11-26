/* Each step points to a real control. Conditional sections supply their own steps
   after the page reveals them, e.g. choosing an image or opening a script. */
(() => {
    'use strict';
    const root = document.getElementById('sceneGuide');
    if (!root) return;
    const page = root.dataset.page;
    const {host,house,scene,sky}=document.documentElement.dataset;
    const pages = {
        home: ['风格大厅', [
            ['.theme-picker-cards', '选一段天光', '从左到右是清晨、正午和入夜。轻点一个椭圆，看看日月怎样划过天空。键盘可以用 Tab 和回车选择。'],
            ['.home-enter', '从草地走进花园', document.querySelector('#enterGarden')
                ? '点「开始游园」，跟着日月的光走进刚选的风景。按 Esc 可以跳过转场。'
                : '扫过草尖，看它们顺着你的手摆动。点「开始游园」创建账号，已有账号可从右上角登录。'],
        ]],
        'auth.register': ['创建花园', [
            ['#username', '取一个用户名', '记住这个名字和下面设置的密码，下次回来就能找到自己的花园。'],
            ['#age_group', '选择年龄分组', '选好适合自己的分组，再点注册，创建账号。'],
        ]],
        'auth.login': ['回到花园', [
            ['#username', '输入你的账号', '填写注册时用的用户名和密码。'],
            ['.auth-container [type="submit"]', '推门回去', '点登录进入花园。在自己的设备上，还可以勾选「记住我」。'],
        ]],
        'creation.garden': ['愈见花园', []],
        'journal.create': ['树洞日记', [
            ['#content', '记下今天的一刻', '在纸上写下此刻的感受，哪怕只有一个词。'],
            ['#voice-btn', '也可以说给树洞听', '点语音输入并允许使用麦克风，说完再点一次。转成的文字可以继续修改。'],
            ['.nb-save', '把这一页收好', '写完后点这里保存。想看看过去的记录，可以点「翻翻以前的日记」。'],
        ]],
        'journal.index': ['日记本', [
            ['.journal-container > .btn-primary', '打开一张新纸', '从这里开始写今天的记录。'],
            ['.journal-table', '翻看过去的日子', '保存过的日记会按日期列在这里。点记录的查看入口，就能读到全文。'],
        ]],
        'journal.detail': ['日记内页', [
            ['.content-box', '读读当时写的话', '这里留着这一天的原文。上方可以看到记录的时间。'],
            ['.btn-back', '回到日记本', '返回列表，继续翻看其他日子。'],
        ]],
        'chat.candy_house': [house, [
            ['#candyGreet', '和'+host+'打个招呼', '把鼠标移近她，她会朝你侧身。轻点她或按回车，她也会回应。'],
            ['#candyInput', '和主人聊聊天', '在这里写下想说的话，点发送。她的回答会出现在屋里的对话框中。'],
            ['#therapyEntry', '一起演一段故事', '想换一种聊天方式，可以打开剧本架，创建或继续自己的故事。'],
        ]],
        'creation.mirror': ['喷泉舞厅', [
            ['#buddyChips', '挑一位舞伴', '选一位喜欢的小伙伴。点「3D 歪歪」还可以转动模型看看它。'],
            ['#danceModePicker .dance-mode-cards', '决定今天怎么玩', '舞厅预览可以自由活动。选择「舞动起来」，晨景可选舞曲，正午和入夜可跟随领舞进行无配乐练习。'],
            ['#startCamera', '让舞伴看见动作', '点开启摄像头，在浏览器中允许访问，再站到全身入镜的位置。想留住姿势时可以拍照。'],
        ]],
        'creation.gallery': ['疗愈回廊', [
            ['.garden-create-link', '挂上自己的作品', '从这里开始一次创作。已经创作过的图片、立体作品和音乐会分区陈列。'],
            ['.work-interactions', '留下你的喜欢', '作品下方可以点赞和收藏。再点一次同一个按钮可以取消。'],
            ['.garden-back-link', '回花园继续逛', '看完展览，可以回到花园里挑选下一个景点。'],
        ]],
        'creation.create_page': ['创作工坊', [
            ['.camera-controls', '先准备一张照片', '拍下眼前的画面，或点「从相册选择」上传图片。选好后就能挑创作类型。'],
            ['#intent-input', '给作品一点方向', '可以写下此刻的情绪，或在下方点选期望的心情。两项都可以留空。'],
        ]],
        'chat.index': ['对话伙伴', [
            ['#message-input', '从一句话开始', '在输入框里写下想说的话，也可以点麦克风录音。'],
            ['#send-btn', '发给对话伙伴', '点发送，留意上方的对话区。你可以接着对方的回复继续聊。'],
        ]],
        'chat.chat_history_all': ['对话记录', [
            ['#new-chat-btn', '开启一段新对话', '想另起一个话题，可以从这里开始。'],
            ['#sessions-list', '继续上次的话题', '已有的对话会列在这里，点选后就能回看并继续聊天。'],
        ]],
    };
    if (!pages[page]) return;
    if (document.querySelector('.destination-return') && page !== 'creation.garden' && page !== 'creation.gallery') {
        pages[page][1].push(['.destination-return','从这里回到花园','点左上角的纸签，回到刚才游览的景点。']);
    }

    // First matching visible panel wins. A panel with no steps is a busy/game
    // state where a floating card would get in the way.
    const subpages = {
        'creation.garden': [
            ['#paperEntrance.is-on', scene, [
                ['#walkPath', '走近喷泉', '点右边的喷泉，或从这里看池边的近景。画里的小屋、树洞和回廊也都可以点。'],
                ['#illustratedOverview', '试试移动天光', '拖动画里的'+sky+'，或用 Tab 选中它后按方向键移动。鼠标掠过树洞，树冠也会轻轻摆动。'],
                ['#gardenDestinations summary', '直接进入玩法', '点地点名字可直接进入。想先走到门前看看，选旁边的「看近景」。'],
            ]],
            ['#paperPool.is-on', '走到喷泉旁', [
                ['[data-object="fountain"]', '从水面划过', '把鼠标划过池水，看水纹散开。也可以用 Tab 选中水池。'],
                ['#enterDance', '从池边进舞厅', '点喷泉或这个按钮进入舞厅。点左上角的返回按钮可回到全景。'],
            ]],
            ...[
                ['candy',house,'轻敲门环','点门环等'+host+'出来，再点她或门口就能进屋聊天。'],
                ['journal','树洞日记','抽出题笺','先点信封，然后点展开的题笺，坐到树洞书桌前写日记。'],
                ['gallery','艺术回廊','翻一页展画','点画框翻过第一幅，再点画框进入展厅。想继续翻画，点下方的「翻看下一幅」。']
            ].map(([key,title,action,copy])=>['#paperVisit.is-on[data-place="'+key+'"]',title,[
                ['#visitAction',action,copy],['#visitEnter','直接走进去','也可以随时点这里进入。用 Tab 选中画中的物件，用空格操作，或选中下方入口按回车进入。']
            ]]),
        ],
        'creation.create_page': [
            ['#loading', '', []],
            ['#result-section', '完成创作', [
                ['#result-section .btn-primary', '去回廊看成品', '作品已经收进回廊。点这里欣赏，也可以选择继续创作。'],
            ]],
            ['#type-select-section', '创作工坊', [
                ['.type-radio-group', '为照片选一种形式', '在创作类型中选一项，图片、动画、立体作品和音乐各有不同。'],
                ['#generate-btn', '开始生成', '确认照片和创作类型后点这里。可以在当前页查看生成进度。'],
            ]],
        ],
        'chat.candy_house': [
            ['#scenarioCard', '剧本开场', [
                ['#scenarioGo', '读完故事开场', '点开始演绎，回到对话框，跟随角色的问题推进故事。'],
            ]],
            ['#witchPick', '选择角色', [
                ['#witchPickSub', '等候候选角色', '角色准备好后，点一张喜欢的画像，继续生成剧本。'],
            ]],
            ['#therapySetup', '创作剧本', [
                ['#setupForm [name="mood"]', '说说现在的心情', '填写昵称和此刻的心情，写下让你在意的事。'],
                ['#setupForm [name="witch_look"]', '描述故事里的伙伴', '写下希望看见的形象，再点表格下方的生成按钮。'],
            ]],
            ['#therapyShelf', '剧本架', [
                ['#shelfNew', '选一本，或写一本', '点旧剧本可以接着演。想从头开始，就点「写一本新剧本」。'],
            ]],
            ['#candyProgress', '故事进行中', [
                ['#candyInput', '回应角色的问题', '读完角色的话，在这里写下你的回应，点发送继续故事。'],
                ['#therapyEntry', '想休息时', '可以点这里结束当前这段演绎。'],
            ]],
        ],
        'creation.mirror': [
            ['#danceResult', '本局成绩', [
                ['#danceAgainBtn', '再跳一曲', '看过成绩，可以再来一局，或返回选择换一首歌。'],
            ]],
            ['#danceHud', '', []],
            ['#photoPreview', '舞厅照片', [
                ['#photoSaveBtn', '留下这张照片', '可以保存到本机，也可以重拍。'],
                ['#photoToGalleryBtn', '把姿势变成作品', '点这里带着照片去创作工坊。'],
            ]],
            ['#blob3dViewer', '立体舞伴', [
                ['#blob3dCanvas', '转着看看歪歪', '按住画面拖动，就能从不同方向看它。看完点关闭返回舞厅。'],
            ]],
            ['#danceTrackRow', '节奏跟跳', [
                ['#danceTrackSelect', '准备跟跳', '选好舞曲或无配乐练习，开启摄像头，然后点开始跳舞。'],
            ]],
        ],
    };
    const q = selector => document.querySelector(selector);
    const card = q('#sgCard');
    const launch = q('#sgLaunch');
    const next = q('#sgNext');
    const back = q('#sgBack');
    const prefix = [['creation.garden','chat.candy_house'].includes(page) ? 'mg-guide-seasons-v1-'+document.documentElement.dataset.theme : 'mg-guide-v1', root.dataset.reader, page].join('.');
    const seen = new Set();
    const states = subpages[page] || [];
    let context, steps, index, target, frame;
    if (page === 'creation.mirror') q('#bearMirrorModal')?.append(root);

    function visible(element) {
        return element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
    }
    function remember(key) {
        seen.add(key);
        try { localStorage.setItem(key, '1'); } catch { /* keep in memory */ }
    }
    function remembered(key) {
        try { return seen.has(key) || localStorage.getItem(key) === '1'; }
        catch { return seen.has(key); }
    }
    function detectContext() {
        const panel = states.find(([selector]) => visible(q(selector)));
        return panel || ['main', ...pages[page]];
    }
    function close() {
        const restoreFocus = card.contains(document.activeElement);
        if (target) target.classList.remove('sg-target');
        target = null;
        card.hidden = true;
        launch.setAttribute('aria-expanded', 'false');
        if (restoreFocus && !launch.hidden) launch.focus({ preventScroll: true });
    }
    function placeLaunch() {
        const panel = context[0] === 'main' ? null : q(context[0]);
        const heading = panel?.querySelector('.candy-card-title, .g3d-near-scene.on h2, .blob3d-caption, h3') ||
            (page === 'creation.mirror' && q('.mirror-heading h2'));
        const host = heading || q('.lobby-header') || q('.paper-tools') || q('.candy-hud') || q('.g3d-tools') || q('nav .nav-links') || root;
        if (host !== launch.parentNode) host.append(launch);
        launch.classList.toggle('sg-floating', host === root);
        launch.classList.toggle('sg-in-heading', Boolean(heading));
        launch.hidden = !context[2].length;
    }
    function position() {
        frame = 0;
        if (!target || card.hidden) return;
        const r = target.getBoundingClientRect();
        const w = card.offsetWidth, h = card.offsetHeight;
        const viewport = window.visualViewport;
        const x0 = (viewport?.offsetLeft || 0) + 12, y0 = (viewport?.offsetTop || 0) + 12;
        const x1 = x0 + (viewport?.width || innerWidth) - 24;
        const y1 = y0 + (viewport?.height || innerHeight) - 24;
        let x = r.left, y = r.bottom + 12;
        if (r.right + w + 18 <= x1) { x = r.right + 12; y = r.top; }
        else if (r.left - w - 18 >= x0) { x = r.left - w - 12; y = r.top; }
        else if (y + h > y1 && r.top - y0 > y1 - r.bottom) { y = r.top - h - 12; }
        if (page === 'home' && innerWidth <= 670) {
            x = (innerWidth - w) / 2;
            y = r.top - h - 14;
        }
        card.style.left = Math.max(x0, Math.min(x, x1 - w)) + 'px';
        card.style.top = Math.max(y0, Math.min(y, y1 - h)) + 'px';
    }
    function queuePosition() {
        if (!card.hidden && !frame) frame = requestAnimationFrame(position);
    }
    function showStep(n, scroll) {
        const [selector, title, description] = steps[n];
        const element = q(selector);
        if (!visible(element)) { start(false); return; }
        if (target) target.classList.remove('sg-target');
        target = element;
        index = n;
        target.classList.add('sg-target');
        q('#sgLabel').textContent = context[1];
        q('#sgTitle').textContent = title;
        q('#sgDescription').textContent = description;
        q('#sgCount').textContent = (n + 1) + ' / ' + steps.length;
        back.hidden = n === 0;
        next.textContent = n === steps.length - 1 ? '知道了' : '下一步';
        card.hidden = false;
        launch.setAttribute('aria-expanded', 'true');
        const rect = target.getBoundingClientRect();
        if (scroll && (rect.top < 60 || rect.bottom > innerHeight - 20)) {
            target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        }
        position();
    }
    function start(manual, firstStep = 0) {
        steps = context[2].filter(([selector]) => visible(q(selector)));
        if (!steps.length) { close(); return; }
        showStep(Math.min(firstStep, steps.length - 1), true);
        if (manual) next.focus({ preventScroll: true });
    }
    function refresh() {
        if (document.documentElement.dataset.gardenPassage) return;
        const found = detectContext();
        if (context && found[0] === context[0]) return;
        if (context && !card.hidden) remember(prefix + '.' + context[0]);
        close();
        context = found;
        placeLaunch();
        if (launch.hidden || remembered(prefix + '.skip') || remembered(prefix + '.' + context[0]) ||
            q('#crisis-box') || document.activeElement?.matches('input,textarea,select')) return;
        start(false);
    }
    function finish(skipAll) {
        remember(prefix + '.' + context[0]);
        if (skipAll) remember(prefix + '.skip');
        close();
    }
    function advance() {
        if (index + 1 < steps.length) showStep(index + 1, true);
        else finish(false);
    }
    launch.addEventListener('click', () => card.hidden ? start(true) : finish(false));
    next.addEventListener('click', advance);
    back.addEventListener('click', () => showStep(index - 1, true));
    q('#sgSkip').addEventListener('click', () => finish(true));
    document.addEventListener('keydown', e => {
        if (card.hidden || e.isComposing) return;
        if (e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation(); finish(true);
        } else if (card.contains(e.target)) {
            if (e.key === 'ArrowRight') { e.preventDefault(); advance(); }
            if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); showStep(index - 1, true); }
        }
    }, true);
    document.addEventListener('click', e => {
        if (card.hidden || card.contains(e.target) || launch.contains(e.target)) return;
        const control = e.target.closest('a,button,input,textarea,select,label[for]');
        if (!control) return;
        if (page === 'home' && control.dataset.themeChoice) {
            if (index === 0) advance();
            return;
        }
        finish(false);
    }, true);
    document.addEventListener('scroll', queuePosition, { passive: true, capture: true });
    window.addEventListener('resize', queuePosition, { passive: true });
    window.visualViewport?.addEventListener('resize', queuePosition);
    window.visualViewport?.addEventListener('scroll', queuePosition);
    const observer = new MutationObserver(refresh);
    for (const [selector] of states) {
        // Watch the panel itself even while the selector's active class is absent.
        const panel = q(selector.split('.')[0]);
        if (panel) observer.observe(panel, { attributes: true, attributeFilter: ['hidden', 'style', 'class','data-place'] });
    }
    document.addEventListener('garden:arrived', refresh);
    refresh();
})();
