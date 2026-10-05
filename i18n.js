// SPDX-License-Identifier: GPL-3.0-or-later
// ---------------------------------------------------------------------------
// Translations for the desktop parts of the app: title-bar menus, tray menu,
// dialogs, the connect screen, "Remember me", the paintbrush panel and the
// settings overlay. (The Audiobookshelf web app itself is translated by
// Audiobookshelf.)
//
// One file per language in locales/, named with the Audiobookshelf language code
// (en, de, pt-br, zh-cn…). The app uses the same language as your Audiobookshelf,
// or the one picked in View → Language.
//
// To add or fix a language: copy locales/en.json, translate the values (keep the
// keys and any {placeholders}). Anything missing falls back to English.
// ---------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "locales");
const STRINGS = {};
for (const file of fs.readdirSync(DIR)) {
  if (!file.endsWith(".json")) continue;
  try { STRINGS[file.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")); } catch {}
}

// "sv", "sv-SE", "en-us", "pt-BR" … → a language we have ("en" if not).
function pickLang(code) {
  const c = String(code || "").toLowerCase().replace("_", "-");
  if (STRINGS[c]) return c;
  const base = c.split("-")[0];
  if (STRINGS[base]) return base;
  const sameBase = Object.keys(STRINGS).find((k) => k.split("-")[0] === base);   // e.g. "vi" → "vi-vn"
  return sameBase || "en";
}

// All strings for a language, with English filling any gaps.
const stringsFor = (lang) => ({ ...STRINGS.en, ...(STRINGS[lang] || {}) });

// tr("tray.minutes", { n: 15 }) → "15 minutes"
function translator(lang) {
  const s = stringsFor(lang);
  return (key, vars) => {
    let v = s[key] != null ? s[key] : key;
    if (vars) for (const [k, x] of Object.entries(vars)) v = v.split(`{${k}}`).join(String(x));
    return v;
  };
}

// Language codes, English first, then by their own name (for View → Language).
const LANGUAGES = Object.keys(STRINGS).sort((a, b) =>
  a === "en" ? -1 : b === "en" ? 1 : String(STRINGS[a]["lang.name"]).localeCompare(String(STRINGS[b]["lang.name"])));

module.exports = { pickLang, stringsFor, translator, LANGUAGES };
