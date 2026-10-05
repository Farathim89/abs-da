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
  screen, session, safeStorage, webContents, net, Notification,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { normalizeServer, probeServer } = require("./server");
const { SHELF_ARTS, artUrl } = require("./shelf-art");
const { pickLang, stringsFor, translator, LANGUAGES } = require("./i18n");

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
//  - The seek bar's hover bubble ("9:09:59 - Chapter 22") is a glaring white box:
//    make it dark with light text and a theme-coloured border and arrow.
const ABS_CSS_FIXES = `
  body:has(#reader) #mediaPlayerContainer { z-index: 61 !important; }
  #mediaPlayerContainer .volumeMenu { z-index: 30; }
  #mediaPlayerContainer div.bg-white.text-black.rounded-full:has(> p) {
    background: var(--color-primary, #232323) !important; color: #f3f4f6 !important;
    border: 1px solid var(--tb-logo, #f0a848); box-shadow: 0 2px 10px rgba(0, 0, 0, .6); }
  #mediaPlayerContainer div.bg-white.text-black.rounded-full:has(.arrow-down) { background: transparent !important; }
  #mediaPlayerContainer .arrow-down { border-top-color: var(--tb-logo, #f0a848) !important; }
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
  // Easier to see: pure black, white text, yellow highlights, strong outlines.
  highcontrast: {
    label: "High contrast",
    title: { bg: "#000000", fg: "#ffffff", hover: "#3a3a3a", logo: "#ffd400" },
    tint: "rgba(0, 0, 0, 0.55)",
    shelf: "linear-gradient(180deg, #ffffff 0%, #c8c8c8 17%, #c8c8c8 88%, #8a8a8a 100%)",
    scroll: "#ffffff",
    page: "linear-gradient(#000000, #000000)",
    colors: {
      primary: "#000000", bg: "#000000", accent: "#ffd400",
      "black-50": "#ffffff", "black-100": "#e6e6e6", "black-200": "#c8c8c8", "black-300": "#9a9a9a",
      "black-400": "#2a2a2a", "black-500": "#161616", "black-600": "#0a0a0a", "black-700": "#000000",
      // The web app's grey text, made bright.
      "gray-200": "#ffffff", "gray-300": "#ffffff", "gray-400": "#f0f0f0", "gray-500": "#dcdcdc", "gray-600": "#c4c4c4",
    },
    css: `
      input, textarea, select { border-color: #ffffff !important; }
      :focus-visible { outline: 3px solid #ffd400 !important; outline-offset: 2px !important; }
      #siderail-buttons-container a { border-bottom-color: #4a4a4a !important; }
      #appbar { border-bottom: 1px solid #4a4a4a; }
      .globalSearchMenu, .librariesDropdownMenu, [role="menu"], [role="listbox"] { border-color: #ffffff !important; }
      html:root body #appbar div:has(> ul.librariesDropdownMenu) > button,
      html:root body #appbar a[href$="/account"],
      html:root body #appbar .absda-search input { border-color: #ffffff !important; background: #000000 !important; }
    `,
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
  if (t.css) parts.push(t.css);
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
// First start: 1280×720, but never more than 85% of the screen (with Windows display
// scaling a laptop screen can be only ~1280×700 usable), centred. A remembered size
// that's too big for the screen it opens on (e.g. a smaller monitor) is shrunk the same way.
function loadWindowState() {
  const s = readJson(dataFile("window-state.json"), {});
  const onScreen = Number.isFinite(s.x) && Number.isFinite(s.y) && screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return s.x >= a.x - 40 && s.y >= a.y - 40 && s.x < a.x + a.width - 120 && s.y < a.y + a.height - 120;
  });
  const area = (onScreen ? screen.getDisplayNearestPoint({ x: s.x, y: s.y }) : screen.getPrimaryDisplay()).workArea;
  const width = Math.min(s.width || 1280, Math.round(area.width * (s.width ? 1 : 0.85)));
  const height = Math.min(s.height || 720, Math.round(area.height * (s.height ? 1 : 0.85)));
  const state = { width, height, maximized: !!s.maximized };
  if (onScreen) {
    // Keep it fully on the screen.
    state.x = Math.min(Math.max(s.x, area.x), area.x + area.width - width);
    state.y = Math.min(Math.max(s.y, area.y), area.y + area.height - height);
  }
  // No position → Electron centres the window.
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
  if (settingsView) settingsView.setBackgroundColor((t.colors && t.colors.primary) || BG);
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
function navigate(direction, contents) {
  if (!view) return;
  const now = Date.now();
  if (now - lastNavAt < 350) return;   // side buttons can arrive twice (mouse event + app-command)
  lastNavAt = now;
  const h = (contents || wc()).navigationHistory;
  if (direction < 0 && h.canGoBack()) h.goBack();
  if (direction > 0 && h.canGoForward()) h.goForward();
}

// ---- view actions (used by the menu and the keyboard shortcuts) -----------
// ---- language of the desktop parts (menus, tray, dialogs, panel…) -----------
// Follows the language you use in Audiobookshelf (read from the web app), or the
// one picked in View → Language. Before you've signed in: Windows' language.
const uiLang = () => pickLang(config.langChoice && config.langChoice !== "auto"
  ? config.langChoice
  : (config.webLang || app.getLocale()));
const tr = (key, vars) => translator(uiLang())(key, vars);

// Tell every page (title bar, connect screen, the web app's extras) the new words.
function onLangChanged() {
  const s = stringsFor(uiLang());
  for (const c of webContents.getAllWebContents()) if (!c.isDestroyed()) c.send("desktop:strings", s);
  updateTrayTooltip();
  sendUpdateToTitleBar();
}
function setLangChoice(choice) {
  config = { ...config, langChoice: choice };
  writeJson(dataFile("config.json"), config);
  onLangChanged();
}
// Ask the web app which language it's showing (it can change on the Account page).
async function readWebLang(contents) {
  if (!contents || contents.isDestroyed() || !isServerUrl(contents.getURL())) return;
  try {
    const code = await contents.executeJavaScript(
      "(window.$nuxt && $nuxt.$languageCodes && $nuxt.$languageCodes.current) || ''");
    if (!code || code === config.webLang) return;
    const before = uiLang();
    config = { ...config, webLang: code };
    writeJson(dataFile("config.json"), config);
    if (uiLang() !== before) onLangChanged();
  } catch {}
}

// ---- text size (zoom of the web app), remembered between starts ------------
const TEXT_SIZES = [["small", 0.9], ["normal", 1], ["large", 1.15], ["larger", 1.3], ["largest", 1.5]];
const textSize = () => (Number(config.textSize) > 0 ? Number(config.textSize) : 1);
function applyTextSize(contents) {
  if (!contents.isDestroyed() && isServerUrl(contents.getURL())) contents.setZoomFactor(textSize());
}
function setTextSize(f) {
  f = Math.round(Math.max(0.7, Math.min(2, f)) * 100) / 100;
  config = { ...config, textSize: f };
  writeJson(dataFile("config.json"), config);
  for (const c of webContents.getAllWebContents()) applyTextSize(c);
}
// Ctrl +/-/0 and Ctrl+mouse wheel: 10% steps.
function zoom(step) {
  setTextSize(step === 0 ? 1 : textSize() + step * 0.1);
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
  return s.sleepType === "chapter" ? tr("tray.sleepChapter") : tr("tray.sleepIn", { n: Math.max(1, Math.ceil(s.sleepLeft / 60)) });
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
      { label: s.playing ? tr("tray.pause") : tr("tray.play"), click: () => playerCommand("toggle") },
      { label: tr("tray.back"), click: () => playerCommand("back") },
      { label: tr("tray.forward"), click: () => playerCommand("forward") },
      { label: tr("tray.prevChapter"), click: () => playerCommand("prevChapter") },
      { label: tr("tray.nextChapter"), click: () => playerCommand("nextChapter") },
      { type: "separator" },
      {
        label: s.sleep ? tr("tray.sleepWith", { when: sleepLabel(s) }) : tr("tray.sleep"),
        submenu: [
          ...[15, 30, 45, 60, 90].map((min) => ({ label: tr("tray.minutes", { n: min }), click: () => sleepCommand(min) })),
          { type: "separator" },
          { label: tr("tray.endOfChapter"), enabled: s.hasChapters, click: () => sleepCommand("chapter") },
          { type: "separator" },
          { label: tr("tray.cancelSleep"), enabled: s.sleep, click: () => sleepCommand("cancel") },
        ],
      },
      { type: "separator" },
    );
  } else {
    items.push({ label: tr("tray.nothingPlaying"), enabled: false }, { type: "separator" });
  }
  items.push(
    { label: tr("tray.show"), click: showWindow },
    { type: "separator" },
    { label: tr("tray.quit"), click: () => app.quit() },
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
  if (settingsView) settingsView.setBounds(settingsBounds());
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
        title: tr("tray.stillRunning"),
        content: tr("tray.stillRunningMsg"),
      });
      config = { ...config, trayHintShown: true };
      writeJson(dataFile("config.json"), config);
    }
  });
  win.on("focus", () => {
    win.webContents.send("titlebar:focus", true);
    if (view) { wc().focus(); readWebLang(wc()); }
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

  guardLinks(contents);

  // Settings pages open in their own window, so this page (and the player) stay put.
  // (Clicks on settings links are caught in preload.js; this catches the rest.)
  contents.on("did-navigate-in-page", (_e, url, isMainFrame) => {
    if (!isMainFrame || !isSettingsUrl(url)) return;
    openSettings(url);
    if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
    else routeMain("/");
  });

  // Server unreachable → friendly page with Retry / Change server.
  contents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || String(url).startsWith("file:")) return; // -3 = aborted (normal)
    showConnectPage("error", `${desc} (${code})`);
  });

  // After connecting/retrying, forget the local page so Back doesn't return to it.
  contents.on("did-finish-load", () => {
    setTimeout(() => readWebLang(contents), 2500);   // once the web app has loaded its language
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
  contents.on("did-navigate-in-page", (_e, url, isMainFrame) => {
    if (!isMainFrame) return;
    onServerPage(url);
    readWebLang(contents);   // e.g. you just changed the language on the Account page
  });

  if (!app.isPackaged) contents.on("did-navigate", (_e, url) => console.log("[nav]", url));

  if (config.webUrl) loadServer(); else showConnectPage("setup");
}

// Your server stays in the app; links to other sites open in your browser.
// Exception: single sign-on (OpenID). Your server redirects to its login provider
// (Authentik, Keycloak, Authelia…); that login runs in the app until it sends you back.
function guardLinks(contents) {
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
}

// ---- settings overlay ------------------------------------------------------
// The web app's settings (everything under /config: server settings, libraries,
// users, stats…) and the Upload page open in a panel over the app, inside the
// same window, instead of replacing the page you're on. The app behind is dimmed;
// close with ✕, Esc or a click on the dimmed area.
let settingsView = null;

// The web app's path for a page, e.g. "/config/libraries" (without the /audiobookshelf base).
function appPath(url) {
  try {
    const root = new URL(config.webUrl).pathname.replace(/\/+$/, "");
    const u = new URL(url);
    const p = u.pathname.startsWith(root + "/") || u.pathname === root ? u.pathname.slice(root.length) : u.pathname;
    return (p || "/") + u.search;
  } catch { return "/"; }
}
const isSettingsUrl = (url) => isServerUrl(url) && /^\/(config|upload|account)(\/|$|\?)/.test(appPath(url));

// Show a page of the web app in the main window, without reloading it.
function routeMain(p) {
  if (!view) return;
  wc().executeJavaScript(`window.$nuxt && $nuxt.$router.push(${JSON.stringify(p)}).catch(() => {})`).catch(() => {});
}

// The panel: centred over the app with a margin all round (it follows the window size).
function settingsBounds() {
  const { width, height } = win.getContentBounds();
  const top = win.isFullScreen() ? 0 : TITLE_H;
  const areaH = Math.max(0, height - top);
  const w = Math.min(1280, Math.max(320, width - 2 * Math.max(24, Math.round(width * 0.04))));
  const h = Math.max(240, areaH - 2 * Math.max(20, Math.round(areaH * 0.04)));
  return { x: Math.round((width - w) / 2), y: top + Math.round((areaH - h) / 2), width: w, height: h };
}

// Inside the panel: the web app's top bar and side menu are hidden; our header
// (title + ✕, added by preload.js) sits on top; a thin frame outlines the panel.
const SETTINGS_BAR_H = 44;
const SETTINGS_CSS = `
  div:has(> #appbar) { height: ${SETTINGS_BAR_H}px !important; visibility: hidden !important; }
  #page-wrapper { height: calc(100% - ${SETTINGS_BAR_H}px) !important; }
  #page-wrapper .fixed.top-16 { top: ${SETTINGS_BAR_H}px !important; }
  div:has(> #siderail-buttons-container) { display: none !important; }
  #app-content.has-siderail { width: 100% !important; max-width: 100% !important; margin-left: 0 !important; left: 0 !important; }
  html::after { content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 2147483001;
    border: 1px solid rgba(255, 255, 255, .22); }
  /* Settings menu: the open page gets the same marker as the app's side menu. */
  #page-wrapper .fixed.top-16 a > div.absolute.left-0 { display: none !important; }
  #page-wrapper .fixed.top-16 a[aria-current="page"] { background: rgba(255, 255, 255, .09) !important; }
  #page-wrapper .fixed.top-16 a[aria-current="page"] > div.absolute.left-0 {
    display: block !important; width: 5px !important; background: var(--tb-logo, #f0a848) !important; border-radius: 0 4px 4px 0; }
  #page-wrapper .fixed.top-16 a[aria-current="page"] p {
    font-weight: 600; text-decoration: underline; text-decoration-color: var(--tb-logo, #f0a848);
    text-decoration-thickness: 2px; text-underline-offset: 5px; }
`;

function openSettings(url) {
  if (!win || !view) return;
  if (settingsView) {
    // Already open: go to the asked-for page.
    settingsView.webContents.executeJavaScript(
      `window.$nuxt && $nuxt.$router.push(${JSON.stringify(appPath(url))}).catch(() => {})`).catch(() => {});
    settingsView.webContents.focus();
    return;
  }
  const t = currentTheme();
  settingsView = new WebContentsView({
    // backgroundThrottling off like the app's own view, so it always draws at once.
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  settingsView.setBackgroundColor((t.colors && t.colors.primary) || BG);
  win.contentView.addChildView(settingsView);   // on top of the app
  settingsView.setBounds(settingsBounds());
  const sc = settingsView.webContents;
  guardLinks(sc);
  sc.on("before-input-event", onShortcut);
  sc.on("dom-ready", () => sc.insertCSS(SETTINGS_CSS).catch(() => {}));
  // Leaving settings (e.g. a link to a book or the home page) → show that in the app.
  // (The login page is part of opening settings: the web app passes through it to
  // check your sign-in, then continues to the settings page.)
  const leave = (u) => {
    if (!isServerUrl(u) || isSettingsUrl(u)) return;
    const p = appPath(u);
    if (/^\/login(\/|$|\?)/.test(p)) {
      if (/[?&]redirect=/.test(p)) return;   // just checking your sign-in on the way in
      closeSettings();                        // you signed out (Account → Logout)
      if (view) wc().reload();
      return;
    }
    routeMain(p);
    closeSettings();
  };
  sc.on("did-navigate-in-page", (_e, u, isMainFrame) => { if (isMainFrame) leave(u); });
  sc.on("did-navigate", (_e, u) => leave(u));
  sc.loadURL(url);
  sc.focus();
  wc().send("desktop:overlay", true);   // dim the app behind (preload.js)
}

function closeSettings() {
  if (!settingsView) return;
  const v = settingsView;
  settingsView = null;
  if (win && !win.isDestroyed()) win.contentView.removeChildView(v);
  try { v.webContents.close(); } catch {}
  if (view) {
    wc().send("desktop:overlay", false);
    wc().focus();
    // A language picked on the Account page shows up in the app right away.
    wc().executeJavaScript("window.$nuxt && localStorage.getItem('lang') && $nuxt.$setLanguageCode(localStorage.getItem('lang'))")
      .catch(() => {}).finally(() => setTimeout(() => readWebLang(wc()), 500));
  }
}

// ---- menu (opened from the title bar) --------------------------------------
const REPO_URL = "https://github.com/Farathim89/abs-da";

// ---- update check -----------------------------------------------------------
// Asks GitHub for the newest ABS-DA release (nothing personal is sent, nothing is
// installed). If it's newer: an "Update x.y.z" pill in the title bar, a one-time
// Windows notification, and Help → Download update. Automatic checks can be
// turned off (App → Check for updates automatically); Help → Check for Updates…
// always works.
const RELEASES_API = "https://api.github.com/repos/Farathim89/abs-da/releases/latest";
let latestRelease = null;   // { version, url } when GitHub has a newer version
const autoUpdateCheck = () => config.updateCheck !== false;

// "2.10.0" vs "2.9.1" → true when a is newer than b.
function isNewer(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

function sendUpdateToTitleBar() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("titlebar:update", latestRelease
    ? { label: tr("update.pill", { version: latestRelease.version }),
        tip: tr("update.newMsg", { version: latestRelease.version, current: app.getVersion() }) }
    : null);
}

function openUpdatePage() {
  openExternal(latestRelease ? latestRelease.url : `${REPO_URL}/releases/latest`);
}

async function showUpdateDialog() {
  const { response } = await dialog.showMessageBox(win, {
    type: "info",
    title: tr("update.newTitle"),
    message: tr("update.newTitle"),
    detail: tr("update.newMsg", { version: latestRelease.version, current: app.getVersion() }),
    buttons: [tr("update.download"), tr("update.later")],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) openUpdatePage();
}

// manual = from Help → Check for Updates… (then always say what was found).
async function checkForUpdates(manual) {
  try {
    const res = await net.fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rel = await res.json();
    const version = String(rel.tag_name || "").replace(/^v/i, "");
    if (version && isNewer(version, app.getVersion())) {
      latestRelease = { version, url: rel.html_url || `${REPO_URL}/releases/latest` };
      sendUpdateToTitleBar();
      if (manual) {
        showUpdateDialog();
      } else if (config.updateNotified !== version && Notification.isSupported()) {
        // Tell once per new version.
        config = { ...config, updateNotified: version };
        writeJson(dataFile("config.json"), config);
        const n = new Notification({
          title: tr("update.newTitle"),
          body: tr("update.newMsg", { version, current: app.getVersion() }),
          icon: ICON,
        });
        n.on("click", openUpdatePage);
        n.show();
      }
    } else {
      latestRelease = null;
      sendUpdateToTitleBar();
      if (manual) {
        dialog.showMessageBox(win, {
          type: "info", title: tr("update.upToDate"), message: tr("update.upToDate"),
          detail: tr("update.upToDateMsg", { version: app.getVersion() }), buttons: [tr("about.ok")],
        });
      }
    }
  } catch {
    if (manual) {
      dialog.showMessageBox(win, {
        type: "warning", title: tr("update.failed"), message: tr("update.failed"),
        detail: tr("update.failedMsg"), buttons: [tr("about.ok")],
      });
    }
  }
}

// Automatic checks: shortly after start, then twice a day.
function startUpdateChecks() {
  setTimeout(() => { if (autoUpdateCheck()) checkForUpdates(false); }, 10000);
  setInterval(() => { if (autoUpdateCheck()) checkForUpdates(false); }, 12 * 60 * 60 * 1000);
}

async function showAbout() {
  const { response } = await dialog.showMessageBox(win, {
    type: "info",
    title: tr("about.title"),
    message: `ABS Desktop App (ABS-DA) ${app.getVersion()}`,
    detail:
      `${tr("about.tagline")}\n${tr("about.license")}\n${tr("about.credit")}\n\n` +
      `${tr("about.server", { server: config.server || tr("about.notSet") })}\nElectron ${process.versions.electron}`,
    buttons: [tr("about.ok"), tr("about.github")],
    defaultId: 0,
    cancelId: 0,
  });
  if (response === 1) openExternal(REPO_URL);
}

// Shortcuts are shown in the menu but handled by onShortcut, so they never fire twice.
const shortcut = (accelerator) => ({ accelerator, registerAccelerator: false });

// View → Theme: one tick-item per theme, "Windows contrast colours" set apart at the end.
// (Ticks, not radio buttons: Windows treats each separated group as its own radio
// group and would tick the first item of every group.)
function themeMenuItems() {
  const items = [];
  for (const [id, t] of Object.entries(THEMES)) {
    if (t.contrast) items.push({ type: "separator" });
    items.push({ label: tr("theme." + id), type: "checkbox", checked: themeId() === id, click: () => setTheme(id) });
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
    items.push({ label: tr("shelf." + id), type: "checkbox", checked: shelfArtId() === id, click: () => setShelfArt(id) });
  }
  return items;
}

// View → Language: follow Audiobookshelf, or pick one.
function languageMenuItems() {
  const choice = config.langChoice || "auto";
  return [
    { label: tr("view.langAuto"), type: "checkbox", checked: choice === "auto", click: () => setLangChoice("auto") },
    { type: "separator" },
    ...LANGUAGES.map((code) => ({
      label: translator(code)("lang.name"), type: "checkbox", checked: choice === code, click: () => setLangChoice(code),
    })),
  ];
}

// Built fresh each time it opens, so the ticks (and the language) are always current.
// The order of the top-level menus must match the buttons in titlebar.html.
function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: tr("menu.app"),
      submenu: [
        { label: tr("app.home"), ...shortcut("Alt+Home"), click: goHome },
        { label: tr("app.changeServer"), click: () => showConnectPage("change") },
        {
          label: tr("app.forgetLogin"),
          click: () => {
            forgetLogin();
            dialog.showMessageBox(win, { type: "info", title: tr("app.forgotTitle"), message: tr("app.forgotMsg"), buttons: [tr("about.ok")] });
          },
        },
        {
          label: tr("app.keepInTray"),
          type: "checkbox",
          checked: closeToTray(),
          click: (item) => {
            config = { ...config, closeToTray: item.checked };
            writeJson(dataFile("config.json"), config);
          },
        },
        {
          label: app.isPackaged ? tr("app.startWithWindows") : tr("app.startWithWindowsDev"),
          type: "checkbox",
          enabled: app.isPackaged,
          checked: startsWithWindows(),
          click: (item) => setStartWithWindows(item.checked),
        },
        {
          label: tr("update.auto"),
          type: "checkbox",
          checked: autoUpdateCheck(),
          click: (item) => {
            config = { ...config, updateCheck: item.checked };
            writeJson(dataFile("config.json"), config);
            if (item.checked) checkForUpdates(false);
          },
        },
        { type: "separator" },
        { label: tr("app.reload"), ...shortcut("F5"), click: () => wc().reload() },
        { type: "separator" },
        { label: tr("app.exit"), click: () => app.quit() },
      ],
    },
    {
      label: tr("menu.edit"),
      submenu: [
        { label: tr("edit.undo"), ...shortcut("Ctrl+Z"), click: () => wc().undo() },
        { label: tr("edit.redo"), ...shortcut("Ctrl+Y"), click: () => wc().redo() },
        { type: "separator" },
        { label: tr("edit.cut"), ...shortcut("Ctrl+X"), click: () => wc().cut() },
        { label: tr("edit.copy"), ...shortcut("Ctrl+C"), click: () => wc().copy() },
        { label: tr("edit.paste"), ...shortcut("Ctrl+V"), click: () => wc().paste() },
        { label: tr("edit.selectAll"), ...shortcut("Ctrl+A"), click: () => wc().selectAll() },
      ],
    },
    {
      label: tr("menu.view"),
      submenu: [
        { label: tr("view.bigger"), ...shortcut("Ctrl+="), click: () => zoom(1) },
        { label: tr("view.smaller"), ...shortcut("Ctrl+-"), click: () => zoom(-1) },
        { label: tr("view.normalSize"), ...shortcut("Ctrl+0"), click: () => zoom(0) },
        { type: "separator" },
        {
          label: tr("view.textSize"),
          submenu: TEXT_SIZES.map(([name, f]) => ({
            label: `${tr("size." + name)} (${Math.round(f * 100)}%)`, type: "checkbox",
            checked: Math.abs(textSize() - f) < 0.001, click: () => setTextSize(f),
          })),
        },
        { label: tr("view.theme"), submenu: themeMenuItems() },
        { label: tr("view.bookshelf"), submenu: shelfMenuItems() },
        { label: tr("view.language"), submenu: languageMenuItems() },
        { type: "separator" },
        { label: tr("view.fullScreen"), ...shortcut("F11"), click: toggleFullScreen },
      ],
    },
    {
      label: tr("menu.navigate"),
      submenu: [
        { label: tr("nav.back"), ...shortcut("Alt+Left"), click: () => navigate(-1) },
        { label: tr("nav.forward"), ...shortcut("Alt+Right"), click: () => navigate(1) },
      ],
    },
    {
      label: tr("menu.help"),
      submenu: [
        { label: tr("help.openInBrowser"), click: () => openExternal(wc().getURL()) },
        { label: tr("help.docs"), click: () => openExternal("https://www.audiobookshelf.org/docs") },
        { type: "separator" },
        { label: tr("help.report"), click: () => openExternal(`${REPO_URL}/issues/new/choose`) },
        { label: tr("help.github"), click: () => openExternal(REPO_URL) },
        { label: tr("update.check"), click: () => checkForUpdates(true) },
        { type: "separator" },
        { label: tr("help.devTools"), ...shortcut("Ctrl+Shift+I"), click: toggleDevTools },
        { type: "separator" },
        { label: tr("help.about"), click: showAbout },
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
  if (!fromLocalPage(e)) return { ok: false, error: tr("connect.err.notAllowed") };
  const base = normalizeServer(input);
  if (!base) return { ok: false, error: tr("connect.err.badAddress") };
  const res = await probeServer(base);
  if (!res.ok) return { ok: false, error: tr("connect.err." + res.code) };
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
// (In the settings overlay the side buttons move through the settings pages.)
ipcMain.on("desktop:nav", (e, direction) =>
  navigate(direction === -1 ? -1 : 1, settingsView && e.sender === settingsView.webContents ? e.sender : null));

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

// The desktop texts in the current language (title bar, connect screen, the web app's extras).
ipcMain.handle("desktop:strings", (e) => (fromLocalPage(e) || fromServerPage(e) ? stringsFor(uiLang()) : null));

// Which window a server page is in: "main" (the app) or "settings".
ipcMain.handle("desktop:window-kind", (e) => {
  if (!fromServerPage(e)) return null;
  return view && e.sender === wc() ? "main" : "settings";
});

// ✕ / Esc in the settings overlay, or a click on the dimmed app behind it.
ipcMain.on("desktop:close-settings", (e) => { if (fromServerPage(e)) closeSettings(); });

// The "Update x.y.z" pill in the title bar.
ipcMain.on("desktop:open-update", (e) => { if (fromLocalPage(e)) openUpdatePage(); });

// A settings link was clicked in the main window.
ipcMain.on("desktop:open-settings", (e, url) => {
  if (fromServerPage(e) && view && e.sender === wc() && isSettingsUrl(String(url))) openSettings(String(url));
});

// ---- the paintbrush "Looks" panel in the web app's top bar ------------------
// Everything it needs to draw small previews of each theme and bookshelf.
const ABS_PLANK = "linear-gradient(180deg, #95775a 0%, #674625 17%, #674625 88%, #473019 100%)";
function looksState() {
  const t = currentTheme();
  const themes = Object.entries(THEMES).map(([id, th]) => {
    const c = th.colors || {};
    return {
      id, label: tr("theme." + id), contrast: !!th.contrast,
      title: th.title.bg, page: c.primary || BG, panel: c.bg || "#373838",
      accent: th.title.logo, plank: th.shelf || ABS_PLANK,
    };
  });
  const shelves = Object.entries(SHELF_ARTS).map(([id, a]) => {
    let image = null;
    if (a.svg) image = artUrl(a);
    else if (id !== "none" && woodTexture) image = t.tint ? `linear-gradient(${t.tint}, ${t.tint}), ${woodTexture}` : woodTexture;
    return { id, label: tr("shelf." + id), group: tr("group." + a.group), image, plank: a.plank || t.shelf || ABS_PLANK };
  });
  const sizes = TEXT_SIZES.map(([name, f]) => ({ id: String(f), label: tr("size." + name), percent: Math.round(f * 100) }));
  return { theme: themeId(), shelf: shelfArtId(), textSize: String(textSize()), sizes, themes, shelves };
}
ipcMain.handle("desktop:get-looks", (e) => (fromServerPage(e) ? looksState() : null));
ipcMain.handle("desktop:set-look", (e, { kind, id } = {}) => {
  if (!fromServerPage(e)) return null;
  if (kind === "theme" && THEMES[id]) setTheme(id);
  if (kind === "shelf" && SHELF_ARTS[id]) setShelfArt(id);
  if (kind === "text" && TEXT_SIZES.some(([, f]) => String(f) === id)) setTextSize(Number(id));
  return looksState();
});

// ---- app lifecycle ---------------------------------------------------------
// Every page (title bar, web app, pop-ups, connect screen) gets our styles as soon as it's ready.
app.on("web-contents-created", (_e, contents) => {
  contents.on("dom-ready", () => { applyPageCss(contents, true); applyTextSize(contents); });
  contents.on("zoom-changed", (_ev, dir) => { if (isServerUrl(contents.getURL())) zoom(dir === "in" ? 1 : -1); });
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
  startUpdateChecks();
});

app.on("window-all-closed", () => app.quit());
