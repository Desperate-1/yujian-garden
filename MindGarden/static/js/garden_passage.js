// Only a trip started in the lobby carries its last frame across navigation.
(() => {
    'use strict';
    const layer = document.getElementById('gardenPassage');
    const html = document.documentElement;
    const key = 'mindgarden.entrance.v1';
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const isLobby = layer.dataset.page === 'home';
    let timer, recovery, navigating = false, finishDeparture;

    function hide() {
        clearTimeout(timer);
        clearTimeout(recovery);
        layer.hidden = true;
        delete layer.dataset.phase;
        delete html.dataset.gardenPassage;
        const main = document.getElementById(isLobby ? 'homeGarden' : 'paperGarden');
        if (main) main.inert = false;
        document.dispatchEvent(new Event('garden:arrived'));
    }

    function phase(name) {
        layer.dataset.phase = name;
        html.dataset.gardenPassage = name;
        layer.hidden = false;
    }

    function depart(href, choice) {
        if (navigating) return;
        navigating = true;
        const lobby = document.getElementById('homeGarden');
        const sky = document.getElementById('lobbySunAnchor').getBoundingClientRect();
        layer.style.setProperty('--passage-x', (sky.left + sky.width / 2) + 'px');
        layer.style.setProperty('--passage-y', (sky.top + sky.height / 2) + 'px');
        layer.style.setProperty('--passage-cover', 'url("' + choice.dataset.cover + '")');
        layer.dataset.theme = choice.dataset.themeChoice;
        lobby.inert = true;
        phase('depart');
        finishDeparture = (skip = false) => {
            if (layer.dataset.phase !== 'depart') return;
            clearTimeout(timer);
            phase('hold');
            try {
                sessionStorage.setItem(key, JSON.stringify({theme: layer.dataset.theme,
                    to: new URL(href).pathname, at: Date.now(), skip}));
            } catch { /* The link works when browser storage is disabled. */ }
            // If a provisional navigation is cancelled by the browser, the
            // original page stays alive and the lobby must become usable again.
            recovery = setTimeout(() => { navigating = false; hide(); }, 6500);
            window.location.assign(href);
        };
        timer = setTimeout(finishDeparture, motion.matches ? 120 : 760);
    }

    function takeArrival() {
        if (isLobby) return false;
        let ticket;
        try {
            ticket = JSON.parse(sessionStorage.getItem(key));
            sessionStorage.removeItem(key);
        } catch { /* Registration can still hand off via its same-origin referrer. */ }
        const navigation = performance.getEntriesByType('navigation')[0];
        if ((navigation && navigation.type !== 'navigate') || location.hash) return false;
        if (ticket) return !ticket.skip && ticket.theme === html.dataset.theme &&
            ticket.to === location.pathname && Date.now() - ticket.at < 30000;
        const from = document.referrer && new URL(document.referrer);
        return from && from.origin === location.origin && from.pathname === layer.dataset.register;
    }

    function reveal() {
        if (layer.dataset.phase !== 'hold' || isLobby) return;
        const viewport = document.querySelector('.paper-stage');
        const art = document.getElementById('illustratedOverview');
        if (!viewport || !art) { hide(); return; }
        // Land on the visible sheet. On tall screens the extra sky and grass
        // extend past the sheet; they are not part of the lobby cover image.
        const frame = viewport.getBoundingClientRect(), sheet = art.getBoundingClientRect();
        const edges = {
            top: Math.max(frame.top, sheet.top), left: Math.max(frame.left, sheet.left),
            right: html.clientWidth - Math.min(frame.right, sheet.right),
            bottom: innerHeight - Math.min(frame.bottom, sheet.bottom)
        };
        for (const [edge, value] of Object.entries(edges)) {
            layer.style.setProperty('--passage-' + edge, Math.max(0, value) + 'px');
        }
        clearTimeout(timer);
        phase('reveal');
        timer = setTimeout(hide, motion.matches ? 140 : 540);
    }

    if (takeArrival()) {
        phase('hold');
        document.addEventListener('DOMContentLoaded', () => {
            if (layer.dataset.phase !== 'hold') return;
            clearTimeout(timer);
            const garden = document.getElementById('paperGarden');
            garden.inert = true;
            const still = document.getElementById('paperStillImage');
            // Reveal the same illustration that the lobby expanded.
            if (still.complete && still.naturalWidth) reveal();
            else still.addEventListener('load', reveal, {once: true});
            if (layer.dataset.phase === 'hold') timer = setTimeout(reveal, 1100);
        }, {once: true});
        // Keep navigation usable if other page resources take too long.
        timer = setTimeout(reveal, 2400);
    }

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || layer.hidden) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (isLobby) finishDeparture?.(true);
        else hide();
    }, true);
    window.addEventListener('pageshow', e => {
        if (!e.persisted) return;
        navigating = false;
        hide();
    });
    window.GardenPassage = {depart};
})();
