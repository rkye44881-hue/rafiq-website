"use strict";
/* search in the Cairo & Giza guide: filters chapters and place cards, opens matches, highlights the words */
(function () {
  var box = document.getElementById("encQ");
  if (!box) return;
  function norm(t) {
    return (t || "").toLowerCase().replace(/[ً-ٟـ]/g, "").replace(/[إأآا]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
  }
  var chapters = Array.prototype.slice.call(document.querySelectorAll(".enc-ch"));
  var places = Array.prototype.slice.call(document.querySelectorAll(".gplace"));
  var blocks = [];
  chapters.forEach(function (ch) {
    var list = Array.prototype.slice.call(ch.querySelectorAll(".enc-body p, .enc-body h3, .enc-body h4"));
    list.forEach(function (el) { el.setAttribute("data-orig", el.innerHTML); });
    ch.setAttribute("data-open", ch.open ? "1" : "0");
  });
  places.forEach(function (pl) { pl.setAttribute("data-orig", pl.innerHTML); });
  function esc(t) { return t.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function highlight(el, words) {
    var raw = el.getAttribute("data-orig");
    var tmp = document.createElement("div"); tmp.innerHTML = raw;
    var text = tmp.textContent;
    var out = esc(text);
    words.forEach(function (w) {
      var re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      out = out.replace(re, function (m) { return "<mark>" + m + "</mark>"; });
    });
    el.innerHTML = out;
  }
  function run() {
    var q = norm(box.value);
    var words = q ? q.split(" ").filter(Boolean) : [];
    var count = 0;
    chapters.forEach(function (ch) {
      var ps = Array.prototype.slice.call(ch.querySelectorAll(".enc-body p, .enc-body h3, .enc-body h4"));
      ps.forEach(function (el) { el.innerHTML = el.getAttribute("data-orig"); });
      if (!words.length) { ch.hidden = false; ch.open = ch.getAttribute("data-open") === "1"; return; }
      var all = norm(ch.textContent);
      var hit = words.every(function (w) { return all.indexOf(w) > -1; });
      ch.hidden = !hit;
      if (hit) {
        count++; ch.open = true;
        ps.forEach(function (el) { if (words.some(function (w) { return norm(el.textContent).indexOf(w) > -1; })) highlight(el, words); });
      }
    });
    places.forEach(function (pl) {
      pl.innerHTML = pl.getAttribute("data-orig");
      if (!words.length) { pl.hidden = false; return; }
      var hit = words.every(function (w) { return norm(pl.textContent).indexOf(w) > -1; });
      pl.hidden = !hit;
      if (hit) { count++; }
    });
    var out = document.getElementById("encCount");
    if (!words.length) out.textContent = "";
    else out.textContent = count ? box.getAttribute("data-count") + ": " + count : box.getAttribute("data-none");
  }
  box.addEventListener("input", run);
  box.addEventListener("search", run);
})();
