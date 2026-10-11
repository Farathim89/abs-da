// SPDX-License-Identifier: GPL-3.0-or-later
// Offline library + player: the books you downloaded, playable without the server.
// Your listening is reported to the app (offline.js), which sends it to the server later.

const desktop = window.absDesktop;
const $ = (id) => document.getElementById(id);
const audio = $("audio");
let S = {};
const T = (key, fallback, vars) => {
  let v = S[key] || fallback;
  if (vars) for (const [k, x] of Object.entries(vars)) v = v.split(`{${k}}`).join(String(x));
  return v;
};
const fmt = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
};
const ICON_PLAY = "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M8 5v14l11-7z\"/></svg>";
const ICON_PAUSE = "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M6 19h4V5H6v14zm8-14v14h4V5h-4z\"/></svg>";
const sizeText = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(1) + " GB" : Math.max(1, Math.round((b || 0) / 1048576)) + " MB");

// ---- texts ---------------------------------------------------------------------
function applyTexts() {
  $("title").textContent = T("offline.title", "Offline library");
  document.title = T("offline.title", "Offline library");
  $("back").textContent = T("offline.back", "Back to the server");
  $("lChapters").textContent = T("offline.chapters", "Chapters");
  $("lQueue").textContent = T("offline.queueTitle", "Downloading");
  drawQueue();
  $("lSpeed").textContent = T("offline.speed", "Speed");
  $("lSleep").textContent = T("offline.sleep", "Sleep timer");
  $("empty").textContent = T("offline.empty", "No books are downloaded yet. Open a book and press the download button next to Play to keep it for listening without your server.");
  const sleep = $("sleep"), keep = sleep.value;
  sleep.textContent = "";
  for (const [v, label] of [["0", T("offline.sleepOff", "Off")], ["15", T("offline.minutes", "{n} min", { n: 15 })], ["30", T("offline.minutes", "{n} min", { n: 30 })],
    ["45", T("offline.minutes", "{n} min", { n: 45 })], ["60", T("offline.minutes", "{n} min", { n: 60 })], ["chapter", T("offline.sleepEnd", "End of chapter")]]) {
    const o = document.createElement("option"); o.value = v; o.textContent = label; sleep.append(o);
  }
  sleep.value = keep || "0";
  if (book) showPendingNote();
  // Opened at start because the server couldn't be reached (main.js).
  const fromStart = new URLSearchParams(location.search).get("from") === "start";
  $("startNote").classList.toggle("hidden", !fromStart);
  if (fromStart) $("startNote").textContent = T("offline.startNote", "Your server can't be reached right now, so here are your downloaded books. Press “Back to the server” to try again.");
}
desktop.getStrings().then((s) => { if (s) { S = s; applyTexts(); } });
desktop.onStrings((s) => { if (s) { S = s; applyTexts(); } });

const speed = $("speed");
for (const r of [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]) {
  const o = document.createElement("option"); o.value = String(r); o.textContent = r + "×"; speed.append(o);
}
speed.value = localStorage.getItem("offlineSpeed") || "1";

$("back").addEventListener("click", () => desktop.retry());

// ---- downloads on their way (with ✕ to cancel) ---------------------------------
let queueNow = [];
let hadQueue = false;
function drawQueue() {
  const ul = $("queueList");
  $("queue").classList.toggle("hidden", !queueNow.length || !$("player").classList.contains("hidden"));
  ul.textContent = "";
  for (const q of queueNow) {
    const li = document.createElement("li");
    const t = document.createElement("span"); t.className = "qt"; t.textContent = q.title || "…";
    const bar = document.createElement("div"); bar.className = "qbar";
    const fillEl = document.createElement("i"); fillEl.style.width = (q.state === "downloading" ? q.percent : 0) + "%"; bar.append(fillEl);
    const p = document.createElement("span"); p.className = "qp";
    p.textContent = q.state === "downloading" ? q.percent + "%" : T("offline.queued", "Waiting");
    const x = document.createElement("button"); x.type = "button"; x.textContent = "✕";
    x.title = T("offline.cancelDownload", "Cancel this download"); x.setAttribute("aria-label", x.title);
    x.addEventListener("click", () => desktop.offlineCancel(q.id));
    li.append(t, bar, p, x);
    ul.append(li);
  }
}
function setQueue(q) {
  const before = queueNow.length;
  queueNow = Array.isArray(q) ? q : [];
  drawQueue();
  // A download finished → show it in the list.
  if (hadQueue && queueNow.length < before && $("player").classList.contains("hidden")) showList();
  hadQueue = queueNow.length > 0;
}
desktop.offlineQueue().then(setQueue);
desktop.onOfflineFailed((text) => { $("startNote").textContent = text; $("startNote").classList.remove("hidden"); });
desktop.onOfflineQueue(setQueue);

