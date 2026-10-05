// SPDX-License-Identifier: GPL-3.0-or-later
// ===========================================================================
// ABS-DA (ABS Desktop App) — an unofficial Windows desktop app for Audiobookshelf.
// Copyright (C) 2026 Farathim. Free software under the GNU GPL v3 or later; see LICENSE.
//
// Runs the official Audiobookshelf web app (player, reader and every admin
// tool) with a dark custom title bar and desktop extras: remembered server,
// login and window size, mouse back/forward buttons, outside links opening in
// your browser, themes and bookshelf art, the system tray, a single running
// instance, and installer/portable builds.
//
// Layout: the window itself shows our title bar (titlebar.html). The
// Audiobookshelf web app runs in a WebContentsView placed underneath it.
// ===========================================================================

const {
  app, BrowserWindow, WebContentsView, Menu, Tray, ipcMain, shell, dialog,
  screen, session, safeStorage, webContents,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { normalizeServer, probeServer } = require("./server");
const { SHELF_ARTS, artUrl } = require("./shelf-art");

// ---------------------------------------------------------------------------
// Settings folder: next to the .exe for the portable build, %APPDATA% when installed.
// Versions before 2.0 were called "Audiobookshelf Player" — carry their settings
// (server, saved login, theme, window size) over once, so upgrading is seamless.
// ---------------------------------------------------------------------------
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  const dir = process.env.PORTABLE_EXECUTABLE_DIR;
  const oldDir = path.join(dir, "abs-player-data");
  const newDir = path.join(dir, "abs-da-data");
  try { if (!fs.existsSync(newDir) && fs.existsSync(oldDir)) fs.renameSync(oldDir, newDir); } catch {}
  app.setPath("userData", newDir);
} else {
  const newDir = app.getPath("userData");
  const oldDir = path.join(app.getPath("appData"), "Audiobookshelf Player");
  // Everything but the caches: the saved login needs its key from "Local State", and the
  // web app's sign-in lives in "Local Storage" / "Network".
  const SKIP = /cache|^blob_storage$/i;
  if (!fs.existsSync(path.join(newDir, "config.json")) && fs.existsSync(path.join(oldDir, "config.json"))) {
    try {
      fs.cpSync(oldDir, newDir, {
        recursive: true,
        filter: (src) => !SKIP.test(path.basename(src)) || src === oldDir,
      });
    } catch {}
  }
}

// Only one copy of the app at a time — launching it again focuses the open one.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// A fixed Windows app ID: groups the app's notifications/taskbar correctly, and is the
// name of its "Start with Windows" registry entry (the uninstaller removes that entry).
const APP_ID = "com.farathim.audiobookshelfplayer";
app.setAppUserModelId(APP_ID);

// Started by Windows at sign-in ("Start with Windows") → go straight to the tray.
const startHidden = process.argv.includes("--hidden");

const BG = "#232323";              // matches the Audiobookshelf dark theme (no white flash)
const ICON = path.join(__dirname, "build", "icon.ico");
const PRELOAD = path.join(__dirname, "preload.js");

// Custom title bar height (its colours come from the theme).
const TITLE_H = 36;

// Style fixes for bugs in the Audiobookshelf web app itself, added to every server page.
//  - Bug #4818: the volume slider and playback-speed menu pop up *behind* the
//    ebook reader (reader is z-60, player bar z-50). While the reader is open,
//    lift the player above it. The reader already stops 164px above the bottom
//    to make room for the player, so only those pop-up menus are affected.
const ABS_CSS_FIXES = `
  body:has(#reader) #mediaPlayerContainer { z-index: 61 !important; }
  #mediaPlayerContainer .volumeMenu { z-index: 30; }
`;

// ---- Themes ----------------------------------------------------------------
// The Audiobookshelf web app takes its colours from CSS variables (--color-primary
// = page background, --color-bg = panels, --color-black-* = grays for borders/
// hover/inputs, --color-accent), so a theme just overrides those. `title` colours
// the custom title bar and Windows' minimise/maximise/close buttons.
//
// With a Windows Contrast Theme on, Windows swaps every colour for the contrast
// theme's colours (sliders like volume and the seek bar vanish). All themes
// except "Windows contrast colours" opt the app out of that.
const NO_FORCED_COLORS_CSS = ":root, *, *::before, *::after { forced-color-adjust: none !important; }";
const DEFAULT_TITLE = { bg: "#1b1b1b", fg: "#e5e5e5", hover: "#333333", logo: "#f0a848" };

