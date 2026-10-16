/* Browser behaviour: explore accordion, "my day" plan, booking form, copy buttons, mobile menu. */
(function () {
  "use strict";
  const { esc, arDigits, waLink, ic } = window.Shared;
  const D = JSON.parse(document.getElementById("data").textContent);
  const L = D.labels, E = L.explore, lang = D.lang;
  const fill = s => String(s).split("{B}").join(D.brand);
  const wa = text => waLink(D.whatsapp, fill(text));
  const num = n => arDigits(n, lang);
  const S = { cat: null, gov: "all", type: "all", q: "", showAll: false, picks: [] };
  const LIMIT = 6;

  /* ---------- mobile menu ---------- */
  const hdr = document.getElementById("hdr"), mb = document.getElementById("menuBtn");
  mb.addEventListener("click", () => { const o = hdr.classList.toggle("open"); mb.setAttribute("aria-expanded", o); });
  document.getElementById("nav").addEventListener("click", e => { if (e.target.tagName === "A") { hdr.classList.remove("open"); mb.setAttribute("aria-expanded", "false"); } });

  /* ---------- explore ---------- */
  const catName = id => (D.categories.find(c => c.id === id) || {}).name || id;
  const catDesc = id => (D.categories.find(c => c.id === id) || {}).description || "";
  function items() {
    if (!S.cat) return [];
    if (S.cat === "tours") return D.tours.map((t, i) => ({ id: "tours:" + i, name: t.n, alt: "", area: t.city, g: "", t: "", tour: t, img: t.img }));
    return (D.places[S.cat] || []).map((p, i) => ({ id: S.cat + ":" + i, name: p.n, alt: p.a, area: p.area, g: p.g, t: p.t, img: p.img }));
  }
  function nameOf(id) {
    const [cat, i] = id.split(":");
    if (cat === "tours") return D.tours[+i].n;
    const p = D.places[cat][+i];
    return p.a ? p.n + " (" + p.a + ")" : p.n;
  }
  function syncCats() {
    document.querySelectorAll("[data-cat]").forEach(x => { const on = x.dataset.cat === S.cat; x.setAttribute("aria-pressed", on); x.setAttribute("aria-expanded", on); });
  }
  /* the panel goes after the last tile of the tapped tile's row, so it opens underneath it */
  function placePanel() {
    const grid = document.getElementById("exCats"), panel = document.getElementById("exPanel");
    if (!S.cat) return;
    const tiles = [...grid.querySelectorAll(".ex-cat")];
    const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length);
    const idx = tiles.findIndex(t => t.dataset.cat === S.cat);
    tiles[Math.min(Math.floor(idx / cols) * cols + cols - 1, tiles.length - 1)].after(panel);
  }
  function renderPanel() {
    const panel = document.getElementById("exPanel");
    if (!S.cat) { panel.hidden = true; panel.innerHTML = ""; renderTray(); return; }
    const all = items();
    let filters = "";
    if (S.cat !== "tours") {
      filters += ["all", "cairo", "giza"].filter(g => g === "all" || all.some(it => it.g === g)).map(g => '<button type="button" data-gov="' + g + '" aria-pressed="' + (S.gov === g) + '">' + esc(g === "all" ? E.all : E.gov[g]) + '</button>').join("");
      const types = ["pharaonic", "islamic", "coptic", "jewish"].filter(t => all.some(it => it.t === t));
      if (types.length) filters += '<span class="sep"></span>' + ["all"].concat(types).map(t => '<button type="button" data-type="' + t + '" aria-pressed="' + (S.type === t) + '">' + esc(t === "all" ? E.all : E.type[t]) + '</button>').join("");
    }
    panel.hidden = false;
    panel.innerHTML = '<div class="ex-top"><div><h3>' + esc(catName(S.cat)) + '</h3><p>' + esc(catDesc(S.cat)) + '</p></div><button type="button" class="ex-close" id="exClose">✕ ' + esc(E.close) + '</button></div>'
      + '<div class="ex-tools"><div class="fchips">' + filters + '</div><label class="ex-search">' + ic("search") + '<input type="search" id="exQ" aria-label="' + esc(E.search) + '" placeholder="' + esc(E.search) + '"></label></div>'
      + '<div class="places" id="exList"></div><div id="exMore"></div>';
    panel.querySelectorAll("[data-gov]").forEach(b => b.addEventListener("click", () => { S.gov = b.dataset.gov; renderPanel(); }));
    panel.querySelectorAll("[data-type]").forEach(b => b.addEventListener("click", () => { S.type = b.dataset.type; renderPanel(); }));
    const q = document.getElementById("exQ"); q.value = S.q;
    q.addEventListener("input", () => { S.q = q.value; S.showAll = !!S.q.trim(); renderList(); });
    document.getElementById("exClose").addEventListener("click", () => {
      const b = document.querySelector('[data-cat="' + S.cat + '"]'); S.cat = null; syncCats(); renderPanel();
      if (b) b.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    renderList();
  }
  function renderList() {
    const list = document.getElementById("exList"); if (!list) return;
    const q = S.q.trim().toLowerCase();
    const found = items().filter(it => (S.cat === "tours" || S.gov === "all" || it.g === S.gov) && (S.type === "all" || it.t === S.type)
      && (!q || (it.name + " " + it.alt + " " + it.area).toLowerCase().includes(q)));
    const shown = S.showAll ? found : found.slice(0, LIMIT);
    list.innerHTML = shown.length ? shown.map(it => {
      const picked = S.picks.includes(it.id);
      const tags = (it.g ? '<span class="tg">' + esc(E.gov[it.g]) + '</span>' : '') + (it.t ? '<span class="tg">' + esc(E.type[it.t]) + '</span>' : '');
      const extra = it.tour ? '<p class="tour-d">' + esc(it.tour.d) + '</p><div class="meta"><span>' + num(it.tour.h) + ' ' + esc(L.hours) + '</span><span>' + (String(it.tour.price).trim() ? esc(L.priceFrom.replace("{p}", it.tour.price)) : esc(L.priceAsk)) + '</span></div>' : '';
      const msg = it.tour ? L.wa.tour.replace("{t}", it.name) : L.wa.place.replace("{p}", nameOf(it.id));
      return '<article class="place' + (picked ? " on" : "") + '">' + (it.img ? '<div class="thumb"><img src="' + esc(it.img) + '" alt="" loading="lazy"></div>' : '')
        + '<h4>' + esc(it.name) + '</h4>' + (it.alt ? '<span class="alt">' + esc(it.alt) + '</span>' : '')
        + '<span class="loc">' + ic("pin") + esc(it.area) + tags + '</span>' + extra
        + '<div class="acts"><a class="sbtn go" target="_blank" rel="noopener" href="' + wa(msg) + '">' + ic("car") + esc(E.take) + '</a>'
        + '<button type="button" class="sbtn" data-pick="' + it.id + '" aria-pressed="' + picked + '">' + ic(picked ? "check" : "plus") + esc(picked ? E.added : E.add) + '</button></div></article>';
    }).join("") : '<p class="ex-empty">' + esc(E.empty) + '</p>';
    const more = document.getElementById("exMore");
    more.innerHTML = found.length > LIMIT && !q ? '<button type="button" class="ex-more" id="exMoreBtn">' + esc(S.showAll ? E.less : E.more.replace("{n}", num(found.length))) + '</button>' : '';
    const mbtn = document.getElementById("exMoreBtn"); if (mbtn) mbtn.addEventListener("click", () => { S.showAll = !S.showAll; renderList(); });
    list.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => {
      const k = S.picks.indexOf(b.dataset.pick); if (k >= 0) S.picks.splice(k, 1); else S.picks.push(b.dataset.pick);
      renderList();
    }));
    renderTray();
  }
  function renderTray() {
    const tray = document.getElementById("exTray");
    document.body.classList.toggle("has-picks", S.picks.length > 0);
    if (!S.picks.length) { tray.innerHTML = ""; return; }
    const names = S.picks.map(nameOf);
    const msg = L.wa.plan.replace("{list}", names.map((n, i) => (i + 1) + ". " + n).join("\n"));
    tray.innerHTML = '<div class="tray"><b>' + esc(E.myday) + ' · ' + num(S.picks.length) + '</b><div class="picks">' + names.map(n => '<span>' + esc(n) + '</span>').join("") + '</div>'
      + '<button type="button" class="clr" id="exClr">' + esc(E.clear) + '</button><a class="btn btn-acc" target="_blank" rel="noopener" href="' + wa(msg) + '">' + ic("chat") + esc(E.plan) + '</a></div>';
    document.getElementById("exClr").addEventListener("click", () => { S.picks = []; renderList(); if (!S.cat) renderTray(); });
  }
  document.querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => {
    const c = b.dataset.cat;
    S.cat = S.cat === c ? null : c; S.gov = "all"; S.type = "all"; S.q = ""; S.showAll = false;
    syncCats(); placePanel(); renderPanel();
    if (S.cat) b.scrollIntoView({ block: "start", behavior: "smooth" });
  }));
  window.addEventListener("resize", placePanel);

  /* ---------- booking form → WhatsApp ---------- */
  const svcSel = document.getElementById("bk-svc");
  const v = id => (document.getElementById(id) || {}).value || "—";
  function updateBooking() {
    const svc = svcSel.selectedIndex >= 0 ? svcSel.options[svcSel.selectedIndex].text : "—";
    const msg = L.wa.booking.replace("{svc}", svc).replace("{from}", v("bk-from")).replace("{to}", v("bk-to"))
      .replace("{date}", v("bk-date")).replace("{time}", v("bk-time")).replace("{pax}", v("bk-pax")).replace("{name}", v("bk-name"));
    document.getElementById("bk-send").href = wa(msg);
  }
  ["bk-svc", "bk-from", "bk-to", "bk-date", "bk-time", "bk-pax", "bk-name"].forEach(id => {
    const el = document.getElementById(id); if (el) { el.addEventListener("input", updateBooking); el.addEventListener("change", updateBooking); }
  });
  document.getElementById("bookForm").addEventListener("submit", e => e.preventDefault());
  const tabs = document.querySelectorAll("[data-bt]");
  const pickTab = b => {
    tabs.forEach(x => x.setAttribute("aria-pressed", x === b));
    if ([...svcSel.options].some(o => o.value === b.dataset.bt)) svcSel.value = b.dataset.bt;
    updateBooking();
  };
  tabs.forEach(b => b.addEventListener("click", () => pickTab(b)));
  if (tabs[0]) pickTab(tabs[0]); else updateBooking();

  /* ---------- copy buttons ---------- */
  document.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", () => {
    const span = b.querySelector("span");
    const done = () => { span.textContent = L.contact.copied; setTimeout(() => { span.textContent = L.contact.copy; }, 1600); };
    const select = () => { const el = b.closest(".cbox").querySelector(".v"); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
    try { navigator.clipboard.writeText(b.dataset.copy).then(done, select); } catch (e) { select(); }
  }));
})();
