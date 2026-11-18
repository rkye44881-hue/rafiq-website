/* Reads a translated encyclopedia file (content/encyclopedia/<lang>.txt) into the structure the page renders.
   One line per item:  SUB|text   (subtitle)   FRONT|text   (intro line)   CH|n|title   (chapter)   SEC|n.m|title   (section)   P|text   (paragraph) */
"use strict";
function parseEncyclopedia(text) {
  const out = { subtitle: "", front: [], chapters: [] };
  let ch = null, sec = null;
  text.split("\n").forEach(raw => {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) return;
    const cut = line.indexOf("|");
    const tag = line.slice(0, cut), rest = line.slice(cut + 1);
    if (tag === "SUB") out.subtitle = rest;
    else if (tag === "FRONT") out.front.push(rest);
    else if (tag === "CH") { const [n, ...t] = rest.split("|"); ch = { num: Number(n), title: t.join("|"), blocks: [], sections: [] }; out.chapters.push(ch); sec = null; }
    else if (tag === "SEC") { const [n, ...t] = rest.split("|"); sec = { num: n, title: t.join("|"), blocks: [] }; if (ch) ch.sections.push(sec); }
    else if (tag === "P") { if (sec) sec.blocks.push(rest); else if (ch) ch.blocks.push(rest); }
  });
  return out;
}
module.exports = { parseEncyclopedia };
