/* Static site build: reads content/*.json and writes the finished site to dist/.
   No dependencies. Run with:  node build.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { renderPage, renderGuide, renderGallery, renderDriverPage, renderReviews, renderAbout, renderBlog, renderPost, blogPosts, LANGS } = require("./src/render.js");

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
  library: read("content/library.json").photos,
  driverPage: read("content/service-driver.json"),
  reviews: read("content/reviews.json").reviews,
  about: read("content/about.json").about,
  blog: read("content/blog.json").posts,
  previewDrafts: process.env.PREVIEW === "1",
  offers: fs.existsSync(path.join(ROOT, "content/offers.json")) ? read("content/offers.json").offers : [],
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
  fs.mkdirSync(path.join(OUT, lang, "offers"), { recursive: true });
  fs.writeFileSync(path.join(OUT, lang, "offers", "index.html"), renderPage(lang, content, "offers"));
  fs.mkdirSync(path.join(OUT, lang, "guide"), { recursive: true });
  fs.writeFileSync(path.join(OUT, lang, "guide", "index.html"), renderGuide(lang, content));
  fs.mkdirSync(path.join(OUT, lang, "gallery"), { recursive: true });
  fs.writeFileSync(path.join(OUT, lang, "gallery", "index.html"), renderGallery(lang, content));
  fs.mkdirSync(path.join(OUT, lang, "private-driver-cairo"), { recursive: true });
  fs.writeFileSync(path.join(OUT, lang, "private-driver-cairo", "index.html"), renderDriverPage(lang, content));
  fs.mkdirSync(path.join(OUT, lang, "reviews"), { recursive: true });
  fs.writeFileSync(path.join(OUT, lang, "reviews", "index.html"), renderReviews(lang, content));
  fs.mkdirSync(path.join(OUT, lang, "about"), { recursive: true });
  fs.writeFileSync(path.join(OUT, lang, "about", "index.html"), renderAbout(lang, content));
  fs.mkdirSync(path.join(OUT, lang, "blog"), { recursive: true });
  fs.writeFileSync(path.join(OUT, lang, "blog", "index.html"), renderBlog(lang, content));
  for (const post of blogPosts(content, lang)) {
    fs.mkdirSync(path.join(OUT, lang, "blog", post.slug), { recursive: true });
    fs.writeFileSync(path.join(OUT, lang, "blog", post.slug, "index.html"), renderPost(lang, content, post));
  }
}

fs.copyFileSync(path.join(ROOT, "src/style.css"), path.join(OUT, "assets/style.css"));
fs.writeFileSync(path.join(OUT, "assets/app.js"),
  fs.readFileSync(path.join(ROOT, "src/shared.js"), "utf8") + "\n" + fs.readFileSync(path.join(ROOT, "src/client.js"), "utf8"));
fs.cpSync(path.join(ROOT, "public"), OUT, { recursive: true });
// Drivers control panel (fleet/README.md): served at /fleet/, not linked from the site
fs.cpSync(path.join(ROOT, "fleet/dashboard"), path.join(OUT, "fleet"), { recursive: true });
fs.copyFileSync(path.join(ROOT, "fleet/firebase-config.json"), path.join(OUT, "fleet/firebase-config.json"));
{
  // A new address on every build, so a phone (or the home-screen app) never keeps an old copy of the panel
  const v = "?v=" + content.version;
  const page = path.join(OUT, "fleet/index.html");
  fs.writeFileSync(page, fs.readFileSync(page, "utf8").replace('href="style.css"', 'href="style.css' + v + '"').replace('src="app.js"', 'src="app.js' + v + '"'));
  const app = path.join(OUT, "fleet/app.js");
  fs.writeFileSync(app, fs.readFileSync(app, "utf8").replace('from "./maps.js"', 'from "./maps.js' + v + '"'));
}
const pixelId = (content.settings.tiktok_pixel_id || "").replace(/[^A-Za-z0-9]/g, "");
if (pixelId) fs.writeFileSync(path.join(OUT, "tiktok-pixel.js"), fs.readFileSync(path.join(ROOT, "src/tiktok-pixel.js"), "utf8").replace("__PIXEL_ID__", pixelId));
if (fs.existsSync(path.join(ROOT, "media"))) fs.cpSync(path.join(ROOT, "media"), path.join(OUT, "media"), { recursive: true });
// The root address shows the Arabic home page itself (no redirect), with its canonical set to /ar/
fs.writeFileSync(path.join(OUT, "index.html"), renderPage("ar", content));

const base = (content.settings.site_url || "").replace(/\/$/, "");
const TODAY = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(OUT, "sitemap.xml"),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
  + ["", "offers/", "north-coast/", "guide/", "gallery/", "private-driver-cairo/", "reviews/", "about/", "blog/"].map(pg => LANGS.map(l => "  <url><loc>" + base + "/" + l + "/" + pg + "</loc><lastmod>" + TODAY + "</lastmod>" + LANGS.map(k => '<xhtml:link rel="alternate" hreflang="' + k + '" href="' + base + "/" + k + "/" + pg + '"/>').join("") + "</url>").join("\n")).join("\n")
  + "\n</urlset>\n");
fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nAllow: /\nDisallow: /fleet/\nSitemap: " + base + "/sitemap.xml\n");

// published articles go into the sitemap too (one entry per language that has the article)
const postUrls = content.blog.filter(p => !p.draft).flatMap(p => LANGS.filter(l => p.body && p.body[l]).map(l => ({ l, slug: p.slug })));
const postLocs = postUrls.map(u => "  <url><loc>" + base + "/" + u.l + "/blog/" + u.slug + "/</loc><lastmod>" + TODAY + "</lastmod></url>").join("\n");
if (postLocs) {
  const sm = fs.readFileSync(path.join(OUT, "sitemap.xml"), "utf8").replace("\n</urlset>", "\n" + postLocs + "\n</urlset>");
  fs.writeFileSync(path.join(OUT, "sitemap.xml"), sm);
}
console.log("Built " + LANGS.length + " pages into dist/");