// ---- the list ------------------------------------------------------------------
let books = [];
async function showList() {
  stopPlayer();
  $("player").classList.add("hidden");
  $("list").classList.remove("hidden");
  books = (await desktop.offlineList()) || [];
  const list = $("list");
  list.textContent = "";
  $("empty").classList.toggle("hidden", books.length > 0);
  for (const b of books) {
    const el = document.createElement("div");
    el.className = "book";
    const cv = document.createElement("div");
    cv.className = "cv";
    if (b.cover) { const img = document.createElement("img"); img.src = b.cover; img.alt = ""; cv.append(img); }
    else {   // no cover on the server: a title card, like the web app shows
      const nc = document.createElement("div"); nc.className = "nocover";
      const t = document.createElement("b"); t.textContent = b.title;
      const a = document.createElement("span"); a.textContent = b.author || "";
      nc.append(t, a); cv.append(nc);
    }
    if (b.duration > 0 && b.position > 0) {
      const bar = document.createElement("div"); bar.className = "bar";
      bar.style.width = Math.min(100, Math.round((b.position / b.duration) * 100)) + "%"; cv.append(bar);
    }
    const t = document.createElement("div"); t.className = "t"; t.textContent = b.title;
    const m = document.createElement("div"); m.className = "m";
    const a = document.createElement("span"); a.textContent = b.author || "";
    const rm = document.createElement("span"); rm.className = "rm"; rm.textContent = T("offline.remove", "Remove") + " (" + sizeText(b.size) + ")";
    rm.addEventListener("click", (e) => {
      e.stopPropagation();
      const msg = T("offline.removeConfirm", "Remove the offline copy of “{title}”? It frees {size}. The book stays on your server.", { title: b.title, size: sizeText(b.size) });
      desktop.offlineConfirm(msg, T("offline.remove", "Remove")).then((ok) => {
        if (!ok) return;
        desktop.offlineRemove(b.id);
        setTimeout(showList, 300);
      });
    });
    m.append(a, rm);
    el.append(cv, t, m);
    el.addEventListener("click", () => openBook(b.id));
    list.append(el);
  }
}

// ---- the player ----------------------------------------------------------------
let book = null;        // item from offline.js (tracks with file URLs, chapters…)
let trackIdx = 0;
let listened = 0, lastTick = 0, firstReport = true, sessionStart = null, saveTimer = null, sleepTimer = null;
const bookTime = () => (book ? (book.tracks[trackIdx].startOffset || 0) + (audio.currentTime || 0) : 0);
const chapterAt = (t) => (book && book.chapters.length ? book.chapters.find((c) => t >= c.start && t < c.end) || book.chapters[book.chapters.length - 1] : null);

async function openBook(id) {
  book = await desktop.offlineItem(id);
  if (!book) return showList();
  $("list").classList.add("hidden");
  $("empty").classList.add("hidden");
  $("player").classList.remove("hidden");
  $("pCover").src = book.cover || "";
  $("pTitle").textContent = book.title;
  $("pAuthor").textContent = [book.author, book.narrator && "· " + book.narrator].filter(Boolean).join(" ");
  const ol = $("chapters");
  ol.textContent = "";
  book.chapters.forEach((c, i) => {
    const li = document.createElement("li");
    li.dataset.i = i;
    const a = document.createElement("span"); a.textContent = c.title;
    const b = document.createElement("span"); b.textContent = fmt(c.start);
    li.append(a, b);
    li.addEventListener("click", () => { seekTo(c.start); play(); });
    ol.append(li);
  });
  firstReport = true;
  sessionStart = null;
  listened = 0;
  showPendingNote();
  seekTo(book.position || 0);
  setupMediaSession();
}
function stopPlayer() {
  if (book && !audio.paused) { audio.pause(); report(); }
  audio.removeAttribute("src");
  book = null;
}
$("toList").addEventListener("click", () => { if (book) report(); showList(); });

function loadTrack(i, at, autoplay) {
  trackIdx = i;
  const t = book.tracks[i];
  if (audio.dataset.url !== t.url) { audio.src = t.url; audio.dataset.url = t.url; }
  const go = () => { audio.currentTime = Math.max(0, at); audio.playbackRate = Number(speed.value) || 1; if (autoplay) audio.play().catch(() => {}); };
  if (audio.readyState >= 1) go(); else audio.addEventListener("loadedmetadata", go, { once: true });
}
function seekTo(t) {
  if (!book) return;
  t = Math.max(0, Math.min(t, book.duration || t));
  let i = book.tracks.findIndex((x) => t >= x.startOffset && t < x.startOffset + x.duration);
  if (i < 0) i = book.tracks.length - 1;
  loadTrack(i, t - book.tracks[i].startOffset, !audio.paused);
  updateUi(t);
}
function play() { if (book) audio.play().catch(() => {}); }
function pause() { audio.pause(); }

