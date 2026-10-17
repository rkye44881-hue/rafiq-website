/* Static site build: reads content/*.json and writes the finished site to dist/.
   No dependencies. Run with:  node build.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { renderPage, renderGuide, LANGS } = require("./src/render.js");

const ROOT = __dirname;
const OUT = path.join(ROOT, "dist");
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const content = {
  version: Date.now().toString(36),
  settings: read("content/settings.json"),
  places: read("content/places.json"),
  tours: read("content/tours.json").tours,
  fleet: read("content/fleet.json").cars,
  services: read("content/services.json").services,
  northcoast: read("content/northcoast.json"),
  guide: read("content/guide.json"),
  text: Object.fromEntries(LANGS.map(l => [l, read("content/text/" + l + ".json")])),
  labels: Object.fromEntries(LANGS.map(l => [l, read("src/labels/" + l + ".json")]))
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });

for (const lang of LANGS) {
  fs.mkdirSync(path.join(OUT, lang), { recursive: true });
  fs.writeFileSync(path.join(OUT, lang, "index.html"), renderPage(lang, content));
  fs.mkdirSync(path.join(OUT, lang, "north-coast"), { recursive: true });
  fs.writeFileSync(path.join(OUT, lang, "north-coast", "index.html"), renderPage(lang, content, "sahel"));
  fs.mkdirSync(path.join(OUT, lang, "guide"), { recursive: true });
  fs.writeFileSync(path.join(OUT, lang, "guide", "index.html"), renderGuide(lang, content));
}

fs.copyFileSync(path.join(ROOT, "src/style.css"), path.join(OUT, "assets/style.css"));
fs.writeFileSync(path.join(OUT, "assets/app.js"),
  fs.readFileSync(path.join(ROOT, "src/shared.js"), "utf8") + "\n" + fs.readFileSync(path.join(ROOT, "src/client.js"), "utf8"));
fs.cpSync(path.join(ROOT, "public"), OUT, { recursive: true });
if (fs.existsSync(path.join(ROOT, "media"))) fs.cpSync(path.join(ROOT, "media"), path.join(OUT, "media"), { recursive: true });

const base = (content.settings.site_url || "").replace(/\/$/, "");
fs.writeFileSync(path.join(OUT, "sitemap.xml"),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
  + ["", "north-coast/", "guide/"].map(pg => LANGS.map(l => "  <url><loc>" + base + "/" + l + "/" + pg + "</loc>" + LANGS.map(k => '<xhtml:link rel="alternate" hreflang="' + k + '" href="' + base + "/" + k + "/" + pg + '"/>').join("") + "</url>").join("\n")).join("\n")
  + "\n</urlset>\n");
fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nAllow: /\nSitemap: " + base + "/sitemap.xml\n");

console.log("Built " + LANGS.length + " pages into dist/");
