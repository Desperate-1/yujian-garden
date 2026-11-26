import {visitPages} from './paper_visit_pages.js';

const byId = id => document.getElementById(id);
const garden = byId('paperGarden'), board = byId('illustratedOverview');
const map = byId('gardenDestinations'), sky = byId('gardenSky');
const sections = new Map([...garden.querySelectorAll('[data-scene]')].map(el => [el.dataset.scene, el]));
const links = new Map([...map.querySelectorAll('[data-play]')].map(el => [el.dataset.play, el]));
const frames = {candy: 0, journal: 0, gallery: 0};
const host = document.documentElement.dataset.host;
const enterLabel = {candy:'进屋找'+host, journal:'坐下写日记', gallery:'走进展厅'};
const prints = ['entrance.webp','journal-detail.webp','fountain-detail.webp'];
const printNames = ['花径','树下','池光'];
let place = 'entrance';

function describe() {
    const panel = sections.get(place);
    const object = panel.querySelector('.illustrated-object');
    const index = frames[place], opened = index > 0;
    object.dataset.open = String(opened);
    if (place === 'candy') object.querySelector('.illustrated-guest').hidden = !opened;
    if (place === 'gallery') {
        const image = object.querySelector('img');
        image.src = new URL(prints[index], panel.querySelector('.illustrated-detail-art').src).href;
        image.alt = '《'+printNames[index]+'》';
    }
    const page = visitPages[place][index];
    byId('visitAction').textContent = page.label;
    byId('paperHint').textContent = place === 'gallery'
        ? '《'+printNames[index]+'》 · '+(opened?'点画框进展厅，也可以继续翻画。':'点画框翻看下一幅。') : page.hint;
    object.setAttribute('aria-label', opened ? enterLabel[place] : page.label);
}

function go(requested, focus = true) {
    const previous = place;
    place = sections.has(requested) ? requested : 'entrance';
    const home = place === 'entrance', pool = place === 'fountain';
    garden.dataset.view = place;
    map.open = false;
    board.hidden = !home;
    for (const [key, section] of sections) {
        section.hidden = key !== place;
        section.classList.toggle('on', key === place);
    }
    garden.classList.toggle('near-open', !home);
    byId('gardenReturn').hidden = home;
    byId('paperPlace').textContent = home ? document.documentElement.dataset.scene : links.get(place).textContent.trim();
    byId('paperVisit').dataset.place = place;
    for (const panel of garden.querySelectorAll('.paper-actions')) {
        panel.classList.toggle('is-on', panel.id === (home?'paperEntrance':pool?'paperPool':'paperVisit'));
    }
    if (home) {
        byId('paperHint').textContent = '点小屋、树洞、喷泉或回廊，看看画里的近景。';
    } else {
        const section = sections.get(place), img = section.querySelector('.illustrated-detail-art');
        if (!img.hasAttribute('src') || section.dataset.missingArt) {
            delete section.dataset.missingArt;
            img.src = img.dataset.src;
            section.style.setProperty('--detail-backdrop', 'url("'+img.dataset.src+'")');
        }
        if (pool) byId('paperHint').textContent = '划过池水，看涟漪散开。点喷泉进入舞厅。';
        else {
            const enter = byId('visitEnter');
            enter.href = links.get(place).href;
            enter.textContent = enterLabel[place]+' →';
            describe();
        }
    }
    const hash = home ? '' : '#'+place;
    if (location.hash !== hash) {
        history.replaceState(history.state, '', location.pathname + location.search + hash);
    }
    if (focus) {
        const target = home ? board.querySelector('[data-place="'+previous+'"]') || byId('walkPath')
            : sections.get(place).querySelector('.illustrated-object');
        target.focus({preventScroll: true});
    }
    garden.dispatchEvent(new Event('garden:view'));
}