const THEMES = {
  abs: { label: "Audiobookshelf", title: DEFAULT_TITLE },
  midnight: {
    label: "Midnight",
    title: { bg: "#0e1420", fg: "#e3e8f2", hover: "#263045", logo: "#5aa9ff" },
    tint: "rgba(14, 26, 54, 0.62)",
    shelf: "linear-gradient(180deg, #5b6f96 0%, #33456b 17%, #33456b 88%, #1c2742 100%)",
    scroll: "#46598a",
    page: "linear-gradient(to right bottom, #1c2536, #121826)",
    colors: {
      primary: "#121826", bg: "#1c2536", accent: "#5aa9ff",
      "black-50": "#b6bfd0", "black-100": "#6b7790", "black-200": "#556078", "black-300": "#3e485d",
      "black-400": "#2c3446", "black-500": "#1b2232", "black-600": "#111724", "black-700": "#0c111b",
    },
  },
  oled: {
    label: "OLED Black",
    title: { bg: "#000000", fg: "#e5e5e5", hover: "#1f1f1f", logo: "#f0a848" },
    tint: "rgba(0, 0, 0, 0.6)",
    shelf: "linear-gradient(180deg, #3a3a3a 0%, #1f1f1f 17%, #1f1f1f 88%, #0d0d0d 100%)",
    scroll: "#3a3a3a",
    page: "linear-gradient(to right bottom, #111111, #000000)",
    colors: {
      primary: "#000000", bg: "#111111",
      "black-50": "#b5b5b5", "black-100": "#5c5c5c", "black-200": "#474747", "black-300": "#333333",
      "black-400": "#222222", "black-500": "#141414", "black-600": "#0a0a0a", "black-700": "#050505",
    },
  },
  forest: {
    label: "Forest",
    title: { bg: "#0f1612", fg: "#e2ebe4", hover: "#26342b", logo: "#74d68a" },
    tint: "rgba(14, 40, 24, 0.6)",
    shelf: "linear-gradient(180deg, #6f8f6a 0%, #3f5a3b 17%, #3f5a3b 88%, #24361f 100%)",
    scroll: "#4e6b49",
    page: "linear-gradient(to right bottom, #1f2b24, #141c17)",
    colors: {
      primary: "#141c17", bg: "#1f2b24", accent: "#74d68a",
      "black-50": "#b8c6bc", "black-100": "#6c8072", "black-200": "#55675a", "black-300": "#3f4e44",
      "black-400": "#2d3a31", "black-500": "#1c251f", "black-600": "#121914", "black-700": "#0c120e",
    },
  },
  mocha: {
    label: "Mocha",
    title: { bg: "#15110e", fg: "#eee5dd", hover: "#322822", logo: "#e6a85c" },
    tint: "rgba(40, 24, 12, 0.35)",
    shelf: "linear-gradient(180deg, #a07a55 0%, #6b4a2c 17%, #6b4a2c 88%, #45301b 100%)",
    page: "linear-gradient(to right bottom, #2a221d, #1c1714)",
    colors: {
      primary: "#1c1714", bg: "#2a221d", accent: "#e6a85c",
      "black-50": "#cbbfb5", "black-100": "#7d6f65", "black-200": "#645850", "black-300": "#4c423b",
      "black-400": "#382f2a", "black-500": "#241e1a", "black-600": "#17130f", "black-700": "#110d0b",
    },
  },
  amethyst: {
    label: "Amethyst",
    title: { bg: "#141220", fg: "#e9e5f5", hover: "#2f2a45", logo: "#b58cff" },
    tint: "rgba(36, 20, 66, 0.6)",
    shelf: "linear-gradient(180deg, #8a73b8 0%, #54417e 17%, #54417e 88%, #2f2350 100%)",
    scroll: "#6a5596",
    page: "linear-gradient(to right bottom, #27233a, #1b1828)",
    colors: {
      primary: "#1b1828", bg: "#27233a", accent: "#b58cff",
      "black-50": "#c4bfda", "black-100": "#78729c", "black-200": "#5e5982", "black-300": "#474263",
      "black-400": "#34304c", "black-500": "#221f33", "black-600": "#161423", "black-700": "#100e19",
    },
  },
  contrast: { label: "Windows contrast colours", contrast: true, title: DEFAULT_TITLE },
};

// The web app's own wood bookshelf image, e.g. url("…/wood_default.jpg").
// Read from the page once, so themes can lay a colour tint over it.
let woodTexture = null;
async function readWoodTexture(contents) {
  if (woodTexture || contents.isDestroyed()) return;
  try {
    const v = await contents.executeJavaScript(
      "getComputedStyle(document.documentElement).getPropertyValue('--bookshelf-texture-img').trim()"
    );
    if (v && v.startsWith("url(")) woodTexture = v;
  } catch {}
}

