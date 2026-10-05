// SPDX-License-Identifier: GPL-3.0-or-later
// ---------------------------------------------------------------------------
// Translations for the desktop parts of the app: title-bar menus, tray menu,
// dialogs, the connect screen, "Remember me" and the paintbrush panel.
// (The Audiobookshelf web app itself is translated by Audiobookshelf.)
//
// The app uses the same language as your Audiobookshelf (or View → Language).
// To add a language: copy the `en` block, name it with the Audiobookshelf
// language code (e.g. "de", "fr", "pt-br"), and translate the values. Anything
// left out falls back to English. {name} placeholders are filled in by the app.
// ---------------------------------------------------------------------------

const STRINGS = {
  en: {
    "lang.name": "English",

    "menu.app": "App",
    "menu.edit": "Edit",
    "menu.view": "View",
    "menu.navigate": "Navigate",
    "menu.help": "Help",

    "app.home": "Home",
    "app.changeServer": "Change Server…",
    "app.forgetLogin": "Forget Saved Login",
    "app.forgotTitle": "Saved login",
    "app.forgotMsg": "Your saved login was removed.",
    "app.keepInTray": "Keep running in tray when closed",
    "app.startWithWindows": "Start with Windows (in the tray)",
    "app.startWithWindowsDev": "Start with Windows (installed app only)",
    "app.reload": "Reload",
    "app.exit": "Exit",

    "edit.undo": "Undo",
    "edit.redo": "Redo",
    "edit.cut": "Cut",
    "edit.copy": "Copy",
    "edit.paste": "Paste",
    "edit.selectAll": "Select All",

    "view.bigger": "Bigger",
    "view.smaller": "Smaller",
    "view.normalSize": "Normal Size",
    "view.textSize": "Text size",
    "view.theme": "Theme",
    "view.bookshelf": "Bookshelf",
    "view.language": "Language",
    "view.langAuto": "Same as Audiobookshelf",
    "view.fullScreen": "Full Screen",

    "nav.back": "Back",
    "nav.forward": "Forward",

    "help.openInBrowser": "Open in Browser",
    "help.docs": "Audiobookshelf Documentation",
    "help.report": "Report a Problem / Suggest an Idea",
    "help.github": "ABS-DA on GitHub",
    "help.devTools": "Toggle Developer Tools",
    "help.about": "About ABS Desktop App",

    "about.title": "About",
    "about.tagline": "An unofficial Windows desktop app for Audiobookshelf.",
    "about.license": "Free software under the GNU GPL v3 — made by Farathim as a gift to the community.",
    "about.credit": "Audiobookshelf is made by advplyr and contributors.",
    "about.server": "Server: {server}",
    "about.notSet": "not set",
    "about.ok": "OK",
    "about.github": "GitHub page",

    "tray.nothingPlaying": "Nothing playing",
    "tray.play": "Play",
    "tray.pause": "Pause",
    "tray.back": "Jump back",
    "tray.forward": "Jump forward",
    "tray.prevChapter": "Previous chapter",
    "tray.nextChapter": "Next chapter",
    "tray.sleep": "Sleep timer",
    "tray.sleepWith": "Sleep timer — {when}",
    "tray.minutes": "{n} minutes",
    "tray.endOfChapter": "End of chapter",
    "tray.cancelSleep": "Cancel sleep timer",
    "tray.sleepChapter": "Sleep at end of chapter",
    "tray.sleepIn": "Sleep in {n} min",
    "tray.show": "Show ABS Desktop App",
    "tray.quit": "Quit",
    "tray.stillRunning": "Still running",
    "tray.stillRunningMsg": "ABS Desktop App keeps playing in the tray. Right-click the tray icon to quit.",

    "win.settings": "Settings",
    "win.upload": "Upload",
    "win.close": "Close",

    "connect.titleSetup": "Connect to your server",
    "connect.titleChange": "Change server",
    "connect.titleError": "Can't reach your server",
    "connect.subtitle": "Enter the address of your Audiobookshelf server.",
    "connect.label": "Server address",
    "connect.placeholder": "http://your-server:13378",
    "connect.connect": "Connect",
    "connect.cancel": "Cancel",
    "connect.retry": "Retry",
    "connect.change": "Change server",
    "connect.empty": "Please enter your server address.",
    "connect.connecting": "Connecting…",
    "connect.failed": "Couldn't connect.",
    "connect.retrying": "Retrying…",
    "connect.goingBack": "Going back…",
    "connect.err.unreachable": "Couldn't reach that address. Check the server is running and the address and port are right.",
    "connect.err.notAbs": "That address answered, but it isn't an Audiobookshelf server. Wrong port? Audiobookshelf's default is 13378.",
    "connect.err.badAddress": "That doesn't look like a server address.",
    "connect.err.notAllowed": "Not allowed.",

    "login.remember": "Remember me",
    "login.server": "Server:",
    "login.change": "Change",

    "looks.tip": "Theme & bookshelf",
    "looks.textSize": "Text size",
    "looks.theme": "Theme",
    "looks.bookshelf": "Bookshelf",

    "size.small": "Small",
    "size.normal": "Normal",
    "size.large": "Large",
    "size.larger": "Larger",
    "size.largest": "Largest",

    "theme.abs": "Audiobookshelf",
    "theme.midnight": "Midnight",
    "theme.oled": "OLED Black",
    "theme.forest": "Forest",
    "theme.mocha": "Mocha",
    "theme.amethyst": "Amethyst",
    "theme.highcontrast": "High contrast",
    "theme.contrast": "Windows contrast colours",

    "group.wood": "Wood",
    "group.stone": "Stone",
    "group.material": "Materials",
    "group.scene": "Scenes",
    "group.none": "Plain",

    "shelf.classic": "Classic wood",
    "shelf.oak": "Light oak",
    "shelf.walnut": "Dark walnut",
    "shelf.cherry": "Cherry wood",
    "shelf.bamboo": "Bamboo",
    "shelf.marble": "Marble",
    "shelf.slate": "Slate",
    "shelf.concrete": "Concrete",
    "shelf.brick": "Brick",
    "shelf.leather": "Leather",
    "shelf.linen": "Linen",
    "shelf.parchment": "Parchment",
    "shelf.metal": "Brushed metal",
    "shelf.carbon": "Carbon fibre",
    "shelf.stars": "Starry night",
    "shelf.aurora": "Aurora",
    "shelf.ocean": "Ocean",
    "shelf.none": "None (flat)",
  },

  sv: {
    "lang.name": "Svenska",

    "menu.app": "App",
    "menu.edit": "Redigera",
    "menu.view": "Visa",
    "menu.navigate": "Navigera",
    "menu.help": "Hjälp",

    "app.home": "Hem",
    "app.changeServer": "Byt server…",
    "app.forgetLogin": "Glöm sparad inloggning",
    "app.forgotTitle": "Sparad inloggning",
    "app.forgotMsg": "Din sparade inloggning har tagits bort.",
    "app.keepInTray": "Fortsätt köra i systemfältet när fönstret stängs",
    "app.startWithWindows": "Starta med Windows (i systemfältet)",
    "app.startWithWindowsDev": "Starta med Windows (endast installerad app)",
    "app.reload": "Ladda om",
    "app.exit": "Avsluta",

    "edit.undo": "Ångra",
    "edit.redo": "Gör om",
    "edit.cut": "Klipp ut",
    "edit.copy": "Kopiera",
    "edit.paste": "Klistra in",
    "edit.selectAll": "Markera allt",

    "view.bigger": "Större",
    "view.smaller": "Mindre",
    "view.normalSize": "Normal storlek",
    "view.textSize": "Textstorlek",
    "view.theme": "Tema",
    "view.bookshelf": "Bokhylla",
    "view.language": "Språk",
    "view.langAuto": "Samma som Audiobookshelf",
    "view.fullScreen": "Helskärm",

    "nav.back": "Bakåt",
    "nav.forward": "Framåt",

    "help.openInBrowser": "Öppna i webbläsaren",
    "help.docs": "Audiobookshelf-dokumentation",
    "help.report": "Rapportera ett problem / Föreslå en idé",
    "help.github": "ABS-DA på GitHub",
    "help.devTools": "Utvecklarverktyg",
    "help.about": "Om ABS Desktop App",

    "about.title": "Om",
    "about.tagline": "En inofficiell Windows-app för Audiobookshelf.",
    "about.license": "Fri programvara under GNU GPL v3 – gjord av Farathim som en gåva till communityn.",
    "about.credit": "Audiobookshelf är gjort av advplyr och bidragsgivare.",
    "about.server": "Server: {server}",
    "about.notSet": "inte angiven",
    "about.ok": "OK",
    "about.github": "GitHub-sida",

    "tray.nothingPlaying": "Inget spelas",
    "tray.play": "Spela",
    "tray.pause": "Pausa",
    "tray.back": "Hoppa bakåt",
    "tray.forward": "Hoppa framåt",
    "tray.prevChapter": "Föregående kapitel",
    "tray.nextChapter": "Nästa kapitel",
    "tray.sleep": "Insomningstimer",
    "tray.sleepWith": "Insomningstimer – {when}",
    "tray.minutes": "{n} minuter",
    "tray.endOfChapter": "Vid kapitlets slut",
    "tray.cancelSleep": "Avbryt insomningstimer",
    "tray.sleepChapter": "Stängs av vid kapitlets slut",
    "tray.sleepIn": "Stängs av om {n} min",
    "tray.show": "Visa ABS Desktop App",
    "tray.quit": "Avsluta",
    "tray.stillRunning": "Körs fortfarande",
    "tray.stillRunningMsg": "ABS Desktop App fortsätter spela i systemfältet. Högerklicka på ikonen för att avsluta.",

    "win.settings": "Inställningar",
    "win.upload": "Ladda upp",
    "win.close": "Stäng",

    "connect.titleSetup": "Anslut till din server",
    "connect.titleChange": "Byt server",
    "connect.titleError": "Når inte din server",
    "connect.subtitle": "Ange adressen till din Audiobookshelf-server.",
    "connect.label": "Serveradress",
    "connect.placeholder": "http://din-server:13378",
    "connect.connect": "Anslut",
    "connect.cancel": "Avbryt",
    "connect.retry": "Försök igen",
    "connect.change": "Byt server",
    "connect.empty": "Ange din serveradress.",
    "connect.connecting": "Ansluter…",
    "connect.failed": "Kunde inte ansluta.",
    "connect.retrying": "Försöker igen…",
    "connect.goingBack": "Går tillbaka…",
    "connect.err.unreachable": "Kunde inte nå den adressen. Kontrollera att servern är igång och att adress och port stämmer.",
    "connect.err.notAbs": "Adressen svarade, men det är ingen Audiobookshelf-server. Fel port? Audiobookshelf använder 13378 som standard.",
    "connect.err.badAddress": "Det ser inte ut som en serveradress.",
    "connect.err.notAllowed": "Inte tillåtet.",

    "login.remember": "Kom ihåg mig",
    "login.server": "Server:",
    "login.change": "Byt",

    "looks.tip": "Tema och bokhylla",
    "looks.textSize": "Textstorlek",
    "looks.theme": "Tema",
    "looks.bookshelf": "Bokhylla",

    "size.small": "Liten",
    "size.normal": "Normal",
    "size.large": "Stor",
    "size.larger": "Större",
    "size.largest": "Störst",

    "theme.abs": "Audiobookshelf",
    "theme.midnight": "Midnatt",
    "theme.oled": "OLED-svart",
    "theme.forest": "Skog",
    "theme.mocha": "Mocka",
    "theme.amethyst": "Ametist",
    "theme.highcontrast": "Hög kontrast",
    "theme.contrast": "Windows kontrastfärger",

    "group.wood": "Trä",
    "group.stone": "Sten",
    "group.material": "Material",
    "group.scene": "Scener",
    "group.none": "Enkel",

    "shelf.classic": "Klassiskt trä",
    "shelf.oak": "Ljus ek",
    "shelf.walnut": "Mörk valnöt",
    "shelf.cherry": "Körsbärsträ",
    "shelf.bamboo": "Bambu",
    "shelf.marble": "Marmor",
    "shelf.slate": "Skiffer",
    "shelf.concrete": "Betong",
    "shelf.brick": "Tegel",
    "shelf.leather": "Läder",
    "shelf.linen": "Linne",
    "shelf.parchment": "Pergament",
    "shelf.metal": "Borstad metall",
    "shelf.carbon": "Kolfiber",
    "shelf.stars": "Stjärnnatt",
    "shelf.aurora": "Norrsken",
    "shelf.ocean": "Hav",
    "shelf.none": "Ingen (slät)",
  },
};

// "sv", "sv-SE", "en-us" … → a language we have ("en" if not).
function pickLang(code) {
  const c = String(code || "").toLowerCase();
  if (STRINGS[c]) return c;
  const base = c.split(/[-_]/)[0];
  return STRINGS[base] ? base : "en";
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

const LANGUAGES = Object.keys(STRINGS);

module.exports = { pickLang, stringsFor, translator, LANGUAGES };
