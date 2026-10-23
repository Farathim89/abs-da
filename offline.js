// SPDX-License-Identifier: GPL-3.0-or-later
// Offline listening: download audiobooks to listen without the server, and send that
// listening back to the server when it's reachable again.
//
//  - Downloads go to <data folder>/offline/<libraryItemId>/: the audio tracks, the cover,
//    item.json (title, chapters, tracks…) and progress.json (where you are, and the
//    listening sessions that still have to reach the server). item.json is written last,
//    so a folder without it is an unfinished download.
//  - Listening offline is kept as Audiobookshelf "local sessions" — the same thing its
//    mobile apps use — and sent with POST /api/session/local-all. The server only moves
//    your position forward if that listening is newer than what it already has.

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { app, ipcMain, net } = require("electron");
const { pathToFileURL } = require("url");

module.exports = function setupOffline(ctx) {
  // ctx: { view(), wc(), config(), setConfig(patch), tr, isServerUrl, fromServerPage, fromLocalPage,
  //        apiBase(), getToken() → Promise<string|null>, toast(type, text), log }
  const root = () => path.join(app.getPath("userData"), "offline");
  // A library item id (letters, digits, - and _); anything else is refused, never cut down —
  // an empty name would be the offline folder itself.
  const validId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id);
  const folder = (id) => path.join(root(), validId(String(id)) ? String(id) : "_invalid_");
  const readJson = (f, d) => {
    try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (err) {
      // (cut short by a crash or power cut: the copy from the save before)
      if (err && err.code !== "ENOENT") { try { return JSON.parse(fs.readFileSync(f + ".bak", "utf8")); } catch {} }
      return d;
    }
  };
  const writeJson = (f, data) => {
    const tmp = f + ".tmp";
    const fd = fs.openSync(tmp, "w");
    try { fs.writeSync(fd, JSON.stringify(data, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    try { fs.copyFileSync(f, f + ".bak"); } catch {}
    fs.renameSync(tmp, f);
  };
  const meta = (id) => readJson(path.join(folder(id), "item.json"), null);
  const progressFile = (id) => path.join(folder(id), "progress.json");
  const progress = (id) => readJson(progressFile(id), { sessions: [] });

  const jobs = new Map();   // itemId → { percent, abort }
  const queue = [];
  const titles = new Map(); // itemId → title, for the download queue in the offline library

  function deviceInfo() {
    let id = ctx.config().offlineDeviceId;
    if (!id) { id = crypto.randomUUID(); ctx.setConfig({ offlineDeviceId: id }); }
    return { deviceId: id, clientName: "ABS-DA (offline)", clientVersion: app.getVersion(), manufacturer: "ABS Desktop App", model: "Windows" };
  }

  // ---- state for the download button ------------------------------------------
  function state(id) {
    if (!validId(id)) return { itemId: id, state: "none" };
    if (jobs.has(id)) return { itemId: id, state: "downloading", percent: jobs.get(id).percent };
    if (queue.includes(id)) return { itemId: id, state: "downloading", percent: 0 };
    const m = meta(id);
    return m ? { itemId: id, state: "done", size: m.size, title: m.title } : { itemId: id, state: "none" };
  }
  function emit(s) {
    const v = ctx.view();
    if (!v || v.webContents.isDestroyed()) return;
    v.webContents.send("desktop:offline-status", s);
    v.webContents.send("desktop:offline-queue", queueState());   // the offline library's "Downloading" list
  }
  // What is downloading now and what waits, in order.
  function queueState() {
    const now = [...jobs.entries()].map(([id, j]) => ({ id, title: titles.get(id) || "", percent: j.percent, state: "downloading" }));
    return now.concat(queue.map((id) => ({ id, title: titles.get(id) || "", percent: 0, state: "queued" })));
  }

  // ---- downloading -------------------------------------------------------------
  // The sign-in comes from the web app; the last one is kept (in memory only) so queued
  // downloads go on while you look at the offline library or another page.
  let lastToken = null;
  async function downloadToken() {
    const t = await ctx.getToken();
    if (t) lastToken = t;
    return t || lastToken;
  }
  async function api(pathname, token, opts = {}) {
    const res = await net.fetch(ctx.apiBase() + pathname, { ...opts, headers: { Authorization: "Bearer " + token, ...(opts.headers || {}) } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  }
  async function saveTo(res, file, onBytes, signal, kick = () => {}) {
    const out = fs.createWriteStream(file);
    let writeErr = null;
    const failed = new Promise((_, reject) => out.on("error", (err) => { writeErr = err; reject(err); }));
    failed.catch(() => {});
    const reader = res.body.getReader();
    try {
      for (;;) {
        if (signal.aborted) throw new Error("cancelled");
        const { done, value } = await reader.read();
        kick();
        if (writeErr) throw writeErr;
        if (done) break;
        const chunk = Buffer.from(value);
        if (!out.write(chunk)) await Promise.race([new Promise((r) => out.once("drain", r)), failed]);
        onBytes(chunk.length);
      }
    } finally {
      if (writeErr) out.destroy();
      else await Promise.race([new Promise((r) => out.end(r)), failed.catch(() => {})]);
    }
    if (writeErr) throw writeErr;
  }
  // One file, with up to 3 tries; a try that gets no data for 60 s is given up. Cancelling stops at once.
  async function fetchFile(url, file, onBytes, cancel) {
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (cancel.aborted) throw new Error("cancelled");
      const att = new AbortController();
      const stop = () => att.abort();
      cancel.addEventListener("abort", stop);
      let idle = null;
      const kick = () => { clearTimeout(idle); idle = setTimeout(stop, 60000); };
      let counted = 0;
      try {
        kick();
        const token = await downloadToken();
        if (!token) throw new Error(ctx.tr("offline.errSignIn"));
        const res = await api(url, token, { signal: att.signal });
        await saveTo(res, file, (n) => { counted += n; onBytes(n); }, att.signal, kick);
        return;
      } catch (err) {
        lastErr = err;
        onBytes(-counted);   // (that try's bytes don't count)
        if (cancel.aborted || /HTTP 4\d\d/.test(String(err && err.message))) break;   // (cancelled, or the server said no)
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      } finally {
        clearTimeout(idle);
        cancel.removeEventListener("abort", stop);
      }
    }
    throw lastErr || new Error("download failed");
  }

  async function download(id) {
    const ctl = new AbortController();
    const job = { percent: 0, abort: () => ctl.abort() };
    jobs.set(id, job);
    emit(state(id));
    const dir = folder(id);
    let title = "";
    try {
      const token = await downloadToken();
      if (!token) throw new Error(ctx.tr("offline.errSignIn"));
      const item = await (await api(`/api/items/${id}?expanded=1`, token)).json();
      title = item.media && item.media.metadata ? item.media.metadata.title : "";
      if (title) titles.set(id, title);
      const tracks = ((item.media && item.media.tracks) || []).slice().sort((a, b) => a.index - b.index);
      if (item.mediaType !== "book" || !tracks.length) throw new Error(ctx.tr("offline.errNoAudio"));
      fs.mkdirSync(dir, { recursive: true });
      try { fs.unlinkSync(path.join(dir, "item.json")); } catch {}
      const audioById = new Map((item.media.audioFiles || []).map((a) => [String(a.ino), a]));
      const total = tracks.reduce((s, t) => s + (((audioById.get(String(t.contentUrl).split("/").pop()) || {}).metadata || {}).size || 0), 0) || 1;
      let got = 0, lastPct = -1;
      const onBytes = (n) => {
        got += n;
        const pct = Math.min(99, Math.floor((got / total) * 100));
        if (pct !== lastPct) { lastPct = pct; job.percent = pct; emit(state(id)); }
      };
      const saved = [];
      for (const t of tracks) {
        const ino = String(t.contentUrl).split("/").pop();
        const a = audioById.get(ino) || {};
        const ext = ((a.metadata && a.metadata.ext) || path.extname(String(a.metadata && a.metadata.filename || "")) || ".mp3").replace(/[^.\w]/g, "");
        const file = `track-${String(t.index).padStart(3, "0")}${ext}`;
        const part = path.join(dir, file + ".part");
        await fetchFile(t.contentUrl, part, onBytes, ctl.signal);
        fs.renameSync(part, path.join(dir, file));
        saved.push({ file, startOffset: t.startOffset || 0, duration: t.duration || 0, mimeType: t.mimeType || a.mimeType || "" });
      }
      let cover = null;
      try {
        const res = await api(`/api/items/${id}/cover?raw=1`, token, { signal: ctl.signal });
        cover = /png/.test(res.headers.get("content-type") || "") ? "cover.png" : "cover.jpg";
        await saveTo(res, path.join(dir, cover), () => {}, ctl.signal);
      } catch { cover = null; }
      // Where you are on the server right now (so offline listening starts there).
      let serverProgress = null, userId = "";
      try { userId = ((await (await api("/api/me", token)).json()) || {}).id || ""; } catch {}
      try {
        const p = await (await api(`/api/me/progress/${id}`, token)).json();
        serverProgress = { currentTime: p.currentTime || 0, isFinished: !!p.isFinished, lastUpdate: p.lastUpdate || 0 };
      } catch {}
      const md = item.media.metadata || {};
      const size = saved.reduce((s, t) => s + (fs.statSync(path.join(dir, t.file)).size || 0), 0) + (cover ? fs.statSync(path.join(dir, cover)).size : 0);
      const pr = progress(id);
      pr.serverProgress = serverProgress;
      writeJson(progressFile(id), pr);
      writeJson(path.join(dir, "item.json"), {
        id: item.id, libraryId: item.libraryId, title: md.title || "", subtitle: md.subtitle || "",
        author: md.authorName || (md.authors || []).map((x) => x.name).join(", "), narrator: md.narratorName || (md.narrators || []).join(", "),
        series: md.seriesName || "", duration: item.media.duration || 0, chapters: item.media.chapters || [], tracks: saved, cover,
        server: ctx.config().server || "", userId, downloadedAt: Date.now(), size,
      });
      jobs.delete(id);
      emit(state(id));
      ctx.toast("success", ctx.tr("offline.done", { title }));
    } catch (err) {
      jobs.delete(id);
      const cancelled = ctl.signal.aborted;
      if (!meta(id)) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
      emit(state(id));
      if (!cancelled) {
        const text = ctx.tr("offline.failed", { title: title || titles.get(id) || "?", error: err.message });
        ctx.toast("error", text);
        const v = ctx.view();
        if (v && !v.webContents.isDestroyed()) v.webContents.send("desktop:offline-failed", text);   // the offline library shows it too
      }
    }
  }
  async function pump() {
    if (jobs.size || !queue.length) return;
    const id = queue.shift();
    await download(id);
    pump();
  }

  // Queue books to download (already downloaded or queued ones are skipped).
  function enqueue(items) {
    for (const it of items) {
      const id = String(typeof it === "object" ? it.id : it);
      if (!validId(id)) continue;
      if (typeof it === "object" && it.title) titles.set(id, String(it.title).slice(0, 300));
      if (jobs.has(id) || queue.includes(id) || meta(id)) continue;
      queue.push(id);
      emit(state(id));
    }
    pump();
  }

  function remove(id) {
    if (!validId(id)) return;
    const j = jobs.get(id);
    if (j) j.abort();
    const qi = queue.indexOf(id);
    if (qi >= 0) queue.splice(qi, 1);
    try { fs.rmSync(folder(id), { recursive: true, force: true }); } catch {}
    emit(state(id));
  }
  // App → Offline: how much is downloaded, and remove it all.
  function summary() {
    const books = list();
    return { count: books.length, size: books.reduce((n, b) => n + (b.size || 0), 0), pending: books.some((b) => b.pending) };
  }
  function removeAll() {
    queue.length = 0;
    for (const j of jobs.values()) j.abort();
    let names = [];
    try { names = fs.readdirSync(root()); } catch {}
    for (const n of names) remove(n);
  }
  // Left from a download cut short (the app closed or crashed): folders without item.json, and
  // stray .part / .tmp files. They weren't shown or counted anywhere, but took up space.
  function cleanLeftovers() {
    let names = [];
    try { names = fs.readdirSync(root()); } catch { return; }
    for (const n of names) {
      if (!validId(n) || jobs.has(n) || queue.includes(n)) continue;
      const dir = folder(n);
      try {
        if (!fs.statSync(dir).isDirectory()) continue;
        if (!fs.existsSync(path.join(dir, "item.json"))) { fs.rmSync(dir, { recursive: true, force: true }); continue; }
        for (const f of fs.readdirSync(dir)) if (/\.(part|tmp)$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
      } catch {}
    }
  }
  setTimeout(cleanLeftovers, 20000);

  // ---- the offline library page ------------------------------------------------
  function list() {
    let names = [];
    try { names = fs.readdirSync(root()); } catch { return []; }
    return names.map((n) => {
      const m = meta(n);
      if (!m) return null;
      const p = progress(n);
      return { id: m.id, title: m.title, author: m.author, series: m.series, duration: m.duration, size: m.size,
        cover: m.cover ? pathToFileURL(path.join(folder(n), m.cover)).href : null,
        position: startPosition(p, m.duration), downloadedAt: m.downloadedAt, lastPlayed: p.lastPlayed || 0, pending: unsynced(p).length > 0 };
    }).filter(Boolean).sort((a, b) => (b.lastPlayed || b.downloadedAt) - (a.lastPlayed || a.downloadedAt));
  }
  // Where to start: your offline position, unless the server's is newer.
  function startPosition(p, duration) {
    const local = p.currentTime != null ? { t: p.currentTime, at: p.updatedAt || 0 } : null;
    const server = p.serverProgress ? { t: p.serverProgress.currentTime || 0, at: p.serverProgress.lastUpdate || 0 } : null;
    const t = local && (!server || local.at >= server.at) ? local.t : server ? server.t : 0;
    return duration && t >= duration - 5 ? 0 : t;   // (at the very end = finished: from the start)
  }
  function item(id) {
    const m = meta(id);
    if (!m) return null;
    return { ...m, cover: m.cover ? pathToFileURL(path.join(folder(id), m.cover)).href : null,
      tracks: m.tracks.map((t) => ({ ...t, url: pathToFileURL(path.join(folder(id), t.file)).href })),
      position: startPosition(progress(id), m.duration) };
  }

  // Listening, sent by the offline player every few seconds while playing and on pause.
  function saveListening(id, { currentTime, listened, newSession, startTime, finished }) {
    const m = meta(id);
    if (!m) return;
    const p = progress(id);
    const now = Date.now();
    p.currentTime = Math.max(0, Number(currentTime) || 0);
    p.updatedAt = now;
    // Played to the end → finished (sent to the server on the next sync). Listening again from earlier undoes it.
    if (finished) { p.finished = true; p.finishedSynced = false; }
    else if (p.finished && p.currentTime < (m.duration || 0) - 60) { p.finished = false; p.finishedSynced = false; }
    p.sessions = p.sessions || [];
    let s = p.sessions[p.sessions.length - 1];
    const d0 = new Date(now), pad = (x) => String(x).padStart(2, "0");
    const today = `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`;
    if (!s || newSession || s.date !== today || now - s.updatedAt > 30 * 60 * 1000) {
      s = { id: crypto.randomUUID(), startedAt: now, startTime: Number.isFinite(Number(startTime)) ? Number(startTime) : p.currentTime, timeListening: 0, date: today };
      p.sessions.push(s);
    }
    s.currentTime = p.currentTime;
    s.updatedAt = now;
    s.timeListening = Math.round((s.timeListening || 0) + Math.max(0, Math.min(Number(listened) || 0, 600)));
    p.lastPlayed = now;
    writeJson(progressFile(id), p);
    scheduleSync();
  }
  const unsynced = (p) => (p.sessions || []).filter((s) => s.timeListening > 0 && (s.syncedAt || 0) < s.updatedAt && !s.dead);

  // ---- sync to the server ------------------------------------------------------
  let syncing = false, syncTimer = null;
  function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(), 15000); }
  async function sync() {
    const v = ctx.view();
    if (syncing || !v || !ctx.isServerUrl(v.webContents.getURL())) return;   // only while the web app is open (= online, signed in)
    syncing = true;
    try {
      const token = await ctx.getToken();
      if (!token) return;
      const me = await (await api("/api/me", token)).json();
      const ids = list().map((x) => x.id).filter((id) => { const m = meta(id); return !m.userId || m.userId === me.id; });
      const sessions = [];
      for (const id of ids) {
        const m = meta(id), p = progress(id);
        for (const s of unsynced(p)) {
          const d = new Date(s.updatedAt);
          sessions.push({
            id: s.id, libraryId: m.libraryId, libraryItemId: m.id, episodeId: null, mediaType: "book",
            displayTitle: m.title, displayAuthor: m.author, duration: m.duration, playMethod: 3, mediaPlayer: "html5",
            date: s.date, dayOfWeek: d.toLocaleDateString("en-US", { weekday: "long" }), timeListening: s.timeListening,
            startTime: s.startTime, currentTime: s.currentTime, startedAt: s.startedAt, updatedAt: s.updatedAt,
          });
        }
      }
      if (sessions.length) {
        const res = await api("/api/session/local-all", token, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessions, deviceInfo: deviceInfo() }),
        });
        const results = ((await res.json()) || {}).results || [];
        const ok = new Set(results.filter((r) => r.success).map((r) => r.id));
        const sent = new Set(sessions.map((s) => s.id));
        for (const id of ids) {
          const p = progress(id);
          let changed = false;
          for (const s of p.sessions || []) {
            if (ok.has(s.id)) { s.syncedAt = s.updatedAt; changed = true; }
            else if (sent.has(s.id)) { s.tries = (s.tries || 0) + 1; if (s.tries >= 10) s.dead = true; changed = true; }
          }
          // Keep the last 20 sessions that are done with (sent, or given up); never drop one still waiting.
          const done = (s) => !(s.timeListening > 0 && (s.syncedAt || 0) < s.updatedAt && !s.dead);
          const doneOnes = (p.sessions || []).filter(done);
          if (doneOnes.length > 20) {
            const keep = new Set(doneOnes.slice(-20));
            p.sessions = p.sessions.filter((s) => !done(s) || keep.has(s));
            changed = true;
          }
          if (changed) writeJson(progressFile(id), p);
        }
        if (ok.size) ctx.toast("success", ctx.tr("offline.synced"));
      }
      // Books played to the end offline → finished on the server too.
      for (const id of ids) {
        const p = progress(id);
        if (!p.finished || p.finishedSynced || unsynced(p).length) continue;
        try {
          await api(`/api/me/progress/${id}`, token, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isFinished: true }) });
          p.finishedSynced = true;
          writeJson(progressFile(id), p);
        } catch (err) { ctx.log("offline finish failed: " + err.message); }
      }
      // Refresh where the server says you are, for every downloaded book.
      const byItem = new Map((me.mediaProgress || []).map((mp) => [mp.libraryItemId, mp]));
      for (const id of ids) {
        const mp = byItem.get(id);
        if (!mp) continue;
        const p = progress(id);
        p.serverProgress = { currentTime: mp.currentTime || 0, isFinished: !!mp.isFinished, lastUpdate: mp.lastUpdate || 0, finishedAt: mp.finishedAt || 0 };
        writeJson(progressFile(id), p);
      }
      // App → Offline → Delete finished books: once everything about a book has reached the
      // server and it was finished after downloading (here or on another device), free the space.
      // (A book you'd finished before and downloaded to hear again stays.)
      if (ctx.config().offlineAutoDelete) {
        for (const id of ids) {
          const m = meta(id), p = progress(id);
          if (!m || jobs.has(id) || unsynced(p).length || (p.finished && !p.finishedSynced)) continue;
          const sp = p.serverProgress || {};
          const listeningAgain = !p.finished && (p.updatedAt || 0) > (sp.finishedAt || 0);
          if ((p.finished && p.finishedSynced) || (sp.isFinished && (sp.finishedAt || 0) > (m.downloadedAt || 0) && !listeningAgain)) {
            remove(id);
            ctx.toast("info", ctx.tr("offline.autoDeleted", { title: m.title }));
          }
        }
      }
    } catch (err) {
      ctx.log("offline sync failed: " + err.message);
    } finally {
      syncing = false;
    }
  }

  // ---- messages -------------------------------------------------------------------
  // From the web app's book page (download button), via preload.js.
  const fromApp = (e) => ctx.fromServerPage(e) && ctx.view() && e.sender === ctx.view().webContents;
  ipcMain.handle("desktop:offline-state", (e, id) => (fromApp(e) && id ? state(String(id)) : null));
  ipcMain.on("desktop:offline-download", (e, id, title) => { if (fromApp(e) && typeof id === "string") enqueue([{ id, title }]); });
  ipcMain.on("desktop:offline-download-many", (e, items) => {
    if (!fromApp(e) || !Array.isArray(items)) return;
    enqueue(items.filter((x) => typeof x === "string" || (x && typeof x.id === "string")).slice(0, 500));
  });
  ipcMain.handle("desktop:offline-queue", (e) => (ctx.fromLocalPage(e) ? queueState() : []));
  ipcMain.on("desktop:offline-cancel", (e, id) => { if (ctx.fromLocalPage(e) && typeof id === "string") remove(id); });
  ipcMain.on("desktop:offline-remove", (e, id) => { if ((fromApp(e) || ctx.fromLocalPage(e)) && id) remove(String(id)); });
  // From the offline library page.
  ipcMain.handle("desktop:offline-list", (e) => (ctx.fromLocalPage(e) ? list() : []));
  ipcMain.handle("desktop:offline-item", (e, id) => (ctx.fromLocalPage(e) && validId(String(id)) ? item(String(id)) : null));
  ipcMain.on("desktop:offline-listening", (e, id, data) => {
    if (!ctx.fromLocalPage(e) || !validId(String(id)) || !data) return;
    try { saveListening(String(id), data); } catch (err) { ctx.log("offline save failed: " + err.message); }
  });

  return {
    count: () => list().length,
    summary,
    removeAll,
    sync,
  };
};
