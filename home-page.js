// SPDX-License-Identifier: GPL-3.0-or-later
// "All libraries" Home (like Plex): one page with everything in progress from every library,
// the next books of your series, what's new in each library and what to listen to again.
// Opened from "🏠 All libraries" at the top of the web app's library picker. Drawn by ABS-DA
// over the web app's page area; any navigation closes it again.
//
// pageMain runs inside the Audiobookshelf page (main.js injects it with executeJavaScript);
// it is written as normal code here and sent as text. Calling it again only updates its
// options (texts, style) and redraws when open.

/* global window, document */
function pageMain(opts) {
  const $n = window.$nuxt;
  if (!$n || !$n.$store || !$n.$router || !$n.$axios || !$n.$eventBus || !$n.$store.state.user.user) return false;
  const H = window.__absdaHome || (window.__absdaHome = {});
  H.opts = opts;
  if (H.installed) {
    if (H.visible) H.render();
    document.documentElement.style.setProperty("--absda-home-label", JSON.stringify(opts.allLibraries));
    return true;
  }
  H.installed = true;
  const S = () => $n.$strings || {};
  const html = document.documentElement;
  html.style.setProperty("--absda-home-label", JSON.stringify(opts.allLibraries));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ---- look ------------------------------------------------------------------
  const style = el("style");
  style.id = "absda-home-style";
  style.textContent = `
    #absda-home { position: fixed; z-index: 45; overflow-y: auto; overflow-x: hidden; padding: 22px 30px 40px;
      color: #f1f1f1; background: var(--color-primary, #111); scrollbar-width: thin; }
    #absda-home.shelf { background: var(--bookshelf-texture-img) center / 900px repeat, var(--color-primary, #111); }
    #absda-home h1 { font-size: 30px; font-weight: 700; margin: 0 0 18px; display: flex; align-items: center; gap: 12px; }
    #absda-home h1 svg { width: 28px; height: 28px; color: var(--tb-logo); }
    #absda-home .h-row { margin-bottom: 28px; }
    #absda-home.shelf .h-row { margin-bottom: 0; }
    #absda-home .h-head { display: flex; align-items: baseline; gap: 10px; margin: 0 0 10px; }
    #absda-home .h-head b { font-size: 19px; }
    #absda-home .h-chip { font-size: 12px; padding: 2px 9px; border-radius: 999px; white-space: nowrap;
      background: color-mix(in srgb, var(--tb-logo) 22%, transparent); color: color-mix(in srgb, var(--tb-logo) 60%, white); }
    #absda-home .h-all { margin-left: auto; font-size: 13px; opacity: .75; cursor: pointer; white-space: nowrap; }
    #absda-home .h-all:hover { opacity: 1; text-decoration: underline; }
    #absda-home .h-strip { position: relative; }
    #absda-home .h-track { display: flex; gap: 16px; overflow-x: auto; scroll-behavior: smooth; scrollbar-width: none; padding: 3px 3px 4px; }
    #absda-home .h-track::-webkit-scrollbar { display: none; }
    #absda-home.shelf .h-track { gap: 22px; padding: 16px 16px 2px; }
    #absda-home .h-plank { height: 16px; margin: 0 0 28px; border-radius: 0 0 4px 4px;
      background: var(--bookshelf-divider-bg, linear-gradient(180deg, #8a6a4a, #5b3f25)); box-shadow: 0 8px 12px rgba(0,0,0,.45); }
    #absda-home .h-arrow { position: absolute; top: calc(50% - 30px); width: 36px; height: 36px; border-radius: 50%; z-index: 2;
      border: 1px solid rgba(255,255,255,.25); background: rgba(0,0,0,.7); color: #fff; font-size: 20px; line-height: 1;
      cursor: pointer; display: none; }
    #absda-home .h-strip:hover .h-arrow { display: block; }
    #absda-home .h-arrow.l { left: -12px; } #absda-home .h-arrow.r { right: -12px; }
    #absda-home .h-card { flex: none; width: var(--w); cursor: pointer; }
    #absda-home .h-cover { position: relative; width: var(--w); height: var(--h); border-radius: 6px; overflow: hidden;
      background: #222; box-shadow: 0 6px 16px rgba(0,0,0,.5); transition: transform .12s; }
    #absda-home.shelf .h-cover { border-radius: 2px; }
    #absda-home .h-card:hover .h-cover { outline: 2px solid var(--tb-logo); outline-offset: 2px; transform: translateY(-2px); }
    #absda-home .h-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
    #absda-home .h-bar { position: absolute; left: 0; bottom: 0; height: 5px; background: var(--tb-logo); }
    #absda-home .h-badge { position: absolute; top: 6px; right: 6px; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 12px;
      background: var(--tb-logo); color: #141414; font-weight: 700; font-size: 12px; line-height: 24px; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,.5); }
    #absda-home .h-act { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%;
      border: 0; background: rgba(0,0,0,.6); color: #fff; display: grid; place-items: center; cursor: pointer; opacity: 0; transition: opacity .12s; }
    #absda-home .h-card:hover .h-act, #absda-home .h-card.first .h-act { opacity: 1; }
    #absda-home .h-act:hover { background: var(--tb-logo); color: #141414; }
    #absda-home .h-act svg { width: 26px; height: 26px; }
    #absda-home .h-t { margin-top: 7px; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #absda-home .h-m { font-size: 12px; opacity: .65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #absda-home.shelf .h-t, #absda-home.shelf .h-m { text-shadow: 0 1px 3px rgba(0,0,0,.9); }
    #absda-home .h-loading { opacity: .6; padding: 30px 0; }
    /* The library picker shows "All libraries" while Home is open. */
    html[data-absda-home] #appbar div:has(> ul.librariesDropdownMenu) > button span:not(.abs-icons) { font-size: 0 !important; }
    html[data-absda-home] #appbar div:has(> ul.librariesDropdownMenu) > button span:not(.abs-icons)::before {
      content: var(--absda-home-label); font-size: 14px; }
    #absda-home-item svg { width: 18px; height: 18px; color: var(--tb-logo); flex: none; }
  `;
  document.head.append(style);

  const ICON_HOME = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 2 12h3v8h6v-6h2v6h6v-8h3z"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_READ = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 5c-1.1-.35-2.3-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/></svg>';

  // ---- data ------------------------------------------------------------------
  const libsById = () => new Map(($n.$store.state.libraries.libraries || []).map((l) => [l.id, l]));
  const aspect = (libId) => { const l = libsById().get(libId); return l && l.settings && l.settings.coverAspectRatio === 1 ? 1 : 1.6; };
  const progressOf = (item, episodeId) => { try { return $n.$store.getters["user/getUserMediaProgress"](item.id, episodeId) || null; } catch (e) { return null; } };
  const isAudio = (item) => item.mediaType === "podcast" || (item.media && (item.media.numTracks > 0 || item.media.duration > 0));
  const isEbook = (item) => item.media && (item.media.ebookFormat || item.media.ebookFile);
  const titleOf = (item) => (item.recentEpisode && item.recentEpisode.title) || (item.media && item.media.metadata && item.media.metadata.title) || "?";
  const authorOf = (item) => (item.media && item.media.metadata && (item.media.metadata.authorName || item.media.metadata.author)) || "";
  const seriesNameOf = (item) => {
    const s = item.media && item.media.metadata && item.media.metadata.seriesName;
    return s ? String(s).split(", ")[0].replace(/\s+#[^#]*$/, "").trim() : "";
  };

  async function load() {
    const ax = $n.$axios;
    const libs = ($n.$store.state.libraries.libraries || []).slice();
    const [inProg, ...shelves] = await Promise.all([
      ax.$get("/api/me/items-in-progress?limit=40").catch(() => ({ libraryItems: [] })),
      ...libs.map((l) => ax.$get(`/api/libraries/${l.id}/personalized?limit=24`).catch(() => [])),
    ]);
    return { libs, inProg: (inProg && inProg.libraryItems) || [], shelves };
  }

  function rowsFrom(d) {
    const s = S();
    const rows = [];
    if (d.inProg.length) rows.push({ title: s.LabelContinueListening || "Continue Listening", chip: opts.allLibraries, big: true, cards: d.inProg.map((it) => ({ item: it })) });
    const series = [], again = [];
    d.libs.forEach((l, i) => {
      for (const sh of d.shelves[i] || []) {
        if (sh.id === "continue-series") series.push(...sh.entities);
        if (sh.id === "listen-again" || sh.id === "read-again") again.push(...sh.entities);
      }
    });
    if (series.length) rows.push({ title: s.LabelContinueSeries || "Continue Series", chip: opts.allLibraries, cards: series.map((it) => ({ item: it })) });
    d.libs.forEach((l, i) => {
      const ra = (d.shelves[i] || []).find((sh) => sh.id === "recently-added");
      if (!ra || !ra.entities.length) return;
      // One card per series (with a count), single books as they are.
      const cards = [], bySeries = new Map();
      for (const it of ra.entities) {
        const sn = l.mediaType === "book" ? seriesNameOf(it) : "";
        if (sn && bySeries.has(sn)) { bySeries.get(sn).items.push(it); continue; }
        const c = { item: it, series: sn || null, items: [it] };
        if (sn) bySeries.set(sn, c);
        cards.push(c);
      }
      rows.push({ title: s.LabelRecentlyAdded || "Recently Added", chip: l.name.trim(), libId: l.id, cards });
    });
    if (again.length) rows.push({ title: s.LabelListenAgain || "Listen Again", chip: opts.allLibraries, cards: again.map((it) => ({ item: it })) });
    return rows;
  }

  // ---- actions ---------------------------------------------------------------
  const go = (p) => { try { const x = $n.$router.push(p); if (x && x.catch) x.catch(() => {}); } catch (e) {} };
  function play(item) {
    const episodeId = item.recentEpisode ? item.recentEpisode.id : null;
    $n.$eventBus.$emit("play-item", { libraryItemId: item.id, episodeId });
  }
  async function read(item) {
    try {
      const full = await $n.$axios.$get(`/api/items/${item.id}?expanded=1`);
      $n.$store.commit("showEReader", { libraryItem: full, keepProgress: true });
    } catch (e) { go(`/item/${item.id}`); }
  }
  async function openSeries(card) {
    const libId = card.item.libraryId;
    try {
      const r = await $n.$axios.$get(`/api/libraries/${libId}/search?q=${encodeURIComponent(card.series)}&limit=10`);
      const hit = (r.series || []).find((x) => x.series && x.series.name === card.series) || (r.series || [])[0];
      if (hit) return go(`/library/${libId}/series/${hit.series.id}`);
    } catch (e) {}
    go(`/item/${card.item.id}`);
  }

  // ---- drawing ---------------------------------------------------------------
  function cardEl(c, big) {
    const it = c.item;
    const h = big ? 230 : 170;
    const w = Math.round(h / aspect(it.libraryId));
    const box = el("div", "h-card");
    box.style.setProperty("--w", w + "px");
    box.style.setProperty("--h", h + "px");
    const cover = el("div", "h-cover");
    const img = el("img");
    img.loading = "lazy";
    img.alt = "";
    img.src = $n.$store.getters["globals/getLibraryItemCoverSrc"](it);
    cover.append(img);
    const p = progressOf(it, it.recentEpisode && it.recentEpisode.id);
    const frac = p ? (p.isFinished ? 1 : p.ebookProgress > 0 && !(p.duration > 0) ? p.ebookProgress : p.progress || 0) : 0;
    if (frac > 0) { const bar = el("div", "h-bar"); bar.style.width = Math.round(frac * 100) + "%"; cover.append(bar); }
    if (c.items && c.items.length > 1) cover.append(el("div", "h-badge", String(c.items.length)));
    // Play (audio) or Read (ebook) on the cover; a series card opens the series.
    if (!c.series || c.items.length === 1) {
      const canPlay = isAudio(it), canRead = !canPlay && isEbook(it);
      if (canPlay || canRead) {
        const b = el("button", "h-act");
        b.type = "button";
        b.title = canPlay ? (S().ButtonPlay || "Play") : (S().ButtonRead || "Read");
        b.innerHTML = canPlay ? ICON_PLAY : ICON_READ;
        b.addEventListener("click", (e) => { e.stopPropagation(); canPlay ? play(it) : read(it); });
        cover.append(b);
      }
    }
    box.append(cover);
    const meta = big ? contMeta(it, p) : authorOf(it);
    const libName = big && c.item.libraryId && libsById().get(c.item.libraryId) ? " · " + libsById().get(c.item.libraryId).name.trim() : "";
    box.append(el("div", "h-t", c.series && c.items.length > 1 ? c.series : titleOf(it)), el("div", "h-m", meta + libName));
    // Continue Listening cards: Home updates them as you listen (see H.live)
    if (big) { box.dataset.cont = it.id + (it.recentEpisode ? ":" + it.recentEpisode.id : ""); box.dataset.lib = libName; }
    box.addEventListener("click", () => (c.series && c.items.length > 1 ? openSeries(c) : go(`/item/${it.id}`)));
    return box;
  }

  // Continue Listening's line: time left (audio), % read (ebook), else the author.
  function contMeta(it, p) {
    if (!p || p.isFinished) return authorOf(it);
    if (isAudio(it) && p.duration > 0) {
      const left = Math.max(0, p.duration - (p.currentTime || 0));
      return String(S().LabelTimeLeft || "{0} left").replace("{0}", $n.$elapsedPretty ? $n.$elapsedPretty(left) : Math.round(left / 60) + " min");
    }
    return Math.round((p.ebookProgress || 0) * 100) + "%";
  }

  function rowEl(r, shelf) {
    const row = el("div", "h-row");
    const head = el("div", "h-head");
    head.append(el("b", null, r.title), el("span", "h-chip", r.chip));
    if (r.libId) {
      const all = el("span", "h-all", (S().ButtonViewAll || "View All") + " ›");
      all.addEventListener("click", () => go(`/library/${r.libId}/bookshelf`));
      head.append(all);
    }
    row.append(head);
    const strip = el("div", "h-strip");
    const track = el("div", "h-track");
    r.cards.forEach((c, i) => { const e = cardEl(c, r.big); if (r.big && i === 0) e.classList.add("first"); track.append(e); });
    const arrow = (dir) => {
      const a = el("button", "h-arrow " + (dir < 0 ? "l" : "r"), dir < 0 ? "‹" : "›");
      a.type = "button";
      a.addEventListener("click", () => track.scrollBy({ left: dir * track.clientWidth * 0.8 }));
      return a;
    };
    strip.append(arrow(-1), track, arrow(1));
    row.append(strip);
    const frag = document.createDocumentFragment();
    frag.append(row);
    if (shelf) frag.append(el("div", "h-plank"));
    return frag;
  }

  let panel = null, placeTimer = null;
  function place() {
    if (!panel) return;
    const bar = document.querySelector("#appbar");
    const rail = document.querySelector("#siderail-buttons-container");
    const player = document.querySelector("#mediaPlayerContainer");
    const top = bar ? bar.getBoundingClientRect().bottom : 64;
    const left = rail ? rail.getBoundingClientRect().right : 80;
    const pr = player && player.getBoundingClientRect();
    const bottom = pr && pr.height > 0 && pr.top < window.innerHeight ? window.innerHeight - pr.top : 0;
    Object.assign(panel.style, { top: Math.round(top) + "px", left: Math.round(left) + "px", right: "0px", bottom: Math.round(bottom) + "px" });
  }

  H.render = () => {
    if (!panel) return;
    const shelf = H.opts.style === "shelf";
    panel.className = shelf ? "shelf" : "";
    const scroll = panel.scrollTop;
    panel.textContent = "";
    const h1 = el("h1");
    h1.innerHTML = ICON_HOME;
    h1.append(document.createTextNode(S().ButtonHome || "Home"));
    panel.append(h1);
    if (!H.data) { panel.append(el("div", "h-loading", "…")); return; }
    for (const r of rowsFrom(H.data)) panel.append(rowEl(r, shelf));
    panel.scrollTop = scroll;
  };

  H.show = async () => {
    if (!panel) {
      panel = el("div");
      panel.id = "absda-home";
      document.body.append(panel);
    }
    H.visible = true;
    html.setAttribute("data-absda-home", "");
    place();
    clearInterval(placeTimer);
    placeTimer = setInterval(place, 800);   // follows the player bar appearing / window size
    H.render();
    try { H.data = await load(); } catch (e) { H.data = { libs: [], inProg: [], shelves: [] }; }
    if (H.visible) H.render();
  };
  H.hide = () => {
    if (!H.visible) return;
    H.visible = false;
    html.removeAttribute("data-absda-home");
    clearInterval(placeTimer);
    if (panel) { panel.remove(); panel = null; }
  };

  // Home keeps up while it's open: whenever progress changes (here or on another device, the
  // web app stores it), Continue Listening's bars and time left update in place. A book that
  // isn't first in the row yet, or one just finished, reloads Home quietly (at most every 30 s).
  let liveTimer = null, reloadAt = 0;
  H.live = (d) => {
    if (!H.visible || !panel || !H.data) return;
    for (const box of panel.querySelectorAll("[data-cont]")) {
      const [id, ep] = box.dataset.cont.split(":");
      const it = H.data.inProg.find((x) => x.id === id);
      if (!it) continue;
      const p = progressOf(it, ep);
      const frac = p ? (p.isFinished ? 1 : p.ebookProgress > 0 && !(p.duration > 0) ? p.ebookProgress : p.progress || 0) : 0;
      const cover = box.querySelector(".h-cover");
      let bar = cover && cover.querySelector(".h-bar");
      if (cover && frac > 0) { if (!bar) { bar = el("div", "h-bar"); cover.append(bar); } bar.style.width = Math.round(frac * 100) + "%"; }
      const m = box.querySelector(".h-m");
      if (m) m.textContent = contMeta(it, p) + (box.dataset.lib || "");
    }
    if (!d) return;
    const first = H.data.inProg[0];
    const isFirst = first && first.id === d.libraryItemId && (!d.episodeId || (first.recentEpisode && first.recentEpisode.id === d.episodeId));
    if (isFirst && !d.isFinished) return;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(async () => {
      if (!H.visible) return;
      reloadAt = Date.now();
      try { H.data = await load(); } catch (e) { return; }
      if (H.visible) H.render();
    }, Math.max(0, 30000 - (Date.now() - reloadAt)));
  };
  let liveDebounce = null;
  $n.$store.subscribe((m) => {
    if (m.type !== "user/updateMediaProgress" || !H.visible) return;
    clearTimeout(liveDebounce);
    liveDebounce = setTimeout(() => H.live(m.payload && m.payload.data), 300);
  });

  // Any navigation (a book, a library, the side menu…) closes Home.
  $n.$router.afterEach(() => H.hide());
  document.addEventListener("click", (e) => {
    if (!H.visible || e.target.closest("#absda-home, #absda-home-item")) return;
    if (e.target.closest("a[href], ul.librariesDropdownMenu li, #siderail-buttons-container")) H.hide();
  }, true);
  window.addEventListener("resize", place);

  // "🏠 All libraries" at the top of the library picker.
  const findVm = (tag) => { let hit = null; const walk = (vm) => { if (hit) return; if ((vm.$options._componentTag || vm.$options.name) === tag) { hit = vm; return; } vm.$children.forEach(walk); }; walk($n.$root); return hit; };
  function addPickerItem() {
    const ul = document.querySelector("ul.librariesDropdownMenu");
    if (!ul || ul.querySelector("#absda-home-item")) return;
    const first = ul.querySelector("li");
    const li = first ? first.cloneNode(true) : el("li");
    li.id = "absda-home-item";
    li.removeAttribute("aria-selected");
    const label = li.querySelector("span.truncate, span:not(.abs-icons)") || li;
    label.textContent = H.opts.allLibraries;
    const icon = li.querySelector(".abs-icons, svg, img");
    if (icon) { const w = document.createElement("span"); w.innerHTML = ICON_HOME; icon.replaceWith(w.firstChild); }
    li.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dd = findVm("ui-libraries-dropdown");
      if (dd) dd.showMenu = false;
      H.show();
    });
    ul.prepend(li);
  }
  new window.MutationObserver(addPickerItem).observe(document.body, { childList: true, subtree: true });
  return true;
}

module.exports = (opts) => `(${pageMain.toString()})(${JSON.stringify(opts)})`;