// The CSS added to every page for a theme.
function themeCss(id) {
  const t = THEMES[id];
  const parts = [];
  if (!t.contrast) parts.push(NO_FORCED_COLORS_CSS);
  if (t.colors) {
    parts.push("html:root {" + Object.entries(t.colors).map(([k, v]) => ` --color-${k}: ${v} !important;`).join("") + " }");
  }
  // Bookshelf art: a texture from shelf-art.js, none (flat), or the classic wood
  // tinted in the theme's colour.
  const artId = shelfArtId();
  const art = SHELF_ARTS[artId];
  if (artId === "none") {
    parts.push("html:root { --bookshelf-texture-img: none !important; }");
  } else if (art.svg) {
    parts.push(`html:root { --bookshelf-texture-img: ${artUrl(art)} !important; }`);
  } else if (t.tint && woodTexture) {
    parts.push(`html:root { --bookshelf-texture-img: linear-gradient(${t.tint}, ${t.tint}), ${woodTexture} !important; }`);
  }
  // Shelf planks match the art (or the theme for classic wood / flat).
  const plank = art.plank || t.shelf;
  if (plank) {
    // Library page planks use the variable; Home page planks have their own hard-coded gradient.
    parts.push(`html:root { --bookshelf-divider-bg: ${plank} !important; }`);
    parts.push(`.bookshelfDividerCategorized { background: ${plank} !important; }`);
  }
  if (t.scroll) {
    // Both scrollbar styles: the standard one (used by the bookshelf) wins over the older ::-webkit one.
    parts.push(`::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: ${t.scroll} !important; }`);
    parts.push(`#bookshelf { scrollbar-color: ${t.scroll} rgba(0, 0, 0, 0) !important; }`);
  }
  if (t.page) parts.push(`#bookshelf, #page-wrapper { background-image: ${t.page} !important; }`);
  const tb = t.title;
  parts.push(`html:root { --tb-bg: ${tb.bg}; --tb-fg: ${tb.fg}; --tb-hover: ${tb.hover}; --tb-logo: ${tb.logo}; }`);
  // The connect / can't-reach screen (connect.css) follows the theme too.
  const c = t.colors || {};
  parts.push(`html:root { --cn-bg: ${c.primary || "#232323"}; --cn-card: ${c.bg || "#2e2d2b"}; ` +
    `--cn-field: ${c["black-400"] || "#3a3835"}; --cn-border: ${c["black-300"] || "#4a4744"}; --cn-accent: ${tb.logo}; }`);
  return parts.join("\n");
}

let win = null;                    // the window — shows our title bar
let view = null;                   // the Audiobookshelf web app, under the title bar
const wc = () => view.webContents;
let tray = null;                   // system tray icon
let isQuitting = false;            // true once the app is really quitting (not just hiding to tray)

let config = {};                   // { server, webUrl, themeMode } — saved in config.json
let clearHistoryOnLoad = false;    // drop the connect/error page from Back history
let lastNavAt = 0;

// "Remember me" state
let pendingLogin = null;           // credentials typed in, saved once the login succeeds
let reachedAppThisLaunch = false;  // got past the login page at least once this launch
let autoLoginUsed = false;         // auto sign-in is only attempted once per launch

// ---- small JSON file helpers ----------------------------------------------
const dataFile = (name) => path.join(app.getPath("userData"), name);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Could not save", file, err.message);
  }
}

// ---- remember window size / position --------------------------------------
function loadWindowState() {
  const s = readJson(dataFile("window-state.json"), {});
  const state = { width: s.width || 1280, height: s.height || 820, maximized: !!s.maximized };
  // Only restore the position if it's still on a connected screen.
  const onScreen = Number.isFinite(s.x) && Number.isFinite(s.y) && screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return s.x >= a.x - 40 && s.y >= a.y - 40 && s.x < a.x + a.width - 120 && s.y < a.y + a.height - 120;
  });
  if (onScreen) { state.x = s.x; state.y = s.y; }
  return state;
}
function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  writeJson(dataFile("window-state.json"), { ...win.getNormalBounds(), maximized: win.isMaximized() });
}

// ---- "Remember me": saved login, encrypted with Windows' own protection ----
// (safeStorage uses Windows DPAPI — only your Windows account can decrypt it.)
const loginFile = () => dataFile("login.json");

function loadSavedLogin() {
  const d = readJson(loginFile(), null);
  if (!d || !d.data || d.server !== config.server) return null;   // saved for another server
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(d.data, "base64")));
  } catch {
    return null;   // e.g. portable copy moved to another PC — just type it again
  }
}
function saveLogin(creds) {
  if (!safeStorage.isEncryptionAvailable()) return;   // never store a password in plain text
  const data = safeStorage.encryptString(JSON.stringify({ username: creds.username, password: creds.password }));
  writeJson(loginFile(), { server: config.server, data: data.toString("base64") });
}
function forgetLogin() {
  pendingLogin = null;
  try { fs.unlinkSync(loginFile()); } catch {}
}

// Called on every page change. Once we're past the login page the sign-in
// worked, so a pending "Remember me" login gets saved.
function onServerPage(url) {
  if (!isServerUrl(url)) return;
  const pagePath = new URL(url).pathname.replace(/\/+$/, "");
  const rootPath = new URL(config.webUrl).pathname.replace(/\/+$/, "");
  if (/\/login$/i.test(pagePath) || pagePath === rootPath) return;   // login page, or the root that redirects
  reachedAppThisLaunch = true;
  if (pendingLogin) {
    saveLogin(pendingLogin);
    pendingLogin = null;
  }
}

// ---- page styles: bug fixes + theme ----------------------------------------
const themeKeys = new WeakMap();   // webContents → key of the inserted theme CSS
const themeId = () => (THEMES[config.themeMode] ? config.themeMode : "abs");
const currentTheme = () => THEMES[themeId()];

