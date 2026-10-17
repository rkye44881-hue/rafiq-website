/* Builds the full HTML page for one language from the content files. */
"use strict";
const { esc, md, arDigits, waLink, prettyPhone, ic, scene, carSvg, skyline, rMark } = require("./shared.js");

const LANGS = ["ar", "en", "fr", "de"];
const LANG_BTN = { ar: "ع", en: "EN", fr: "FR", de: "DE" };
const HTML_LANG = { ar: "ar", en: "en", fr: "fr", de: "de" };
const NAV_IDS = ["s-services", "s-explore", "s-cities", "s-fleet", "s-steps", "s-faq", "s-contact"];
const SVC_ICONS = { driver: "wheel", airport: "plane", yourday: "compass", tours: "pyramid", intercity: "route" };
const CAT_ICONS = { villages: "pin", hotels: "bed", restaurants: "fork", beaches: "wave", events: "music", trips: "route", museums: "museum", sites: "pyramid", mosques: "mosque", malls: "bag", parks: "tree", markets: "lamp", tours: "compass" };
const CITY_SCENES = { cairo: "giza", alex: "alex", sahel: "sahel", egypt: "road" };
const PROM_ICONS = ["tag", "clock", "car", "shield", "swap", "pin"];
const TRUST_ICONS = ["pin", "route", "tag", "chat"];
const CALC_AND = { ar: " و", en: " ", fr: " ", de: " " };
const CALC_MIN = { ar: "دقيقة", en: "min", fr: "min", de: "Min." };
const SAHEL_WA = {
  ar: { hello: "مرحبًا {B}، أريد حجز عربية بسائق في الساحل الشمالي.", calc: "مرحبًا {B}، أريد توصيلة من {from} إلى {to}. التاريخ: \nعدد الركاب: " },
  en: { hello: "Hello {B}, I'd like a car with driver on the North Coast.", calc: "Hello {B}, I'd like a transfer from {from} to {to}. Date: \nPassengers: " },
  fr: { hello: "Bonjour {B}, je souhaite une voiture avec chauffeur sur la Côte Nord.", calc: "Bonjour {B}, je souhaite un transfert de {from} à {to}. Date : \nPassagers : " },
  de: { hello: "Hallo {B}, ich möchte ein Auto mit Fahrer an der Nordküste.", calc: "Hallo {B}, ich möchte einen Transfer von {from} nach {to}. Datum: \nPersonen: " }
};

