// SPDX-License-Identifier: GPL-3.0-or-later
// ---------------------------------------------------------------------------
// PRELOAD — runs before every page in the window.
// ---------------------------------------------------------------------------

const { contextBridge, ipcRenderer } = require("electron");

// Desktop bridge for the app's own local page (connect / error screen) only.
// It is never exposed to the remote Audiobookshelf web app.
if (location.protocol === "file:") {
  contextBridge.exposeInMainWorld("absDesktop", {
    getConfig: () => ipcRenderer.invoke("desktop:get-config"),
    connect: (server) => ipcRenderer.invoke("desktop:connect", server),
    retry: () => ipcRenderer.invoke("desktop:retry"),
    // custom title bar
    showMenu: (index, x, y) => ipcRenderer.invoke("titlebar:menu", { index, x, y }),
    getTitle: () => ipcRenderer.invoke("titlebar:get-title"),
    onTitle: (cb) => ipcRenderer.on("titlebar:title", (_e, title) => cb(title)),
    onFocus: (cb) => ipcRenderer.on("titlebar:focus", (_e, focused) => cb(focused)),
  });
}

// ---------------------------------------------------------------------------
// "Remember me" for your server's login page.
// Adds a checkbox under the password, fills in the saved login, and tells the
// app what was submitted (it's only saved once the sign-in succeeds).
// Nothing here is exposed to the web page's own scripts.
// ---------------------------------------------------------------------------
if (location.protocol !== "file:") {
  const BOX_ID = "abs-desktop-remember";
  const SERVER_ID = "abs-desktop-server";
  let wiredForm = null;
  let rememberChoice = true;

  const isLoginPage = () => /\/login\/?$/i.test(location.pathname);
  const field = (name) => document.querySelector(`input[name="${name}"]`);

  // Set an input's value in a way the web app (Vue) notices.
  function setInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function ensureRememberBox(form) {
    if (document.getElementById(BOX_ID)) return;
    const row = document.createElement("label");
    row.style.cssText =
      "display:flex;align-items:center;gap:8px;margin:2px 0 6px;font-size:0.95rem;color:#e5e5e5;cursor:pointer;user-select:none;";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = BOX_ID;
    box.checked = rememberChoice;
    box.style.cssText = "width:16px;height:16px;margin:0;cursor:pointer;accent-color:#f0a848;";
    box.addEventListener("change", () => { rememberChoice = box.checked; });
    row.append(box, document.createTextNode("Remember me"));
    // Put it just above the Submit button.
    const btn = form.querySelector('button[type="submit"]');
    const anchor = btn ? (btn.parentElement && btn.parentElement !== form ? btn.parentElement : btn) : null;
    if (anchor) anchor.before(row); else form.append(row);
  }

  // "Server: host · Change" line at the top of the login box.
  function ensureServerLine(form) {
    const card = form.parentElement;
    if (!card || document.getElementById(SERVER_ID)) return;
    const line = document.createElement("div");
    line.id = SERVER_ID;
    line.style.cssText =
      "display:flex;justify-content:center;align-items:center;gap:6px;flex-wrap:wrap;font-size:0.85rem;color:#a3a3a3;margin:0 0 14px;";
    const host = document.createElement("span");
    host.textContent = location.host;
    host.style.cssText = "color:#e5e5e5;";
    const change = document.createElement("a");
    change.href = "#";
    change.textContent = "Change";
    change.style.cssText = "color:#f0a848;text-decoration:underline;cursor:pointer;";
    change.addEventListener("click", (e) => {
      e.preventDefault();
      ipcRenderer.send("desktop:change-server");
    });
    line.append("Server:", host, "·", change);
    card.prepend(line);
  }

  async function setupLoginForm() {
    if (!isLoginPage()) { wiredForm = null; return; }
    const pass = field("password");
    const form = pass && pass.closest("form");
    if (!form || !field("username")) return;
    ensureServerLine(form);             // both are re-added if the page redraws
    ensureRememberBox(form);
    if (wiredForm === form) return;
    wiredForm = form;

    form.addEventListener("submit", () => {
      const box = document.getElementById(BOX_ID);
      ipcRenderer.send("desktop:login-submitted", {
        username: (field("username") || {}).value || "",
        password: (field("password") || {}).value || "",
        remember: box ? box.checked : rememberChoice,
      });
    }, true);

    const saved = await ipcRenderer.invoke("desktop:get-login");
    const user = field("username");
    if (saved && saved.username && user && !user.value) {
      setInputValue(user, saved.username);
      setInputValue(field("password"), saved.password || "");
      if (saved.autoSubmit) setTimeout(() => form.requestSubmit(), 400);
    }
  }

  // -------------------------------------------------------------------------
  // Keep the theme's colours inside the e-book reader. The EPUB reader draws
  // pages in their own frames, which the app's colour fix doesn't reach — so
  // Windows contrast colours would override the reader's Light/Sepia modes and
  // book colours. Mirror the main page's setting into every frame (on for the
  // normal themes, off for "Windows contrast colours").
  // -------------------------------------------------------------------------
  const FRAME_STYLE_ID = "abs-desktop-colors";
  const FRAME_CSS = ":root, *, *::before, *::after { forced-color-adjust: none !important; }";
  const wantFrameFix = () => getComputedStyle(document.documentElement).forcedColorAdjust === "none";

  function syncFrame(frame) {
    let doc;
    try { doc = frame.contentDocument; } catch { return; }   // other-origin frame: leave alone
    if (!doc || !doc.documentElement) return;
    const existing = doc.getElementById(FRAME_STYLE_ID);
    if (wantFrameFix()) {
      if (existing) return;
      const style = doc.createElement("style");
      style.id = FRAME_STYLE_ID;
      style.textContent = FRAME_CSS;
      (doc.head || doc.documentElement).appendChild(style);
    } else if (existing) {
      existing.remove();
    }
  }
  const hooked = new WeakSet();
  function syncFrames() {
    document.querySelectorAll("iframe").forEach((frame) => {
      if (!hooked.has(frame)) {
        hooked.add(frame);
        frame.addEventListener("load", () => syncFrame(frame));   // each new page/section
      }
      syncFrame(frame);
    });
  }
  ipcRenderer.on("desktop:sync-frames", syncFrames);   // sent when the theme changes

  // Which window this page is in: "main" (the app) or "settings" (the settings window).
  let windowKind = null;
  ipcRenderer.invoke("desktop:window-kind").then((k) => { windowKind = k; schedule(); }).catch(() => {});

  // -------------------------------------------------------------------------
  // Settings open in their own window: catch clicks on links to the settings
  // pages (/config…) in the main window before the web app handles them.
  // -------------------------------------------------------------------------
  document.addEventListener("click", (e) => {
    if (windowKind !== "main" || e.button !== 0 || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
    const a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    let url;
    try { url = new URL(a.getAttribute("href"), location.href); } catch { return; }
    if (url.origin !== location.origin || !/\/config(\/|$)/.test(url.pathname)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    ipcRenderer.send("desktop:open-settings", url.href);
  }, true);

  // -------------------------------------------------------------------------
  // Paintbrush button in the top bar (next to "Your Stats"): a panel with small
  // previews of every theme and bookshelf. Clicking one switches it live.
  // -------------------------------------------------------------------------
  const BRUSH_ID = "absda-looks-btn";
  const PANEL_ID = "absda-looks-panel";
  const TIP_ID = "absda-looks-tip";
  const BRUSH_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">' +
    '<path d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34a.996.996 0 00-1.41 0L9 12.25 11.75 15l8.96-8.96a.996.996 0 000-1.41z"/></svg>';
  const LOOKS_CSS = `
    #${BRUSH_ID} { background: none; border: 0; padding: 0; color: inherit; }
    #${TIP_ID} { position: fixed; z-index: 2147482001; pointer-events: none; padding: 4px 8px; border-radius: 4px;
      background: #000; color: #fff; font-size: 0.85rem; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,.4); }
    #${PANEL_ID} { position: fixed; z-index: 2147482000; width: min(600px, calc(100vw - 24px));
      max-height: calc(100vh - 84px); overflow-y: auto; padding: 14px 16px 16px; border-radius: 8px;
      background: var(--color-bg, #373838);
      border: 1px solid rgba(255,255,255,.12); box-shadow: 0 12px 32px rgba(0,0,0,.55); color: #e5e5e5;
      font-size: 13px; scrollbar-width: thin; }
    #${PANEL_ID} h3 { margin: 16px 0 8px; font-size: 14px; font-weight: 600; color: #fff; }
    #${PANEL_ID} h3:first-child { margin-top: 0; }
    #${PANEL_ID} h4 { margin: 10px 0 6px; font-size: 11px; font-weight: 600; letter-spacing: .06em;
      text-transform: uppercase; color: rgba(255,255,255,.5); }
    #${PANEL_ID} .absda-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; }
    #${PANEL_ID} .absda-tile { display: flex; flex-direction: column; align-items: stretch; gap: 5px; width: 100%;
      padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    #${PANEL_ID} .absda-pv { position: relative; height: 62px; border-radius: 6px; overflow: hidden;
      width: 100%; flex: none; outline: 1px solid rgba(255,255,255,.12); outline-offset: 0;
      transition: outline-color .12s, transform .12s; }
    #${PANEL_ID} .absda-tile:hover .absda-pv { outline-color: rgba(255,255,255,.45); transform: translateY(-1px); }
    #${PANEL_ID} .absda-tile.on .absda-pv { outline: 2px solid var(--tb-logo, #f0a848); outline-offset: 1px; }
    #${PANEL_ID} .absda-tile.on span { color: var(--tb-logo, #f0a848); }
    #${PANEL_ID} .absda-tile span { font-size: 12px; line-height: 1.2; color: rgba(255,255,255,.85); }
    #${PANEL_ID} .absda-bar { position: absolute; left: 0; right: 0; top: 0; height: 9px; display: flex; gap: 2px; padding: 3px 4px; }
    #${PANEL_ID} .absda-bar i { width: 3px; height: 3px; border-radius: 50%; background: rgba(255,255,255,.45); }
    #${PANEL_ID} .absda-side { position: absolute; left: 0; top: 9px; bottom: 0; width: 15px; }
    #${PANEL_ID} .absda-plank { position: absolute; height: 4px; box-shadow: 0 1px 2px rgba(0,0,0,.5); }
    #${PANEL_ID} .absda-book { position: absolute; width: 9px; border-radius: 1px; box-shadow: 0 1px 2px rgba(0,0,0,.5); }

    /* Search: a magnifier icon that opens into a rounded search field. */
    #appbar .absda-search { transition: width .2s ease; }
    #appbar .absda-search:not(.absda-open) { width: 36px !important; cursor: pointer; }
    #appbar .absda-search:not(.absda-open) input { opacity: 0; pointer-events: none; }
    #appbar .absda-search:not(.absda-open) button { left: 0; justify-content: center; padding: 0; color: inherit; }
    #appbar .absda-search:not(.absda-open) button .material-symbols { font-size: 1.6rem !important; }
    #appbar .absda-search:not(.absda-open):hover button { color: rgb(229 231 235); }
    #appbar .absda-search input { background: rgba(255,255,255,.07) !important; border: 1px solid rgba(255,255,255,.14) !important;
      border-radius: 999px !important; padding-left: 14px !important; padding-right: 34px !important;
      transition: background-color .15s, border-color .15s, opacity .15s; }
    #appbar .absda-search input:hover { background: rgba(255,255,255,.1) !important; }
    #appbar .absda-search input:focus { background: rgba(0,0,0,.28) !important; border-color: var(--tb-logo, #f0a848) !important; }

    /* Library picker: a clear box with a ▾ arrow, so it's obvious it's a menu. */
    #appbar div:has(> ul.librariesDropdownMenu) > button {
      background: rgba(255,255,255,.07) !important; border: 1px solid rgba(255,255,255,.18) !important;
      border-radius: 6px !important; color: rgb(229 231 235) !important; transition: background-color .15s, border-color .15s; }
    #appbar div:has(> ul.librariesDropdownMenu) > button:hover {
      background: rgba(255,255,255,.11) !important; border-color: rgba(255,255,255,.32) !important; }
    #appbar div:has(> ul.librariesDropdownMenu:not([style*="none"])) > button { border-color: var(--tb-logo, #f0a848) !important; }
    #appbar ul.librariesDropdownMenu { margin-top: 4px !important; border-radius: 6px !important; }
    @media (min-width: 640px) {
      #appbar div:has(> ul.librariesDropdownMenu) > button { padding-right: 28px !important; }
      #appbar div:has(> ul.librariesDropdownMenu) > button::after {
        content: ""; position: absolute; right: 9px; top: 50%; width: 12px; height: 12px; margin-top: -6px;
        background-color: currentColor; opacity: .75; transition: transform .15s;
        -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7.4 8.6L12 13.2l4.6-4.6L18 10l-6 6-6-6z'/%3E%3C/svg%3E") center / contain no-repeat; }
      #appbar div:has(> ul.librariesDropdownMenu:not([style*="none"])) > button::after { transform: rotate(180deg); }
    }
  `;
  function ensureStyle() {
    if (document.getElementById("absda-looks-css")) return;
    const style = document.createElement("style");
    style.id = "absda-looks-css";
    style.textContent = LOOKS_CSS;
    document.head.append(style);
  }

  let looks = null;   // what the panel shows (from the app)
  const el = (tag, cls, style) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (style) n.style.cssText = style;
    return n;
  };

  // A tiny shelf: two planks with a few books on them.
  function miniShelf(pv, { left, plank, books }) {
    for (const [i, y] of [[0, 34], [1, 58]]) {
      pv.append(el("div", "absda-plank", `left:${left}px;right:0;top:${y}px;background:${plank}`));
      books[i].forEach((c, j) => {
        const h = 15 + ((i + j) % 3) * 3;
        pv.append(el("div", "absda-book", `left:${left + 8 + j * 12}px;top:${y - h}px;height:${h}px;background:${c}`));
      });
    }
  }

  function themeTile(t) {
    const tile = el("button", "absda-tile" + (looks.theme === t.id ? " on" : ""));
    tile.type = "button";
    const pv = el("div", "absda-pv", `background:${t.page}`);
    const bar = el("div", "absda-bar", `background:${t.title}`);
    bar.append(el("i"), el("i"), el("i"));
    pv.append(bar, el("div", "absda-side", `background:${t.panel}`));
    if (t.contrast) {
      pv.style.background = "#000";
      bar.style.background = "#000";
      pv.querySelector(".absda-side").style.cssText += ";background:#000;border-right:1px solid #fff";
      miniShelf(pv, { left: 15, plank: "#fff", books: [["#ffff00", "#00ffff", "#fff"], ["#00ff00", "#ffff00"]] });
    } else {
      miniShelf(pv, { left: 15, plank: t.plank, books: [[t.accent, "#e8e1d6", t.panel], ["#c9c2b8", t.accent]] });
    }
    tile.append(pv, Object.assign(el("span"), { textContent: t.label }));
    tile.addEventListener("click", () => setLook("theme", t.id));
    return tile;
  }

  function shelfTile(s) {
    const tile = el("button", "absda-tile" + (looks.shelf === s.id ? " on" : ""));
    tile.type = "button";
    const page = (looks.themes.find((t) => t.id === looks.theme) || {}).page || "#232323";
    const pv = el("div", "absda-pv", `background-color:${page}`);
    if (s.image) {
      pv.style.backgroundImage = s.image;
      pv.style.backgroundSize = "200px auto";
      pv.style.backgroundPosition = "center";
    }
    miniShelf(pv, { left: 0, plank: s.plank, books: [["#c0392b", "#e8e1d6", "#2f6f9f"], ["#d9a441", "#4f7d4f"]] });
    tile.append(pv, Object.assign(el("span"), { textContent: s.label }));
    tile.addEventListener("click", () => setLook("shelf", s.id));
    return tile;
  }

  function renderPanel(panel) {
    const scroll = panel.scrollTop;
    panel.textContent = "";
    panel.append(Object.assign(el("h3"), { textContent: "Theme" }));
    const tg = el("div", "absda-grid");
    looks.themes.forEach((t) => tg.append(themeTile(t)));
    panel.append(tg);
    panel.append(Object.assign(el("h3"), { textContent: "Bookshelf" }));
    let group = null;
    let grid = null;
    for (const s of looks.shelves) {
      if (s.group !== group) {
        group = s.group;
        panel.append(Object.assign(el("h4"), { textContent: group }));
        grid = el("div", "absda-grid");
        panel.append(grid);
      }
      grid.append(shelfTile(s));
    }
    panel.scrollTop = scroll;
  }

  async function setLook(kind, id) {
    const next = await ipcRenderer.invoke("desktop:set-look", { kind, id }).catch(() => null);
    const panel = document.getElementById(PANEL_ID);
    if (next && panel) { looks = next; renderPanel(panel); }
  }

  function placePanel(panel) {
    const btn = document.getElementById(BRUSH_ID);
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const w = panel.offsetWidth;
    panel.style.top = `${Math.round(r.bottom + 10)}px`;
    panel.style.left = `${Math.round(Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w + 40)))}px`;
  }

  function closePanel() {
    const p = document.getElementById(PANEL_ID);
    if (p) p.remove();
  }

  async function togglePanel() {
    if (document.getElementById(PANEL_ID)) { closePanel(); return; }
    hideTip();
    looks = await ipcRenderer.invoke("desktop:get-looks").catch(() => null);
    if (!looks) return;
    const panel = el("div");
    panel.id = PANEL_ID;
    renderPanel(panel);
    document.body.append(panel);
    placePanel(panel);
  }

  function showTip() {
    const btn = document.getElementById(BRUSH_ID);
    if (!btn || document.getElementById(PANEL_ID) || document.getElementById(TIP_ID)) return;
    const tip = el("div");
    tip.id = TIP_ID;
    tip.textContent = "Theme & bookshelf";
    document.body.append(tip);
    const r = btn.getBoundingClientRect();
    tip.style.top = `${Math.round(r.bottom + 6)}px`;
    tip.style.left = `${Math.round(Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2))}px`;
  }
  function hideTip() {
    const t = document.getElementById(TIP_ID);
    if (t) t.remove();
  }

  function ensureLooksButton() {
    if (windowKind !== "main" || document.getElementById(BRUSH_ID)) return;
    const stats = document.querySelector('#appbar a[href$="/config/stats"]');
    const anchor = stats || document.querySelector('#appbar a[href$="/upload"]');
    if (!anchor) return;   // not signed in / no top bar on this page
    ensureStyle();
    const btn = el("button", anchor.className);   // same size and spacing as its neighbours
    btn.id = BRUSH_ID;
    btn.type = "button";
    btn.setAttribute("aria-label", "Theme & bookshelf");
    btn.innerHTML = BRUSH_SVG;
    btn.addEventListener("click", (e) => { e.preventDefault(); togglePanel(); });
    btn.addEventListener("mouseenter", showTip);
    btn.addEventListener("mouseleave", hideTip);
    if (stats) stats.after(btn); else anchor.before(btn);
  }

  // The top bar's search field becomes an icon; clicking it (or Ctrl+F) opens the field.
  // It closes again when you click away, unless there's text in it.
  function searchParts() {
    const form = document.querySelector('#appbar form[role="search"]');
    const box = form && form.parentElement;
    const input = form && form.querySelector("input");
    return box && input ? { box, input } : null;
  }
  function openSearch() {
    const s = searchParts();
    if (!s) return;
    s.box.classList.add("absda-open");
    s.input.focus();
    s.input.select();
  }
  function ensureSearch() {
    if (windowKind !== "main") return;
    const s = searchParts();
    if (!s || s.box.classList.contains("absda-search")) return;
    ensureStyle();
    const { box, input } = s;
    box.classList.add("absda-search");
    if (input.value) box.classList.add("absda-open");
    box.addEventListener("mousedown", (e) => {
      if (box.classList.contains("absda-open")) return;
      e.preventDefault();
      openSearch();
    });
    input.addEventListener("focus", () => box.classList.add("absda-open"));
    input.addEventListener("blur", () => setTimeout(() => {
      const cur = searchParts();
      if (cur && document.activeElement !== cur.input && !cur.input.value) cur.box.classList.remove("absda-open");
    }, 250));
  }
  document.addEventListener("keydown", (e) => {
    if (windowKind === "main" && e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f" && searchParts()) {
      e.preventDefault();
      openSearch();
    }
  }, true);

  // Close the panel on Esc, a click outside it, or a page change.
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); }, true);
  document.addEventListener("mousedown", (e) => {
    const p = document.getElementById(PANEL_ID);
    if (p && !p.contains(e.target) && !e.target.closest("#" + BRUSH_ID)) closePanel();
  }, true);
  window.addEventListener("resize", () => {
    const p = document.getElementById(PANEL_ID);
    if (p) placePanel(p);
  });
  let lastPath = location.pathname;

  // The web app changes pages without reloading, so watch for the login form
  // and for new reader frames appearing.
  let timer = null;
  let frameTimer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      setupLoginForm();
      ensureLooksButton();
      ensureSearch();
      if (location.pathname !== lastPath) { lastPath = location.pathname; closePanel(); }
    }, 150);
    clearTimeout(frameTimer);
    frameTimer = setTimeout(syncFrames, 50);
  };
  window.addEventListener("DOMContentLoaded", () => {
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    schedule();
  });
}

// Mouse back/forward side buttons → go back/forward (on every page).
window.addEventListener("mouseup", (e) => {
  if (e.button === 3 || e.button === 4) {
    e.preventDefault();
    ipcRenderer.send("desktop:nav", e.button === 3 ? -1 : 1);
  }
}, true);