// Add our styles to a page. isNewPage = the page just (re)loaded, so anything
// inserted before is already gone. Runs one at a time per page, so quick theme
// switches can't leave an old theme's styles behind.
const cssQueues = new WeakMap();
function applyPageCss(contents, isNewPage) {
  const next = (cssQueues.get(contents) || Promise.resolve())
    .then(() => applyPageCssNow(contents, isNewPage))
    .catch(() => {});
  cssQueues.set(contents, next);
  return next;
}

async function applyPageCssNow(contents, isNewPage) {
  if (contents.isDestroyed()) return;
  if (isNewPage) {
    themeKeys.delete(contents);
    if (isServerUrl(contents.getURL())) {
      contents.insertCSS(ABS_CSS_FIXES).catch(() => {});
      await readWoodTexture(contents);   // before our theme replaces it
    }
  }
  const oldKey = themeKeys.get(contents);
  if (oldKey) {
    themeKeys.delete(contents);
    await contents.removeInsertedCSS(oldKey).catch(() => {});
  }
  const key = await contents.insertCSS(themeCss(themeId())).catch(() => null);
  if (key) themeKeys.set(contents, key);
  // Let the page carry the colour setting into the e-book reader's frames (see preload.js).
  if (!contents.isDestroyed()) contents.send("desktop:sync-frames");
}

// Title bar buttons (drawn by Windows) and the web app's backdrop follow the theme.
function applyWindowColors() {
  const t = currentTheme();
  if (win && !win.isDestroyed()) {
    win.setTitleBarOverlay({ color: t.title.bg, symbolColor: t.title.fg, height: TITLE_H });
    win.setBackgroundColor(t.title.bg);
  }
  if (view) view.setBackgroundColor((t.colors && t.colors.primary) || BG);
}

// Re-apply the current theme to every open page (live, no reload).
function reapplyTheme() {
  applyWindowColors();
  for (const c of webContents.getAllWebContents()) {
    if (c.getType() === "window" || c.getType() === "browserView") applyPageCss(c, false);
  }
}

// Switch theme live (no reload, so playback isn't interrupted) and remember it.
function setTheme(id) {
  config = { ...config, themeMode: id };
  writeJson(dataFile("config.json"), config);
  reapplyTheme();
}

// Current bookshelf art (older versions had a wood on/off switch → "none").
function shelfArtId() {
  if (SHELF_ARTS[config.shelfArt]) return config.shelfArt;
  return config.woodShelf === false ? "none" : "classic";
}

// View → Bookshelf: pick the shelf art (live, remembered).
function setShelfArt(id) {
  config = { ...config, shelfArt: id };
  delete config.woodShelf;
  writeJson(dataFile("config.json"), config);
  reapplyTheme();
}

// ---- navigation helpers ----------------------------------------------------
function serverOrigin() {
  try { return new URL(config.webUrl).origin; } catch { return null; }
}
function isServerUrl(url) {
  const origin = serverOrigin();
  try { return !!origin && new URL(url).origin === origin; } catch { return false; }
}
function openExternal(url) {
  if (/^(https?|mailto):/i.test(String(url))) shell.openExternal(url);
}
function showConnectPage(mode, message) {
  wc().loadFile(path.join(__dirname, "connect.html"), { query: { mode, msg: message || "" } });
}
function loadServer() {
  clearHistoryOnLoad = true;
  wc().loadURL(config.webUrl);
}
function goHome() {
  if (config.webUrl) loadServer(); else showConnectPage("setup");
}
function navigate(direction) {
  if (!view) return;
  const now = Date.now();
  if (now - lastNavAt < 350) return;   // side buttons can arrive twice (mouse event + app-command)
  lastNavAt = now;
  const h = wc().navigationHistory;
  if (direction < 0 && h.canGoBack()) h.goBack();
  if (direction > 0 && h.canGoForward()) h.goForward();
}

// ---- view actions (used by the menu and the keyboard shortcuts) -----------
function zoom(step) {
  const c = wc();
  c.setZoomLevel(step === 0 ? 0 : Math.max(-3, Math.min(5, c.getZoomLevel() + step * 0.5)));
}
function toggleFullScreen() {
  win.setFullScreen(!win.isFullScreen());
}
function toggleDevTools() {
  const c = wc();
  if (c.isDevToolsOpened()) c.closeDevTools(); else c.openDevTools({ mode: "detach" });
}

// Keyboard shortcuts — handled here so they work whether the title bar or the
// web app has focus (the menu only *shows* them).
function onShortcut(event, input) {
  if (input.type !== "keyDown") return;
  const key = input.key;
  const ctrl = input.control || input.meta;
  let action = null;
  if (key === "F5") action = () => wc().reload();
  else if (key === "F11") action = toggleFullScreen;
  else if (input.alt && !ctrl && key === "ArrowLeft") action = () => navigate(-1);
  else if (input.alt && !ctrl && key === "ArrowRight") action = () => navigate(1);
  else if (input.alt && !ctrl && key === "Home") action = goHome;
  else if (ctrl && input.shift && key.toLowerCase() === "i") action = toggleDevTools;
  else if (ctrl && !input.alt && (key === "=" || key === "+")) action = () => zoom(1);
  else if (ctrl && !input.alt && (key === "-" || key === "_")) action = () => zoom(-1);
  else if (ctrl && !input.alt && key === "0") action = () => zoom(0);
  if (action) {
    event.preventDefault();
    action();
  }
}

