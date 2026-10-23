// SPDX-License-Identifier: GPL-3.0-or-later
// TV mode: a full-screen "10-foot" layout for listening from the couch. Big covers in rows,
// a highlight you move with a game controller (Xbox, PlayStation…), a TV remote's arrow keys
// or the keyboard, and a big Now Playing screen. It draws its own screens over the web app
// with your server's data, and plays through the web app's own player, so progress,
// sessions and syncing work exactly as usual. View → TV mode (F10); "Start in TV mode"
// opens it when the app starts.
//
// pageMain runs inside the Audiobookshelf page (main.js injects it with executeJavaScript);
// it is written as normal code here and sent as text. Calling it again opens or closes it
// ({ open }) and updates its texts.

/* global window, document, navigator, requestAnimationFrame, cancelAnimationFrame, CSS */
function pageMain(opts) {
  const $n = window.$nuxt;
  if (!$n || !$n.$store || !$n.$router || !$n.$axios || !$n.$eventBus || !$n.$store.state.user.user) return false;
  const TV = window.__absdaTv || (window.__absdaTv = {});
  TV.opts = opts;
  if (TV.installed) {
    if (opts.open && !TV.visible) TV.open();
    else if (!opts.open && TV.visible) TV.close();
    else if (TV.visible && TV.refresh) TV.refresh();   // e.g. a button lock changed in the menu
    return true;
  }
  TV.installed = true;
  const store = $n.$store, ax = $n.$axios, html = document.documentElement;
  const S = () => $n.$strings || {};
  const L = (k, fb) => S()[k] || fb;
  const T = (k) => (TV.opts.t && TV.opts.t[k]) || k;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
  const ICON = {
    home: svg("M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"),
    lib: svg("M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"),
    podcast: svg("M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"),
    search: svg("M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"),
    np: svg("M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h3v-8H5v-1a7 7 0 0 1 14 0v1h-3v8h3c1.1 0 2-.9 2-2v-7a9 9 0 0 0-9-9z"),
    exit: svg("M13 3h-2v10h2V3zm4.83 2.17-1.42 1.42A6.92 6.92 0 0 1 19 12c0 3.87-3.13 7-7 7A6.995 6.995 0 0 1 7.58 6.58L6.17 5.17A8.932 8.932 0 0 0 3 12a9 9 0 0 0 18 0c0-2.74-1.23-5.18-3.17-6.83z"),
    play: svg("M8 5v14l11-7z"),
    pause: svg("M6 19h4V5H6v14zm8-14v14h4V5h-4z"),
    back: svg("M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"),
    fwd: svg("M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"),
    prev: svg("M6 6h2v12H6zm3.5 6 8.5 6V6z"),
    next: svg("M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"),
    speed: svg("M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z"),
    sleep: svg("M9.5 2c-1.82 0-3.53.5-5 1.35 2.99 1.73 5 4.95 5 8.65s-2.01 6.92-5 8.65c1.47.85 3.18 1.35 5 1.35 5.52 0 10-4.48 10-10S15.02 2 9.5 2z"),
    list: svg("M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"),
    info: svg("M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"),
    read: svg("M21 5c-1.1-.35-2.3-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"),
    check: svg("M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"),
    sort: svg("M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"),
    upd: svg("M12 4l-8 8h5v8h6v-8h5z"),
    gear: svg("M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"),
    pad: svg("M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"),
    erase: svg("M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"),
  };

  // ---- look ------------------------------------------------------------------
  const style = el("style");
  style.id = "absda-tv-style";
  style.textContent = `
    #absda-tv { position: fixed; inset: 0; z-index: 9000; display: flex; flex-direction: column; overflow: hidden;
      font-size: clamp(15px, 2.05vh, 40px); line-height: 1.3; color: #f4f4f4; user-select: none;
      background: radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--tb-logo, #f0a848) 10%, var(--color-bg, #232323)) 0%, var(--color-primary, #141414) 65%); }
    #absda-tv.tv-away { display: none; }
    #absda-tv.tv-nocursor, #absda-tv.tv-nocursor * { cursor: none !important; }
    #absda-tv svg { display: block; }
    #absda-tv .tv-f:focus, #absda-tv .tv-f:focus-visible { outline: none; }
    #absda-tv .tv-bg { position: absolute; inset: -80px; z-index: 0; background-size: cover; background-position: center;
      filter: blur(50px) saturate(1.25) brightness(.3); opacity: 0; transition: opacity .6s; pointer-events: none; }
    #absda-tv .tv-bg.on { opacity: 1; }
    #absda-tv .tv-main { position: relative; z-index: 1; }
    /* The side menu (like Plex): icons down the left; it opens with the names while you're in it. */
    #absda-tv .tv-nav { position: absolute; z-index: 6; left: 0; top: 0; bottom: 0; width: 4.9em; display: flex; flex-direction: column;
      gap: .3em; padding: 1.4em .75em; overflow: hidden; transition: width .18s ease, background .18s ease, box-shadow .18s ease;
      background: linear-gradient(90deg, rgba(0,0,0,.45), rgba(0,0,0,0)); }
    #absda-tv .tv-nav.open, #absda-tv:not(.tv-nocursor) .tv-nav:hover { width: 17.5em;
      background: linear-gradient(90deg, color-mix(in srgb, var(--color-primary, #141414) 97%, black) 75%, color-mix(in srgb, var(--color-primary, #141414) 88%, transparent));
      box-shadow: 1.5em 0 3em rgba(0,0,0,.55); }
    #absda-tv .tv-navl { display: flex; flex-direction: column; gap: .3em; flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; margin: 0 -.3em; padding: 0 .3em; }
    #absda-tv .tv-navl::-webkit-scrollbar { display: none; }
    #absda-tv .tv-navb { display: flex; flex-direction: column; gap: .3em; flex: none; }
    #absda-tv .tv-ni.tv-upd { opacity: 1; color: var(--tb-logo, #f0a848); }
    #absda-tv .tv-ni.tv-upd.tv-on { color: #141414; }
    #absda-tv .tv-ni.tv-upd::after { content: ""; position: absolute; left: 2.1em; top: .45em; width: .55em; height: .55em; border-radius: 50%;
      background: var(--tb-logo, #f0a848); box-shadow: 0 0 0 .15em var(--color-primary, #141414); }
    #absda-tv .tv-toast { position: absolute; z-index: 21; left: 50%; top: 1.2em; transform: translateX(-50%); display: flex; align-items: center; gap: .6em;
      padding: .55em 1.3em; border-radius: 2em; background: rgba(15,15,15,.9); box-shadow: 0 .4em 1.2em rgba(0,0,0,.5); pointer-events: none; font-weight: 600; }
    #absda-tv .tv-toast svg { width: 1.2em; height: 1.2em; color: var(--tb-logo, #f0a848); }
    #absda-tv .tv-toast[hidden] { display: none; }
    #absda-tv .tv-mnote { opacity: .8; max-width: 40em; margin: -.2em 0 1em; line-height: 1.4; }
    #absda-tv .tv-navsep { height: 1px; margin: .4em .4em; background: rgba(255,255,255,.12); flex: none; }
    #absda-tv .tv-ni { display: flex; align-items: center; gap: 1em; padding: .62em .82em; border-radius: .7em; flex: none; position: relative;
      white-space: nowrap; opacity: .7; cursor: pointer; transition: background .12s, opacity .12s; }
    #absda-tv .tv-ni svg, #absda-tv .tv-ni .abs-icons { width: 1.35em; height: 1.35em; font-size: 1.35em; line-height: 1; flex: none; display: grid; place-items: center; }
    #absda-tv .tv-ni > span:last-child { opacity: 0; transition: opacity .12s; overflow: hidden; text-overflow: ellipsis; }
    #absda-tv .tv-nav.open .tv-ni > span:last-child, #absda-tv:not(.tv-nocursor) .tv-nav:hover .tv-ni > span:last-child { opacity: 1; }
    #absda-tv .tv-ni.tv-cur { opacity: 1; color: var(--tb-logo, #f0a848); }
    #absda-tv .tv-ni.tv-cur::before { content: ""; position: absolute; left: -.75em; top: 22%; bottom: 22%; width: .22em; border-radius: 0 .2em .2em 0; background: var(--tb-logo, #f0a848); }
    #absda-tv .tv-ni.tv-on { opacity: 1; background: var(--tb-logo, #f0a848); color: #141414; }
    #absda-tv .tv-clock { position: absolute; z-index: 4; top: 1.1em; right: 2.4em; font-size: 1.05em; opacity: .8; font-variant-numeric: tabular-nums;
      text-shadow: 0 1px 4px rgba(0,0,0,.7); pointer-events: none; }
    #absda-tv .tv-main { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 1.2em 2.4em 5.5em 6.6em; scrollbar-width: none; }
    #absda-tv .tv-main::-webkit-scrollbar, #absda-tv .tv-track::-webkit-scrollbar, #absda-tv .tv-mlist::-webkit-scrollbar { display: none; }
    #absda-tv .tv-loading, #absda-tv .tv-empty { opacity: .6; font-size: 1.3em; padding: 1.5em 0; }
    #absda-tv .tv-h1 { font-size: 1.9em; font-weight: 700; margin: .1em 0 .5em; display: flex; align-items: center; gap: .5em; }
    #absda-tv .tv-h1 small { font-size: .5em; font-weight: 400; opacity: .7; }
    /* rows of covers */
    #absda-tv .tv-row { margin: 0 0 1.5em; }
    #absda-tv .tv-row h2 { font-size: 1.22em; font-weight: 600; margin: 0 0 .45em; display: flex; gap: .6em; align-items: baseline; }
    #absda-tv .tv-chip { font-size: .6em; font-weight: 400; padding: .15em .75em; border-radius: 999px;
      background: color-mix(in srgb, var(--tb-logo, #f0a848) 25%, transparent); color: color-mix(in srgb, var(--tb-logo, #f0a848) 55%, white); }
    #absda-tv .tv-track { display: flex; gap: 1.1em; overflow-x: auto; overflow-y: hidden; scrollbar-width: none;
      padding: .8em .9em 1.1em; margin: -.8em -.9em -1.1em; }
    #absda-tv .tv-card { flex: none; width: 7.6em; cursor: pointer; }
    #absda-tv .tv-card.sq { width: 9.6em; }
    #absda-tv .tv-card.big { width: 9.4em; }
    #absda-tv .tv-card.big.sq { width: 12em; }
    #absda-tv .tv-cover { position: relative; aspect-ratio: 1 / 1.6; border-radius: .35em; overflow: hidden; background: #2a2a2a;
      box-shadow: 0 .4em 1em rgba(0,0,0,.5); transition: transform .14s ease, box-shadow .14s ease; }
    #absda-tv .tv-card.sq .tv-cover, #absda-tv .tv-card.au .tv-cover { aspect-ratio: 1; }
    #absda-tv .tv-card.au .tv-cover { border-radius: 50%; }
    #absda-tv .tv-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
    #absda-tv .tv-cover.noimg { display: flex; align-items: center; justify-content: center; padding: .6em; text-align: center;
      font-weight: 600; font-size: .85em; background: linear-gradient(160deg, color-mix(in srgb, var(--tb-logo, #f0a848) 40%, #222), #181818); }
    #absda-tv .tv-card.au .tv-cover.noimg { font-size: 2.2em; }
    #absda-tv .tv-card.tv-on .tv-cover { transform: scale(1.07); box-shadow: 0 0 0 .2em var(--tb-logo, #f0a848), 0 .8em 2em rgba(0,0,0,.65); }
    #absda-tv .tv-bar { position: absolute; left: 0; bottom: 0; height: .3em; background: var(--tb-logo, #f0a848); }
    #absda-tv .tv-badge { position: absolute; top: .4em; right: .4em; min-width: 1.6em; height: 1.6em; padding: 0 .45em; border-radius: .8em;
      background: var(--tb-logo, #f0a848); color: #141414; font-weight: 700; font-size: .72em; line-height: 1.6em; text-align: center;
      box-shadow: 0 .15em .4em rgba(0,0,0,.5); }
    #absda-tv .tv-badge svg { width: 1.1em; height: 1.1em; margin-top: .25em; }
    #absda-tv .tv-badge.l { right: auto; left: .4em; }
    #absda-tv .tv-ct { margin-top: .55em; font-size: .82em; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #absda-tv .tv-cm { font-size: .7em; opacity: .65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #absda-tv .tv-card.tv-on .tv-ct { color: color-mix(in srgb, var(--tb-logo, #f0a848) 70%, white); }
    #absda-tv .tv-card.au { text-align: center; }
    #absda-tv .tv-all .tv-cover { display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.08); font-size: .9em; font-weight: 600; }
    #absda-tv .tv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(7.6em, 1fr)); gap: 1.4em 1.3em; }
    #absda-tv .tv-grid.sq { grid-template-columns: repeat(auto-fill, minmax(9.6em, 1fr)); }
    #absda-tv .tv-grid.au { grid-template-columns: repeat(auto-fill, minmax(7.2em, 1fr)); }
    #absda-tv .tv-grid .tv-card { width: auto; }
    /* buttons, links, lists */
    #absda-tv .tv-btn { display: inline-flex; align-items: center; gap: .5em; padding: .6em 1.3em; border-radius: 999px; cursor: pointer;
      background: rgba(255,255,255,.11); font-size: .95em; font-weight: 600; white-space: nowrap; transition: transform .12s, background .12s; }
    #absda-tv .tv-btn svg { width: 1.25em; height: 1.25em; }
    #absda-tv .tv-btn.tv-cur { box-shadow: inset 0 0 0 .12em color-mix(in srgb, var(--tb-logo, #f0a848) 70%, transparent); }
    #absda-tv .tv-btn.tv-on, #absda-tv .tv-link.tv-on, #absda-tv .tv-li.tv-on, #absda-tv .tv-key.tv-on, #absda-tv .tv-round.tv-on {
      background: var(--tb-logo, #f0a848); color: #141414; }
    #absda-tv .tv-btn.tv-on { transform: scale(1.06); }
    #absda-tv .tv-btns { display: flex; gap: .7em; flex-wrap: wrap; margin: 1.1em 0 .4em; }
    #absda-tv .tv-tabs { display: flex; gap: .5em; flex-wrap: wrap; margin: 0 0 1.3em; }
    #absda-tv .tv-link { display: inline-block; padding: .12em .6em; border-radius: .4em; background: rgba(255,255,255,.08); cursor: pointer; }
    #absda-tv .tv-li { display: flex; align-items: center; gap: 1em; padding: .6em 1em; border-radius: .5em; cursor: pointer; }
    #absda-tv .tv-li .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #absda-tv .tv-li small { opacity: .7; font-variant-numeric: tabular-nums; white-space: nowrap; }
    #absda-tv .tv-li.cur:not(.tv-on) { color: var(--tb-logo, #f0a848); }
    #absda-tv .tv-li .tv-lbar { width: 4em; height: .25em; border-radius: .2em; background: rgba(255,255,255,.15); overflow: hidden; flex: none; }
    #absda-tv .tv-li .tv-lbar i { display: block; height: 100%; background: currentColor; }
    #absda-tv .tv-li svg { width: 1.1em; height: 1.1em; flex: none; }
    #absda-tv .tv-list { max-width: 60em; }
    #absda-tv .tv-sw { position: relative; flex: none; width: 2.6em; height: 1.4em; border-radius: .7em; background: rgba(255,255,255,.2); transition: background .15s; }
    #absda-tv .tv-sw::after { content: ""; position: absolute; top: .15em; left: .15em; width: 1.1em; height: 1.1em; border-radius: 50%; background: #fff; transition: transform .15s; }
    #absda-tv .tv-sw.on { background: var(--tb-logo, #f0a848); }
    #absda-tv .tv-sw.on::after { transform: translateX(1.2em); }
    #absda-tv .tv-li.tv-on .tv-sw { background: rgba(0,0,0,.25); }
    #absda-tv .tv-li.tv-on .tv-sw.on { background: #141414; }
    #absda-tv .tv-note { opacity: .65; margin: .2em 0 1.2em; max-width: 50em; }
    #absda-tv .tv-set { max-width: 52em; }
    #absda-tv .tv-set h2 { font-size: 1.25em; margin: 1.2em 0 .3em; color: color-mix(in srgb, var(--tb-logo, #f0a848) 75%, white); }
    #absda-tv .tv-set h2:first-child { margin-top: 0; }
    #absda-tv .tv-set h3 { font-size: .95em; font-weight: 600; opacity: .7; margin: .9em 0 .2em 1em; }
    #absda-tv .tv-setsub { margin-left: 1em; }
    #absda-tv .tv-li .val { opacity: .75; white-space: nowrap; max-width: 45%; overflow: hidden; text-overflow: ellipsis; }
    #absda-tv .tv-li.tv-dis { opacity: .45; }
    #absda-tv .tv-padname { margin: 0 0 1em; display: flex; align-items: center; gap: .5em; }
    #absda-tv .tv-padname svg { width: 1.4em; height: 1.4em; }
    /* a book */
    #absda-tv .tv-item { display: flex; gap: 2.4em; align-items: flex-start; padding-top: .4em; }
    #absda-tv .tv-big { flex: none; height: 52vh; aspect-ratio: 1 / 1.6; border-radius: .5em; overflow: hidden; background: #2a2a2a; box-shadow: 0 1em 3em rgba(0,0,0,.6); }
    #absda-tv .tv-big.sq { aspect-ratio: 1; }
    #absda-tv .tv-big img { width: 100%; height: 100%; object-fit: cover; display: block; }
    #absda-tv .tv-info { flex: 1; min-width: 0; }
    #absda-tv .tv-info h1 { font-size: 2.1em; line-height: 1.15; margin: 0 0 .15em; }
    #absda-tv .tv-sub { font-size: 1.1em; opacity: .8; margin-bottom: .5em; }
    #absda-tv .tv-line { margin: .35em 0; display: flex; flex-wrap: wrap; gap: .45em; align-items: center; }
    #absda-tv .tv-line > span:first-child { opacity: .6; }
    #absda-tv .tv-facts { opacity: .8; margin: .5em 0; }
    #absda-tv .tv-desc { margin: .9em 0 0 -.5em; padding: .3em .5em; max-width: 62em; line-height: 1.45; opacity: .85; border-radius: .4em; cursor: pointer;
      display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
    #absda-tv .tv-desc.tv-on { opacity: 1; box-shadow: inset 0 0 0 .14em var(--tb-logo, #f0a848); }
    #absda-tv .tv-head { display: flex; gap: 1.4em; align-items: center; margin-bottom: 1.2em; }
    #absda-tv .tv-head .tv-av { width: 6em; height: 6em; border-radius: 50%; overflow: hidden; flex: none; background: #2a2a2a; }
    #absda-tv .tv-head .tv-av img { width: 100%; height: 100%; object-fit: cover; }
    #absda-tv .tv-head .tv-av.noimg { display: grid; place-items: center; font-size: 2em; font-weight: 700;
      background: linear-gradient(160deg, color-mix(in srgb, var(--tb-logo, #f0a848) 40%, #222), #181818); }
    #absda-tv .tv-head .tv-h1 { margin: 0; }
    /* now playing */
    #absda-tv .tv-np { display: flex; gap: 3.2em; align-items: center; justify-content: center; min-height: 100%; padding-bottom: 2em; }
    #absda-tv .tv-np .tv-big { height: 58vh; }
    #absda-tv .tv-npi { flex: 0 1 44em; min-width: 0; }
    #absda-tv .tv-npi h1 { font-size: 2.2em; line-height: 1.15; margin: 0 0 .2em; }
    #absda-tv .tv-npi .au { font-size: 1.15em; opacity: .8; }
    #absda-tv .tv-npi .ch { font-size: 1.15em; margin-top: .9em; color: color-mix(in srgb, var(--tb-logo, #f0a848) 75%, white); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #absda-tv .tv-prog { height: .45em; border-radius: .25em; background: rgba(255,255,255,.16); margin: .8em 0 .45em; overflow: hidden; }
    #absda-tv .tv-prog i { display: block; height: 100%; background: var(--tb-logo, #f0a848); }
    #absda-tv .tv-times { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; opacity: .8; font-size: .9em; }
    #absda-tv .tv-pgroup.book { margin-top: 1.1em; }
    #absda-tv .tv-pgroup[hidden] { display: none; }
    #absda-tv .tv-plabel { display: flex; justify-content: space-between; gap: 1em; font-size: .85em; opacity: .75; }
    #absda-tv .tv-prog.thin { height: .3em; margin: .35em 0 .4em; }
    #absda-tv .tv-pgroup.book .tv-prog i { background: color-mix(in srgb, var(--tb-logo, #f0a848) 55%, white); }
    #absda-tv .tv-ctrls { display: flex; gap: 1.1em; align-items: center; margin: 1.4em 0 1.1em; }
    #absda-tv .tv-round { position: relative; width: 3.3em; height: 3.3em; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
      background: rgba(255,255,255,.1); transition: transform .12s, background .12s; }
    #absda-tv .tv-round svg { width: 1.6em; height: 1.6em; }
    #absda-tv .tv-round.main { width: 4.6em; height: 4.6em; background: rgba(255,255,255,.2); }
    #absda-tv .tv-round.main svg { width: 2.4em; height: 2.4em; }
    #absda-tv .tv-round.tv-on, #absda-tv .tv-round.main.tv-on { transform: scale(1.1); background: var(--tb-logo, #f0a848); color: #141414; }
    #absda-tv .tv-round b { position: absolute; bottom: .3em; font-size: .5em; }
    /* search */
    #absda-tv .tv-search { display: flex; gap: 2.6em; align-items: flex-start; }
    #absda-tv .tv-kb { flex: none; }
    #absda-tv .tv-q { font-size: 1.4em; padding: .4em .7em; border-radius: .5em; background: rgba(255,255,255,.08); min-height: 1.4em; margin-bottom: .8em;
      width: 9.6em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #absda-tv .tv-q.empty { opacity: .5; }
    #absda-tv .tv-keys { display: grid; grid-template-columns: repeat(7, 2.3em); gap: .35em; }
    #absda-tv .tv-key { height: 2.3em; display: grid; place-items: center; border-radius: .4em; background: rgba(255,255,255,.08); cursor: pointer; font-weight: 600; }
    #absda-tv .tv-key.wide { grid-column: span 2; font-size: .8em; height: 2.875em; }
    #absda-tv .tv-key svg { width: 1.3em; height: 1.3em; }
    #absda-tv .tv-res { flex: 1; min-width: 0; }
    /* mini player, hints, pop-up lists */
    #absda-tv .tv-mini { position: absolute; z-index: 3; left: 6.6em; bottom: 1em; display: flex; gap: .8em; align-items: center; max-width: 42vw;
      padding: .45em 1.1em .45em .45em; border-radius: .8em; background: rgba(0,0,0,.6); backdrop-filter: blur(10px); }
    #absda-tv .tv-mini img { height: 2.9em; width: auto; max-width: 2.9em; object-fit: cover; border-radius: .3em; }
    #absda-tv .tv-mini .tx { min-width: 0; }
    #absda-tv .tv-mini .t { font-weight: 600; font-size: .85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #absda-tv .tv-mini .m { font-size: .7em; opacity: .7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #absda-tv .tv-mini .p { height: .2em; border-radius: .1em; background: rgba(255,255,255,.2); margin-top: .35em; overflow: hidden; }
    #absda-tv .tv-mini .p i { display: block; height: 100%; background: var(--tb-logo, #f0a848); }
    #absda-tv .tv-mini svg { width: 1.4em; height: 1.4em; flex: none; }
    #absda-tv[data-screen="np"] .tv-mini { display: none; }
    #absda-tv .tv-hints { position: absolute; z-index: 3; right: 2.4em; bottom: 1.4em; display: flex; gap: 1.2em; font-size: .72em;
      padding: .5em 1.1em; border-radius: 999px; background: rgba(0,0,0,.6); backdrop-filter: blur(10px); color: rgba(255,255,255,.85); }
    #absda-tv .tv-hints:empty { display: none; }
    #absda-tv .tv-hints span { display: inline-flex; align-items: center; white-space: nowrap; }
    #absda-tv .tv-g { display: inline-grid; place-items: center; min-width: 1.7em; height: 1.7em; padding: 0 .35em; margin-right: .4em; border-radius: .85em;
      font-weight: 700; background: rgba(255,255,255,.2); color: #fff; }
    #absda-tv .tv-modal { position: absolute; inset: 0; z-index: 10; display: grid; place-items: center; background: rgba(0,0,0,.62); }
    #absda-tv .tv-mbox { min-width: 22em; max-width: 72vw; max-height: 82vh; display: flex; flex-direction: column; padding: 1.2em;
      border-radius: 1em; background: var(--color-bg, #262626); box-shadow: 0 1em 3em rgba(0,0,0,.6); }
    #absda-tv .tv-mbox h2 { margin: 0 0 .6em; font-size: 1.3em; }
    #absda-tv .tv-mlist { overflow-y: auto; scrollbar-width: none; }
    #absda-tv .tv-text { overflow-y: auto; line-height: 1.5; white-space: pre-wrap; max-width: 52em; margin-bottom: 1em; scrollbar-width: thin; }
    #absda-tv .tv-vol { position: absolute; z-index: 20; left: 50%; top: 2.2em; transform: translateX(-50%); display: flex; align-items: center; gap: .8em;
      padding: .6em 1.3em; border-radius: 2em; background: rgba(15,15,15,.85); pointer-events: none; font-weight: 600; }
    #absda-tv .tv-vol[hidden] { display: none; }
    #absda-tv .tv-vol svg { width: 1.3em; height: 1.3em; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    #absda-tv .tv-vbar { width: 11em; height: .35em; border-radius: .2em; background: rgba(255,255,255,.25); overflow: hidden; }
    #absda-tv .tv-vbar i { display: block; height: 100%; background: #fff; }
    #absda-tv .tv-vol b { min-width: 3.2em; text-align: right; }
    /* Screen saver: black, with a dimmed card that moves now and then (no burn-in on the TV). */
    #absda-tv .tv-saver { position: absolute; inset: 0; z-index: 30; background: #000; opacity: 0; transition: opacity 1.5s ease; cursor: none; }
    #absda-tv .tv-saver.on { opacity: 1; }
    #absda-tv .tv-scard { position: absolute; display: flex; gap: 1.4em; align-items: center; width: 34em; max-width: 80vw; opacity: .5; transition: opacity 1.2s ease; }
    #absda-tv .tv-scard.fade { opacity: 0; }
    #absda-tv .tv-scard img { height: 11em; width: auto; max-width: 11em; border-radius: .4em; object-fit: cover; flex: none; }
    #absda-tv .tv-scard .tx { min-width: 0; flex: 1; }
    #absda-tv .tv-scard .t { font-size: 1.3em; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #absda-tv .tv-scard .m { opacity: .75; margin-top: .3em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #absda-tv .tv-scard .p { height: .25em; border-radius: .15em; background: rgba(255,255,255,.2); margin: .8em 0 .4em; overflow: hidden; }
    #absda-tv .tv-scard .p i { display: block; height: 100%; background: #fff; }
    #absda-tv .tv-scard .l { opacity: .65; font-size: .85em; }
    #absda-tv .tv-scard .p.b { height: .18em; margin-top: .5em; }
    #absda-tv .tv-scard .p.b i { background: rgba(255,255,255,.7); }
    #absda-tv .tv-scard .c { font-size: 2.4em; font-weight: 300; margin-top: .25em; font-variant-numeric: tabular-nums; }
    #absda-tv .tv-scard.clock { width: auto; }
    #absda-tv .tv-scard.clock .c { font-size: 4.5em; margin: 0; }
    #absda-tv .tv-scard .p[hidden] { display: none; }
  `;
  document.head.append(style);

  // ---- data helpers ----------------------------------------------------------
  const libs = () => store.state.libraries.libraries || [];
  const libOf = (id) => libs().find((l) => l.id === id);
  const squareLib = (id) => { const l = libOf(id); return !!(l && l.settings && l.settings.coverAspectRatio === 1); };
  const md = (it) => (it && it.media && it.media.metadata) || {};
  const titleOf = (it) => (it && it.recentEpisode && it.recentEpisode.title) || md(it).title || "?";
  const authorOf = (it) => md(it).authorName || md(it).author || (md(it).authors || []).map((a) => a.name).join(", ");
  const isAudio = (it) => !!it && (it.mediaType === "podcast" || !!(it.media && (it.media.numTracks > 0 || it.media.duration > 0 || it.media.numAudioFiles > 0 || (it.media.tracks && it.media.tracks.length))));
  const isEbook = (it) => !!(it && it.media && (it.media.ebookFormat || it.media.ebookFile));
  const progOf = (id, epId) => { try { return store.getters["user/getUserMediaProgress"](id, epId) || null; } catch (e) { return null; } };
  const fracOf = (p) => (!p ? 0 : p.isFinished ? 1 : p.ebookProgress > 0 && !(p.duration > 0) ? p.ebookProgress : p.progress || 0);
  const pretty = (s) => ($n.$elapsedPretty ? $n.$elapsedPretty(s) : Math.round(s / 60) + " min");
  const stamp = (s) => {
    if ($n.$secondsToTimestamp) return $n.$secondsToTimestamp(s);
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0");
  };
  const leftText = (sec) => String(L("LabelTimeLeft", "{0} left")).replace("{0}", pretty(sec));
  const base = () => ($n.$config && $n.$config.routerBasePath) || "";
  const coverOf = (it, w) => {
    try {
      const u = store.getters["globals/getLibraryItemCoverSrc"](it);
      return w && /\/cover\?/.test(u) ? u + "&width=" + w : u;
    } catch (e) { return ""; }
  };
  const hasCover = (it) => !!(it && it.media && it.media.coverPath);
  const authorImg = (a) => (a.imagePath ? `${base()}/api/authors/${a.id}/image?ts=${a.updatedAt || 0}&width=300` : "");
  const seriesOf = (it) => {
    const m = md(it);
    if (Array.isArray(m.series)) return m.series;
    return m.series && m.series.id ? [m.series] : [];
  };
  const jumpSecs = () => { const u = store.state.user.settings || {}; return [u.jumpBackwardAmount || 10, u.jumpForwardAmount || 10]; };

  // The web app's player (its own component; we only steer it).
  const player = () => { const c = document.getElementById("mediaPlayerContainer"); const p = c && c.__vue__; return p && p.streamLibraryItem ? p : null; };
  const pcall = (fn) => { const p = player(); if (p) { try { fn(p); } catch (e) {} } setTimeout(updateLive, 150); };
  const togglePlay = () => pcall((p) => (p.isPlaying ? p.mediaSessionPause() : p.mediaSessionPlay()));
  // Volume (the right stick, up / down), while a book is loaded. Set through the web app's own
  // volume control, so the player, its slider and the level it saves (localStorage "volume")
  // all follow; without the control, on the player directly.
  const findVolume = (vm, depth = 0) => {
    if (!vm || depth > 8) return null;
    if (vm.$data && "trackHeight" in vm.$data && "volume" in vm) return vm;
    for (const c of vm.$children || []) { const f = findVolume(c, depth + 1); if (f) return f; }
    return null;
  };
  let volPill = null, volTimer = null;
  function changeVolume(delta) {
    const p = player();
    if (!p) return;
    const vc = findVolume(p);
    let now = vc ? Number(vc.volume) : NaN;
    if (!isFinite(now)) { try { now = parseFloat(localStorage.getItem("volume")); } catch (e) {} }
    const v = Math.max(0, Math.min(1, Math.round(((isFinite(now) ? now : 1) + delta) * 100) / 100));
    if (vc) vc.volume = v;
    else { try { p.setVolume(v); localStorage.setItem("volume", v); } catch (e) {} }
    if (!root) return;
    if (!volPill || !root.contains(volPill)) {
      volPill = el("div", "tv-vol");
      volPill.innerHTML = '<svg viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/></svg><span class="tv-vbar"><i></i></span><b></b>';
      root.append(volPill);
    }
    volPill.querySelector("i").style.width = `${Math.round(v * 100)}%`;
    volPill.querySelector("b").textContent = `${Math.round(v * 100)} %`;
    volPill.hidden = false;
    clearTimeout(volTimer);
    volTimer = setTimeout(() => { if (volPill) volPill.hidden = true; }, 1500);
  }
  TV.volume = changeVolume;
  function play(itemId, episodeId, startTime) {
    const payload = { libraryItemId: itemId, episodeId: episodeId || null };
    if (startTime != null) payload.startTime = startTime;
    $n.$eventBus.$emit("play-item", payload);
    if (cur() && cur().type === "np") return;
    push({ type: "np" });
  }
  async function read(item) {
    let full = item;
    try { full = await ax.$get(`/api/items/${item.id}?expanded=1`); } catch (e) {}
    TV.reading = true;
    if (root) root.classList.add("tv-away");
    store.commit("showEReader", { libraryItem: full, keepProgress: true });
  }
  // The e-book reader closed → back to TV mode where you were.
  store.watch((st) => st.showEReader, (on) => {
    if (on || !TV.reading) return;
    TV.reading = false;
    if (root) root.classList.remove("tv-away");
    if (focused && focused.isConnected) setFocus(focused, true);
  });

  store.watch((st) => (st.libraries.libraries || []).map((l) => l.id + l.name).join(), () => {
    if (!TV.visible || !nav) return;
    const k = focused && nav.contains(focused) ? focused.dataset.k : null;
    drawNav();
    markNav();
    if (k) setFocus(nav.querySelector(`[data-k="${CSS.escape(k)}"]`) || defaultFocus(), true);
    const s = cur();
    if (s && s.type === "home") { s.at = 0; show(); }
  });

  // ---- elements --------------------------------------------------------------
  let root = null, nav = null, main = null, mini = null, hints = null, modal = null, bg = null;
  let focused = null, stack = [], renderToken = 0, liveTimer = null;
  const cur = () => stack[stack.length - 1];

  // Anything you can move to: class tv-f, data-k = a key to find it again after a redraw.
  function focusable(tag, cls, key, act) {
    const e = el(tag, "tv-f " + (cls || ""));
    e.tabIndex = -1;
    if (key) e.dataset.k = key;
    e._act = act;
    e.addEventListener("click", (ev) => { ev.stopPropagation(); setFocus(e, true); if (e._act) e._act(); });
    e.addEventListener("mousemove", () => { if (root && !root.classList.contains("tv-nocursor") && focused !== e) setFocus(e, true); });
    return e;
  }
  function button(label, icon, key, act, cls) {
    const b = focusable("div", "tv-btn " + (cls || ""), key, act);
    if (icon) b.insertAdjacentHTML("beforeend", icon);
    b.append(el("span", null, label));
    return b;
  }
  function card(it, o = {}) {
    const sq = o.square != null ? o.square : squareLib(it.libraryId);
    const c = focusable("div", "tv-card" + (sq ? " sq" : "") + (o.big ? " big" : ""), o.key, o.act);
    const cv = el("div", "tv-cover");
    if (hasCover(it)) {
      const img = el("img");
      img.loading = "lazy";
      img.alt = "";
      img.src = coverOf(it, o.big ? 500 : 400);
      img.onerror = () => { img.remove(); cv.classList.add("noimg"); cv.textContent = titleOf(it); };
      cv.append(img);
    } else { cv.classList.add("noimg"); cv.textContent = o.title || titleOf(it); }
    const p = progOf(it.id, it.recentEpisode && it.recentEpisode.id);
    const frac = fracOf(p);
    if (p && p.isFinished) { const b = el("div", "tv-badge"); b.innerHTML = ICON.check; cv.append(b); }
    else if (frac > 0) { const bar = el("div", "tv-bar"); bar.style.width = Math.round(frac * 100) + "%"; cv.append(bar); }
    if (o.badge) cv.append(el("div", "tv-badge" + (p && p.isFinished ? " l" : ""), o.badge));
    c.append(cv, el("div", "tv-ct", o.title || titleOf(it)), el("div", "tv-cm", o.sub != null ? o.sub : authorOf(it)));
    return c;
  }
  function authorCard(a, key) {
    const c = focusable("div", "tv-card sq au", key, () => push({ type: "author", authorId: a.id, name: a.name }));
    const cv = el("div", "tv-cover");
    const src = authorImg(a);
    if (src) {
      const img = el("img"); img.loading = "lazy"; img.alt = ""; img.src = src;
      img.onerror = () => { img.remove(); cv.classList.add("noimg"); cv.textContent = initials(a.name); };
      cv.append(img);
    } else { cv.classList.add("noimg"); cv.textContent = initials(a.name); }
    const n = a.numBooks || (a.libraryItems && a.libraryItems.length) || 0;
    c.append(cv, el("div", "tv-ct", a.name), el("div", "tv-cm", n ? n + " " + L("LabelBooks", "Books") : ""));
    return c;
  }
  const initials = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  function row(title, chip, key, cards) {
    const r = el("section", "tv-row");
    const h = el("h2", null, title);
    if (chip) h.append(el("span", "tv-chip", chip));
    const track = el("div", "tv-track");
    cards.forEach((c) => track.append(c));
    r.append(h, track);
    r.dataset.row = key;
    return r;
  }
  const openItem = (it) => push({ type: "item", itemId: it.id });

  // ---- moving around ---------------------------------------------------------
  function focusables() {
    const scope = modal || root;
    return [...scope.querySelectorAll(".tv-f")].filter((e) => e.offsetParent !== null);
  }
  let lastMoveAt = 0;   // when you last moved the highlight (Home's quiet reload waits for a pause)
  function setFocus(e, noReveal) {
    if (!e) return;
    lastMoveAt = Date.now();
    if (focused && focused !== e) focused.classList.remove("tv-on");
    focused = e;
    e.classList.add("tv-on");
    try { e.focus({ preventScroll: true }); } catch (x) {}
    if (!noReveal) reveal(e);
    if (nav) nav.classList.toggle("open", nav.contains(e));
    const s = cur();
    if (s && main && main.contains(e)) { s.focusKey = e.dataset.k; if (s.onFocus) s.onFocus(e); }
  }
  // Keep the highlighted thing on screen: its row's strip sideways, the page up/down.
  function reveal(e) {
    const track = e.closest(".tv-track");
    if (track) {
      const t = track.getBoundingClientRect(), r = e.getBoundingClientRect(), pad = t.width * 0.07;
      if (r.left < t.left + pad) track.scrollBy({ left: r.left - t.left - pad, behavior: "smooth" });
      else if (r.right > t.right - pad) track.scrollBy({ left: r.right - t.right + pad, behavior: "smooth" });
    }
    const box = e.closest(".tv-main, .tv-mlist, .tv-navl");
    if (box) {
      const b = box.getBoundingClientRect(), target = e.closest(".tv-row") || e, r = target.getBoundingClientRect(), pad = b.height * 0.1;
      const firstRow = box.querySelector(".tv-row, .tv-f");
      if (box === main && firstRow && (target === firstRow || target.contains(firstRow) || firstRow.contains(target))) box.scrollTo({ top: 0, behavior: "smooth" });
      else if (r.top < b.top + pad) box.scrollBy({ top: r.top - b.top - pad, behavior: "smooth" });
      else if (r.bottom > b.bottom - pad) box.scrollBy({ top: r.bottom - b.bottom + pad, behavior: "smooth" });
    }
  }
  // Move the highlight to the nearest thing in that direction: left/right stay on the same
  // line (a row of covers, a row of buttons); up/down go to the next line, nearest across.
  function move(dx, dy) {
    const all = focusables();
    if (!focused || !all.includes(focused)) { setFocus(defaultFocus()); return; }
    // Its own area first (the page, a part of it like Search's letters or results), the rest
    // only past its edge (rows scrolled out of view sit "behind" the top menu, so plain
    // distance would jump there too early).
    const zone = (e) => e.closest(".tv-zone") || (nav.contains(e) ? nav : main);
    const mine = all.filter((e) => zone(e) === zone(focused));
    let list = mine;
    const a = focused.getBoundingClientRect();
    const ax0 = a.left + a.width / 2, ay0 = a.top + a.height / 2;
    const pick = (sameLine) => {
      let best = null, bp = Infinity, bq = Infinity;
      for (const e of list) {
        if (e === focused) continue;
        const b = e.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        const bx = b.left + b.width / 2, by = b.top + b.height / 2;
        let p, q;
        if (dx) {
          if ((bx - ax0) * dx <= 1) continue;
          const overlap = b.bottom > a.top + 2 && b.top < a.bottom - 2;
          if (sameLine && !overlap) continue;
          p = dx > 0 ? b.left - a.right : a.left - b.right;
          q = overlap ? 0 : Math.abs(by - ay0);
          if (!sameLine) { p += q * 2; q = 0; }
        } else {
          if ((by - ay0) * dy <= 1) continue;
          p = dy > 0 ? b.top - a.bottom : a.top - b.bottom;
          if (p < -Math.min(a.height, b.height) / 2) continue;
          q = Math.abs(bx - ax0);
        }
        p = Math.max(0, Math.round(p / 24));
        if (p < bp || (p === bp && q < bq)) { best = e; bp = p; bq = q; }
      }
      return best;
    };
    if (!modal && nav.contains(focused)) {
      if (dx > 0) { const back = pageFocus(); if (back) setFocus(back); return; }
      if (dx < 0) return;
      const n = pick(true);
      if (n) setFocus(n);
      return;
    }
    const page = all.filter((e) => !nav.contains(e));
    let next = pick(true);
    if (!next) { list = page; next = pick(true); }
    if (!next && dx && root.classList.contains("tv-free")) { list = page; next = pick(false); }
    if (!next && dx < 0 && !modal) { focusNav(); return; }
    if (next) setFocus(next);
  }
  // Where the highlight goes back to on the page (from the menu).
  function pageFocus() {
    const s = cur();
    const e = s && s.focusKey && main.querySelector(`[data-k="${CSS.escape(s.focusKey)}"]`);
    return e || main.querySelector(".tv-f.tv-default") || main.querySelector(".tv-f");
  }
  function defaultFocus() {
    const scope = modal || main;
    return (scope && (scope.querySelector(".tv-f.tv-default") || scope.querySelector(".tv-f"))) || (nav && nav.querySelector(".tv-ni.tv-cur")) || null;
  }
  function focusNav() { setFocus(nav.querySelector(".tv-ni.tv-cur") || nav.querySelector(".tv-ni")); }

  // ---- screens ---------------------------------------------------------------
  function push(s) { saveScreen(); stack.push(s); show(); }
  function goRoot(s) { saveScreen(); s.enter = true; stack = [s]; TV.beforeSettings = null; show(); }
  // Settings remembers where you were, however you open it (side menu, Start / Options, the
  // Leave TV mode? question); Back or Start there takes you straight back.
  function openSettings() {
    if (stack[0].type !== "settings") TV.beforeSettings = stack;
    saveScreen();
    stack = [{ type: "settings", enter: true }];
    show();
  }
  function leaveSettings() {
    saveScreen();
    const before = TV.beforeSettings || [{ type: "home" }];
    TV.beforeSettings = null;
    before[before.length - 1].enter = true;   // (the highlight goes back onto the page)
    stack = before;
    show();
  }
  function back() {
    if (modal) { closeModal(); return; }
    if (stack.length > 1) { stack.pop(); show(); return; }
    if (stack[0].type === "settings" && focused && !nav.contains(focused)) { leaveSettings(); return; }
    if (focused && !nav.contains(focused)) { focusNav(); return; }
    askExit();
  }
  function saveScreen() {
    const s = cur();
    if (!s || !main) return;
    s.scroll = main.scrollTop;
    if (focused && main.contains(focused) && focused.dataset.k) s.focusKey = focused.dataset.k;
  }
  async function show() {
    const s = cur();
    const def = SCREENS[s.type];
    const token = ++renderToken;
    stopLive();
    if (modal) { modal.remove(); modal = null; }
    root.dataset.screen = s.type;
    root.classList.toggle("tv-free", !!def.free);
    markNav();
    setBackdrop(null);
    const draw = () => { main.textContent = ""; def.draw(s); afterDraw(s, def); };
    if (def.load && (!s.data || (def.refresh && Date.now() - (s.at || 0) > def.refresh))) {
      if (s.data) draw();
      else { main.textContent = ""; main.append(el("div", "tv-loading", "…")); }
      let data;
      try { data = await def.load(s); } catch (e) { data = s.data || { error: (e && e.message) || String(e) }; }
      if (token !== renderToken) return;
      saveScreen();
      s.data = data;
      s.at = Date.now();
    }
    draw();
  }
  function afterDraw(s, def) {
    main.scrollTop = s.scroll || 0;
    if (focused && focused.isConnected && nav.contains(focused) && !s.enter) { if (def.live) startLive(def.live); return; }
    s.enter = false;
    let e = s.focusKey && main.querySelector(`[data-k="${CSS.escape(s.focusKey)}"]`);
    if (!e) e = defaultFocus();
    if (e) setFocus(e);
    if (def.live) startLive(def.live);
  }
  function redraw() { saveScreen(); const s = cur(); main.textContent = ""; SCREENS[s.type].draw(s); afterDraw(s, SCREENS[s.type]); }
  function startLive(fn) { stopLive(); liveTimer = setInterval(() => { try { fn(cur()); } catch (e) {} }, 500); }
  function stopLive() { clearInterval(liveTimer); liveTimer = null; }
  function setBackdrop(url) {
    if (!bg) return;
    if (url) { bg.style.backgroundImage = `url("${url}")`; bg.classList.add("on"); } else bg.classList.remove("on");
  }
  const errorBox = (d) => el("div", "tv-empty", (d && d.error) || "");

  // Home: what's in progress everywhere, your series, what's new per library, listen again.
  async function loadHome() {
    const list = libs().slice();
    const [inProg, ...shelves] = await Promise.all([
      ax.$get("/api/me/items-in-progress?limit=40").catch(() => ({ libraryItems: [] })),
      ...list.map((l) => ax.$get(`/api/libraries/${l.id}/personalized?limit=24`).catch(() => [])),
    ]);
    return { libs: list, inProg: (inProg && inProg.libraryItems) || [], shelves };
  }
  const seriesNameOf = (it) => {
    const s = md(it).seriesName;
    return s ? String(s).split(", ")[0].replace(/\s+#[^#]*$/, "").trim() : "";
  };
  async function openSeriesByName(libId, name, it) {
    try {
      const r = await ax.$get(`/api/libraries/${libId}/search?q=${encodeURIComponent(name)}&limit=10`);
      const hit = (r.series || []).find((x) => x.series && x.series.name === name) || (r.series || [])[0];
      if (hit) { push({ type: "series", libId, seriesId: hit.series.id, name: hit.series.name }); return; }
    } catch (e) {}
    openItem(it);
  }
  // Continue Listening's line under a cover: time left (audio), % read (ebook), else the author.
  function contSub(it) {
    const p = progOf(it.id, it.recentEpisode && it.recentEpisode.id);
    if (p && !p.isFinished && isAudio(it) && p.duration > 0) return leftText(Math.max(0, p.duration - (p.currentTime || 0)));
    if (p && !p.isFinished && p.ebookProgress > 0) return Math.round(p.ebookProgress * 100) + "%";
    return authorOf(it);
  }
  // Home keeps up while you're on it: whenever progress changes (here or on another device,
  // the web app stores it), Continue Listening's bars and time left update in place. A book
  // that isn't first in the row yet, or one just finished, reloads Home quietly instead —
  // at most every 30 s, and not while you're moving around.
  let homeLiveTimer = null, homeReloadAt = 0;
  store.subscribe((m) => {
    if (m.type !== "user/updateMediaProgress" || !TV.visible) return;
    clearTimeout(homeLiveTimer);
    homeLiveTimer = setTimeout(() => homeLive(m.payload && m.payload.data), 300);
  });
  function homeLive(d) {
    const s = cur();
    if (!s || s.type !== "home" || !s.data || s.data.error || !main) return;
    for (const c of main.querySelectorAll('[data-k^="cont:"]')) {
      const [, id, ep] = c.dataset.k.split(":");
      const it = s.data.inProg.find((x) => x.id === id && (!ep || (x.recentEpisode && x.recentEpisode.id === ep)));
      if (!it) continue;
      const p = progOf(id, ep), frac = fracOf(p), cv = c.querySelector(".tv-cover");
      let bar = cv && cv.querySelector(".tv-bar");
      if (cv && frac > 0 && !(p && p.isFinished)) {
        if (!bar) { bar = el("div", "tv-bar"); cv.append(bar); }
        bar.style.width = Math.round(frac * 100) + "%";
      }
      const sub = c.querySelector(".tv-cm");
      if (sub) sub.textContent = contSub(it);
    }
    if (!d) return;
    const first = s.data.inProg[0];
    const isFirst = first && first.id === d.libraryItemId && (!d.episodeId || (first.recentEpisode && first.recentEpisode.id === d.episodeId));
    if (isFirst && !d.isFinished) return;
    const wait = Math.max(30000 - (Date.now() - homeReloadAt), 2500 - (Date.now() - lastMoveAt), 0);
    homeLiveTimer = setTimeout(() => {
      const now = cur();
      if (!TV.visible || modal || !now || now.type !== "home") return;
      if (Date.now() - lastMoveAt < 2500) { homeLive(d); return; }   // still moving: try again shortly
      homeReloadAt = Date.now();
      now.at = 0;
      show();
    }, wait);
  }
  function drawHome(s) {
    const d = s.data;
    if (d.error) { main.append(errorBox(d)); return; }
    let n = 0;
    if (d.inProg.length) {
      main.append(row(L("LabelContinueListening", "Continue Listening"), null, "cont", d.inProg.map((it) => {
        const sub = contSub(it);
        // Continue = straight back into it (the book's page is one press away in Now Playing).
        const act = isAudio(it) ? () => play(it.id, it.recentEpisode && it.recentEpisode.id) : isEbook(it) ? () => read(it) : () => openItem(it);
        const c = card(it, { key: "cont:" + it.id + (it.recentEpisode ? ":" + it.recentEpisode.id : ""), big: true, sub, act });
        if (n++ === 0) c.classList.add("tv-default");
        return c;
      })));
    }
    const series = [], again = [];
    d.libs.forEach((l, i) => {
      for (const sh of d.shelves[i] || []) {
        if (sh.id === "continue-series") series.push(...sh.entities);
        if (sh.id === "listen-again" || sh.id === "read-again") again.push(...sh.entities);
      }
    });
    if (series.length) main.append(row(L("LabelContinueSeries", "Continue Series"), null, "series", series.map((it) => card(it, { key: "ser:" + it.id, act: () => openItem(it) }))));
    d.libs.forEach((l, i) => {
      const ra = (d.shelves[i] || []).find((sh) => sh.id === "recently-added");
      if (!ra || !ra.entities.length) return;
      const cards = [], bySeries = new Map();
      for (const it of ra.entities) {
        const sn = l.mediaType === "book" ? seriesNameOf(it) : "";
        if (sn && bySeries.has(sn)) { bySeries.get(sn).items.push(it); continue; }
        const c = { item: it, series: sn || null, items: [it] };
        if (sn) bySeries.set(sn, c);
        cards.push(c);
      }
      const els = cards.map((c) => (c.series && c.items.length > 1
        ? card(c.item, { key: "ra:" + l.id + ":" + c.item.id, title: c.series, sub: c.items.length + " " + L("LabelBooks", "Books"), badge: String(c.items.length), act: () => openSeriesByName(l.id, c.series, c.item) })
        : card(c.item, { key: "ra:" + l.id + ":" + c.item.id, act: () => openItem(c.item) })));
      const all = focusable("div", "tv-card tv-all" + (squareLib(l.id) ? " sq" : ""), "ra:" + l.id + ":all", () => goRoot({ type: "lib", libId: l.id }));
      all.append(el("div", "tv-cover", L("ButtonViewAll", "View All") + " ›"));
      els.push(all);
      main.append(row(L("LabelRecentlyAdded", "Recently Added"), l.name.trim(), "ra:" + l.id, els));
    });
    if (again.length) main.append(row(L("LabelListenAgain", "Listen Again"), null, "again", again.map((it) => card(it, { key: "again:" + it.id, act: () => openItem(it) }))));
    if (!main.querySelector(".tv-row")) main.append(el("div", "tv-empty", T("empty")));
  }

  // A library: books / series / collections / authors as a grid of covers, more as you scroll.
  const PAGE = 60;
  const SORTS = [
    ["media.metadata.title", () => L("LabelTitle", "Title")],
    ["media.metadata.authorNameLF", () => L("LabelAuthor", "Author")],
    ["addedAt", () => L("LabelAddedAt", "Added At")],
    ["media.metadata.publishedYear", () => L("LabelPublishYear", "Publish Year")],
    ["media.duration", () => L("LabelDuration", "Duration")],
  ];
  TV.sorts = TV.sorts || {};
  function libSort(libId) {
    if (TV.sorts[libId]) return TV.sorts[libId];
    const u = store.state.user.settings || {};
    const by = SORTS.some(([k]) => k === u.orderBy) ? u.orderBy : u.orderBy === "media.metadata.authorName" ? "media.metadata.authorNameLF" : "media.metadata.title";
    return { by, desc: SORTS.some(([k]) => k === u.orderBy) ? !!u.orderDesc : false };
  }
  async function fetchPage(s, page) {
    const id = s.libId, l = libOf(id) || {};
    if (s.tab === "series") {
      const r = await ax.$get(`/api/libraries/${id}/series?limit=${PAGE}&page=${page}&sort=name&minified=1`);
      return { list: r.results || [], total: r.total || 0 };
    }
    if (s.tab === "collections") {
      const r = await ax.$get(`/api/libraries/${id}/collections?limit=${PAGE}&page=${page}&minified=1`);
      return { list: r.results || [], total: r.total || 0 };
    }
    if (s.tab === "authors") {
      const r = await ax.$get(`/api/libraries/${id}/authors`);
      const list = (r.authors || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return { list, total: list.length };
    }
    const so = l.mediaType === "podcast" ? { by: "media.metadata.title", desc: false } : libSort(id);
    const r = await ax.$get(`/api/libraries/${id}/items?limit=${PAGE}&page=${page}&sort=${encodeURIComponent(so.by)}&desc=${so.desc ? 1 : 0}&minified=1&collapseseries=0`);
    return { list: r.results || [], total: r.total || 0 };
  }
  async function loadLib(s) {
    const l = libOf(s.libId) || {};
    if (!s.tab) s.tab = "items";
    const [first, coll] = await Promise.all([
      fetchPage(s, 0),
      s.hasColl == null && l.mediaType === "book" ? ax.$get(`/api/libraries/${s.libId}/collections?limit=1&minified=1`).catch(() => null) : null,
    ]);
    if (coll) s.hasColl = (coll.total || 0) > 0;
    return { list: first.list, total: first.total, page: 0 };
  }
  function libCard(s, x, i) {
    const key = "g:" + (x.id || i);
    let c;
    if (s.tab === "series") {
      const b = (x.books || [])[0];
      c = b ? card(b, { key, title: x.name, sub: (x.books || []).length + " " + L("LabelBooks", "Books"), badge: String((x.books || []).length), act: () => push({ type: "series", libId: s.libId, seriesId: x.id, name: x.name }) })
        : button(x.name, null, key, () => push({ type: "series", libId: s.libId, seriesId: x.id, name: x.name }));
    } else if (s.tab === "collections") {
      const b = (x.books || [])[0];
      c = b ? card(b, { key, title: x.name, sub: (x.books || []).length + " " + L("LabelBooks", "Books"), act: () => push({ type: "coll", collId: x.id, name: x.name }) })
        : button(x.name, null, key, () => push({ type: "coll", collId: x.id, name: x.name }));
    } else if (s.tab === "authors") c = authorCard(x, key);
    else c = card(x, { key, act: () => openItem(x) });
    c.dataset.idx = i;
    return c;
  }
  function drawLib(s) {
    const l = libOf(s.libId) || { name: "" };
    const d = s.data;
    main.append(el("div", "tv-h1", l.name.trim()));
    if (l.mediaType === "book") {
      const tabs = el("div", "tv-tabs");
      const tab = (id, label) => {
        const b = button(label, null, "tab:" + id, () => { if (s.tab === id) return; s.tab = id; s.data = null; s.scroll = 0; s.focusKey = "tab:" + id; s.enter = true; show(); });
        if (s.tab === id) b.classList.add("tv-cur");
        tabs.append(b);
      };
      tab("items", L("LabelBooks", "Books"));
      tab("series", L("LabelSeries", "Series"));
      if (s.hasColl) tab("collections", L("LabelCollections", "Collections"));
      tab("authors", L("LabelAuthors", "Authors"));
      if (s.tab === "items") {
        const so = libSort(s.libId);
        const name = (SORTS.find(([k]) => k === so.by) || SORTS[0])[1]();
        tabs.append(button(`${name} ${so.desc ? "↓" : "↑"}`, ICON.sort, "sort", () => pickSort(s)));
      }
      main.append(tabs);
    }
    if (d.error) { main.append(errorBox(d)); return; }
    if (!d.list.length) { main.append(el("div", "tv-empty", T("empty"))); return; }
    const grid = el("div", "tv-grid" + (s.tab === "authors" ? " au" : squareLib(s.libId) ? " sq" : ""));
    d.list.forEach((x, i) => { const c = libCard(s, x, i); if (i === 0) c.classList.add("tv-default"); grid.append(c); });
    main.append(grid);
    s.grid = grid;
    s.onFocus = (e) => { if (e.dataset.idx != null && Number(e.dataset.idx) > d.list.length - 24) loadMore(s); };
  }
  async function loadMore(s) {
    const d = s.data;
    if (!d || s.loadingMore || d.list.length >= d.total || s.tab === "authors") return;
    s.loadingMore = true;
    try {
      const r = await fetchPage(s, d.page + 1);
      d.page += 1;
      const start = d.list.length;
      d.list.push(...r.list);
      if (cur() === s && s.grid && s.grid.isConnected) r.list.forEach((x, j) => s.grid.append(libCard(s, x, start + j)));
    } catch (e) {}
    s.loadingMore = false;
  }
  function pickSort(s) {
    const so = libSort(s.libId);
    const opts = SORTS.map(([k, name]) => ({ label: name(), on: so.by === k, act: () => { TV.sorts[s.libId] = { by: k, desc: so.by === k ? !so.desc : k === "addedAt" }; reload(); } }));
    opts.push({ label: so.desc ? L("LabelSortAscending", "Ascending") + " ↑" : L("LabelSortDescending", "Descending") + " ↓", act: () => { TV.sorts[s.libId] = { by: so.by, desc: !so.desc }; reload(); } });
    function reload() { s.data = null; s.scroll = 0; s.focusKey = "sort"; show(); }
    openPicker(T("sort"), opts);
  }

  // A series, an author, a collection: their books as a grid.
  function gridOf(items, keyPrefix, o = {}) {
    const grid = el("div", "tv-grid" + (items[0] && squareLib(items[0].libraryId) ? " sq" : ""));
    items.forEach((it, i) => {
      const c = card(it, { key: keyPrefix + it.id, badge: o.seq ? o.seq(it) : null, act: () => openItem(it) });
      if (i === 0) c.classList.add("tv-default");
      grid.append(c);
    });
    return grid;
  }
  async function loadSeries(s) {
    const r = await ax.$get(`/api/libraries/${s.libId}/items?limit=500&page=0&filter=series.${encodeURIComponent(window.btoa(unescape(encodeURIComponent(s.seriesId))))}&sort=media.metadata.series.sequence&minified=1&collapseseries=0`);
    return { list: r.results || [] };
  }
  function drawSeries(s) {
    const d = s.data;
    const h = el("div", "tv-h1", s.name);
    if (d.list) h.append(el("small", null, d.list.length + " " + L("LabelBooks", "Books")));
    main.append(h);
    if (d.error) { main.append(errorBox(d)); return; }
    const seq = (it) => { const x = seriesOf(it).find((v) => v.id === s.seriesId) || seriesOf(it)[0]; const n = x && x.sequence; return n ? "#" + n : null; };
    main.append(gridOf(d.list, "b:", { seq }));
  }
  async function loadAuthor(s) {
    const a = await ax.$get(`/api/authors/${s.authorId}?include=items`);
    const list = (a.libraryItems || []).slice().sort((x, y) => String(md(x).title || "").localeCompare(String(md(y).title || ""), undefined, { numeric: true, sensitivity: "base" }));
    return { author: a, list };
  }
  function drawAuthor(s) {
    const d = s.data;
    if (d.error) { main.append(el("div", "tv-h1", s.name), errorBox(d)); return; }
    const head = el("div", "tv-head");
    const av = el("div", "tv-av");
    const src = authorImg(d.author);
    if (src) { const img = el("img"); img.alt = ""; img.src = src; av.append(img); }
    else { av.classList.add("noimg"); av.textContent = initials(d.author.name); }
    const h = el("div", "tv-h1", d.author.name);
    h.append(el("small", null, d.list.length + " " + L("LabelBooks", "Books")));
    head.append(av, h);
    main.append(head);
    if (d.author.description) main.append(descBlock(d.author.description, d.author.name, "desc"));
    const gap = el("div"); gap.style.height = "1em"; main.append(gap);
    main.append(gridOf(d.list, "b:"));
  }
  async function loadColl(s) {
    const c = await ax.$get(`/api/collections/${s.collId}`);
    return { list: c.books || [] };
  }
  function drawColl(s) {
    const d = s.data;
    main.append(el("div", "tv-h1", s.name));
    if (d.error) { main.append(errorBox(d)); return; }
    main.append(gridOf(d.list, "b:"));
  }
  function descBlock(text, title, key) {
    const plain = String(text).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p>/gi, "\n\n").replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    const d = focusable("div", "tv-desc", key, () => openText(title, plain));
    d.textContent = plain;
    return d;
  }

  // A book (or podcast): big cover, details, Play / Chapters / Read / Finished; episodes.
  async function loadItem(s) { return { item: await ax.$get(`/api/items/${s.itemId}?expanded=1`) }; }
  function drawItem(s) {
    const d = s.data;
    if (d.error) { main.append(errorBox(d)); return; }
    const it = d.item, m = md(it), media = it.media || {};
    setBackdrop(hasCover(it) ? coverOf(it, 400) : null);
    const wrap = el("div", "tv-item");
    const big = el("div", "tv-big" + (squareLib(it.libraryId) ? " sq" : ""));
    if (hasCover(it)) { const img = el("img"); img.alt = ""; img.src = coverOf(it); big.append(img); }
    const info = el("div", "tv-info");
    info.append(el("h1", null, m.title || "?"));
    if (m.subtitle) info.append(el("div", "tv-sub", m.subtitle));
    const authors = m.authors || [];
    if (authors.length) {
      const line = el("div", "tv-line");
      line.append(el("span", null, L("LabelAuthors", "Authors") + ":"));
      authors.forEach((a) => { const x = focusable("span", "tv-link", "au:" + a.id, () => push({ type: "author", authorId: a.id, name: a.name })); x.textContent = a.name; line.append(x); });
      info.append(line);
    } else if (m.author) info.append(el("div", "tv-sub", m.author));
    if (m.narratorName || (m.narrators && m.narrators.length)) {
      const line = el("div", "tv-line");
      line.append(el("span", null, L("LabelNarrators", "Narrators") + ":"), el("span", null, m.narratorName || m.narrators.join(", ")));
      info.append(line);
    }
    const ser = seriesOf(it);
    if (ser.length) {
      const line = el("div", "tv-line");
      line.append(el("span", null, L("LabelSeries", "Series") + ":"));
      ser.forEach((x) => { const y = focusable("span", "tv-link", "se:" + x.id, () => push({ type: "series", libId: it.libraryId, seriesId: x.id, name: x.name })); y.textContent = x.name + (x.sequence ? " #" + x.sequence : ""); line.append(y); });
      info.append(line);
    }
    const facts = [];
    if (media.duration) facts.push(pretty(media.duration));
    if (m.publishedYear) facts.push(m.publishedYear);
    if (m.genres && m.genres.length) facts.push(m.genres.slice(0, 3).join(", "));
    const p = progOf(it.id);
    if (p && p.isFinished) facts.push("✓ " + L("LabelFinished", "Finished"));
    else if (p && p.duration > 0 && p.currentTime > 0) facts.push(leftText(Math.max(0, p.duration - p.currentTime)) + " · " + Math.round((p.progress || 0) * 100) + "%");
    else if (p && p.ebookProgress > 0) facts.push(Math.round(p.ebookProgress * 100) + "%");
    if (facts.length) info.append(el("div", "tv-facts", facts.join("  ·  ")));
    const btns = el("div", "tv-btns");
    const podcast = it.mediaType === "podcast";
    if (!podcast && isAudio(it)) {
      const started = p && !p.isFinished && p.currentTime > 0;
      const b = button(started ? T("resume") : L("ButtonPlay", "Play"), ICON.play, "play", () => play(it.id));
      b.classList.add("tv-default");
      btns.append(b);
      if (p && (p.currentTime > 0 || p.isFinished)) btns.append(button(T("startOver"), ICON.back, "over", () => play(it.id, null, 0)));
      if ((media.chapters || []).length > 1) btns.append(button(L("LabelChapters", "Chapters"), ICON.list, "chapters", () => push({ type: "chapters", itemId: it.id, item: it })));
    }
    if (isEbook(it)) { const r = button(L("ButtonRead", "Read"), ICON.read, "read", () => read(it)); if (!btns.children.length) r.classList.add("tv-default"); btns.append(r); }
    if (!podcast) {
      const fin = !!(p && p.isFinished);
      btns.append(button(fin ? L("MessageMarkAsNotFinished", "Mark as Not Finished") : L("MessageMarkAsFinished", "Mark as Finished"), ICON.check, "fin", async () => {
        try { await ax.$patch(`/api/me/progress/${it.id}`, { isFinished: !fin }); } catch (e) {}
        setTimeout(() => { if (cur() === s) redraw(); }, 400);
      }));
    }
    if (btns.children.length) info.append(btns);
    if (m.description) info.append(descBlock(m.description, m.title, "desc"));
    wrap.append(big, info);
    main.append(wrap);
    if (podcast) {
      const eps = (media.episodes || []).slice().sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
      const list = el("div", "tv-list");
      list.append(el("h2", null, L("HeaderEpisodes", "Episodes")));
      eps.forEach((ep, i) => {
        const ep_p = progOf(it.id, ep.id);
        const r = focusable("div", "tv-li", "ep:" + ep.id, () => play(it.id, ep.id));
        r.insertAdjacentHTML("beforeend", ep_p && ep_p.isFinished ? ICON.check : ICON.play);
        r.append(el("span", "grow", ep.title || "?"));
        const dur = ep.duration || (ep.audioFile && ep.audioFile.duration) || 0;
        if (ep_p && !ep_p.isFinished && ep_p.progress > 0) { const bar = el("span", "tv-lbar"); const f = el("i"); f.style.width = Math.round(ep_p.progress * 100) + "%"; bar.append(f); r.append(bar); }
        r.append(el("small", null, [ep.publishedAt ? new Date(ep.publishedAt).toLocaleDateString() : "", dur ? pretty(dur) : ""].filter(Boolean).join("  ·  ")));
        if (i === 0) r.classList.add("tv-default");
        list.append(r);
      });
      main.append(list);
    }
  }

  // Chapters: pick one to listen from there.
  function drawChapters(s) {
    const p = player();
    const playingThis = p && p.streamLibraryItem && p.streamLibraryItem.id === s.itemId && !p.streamEpisode;
    const item = playingThis ? p.streamLibraryItem : s.item;
    const chapters = (playingThis ? p.chapters : item && item.media && item.media.chapters) || [];
    const now = playingThis ? p.currentTime : (progOf(s.itemId) || {}).currentTime || 0;
    main.append(el("div", "tv-h1", L("LabelChapters", "Chapters")));
    const list = el("div", "tv-list");
    chapters.forEach((ch, i) => {
      const isCur = ch.start <= now && now < ch.end;
      const r = focusable("div", "tv-li" + (isCur ? " cur" : ""), "ch:" + i, () => {
        const q = player();
        if (q && q.streamLibraryItem && q.streamLibraryItem.id === s.itemId && !q.streamEpisode) {
          q.seek(ch.start);
          if (!q.isPlaying) q.mediaSessionPlay();
        } else $n.$eventBus.$emit("play-item", { libraryItemId: s.itemId, episodeId: null, startTime: ch.start });
        // on to Now Playing (back where you came from if that was Now Playing)
        if (stack.length > 1 && stack[stack.length - 2].type === "np") stack.pop();
        else stack[stack.length - 1] = { type: "np" };
        show();
      });
      r.append(el("span", "grow", `${i + 1}.  ${ch.title || ""}`), el("small", null, stamp(ch.start) + "  ·  " + pretty(Math.max(0, ch.end - ch.start))));
      if (isCur) r.classList.add("tv-default");
      list.append(r);
    });
    main.append(list);
  }

  // Now Playing: big cover, the chapter, its progress, and big controls.
  const SPEEDS = [0.5, 0.75, 0.8, 0.9, 1, 1.1, 1.2, 1.25, 1.3, 1.4, 1.5, 1.6, 1.75, 2, 2.25, 2.5, 3];
  const SLEEPS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
  const npKey = (p) => (p ? p.streamLibraryItem.id + ":" + (p.streamEpisode ? p.streamEpisode.id : "") : "");
  function drawNp(s) {
    const p = player();
    s.key = npKey(p);
    s.ui = null;
    if (!p) {
      main.append(el("div", "tv-empty", T("nothing")));
      const b = button(L("ButtonHome", "Home"), ICON.home, "np:home", () => goRoot({ type: "home" }));
      b.classList.add("tv-default");
      main.append(b);
      return;
    }
    const it = p.streamLibraryItem;
    setBackdrop(hasCover(it) ? coverOf(it, 400) : null);
    const wrap = el("div", "tv-np");
    const big = el("div", "tv-big" + (squareLib(it.libraryId) ? " sq" : ""));
    if (hasCover(it)) { const img = el("img"); img.alt = ""; img.src = coverOf(it); big.append(img); }
    const info = el("div", "tv-npi");
    const ui = {};
    info.append(el("h1", null, p.title || md(it).title || "?"));
    info.append(el("div", "au", p.isPodcast ? md(it).title || "" : authorOf(it)));
    // The chapter (its title, bar, time in it and left of it), then the whole book (bar, time / length, time left).
    ui.ch = el("div", "ch");
    ui.chBox = el("div", "tv-pgroup");
    const bar = el("div", "tv-prog"); ui.bar = el("i"); bar.append(ui.bar);
    const times = el("div", "tv-times"); ui.t0 = el("span"); ui.t1 = el("span"); times.append(ui.t0, ui.t1);
    ui.chBox.append(bar, times);
    ui.bookBox = el("div", "tv-pgroup book");
    const head = el("div", "tv-plabel"); ui.bookPct = el("span"); head.append(el("span", null, T("book")), ui.bookPct);
    const bbar = el("div", "tv-prog thin"); ui.bbar = el("i"); bbar.append(ui.bbar);
    const btimes = el("div", "tv-times"); ui.b0 = el("span"); ui.b1 = el("span"); btimes.append(ui.b0, ui.b1);
    ui.bookBox.append(head, bbar, btimes);
    info.append(ui.ch, ui.chBox, ui.bookBox);
    const [jb, jf] = jumpSecs();
    const round = (key, icon, act, cls, label) => {
      const r = focusable("div", "tv-round " + (cls || ""), key, act);
      r.innerHTML = icon;
      if (label) r.append(el("b", null, label));
      return r;
    };
    const ctrls = el("div", "tv-ctrls");
    ui.play = round("np:play", ICON.play, togglePlay, "main tv-default");
    ctrls.append(round("np:prev", ICON.prev, () => pcall((q) => q.mediaSessionPreviousTrack())),
      round("np:back", ICON.back, () => pcall((q) => q.jumpBackward()), "", String(jb)),
      ui.play,
      round("np:fwd", ICON.fwd, () => pcall((q) => q.jumpForward()), "", String(jf)),
      round("np:next", ICON.next, () => pcall((q) => q.mediaSessionNextTrack())));
    const more = el("div", "tv-btns");
    ui.speed = button("", ICON.speed, "np:speed", () => {
      const q = player(); if (!q) return;
      openPicker(T("speed"), SPEEDS.map((v) => ({ label: v.toFixed(2).replace(/0$/, "") + "×", on: Math.abs((q.currentPlaybackRate || 1) - v) < 0.001, act: () => pcall((x) => x.setPlaybackRate(v)) })));
    });
    ui.sleep = button("", ICON.sleep, "np:sleep", () => {
      const q = player(); if (!q) return;
      const list = [{ label: T("off"), on: !q.sleepTimerSet, act: () => pcall((x) => x.cancelSleepTimer()) }];
      if (q.chapters && q.chapters.length) list.push({ label: L("LabelEndOfChapter", "End of Chapter"), on: q.sleepTimerSet && q.sleepTimerType === "chapter", act: () => pcall((x) => x.setSleepTimer({ timerType: "chapter" })) });
      SLEEPS.forEach((m) => list.push({ label: T("minutes").replace("{n}", m), act: () => pcall((x) => x.setSleepTimer({ timerType: "countdown", seconds: m * 60 })) }));
      openPicker(L("LabelSleepTimer", "Sleep timer"), list);
    });
    more.append(ui.speed, ui.sleep);
    if (p.chapters && p.chapters.length > 1 && !p.streamEpisode) more.append(button(L("LabelChapters", "Chapters"), ICON.list, "np:chapters", () => push({ type: "chapters", itemId: it.id, item: it })));
    more.append(button(L("LabelMore", "More"), ICON.info, "np:item", () => push({ type: "item", itemId: it.id })));
    info.append(ctrls, more);
    wrap.append(big, info);
    main.append(wrap);
    s.ui = ui;
    liveNp(s);
  }
  function liveNp(s) {
    const p = player();
    if (npKey(p) !== s.key) { redraw(); return; }
    if (!p || !s.ui) return;
    const ui = s.ui, t = p.currentTime || 0, total = p.totalDuration || 0, rate = p.currentPlaybackRate || 1;
    const chs = p.chapters || [];
    const ch = p.currentChapter;
    const idx = ch ? chs.indexOf(ch) : -1;
    ui.ch.textContent = ch ? `${T("chapter")} ${idx + 1}/${chs.length}  ·  ${ch.title || ""}` : "";
    ui.chBox.hidden = !ch;   // (no chapters: only the book)
    if (ch) {
      const len = Math.max(1, ch.end - ch.start);
      ui.bar.style.width = Math.min(100, Math.max(0, ((t - ch.start) / len) * 100)) + "%";
      ui.t0.textContent = stamp(Math.max(0, t - ch.start));
      ui.t1.textContent = "-" + stamp(Math.max(0, (ch.end - t) / rate));
    }
    const frac = total ? Math.min(1, Math.max(0, t / total)) : 0;
    ui.bbar.style.width = frac * 100 + "%";
    ui.bookPct.textContent = Math.round(frac * 100) + "%";
    ui.b0.textContent = stamp(t) + " / " + stamp(total);
    ui.b1.textContent = total ? leftText(Math.max(0, (total - t) / rate)) : "";
    ui.play.firstChild.outerHTML = p.isPlaying ? ICON.pause : ICON.play;
    ui.speed.lastChild.textContent = (Math.round(rate * 100) / 100) + "×";
    ui.sleep.lastChild.textContent = !p.sleepTimerSet ? L("LabelSleepTimer", "Sleep timer")
      : p.sleepTimerType === "chapter" ? L("LabelEndOfChapter", "End of Chapter") : T("minutes").replace("{n}", Math.max(1, Math.ceil((p.sleepTimerRemaining || 0) / 60)));
    ui.sleep.classList.toggle("tv-cur", !!p.sleepTimerSet);
  }

  // Search: type with the controller on the letters (or a keyboard); results from every library.
  const KEYS = "abcdefghijklmnopqrstuvwxyz0123456789".split("").concat(["'", "-", "å", "ä", "ö", "é", "ü"]);
  function drawSearch(s) {
    s.q = s.q || "";
    const wrap = el("div", "tv-search");
    const kb = el("div", "tv-kb tv-zone");
    const q = el("div", "tv-q");
    s.qEl = q;
    const keys = el("div", "tv-keys");
    KEYS.forEach((k, i) => { const b = focusable("div", "tv-key", "k:" + k, () => typeKey(k)); b.textContent = k.toUpperCase(); if (i === 0) b.classList.add("tv-default"); keys.append(b); });
    const wide = (key, label, icon, act) => { const b = focusable("div", "tv-key wide", key, act); if (icon) b.innerHTML = icon; else b.textContent = label; keys.append(b); };
    wide("k:space", T("space"), null, () => typeKey(" "));
    wide("k:erase", "", ICON.erase, () => typeKey("\b"));
    wide("k:clear", T("clear"), null, () => typeKey("\x1b"));
    kb.append(q, keys);
    const res = el("div", "tv-res tv-zone");
    s.resEl = res;
    wrap.append(kb, res);
    main.append(el("div", "tv-h1", L("ButtonSearch", "Search")), wrap);
    showQuery(s);
    drawResults(s);
  }
  function showQuery(s) {
    if (!s.qEl) return;
    s.qEl.textContent = s.q || T("searchHint");
    s.qEl.classList.toggle("empty", !s.q);
  }
  function typeKey(k) {
    const s = cur();
    if (!s || s.type !== "search") return;
    if (k === "\b") s.q = s.q.slice(0, -1);
    else if (k === "\x1b") s.q = "";
    else if (s.q.length < 60) s.q += k;
    showQuery(s);
    clearTimeout(s.timer);
    s.timer = setTimeout(() => runSearch(s), 380);
  }
  async function runSearch(s) {
    const q = s.q.trim();
    if (!q) { s.results = null; drawResults(s); return; }
    const token = (s.token = (s.token || 0) + 1);
    const all = await Promise.all(libs().map((l) => ax.$get(`/api/libraries/${l.id}/search?q=${encodeURIComponent(q)}&limit=12`).then((r) => ({ l, r })).catch(() => null)));
    if (token !== s.token || cur() !== s) return;
    const r = { books: [], series: [], authors: [] };
    for (const x of all) {
      if (!x) continue;
      for (const b of x.r.book || []) r.books.push(b.libraryItem);
      for (const b of x.r.podcast || []) r.books.push(b.libraryItem);
      for (const se of x.r.series || []) r.series.push({ ...se, libId: x.l.id });
      for (const a of x.r.authors || []) r.authors.push(a);
    }
    s.results = r;
    drawResults(s);
  }
  function drawResults(s) {
    const res = s.resEl;
    if (!res) return;
    const keep = focused && res.contains(focused) ? focused.dataset.k : null;
    res.textContent = "";
    const r = s.results;
    if (!r) return;
    if (r.books.length) res.append(row(L("LabelBooks", "Books"), null, "rb", r.books.map((it) => card(it, { key: "r:" + it.id, act: () => openItem(it) }))));
    if (r.series.length) {
      res.append(row(L("LabelSeries", "Series"), null, "rs", r.series.map((se) => {
        const b = (se.books || [])[0];
        const act = () => push({ type: "series", libId: se.libId, seriesId: se.series.id, name: se.series.name });
        return b ? card(b, { key: "rs:" + se.series.id, title: se.series.name, sub: (se.books || []).length + " " + L("LabelBooks", "Books"), act }) : button(se.series.name, null, "rs:" + se.series.id, act);
      })));
    }
    if (r.authors.length) res.append(row(L("LabelAuthors", "Authors"), null, "ra", r.authors.map((a) => authorCard(a, "rau:" + a.id))));
    if (!res.children.length) res.append(el("div", "tv-empty", L("MessageNoResults", "No Results")));
    if (keep) { const e = res.querySelector(`[data-k="${CSS.escape(keep)}"]`); setFocus(e || defaultFocus(), true); }
  }

  const locked = (k) => !!(TV.opts.locks && TV.opts.locks[k]);
  const padName = () => {
    try {
      const g = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find((x) => x && x.connected);
      return g ? String(g.id).replace(/\s*\(.*$/, "").trim() || g.id : "";
    } catch (e) { return ""; }
  };
  // Settings: the same switches and choices as Settings → Desktop App (main.js tvSettingsData),
  // TV mode's own section first. A switch flips with A/✕, a choice opens a list.
  const askSettings = (cmd) => { html.dataset.absdaTvSet = cmd; window.dispatchEvent(new Event("absda-tv-settings")); };
  TV.onSettings = (data) => {
    const s = cur();
    if (!s || s.type !== "settings" || !TV.visible) return;
    s.data = data;
    s.waiting = false;
    if (s.enterLater) { s.enter = true; s.enterLater = false; }
    redraw();
  };
  function drawSettings(s) {
    main.append(el("div", "tv-h1", L("HeaderSettings", "Settings")));
    const name = el("div", "tv-padname");
    name.innerHTML = ICON.pad;
    s.nameEl = el("span");
    name.append(s.nameEl);
    main.append(name);
    livePad(s);
    if (!s.data) {
      main.append(el("div", "tv-loading", "…"));
      if (!s.waiting) { s.waiting = true; s.enterLater = s.enter; askSettings("get"); }   // (into the list once it's there)
      return;
    }
    const box = el("div", "tv-set");
    for (const sec of s.data.sections) {
      box.append(el("h2", null, sec.label));
      settingRows(sec.items, box, sec.label, sec.label);
      if (sec.tv) box.append(el("div", "tv-note", T("lockNote")));
    }
    main.append(box);
    const first = box.querySelector(".tv-f");
    if (first) first.classList.add("tv-default");
  }
  function settingRows(items, box, path, parentLabel) {
    const radios = {};
    for (const it of items) if (it.radio) (radios[it.radio] = radios[it.radio] || []).push(it);
    const done = new Set();
    for (const it of items) {
      if (it.type === "separator") continue;
      if (it.radio) {
        if (!done.has(it.radio)) { done.add(it.radio); box.append(choiceRow(path, parentLabel, radios[it.radio])); }
        continue;
      }
      if (it.type === "submenu") {
        const kids = (it.submenu || []).filter((k) => k.type !== "separator");
        if (!it.multi && kids.length > 1 && kids.every((k) => k.type === "checkbox" && k.radio === kids[0].radio) && kids.filter((k) => k.checked).length === 1) {
          box.append(choiceRow(path, it.label, kids));
        } else {
          const sub = el("div", "tv-setsub");
          sub.append(el("h3", null, it.label));
          settingRows(it.submenu || [], sub, path + "/" + it.label, it.label);
          box.append(sub);
        }
      } else if (it.type === "checkbox") {
        const r = focusable("div", "tv-li" + (it.enabled ? "" : " tv-dis"), "set:" + path + ":" + it.label, () => { if (it.enabled) askSettings("click:" + it.id); });
        r.append(el("span", "grow", it.label), el("span", "tv-sw" + (it.checked ? " on" : "")));
        box.append(r);
      }
    }
  }
  function choiceRow(path, label, options) {
    const now = options.find((o) => o.checked);
    const r = focusable("div", "tv-li", "set:" + path + ":" + label, () => {
      openPicker(label, options.map((o) => ({ label: o.label, on: o.checked, act: () => { if (!o.checked) askSettings("click:" + o.id); } })));
    });
    r.append(el("span", "grow", label), el("span", "val", now ? now.label.trim() : ""), el("span", null, "›"));
    return r;
  }
  function livePad(s) { if (s.nameEl) s.nameEl.textContent = padName() || T("noPad"); }

  const SCREENS = {
    home: { load: loadHome, draw: drawHome, refresh: 15000 },
    lib: { load: loadLib, draw: drawLib },
    series: { load: loadSeries, draw: drawSeries },
    author: { load: loadAuthor, draw: drawAuthor },
    coll: { load: loadColl, draw: drawColl },
    item: { load: loadItem, draw: drawItem, refresh: 1 },
    chapters: { draw: drawChapters },
    np: { draw: drawNp, live: liveNp },
    search: { draw: drawSearch, free: true },
    settings: { draw: drawSettings, live: livePad },
  };

  // ---- pop-up lists (speed, sleep timer, sort, leave TV mode) and long texts --------------
  function openPicker(title, options, note) {
    closeModal(true);
    const ret = focused;
    modal = el("div", "tv-modal");
    const box = el("div", "tv-mbox");
    const list = el("div", "tv-mlist");
    options.forEach((o, i) => {
      // (on = the current choice, ticked; def = only where the highlight starts)
      const b = focusable("div", "tv-li" + (o.on ? " cur tv-default" : o.def ? " tv-default" : ""), "opt:" + i, () => { closeModal(); o.act(); });
      if (o.icon) b.insertAdjacentHTML("beforeend", o.icon);
      if (o.on) b.insertAdjacentHTML("beforeend", ICON.check);
      b.append(el("span", "grow", o.label));
      list.append(b);
    });
    box.append(el("h2", null, title));
    if (note) box.append(el("p", "tv-mnote", note));
    box.append(list);
    modal.append(box);
    modal._ret = ret;
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    root.append(modal);
    setFocus(defaultFocus());
  }
  function openText(title, text) {
    closeModal(true);
    const ret = focused;
    modal = el("div", "tv-modal");
    const box = el("div", "tv-mbox");
    const t = el("div", "tv-text", text);
    const close = button(L("ButtonClose", "Close"), null, "close", () => closeModal());
    close.classList.add("tv-default");
    box.append(el("h2", null, title), t, close);
    modal.append(box);
    modal._ret = ret;
    modal._text = t;
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    root.append(modal);
    setFocus(close);
  }
  function closeModal(silent) {
    if (!modal) return;
    const ret = modal._ret;
    modal.remove();
    modal = null;
    if (!silent) setFocus(ret && ret.isConnected ? ret : defaultFocus(), true);
  }
  function askExit() {
    openPicker(T("exitAsk"), [
      { label: T("exit"), icon: ICON.exit, act: exitTv },
      { label: L("HeaderSettings", "Settings"), icon: ICON.gear, act: openSettings },
      { label: T("stay"), icon: ICON.back, def: true, act: () => {} },
    ]);
  }
  function exitTv() {
    TV.close();
    window.dispatchEvent(new Event("absda-tv-exit"));   // preload.js → main.js (window size, menu tick)
  }

  // ---- top menu, mini player, hints --------------------------------------------
  function drawNav() {
    nav.textContent = "";
    if (TV.clockEl) TV.clockEl.remove();
    const list = el("div", "tv-navl");
    const item = (box, key, label, icon, act) => {
      const b = focusable("div", "tv-ni", key, act);
      b.innerHTML = icon;
      b.append(el("span", null, label));
      box.append(b);
    };
    // A library's own icon from the web app's icon font (as in its side menu and library picker).
    const libIcon = (l) => (l.icon && /^[a-z0-9-]+$/.test(l.icon) ? `<span class="abs-icons icon-${l.icon}"></span>` : l.mediaType === "podcast" ? ICON.podcast : ICON.lib);
    item(list, "nav:search", L("ButtonSearch", "Search"), ICON.search, () => goRoot({ type: "search" }));
    item(list, "nav:home", L("ButtonHome", "Home"), ICON.home, () => goRoot({ type: "home" }));
    list.append(el("div", "tv-navsep"));
    for (const l of libs()) item(list, "nav:lib:" + l.id, l.name.trim(), libIcon(l), () => goRoot({ type: "lib", libId: l.id }));
    list.append(el("div", "tv-navsep"));
    item(list, "nav:np", T("nowPlaying"), ICON.np, () => { if (cur().type !== "np") push({ type: "np", enter: true }); else setFocus(defaultFocus()); });
    const bottom = el("div", "tv-navb");
    TV.navBottom = bottom;
    item(bottom, "nav:set", L("HeaderSettings", "Settings"), ICON.gear, openSettings);
    item(bottom, "nav:exit", T("exit"), ICON.exit, askExit);
    nav.append(list, el("div", "tv-navsep"), bottom);
    drawUpdate();
    const clock = el("div", "tv-clock");
    TV.clockEl = clock;
    root.append(clock);
    tickClock();
  }
  function markNav() {
    const r = stack[0];
    const key = r.type === "lib" ? "nav:lib:" + r.libId : r.type === "search" ? "nav:search" : r.type === "settings" ? "nav:set" : cur().type === "np" ? "nav:np" : "nav:home";
    nav.querySelectorAll(".tv-ni").forEach((b) => b.classList.toggle("tv-cur", b.dataset.k === key));
  }
  function tickClock() {
    if (TV.clockEl) TV.clockEl.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function updateMini() {
    if (!mini) return;
    const p = player();
    if (!p) { mini.style.display = "none"; mini._key = ""; return; }
    mini.style.display = "";
    const it = p.streamLibraryItem;
    if (mini._key !== npKey(p)) {
      mini._key = npKey(p);
      mini.innerHTML = "";
      if (hasCover(it)) { const img = el("img"); img.alt = ""; img.src = coverOf(it, 120); mini.append(img); }
      const tx = el("div", "tx");
      mini._t = el("div", "t", p.title || md(it).title || "");
      mini._m = el("div", "m");
      const pr = el("div", "p"); mini._bar = el("i"); pr.append(mini._bar);
      tx.append(mini._t, mini._m, pr);
      mini._icon = el("span");
      mini.append(tx, mini._icon);
    }
    const t = p.currentTime || 0, total = p.totalDuration || 0;
    mini._m.textContent = (p.currentChapter && p.currentChapter.title) || authorOf(it);
    mini._bar.style.width = total ? Math.round((t / total) * 100) + "%" : "0";
    mini._icon.innerHTML = p.isPlaying ? ICON.pause : ICON.play;
  }
  function updateLive() {
    updateMini();
    const s = cur();
    if (s && s.type === "np" && TV.visible) liveNp(s);
  }
  function drawHints() {
    if (!hints) return;
    hints.textContent = "";
    const ps = TV.padType === "ps";
    const XB = { a: ["A", "#3fb950"], b: ["B", "#e5534b"], x: ["X", "#4493f8"], y: ["Y", "#d4a72c"] };
    const PS = { a: ["✕", "#7aa7ff"], b: ["○", "#ff6b6b"], x: ["□", "#e98bd6"], y: ["△", "#4ed6a6"] };
    const g = (k) => {
      const s = el("span", "tv-g");
      if (TV.padType) { const [t, c] = (ps ? PS : XB)[k]; s.textContent = t; s.style.color = c; }
      else s.textContent = { a: "Enter", b: "Esc", x: "Space", y: "Tab" }[k];
      return s;
    };
    const add = (k, label) => { const s = el("span"); s.append(g(k), document.createTextNode(label)); hints.append(s); };
    add("a", T("select"));
    add("b", L("ButtonBack", "Back"));
    add("x", T("playPause"));
    add("y", T("nowPlaying"));
    if (TV.padType) {   // (locked buttons aren't shown)
      if (!locked("chapter")) {
        const s = el("span");
        s.append(Object.assign(el("span", "tv-g"), { textContent: ps ? "L1 R1" : "LB RB" }), document.createTextNode(T("chapter")));
        hints.append(s);
      }
      if (!locked("jump")) {
        const j = el("span");
        j.append(Object.assign(el("span", "tv-g"), { textContent: ps ? "L2 R2" : "LT RT" }), document.createTextNode(T("jump")));
        hints.append(j);
      }
      const st = el("span");
      st.append(Object.assign(el("span", "tv-g"), { textContent: ps ? "Options" : "☰" }), document.createTextNode(L("HeaderSettings", "Settings")));
      hints.append(st);
    }
  }

  // ---- input: controller, keyboard / TV remote, mouse -------------------------------
  function input(act) {
    hideCursor();
    if (wake()) return;   // (the press that ends the screen saver does nothing else)
    // Locked buttons (Controller screen / View → Controller) do nothing, so a stray press can't skip your place.
    if ((act === "prevch" || act === "nextch") && locked("chapter")) return;
    if ((act === "jumpback" || act === "jumpfwd") && locked("jump")) return;
    if (TV.reading) {   // in the e-book reader: turn pages, B closes it
      const page = (k) => $n.$eventBus.$emit("reader-hotkey", k);
      if (act === "left" || act === "up" || act === "prevch") page("ArrowLeft");
      else if (act === "right" || act === "down" || act === "nextch") page("ArrowRight");
      else if (act === "back") { page("Escape"); setTimeout(() => { if (store.state.showEReader) store.commit("setShowEReader", false); }, 300); }
      else if (act === "playpause") togglePlay();
      return;
    }
    if (modal && modal._text && (act === "up" || act === "down")) { modal._text.scrollBy({ top: (act === "up" ? -1 : 1) * modal._text.clientHeight * 0.6, behavior: "smooth" }); return; }
    switch (act) {
      case "up": move(0, -1); break;
      case "down": move(0, 1); break;
      case "left": move(-1, 0); break;
      case "right": move(1, 0); break;
      case "ok":
        if (!focused || !focused.isConnected) { setFocus(defaultFocus()); break; }
        if (focused._act) focused._act();
        break;
      case "back": back(); break;
      case "playpause": togglePlay(); break;
      case "np": if (modal) closeModal(true); if (cur().type === "np") back(); else push({ type: "np" }); break;
      case "prevch": pcall((p) => p.mediaSessionPreviousTrack()); break;
      case "nextch": pcall((p) => p.mediaSessionNextTrack()); break;
      case "jumpback": pcall((p) => p.jumpBackward()); break;
      case "jumpfwd": pcall((p) => p.jumpForward()); break;
      case "menu": if (!modal) focusNav(); break;
      case "settings":   // Start / Options: Settings (again: back to where you were)
        if (modal) closeModal(true);
        if (stack[0].type === "settings") leaveSettings(); else openSettings();
        break;
    }
  }
  // Keyboard and TV remotes (arrow keys, OK = Enter, Back = Esc/Backspace). While TV mode
  // is on, the web app's own shortcuts (arrows = volume…) are kept out of the way.
  window.addEventListener("keydown", (e) => {
    if (!TV.visible || TV.reading) return;
    if (e.ctrlKey || e.altKey || e.metaKey || /^F\d+$/.test(e.key) || /^(Media|AudioVolume)/.test(e.key)) return;
    if (wake()) { e.preventDefault(); e.stopImmediatePropagation(); return; }   // (only wakes the screen saver)
    const s = cur();
    const typing = s && s.type === "search" && !modal;
    const k = e.key;
    let act = null, typed = false;
    if (k === "ArrowUp") act = "up";
    else if (k === "ArrowDown") act = "down";
    else if (k === "ArrowLeft") act = "left";
    else if (k === "ArrowRight") act = "right";
    else if (k === "Enter") act = "ok";
    else if (k === "Escape" || k === "BrowserBack" || k === "GoBack") act = "back";
    else if (k === "Backspace") { if (typing && s.q) { typeKey("\b"); typed = true; } else act = "back"; }
    else if (k === "Tab") act = "np";
    else if (typing && k.length === 1) { typeKey(k.toLowerCase()); typed = true; }
    else if (k === " ") act = "playpause";
    e.preventDefault();
    e.stopImmediatePropagation();
    if (act) input(act);
    else if (!typed) hideCursor();
  }, true);

  // Game controllers (Gamepad API, "standard" layout = Xbox and PlayStation alike):
  // D-pad / left stick move · A/✕ select · B/○ back · X/□ play/pause · Y/△ Now Playing
  // LB RB / L1 R1 chapter · LT RT / L2 R2 jump · Start/Options = Settings · View/Share = the side menu.
  const held = {}, prevBtn = {};
  const BUTTONS = { 0: "ok", 1: "back", 2: "playpause", 3: "np", 4: "prevch", 5: "nextch", 6: "jumpback", 7: "jumpfwd", 8: "menu", 9: "settings" };
  function padLoop(now) {
    if (!TV.visible) return;
    TV.raf = requestAnimationFrame(padLoop);
    let pads = [];
    try { pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((g) => g && g.connected); } catch (e) {}
    const g = pads.find((x) => x.mapping === "standard") || pads[0];
    // (PlayStation pads: Sony's vendor id 054c, or plain "Wireless Controller" = DualShock 4; Xbox first, its
    // pads are called "Xbox Wireless Controller")
    const type = !g ? null : /xbox|xinput|045e/i.test(g.id) ? "xbox" : /054c|playstation|dualsense|dualshock|^wireless controller/i.test(g.id) ? "ps" : "xbox";
    if (type !== TV.padType) { TV.padType = type; drawHints(); }
    if (!g) return;
    const btn = (i) => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5));
    const x = g.axes[0] || 0, y = g.axes[1] || 0;
    const dirs = { up: btn(12) || y < -0.55, down: btn(13) || y > 0.55, left: btn(14) || x < -0.55, right: btn(15) || x > 0.55 };
    // Another app in front (MediaDeck's menu, a game) or the window hidden: the pad isn't ours
    // (main.js → preload.js mark <html class="absda-idle">). What's held when the app comes back
    // only counts once it's let go and pressed again.
    if (html.classList.contains("absda-idle")) {
      for (const d of Object.keys(dirs)) { if (dirs[d]) held[d] = { next: Infinity, n: 0 }; else delete held[d]; }
      for (const i of Object.keys(BUTTONS)) prevBtn[i] = btn(Number(i));
      const ry0 = (g.mapping === "standard" ? g.axes[3] : g.axes[5]) || 0;
      for (const [k, on] of [["volup", ry0 < -0.6], ["voldown", ry0 > 0.6]]) { if (on) held[k] = { next: Infinity, n: 0 }; else delete held[k]; }
      return;
    }
    for (const d of Object.keys(dirs)) {
      if (dirs[d]) {
        const h = held[d];
        if (!h) { held[d] = { next: now + 380, n: 0 }; input(d); }
        else if (now >= h.next) { h.n++; h.next = now + (h.n > 8 ? 60 : 110); input(d); }
      } else delete held[d];
    }
    for (const i of Object.keys(BUTTONS)) {
      const on = btn(Number(i));
      if (on && !prevBtn[i]) input(BUTTONS[i]);
      prevBtn[i] = on;
    }
    // the right stick up / down: volume (held: it keeps moving)
    const ry = (g.mapping === "standard" ? g.axes[3] : g.axes[5]) || 0;
    for (const [k, on, step] of [["volup", ry < -0.6, 0.02], ["voldown", ry > 0.6, -0.02]]) {
      if (!on) { delete held[k]; continue; }
      const h = held[k];
      if (!h) { held[k] = { next: now + 300, n: 0 }; hideCursor(); if (!wake()) changeVolume(step); }
      else if (now >= h.next) { h.next = now + 80; wake(); changeVolume(step); }
    }
  }
  // The mouse pointer hides while you use the controller or remote, and shows when you move the mouse.
  let cursorTimer = null;
  function hideCursor() { if (root) root.classList.add("tv-nocursor"); }
  function showCursor() {
    if (!root) return;
    wake();
    root.classList.remove("tv-nocursor");
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(hideCursor, 3000);
  }

  // ---- screen saver ----------------------------------------------------------------
  // While a book plays in TV mode, TV.opts.saver seconds (default 30; 0 = off) after your last
  // press, mouse move or key, the screen goes black with a dimmed "now playing" card that moves
  // to a new spot every 20 s, so nothing stays lit in one place (OLED TVs). Any press wakes it.
  let lastInput = Date.now(), saver = null, saverMove = 0;
  function wake() {
    lastInput = Date.now();
    if (!saver) return false;
    hideSaver();
    return true;
  }
  // Two delays: while a book plays (TV.opts.saver, default 30 s) and while nothing plays — paused
  // or nothing loaded (TV.opts.idleSaver, default 5 min). 0 = off.
  function checkSaver() {
    if (saver) { updateSaver(); return; }
    const p = player(), playing = !!(p && p.isPlaying);
    const secs = playing ? (TV.opts.saver == null ? 30 : Number(TV.opts.saver)) : (TV.opts.idleSaver == null ? 300 : Number(TV.opts.idleSaver));
    if (!secs || !TV.visible || TV.reading || !root) return;
    if (Date.now() - lastInput >= secs * 1000) showSaver();
  }
  function showSaver() {
    saver = el("div", "tv-saver");
    const card = el("div", "tv-scard");
    saver._card = card;
    saver.addEventListener("mousemove", () => wake());
    saver.addEventListener("click", (e) => { e.stopPropagation(); wake(); });
    saver.append(card);
    root.append(saver);
    requestAnimationFrame(() => { if (saver) saver.classList.add("on"); });
    saverMove = 0;
    updateSaver();
  }
  function placeCard(card) {
    const W = root.clientWidth, H = root.clientHeight, w = card.offsetWidth || W * 0.4, h = card.offsetHeight || H * 0.3;
    card.style.left = Math.round(W * 0.04 + Math.random() * Math.max(0, W * 0.92 - w)) + "px";
    card.style.top = Math.round(H * 0.06 + Math.random() * Math.max(0, H * 0.88 - h)) + "px";
  }
  function updateSaver() {
    if (!saver) return;
    const card = saver._card, p = player();
    const it = p && p.streamLibraryItem;
    const key = it ? npKey(p) : "-";
    if (card._key !== key) {   // (a new book: new cover and title; nothing loaded: only the clock and date)
      card._key = key;
      card.textContent = "";
      card.classList.toggle("clock", !it);
      if (it && hasCover(it)) { const img = el("img"); img.alt = ""; img.src = coverOf(it, 400); card.append(img); }
      const tx = el("div", "tx");
      card._t = el("div", "t", it ? p.title || md(it).title || "" : "");
      card._m = el("div", "m");
      const pr = el("div", "p"); card._bar = el("i"); pr.append(card._bar);   // the chapter
      const pb = el("div", "p b"); card._bbar = el("i"); pb.append(card._bbar);   // the book
      card._l = el("div", "l");
      card._c = el("div", "c");
      card._d = el("div", "m");
      tx.append(card._t, card._m, pr, pb, card._l, card._c, card._d);
      card.append(tx);
    }
    card._d.textContent = it ? "" : new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
    if (it) card._t.textContent = (p.isPlaying ? "" : "❚❚  ") + (p.title || md(it).title || "");   // (paused: a pause mark)
    const t = (p && p.currentTime) || 0, total = (p && p.totalDuration) || 0, rate = (p && p.currentPlaybackRate) || 1;
    const ch = p && p.currentChapter;
    card._m.textContent = it ? ((ch && ch.title) || authorOf(it)) : "";
    card._bar.parentNode.hidden = !ch;
    card._bbar.parentNode.hidden = !it;
    if (ch) card._bar.style.width = Math.round(Math.min(1, Math.max(0, (t - ch.start) / Math.max(1, ch.end - ch.start))) * 100) + "%";
    card._bbar.style.width = total ? Math.round((t / total) * 100) + "%" : "0";
    card._l.textContent = total ? T("book") + " " + Math.round((t / total) * 100) + "%  ·  " + leftText(Math.max(0, (total - t) / rate)) : "";
    card._c.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    // every 20 s: fade out, move, fade in
    if (saverMove === 0) { placeCard(card); saverMove = Date.now(); }
    else if (Date.now() - saverMove > 20000) {
      saverMove = Date.now();
      card.classList.add("fade");
      setTimeout(() => { if (saver && saver._card === card) { placeCard(card); card.classList.remove("fade"); } }, 1300);
    }
  }
  function hideSaver() {
    if (!saver) return;
    saver.remove();
    saver = null;
    lastInput = Date.now();
  }

  // ---- open / close --------------------------------------------------------------
  TV.open = () => {
    if (TV.visible) return;
    TV.visible = true;
    TV.reading = false;
    html.setAttribute("data-absda-tv", "");
    if (window.__absdaHome && window.__absdaHome.hide) window.__absdaHome.hide();
    root = el("div", "tv-nocursor");
    root.id = "absda-tv";
    bg = el("div", "tv-bg");
    nav = el("div", "tv-nav");
    main = el("div", "tv-main");
    mini = el("div", "tv-mini");
    hints = el("div", "tv-hints");
    root.append(bg, nav, main, mini, hints);
    root.addEventListener("mousemove", showCursor);
    root.addEventListener("contextmenu", (e) => { e.preventDefault(); back(); });   // right-click = back
    document.body.append(root);
    focused = null;
    modal = null;
    stack = [{ type: "home", enter: true }];
    drawNav();
    drawHints();
    updateMini();
    show();
    TV.raf = requestAnimationFrame(padLoop);
    lastInput = Date.now();
    TV.tick = setInterval(() => { updateMini(); tickClock(); checkSaver(); }, 1000);
  };
  // New options from the app (a lock changed in the menu): hints and the Controller screen follow.
  TV.refresh = () => { drawHints(); drawUpdate(); };
  // ---- an update: side-menu item with a dot, a notice once, Install now / Later -------------
  TV.onUpdate = (u) => { TV.opts.update = u; drawUpdate(); };
  let updToast = null, updToastTimer = null, updShown = null;
  function drawUpdate() {
    const u = TV.opts.update;
    if (!nav || !TV.navBottom) return;
    let it = nav.querySelector('[data-k="nav:upd"]');
    if (!u) { if (it) it.remove(); if (updToast) updToast.hidden = true; return; }
    if (!it) {
      it = focusable("div", "tv-ni tv-upd", "nav:upd", askUpdate);
      it.innerHTML = ICON.upd;
      it.append(el("span"));
      TV.navBottom.prepend(it);
    }
    it.lastChild.textContent = u.label;
    // The notice at the top: once per version when it's found, and while it downloads / installs.
    if (u.busy || updShown !== u.version) {
      updShown = u.version;
      if (!updToast || !root.contains(updToast)) { updToast = el("div", "tv-toast"); root.append(updToast); }
      updToast.innerHTML = ICON.upd;
      updToast.append(el("span", null, u.busy ? u.label : u.title + "  ·  " + u.version));
      updToast.hidden = false;
      clearTimeout(updToastTimer);
      if (!u.busy) updToastTimer = setTimeout(() => { if (updToast) updToast.hidden = true; }, 8000);
    }
  }
  function askUpdate() {
    const u = TV.opts.update;
    if (!u || u.busy) return;
    const opts = [];
    if (u.canInstall) opts.push({ label: u.install, icon: ICON.upd, def: true, act: () => window.dispatchEvent(new Event("absda-tv-update")) });
    opts.push({ label: u.later, icon: ICON.back, def: !u.canInstall, act: () => {} });
    openPicker(u.title, opts, u.msg);
  }   // (the Settings screen gets its new list from main.js itself)
  TV.close = () => {
    if (!TV.visible) return;
    TV.visible = false;
    if (TV.reading) { TV.reading = false; }
    hideSaver();
    html.removeAttribute("data-absda-tv");
    cancelAnimationFrame(TV.raf);
    clearInterval(TV.tick);
    stopLive();
    renderToken++;
    if (root) root.remove();
    root = nav = main = mini = hints = modal = bg = null;
    focused = null;
  };
  if (opts.open) TV.open();
  return true;
}

module.exports = (opts) => `(${pageMain.toString()})(${JSON.stringify(opts)})`;