function turn() {
    if (!Object.hasOwn(frames, place)) return;
    frames[place] = (frames[place] + 1) % visitPages[place].length;
    describe();
}
function ordinaryClick(event) {
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
for (const link of garden.querySelectorAll('[data-map],[data-destination],#gardenReturn,#walkPath')) {
    link.addEventListener('click', e => {
        if (!ordinaryClick(e)) return;
        e.preventDefault();
        go(link.dataset.map || link.dataset.destination || (link.id === 'walkPath' ? 'fountain' : 'entrance'));
    });
}
byId('visitAction').addEventListener('click',turn);
for (const [key, section] of sections) {
    const object = section.querySelector('.illustrated-object');
    const illustration = section.querySelector('.illustrated-detail-art');
    illustration.addEventListener('error', () => {
        section.dataset.missingArt = 'true';
        if (place !== key) return;
        byId('paperHint').textContent = '近景插画暂未载入，可从下方直接进入。';
        if (document.activeElement === object) {
            byId(key === 'fountain' ? 'enterDance' : 'visitEnter').focus({preventScroll:true});
        }
    });
    object.addEventListener('click', e => {
        if (!ordinaryClick(e) || key === 'fountain' || frames[key]) return;
        e.preventDefault();
        turn();
    });
    object.addEventListener('keydown', e => {
        if (e.key !== ' ' || key === 'fountain') return;
        e.preventDefault();
        turn();
    });
}
const menus = [...garden.querySelectorAll('.paper-header details')];
document.addEventListener('click', e => {
    for (const menu of menus) if (!menu.contains(e.target)) menu.open = false;
});
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    for (const menu of menus) if (menu.open) {
        menu.open = false;
        menu.querySelector('summary').focus();
        return;
    }
    if (place !== 'entrance') go('entrance');
});
window.addEventListener('hashchange',() => go(location.hash.slice(1)));

const player = byId('g3dMusic'), musicSlot = byId('paperAudio');
if (player && musicSlot) {
    musicSlot.append(player);
    musicSlot.parentElement.hidden = false;
}

// Layer coordinates are fractions of the entire illustration, including the
// off-screen bleed in portrait. Keep the printed light and its hit area together.
let offsetX = 0, offsetY = 0, drag = null;
function moveLight(dx, dy) {
    const styles = getComputedStyle(board);
    const x = parseFloat(styles.getPropertyValue('--orb-x')) / 100;
    const y = parseFloat(styles.getPropertyValue('--orb-y')) / 100;
    const rect = board.getBoundingClientRect();
    const windowRect = board.parentElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const left = Math.max(.06, (windowRect.left - rect.left) / rect.width + .035);
    const right = Math.min(.94, (windowRect.right - rect.left) / rect.width - .035);
    offsetX = Math.min(right - x, Math.max(left - x, offsetX + dx / rect.width));
    offsetY = Math.min(.28 - y, Math.max(.075 - y, offsetY + dy / rect.height));
    board.style.setProperty('--sky-dx', (offsetX * rect.width) + 'px');
    board.style.setProperty('--sky-dy', (offsetY * rect.height) + 'px');
}
sky.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !e.isPrimary) return;
    drag = {id: e.pointerId, x: e.clientX, y: e.clientY};
    sky.setPointerCapture(e.pointerId);
});
sky.addEventListener('pointermove', e => {
    if (drag?.id !== e.pointerId) return;
    moveLight(e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX;
    drag.y = e.clientY;
});
for (const event of ['pointerup','pointercancel','lostpointercapture']) sky.addEventListener(event,() => {drag=null;});
sky.addEventListener('keydown', e => {
    const step = {ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8]}[e.key];
    if (step) {
        e.preventDefault();
        moveLight(...step);
    }
});
new ResizeObserver(() => { if(offsetX || offsetY) moveLight(0,0); }).observe(board);
board.querySelector('[data-place="journal"]').addEventListener('pointerenter',() => board.classList.add('tree-brushed'));
board.addEventListener('animationend',e => { if (e.animationName==='illustrated-branch') board.classList.remove('tree-brushed'); });

const layers = [...board.querySelectorAll('.illustrated-layers img')];
function readyToPaint(img) {
    if (typeof img.decode === 'function') return img.decode();
    if (img.complete) return img.naturalWidth ? Promise.resolve() : Promise.reject();
    return new Promise((resolve, reject) => {
        img.addEventListener('load', resolve, {once:true});
        img.addEventListener('error', reject, {once:true});
    });
}
Promise.all(layers.map(readyToPaint)).then(() => {
    board.dataset.painted='true';
    sky.hidden=false;
}).catch(() => { /* The complete printed panorama and its four links stay available. */ });
go(location.hash.slice(1),false);
garden.dataset.ready='true';
