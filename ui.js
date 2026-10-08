// SPDX-License-Identifier: GPL-3.0-or-later
// The title-bar menus and the app's message boxes, drawn in the theme's colours.
// main.js shows this see-through page over the window while one is open.

const ui = window.absDesktop.ui;
const root = document.getElementById("root");
const SVG = (inner, box = "0 0 24 24") => `<svg viewBox="${box}" fill="currentColor" aria-hidden="true">${inner}</svg>`;
const TICK = SVG('<path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.5z"/>');

function clear() {
  root.textContent = "";
  document.onkeydown = null;
  // The theme (main.js) turns Windows' forced contrast colours off unless you chose them.
  document.documentElement.classList.toggle("themed", getComputedStyle(document.documentElement).forcedColorAdjust === "none");
}
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// ---- menus -------------------------------------------------------------------
// menus: [{ label, items }] — items: { id, type: normal|checkbox|submenu|separator,
// label, checked, enabled, accel, submenu }. rects: where the title-bar buttons are.
let M = null;   // { menus, rects, top, stack: [{ el, items, active }] }

function closeMenus() {
  M = null;
  clear();
  ui.close();
}

function openTop(index) {
  if (!M) return;
  M.top = index;
  for (const n of root.querySelectorAll(".menu")) n.remove();
  M.stack = [];
  ui.menuSwitch(index);
  const r = M.rects[index];
  openList(M.menus[index].items, r.left, r.bottom + 2, null);
}

// Draw a list at (x, y), or next to `parentRow` for a submenu.
function openList(items, x, y, parentRow) {
  const menu = el("div", "menu");
  menu.setAttribute("role", "menu");
  const level = { el: menu, items, rows: [], active: -1 };
  items.forEach((it, i) => {
    if (it.type === "separator") { menu.append(el("div", "sep")); level.rows.push(null); return; }
    const row = el("div", "item" + (it.enabled ? "" : " disabled"));
    row.setAttribute("role", it.type === "checkbox" ? "menuitemcheckbox" : "menuitem");
    const check = el("span", "check");
    if (it.checked) check.innerHTML = TICK;
    row.append(check, el("span", "label", it.label), el("span", "accel", it.accel || ""), el("span", "arrow", it.type === "submenu" ? "▶" : ""));
    row.addEventListener("mouseenter", () => hover(level, i));
    row.addEventListener("click", () => activate(level, i));
    menu.append(row);
    level.rows.push(row);
  });
  root.append(menu);
  M.stack.push(level);

  // Fit on screen: below the button (or beside the parent row); flip/shift when needed.
  const W = window.innerWidth, H = window.innerHeight;
  if (parentRow) {
    const pr = parentRow.getBoundingClientRect();
    x = pr.right + 2;
    if (x + menu.offsetWidth > W - 4) x = Math.max(4, pr.left - menu.offsetWidth - 2);
    y = pr.top - 5;
  }
  menu.style.maxHeight = `${H - 8}px`;
  if (y + menu.offsetHeight > H - 4) y = Math.max(4, H - 4 - menu.offsetHeight);
  menu.style.left = `${Math.round(Math.max(4, Math.min(x, W - menu.offsetWidth - 4)))}px`;
  menu.style.top = `${Math.round(y)}px`;
  return level;
}

const depthOf = (level) => M.stack.indexOf(level);
function closeBelow(level) {
  while (M.stack.length - 1 > depthOf(level)) M.stack.pop().el.remove();
}
function setActive(level, i) {
  level.rows.forEach((r, j) => r && r.classList.toggle("active", j === i));
  level.active = i;
  const row = level.rows[i];
  if (row) row.scrollIntoView({ block: "nearest" });
}

let hoverTimer = null;
function hover(level, i) {
  setActive(level, i);
  clearTimeout(hoverTimer);
  const it = level.items[i];
  // Open (or close) submenus after a short pause, like Windows does.
  hoverTimer = setTimeout(() => {
    if (!M || depthOf(level) < 0) return;
    closeBelow(level);
    if (it.type === "submenu" && it.enabled) openList(it.submenu, 0, 0, level.rows[i]);
  }, it.type === "submenu" ? 120 : 250);
}

function activate(level, i, fromKeys) {
  const it = level.items[i];
  if (!it || it.type === "separator" || !it.enabled) return;
  if (it.type === "submenu") {
    clearTimeout(hoverTimer);
    closeBelow(level);
    const sub = openList(it.submenu, 0, 0, level.rows[i]);
    if (fromKeys) move(sub, 1);
    return;
  }
  M = null;
  clear();
  ui.menuClick(it.id);
}