function renderPage(lang, c, page) {
  page = page || "home";
  const sahel = page === "sahel";
  const ar = lang === "ar";
  const L = c.labels[lang], X = c.text[lang], set = c.settings;
  const brand = ar ? set.brand_ar : set.brand_latin;
  const fill = s => String(s).split("{B}").join(brand);
  const wa = text => waLink(set.whatsapp, fill(text));
  const num = n => arDigits(n, lang);
  const arrow = ar ? " ←" : " →";
  const img = (src, alt) => src ? '<img src="' + esc(src) + '" alt="' + esc(alt || "") + '" loading="lazy">' : "";
  const secHead = s => '<div class="sec-head"><p class="eyebrow">' + esc(s.eyebrow) + '</p><h2>' + md(s.title) + '</h2>' + (s.intro ? '<p>' + esc(s.intro) + '</p>' : '') + '</div>';
  const services = c.services.filter(s => s.visible);
  const NC = c.northcoast, N = NC.text[lang];

  const header = () => {
    const logo = '<a class="logo" href="/' + lang + '/">' + rMark() + '<span class="l1">' + esc(ar ? set.brand_ar : set.brand_latin.toUpperCase()) + '</span><span class="l2">' + esc(ar ? set.brand_latin.toUpperCase() : set.brand_ar) + '</span></a>';
    const pre = sahel ? "/" + lang + "/" : "";
    const sahelLink = '<a class="nav-sahel" href="/' + lang + '/north-coast/"' + (sahel ? ' aria-current="page"' : '') + '>' + esc(N.nav) + '</a>';
    const nav = '<nav class="nav" id="nav">' + L.nav.map((n, i) => '<a href="' + pre + '#' + NAV_IDS[i] + '">' + esc(n) + '</a>').join("") + sahelLink + '</nav>';
    const langs = '<div class="langs" role="group" aria-label="Language">' + LANGS.map(k => '<a class="lang-pick" href="/' + k + '/' + (sahel ? 'north-coast/' : '') + '" hreflang="' + k + '" aria-current="' + (k === lang ? "true" : "false") + '">' + LANG_BTN[k] + '</a>').join("") + '</div>';
    return '<header class="hdr" id="hdr"><div class="wrap">' + logo + nav + langs
      + '<a class="btn btn-acc btn-wa-h" target="_blank" rel="noopener" href="' + wa(L.wa.hello) + '">' + ic("chat") + esc(L.whatsapp) + '</a>'
      + '<button class="menu-btn" type="button" id="menuBtn" aria-expanded="false">' + esc(L.menu) + '</button></div></header>';
  };

  const pills = '<div class="hero-pills">' + X.highlights.map((t, i) => '<span>' + ic(TRUST_ICONS[i % 4]) + esc(t) + '</span>').join("") + '</div>';
  const ctas = '<div class="ctas"><a class="btn btn-acc" target="_blank" rel="noopener" href="' + wa(L.wa.hello) + '">' + ic("chat") + esc(X.hero.button_1) + '</a><a class="btn btn-ghost" href="#s-services">' + esc(X.hero.button_2) + '</a></div>';
  const heroText = '<div><p class="eyebrow">' + esc(X.hero.eyebrow) + '</p><h1>' + md(X.hero.title) + '</h1><p class="sub">' + esc(X.hero.subtitle) + '</p>' + ctas + pills + '</div>';
  const hero = ar
    ? '<section class="hero-ar pattern" id="top"><div class="wrap"><div class="grid">' + heroText
      + '<div class="arch">' + ((set.hero_image_tall || set.hero_image) ? img(set.hero_image_tall || set.hero_image, X.hero.title) : scene("giza")) + (X.hero.photo_caption ? '<div class="tag">' + ic("pin") + '<span>' + md(fill(X.hero.photo_caption)).replace(/<em>(.*?)<\/em>/g, "<b>$1</b>") + '</span></div>' : '') + '</div></div></div></section>'
    : '<section class="hero-lt" id="top"><div class="scene">' + (set.hero_image ? img(set.hero_image, X.hero.title) : scene("giza")) + '</div><div class="veil"></div><div class="wrap">' + heroText + '</div></section>';

  const explore = () => {
    const visCount = id => id === "tours" ? c.tours.filter(t => t.visible).length : (c.places[id] || []).filter(p => p.visible).length;
    const cats = X.categories.filter(cat => visCount(cat.id) > 0).map(cat => '<button type="button" class="ex-cat" data-cat="' + cat.id + '" aria-expanded="false" aria-pressed="false"><span class="ic">' + ic(CAT_ICONS[cat.id] || "pin") + '</span><b>' + esc(cat.name) + '</b><small>' + esc(L.explore.count.replace("{n}", num(visCount(cat.id)))) + '</small><i class="chev" aria-hidden="true"></i></button>').join("");
    return '<section class="sec" id="s-explore"><div class="wrap">' + secHead(X.sections.explore) + '<div class="ex-cats" id="exCats" role="group">' + cats + '<div class="ex-panel" id="exPanel" hidden></div></div><div id="exTray"></div></div></section>';
  };

  const booking = () => {
    const B = L.book;
    const f = (id, lab, inp) => '<div class="fld"><label for="' + id + '">' + esc(lab) + '</label>' + inp + '</div>';
    const opts = services.map(s => '<option value="' + s.id + '">' + esc(s["title_" + lang]) + '</option>').join("");
    return '<section class="bk-sec" id="s-book"><div class="wrap"><details class="bookbox" id="bookBox"><summary><span class="bk-ic">' + ic("car") + '</span><span class="bk-t"><b>' + esc(B.title) + '</b><small>' + esc(B.note) + '</small></span><span class="bk-chev" aria-hidden="true"></span></summary>'
      + '<form class="book-ar" id="bookForm"><div class="bk-tabs" role="group">' + L.bookTabs.filter(([k]) => services.some(s => s.id === k)).map(([k, t], i) => '<button type="button" data-bt="' + k + '" aria-pressed="' + (i === 0) + '">' + esc(t) + '</button>').join("") + '</div><div class="fields">'
      + f("bk-svc", B.svc, '<select id="bk-svc">' + opts + '</select>')
      + f("bk-from", B.from, '<input id="bk-from" type="text" placeholder="' + esc(B.fromPh) + '">')
      + f("bk-to", B.to, '<input id="bk-to" type="text" placeholder="' + esc(B.toPh) + '">')
      + f("bk-name", B.name, '<input id="bk-name" type="text" placeholder="' + esc(B.namePh) + '">')
      + f("bk-date", B.date, '<input id="bk-date" type="date">')
      + f("bk-time", B.time, '<input id="bk-time" type="time" value="09:00">')
      + f("bk-pax", B.pax, '<select id="bk-pax">' + [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14].map(n => '<option>' + n + '</option>').join("") + '</select>')
      + '<div class="fld" style="align-self:end"><a class="btn btn-acc" id="bk-send" target="_blank" rel="noopener" href="' + wa(L.wa.hello) + '">' + ic("chat") + esc(B.send) + '</a></div></div></form></details></div></section>';
  };

  const servicesSec = () => '<section class="sec" id="s-services"><div class="wrap">' + secHead(X.sections.services) + '<div class="svc-cards">'
    + services.map(s => '<article class="svc-card' + (s.id === "yourday" ? " feat" : "") + '"><div class="ic">' + ic(SVC_ICONS[s.id] || "car") + '</div><h3>' + esc(s["title_" + lang]) + '</h3><p>' + esc(s["desc_" + lang]) + '</p><ul>' + (s["points_" + lang] || []).map(p => '<li>' + esc(p) + '</li>').join("") + '</ul><a class="go" target="_blank" rel="noopener" href="' + wa(L.wa.service.replace("{t}", s["title_" + lang])) + '">' + esc(L.serviceLink) + arrow + '</a></article>').join("")
    + '</div></div></section>';

  const cities = () => '<section class="sec dark-band" id="s-cities"><div class="wrap">' + secHead(X.sections.cities) + '<div class="cities">'
    + X.cities.map(ct => '<article class="city"><div class="pic">' + ((set.city_images || {})[ct.id] ? img(set.city_images[ct.id], ct.name) : scene(CITY_SCENES[ct.id] || "road")) + '</div><div class="tx"><h3>' + esc(ct.name) + '</h3><p>' + esc(ct.description) + '</p><div class="chips">' + (ct.chips || []).map(x => '<span>' + esc(x) + '</span>').join("") + '</div>' + (ct.id === "sahel" ? '<a class="city-more" href="/' + lang + '/north-coast/">' + esc(N.more) + arrow + '</a>' : '') + '</div></article>').join("")
    + '</div></div></section>';

  const fleet = () => '<section class="sec" id="s-fleet"><div class="wrap">' + secHead(X.sections.fleet) + '<div class="fleet">'
    + c.fleet.map(f => '<article class="car"><div class="shot">' + (f.image ? img(f.image, f["name_" + lang]) : skyline() + '<div class="cv">' + carSvg(f.id) + '</div>') + '</div><div class="ct"><h3>' + esc(f["name_" + lang]) + '</h3><div class="spec"><span>' + ic("user") + num(f.seats) + ' ' + esc(L.seats) + '</span><span>' + ic("bag") + num(f.bags) + ' ' + esc(L.bags) + '</span></div><p>' + esc(f["desc_" + lang]) + '</p></div></article>').join("")
    + '</div></div></section>';

  const steps = () => '<section class="sec dark-band" id="s-steps"><div class="wrap">' + secHead(X.sections.steps) + '<div class="steps">'
    + X.steps.map((s, i) => '<div class="step"><span class="n">' + num(i + 1) + '</span><h3>' + esc(s.title) + '</h3><p>' + esc(s.description) + '</p></div>').join("")
    + '</div></div></section>';

  const promises = () => '<section class="sec" id="s-promise"><div class="wrap">' + secHead(X.sections.promises) + '<div class="prom">'
    + X.promises.map((p, i) => '<div class="pr">' + ic(PROM_ICONS[i % PROM_ICONS.length]) + '<div><h3>' + esc(p.title) + '</h3><p>' + esc(p.description) + '</p></div></div>').join("")
    + '</div></div></section>';

  const faq = (head, list) => '<section class="sec" id="s-faq" style="padding-top:0"><div class="wrap faq-grid">' + secHead(head || X.sections.faq) + '<div class="faq">'
    + (list || X.faq).map((f, i) => '<details' + (i === 0 ? " open" : "") + '><summary>' + esc(f.question) + '</summary><p>' + esc(f.answer) + '</p></details>').join("")
    + '</div></div></section>';

  const contact = () => {
    const C = L.contact, phone = prettyPhone(set.whatsapp);
    return '<section class="sec dark-band contact" id="s-contact"><div class="wrap">' + secHead(X.sections.contact) + '<div class="grid">'
      + '<div class="cbox"><span class="k">' + esc(C.wa) + '</span><span class="v">' + esc(phone) + '</span><div class="acts"><a class="btn btn-acc" target="_blank" rel="noopener" href="' + wa(L.wa.hello) + '">' + ic("chat") + esc(C.open) + '</a><button class="btn btn-ghost" type="button" data-copy="' + esc(phone) + '">' + ic("copy") + '<span>' + esc(C.copy) + '</span></button></div></div>'
      + '<div class="cbox"><span class="k">' + esc(C.email) + '</span><span class="v">' + esc(set.email) + '</span><div class="acts"><a class="btn btn-ghost" href="mailto:' + esc(set.email) + '">' + ic("mail") + esc(C.mail) + '</a><button class="btn btn-ghost" type="button" data-copy="' + esc(set.email) + '">' + ic("copy") + '<span>' + esc(C.copy) + '</span></button></div></div>'
      + '</div></div></section>';
  };

  const footer = () => '<footer class="foot"><div class="wrap"><span class="logo">' + rMark() + '<span class="l1">' + esc(ar ? set.brand_ar : set.brand_latin.toUpperCase()) + '</span></span><span>© ' + new Date().getFullYear() + ' ' + esc(brand) + '. ' + esc(X.footer) + '</span><span>' + esc(prettyPhone(set.whatsapp)) + ' · ' + esc(set.email) + '</span></div></footer>'
    + '<a class="fab" target="_blank" rel="noopener" href="' + wa(L.wa.hello) + '" aria-label="WhatsApp">' + ic("chat") + '<span>' + esc(L.whatsapp) + '</span></a>';

  /* ---------- North Coast page ---------- */
  const ZN = z => ar ? z.name_ar : z.name_en;
  const ncPlaces = Object.fromEntries(Object.entries(NC.places).map(([k, list]) => [k, list.filter(p => p.visible).map(p => ({ n: ar ? p.name_ar : p.name_en, a: ar ? "" : p.name_ar, area: ar ? p.area_ar : p.area_en, g: p.zone, t: "", img: p.image || "", d: p["desc_" + lang] || "" }))]));
  const sHero = () => '<section class="hero-lt hero-nc" id="top"><div class="scene">' + (NC.hero_image ? '<img src="' + esc(NC.hero_image) + '" alt="' + esc(N.hero.eyebrow) + '">' : scene("sahel")) + '</div><div class="veil"></div><div class="wrap"><div><p class="eyebrow">' + esc(N.hero.eyebrow) + '</p><h1>' + md(N.hero.title) + '</h1><p class="sub">' + esc(N.hero.subtitle) + '</p>'
    + '<div class="ctas"><a class="btn btn-acc" target="_blank" rel="noopener" href="' + wa(SAHEL_WA[lang].hello) + '">' + ic("chat") + esc(N.hero.button_1) + '</a><a class="btn btn-ghost" href="#s-calc">' + esc(N.hero.button_2) + '</a></div>'
    + '<div class="hero-pills">' + N.highlights.map((t, i) => '<span>' + ic(["car", "route", "pin", "tag"][i % 4]) + esc(t) + '</span>').join("") + '</div></div></div></section>';
  const SICON = { day: "wheel", transfer: "route", airport: "plane", family: "user", night: "music" };
  const sServices = () => '<section class="sec" id="s-services"><div class="wrap">' + secHead(N.services) + '<div class="svc-cards">'
    + N.services.items.map(s => '<article class="svc-card' + (s.id === "day" ? " feat" : "") + '"><div class="ic">' + ic(SICON[s.id] || "car") + '</div><h3>' + esc(s.title) + '</h3><p>' + esc(s.desc) + '</p><ul>' + s.points.map(p => '<li>' + esc(p) + '</li>').join("") + '</ul><a class="go" target="_blank" rel="noopener" href="' + wa(L.wa.service.replace("{t}", s.title)) + '">' + esc(L.serviceLink) + arrow + '</a></article>').join("")
    + '</div></div></section>';
  const sCalc = () => { const K = N.calc; return '<section class="sec dark-band" id="s-calc"><div class="wrap calc-wrap">' + secHead(K) + '<form class="calc" onsubmit="return false">'
    + '<div class="fld"><label for="calc-from">' + esc(K.from_) + '</label><select id="calc-from">' + Object.entries(K.origins).map(([k, v]) => '<option value="' + k + '">' + esc(v) + '</option>').join("") + '</select></div>'
    + '<div class="fld"><label for="calc-to">' + esc(K.to) + '</label><select id="calc-to">' + NC.zones.map(z => '<option value="' + z.id + '">' + esc(ZN(z)) + '</option>').join("") + '</select></div>'
    + '<p class="calc-out" id="calc-out" aria-live="polite"></p><a class="btn btn-acc" id="calc-send" target="_blank" rel="noopener" href="' + wa(SAHEL_WA[lang].hello) + '">' + ic("chat") + esc(K.send) + '</a></form></div></section>'; };
  const fmtH = h => { const H = Math.floor(h), M = Math.round((h - H) * 60); return (H ? (ar && H < 3 ? ["", "ساعة", "ساعتين"][H] : num(H) + " " + (H > 1 && H < 11 ? N.calc.hours : N.calc.hour)) : "") + (M ? (H ? CALC_AND[lang] : "") + num(M) + " " + CALC_MIN[lang] : ""); };
  const sCoast = () => '<section class="sec" id="s-coast"><div class="wrap">' + secHead(N.coast) + '<ol class="coast">'
    + NC.zones.map(z => '<li class="zone"><span class="dot" aria-hidden="true"></span><h3>' + esc(ZN(z)) + '</h3><p class="times"><span>' + ic("clock") + esc(N.coast.fromCairo) + ': ' + fmtH(z.hours.cairo) + '</span><span>' + ic("clock") + esc(N.coast.fromAlex) + ': ' + fmtH(z.hours.alex) + '</span></p><div class="chips">'
      + NC.places.villages.filter(v => v.visible && v.zone === z.id).map(v => '<a target="_blank" rel="noopener" href="' + wa(L.wa.place.replace("{p}", ar ? v.name_ar : v.name_en)) + '">' + esc(ar ? v.name_ar : v.name_en) + '</a>').join("") + '</div></li>').join("")
    + '</ol></div></section>';
  const sExplore = () => { const cnt = id => (ncPlaces[id] || []).length;
    const cats = N.categories.filter(k => cnt(k.id) > 0).map(k => '<button type="button" class="ex-cat" data-cat="' + k.id + '" aria-expanded="false" aria-pressed="false"><span class="ic">' + ic(CAT_ICONS[k.id] || "pin") + '</span><b>' + esc(k.name) + '</b><small>' + esc(L.explore.count.replace("{n}", num(cnt(k.id)))) + '</small><i class="chev" aria-hidden="true"></i></button>').join("");
    return '<section class="sec" id="s-explore"><div class="wrap">' + secHead(N.explore) + '<div class="ex-cats" id="exCats" role="group">' + cats + '<div class="ex-panel" id="exPanel" hidden></div></div><div id="exTray"></div></div></section>'; };
  const sTips = () => '<section class="sec dark-band" id="s-tips"><div class="wrap">' + secHead(N.tips) + '<div class="prom tips">'
    + N.tips.items.map((p, i) => '<div class="pr">' + ic(["clock", "shield", "fork", "music", "wave"][i % 5]) + '<div><h3>' + esc(p.title) + '</h3><p>' + esc(p.description) + '</p></div></div>').join("") + '</div></div></section>';

  /* data the browser script needs for the explorer and booking form */
  const clientData = sahel ? {
    lang, brand, whatsapp: set.whatsapp,
    labels: Object.assign({}, L, { explore: Object.assign({}, L.explore, { gov: Object.fromEntries(NC.zones.map(z => [z.id, ZN(z)])) }) }),
    categories: N.categories, places: ncPlaces, tours: [], govs: NC.zones.map(z => z.id),
    calc: { zones: NC.zones.map(z => ({ id: z.id, hours: z.hours })), result: N.calc.result, hour: N.calc.hour, hours: N.calc.hours, and: CALC_AND[lang], min: CALC_MIN[lang], msg: SAHEL_WA[lang].calc }
  } : {
    lang, brand, whatsapp: set.whatsapp, labels: L,
    categories: X.categories,
    places: Object.fromEntries(Object.entries(c.places).map(([k, list]) => [k, list.filter(p => p.visible).map(p => ({ n: ar ? p.name_ar : p.name_en, a: ar ? "" : p.name_ar, area: ar ? p.area_ar : p.area_en, g: p.governorate, t: p.type || "", img: p.image || "" }))])),
    tours: c.tours.filter(t => t.visible).map(t => ({ n: t["title_" + lang], d: t["desc_" + lang], h: t.hours, price: t.price || "", city: (X.cities.find(x => x.id === t.city) || {}).name || "", img: t.image || "" }))
  };

  const base = (set.site_url || "").replace(/\/$/, "");
  const seo = (sahel ? N.seo : X.seo) || {};
  const path = sahel ? "north-coast/" : "";
  const desc = seo.description || X.hero.subtitle;
  const title = seo.title || (ar ? set.brand_ar + " | " : set.brand_latin + " | ") + X.hero.eyebrow;
  const OG_LOCALE = { ar: "ar_EG", en: "en_US", fr: "fr_FR", de: "de_DE" };
  const ld = obj => '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, "\\u003c") + '</script>';
  const business = {
    "@context": "https://schema.org", "@type": "LocalBusiness", "@id": base + "/#business",
    name: set.brand_latin, alternateName: set.brand_ar, description: desc, url: base + "/" + lang + "/" + path,
    telephone: "+" + String(set.whatsapp).replace(/\D/g, ""), email: set.email,
    image: set.hero_image ? base + set.hero_image : undefined, logo: base + "/favicon.svg",
    address: { "@type": "PostalAddress", addressLocality: "Cairo", addressCountry: "EG" },
    areaServed: ["Cairo", "Giza", "Alexandria", "North Coast", "Egypt"].map(n => ({ "@type": "Place", name: n })),
    knowsLanguage: ["ar", "en", "fr", "de"], openingHours: "Mo-Su 00:00-23:59",
    makesOffer: services.map(s => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: s["title_" + lang], description: s["desc_" + lang] } }))
  };
  const faqLd = { "@context": "https://schema.org", "@type": "FAQPage", inLanguage: lang,
    mainEntity: (sahel ? N.faq.items : X.faq).map(f => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) };
  const head = '<!doctype html><html lang="' + HTML_LANG[lang] + '" dir="' + (ar ? "rtl" : "ltr") + '" data-site="' + (ar ? "ar" : "lt") + '"><head>'
    + '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + (set.google_verification ? '<meta name="google-site-verification" content="' + esc(set.google_verification) + '">' : '')
    + '<title>' + esc(title) + '</title><meta name="description" content="' + esc(desc) + '">'
    + LANGS.map(k => '<link rel="alternate" hreflang="' + k + '" href="' + base + '/' + k + '/' + path + '">').join("") + '<link rel="alternate" hreflang="x-default" href="' + base + '/en/' + path + '">'
    + '<link rel="canonical" href="' + base + '/' + lang + '/' + path + '">'
    + '<meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(desc) + '"><meta property="og:type" content="website"><meta property="og:url" content="' + base + '/' + lang + '/' + path + '"><meta property="og:site_name" content="' + esc(set.brand_latin) + '"><meta property="og:locale" content="' + OG_LOCALE[lang] + '">' + ((sahel ? NC.hero_image : set.hero_image) ? '<meta property="og:image" content="' + esc(base + (sahel ? NC.hero_image : set.hero_image)) + '"><meta name="twitter:card" content="summary_large_image">' : '')
    + '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#1B2B57">'
    + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&family=Reem+Kufi:wght@400..700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">'
    + '<link rel="stylesheet" href="/assets/style.css?v=' + c.version + '">'
    + ld(business) + ld(faqLd)
    + '</head><body>';

  const body = sahel
    ? sHero() + sServices() + sCalc() + sCoast() + sExplore() + sTips() + faq(N.faq, N.faq.items) + contact()
    : hero + explore() + booking() + servicesSec() + cities() + fleet() + steps() + promises() + faq() + contact();
  return head + '<div id="site" class="' + (ar ? "ar" : "lt") + (sahel ? " page-nc" : "") + '">' + header() + body + footer() + '</div>'
    + '<script type="application/json" id="data">' + JSON.stringify(clientData).replace(/</g, "\\u003c") + '</script>'
    + '<script src="/assets/app.js?v=' + c.version + '" defer></script></body></html>';
}

module.exports = { renderPage, LANGS };