// ---- Start with Windows ----------------------------------------------------
// The startup entry must point at the real .exe: the installed app, or for the
// portable build the portable file itself (not its temporary unpacked copy).
// The path is quoted because it contains spaces (Electron doesn't quote it).
const loginItem = () => ({
  path: `"${process.env.PORTABLE_EXECUTABLE_FILE || process.execPath}"`,
  args: ["--hidden"],
});
const startsWithWindows = () => app.isPackaged && app.getLoginItemSettings(loginItem()).openAtLogin;
function setStartWithWindows(on) {
  if (!app.isPackaged) return;   // only the built app, not the development copy
  app.setLoginItemSettings({ openAtLogin: on, ...loginItem() });
  config.startWithWindows = on;
  writeJson(dataFile("config.json"), config);
}
// Re-register at every start, so the entry follows the .exe if it moved or was renamed
// (e.g. an update or a portable copy in a new folder).
function refreshStartWithWindows() {
  if (config.startWithWindows && !startsWithWindows()) setStartWithWindows(true);
}

// ---- system tray: keep playing with the window closed ---------------------
const closeToTray = () => config.closeToTray !== false;

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// What the official player is doing right now (reads its own player component
// and the media info it gives Windows).
async function playerState() {
  if (!view || view.webContents.isDestroyed()) return { active: false };
  try {
    return await view.webContents.executeJavaScript(`(() => {
      const el = document.getElementById('mediaPlayerContainer');
      const p = el && el.__vue__;
      if (!p) return { active: false };
      const m = navigator.mediaSession && navigator.mediaSession.metadata;
      return { active: true, playing: !!p.isPlaying, title: m ? m.title : '', artist: m ? m.artist : '',
        sleep: !!p.sleepTimerSet, sleepType: p.sleepTimerType, sleepLeft: p.sleepTimerRemaining || 0,
        hasChapters: !!(p.chapters && p.chapters.length) };
    })()`);
  } catch {
    return { active: false };
  }
}

// Send a command to the official player (the same ones Windows' media keys use).
function playerCommand(cmd) {
  const calls = {
    toggle: "p.isPlaying ? p.mediaSessionPause() : p.mediaSessionPlay()",
    back: "p.mediaSessionSeekBackward()",
    forward: "p.mediaSessionSeekForward()",
    prevChapter: "p.mediaSessionPreviousTrack()",
    nextChapter: "p.mediaSessionNextTrack()",
  };
  if (!calls[cmd] || !view) return;
  view.webContents.executeJavaScript(
    `(() => { const el = document.getElementById('mediaPlayerContainer'); const p = el && el.__vue__; if (p) { ${calls[cmd]}; } })()`
  ).catch(() => {});
}

// Sleep timer, using the official player's own timer (so the player shows it too).
// minutes = number of minutes, "chapter" = end of the current chapter, "cancel".
function sleepCommand(minutes) {
  let call;
  if (minutes === "cancel") call = "p.cancelSleepTimer()";
  else if (minutes === "chapter") call = "p.setSleepTimer({ timerType: 'chapter' })";
  else if (Number.isFinite(minutes) && minutes > 0) call = `p.setSleepTimer({ timerType: 'countdown', seconds: ${Math.round(minutes * 60)} })`;
  if (!call || !view) return;
  view.webContents.executeJavaScript(
    `(() => { const el = document.getElementById('mediaPlayerContainer'); const p = el && el.__vue__; if (p) { ${call}; } })()`
  ).catch(() => {});
  setTimeout(updateTrayTooltip, 300);
}

function sleepLabel(s) {
  if (!s.sleep) return "";
  return s.sleepType === "chapter" ? "Sleep at end of chapter" : `Sleep in ${Math.max(1, Math.ceil(s.sleepLeft / 60))} min`;
}

async function updateTrayTooltip() {
  if (!tray || tray.isDestroyed()) return;
  const s = await playerState();
  let tip = "ABS Desktop App";
  if (s.active && s.title) tip += `\n${s.playing ? "▶" : "❚❚"} ${s.title}${s.artist ? " — " + s.artist : ""}`;
  if (s.active && s.sleep) tip += `\n🌙 ${sleepLabel(s)}`;
  tray.setToolTip(tip.slice(0, 127));   // Windows limits tray tooltips to 127 characters
}

