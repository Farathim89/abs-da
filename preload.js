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

  // The web app changes pages without reloading, so watch for the login form
  // and for new reader frames appearing.
  let timer = null;
  let frameTimer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(setupLoginForm, 150);
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