audio.addEventListener("ended", () => {
  if (book && trackIdx < book.tracks.length - 1) loadTrack(trackIdx + 1, 0, true);
  else { report(true); updateUi(book ? book.duration : 0); }   // the end of the book = finished
});
audio.addEventListener("play", () => { if (sessionStart == null) sessionStart = bookTime(); lastTick = performance.now(); $("play").innerHTML = ICON_PAUSE; clearInterval(saveTimer); saveTimer = setInterval(report, 10000); });
audio.addEventListener("pause", () => { $("play").innerHTML = ICON_PLAY; clearInterval(saveTimer); report(); });
audio.addEventListener("timeupdate", () => {
  if (!book) return;
  const now = performance.now();
  if (!audio.paused && lastTick) listened += Math.min(5, (now - lastTick) / 1000);
  lastTick = now;
  updateUi(bookTime());
  // Sleep timer "end of chapter": pause when the chapter changes.
  if (sleepChapter && chapterAt(bookTime()) !== sleepChapter) { sleepChapter = null; $("sleep").value = "0"; pause(); }
});

// Your listening → the app (every 10 seconds while playing, and on pause).
function report(finished) {
  if (!book) return;
  if (!audio.paused && lastTick) { listened += (performance.now() - lastTick) / 1000; lastTick = performance.now(); }
  desktop.offlineListening(book.id, { currentTime: bookTime(), listened: Math.round(listened), newSession: firstReport, startTime: sessionStart == null ? bookTime() : sessionStart, finished: finished === true });
  firstReport = false;
  listened = 0;
  showPendingNote();
}
window.addEventListener("beforeunload", () => report());
function showPendingNote() {
  $("pending").textContent = T("offline.pending", "Listening is saved here and goes to your server when you're back online.");
}

let lastChapter = null;
function updateUi(t) {
  if (!book) return;
  const d = book.duration || 1;
  $("seek").value = String(Math.round((t / d) * 1000));
  $("tNow").textContent = fmt(t);
  $("tLeft").textContent = T("offline.left", "{time} left", { time: fmt(d - t) });
  const ch = chapterAt(t);
  $("pChapter").textContent = ch ? ch.title : "";
  if (ch !== lastChapter) {
    lastChapter = ch;
    document.querySelectorAll("#chapters li").forEach((li) => li.classList.toggle("now", ch && Number(li.dataset.i) === book.chapters.indexOf(ch)));
  }
}

$("play").addEventListener("click", () => (audio.paused ? play() : pause()));
$("back30").addEventListener("click", () => seekTo(bookTime() - 30));
$("fwd30").addEventListener("click", () => seekTo(bookTime() + 30));
$("prevCh").addEventListener("click", () => {
  const t = bookTime(), ch = chapterAt(t);
  if (!ch) return seekTo(0);
  const i = book.chapters.indexOf(ch);
  seekTo(t - ch.start > 3 || i === 0 ? ch.start : book.chapters[i - 1].start);
});
$("nextCh").addEventListener("click", () => {
  const ch = chapterAt(bookTime());
  const i = ch ? book.chapters.indexOf(ch) : -1;
  if (i >= 0 && i < book.chapters.length - 1) seekTo(book.chapters[i + 1].start);
});
$("seek").addEventListener("input", (e) => { if (book) seekTo((Number(e.target.value) / 1000) * book.duration); });
speed.addEventListener("change", () => { audio.playbackRate = Number(speed.value) || 1; localStorage.setItem("offlineSpeed", speed.value); });

let sleepChapter = null;
$("sleep").addEventListener("change", (e) => {
  clearTimeout(sleepTimer);
  sleepChapter = null;
  const v = e.target.value;
  if (v === "chapter") sleepChapter = chapterAt(bookTime());
  else if (Number(v) > 0) sleepTimer = setTimeout(() => { pause(); $("sleep").value = "0"; }, Number(v) * 60000);
});

document.addEventListener("keydown", (e) => {
  if (!book || e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
  if (e.code === "Space") { e.preventDefault(); audio.paused ? play() : pause(); }
  if (e.key === "ArrowLeft") seekTo(bookTime() - 30);
  if (e.key === "ArrowRight") seekTo(bookTime() + 30);
});

// Media keys, headset buttons and the Windows media overlay.
function setupMediaSession() {
  if (!("mediaSession" in navigator) || !book) return;
  navigator.mediaSession.metadata = new window.MediaMetadata({ title: book.title, artist: book.author, album: book.series || "" });
  const h = { play, pause, seekbackward: () => seekTo(bookTime() - 30), seekforward: () => seekTo(bookTime() + 30),
    previoustrack: () => $("prevCh").click(), nexttrack: () => $("nextCh").click() };
  for (const [k, fn] of Object.entries(h)) { try { navigator.mediaSession.setActionHandler(k, fn); } catch {} }
}

showList();