async function showTrayMenu() {
  const s = await playerState();
  const items = [];
  if (s.active) {
    if (s.title) items.push({ label: (s.title + (s.artist ? " — " + s.artist : "")).slice(0, 60), enabled: false });
    items.push(
      { label: s.playing ? "Pause" : "Play", click: () => playerCommand("toggle") },
      { label: "Jump back", click: () => playerCommand("back") },
      { label: "Jump forward", click: () => playerCommand("forward") },
      { label: "Previous chapter", click: () => playerCommand("prevChapter") },
      { label: "Next chapter", click: () => playerCommand("nextChapter") },
      { type: "separator" },
      {
        label: s.sleep ? `Sleep timer — ${sleepLabel(s)}` : "Sleep timer",
        submenu: [
          ...[15, 30, 45, 60, 90].map((min) => ({ label: `${min} minutes`, click: () => sleepCommand(min) })),
          { type: "separator" },
          { label: "End of chapter", enabled: s.hasChapters, click: () => sleepCommand("chapter") },
          { type: "separator" },
          { label: "Cancel sleep timer", enabled: s.sleep, click: () => sleepCommand("cancel") },
        ],
      },
      { type: "separator" },
    );
  } else {
    items.push({ label: "Nothing playing", enabled: false }, { type: "separator" });
  }
  items.push(
    { label: "Show ABS Desktop App", click: showWindow },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  );
  tray.popUpContextMenu(Menu.buildFromTemplate(items));
}

function createTray() {
  tray = new Tray(ICON);
  tray.setToolTip("ABS Desktop App");
  tray.on("click", showWindow);
  tray.on("right-click", showTrayMenu);
  setInterval(updateTrayTooltip, 5000);   // keep "now playing" in the tooltip current
}

// ---- the window ------------------------------------------------------------
// Keep the web app filling everything below the title bar (all of it in full screen).
function layout() {
  if (!win || !view) return;
  const { width, height } = win.getContentBounds();
  const top = win.isFullScreen() ? 0 : TITLE_H;
  view.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
}

function createWindow() {
  const state = loadWindowState();
  const webPreferences = { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true };
  const theme = currentTheme();

  win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 800,
    minHeight: 560,
    title: "ABS Desktop App",
    icon: ICON,
    backgroundColor: theme.title.bg,
    show: false,
    // No Windows frame: we draw the title bar; Windows draws min/max/close in the theme's colours.
    titleBarStyle: "hidden",
    titleBarOverlay: { color: theme.title.bg, symbolColor: theme.title.fg, height: TITLE_H },
    webPreferences,
  });
  if (state.maximized) win.maximize();
  win.on("page-title-updated", (e) => e.preventDefault());   // window title follows the web app
  win.webContents.on("will-navigate", (e) => e.preventDefault());   // the title bar never navigates
  win.webContents.on("before-input-event", onShortcut);
  win.loadFile(path.join(__dirname, "titlebar.html"));
  win.once("ready-to-show", () => {
    if (startHidden) return;   // started with Windows → stay in the tray
    win.show();
    wc().focus();
  });
  // Closing hides to the tray (audio keeps playing) unless you're quitting or turned it off.
  win.on("close", (e) => {
    saveWindowState();
    if (isQuitting || !closeToTray() || !tray) return;
    e.preventDefault();
    win.hide();
    if (!config.trayHintShown) {
      tray.displayBalloon({
        iconType: "info",
        title: "Still running",
        content: "ABS Desktop App keeps playing in the tray. Right-click the tray icon to quit.",
      });
      config = { ...config, trayHintShown: true };
      writeJson(dataFile("config.json"), config);
    }
  });
  win.on("focus", () => {
    win.webContents.send("titlebar:focus", true);
    if (view) wc().focus();
  });
  win.on("blur", () => win.webContents.send("titlebar:focus", false));

  // The Audiobookshelf web app, in a panel under the title bar.
  // backgroundThrottling off: when the window is hidden in the tray, the web app's
  // timers (listening-progress sync) keep running at full speed.
  view = new WebContentsView({ webPreferences: { ...webPreferences, backgroundThrottling: false } });
  view.setBackgroundColor((theme.colors && theme.colors.primary) || BG);
  win.contentView.addChildView(view);
  layout();
  for (const ev of ["resize", "maximize", "unmaximize", "enter-full-screen", "leave-full-screen"]) win.on(ev, layout);

  const contents = view.webContents;
  contents.on("before-input-event", onShortcut);

  // Title bar text follows the web app's page title.
  contents.on("page-title-updated", (_e, title) => {
    win.setTitle(title);
    win.webContents.send("titlebar:title", title);
  });

  // Your server stays in the app; links to other sites open in your browser.
  // Exception: single sign-on (OpenID). Your server redirects to its login provider
  // (Authentik, Keycloak, Authelia…); that login runs in the app until it sends you back.
  let ssoLogin = false;
  let navStart = "";   // where the current page load began (before any redirects)
  contents.on("did-start-navigation", (e) => {
    if (e.isMainFrame && !e.isSameDocument && !e.url.startsWith("about:")) navStart = e.url;
  });
  contents.on("will-redirect", (e) => {
    if (e.isMainFrame && isServerUrl(navStart) && !isServerUrl(e.url)) ssoLogin = true;
  });
  contents.on("did-navigate", (_e, url) => { if (isServerUrl(url)) ssoLogin = false; });
  contents.on("will-navigate", (e, url) => {
    if (!isServerUrl(url) && !(ssoLogin && /^https?:/i.test(url))) {
      e.preventDefault();
      openExternal(url);
    }
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isServerUrl(url)) {
      return { action: "allow", overrideBrowserWindowOptions: { icon: ICON, backgroundColor: BG, autoHideMenuBar: true } };
    }
    openExternal(url);
    return { action: "deny" };
  });

  // Server unreachable → friendly page with Retry / Change server.
  contents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || String(url).startsWith("file:")) return; // -3 = aborted (normal)
    showConnectPage("error", `${desc} (${code})`);
  });

  // After connecting/retrying, forget the local page so Back doesn't return to it.
  contents.on("did-finish-load", () => {
    if (clearHistoryOnLoad && isServerUrl(contents.getURL())) {
      clearHistoryOnLoad = false;
      contents.navigationHistory.clear();
    }
  });

  // Mouse side buttons — Windows delivers these as app commands.
  win.on("app-command", (_e, cmd) => {
    if (cmd === "browser-backward") navigate(-1);
    if (cmd === "browser-forward") navigate(1);
  });

  // Track page changes (the web app is single-page, so in-page changes count too).
  contents.on("did-navigate", (_e, url) => onServerPage(url));
  contents.on("did-navigate-in-page", (_e, url, isMainFrame) => { if (isMainFrame) onServerPage(url); });

  if (!app.isPackaged) contents.on("did-navigate", (_e, url) => console.log("[nav]", url));

  if (config.webUrl) loadServer(); else showConnectPage("setup");
}