// Next enabled row in direction dir (wraps around).
function move(level, dir) {
  const n = level.items.length;
  let i = level.active;
  for (let k = 0; k < n; k++) {
    i = (i + dir + n) % n;
    const it = level.items[i];
    if (it.type !== "separator" && it.enabled) { setActive(level, i); return; }
  }
}

function menuKeys(e) {
  if (!M) return;
  const level = M.stack[M.stack.length - 1];
  const it = level.items[level.active];
  const tops = M.menus.length;
  switch (e.key) {
    case "ArrowDown": move(level, 1); break;
    case "ArrowUp": move(level, -1); break;
    case "Home": level.active = -1; move(level, 1); break;
    case "End": level.active = 0; move(level, -1); break;
    case "ArrowRight":
      if (it && it.type === "submenu" && it.enabled) activate(level, level.active, true);
      else { openTop((M.top + 1) % tops); move(M.stack[0], 1); }
      break;
    case "ArrowLeft":
      if (M.stack.length > 1) M.stack.pop().el.remove();
      else { openTop((M.top - 1 + tops) % tops); move(M.stack[0], 1); }
      break;
    case "Enter": case " ": if (it) activate(level, level.active, true); break;
    case "Escape":
      if (M.stack.length > 1) M.stack.pop().el.remove();
      else closeMenus();
      break;
    case "Tab": break;
    default: {
      // A letter jumps to the next item starting with it.
      if (e.key.length !== 1) return;
      const k = e.key.toLowerCase();
      const n = level.items.length;
      for (let s = 1; s <= n; s++) {
        const j = (level.active + s) % n;
        const x = level.items[j];
        if (x.type !== "separator" && x.enabled && String(x.label).toLowerCase().startsWith(k)) { setActive(level, j); break; }
      }
    }
  }
  e.preventDefault();
}

ui.onMenu(({ menus, index, rects }) => {
  clear();
  M = { menus, rects, top: index, stack: [] };
  // Over each title-bar button: hovering switches menus, clicking the open one closes.
  rects.forEach((r, i) => {
    const hot = el("div", "hot");
    Object.assign(hot.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.right - r.left}px`, height: `${r.bottom - r.top}px` });
    hot.addEventListener("mouseenter", () => { if (M && M.top !== i) openTop(i); });
    hot.addEventListener("mousedown", (e) => { e.stopPropagation(); if (M && M.top === i) closeMenus(); else openTop(i); });
    root.append(hot);
  });
  openTop(index);
  document.onkeydown = menuKeys;
});

// A click anywhere outside the menus closes them.
document.addEventListener("mousedown", (e) => {
  if (M && !e.target.closest(".menu, .hot")) closeMenus();
});

// ---- message boxes -------------------------------------------------------------
const ICONS = {
  info: SVG('<path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>'),
  question: SVG('<path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26A2 2 0 1010 9H8a4 4 0 118 0c0 .88-.36 1.68-.93 2.25z"/>'),
  warning: SVG('<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>'),
  error: SVG('<path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>'),
};

ui.onDialog((o) => {
  clear();
  M = null;
  const type = ICONS[o.type] ? o.type : "info";
  const back = el("div", "backdrop");
  const box = el("div", "dialog " + type);
  box.setAttribute("role", o.type === "warning" || o.type === "error" ? "alertdialog" : "dialog");
  box.setAttribute("aria-modal", "true");
  const head = el("div", "head");
  const icon = el("div", "icon");
  icon.innerHTML = ICONS[type];
  head.append(icon, el("div", "message", o.message || o.title || ""));
  box.append(head);
  if (o.detail) box.append(el("div", "detail", o.detail));
  const bar = el("div", "buttons");
  const buttons = (o.buttons && o.buttons.length ? o.buttons : ["OK"]).map((label, i) => {
    const b = el("button", i === o.defaultId ? "default" : "", label);
    b.type = "button";
    b.addEventListener("click", () => { clear(); ui.dialogResult(i); });
    bar.append(b);
    return b;
  });
  box.append(bar);
  back.append(box);
  root.append(back);
  (buttons[o.defaultId] || buttons[0]).focus();
  document.onkeydown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); clear(); ui.dialogResult(o.cancelId); }
    if (e.key === "Tab") {   // keep focus on the buttons
      e.preventDefault();
      const i = buttons.indexOf(document.activeElement);
      buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const i = buttons.indexOf(document.activeElement);
      if (i >= 0) buttons[(i + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length].focus();
    }
  };
});

// main.js closes a menu when the window loses focus or changes size.
ui.onClear(() => { M = null; clear(); });
