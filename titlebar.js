// SPDX-License-Identifier: GPL-3.0-or-later
// Custom title bar: page title, focus dimming, and the App/Edit/View/Navigate/Help menus.

const desktop = window.absDesktop;
const titleEl = document.getElementById("title");

const setTitle = (t) => { titleEl.textContent = t || "ABS Desktop App"; };
desktop.getTitle().then(setTitle);
desktop.onTitle(setTitle);
desktop.onFocus((focused) => document.body.classList.toggle("blurred", !focused));

// Menu button names in the app's language (the order matches main.js buildMenu).
const MENU_KEYS = ["menu.app", "menu.edit", "menu.view", "menu.navigate", "menu.help"];
function setLabels(s) {
  if (!s) return;
  document.querySelectorAll(".menus button").forEach((btn) => {
    const key = MENU_KEYS[Number(btn.dataset.menu)];
    if (s[key]) btn.textContent = s[key];
  });
}
desktop.getStrings().then(setLabels);
desktop.onStrings(setLabels);

// "Update 2.2.0" pill: shown when the app found a newer release on GitHub.
const updateBtn = document.getElementById("update");
desktop.onUpdate((u) => {
  updateBtn.classList.toggle("hidden", !u);
  if (u) { updateBtn.textContent = u.label; updateBtn.title = u.tip || ""; }
});
updateBtn.addEventListener("click", () => desktop.openUpdate());

// Each button opens its menu just below itself. The menus are drawn over the window
// (ui.html), which needs to know where all the buttons are to switch between them.
const menuButtons = [...document.querySelectorAll(".menus button")];
const setOpen = (index) => menuButtons.forEach((b, i) => b.classList.toggle("open", i === index));
desktop.onMenuOpen(setOpen);
menuButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const rects = menuButtons.map((b) => {
      const r = b.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    });
    setOpen(Number(btn.dataset.menu));
    try {
      await desktop.showMenu(Number(btn.dataset.menu), rects);
    } finally {
      setOpen(-1);
    }
  });
});