// ---- menu (opened from the title bar) --------------------------------------
function showAbout() {
  dialog.showMessageBox(win, {
    type: "info",
    title: "About",
    message: `ABS Desktop App ${app.getVersion()}`,
    detail: `Desktop app for your Audiobookshelf server.\n\nServer: ${config.server || "not set"}\nElectron ${process.versions.electron}`,
    buttons: ["OK"],
  });
}

// Shortcuts are shown in the menu but handled by onShortcut, so they never fire twice.
const shortcut = (accelerator) => ({ accelerator, registerAccelerator: false });

// View → Theme: one tick-item per theme, "Windows contrast colours" set apart at the end.
function themeMenuItems() {
  const items = [];
  for (const [id, t] of Object.entries(THEMES)) {
    if (t.contrast) items.push({ type: "separator" });
    items.push({ label: t.label, type: "radio", checked: themeId() === id, click: () => setTheme(id) });
  }
  return items;
}

// View → Bookshelf: one tick-item per shelf art, with a separator between groups
// (wood · stone · materials · scenes · none).
function shelfMenuItems() {
  const items = [];
  let lastGroup = null;
  for (const [id, a] of Object.entries(SHELF_ARTS)) {
    if (lastGroup && a.group !== lastGroup) items.push({ type: "separator" });
    lastGroup = a.group;
    items.push({ label: a.label, type: "radio", checked: shelfArtId() === id, click: () => setShelfArt(id) });
  }
  return items;
}

// Built fresh each time it opens, so the Theme tick is always current.
// The order of the top-level menus must match the buttons in titlebar.html.
function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: "App",
      submenu: [
        { label: "Home", ...shortcut("Alt+Home"), click: goHome },
        { label: "Change Server…", click: () => showConnectPage("change") },
        {
          label: "Forget Saved Login",
          click: () => {
            forgetLogin();
            dialog.showMessageBox(win, { type: "info", title: "Saved login", message: "Your saved login was removed.", buttons: ["OK"] });
          },
        },
        {
          label: "Keep running in tray when closed",
          type: "checkbox",
          checked: closeToTray(),
          click: (item) => {
            config = { ...config, closeToTray: item.checked };
            writeJson(dataFile("config.json"), config);
          },
        },
        {
          label: app.isPackaged ? "Start with Windows (in the tray)" : "Start with Windows (installed app only)",
          type: "checkbox",
          enabled: app.isPackaged,
          checked: startsWithWindows(),
          click: (item) => setStartWithWindows(item.checked),
        },
        { type: "separator" },
        { label: "Reload", ...shortcut("F5"), click: () => wc().reload() },
        { type: "separator" },
        { label: "Exit", click: () => app.quit() },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", ...shortcut("Ctrl+Z"), click: () => wc().undo() },
        { label: "Redo", ...shortcut("Ctrl+Y"), click: () => wc().redo() },
        { type: "separator" },
        { label: "Cut", ...shortcut("Ctrl+X"), click: () => wc().cut() },
        { label: "Copy", ...shortcut("Ctrl+C"), click: () => wc().copy() },
        { label: "Paste", ...shortcut("Ctrl+V"), click: () => wc().paste() },
        { label: "Select All", ...shortcut("Ctrl+A"), click: () => wc().selectAll() },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Zoom In", ...shortcut("Ctrl+="), click: () => zoom(1) },
        { label: "Zoom Out", ...shortcut("Ctrl+-"), click: () => zoom(-1) },
        { label: "Actual Size", ...shortcut("Ctrl+0"), click: () => zoom(0) },
        { type: "separator" },
        { label: "Theme", submenu: themeMenuItems() },
        { label: "Bookshelf", submenu: shelfMenuItems() },
        { type: "separator" },
        { label: "Full Screen", ...shortcut("F11"), click: toggleFullScreen },
      ],
    },
    {
      label: "Navigate",
      submenu: [
        { label: "Back", ...shortcut("Alt+Left"), click: () => navigate(-1) },
        { label: "Forward", ...shortcut("Alt+Right"), click: () => navigate(1) },
      ],
    },
    {
      label: "Help",
      submenu: [
        { label: "Open in Browser", click: () => openExternal(wc().getURL()) },
        { label: "Audiobookshelf Documentation", click: () => openExternal("https://www.audiobookshelf.org/docs") },
        { type: "separator" },
        { label: "Toggle Developer Tools", ...shortcut("Ctrl+Shift+I"), click: toggleDevTools },
        { type: "separator" },
        { label: "About ABS Desktop App", click: showAbout },
      ],
    },
  ]);
}

