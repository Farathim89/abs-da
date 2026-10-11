// SPDX-License-Identifier: GPL-3.0-or-later
// The "Download for offline" button on a book's page in the web app (next to Play).
// Shows the download's progress, then a tick; clicking the tick offers to remove the copy.
// pageMain runs inside the Audiobookshelf page (main.js injects it); it talks to the app
// through window messages that preload.js passes on (see offline.js).

/* global window, document */
function pageMain(opts) {
  const $n = window.$nuxt;
  if (!$n || !$n.$router || !$n.$store) return false;
  const B = window.__absdaOffline || (window.__absdaOffline = {});
  B.opts = opts;
  if (B.installed) { B.ensure(true); return true; }
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
    if (s) { B.states[s.itemId] = s; draw(); }
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
        if (s.state === "none") { tell("download", book.id); return; }
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

  let t = null;
  new window.MutationObserver(() => { clearTimeout(t); t = setTimeout(() => B.ensure(false), 250); }).observe(document.body, { childList: true, subtree: true });
  $n.$router.afterEach(() => setTimeout(() => B.ensure(false), 400));
  B.ensure(false);
  return true;
}

module.exports = (opts) => `(${pageMain.toString()})(${JSON.stringify(opts)})`;
