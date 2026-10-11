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
  const folder = (id) => path.join(root(), String(id).replace(/[^A-Za-z0-9_-]/g, ""));
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
  const writeJson = (f, data) => { const tmp = f + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(data, null, 2)); fs.renameSync(tmp, f); };
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
  async function saveTo(res, file, onBytes, signal) {
    const out = fs.createWriteStream(file);
    const reader = res.body.getReader();
    try {
      for (;;) {
        if (signal.aborted) throw new Error("cancelled");
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
        onBytes(chunk.length);
      }
    } finally {
      await new Promise((r) => out.end(r));
    }
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
        await saveTo(await api(t.contentUrl, token, { signal: ctl.signal }), part, onBytes, ctl.signal);
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
      let serverProgress = null;
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
        server: ctx.config().server || "", downloadedAt: Date.now(), size,
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
      if (typeof it === "object" && it.title) titles.set(id, String(it.title).slice(0, 300));
      if (jobs.has(id) || queue.includes(id) || meta(id)) continue;
      queue.push(id);
      emit(state(id));
    }
    pump();
  }

  function remove(id) {
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
        position: startPosition(p), downloadedAt: m.downloadedAt, lastPlayed: p.lastPlayed || 0, pending: unsynced(p).length > 0 };
    }).filter(Boolean).sort((a, b) => (b.lastPlayed || b.downloadedAt) - (a.lastPlayed || a.downloadedAt));
  }
  // Where to start: your offline position, unless the server's is newer.
  function startPosition(p) {
    const local = p.currentTime != null ? { t: p.currentTime, at: p.updatedAt || 0 } : null;
    const server = p.serverProgress ? { t: p.serverProgress.currentTime || 0, at: p.serverProgress.lastUpdate || 0 } : null;
    if (local && (!server || local.at >= server.at)) return local.t;
    return server ? server.t : 0;
  }
  function item(id) {
    const m = meta(id);
    if (!m) return null;
    return { ...m, cover: m.cover ? pathToFileURL(path.join(folder(id), m.cover)).href : null,
      tracks: m.tracks.map((t) => ({ ...t, url: pathToFileURL(path.join(folder(id), t.file)).href })),
      position: startPosition(progress(id)) };
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
    const today = new Date(now).toISOString().slice(0, 10);
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
  const unsynced = (p) => (p.sessions || []).filter((s) => s.timeListening > 0 && (s.syncedAt || 0) < s.updatedAt);

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
      const ids = list().map((x) => x.id);
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
        for (const id of ids) {
          const p = progress(id);
          let changed = false;
          for (const s of p.sessions || []) if (ok.has(s.id)) { s.syncedAt = s.updatedAt; changed = true; }
          // Keep the last 20 sessions (older synced ones aren't needed any more).
          if ((p.sessions || []).length > 20) { p.sessions = p.sessions.slice(-20); changed = true; }
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
      const me = await (await api("/api/me", token)).json();
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
          if ((p.finished && p.finishedSynced) || (sp.isFinished && (sp.finishedAt || 0) > (m.downloadedAt || 0))) {
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
  ipcMain.handle("desktop:offline-item", (e, id) => (ctx.fromLocalPage(e) ? item(String(id)) : null));
  ipcMain.on("desktop:offline-listening", (e, id, data) => { if (ctx.fromLocalPage(e) && id && data) saveListening(String(id), data); });

  return {
    count: () => list().length,
    summary,
    removeAll,
    sync,
  };
};