// Only grant the browser permissions the web app actually needs.
function hardenSession() {
  const allowed = new Set(["fullscreen", "clipboard-sanitized-write", "clipboard-read", "notifications"]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
}

// ---- messages from the app's local pages (title bar, connect/error screen) -
// The bridge is only exposed to the app's own local pages, and we double-check
// the sender here so the remote web app can never use it.
const fromLocalPage = (e) => {
  try { return e.senderFrame.url.startsWith("file:"); } catch { return false; }
};

ipcMain.handle("desktop:get-config", (e) =>
  fromLocalPage(e) ? { server: config.server || "", hasServer: !!config.webUrl } : null
);

ipcMain.handle("desktop:connect", async (e, input) => {
  if (!fromLocalPage(e)) return { ok: false, error: "Not allowed." };
  const base = normalizeServer(input);
  if (!base) return { ok: false, error: "That doesn't look like a server address." };
  const res = await probeServer(base);
  if (!res.ok) return res;
  config = { ...config, server: base, webUrl: res.webUrl };   // keep other settings (theme)
  writeJson(dataFile("config.json"), config);
  setImmediate(loadServer);   // reply first, then leave the connect page
  return { ok: true };
});

ipcMain.handle("desktop:retry", (e) => {
  if (fromLocalPage(e) && config.webUrl) setImmediate(loadServer);
});

// Title bar: current page title, and opening one of the menus under its button.
ipcMain.handle("titlebar:get-title", (e) => (fromLocalPage(e) && view ? wc().getTitle() : ""));

ipcMain.handle("titlebar:menu", (e, { index, x, y } = {}) => new Promise((resolve) => {
  if (!fromLocalPage(e)) return resolve();
  const item = buildMenu().items[index];
  if (!item || !item.submenu) return resolve();
  item.submenu.popup({ window: win, x: Math.round(x), y: Math.round(y), callback: () => resolve() });
}));

// Mouse back/forward buttons reported by the page (see preload.js).
ipcMain.on("desktop:nav", (_e, direction) => navigate(direction === -1 ? -1 : 1));

// ---- "Remember me" on your server's login page (see preload.js) -----------
const fromServerPage = (e) => {
  try { return isServerUrl(e.senderFrame.url); } catch { return false; }
};

// Saved login for auto-fill. Auto sign-in only happens once per launch, and
// never after you've already been in the app (so logging out stays logged out).
ipcMain.handle("desktop:get-login", (e) => {
  if (!fromServerPage(e)) return null;
  const saved = loadSavedLogin();
  if (!saved) return null;
  const autoSubmit = !reachedAppThisLaunch && !autoLoginUsed;
  if (autoSubmit) autoLoginUsed = true;
  return { username: saved.username, password: saved.password, autoSubmit };
});

// "Change" link next to the server address on the login page.
ipcMain.on("desktop:change-server", (e) => {
  if (fromServerPage(e)) showConnectPage("change");
});

// The login form was submitted. Saved only once the sign-in succeeds.
ipcMain.on("desktop:login-submitted", (e, creds) => {
  if (!fromServerPage(e) || !creds) return;
  if (!creds.remember) { forgetLogin(); return; }
  if (creds.username) pendingLogin = { username: String(creds.username), password: String(creds.password || "") };
});

// ---- app lifecycle ---------------------------------------------------------
// Every page (title bar, web app, pop-ups, connect screen) gets our styles as soon as it's ready.
app.on("web-contents-created", (_e, contents) => {
  contents.on("dom-ready", () => applyPageCss(contents, true));
  // If the wood image wasn't readable yet at dom-ready, try again once the page has loaded.
  contents.on("did-finish-load", async () => {
    if (woodTexture || !isServerUrl(contents.getURL())) return;
    await readWoodTexture(contents);
    if (woodTexture) applyPageCss(contents, false);
  });
});

// Launching the app again (e.g. from the Start Menu while it's in the tray) shows the window.
app.on("second-instance", showWindow);

// A real quit (App → Exit, tray → Quit, Windows shutting down) closes instead of hiding.
app.on("before-quit", () => { isQuitting = true; });

app.whenReady().then(() => {
  if (!gotLock) return;
  config = readJson(dataFile("config.json"), {});
  refreshStartWithWindows();
  hardenSession();
  Menu.setApplicationMenu(null);   // no Windows menu bar — the menus live in our title bar
  createWindow();
  createTray();
});

app.on("window-all-closed", () => app.quit());
