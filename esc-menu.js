// SPDX-License-Identifier: GPL-3.0-or-later
// The Esc menu: in the normal window, Esc (when it isn't closing something in the web app)
// shows a small menu — TV mode, Settings, Offline library, Close the app, Back. Arrows /
// Enter or the mouse; Esc again closes it. The web app's own uses of Esc come first: a
// pop-up, the e-book reader, a selection of books, typing in a box. (With a book loaded the
// web app's Esc would close the player; the menu takes that Esc instead, so it never does.)
//
// pageMain runs inside the Audiobookshelf page (main.js injects it); calling it again
// updates its texts. A choice goes to main.js through preload.js (<html data-absda-esc>).

/* global window, document */
function pageMain(opts) {
  const $n = window.$nuxt;
  if (!$n || !$n.$store) return false;
  const E = window.__absdaEsc || (window.__absdaEsc = {});
  E.opts = opts;
  if (E.installed) return true;
  E.installed = true;
  const html = document.documentElement;
  const store = $n.$store;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
  const ICON = {
    tv: svg("M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"),
    settings: svg("M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"),
    offline: svg("M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"),
    quit: svg("M13 3h-2v10h2V3zm4.83 2.17-1.42 1.42A6.92 6.92 0 0 1 19 12c0 3.87-3.13 7-7 7A6.995 6.995 0 0 1 7.58 6.58L6.17 5.17A8.932 8.932 0 0 0 3 12a9 9 0 0 0 18 0c0-2.74-1.23-5.18-3.17-6.83z"),
    back: svg("M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"),
  };

  const style = el("style");
  style.textContent = `
    #absda-esc { position: fixed; inset: 0; z-index: 9500; display: grid; place-items: center; background: rgba(0,0,0,.6); }
    #absda-esc .box { min-width: 320px; max-width: 90vw; padding: 18px; border-radius: 14px; color: #f3f4f6;
      background: var(--color-bg, #262626); box-shadow: 0 16px 48px rgba(0,0,0,.6); border: 1px solid rgba(255,255,255,.08); }
    #absda-esc h2 { margin: 0 0 12px; font-size: 18px; font-weight: 600; }
    #absda-esc .it { display: flex; align-items: center; gap: 14px; padding: 10px 14px; border-radius: 999px; cursor: pointer; font-size: 16px; }
    #absda-esc .it svg { width: 22px; height: 22px; flex: none; opacity: .9; }
    #absda-esc .it.on { box-shadow: inset 0 0 0 2px #fff; background: rgba(255,255,255,.07); }`;
  document.head.append(style);

  let menu = null, items = [], at = 0;
  const typing = () => {
    const a = document.activeElement;
    return !!a && (/^(input|select|textarea|button|trix-editor)$/i.test(a.tagName) || a.isContentEditable);
  };
  // Is Esc already someone else's here? (the web app's pop-ups, reader, selection; our own panels)
  const busy = () => {
    const st = store.state;
    let batch = false;
    try { batch = store.getters["globals/getIsBatchSelectingMediaItems"]; } catch (e) {}
    return html.hasAttribute("data-absda-tv") || st.openModal || st.showEReader || batch || typing() ||
      !!document.querySelector(".modal-bg, #absda-looks-panel, #absda-ds-page");
  };
  function choose(id) {
    close();
    if (id === "back") return;
    html.dataset.absdaEsc = id;
    window.dispatchEvent(new Event("absda-esc-menu"));   // preload.js → main.js
  }
  function mark(i) {
    at = (i + items.length) % items.length;
    items.forEach((b, j) => b.classList.toggle("on", j === at));
  }
  function open() {
    if (menu) return;
    const strings = $n.$strings || {};
    menu = el("div");
    menu.id = "absda-esc";
    const box = el("div", "box");
    box.append(el("h2", null, E.opts.title));
    items = [];
    for (const o of E.opts.items) {
      const b = el("div", "it");
      b.innerHTML = ICON[o.id] || "";
      b.append(el("span", null, o.label || (o.id === "settings" ? strings.HeaderSettings || "Settings" : o.id)));
      b.addEventListener("click", (ev) => { ev.stopPropagation(); choose(o.id); });
      b.addEventListener("mousemove", () => mark(items.indexOf(b)));
      items.push(b);
      box.append(b);
    }
    menu.append(box);
    menu.addEventListener("click", (ev) => { if (ev.target === menu) close(); });
    document.body.append(menu);
    mark(0);
  }
  function close() { if (menu) { menu.remove(); menu = null; items = []; } }
  E.close = close;

  window.addEventListener("keydown", (e) => {
    if (menu) {
      // The menu has the keys while it's open.
      const k = e.key;
      if (k === "Escape") close();
      else if (k === "ArrowDown" || k === "Tab") mark(at + (e.shiftKey && k === "Tab" ? -1 : 1));
      else if (k === "ArrowUp") mark(at - 1);
      else if (k === "Enter" || k === " ") { if (!e.repeat) choose(E.opts.items[at].id); }
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (e.key !== "Escape" || e.repeat || e.ctrlKey || e.altKey || e.metaKey || busy()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open();
  }, true);
  return true;
}

module.exports = (opts) => `(${pageMain.toString()})(${JSON.stringify(opts)})`;
