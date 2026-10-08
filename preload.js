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
    // texts in the app's language (see i18n.js)
    getStrings: () => ipcRenderer.invoke("desktop:strings"),
    onStrings: (cb) => ipcRenderer.on("desktop:strings", (_e, s) => cb(s)),
    // update check (title bar pill)
    onUpdate: (cb) => ipcRenderer.on("titlebar:update", (_e, u) => cb(u)),
    openUpdate: () => ipcRenderer.send("desktop:open-update"),
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

  // Texts in the app's language (English until they arrive). When the language
  // changes, our added bits are removed and drawn again with the new words.
  let S = {};
  const T = (key, fallback) => S[key] || fallback;
  function applyStrings(s) {
    if (!s) return;
    S = s;
    for (const id of [BOX_ID, SERVER_ID, "absda-looks-tip"]) {
      const n = document.getElementById(id);
      if (n) (id === BOX_ID ? n.closest("label") || n : n).remove();
    }
    const btn = document.getElementById("absda-looks-btn");
    if (btn) btn.setAttribute("aria-label", T("looks.tip", "Theme & bookshelf"));
    if (document.getElementById("absda-looks-panel")) {
      ipcRenderer.invoke("desktop:get-looks").then((l) => {
        const p = document.getElementById("absda-looks-panel");
        if (l && p) { looks = l; renderPanel(p); }
      }).catch(() => {});
    }
    if (typeof schedule === "function") schedule();
  }
  ipcRenderer.invoke("desktop:strings").then(applyStrings).catch(() => {});
  ipcRenderer.on("desktop:strings", (_e, s) => applyStrings(s));

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
    row.append(box, document.createTextNode(T("login.remember", "Remember me")));
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
    change.textContent = T("login.change", "Change");
    change.style.cssText = "color:#f0a848;text-decoration:underline;cursor:pointer;";
    change.addEventListener("click", (e) => {
      e.preventDefault();
      ipcRenderer.send("desktop:change-server");
    });
    line.append(T("login.server", "Server:"), host, "·", change);
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
  // Settings overlay. In the app: a dimmed backdrop while it's open (a click on
  // it closes the overlay). In the overlay: a header with the page name and ✕.
  // -------------------------------------------------------------------------
  const DIM_ID = "absda-dim";
  const HEAD_ID = "absda-settings-bar";
  ipcRenderer.on("desktop:overlay", (_e, open) => {
    let dim = document.getElementById(DIM_ID);
    if (!open) { if (dim) dim.remove(); return; }
    if (dim) return;
    dim = document.createElement("div");
    dim.id = DIM_ID;
    dim.style.cssText = "position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.62);cursor:pointer;";
    dim.addEventListener("mousedown", (e) => { e.preventDefault(); ipcRenderer.send("desktop:close-settings"); });
    document.body.append(dim);
  });

  const GEAR_D = "M19.4 13a7.6 7.6 0 000-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 00-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 00-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 000 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 001.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 001.7-1l2.5 1 2-3.5zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z";
  const UPLOAD_D = "M5 20h14v-2H5v2zm7-16l-6 6h4v6h4v-6h4l-6-6z";
  const PERSON_D = "M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z";
  const HEAD_CSS = `
    #${HEAD_ID} { position: fixed; top: 0; left: 0; right: 0; height: 44px; z-index: 2147483000;
      display: flex; align-items: center; gap: 10px; padding: 0 8px 0 16px; background: var(--tb-bg, #1b1b1b);
      color: var(--tb-fg, #e5e5e5); font: 600 15px "Segoe UI", system-ui, sans-serif; user-select: none;
      border-bottom: 1px solid rgba(255,255,255,.12); }
    #${HEAD_ID} svg { width: 20px; height: 20px; color: var(--tb-logo, #f0a848); flex: none; }
    #${HEAD_ID} span { flex: 1; }
    #${HEAD_ID} button { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
      border: 0; border-radius: 8px; background: none; color: inherit; font-size: 20px; line-height: 1; cursor: pointer; }
    #${HEAD_ID} button:hover { background: rgba(255,255,255,.12); }
  `;
  function ensureOverlayHead() {
    if (windowKind !== "settings" || !document.body) return;
    const page = /\/upload(\/|$)/.test(location.pathname) ? "upload"
      : /\/account(\/|$)/.test(location.pathname) ? "account" : "settings";
    const label = page === "upload" ? T("win.upload", "Upload")
      : page === "account" ? T("win.account", "Account") : T("win.settings", "Settings");
    let head = document.getElementById(HEAD_ID);
    if (!head) {
      if (!document.getElementById("absda-head-css")) {
        const style = document.createElement("style");
        style.id = "absda-head-css";
        style.textContent = HEAD_CSS;
        document.head.append(style);
      }
      head = document.createElement("div");
      head.id = HEAD_ID;
      head.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path/></svg><span></span><button type="button">✕</button>';
      head.querySelector("button").addEventListener("click", () => ipcRenderer.send("desktop:close-settings"));
      document.body.append(head);
    }
    head.querySelector("path").setAttribute("d", page === "upload" ? UPLOAD_D : page === "account" ? PERSON_D : GEAR_D);
    if (head.querySelector("span").textContent !== label) head.querySelector("span").textContent = label;
    head.querySelector("button").title = T("win.close", "Close");
  }
  // Esc closes the overlay — unless one of the web app's own pop-ups is open (Esc closes that first).
  document.addEventListener("keydown", (e) => {
    if (windowKind !== "settings" || e.key !== "Escape") return;
    const popup = [...document.querySelectorAll(".modal")].some((m) => {
      const s = getComputedStyle(m);
      return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.01;
    });
    if (!popup) ipcRenderer.send("desktop:close-settings");
  });

  // -------------------------------------------------------------------------
  // Settings open in the overlay: catch clicks on links to the settings
  // pages (/config…) in the main window before the web app handles them.
  // -------------------------------------------------------------------------
  document.addEventListener("click", (e) => {
    if (windowKind !== "main" || e.button !== 0 || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
    const a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    let url;
    try { url = new URL(a.getAttribute("href"), location.href); } catch { return; }
    if (url.origin !== location.origin || !/\/(config|upload|account)(\/|$)/.test(url.pathname)) return;
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
      background: #000; color: #fff; font-size: 0.85rem; white-space: pre; box-shadow: 0 2px 8px rgba(0,0,0,.4); }
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

    #${PANEL_ID} .absda-sizes { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
    #${PANEL_ID} .absda-size { display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
      gap: 2px; height: 58px; padding: 6px 4px; border-radius: 6px; cursor: pointer; color: inherit; font: inherit;
      background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); transition: border-color .12s, background-color .12s; }
    #${PANEL_ID} .absda-size:hover { border-color: rgba(255,255,255,.45); background: rgba(255,255,255,.09); }
    #${PANEL_ID} .absda-size.on { border: 2px solid var(--tb-logo, #f0a848); }
    #${PANEL_ID} .absda-size b { line-height: 1; font-weight: 600; color: #fff; }
    #${PANEL_ID} .absda-size span { font-size: 11px; color: rgba(255,255,255,.75); }
    #${PANEL_ID} .absda-size.on span { color: var(--tb-logo, #f0a848); }

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

    /* Side menu: a thick theme-coloured bar, a soft highlight and an underlined label on the open tab. */
    #siderail-buttons-container a > div.absolute.left-0 {
      width: 5px !important; background: var(--tb-logo, #f0a848) !important; border-radius: 0 4px 4px 0; }
    #siderail-buttons-container a:has(> div.absolute.left-0:not([style*="none"])) {
      background: rgba(255,255,255,.09) !important; }
    #siderail-buttons-container a:has(> div.absolute.left-0:not([style*="none"])) p {
      font-weight: 600; text-decoration: underline; text-decoration-color: var(--tb-logo, #f0a848);
      text-decoration-thickness: 2px; text-underline-offset: 5px; }

    /* Top-bar icons: a soft rounded highlight on hover (and on the paintbrush while its panel is open). */
    #appbar a.w-8.h-8, #absda-looks-btn, #absda-scan-btn, #appbar .absda-search:not(.absda-open) {
      border-radius: 8px; transition: background-color .15s, color .15s; }
    #appbar a.w-8.h-8, #absda-looks-btn, #absda-scan-btn { width: 36px !important; height: 36px !important; margin: 0 2px !important; }
    #absda-scan-btn { background: none; border: 0; padding: 0; color: inherit; }
    #appbar a.w-8.h-8:hover, #absda-looks-btn:hover, #absda-looks-btn.absda-active, #absda-scan-btn:hover,
    #appbar .absda-search:not(.absda-open):hover { background: rgba(255,255,255,.1); color: rgb(243 244 246); }
    #absda-looks-btn.absda-active { color: var(--tb-logo, #f0a848); }
    /* Scan menu: same look as the theme's panels; highlight in the theme colour. */
    #absda-scan-menu { position: fixed; z-index: 2147482000; min-width: 220px; padding: 6px;
      background: var(--color-bg, #373838); border: 1px solid rgba(255,255,255,.14); border-radius: 8px;
      box-shadow: 0 12px 32px rgba(0,0,0,.55); display: flex; flex-direction: column; gap: 2px; }
    #absda-scan-menu .absda-scan-item { display: block; width: 100%; text-align: left; white-space: nowrap;
      padding: 9px 14px; border: 0; border-radius: 6px; background: none; color: #f3f4f6;
      font: 500 14px "Segoe UI", system-ui, sans-serif; cursor: pointer; }
    #absda-scan-menu .absda-scan-item:hover, #absda-scan-menu .absda-scan-item:focus-visible {
      background: color-mix(in srgb, var(--tb-logo, #f0a848) 28%, transparent); outline: none; }
    #absda-scan-menu .absda-scan-item + .absda-scan-item { border-top: 1px solid rgba(255,255,255,.08); }
    #absda-scan-btn.absda-active { background: rgba(255,255,255,.1); color: var(--tb-logo, #f0a848); }
    /* Scan button: spins in the theme colour while a library scan runs (main.js sets the attribute). */
    html[data-absda-scanning] #absda-scan-btn svg { animation: absda-spin 1.1s linear infinite; color: var(--tb-logo, #f0a848); }
    @keyframes absda-spin { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }

    /* Account button: same box style as the library picker. */
    #appbar a[href$="/account"] {
      background: rgba(255,255,255,.07) !important; border: 1px solid rgba(255,255,255,.18) !important;
      border-radius: 6px !important; transition: background-color .15s, border-color .15s; }
    #appbar a[href$="/account"]:hover { background: rgba(255,255,255,.11) !important; border-color: rgba(255,255,255,.32) !important; }

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
    panel.append(Object.assign(el("h3"), { textContent: T("looks.textSize", "Text size") }));
    const sizes = el("div", "absda-sizes");
    looks.sizes.forEach((s, i) => {
      const b = el("button", "absda-size" + (looks.textSize === s.id ? " on" : ""));
      b.type = "button";
      b.title = `${s.label} (${s.percent}%)`;
      b.append(el("b", "", `font-size:${13 + i * 3}px`), Object.assign(el("span"), { textContent: s.label }));
      b.firstChild.textContent = "A";
      b.addEventListener("click", () => setLook("text", s.id));
      sizes.append(b);
    });
    panel.append(sizes);
    panel.append(Object.assign(el("h3"), { textContent: T("looks.theme", "Theme") }));
    const tg = el("div", "absda-grid");
    looks.themes.forEach((t) => tg.append(themeTile(t)));
    panel.append(tg);
    panel.append(Object.assign(el("h3"), { textContent: T("looks.bookshelf", "Bookshelf") }));
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
    if (next && panel) {
      looks = next;
      renderPanel(panel);
      if (kind === "text") setTimeout(() => placePanel(panel), 50);   // the page was resized
    }
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
    const btn = document.getElementById(BRUSH_ID);
    if (btn) btn.classList.remove("absda-active");
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
    const btn = document.getElementById(BRUSH_ID);
    if (btn) btn.classList.add("absda-active");
  }

  // Tooltip under a top-bar button (paintbrush, scan…): shows its aria-label.
  function showTip(e) {
    const btn = (e && e.currentTarget) || document.getElementById(BRUSH_ID);
    if (!btn || document.getElementById(PANEL_ID) || document.getElementById(TIP_ID)) return;
    const tip = el("div");
    tip.id = TIP_ID;
    tip.dataset.for = btn.id;
    tip.textContent = btn.getAttribute("aria-label") || "";
    document.body.append(tip);
    placeTip(tip, btn);
  }
  function placeTip(tip, btn) {
    const r = btn.getBoundingClientRect();
    tip.style.top = `${Math.round(r.bottom + 6)}px`;
    tip.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2)))}px`;
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
    btn.setAttribute("aria-label", T("looks.tip", "Theme & bookshelf"));
    btn.innerHTML = BRUSH_SVG;
    btn.addEventListener("click", (e) => { e.preventDefault(); togglePanel(); });
    btn.addEventListener("mouseenter", showTip);
    btn.addEventListener("mouseleave", hideTip);
    if (stats) stats.after(btn); else anchor.before(btn);
  }

  // -------------------------------------------------------------------------
  // Scan button (admins only): scans the library you're looking at, the same
  // way Audiobookshelf's own "Scan Library" button does. View → Show scan button.
  // -------------------------------------------------------------------------
  const SCAN_ID = "absda-scan-btn";
  const SCAN_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>';
  let prefs = { scanButton: true };
  function applyPrefs(p) { if (p) { prefs = p; ensureScanButton(); } }
  ipcRenderer.invoke("desktop:ui-prefs").then(applyPrefs).catch(() => {});
  ipcRenderer.on("desktop:ui-prefs", (_e, p) => applyPrefs(p));

  // Tooltip: "Scan library", or what is being scanned right now (main.js keeps that in
  // <html data-absda-scanning>). Follows along live, also while the tooltip is showing.
  const scanLabel = () => document.documentElement.getAttribute("data-absda-scanning") || T("scan.button", "Scan library");
  window.addEventListener("DOMContentLoaded", () => new MutationObserver(() => {
    const btn = document.getElementById(SCAN_ID);
    if (btn) btn.setAttribute("aria-label", scanLabel());
    const tip = document.getElementById(TIP_ID);
    if (tip && btn && tip.dataset.for === SCAN_ID) { tip.textContent = scanLabel(); placeTip(tip, btn); }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-absda-scanning"] }));

  // The scan menu, drawn in the page so it follows the theme.
  const SCAN_MENU_ID = "absda-scan-menu";
  function closeScanMenu() {
    const m = document.getElementById(SCAN_MENU_ID);
    if (m) m.remove();
    const b = document.getElementById(SCAN_ID);
    if (b) b.classList.remove("absda-active");
  }
  function toggleScanMenu(btn) {
    if (document.getElementById(SCAN_MENU_ID)) { closeScanMenu(); return; }
    // Current library name and how many libraries there are, from the library picker.
    const picker = document.querySelector("#appbar div:has(> ul.librariesDropdownMenu)");
    const current = picker ? (picker.querySelector("button span:not(.abs-icons)") || picker.querySelector("button")).innerText.trim() : "";
    const count = picker ? picker.querySelectorAll("ul.librariesDropdownMenu li").length : 1;
    const menu = el("div");
    menu.id = SCAN_MENU_ID;
    menu.setAttribute("role", "menu");
    const item = (label, all) => {
      const b = el("button", "absda-scan-item");
      b.type = "button";
      b.setAttribute("role", "menuitem");
      b.textContent = label;
      b.addEventListener("click", () => { closeScanMenu(); ipcRenderer.send("desktop:scan", { all }); });
      return b;
    };
    menu.append(item(T("scan.library", "Scan “{name}”").replace("{name}", current || T("scan.button", "Scan library")), false));
    if (count > 1) menu.append(item(T("scan.all", "Scan all libraries"), true));
    document.body.append(menu);
    const r = btn.getBoundingClientRect();
    menu.style.top = `${Math.round(r.bottom + 8)}px`;
    menu.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, r.left + r.width / 2 - menu.offsetWidth / 2)))}px`;
    btn.classList.add("absda-active");
    menu.querySelector("button").focus();
  }
  document.addEventListener("mousedown", (e) => {
    if (document.getElementById(SCAN_MENU_ID) && !e.target.closest("#" + SCAN_MENU_ID + ", #" + SCAN_ID)) closeScanMenu();
  }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeScanMenu(); }, true);

  function ensureScanButton() {
    if (windowKind !== "main") return;
    const existing = document.getElementById(SCAN_ID);
    // Admins only: Audiobookshelf shows the Settings gear only to admins.
    const isAdmin = !!document.querySelector('#appbar a[href$="/config"]');
    const anchor = document.querySelector('#appbar a[href$="/config/stats"]') || document.getElementById(BRUSH_ID);
    if (!prefs.scanButton || !isAdmin || !anchor) { if (existing) existing.remove(); return; }
    if (existing) { existing.setAttribute("aria-label", scanLabel()); return; }
    ensureStyle();
    const btn = el("button", anchor.className);
    btn.id = SCAN_ID;
    btn.type = "button";
    btn.setAttribute("aria-label", scanLabel());
    btn.innerHTML = SCAN_SVG;
    // Click → a small themed menu: this library, or all libraries.
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      hideTip();
      toggleScanMenu(btn);
    });
    btn.addEventListener("mouseenter", showTip);
    btn.addEventListener("mouseleave", hideTip);
    anchor.before(btn);   // left of "Your Stats"
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
      ensureScanButton();
      ensureOverlayHead();
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
