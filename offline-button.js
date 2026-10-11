// SPDX-License-Identifier: GPL-3.0-or-later
// The "Download for offline" button on a book's page in the web app (next to Play).
// Shows the download's progress, then a tick; clicking the tick offers to remove the copy.
// A series page gets a "Download series" button too (every audiobook in the series).
// pageMain runs inside the Audiobookshelf page (main.js injects it); it talks to the app
// through window messages that preload.js passes on (see offline.js).

/* global window, document */
function pageMain(opts) {
  const $n = window.$nuxt;
  if (!$n || !$n.$router || !$n.$store) return false;
  const B = window.__absdaOffline || (window.__absdaOffline = {});
  B.opts = opts;
  if (B.installed) { B.ensure(true); if (B.ensureSeries) B.ensureSeries(); return true; }
  B.installed = true;

  const BTN_ID = "absda-offline-btn";
  const ICON_DL = '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M5 20h14v-2H5v2zm7-3 6-6-1.4-1.4-3.6 3.6V4h-2v9.2L7.4 9.6 6 11l6 6z"/></svg>';
  const ICON_OK = '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.6 14.6L6 12.2l1.4-1.4 3 3 6.2-6.2L18 9l-7.6 7.6z"/></svg>';
  const sizeText = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(1) + " GB" : Math.max(1, Math.round(b / 1048576)) + " MB");
  const fill = (t, v) => Object.entries(v).reduce((a, [k, x]) => a.split("{" + k + "}").join(x), t);

  // Ask the app (preload.js → main) about a book; replies come back as window messages.
  let seq = 0;
  const pending = new Map();
  const ask = (itemId) => new Promise((resolve) => {
    const reqId = ++seq;
    pending.set(reqId, resolve);
    window.postMessage({ absdaOffline: { action: "state", itemId, reqId } }, window.location.origin);
    setTimeout(() => { if (pending.has(reqId)) { pending.delete(reqId); resolve(null); } }, 3000);
  });
  const tell = (action, itemId) => window.postMessage({ absdaOffline: { action, itemId } }, window.location.origin);
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data) return;
    const r = e.data.absdaOfflineReply;
    if (r && pending.has(r.reqId)) { pending.get(r.reqId)(r.result); pending.delete(r.reqId); }
    const s = e.data.absdaOfflineStatus;
    if (s) { B.states[s.itemId] = s; draw(); drawSeries(); }
  });
  B.states = {};

  // The book on the current page, if it's an audiobook.
  function currentBook() {
    const m = /^\/item\/([^/?#]+)/.exec($n.$route.path);
    if (!m) return null;
    const rec = $n.$route.matched && $n.$route.matched[0];
    const vm = rec && rec.instances && rec.instances.default;
    const li = vm && vm.libraryItem;
    if (!li || li.id !== m[1] || li.mediaType !== "book") return null;
    const audio = (li.media && ((li.media.tracks && li.media.tracks.length) || (li.media.audioFiles && li.media.audioFiles.length)));
    return audio ? li : null;
  }
  // The row with the Play button (not the top bar or the player).
  function buttonRow() {
    const icons = [...document.querySelectorAll(".material-symbols, .material-icons")]
      .filter((i) => /^(play_arrow|play_circle|pause)$/.test(i.textContent.trim()) && !i.closest("#appbar, #mediaPlayerContainer, #absda-home"));
    const play = icons.map((i) => i.closest("button")).find(Boolean);
    return play ? play.parentElement : null;
  }

  function draw() {
    const btn = document.getElementById(BTN_ID);
    const li = currentBook();
    if (!btn || !li) return;
    const s = B.states[li.id] || { state: "none" };
    btn.dataset.state = s.state;
    if (s.state === "downloading") {
      btn.innerHTML = `<span style="font-size:12px;font-weight:700">${Math.max(0, s.percent || 0)}%</span>`;
      btn.title = fill(B.opts.downloading, { percent: Math.max(0, s.percent || 0) });
    } else if (s.state === "done") {
      btn.innerHTML = ICON_OK;
      btn.title = B.opts.downloaded;
    } else {
      btn.innerHTML = ICON_DL;
      btn.title = B.opts.download;
    }
    btn.style.color = s.state === "done" ? "var(--tb-logo)" : "";
    btn.setAttribute("aria-label", btn.title);
  }

  let busy = false;
  B.ensure = async (force) => {
    if (busy) return;
    const li = currentBook();
    const old = document.getElementById(BTN_ID);
    if (!li) { if (old) old.remove(); return; }
    if (old && old.dataset.item === li.id && !force) return;
    const row = buttonRow();
    if (!row) return;
    busy = true;
    try {
      if (old) old.remove();
      const sample = [...row.querySelectorAll("button")].find((b) => b.querySelector(".material-symbols, .material-icons") && b.offsetWidth < 60) || null;
      const btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.type = "button";
      btn.dataset.item = li.id;
      btn.className = sample ? sample.className : "abs-btn rounded-md border border-gray-600 h-9 w-9 mx-0.5";
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const book = currentBook();
        if (!book) return;
        const s = B.states[book.id] || { state: "none" };
        if (s.state === "none") {
          window.postMessage({ absdaOffline: { action: "download", itemId: book.id, title: (book.media.metadata && book.media.metadata.title) || "" } }, window.location.origin);
          return;
        }
        const title = (book.media.metadata && book.media.metadata.title) || "";
        $n.$store.commit("globals/setConfirmPrompt", {
          message: fill(s.state === "done" ? B.opts.removeConfirm : B.opts.cancelConfirm, { title, size: sizeText(s.size || 0) }),
          type: "yesNo", yesButtonText: B.opts.remove, yesButtonColor: "error",
          callback: (ok) => { if (ok) tell("remove", book.id); },
        });
      });
      const more = [...row.querySelectorAll("button")].find((b) => /more_vert|more_horiz/.test(b.textContent));
      if (more) row.insertBefore(btn, more); else row.append(btn);
      B.states[li.id] = (await ask(li.id)) || B.states[li.id] || { state: "none" };
      draw();
    } finally {
      busy = false;
    }
  };

  // ---- series page: download every audiobook in the series --------------------------
  const SERIES_ID = "absda-offline-series";
  B.series = B.series || { key: null, ids: [], name: "" };
  const seriesRoute = () => /^\/library\/([^/]+)\/series\/([^/?#]+)/.exec($n.$route.path);
  const enc = (v) => ($n.$encode ? $n.$encode(v) : encodeURIComponent(window.btoa(unescape(encodeURIComponent(v)))));
  function seriesCounts() {
    const st = B.series.ids.map((id) => B.states[id] || { state: "none" });
    const done = st.filter((x) => x.state === "done");
    const busyOnes = st.filter((x) => x.state === "downloading");
    const pct = busyOnes.length ? Math.max(0, ...busyOnes.map((x) => x.percent || 0)) : 0;
    return { total: st.length, done: done.length, downloading: busyOnes.length, pct, size: done.reduce((n, x) => n + (x.size || 0), 0) };
  }
  function drawSeries() {
    const btn = document.getElementById(SERIES_ID);
    if (!btn) return;
    const c = seriesCounts();
    const o = B.opts;
    let html, title;
    if (c.downloading) {
      html = `<span style="font-weight:700">${fill(o.seriesProgress, { done: c.done, total: c.total })}</span><span style="opacity:.7">${c.pct}%</span>`;
      title = fill(o.seriesProgress, { done: c.done, total: c.total });
    } else if (c.done === c.total) {
      html = ICON_OK + `<span>${fill(o.seriesDone, { total: c.total })}</span>`;
      title = fill(o.seriesDone, { total: c.total });
    } else {
      const label = c.done ? fill(o.seriesRest, { count: c.total - c.done }) : o.seriesDownload;
      html = ICON_DL + `<span>${label}</span>`;
      title = label;
    }
    btn.innerHTML = html;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.dataset.state = c.downloading ? "downloading" : c.done === c.total ? "done" : "none";
    btn.style.color = c.done === c.total && !c.downloading ? "var(--tb-logo)" : "";
  }
  let seriesBusy = false;
  B.ensureSeries = async () => {
    if (seriesBusy) return;
    const m = seriesRoute();
    const old = document.getElementById(SERIES_ID);
    const toolbar = document.getElementById("toolbar");
    if (!m || !toolbar) { if (old) old.remove(); return; }
    const key = m[1] + "/" + m[2];
    if (old && old.dataset.key === key) return;
    seriesBusy = true;
    try {
      if (old) old.remove();
      if (B.series.key !== key) {
        // The series' audiobooks (books with audio; e-books only are left out).
        const r = await $n.$axios.$get(`/api/libraries/${m[1]}/items?filter=series.${enc(decodeURIComponent(m[2]))}&sort=media.metadata.title&limit=500&minified=1`).catch(() => null);
        const items = ((r && r.results) || []).filter((li) => li.mediaType === "book" && li.media && (li.media.numTracks > 0 || li.media.numAudioFiles > 0));
        B.series = { key, ids: items.map((li) => li.id), titles: Object.fromEntries(items.map((li) => [li.id, (li.media.metadata && li.media.metadata.title) || ""])), name: "" };
        for (const id of B.series.ids) B.states[id] = (await ask(id)) || B.states[id] || { state: "none" };
      }
      if (!B.series.ids.length || !seriesRoute() || document.getElementById(SERIES_ID)) return;
      const tb = document.getElementById("toolbar");
      if (!tb) return;
      B.series.name = ((tb.querySelector("p") || {}).textContent || "").trim();
      const btn = document.createElement("button");
      btn.id = SERIES_ID;
      btn.type = "button";
      btn.dataset.key = key;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const c = seriesCounts();
        if (c.done === c.total && !c.downloading) {
          $n.$store.commit("globals/setConfirmPrompt", {
            message: fill(B.opts.seriesRemoveConfirm, { count: c.total, series: B.series.name, size: sizeText(c.size) }),
            type: "yesNo", yesButtonText: B.opts.remove, yesButtonColor: "error",
            callback: (ok) => { if (ok) for (const id of B.series.ids) tell("remove", id); },
          });
          return;
        }
        if (c.downloading) return;   // already on its way
        const todo = B.series.ids.filter((id) => (B.states[id] || {}).state !== "done");
        window.postMessage({ absdaOffline: { action: "downloadMany", items: todo.map((id) => ({ id, title: B.series.titles[id] || "" })) } }, window.location.origin);
      });
      const grow = tb.querySelector(":scope > .grow");
      if (grow) grow.after(btn); else tb.append(btn);
      drawSeries();
    } finally {
      seriesBusy = false;
    }
  };
  if (!document.getElementById("absda-offline-style")) {
    const st = document.createElement("style");
    st.id = "absda-offline-style";
    st.textContent = `#${SERIES_ID} { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; margin: 0 6px;
      border-radius: 6px; border: 1px solid rgba(255, 255, 255, .22); background: rgba(0, 0, 0, .3); color: inherit; font-size: 13px;
      white-space: nowrap; cursor: pointer; }
      #${SERIES_ID}:hover { border-color: var(--tb-logo); }
      #${SERIES_ID} svg { width: 18px; height: 18px; }`;
    document.head.append(st);
  }

  let t = null;
  const ensureAll = () => { B.ensure(false); B.ensureSeries(); };
  new window.MutationObserver(() => { clearTimeout(t); t = setTimeout(ensureAll, 250); }).observe(document.body, { childList: true, subtree: true });
  $n.$router.afterEach(() => setTimeout(ensureAll, 400));
  ensureAll();
  return true;
}

module.exports = (opts) => `(${pageMain.toString()})(${JSON.stringify(opts)})`;
