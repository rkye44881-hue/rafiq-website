/* Builds the full HTML page for one language from the content files. */
"use strict";
/* headline words that rise in one after another (each word wrapped at build time, CSS does the motion) */
const kinetic = html => { let i = 0; return html.split(/(<[^>]+>)/).map(part => part.startsWith("<") ? part : part.split(/(\s+)/).map(w => w && !/^\s+$/.test(w) ? '<span class="kw" style="--i:' + (i++) + '">' + w + '</span>' : w).join("")).join(""); };
const { esc, md, arDigits, waLink, prettyPhone, ic, scene, carSvg, skyline, rMark } = require("./shared.js");

const LANGS = ["ar", "en", "fr", "de", "it"];
const LANG_BTN = { ar: "ع", en: "EN", fr: "FR", de: "DE", it: "IT" };
const HTML_LANG = { ar: "ar", en: "en", fr: "fr", de: "de", it: "it" };
const NAV_IDS = ["s-services", "s-explore", "s-cities", "s-fleet", "s-steps", "s-faq", "s-contact"];
const SVC_ICONS = { driver: "wheel", airport: "plane", yourday: "compass", tours: "pyramid", intercity: "route" };
const CAT_ICONS = { villages: "pin", hotels: "bed", restaurants: "fork", beaches: "wave", events: "music", trips: "route", museums: "museum", sites: "pyramid", mosques: "mosque", malls: "bag", parks: "tree", markets: "lamp", tours: "compass" };
const CITY_SCENES = { cairo: "giza", alex: "alex", sahel: "sahel", egypt: "road" };
const PROM_ICONS = ["tag", "clock", "car", "shield", "swap", "pin"];
const TRUST_ICONS = ["pin", "route", "tag", "chat"];
const CALC_AND = { ar: " و", en: " ", fr: " ", de: " ", it: " " };
const CALC_MIN = { ar: "دقيقة", en: "min", fr: "min", de: "Min.", it: "min" };
const SAHEL_WA = {
  ar: { hello: "مرحبًا {B}، أريد حجز عربية بسائق في الساحل الشمالي.", calc: "مرحبًا {B}، أريد توصيلة من {from} إلى {to}. التاريخ: \nعدد الركاب: " },
  en: { hello: "Hello {B}, I'd like a car with driver on the North Coast.", calc: "Hello {B}, I'd like a transfer from {from} to {to}. Date: \nPassengers: " },
  it: { hello: "Ciao {B}, vorrei un'auto con autista sulla Costa Nord.", calc: "Ciao {B}, vorrei un transfer da {from} a {to}. Data: \nPasseggeri: " },
  fr: { hello: "Bonjour {B}, je souhaite une voiture avec chauffeur sur la Côte Nord.", calc: "Bonjour {B}, je souhaite un transfert de {from} à {to}. Date : \nPassagers : " },
  de: { hello: "Hallo {B}, ich möchte ein Auto mit Fahrer an der Nordküste.", calc: "Hallo {B}, ich möchte einen Transfer von {from} nach {to}. Datum: \nPersonen: " }
};

/* ---------- Google tag + cookie choice. Nothing is added until settings.ga_id is set.
   Consent Mode v2: Google's tag loads but stores nothing until the visitor accepts. ---------- */
const CONSENT_UI = {
  ar: { text: "بنستخدم كوكيز عشان نفهم الزيارات ونحسن الموقع.", accept: "موافق", reject: "رفض" },
  en: { text: "We use cookies to understand visits and improve the site.", accept: "Accept", reject: "Decline" },
  it: { text: "Usiamo i cookie per capire come viene usato il sito e migliorarlo.", accept: "Accetta", reject: "Rifiuta" },
  fr: { text: "Nous utilisons des cookies pour comprendre les visites et améliorer le site.", accept: "Accepter", reject: "Refuser" },
  de: { text: "Wir verwenden Cookies, um Besuche zu verstehen und die Website zu verbessern.", accept: "Akzeptieren", reject: "Ablehnen" }
};
function analytics(lang, set) {
  const id = (set.ga_id || "").trim();
  const pixel = (set.tiktok_pixel_id || "").replace(/[^A-Za-z0-9]/g, "");
  if (!id && !pixel) return { head: "", body: "" };
  const u = CONSENT_UI[lang];
  const googleHead = !id ? "" : '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}'
    + 'gtag("consent","default",{analytics_storage:"denied",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"});'
    + 'gtag("js",new Date());gtag("config",' + JSON.stringify(id) + ');</script>'
    + '<script async src="https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id) + '"></script>';
  // The TikTok pixel script is sync so ttq exists before the banner script runs; it holds events until consent is granted.
  const tiktokHead = pixel ? '<script src="/tiktok-pixel.js"></script>' : "";
  // Google Ads: WhatsApp and phone taps count as conversions. Uses the same gtag and consent as Analytics.
  const adsSendTo = (set.google_ads_send_to || "").trim();
  const adsHead = !id || !adsSendTo ? "" : '<script>gtag("config",' + JSON.stringify(adsSendTo.split("/")[0]) + ');'
    + 'document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest(\'a[href*="wa.me"], a[href^="tel:"]\');'
    + 'if(a)gtag("event","conversion",{send_to:' + JSON.stringify(adsSendTo) + ',value:1.0,currency:"EGP"})},true);</script>';
  const head = googleHead + adsHead + tiktokHead;
  const body = '<div class="cookie" id="cookie" hidden><p>' + esc(u.text) + '</p><div class="cookie-b">'
    + '<button type="button" data-consent="denied">' + esc(u.reject) + '</button><button type="button" data-consent="granted">' + esc(u.accept) + '</button></div></div>'
    + '<script>(function(){var k="cv-consent",b=document.getElementById("cookie"),c=null;try{c=localStorage.getItem(k)}catch(e){}'
    + 'function update(v){if(window.gtag)gtag("consent","update",{analytics_storage:v,ad_storage:v,ad_user_data:v,ad_personalization:v});'
    + 'if(window.ttq)ttq[v==="granted"?"grantConsent":"revokeConsent"]()}'
    + 'if(c==="granted"||c==="denied")update(c);else b.hidden=false;'
    + 'b.addEventListener("click",function(e){var v=e.target.getAttribute("data-consent");if(!v)return;try{localStorage.setItem(k,v)}catch(err){}update(v);b.hidden=true})})();</script>';
  return { head, body };
}

/* Call numbers in the footer: each one is a tap-to-call link. WhatsApp stays on set.whatsapp. */
const phoneLinks = set => '<bdi dir="ltr">' + (set.phones || []).map(n => '<a href="tel:+' + esc(n) + '">+' + esc(n) + '</a>').join(" · ") + '</bdi>';

/* small footer link to the client reviews page (the page itself is not on the home page) */
const REV_LINK = { ar: "آراء العملاء", en: "Client reviews", fr: "Avis clients", de: "Kundenbewertungen", it: "Recensioni" };
const ABOUT_LINK = { ar: "عنّا", en: "About", fr: "À propos", de: "Über uns", it: "Chi siamo" };
const BLOG_LINK = { ar: "المدونة", en: "Blog", fr: "Blog", de: "Blog", it: "Blog" };
const revLink = lang => '<a class="rev-link" href="/' + lang + '/reviews/">' + REV_LINK[lang] + '</a><a class="rev-link" href="/' + lang + '/about/">' + ABOUT_LINK[lang] + '</a><a class="rev-link" href="/' + lang + '/blog/">' + BLOG_LINK[lang] + '</a>';
/* the founder line shown in every footer */
const FOUNDER_LABEL = { ar: "المؤسس", en: "Founder", fr: "Fondateur", de: "Gründer", it: "Fondatore" };
const founderLine = (set, lang) => '<span>' + esc(FOUNDER_LABEL[lang]) + ': ' + esc(lang === "ar" ? set.founder_ar : set.founder_en) + '</span>';
/* the contact email as a tap-to-write link */
const emailLink = set => '<a href="mailto:' + esc(set.email) + '">' + esc(set.email) + '</a>';
/* Footer links for the social accounts that have a URL in settings (empty ones are skipped) */
/* Photos and short clips of our Jetour T2, shown on every page just above the footer */
const MEDIA_UI = {
  ar: { title: "شوف العربية", alt: "جيتور T2 مع سائق خاص" },
  en: { title: "See the car", alt: "Jetour T2 with a private driver" },
  fr: { title: "Voir la voiture", alt: "Jetour T2 avec chauffeur privé" },
  de: { title: "Das Auto ansehen", alt: "Jetour T2 mit Privatfahrer" },
  it: { title: "Guarda l'auto", alt: "Jetour T2 con autista privato" }
};
/* Photo library: an endless strip of library photos (duplicated once so the loop has no jump) */
const GALLERY_UI = {
  ar: { title: "مكتبة الصور", intro: "صور حقيقية من القاهرة والجيزة والإسكندرية والساحل الشمالي، وعربيات جيتور T2 مع سائق.", more: "كل صورة هنا من رحلاتنا الفعلية. تقدر تشوف العربية، والأماكن اللي بنوصلها، وتحجز سواق خاص لنفس الوجهة من واتساب.", link: "المكتبة كاملة", seoTitle: "مكتبة الصور | رحلة القاهرة", seoDesc: "صور حقيقية من القاهرة والجيزة والإسكندرية والساحل الشمالي، وعربيات جيتور T2 بسائق خاص.", locale: "ar_EG" },
  en: { title: "Photo library", intro: "Real photos from Cairo, Giza, Alexandria and the North Coast, and our Jetour T2 cars with drivers.", more: "Every photo here is from our real trips. See the car, the places we drive to, and book a private driver for the same route on WhatsApp.", link: "See the full library", seoTitle: "Photo library | Cairo Voyage", seoDesc: "Real photos of Cairo, Giza, Alexandria and the North Coast, and our Jetour T2 cars with private drivers.", locale: "en_US" },
  fr: { title: "Photothèque", intro: "De vraies photos du Caire, de Gizeh, d'Alexandrie et de la Côte Nord, et nos Jetour T2 avec chauffeur.", more: "Chaque photo vient de nos trajets réels. Découvrez la voiture et les lieux où nous conduisons, et réservez un chauffeur pour le même trajet sur WhatsApp.", link: "Voir toute la photothèque", seoTitle: "Photothèque | Cairo Voyage", seoDesc: "Vraies photos du Caire, de Gizeh, d'Alexandrie et de la Côte Nord, et nos Jetour T2 avec chauffeur privé.", locale: "fr_FR" },
  de: { title: "Fotogalerie", intro: "Echte Fotos aus Kairo, Gizeh, Alexandria und der Nordküste sowie unsere Jetour T2 mit Fahrer.", more: "Jedes Foto hier stammt von unseren echten Fahrten. Sehen Sie das Auto und die Orte, zu denen wir fahren, und buchen Sie einen Fahrer für dieselbe Strecke per WhatsApp.", link: "Ganze Galerie ansehen", seoTitle: "Fotogalerie | Cairo Voyage", seoDesc: "Echte Fotos von Kairo, Gizeh, Alexandria und der Nordküste und unsere Jetour T2 mit Privatfahrer.", locale: "de_DE" },
  it: { title: "Galleria fotografica", intro: "Foto reali del Cairo, di Giza, Alessandria e della Costa Nord, e le nostre Jetour T2 con autista.", more: "Ogni foto qui viene dai nostri viaggi reali. Guardate l'auto e i luoghi dove guidiamo, e prenotate un autista per lo stesso percorso su WhatsApp.", link: "Guarda tutta la galleria", seoTitle: "Galleria foto | Cairo Voyage", seoDesc: "Foto reali del Cairo, Giza, Alessandria e della Costa Nord, e le nostre Jetour T2 con autista privato.", locale: "it_IT" }
};
const photoCaption = (p, lang) => (p.caption && (p.caption[lang] || p.caption.en)) || "";
function libraryStrip(lang, c) {
  const u = MEDIA_UI[lang], G = GALLERY_UI[lang];
  // a video shows its poster in the strip (no video loads there); the gallery page plays it
  const tile = (p, hidden) => '<img src="' + (p.type === "video" ? "/media/" + p.slug + "-poster-sm.webp" : "/media/library/" + p.slug + "-sm.webp") + '" alt="' + (hidden ? "" : esc(photoCaption(p, lang))) + '" loading="lazy"' + (hidden ? ' aria-hidden="true"' : '') + '>';
  const once = c.library.map(p => tile(p, false)).join("") , twice = c.library.map(p => tile(p, true)).join("");
  return '<section class="sec media-strip" aria-label="' + esc(G.title) + '"><div class="wrap ms-head"><h2 class="ms-title">' + esc(G.title) + '</h2><a class="ms-link" href="/' + lang + '/gallery/">' + esc(G.link) + '</a></div>'
    + '<div class="ms-marquee"><div class="ms-track" style="--n:' + c.library.length + '">' + once + twice + '</div></div></section>';
}

const FOLLOW = { ar: "تابعنا", en: "Follow us", fr: "Suivez-nous", de: "Folgen Sie uns", it: "Seguici" };
function socials(set, lang) {
  const links = [["instagram_url", "Instagram"], ["tiktok_url", "TikTok"], ["facebook_url", "Facebook"], ["x_url", "X"]]
    .filter(([k]) => set[k])
    .map(([k, label]) => '<a href="' + esc(set[k]) + '" target="_blank" rel="noopener">' + label + '</a>').join("");
  return links ? '<div class="soc"><span>' + FOLLOW[lang] + '</span>' + links + '</div>' : "";
}

/* ---------- monthly offers page: interface words per language ---------- */
const OFFERS_UI = {
  ar: { nav: "العروض", title: "عروض رحلة القاهرة", intro: "عروض لفترة محدودة على سيارة بسائق خاص. احجز قبل ما العرض يخلص.", past: "عروض سابقة", ended: "انتهى", ends: "ينتهي {d}", endedOn: "انتهى {d}", left: "باقي {n} يوم", last: "آخر يوم في العرض!", book: "احجز العرض على واتساب", msg: "مرحبًا {B}، أريد حجز العرض: {t}", emptyT: "عروض جديدة قريبًا ✨", emptyP: "اسألنا على واتساب عن أفضل سعر لرحلتك.", emptyBtn: "اسألنا على واتساب", strip: "🔥 {t} بـ {p}", off: "خصم", seoTitle: "عروض رحلة القاهرة | خصومات سائق خاص في القاهرة", seoDesc: "عروض شهرية على سيارة بسائق خاص في القاهرة: خصومات لفترة محدودة، سعر ثابت شامل الضريبة والخدمة، والحجز على واتساب.", locale: "ar-EG" },
  en: { nav: "Offers", title: "Cairo Voyage offers", intro: "Limited-time deals on a private car with driver. Book before the offer ends.", past: "Past offers", ended: "Ended", ends: "Ends {d}", endedOn: "Ended {d}", left: "{n} days left", last: "Last day of the offer!", book: "Book this offer on WhatsApp", msg: "Hello {B}, I'd like to book the offer: {t}", emptyT: "New offers coming soon ✨", emptyP: "Ask us on WhatsApp for the best price for your trip.", emptyBtn: "Ask on WhatsApp", strip: "🔥 {t} for {p}", off: "off", seoTitle: "Offers | Private driver deals in Cairo | Cairo Voyage", seoDesc: "Monthly deals on a private car with driver in Cairo: limited-time discounts, fixed price with taxes and service included, book on WhatsApp.", locale: "en-GB" },
  it: { nav: "Offerte", title: "Offerte Cairo Voyage", intro: "Offerte a tempo limitato su un'auto privata con autista. Prenota prima che l'offerta finisca.", past: "Offerte passate", ended: "Terminata", ends: "Termina il {d}", endedOn: "Terminata il {d}", left: "Mancano {n} giorni", last: "Ultimo giorno dell'offerta!", book: "Prenota questa offerta su WhatsApp", msg: "Ciao {B}, vorrei prenotare l'offerta: {t}", emptyT: "Nuove offerte in arrivo ✨", emptyP: "Chiedici su WhatsApp il prezzo migliore per il tuo viaggio.", emptyBtn: "Chiedi su WhatsApp", strip: "🔥 {t} a {p}", off: "di sconto", seoTitle: "Offerte | Autista privato al Cairo | Cairo Voyage", seoDesc: "Offerte mensili su un'auto privata con autista al Cairo: sconti a tempo limitato, prezzo fisso con tasse e servizio inclusi, prenota su WhatsApp.", locale: "it-IT" },
  fr: { nav: "Offres", title: "Offres Cairo Voyage", intro: "Offres à durée limitée sur une voiture privée avec chauffeur. Réservez avant la fin de l'offre.", past: "Offres passées", ended: "Terminée", ends: "Se termine le {d}", endedOn: "Terminée le {d}", left: "Plus que {n} jours", last: "Dernier jour de l'offre !", book: "Réserver cette offre sur WhatsApp", msg: "Bonjour {B}, je souhaite réserver l'offre : {t}", emptyT: "Nouvelles offres bientôt ✨", emptyP: "Demandez-nous sur WhatsApp le meilleur prix pour votre voyage.", emptyBtn: "Demander sur WhatsApp", strip: "🔥 {t} à {p}", off: "de remise", seoTitle: "Offres | Chauffeur privé au Caire | Cairo Voyage", seoDesc: "Offres mensuelles sur une voiture privée avec chauffeur au Caire : remises à durée limitée, prix fixe taxes et service compris, réservation sur WhatsApp.", locale: "fr-FR" },
  de: { nav: "Angebote", title: "Cairo Voyage Angebote", intro: "Zeitlich begrenzte Angebote für ein Privatauto mit Fahrer. Buchen Sie, bevor das Angebot endet.", past: "Frühere Angebote", ended: "Beendet", ends: "Endet am {d}", endedOn: "Beendet am {d}", left: "Noch {n} Tage", last: "Letzter Tag des Angebots!", book: "Dieses Angebot auf WhatsApp buchen", msg: "Hallo {B}, ich möchte das Angebot buchen: {t}", emptyT: "Neue Angebote in Kürze ✨", emptyP: "Fragen Sie uns auf WhatsApp nach dem besten Preis für Ihre Reise.", emptyBtn: "Auf WhatsApp fragen", strip: "🔥 {t} für {p}", off: "Rabatt", seoTitle: "Angebote | Privatfahrer in Kairo günstiger | Cairo Voyage", seoDesc: "Monatliche Angebote für ein Privatauto mit Fahrer in Kairo: zeitlich begrenzte Rabatte, Festpreis inkl. Steuern und Service, Buchung per WhatsApp.", locale: "de-DE" }
};
/* today's date in Cairo as YYYY-MM-DD (offers switch on Cairo time) */
const cairoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());

function renderPage(lang, c, page) {
  page = page || "home";
  const sahel = page === "sahel", offersPg = page === "offers";
  const pagePath = sahel ? "north-coast/" : offersPg ? "offers/" : "";
  const OU = OFFERS_UI[lang];
  const ar = lang === "ar";
  const L = c.labels[lang], X = c.text[lang], set = c.settings;
  const brand = ar ? set.brand_ar : set.brand_latin;
  const fill = s => String(s).split("{B}").join(brand);
  const wa = text => waLink(set.whatsapp, fill(text));
  const num = n => arDigits(n, lang);
  const arrow = ar ? " ←" : " →";
  const img = (src, alt) => src ? '<img src="' + esc(src) + '" alt="' + esc(alt || "") + '" loading="lazy">' : "";
  const heroImg = (src, alt) => src ? '<img src="' + esc(src) + '" alt="' + esc(alt || "") + '" fetchpriority="high">' : "";
  const secHead = s => '<div class="sec-head"><p class="eyebrow">' + esc(s.eyebrow) + '</p><h2>' + md(s.title) + '</h2>' + (s.intro ? '<p>' + esc(s.intro) + '</p>' : '') + '</div>';
  const services = c.services.filter(s => s.visible);
  const NC = c.northcoast, N = NC.text[lang] || NC.text.en;

  const header = () => {
    const logo = '<a class="logo" href="/' + lang + '/">' + rMark() + '<span class="l1">' + esc(ar ? set.brand_ar : set.brand_latin.toUpperCase()) + '</span><span class="l2">' + esc(ar ? set.brand_latin.toUpperCase() : set.brand_ar) + '</span></a>';
    const pre = (sahel || offersPg) ? "/" + lang + "/" : "";
    const sahelLink = '<a class="nav-sahel" href="/' + lang + '/north-coast/"' + (sahel ? ' aria-current="page"' : '') + '>' + esc(N.nav) + '</a>';
    const offersLink = '<a class="nav-sahel nav-offers" href="/' + lang + '/offers/"' + (offersPg ? ' aria-current="page"' : '') + '>' + esc(OU.nav) + '</a>';
    const guideLink = '<a class="nav-sahel" href="/' + lang + '/guide/">' + esc(GUIDE_UI[lang].title) + '</a>';
    const nav = '<nav class="nav" id="nav">' + L.nav.map((n, i) => '<a href="' + pre + '#' + NAV_IDS[i] + '">' + esc(n) + '</a>').join("") + offersLink + sahelLink + guideLink + '</nav>';
    const langs = '<div class="langs" role="group" aria-label="Language">' + LANGS.map(k => '<a class="lang-pick" href="/' + k + '/' + pagePath + '" hreflang="' + k + '" aria-current="' + (k === lang ? "true" : "false") + '">' + LANG_BTN[k] + '</a>').join("") + '</div>';
    return '<header class="hdr" id="hdr"><div class="wrap">' + logo + nav + langs
      + '<a class="btn btn-acc btn-wa-h" target="_blank" rel="noopener" href="' + wa(L.wa.hello) + '">' + ic("chat") + esc(L.whatsapp) + '</a>'
      + '<button class="menu-btn" type="button" id="menuBtn" aria-expanded="false">' + esc(L.menu) + '</button></div></header>';
  };

  const pills = '<div class="hero-pills">' + X.highlights.map((t, i) => '<span>' + ic(TRUST_ICONS[i % 4]) + esc(t) + '</span>').join("") + '</div>';
  const ctas = '<div class="ctas"><a class="btn btn-acc" target="_blank" rel="noopener" href="' + wa(L.wa.hello) + '">' + ic("chat") + esc(X.hero.button_1) + '</a><a class="btn btn-ghost" href="#s-services">' + esc(X.hero.button_2) + '</a></div>';
  const heroText = '<div><p class="eyebrow">' + esc(X.hero.eyebrow) + '</p><h1>' + kinetic(md(X.hero.title)) + '</h1><p class="sub">' + esc(X.hero.subtitle) + '</p>' + ctas + pills + '</div>';
  /* Arabic hero: light and clean, the car photo up front and a "where to?" picker that opens WhatsApp */
  const W = L.where;
  const whereCard = W ? '<div class="hx-where"><b class="hx-q">' + esc(W.title) + '</b><div class="hx-picks">'
      + W.items.map(([icn, t, msg], i) => '<a class="hx-pick" style="--i:' + i + '" target="_blank" rel="noopener" href="' + wa(L.wa.service.replace("{t}", msg)) + '"><span class="ic">' + ic(icn) + '</span>' + esc(t) + '</a>').join("")
      + '</div><div class="hx-ctas"><a class="btn hx-main" target="_blank" rel="noopener" href="' + wa(L.wa.hello) + '">' + ic("chat") + esc(X.hero.button_1) + '</a><a class="btn hx-ghost" href="#s-services">' + esc(X.hero.button_2) + '</a></div></div>' : '';
  const hero = ar
    ? '<section class="hero-x" id="top"><div class="wrap hx-grid"><div class="hx-text"><p class="eyebrow">' + esc(X.hero.eyebrow) + '</p><h1>' + kinetic(md(X.hero.title)) + '</h1><p class="sub">' + esc(X.hero.subtitle) + '</p></div>'
      + '<div class="hx-media">' + heroImg("/media/car-jetour-t2.webp", "سيارة جيتور T2 مع سائق خاص في القاهرة") + '</div>'
      + whereCard + '<div class="hx-trust">' + X.highlights.map((t, i) => '<span>' + ic(TRUST_ICONS[i % 4]) + esc(t) + '</span>').join("") + '</div></div></section>'
    : '<section class="hero-lt" id="top"><div class="scene">' + (set.hero_image ? heroImg(set.hero_image, X.hero.title.replace(/\*/g, "")) : scene("giza")) + '</div><div class="veil"></div><div class="wrap">' + heroText + '</div></section>';

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
    + services.map(s => '<article class="svc-card' + (s.id === "yourday" ? " feat" : "") + '"><div class="ic">' + ic(SVC_ICONS[s.id] || "car") + '</div><h3>' + esc(s["title_" + lang]) + '</h3><p>' + esc(s["desc_" + lang]) + '</p><ul>' + (s["points_" + lang] || []).map(p => '<li>' + esc(p) + '</li>').join("") + '</ul>' + (s.id === "driver" ? '<a class="svc-more" href="/' + lang + '/private-driver-cairo/">' + DRIVER_LINK[lang] + '</a>' : '') + '<a class="go" target="_blank" rel="noopener" href="' + wa(L.wa.service.replace("{t}", s["title_" + lang])) + '">' + esc(L.serviceLink) + arrow + '</a></article>').join("")
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

  const footer = () => '<footer class="foot"><div class="wrap"><span class="logo">' + rMark() + '<span class="l1">' + esc(ar ? set.brand_ar : set.brand_latin.toUpperCase()) + '</span></span><span>© ' + new Date().getFullYear() + ' ' + esc(brand) + '. ' + esc(X.footer) + '</span>' + founderLine(set, lang) + '<span>' + phoneLinks(set) + '</span><span>' + emailLink(set) + '</span>' + revLink(lang) + socials(set, lang) + '</div></footer>'
    + '<a class="fab" target="_blank" rel="noopener" href="' + wa(L.wa.hello) + '" aria-label="WhatsApp">' + ic("chat") + '<span>' + esc(L.whatsapp) + '</span></a>';

  const ncPromo = () => { const P = N.promo; return '<section class="nc-promo" id="s-north-coast"><div class="wrap"><a class="nc-card" href="/' + lang + '/north-coast/"><div class="nc-pic">' + (NC.hero_image ? '<img src="' + esc(NC.hero_image) + '" alt="' + esc(N.nav) + '" loading="lazy">' : scene("sahel")) + '</div><div class="nc-tx"><p class="eyebrow">' + esc(P.eyebrow) + '</p><h2>' + md(P.title) + '</h2><p>' + esc(P.text) + '</p><div class="hero-pills">' + P.chips.map((t, i) => '<span>' + ic(["car", "clock", "fork", "music"][i % 4]) + esc(t) + '</span>').join("") + '</div><span class="btn btn-acc">' + ic("wave") + esc(P.button) + arrow + '</span></div></a></div></section>'; };
  /* ---------- North Coast page ---------- */
  const ZN = z => ar ? z.name_ar : z.name_en;
  const ncPlaces = Object.fromEntries(Object.entries(NC.places).map(([k, list]) => [k, list.filter(p => p.visible).map(p => ({ n: ar ? p.name_ar : p.name_en, a: ar ? "" : p.name_ar, area: ar ? p.area_ar : p.area_en, g: p.zone, t: "", img: p.image || "", d: p["desc_" + lang] || "" }))]));
  const sHero = () => '<section class="hero-lt hero-nc" id="top"><div class="scene">' + (NC.hero_image ? '<img src="' + esc(NC.hero_image) + '" alt="' + esc(N.hero.eyebrow) + '">' : scene("sahel")) + '</div><div class="veil"></div><div class="wrap"><div><p class="eyebrow">' + esc(N.hero.eyebrow) + '</p><h1>' + kinetic(md(N.hero.title)) + '</h1><p class="sub">' + esc(N.hero.subtitle) + '</p>'
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
      + NC.places.villages.filter(v => v.visible && v.zone === z.id).map(v => '<button type="button" class="vchip" aria-expanded="false" aria-controls="vc-' + esc(v.name_en.replace(/\W+/g, "-")) + '">' + esc(ar ? v.name_ar : v.name_en) + '</button>').join("") + '</div>'
      + NC.places.villages.filter(v => v.visible && v.zone === z.id).map(v => '<div class="vcard" id="vc-' + esc(v.name_en.replace(/\W+/g, "-")) + '" hidden><p class="vc-name">' + esc(ar ? v.name_ar : v.name_en) + '</p><p class="vc-times">' + esc(N.coast.fromCairo) + ': ' + fmtH(z.hours.cairo) + ' · ' + esc(N.coast.fromAlex) + ': ' + fmtH(z.hours.alex) + '</p><a class="btn btn-acc" target="_blank" rel="noopener" href="' + wa(L.wa.place.replace("{p}", ar ? v.name_ar : v.name_en)) + '">' + ic("car") + esc(N.coast.bookHere) + arrow + '</a></div>').join("") + '</li>').join("")
    + '</ol></div></section>';
  const sExplore = () => { const cnt = id => (ncPlaces[id] || []).length;
    const cats = N.categories.filter(k => cnt(k.id) > 0).map(k => '<button type="button" class="ex-cat" data-cat="' + k.id + '" aria-expanded="false" aria-pressed="false"><span class="ic">' + ic(CAT_ICONS[k.id] || "pin") + '</span><b>' + esc(k.name) + '</b><small>' + esc(L.explore.count.replace("{n}", num(cnt(k.id)))) + '</small><i class="chev" aria-hidden="true"></i></button>').join("");
    return '<section class="sec" id="s-explore"><div class="wrap">' + secHead(N.explore) + '<div class="ex-cats" id="exCats" role="group">' + cats + '<div class="ex-panel" id="exPanel" hidden></div></div><div id="exTray"></div></div></section>'; };
  const sTips = () => '<section class="sec dark-band" id="s-tips"><div class="wrap">' + secHead(N.tips) + '<div class="prom tips">'
    + N.tips.items.map((p, i) => '<div class="pr">' + ic(["clock", "shield", "fork", "music", "wave"][i % 5]) + '<div><h3>' + esc(p.title) + '</h3><p>' + esc(p.description) + '</p></div></div>').join("") + '</div></div></section>';

  /* ---------- offers: cards sorted by date; the browser re-checks the date so ended offers move down by themselves ---------- */
  const today = cairoToday();
  const offers = (c.offers || []).filter(o => o.start && o.end && o["title_" + lang]).slice().sort((a, b) => b.end.localeCompare(a.end));
  const price = n => n || n === 0 ? (ar ? num(n) + "$" : lang === "en" ? "$" + n : n + " $") : "";
  const dayName = d => new Date(d + "T12:00:00Z").toLocaleDateString(OU.locale, { day: "numeric", month: "long", timeZone: "UTC" });
  const offerCard = (o, i) => {
    const t = o["title_" + lang], pts = String(o["points_" + lang] || "").split("\n").map(x => x.trim()).filter(Boolean);
    return '<article class="of-card" data-start="' + esc(o.start) + '" data-end="' + esc(o.end) + '">'
      + '<div class="of-pic">' + (o.image ? '<img src="' + esc(o.image) + '" alt="' + esc(t) + '"' + (i ? ' loading="lazy"' : '') + '>' : '') + (o.discount ? '<span class="of-badge">' + (ar ? OU.off + " " + num(o.discount) + "٪" : "-" + o.discount + "%") + '</span>' : '') + '<span class="of-ended">' + esc(OU.ended) + '</span></div>'
      + '<div class="of-body"><p class="of-when"><span class="of-left" data-left="' + esc(OU.left) + '" data-last="' + esc(OU.last) + '"></span><span class="of-date" data-now="' + esc(OU.ends.replace("{d}", dayName(o.end))) + '" data-ended="' + esc(OU.endedOn.replace("{d}", dayName(o.end))) + '">' + esc((o.end < today ? OU.endedOn : OU.ends).replace("{d}", dayName(o.end))) + '</span></p>'
      + '<h2>' + esc(t) + '</h2><div class="of-price"><b>' + price(o.price) + '</b>' + (o.old_price ? '<s>' + price(o.old_price) + '</s>' : '') + '</div>'
      + '<ul>' + pts.map(x => '<li>' + ic("check") + esc(x) + '</li>').join("") + '</ul>'
      + '<a class="btn of-book" target="_blank" rel="noopener" href="' + wa(OU.msg.replace("{t}", t)) + '">' + ic("chat") + esc(OU.book) + '</a></div></article>';
  };
  const offersPage = () => {
    const now = offers.filter(o => o.start <= today && o.end >= today), past = offers.filter(o => o.end < today), soon = offers.filter(o => o.start > today);
    return '<section class="of-head"><div class="wrap"><h1>' + esc(OU.title) + '</h1><p>' + esc(OU.intro) + '</p></div></section>'
      + '<section class="sec of-sec"><div class="wrap" id="offers">'
      + '<div class="of-now" id="ofNow">' + now.map(offerCard).join("") + '</div>'
      + '<div class="of-empty" id="ofEmpty"' + (now.length ? ' hidden' : '') + '><h2>' + esc(OU.emptyT) + '</h2><p>' + esc(OU.emptyP) + '</p><a class="btn of-book" target="_blank" rel="noopener" href="' + wa(L.wa.hello) + '">' + ic("chat") + esc(OU.emptyBtn) + '</a></div>'
      + '<div class="of-soon" hidden>' + soon.map(offerCard).join("") + '</div>'
      + '<div id="ofPastWrap"' + (past.length ? '' : ' hidden') + '><h2 class="of-past-h">' + esc(OU.past) + '</h2><div class="of-past" id="ofPast">' + past.map((o, i) => offerCard(o, i + 1)).join("") + '</div></div>'
      + '</div></section>';
  };
  /* small bar at the top of the home page while an offer is running (hidden by the browser once it ends) */
  const live = offers.find(o => o.end >= today);
  const offerStrip = live ? '<a class="of-strip" href="/' + lang + '/offers/" data-start="' + esc(live.start) + '" data-end="' + esc(live.end) + '"' + (live.start <= today ? '' : ' hidden') + '><span>' + esc(OU.strip.replace("{t}", live["title_" + lang]).replace("{p}", price(live.price))) + '</span><b>' + (ar ? "←" : "→") + '</b></a>' : '';

  /* data the browser script needs for the explorer and booking form */
  const clientData = offersPg ? { lang, brand, whatsapp: set.whatsapp, labels: L, categories: [], places: {}, tours: [] } : sahel ? {
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
  const seo = offersPg ? { title: OU.seoTitle, description: OU.seoDesc } : (sahel ? N.seo : X.seo) || {};
  const path = pagePath;
  const desc = seo.description || X.hero.subtitle;
  const title = seo.title || (ar ? set.brand_ar + " | " : set.brand_latin + " | ") + X.hero.eyebrow;
  const OG_LOCALE = { ar: "ar_EG", en: "en_US", fr: "fr_FR", de: "de_DE", it: "it_IT" };
  const ld = obj => '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, "\\u003c") + '</script>';
  const business = {
    "@context": "https://schema.org", "@type": "LocalBusiness", "@id": base + "/#business",
    name: set.brand_latin, alternateName: set.brand_ar, description: desc, url: base + "/" + lang + "/" + path,
    telephone: "+" + String(set.whatsapp).replace(/\D/g, ""), email: set.email,
    founder: { "@type": "Person", name: lang === "ar" ? set.founder_ar : set.founder_en },
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
    + '<link rel="stylesheet" media="print" onload="this.media=&quot;all&quot;" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&family=Reem+Kufi:wght@400..700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=optional">'
    + '<link rel="stylesheet" href="/assets/style.css?v=' + c.version + '">'
    + ld(business) + (offersPg ? ld({ "@context": "https://schema.org", "@type": "OfferCatalog", name: OU.title, url: base + "/" + lang + "/offers/", itemListElement: offers.filter(o => o.end >= today).map(o => ({ "@type": "Offer", name: o["title_" + lang], description: String(o["points_" + lang] || "").split("\n").join(" · "), price: o.price, priceCurrency: "USD", validFrom: o.start, validThrough: o.end, availability: "https://schema.org/InStock", url: base + "/" + lang + "/offers/" })) }) : ld(faqLd)) + analytics(lang, c.settings).head
    + '</head><body>';

  const body = offersPg ? offersPage() + contact() : sahel
    ? sHero() + sServices() + sCalc() + sCoast() + sExplore() + sTips() + faq(N.faq, N.faq.items) + contact()
    : offerStrip + hero + explore() + ncPromo() + booking() + servicesSec() + cities() + fleet() + steps() + promises() + faq() + contact();
  return head + '<div id="site" class="' + (ar ? "ar" : "lt") + (sahel ? " page-nc" : offersPg ? " page-of" : "") + '">' + header() + body + libraryStrip(lang, c) + footer() + '</div>' + analytics(lang, c.settings).body
    + '<script type="application/json" id="data">' + JSON.stringify(clientData).replace(/</g, "\\u003c") + '</script>'
    + '<script src="/assets/app.js?v=' + c.version + '" defer></script></body></html>';
}

/* ---------- one guide page: Cairo & Giza places, tips, services (no attraction prices) ---------- */
const GUIDE_UI = {
  ar: { seoDesc: "دليل أماكن القاهرة والجيزة: كيف توصل لكل مكان ونصايح، ولو محتاج سواق خاص احجز من واتساب.", title: "دليل القاهرة والجيزة", intro: "اختار المدينة، وبعدين القسم، وبعدين المكان. كل مكان فيه كيف توصله ونصايح، ولو محتاج عربية بسائق اضغط احجز.", places: "مكان", tips: "نصايح السائح", services: "خدماتنا", how: "كيف توصله", tip: "نصيحة", map: "الخريطة", official: "الموقع الرسمي", book: "احجز عربية بس", bookMsg: "مرحبًا {B}، عايز أحجز عربية بس لـ: {p}" },
  en: { seoDesc: "Cairo and Giza guide: how to reach each place, traveller tips, and a private driver booked on WhatsApp.", title: "Cairo & Giza guide", intro: "Pick a city, then a category, then a place. Each place shows how to get there and tips. Tap book if you need a car with a driver.", places: "places", tips: "Traveller tips", services: "Our services", how: "How to get there", tip: "Tip", map: "Map", official: "Official site", book: "Book a car only", bookMsg: "Hello {B}, I'd like to book a car only for: {p}" },
  it: { seoDesc: "Guida del Cairo e Giza: come raggiungere ogni luogo, consigli e autista privato prenotato su WhatsApp.", title: "Guida del Cairo e Giza", intro: "Scegli una città, poi una categoria, poi un luogo. Ogni luogo indica come arrivarci e qualche consiglio. Premi prenota se ti serve un'auto con autista.", places: "luoghi", tips: "Consigli per i viaggiatori", services: "I nostri servizi", how: "Come arrivarci", tip: "Consiglio", map: "Mappa", official: "Sito ufficiale", book: "Prenota solo l'auto", bookMsg: "Ciao {B}, vorrei prenotare solo un'auto per: {p}" },
  fr: { seoDesc: "Guide du Caire et de Gizeh : comment s'y rendre, conseils et chauffeur privé réservé sur WhatsApp.", title: "Guide du Caire et de Gizeh", intro: "Choisissez une ville, puis une catégorie, puis un lieu. Chaque lieu indique comment s'y rendre et des conseils. Appuyez sur réserver si vous voulez seulement une voiture avec chauffeur.", places: "lieux", tips: "Conseils voyageurs", services: "Nos services", how: "Comment s'y rendre", tip: "Conseil", map: "Carte", official: "Site officiel", book: "Réserver une voiture seule", bookMsg: "Bonjour {B}, je souhaite réserver une voiture seule pour : {p}" },
  de: { seoDesc: "Kairo- und Gizeh-Guide: Anfahrt zu jedem Ort, Reisetipps und Privatfahrer per WhatsApp buchen.", title: "Kairo & Gizeh Guide", intro: "Wählen Sie eine Stadt, dann eine Kategorie, dann einen Ort. Jeder Ort zeigt die Anfahrt und Tipps. Tippen Sie auf Buchen, wenn Sie nur ein Auto mit Fahrer möchten.", places: "Orte", tips: "Reisetipps", services: "Unsere Leistungen", how: "Anfahrt", tip: "Tipp", map: "Karte", official: "Offizielle Seite", book: "Nur Auto buchen", bookMsg: "Hallo {B}, ich möchte nur ein Auto buchen für: {p}" }
};
function renderGuide(lang, c) {
  const ar = lang === "ar", U = GUIDE_UI[lang], G = c.guide, set = c.settings;
  const brand = ar ? set.brand_ar : set.brand_latin;
  const num = n => arDigits(n, lang);
  const wa = text => waLink(set.whatsapp, text.split("{B}").join(brand));
  const pick = o => (o && (o[lang] || o.en)) || "";
  const count = g => g.items.length;
  const place = (it, cityName) => '<details class="gplace"><summary><span class="gp-n">' + esc(pick(it.name)) + '</span><span class="gp-a">' + esc(pick(it.area)) + '</span></summary><div class="gp-b">'
    + '<p class="gp-h"><b>' + esc(U.how) + ':</b> ' + esc(pick(it.how)) + '</p>'
    + '<p class="gp-t"><b>' + esc(U.tip) + ':</b> ' + esc(pick(it.tip)) + '</p>'
    + '<div class="gp-l"><a target="_blank" rel="noopener" href="' + esc(it.map || ("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(pick(it.name) + " " + cityName))) + '">' + ic("pin") + esc(U.map) + '</a>'
    + (it.official ? '<a target="_blank" rel="noopener" href="' + esc(it.official) + '">' + ic("chat") + esc(U.official) + '</a>' : '') + '</div>'
    + '<a class="btn btn-acc gp-book" target="_blank" rel="noopener" href="' + wa(U.bookMsg.replace("{p}", pick(it.name))) + '">' + ic("car") + esc(U.book) + '</a></div></details>';
  const city = (cat, cityName, first) => '<details class="gcity"' + (first ? " open" : "") + '><summary><span>' + esc(pick(cat.title)) + '</span></summary>'
    + cat.groups.map(g => '<details class="ggroup"><summary><span>' + esc(pick(g.title)) + '</span><small>' + num(count(g)) + ' ' + esc(U.places) + '</small></summary><div class="gp-list">' + g.items.map(it => place(it, cityName)).join("") + '</div></details>').join("")
    + '</details>';
  const cities = [["Cairo", G.categories.cairo, true], ["Giza", G.categories.giza, false]];
  const tips = '<details class="gcity"><summary><span>' + esc(U.tips) + '</span></summary><ul class="gtips">' + G.tips.map(t => '<li><b>' + esc(pick(t.title)) + ':</b> ' + esc(pick(t.text)) + '</li>').join("") + '</ul></details>';
  const svc = '<details class="gcity"><summary><span>' + esc(U.services) + '</span></summary><div class="gp-list">' + c.services.filter(s => s.visible).map(s => '<div class="gplace gsvc"><div class="gp-b"><p class="gp-n">' + esc(s["title_" + lang]) + '</p><p class="gp-h">' + esc(s["desc_" + lang]) + '</p><a class="btn btn-acc gp-book" target="_blank" rel="noopener" href="' + wa(U.bookMsg.replace("{p}", s["title_" + lang])) + '">' + ic("car") + esc(U.book) + '</a></div></div>').join("") + '</div></details>';
  const base = (set.site_url || "").replace(/\/$/, "");
  const head = '<!doctype html><html lang="' + HTML_LANG[lang] + '" dir="' + (ar ? "rtl" : "ltr") + '" data-site="' + (ar ? "ar" : "lt") + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<title>' + esc(U.title + " | " + brand) + '</title><meta name="description" content="' + esc(U.seoDesc) + '">'
    + LANGS.map(k => '<link rel="alternate" hreflang="' + k + '" href="' + base + '/' + k + '/guide/">').join("") + '<link rel="canonical" href="' + base + '/' + lang + '/guide/">'
    + '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#1B2B57">'
    + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link rel="stylesheet" media="print" onload="this.media=&quot;all&quot;" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&family=Reem+Kufi:wght@400..700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">'
    + '<link rel="stylesheet" href="/assets/style.css?v=' + c.version + '">' + analytics(lang, set).head + '</head><body>';
  const hdr = '<header class="hdr"><div class="wrap"><a class="logo" href="/' + lang + '/">' + rMark() + '<span class="l1">' + esc(ar ? set.brand_ar : set.brand_latin.toUpperCase()) + '</span></a><div class="langs" role="group">' + LANGS.map(k => '<a class="lang-pick" href="/' + k + '/guide/" aria-current="' + (k === lang) + '">' + LANG_BTN[k] + '</a>').join("") + '</div></div></header>';
  return head + '<div id="site" class="' + (ar ? "ar" : "lt") + ' page-guide">' + hdr
    + '<section class="sec guide-hero"><div class="wrap"><p class="eyebrow">' + esc(brand) + '</p><h1>' + esc(U.title) + '</h1><p class="sub">' + esc(U.intro) + '</p></div></section>'
    + '<section class="sec guide-list"><div class="wrap">' + cities.map(([cn, cat, first]) => city(cat, cn, first)).join("") + tips + svc + '</div></section>'
    + libraryStrip(lang, c)
    + '<footer class="foot"><div class="wrap"><span>© ' + new Date().getFullYear() + ' ' + esc(brand) + '</span>' + founderLine(set, lang) + '<span>' + phoneLinks(set) + '</span><span>' + emailLink(set) + '</span>' + revLink(lang) + socials(set, lang) + '</div></footer>'
    + '</div>' + analytics(lang, set).body
    + '<script type="application/json" id="data">' + JSON.stringify({ lang, brand, whatsapp: set.whatsapp, labels: c.labels[lang], categories: [], places: {}, tours: [] }).replace(/</g, "\\u003c") + '</script>'
    + '</body></html>';
}

/* ---------- photo library page: every photo, with captions and structured data ---------- */
function renderGallery(lang, c) {
  const ar = lang === "ar", G = GALLERY_UI[lang], set = c.settings;
  const brand = ar ? set.brand_ar : set.brand_latin;
  const base = (set.site_url || "").replace(/\/$/, "");
  const photos = c.library;
  const figs = photos.map(p => { const t = esc(photoCaption(p, lang)); const media = p.type === "video"
    ? '<video src="/media/' + p.slug + '.mp4" poster="/media/' + p.slug + '-poster.webp" controls playsinline preload="metadata" aria-label="' + t + '"></video>'
    : '<img src="/media/library/' + p.slug + '.webp" alt="' + t + '" loading="lazy">';
    return '<figure class="gal-item">' + media + '<figcaption>' + t + '</figcaption></figure>'; }).join("");
  const ld = { "@context": "https://schema.org", "@type": "ImageGallery", name: G.title, inLanguage: lang, url: base + "/" + lang + "/gallery/",
    image: photos.filter(p => p.type !== "video").map(p => ({ "@type": "ImageObject", contentUrl: base + "/media/library/" + p.slug + ".webp", url: base + "/media/library/" + p.slug + ".webp", name: photoCaption(p, lang), description: photoCaption(p, lang), creditText: brand, copyrightNotice: "© " + new Date().getFullYear() + " " + brand, creator: { "@type": "Organization", name: brand, url: base + "/" + lang + "/" }, license: base + "/" + lang + "/#contact", acquireLicensePage: "https://wa.me/" + set.whatsapp })) };
  const head = '<!doctype html><html lang="' + HTML_LANG[lang] + '" dir="' + (ar ? "rtl" : "ltr") + '" data-site="' + (ar ? "ar" : "lt") + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<title>' + esc(G.seoTitle) + '</title><meta name="description" content="' + esc(G.seoDesc) + '">'
    + LANGS.map(k => '<link rel="alternate" hreflang="' + k + '" href="' + base + '/' + k + '/gallery/">').join("") + '<link rel="alternate" hreflang="x-default" href="' + base + '/en/gallery/"><link rel="canonical" href="' + base + '/' + lang + '/gallery/">'
    + '<meta property="og:title" content="' + esc(G.seoTitle) + '"><meta property="og:description" content="' + esc(G.seoDesc) + '"><meta property="og:type" content="website"><meta property="og:url" content="' + base + '/' + lang + '/gallery/"><meta property="og:site_name" content="' + esc(set.brand_latin) + '"><meta property="og:locale" content="' + G.locale + '">'
    + '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#1B2B57">'
    + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link rel="stylesheet" media="print" onload="this.media=&quot;all&quot;" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&family=Reem+Kufi:wght@400..700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">'
    + '<link rel="stylesheet" href="/assets/style.css?v=' + c.version + '">' + analytics(lang, set).head
    + '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, "\\u003c") + '</script></head><body>';
  const hdr = '<header class="hdr"><div class="wrap"><a class="logo" href="/' + lang + '/">' + rMark() + '<span class="l1">' + esc(ar ? set.brand_ar : set.brand_latin.toUpperCase()) + '</span></a><div class="langs" role="group">' + LANGS.map(k => '<a class="lang-pick" href="/' + k + '/gallery/" aria-current="' + (k === lang) + '">' + LANG_BTN[k] + '</a>').join("") + '</div></div></header>';
  return head + '<div id="site" class="' + (ar ? "ar" : "lt") + ' page-guide">' + hdr
    + '<section class="sec guide-hero"><div class="wrap"><p class="eyebrow">' + esc(brand) + '</p><h1>' + esc(G.title) + '</h1><p class="sub">' + esc(G.intro) + '</p><p class="sub">' + esc(G.more) + '</p></div></section>'
    + '<section class="sec gal-sec"><div class="wrap"><div class="gal">' + figs + '</div></div></section>'
    + '<footer class="foot"><div class="wrap"><span>© ' + new Date().getFullYear() + ' ' + esc(brand) + '</span>' + founderLine(set, lang) + '<span>' + phoneLinks(set) + '</span><span>' + emailLink(set) + '</span>' + revLink(lang) + socials(set, lang) + '</div></footer>'
    + '</div>' + analytics(lang, set).body + '</body></html>';
}

const DRIVER_LINK = { ar: "شوف الأسعار", en: "See prices", fr: "Voir les prix", de: "Preise ansehen", it: "Vedi i prezzi" };
/* ---------- service page: private driver in Cairo, with a price table (prices include driver, fuel and taxes) ---------- */
function renderDriverPage(lang, c) {
  const ar = lang === "ar", T = c.driverPage[lang], set = c.settings;
  const brand = ar ? set.brand_ar : set.brand_latin;
  const base = (set.site_url || "").replace(/\/$/, "");
  const wa = text => waLink(set.whatsapp, text.split("{B}").join(brand));
  const ld = { "@context": "https://schema.org", "@type": "Service", name: T.h1, serviceType: "Private driver", inLanguage: lang, url: base + "/" + lang + "/private-driver-cairo/", provider: { "@type": "LocalBusiness", name: brand, telephone: "+" + set.whatsapp },
    areaServed: ["Cairo", "Giza"], offers: T.rows.map(r => ({ "@type": "Offer", name: r[0], price: r[1].replace(/[^0-9]/g, ""), priceCurrency: "USD", description: r[3] })) };
  const head = '<!doctype html><html lang="' + HTML_LANG[lang] + '" dir="' + (ar ? "rtl" : "ltr") + '" data-site="' + (ar ? "ar" : "lt") + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<title>' + esc(T.title) + '</title><meta name="description" content="' + esc(T.description) + '">'
    + LANGS.map(k => '<link rel="alternate" hreflang="' + k + '" href="' + base + '/' + k + '/private-driver-cairo/">').join("") + '<link rel="alternate" hreflang="x-default" href="' + base + '/en/private-driver-cairo/"><link rel="canonical" href="' + base + '/' + lang + '/private-driver-cairo/">'
    + '<meta property="og:title" content="' + esc(T.title) + '"><meta property="og:description" content="' + esc(T.description) + '"><meta property="og:type" content="website"><meta property="og:url" content="' + base + '/' + lang + '/private-driver-cairo/"><meta property="og:site_name" content="' + esc(set.brand_latin) + '">'
    + '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#1B2B57">'
    + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link rel="stylesheet" media="print" onload="this.media=&quot;all&quot;" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&family=Reem+Kufi:wght@400..700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">'
    + '<link rel="stylesheet" href="/assets/style.css?v=' + c.version + '">' + analytics(lang, set).head
    + '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, "\\u003c") + '</script></head><body>';
  const hdr = '<header class="hdr"><div class="wrap"><a class="logo" href="/' + lang + '/">' + rMark() + '<span class="l1">' + esc(ar ? set.brand_ar : set.brand_latin.toUpperCase()) + '</span></a><div class="langs" role="group">' + LANGS.map(k => '<a class="lang-pick" href="/' + k + '/private-driver-cairo/" aria-current="' + (k === lang) + '">' + LANG_BTN[k] + '</a>').join("") + '</div></div></header>';
  // three columns in the table; the "what's included" list below carries the rest
  const table = '<div class="pt-wrap"><table class="pt"><thead><tr>' + T.headers.slice(0, 3).map(h => '<th scope="col">' + esc(h) + '</th>').join("") + '</tr></thead><tbody>'
    + T.rows.map(r => '<tr>' + r.slice(0, 3).map((v, i) => i === 1 ? '<td class="pt-price">' + esc(v) + '</td>' : '<td>' + esc(v) + '</td>').join("") + '</tr>').join("") + '</tbody></table></div><p class="pt-offer">' + esc(T.offer) + ' <a href="/' + lang + '/offers/">' + esc(T.offer_link) + '</a></p>';
  const body = '<section class="sec guide-hero"><div class="wrap"><p class="eyebrow">' + esc(brand) + '</p><h1>' + esc(T.h1) + '</h1><p class="sub">' + esc(T.intro) + '</p></div></section>'
    + '<section class="sec"><div class="wrap">' + table + '<h2 class="svc-h">' + esc(T.includes_title) + '</h2><ul class="svc-list">' + T.includes.map(x => '<li>' + esc(x) + '</li>').join("") + '</ul>'
    + '<p class="svc-cta"><a class="btn btn-acc" target="_blank" rel="noopener" href="' + wa(T.msg) + '">' + ic("chat") + esc(T.cta) + '</a></p></div></section>'
    + '<section class="sec"><div class="wrap"><h2 class="svc-h">' + esc(T.faq_title) + '</h2>' + T.faq.map(f => '<details class="gcity"><summary><span>' + esc(f[0]) + '</span></summary><p class="gp-h" style="padding:14px 18px">' + esc(f[1]) + '</p></details>').join("") + '</div></section>';
  return head + '<div id="site" class="' + (ar ? "ar" : "lt") + ' page-guide">' + hdr + body
    + '<footer class="foot"><div class="wrap"><span>© ' + new Date().getFullYear() + ' ' + esc(brand) + '</span>' + founderLine(set, lang) + '<span>' + phoneLinks(set) + '</span><span>' + emailLink(set) + '</span>' + revLink(lang) + socials(set, lang) + '</div></footer>'
    + '</div>' + analytics(lang, set).body + '</body></html>';
}

/* ---------- client reviews page: video reviews, each with name, city, trip and a short quote ---------- */
const REVIEWS_UI = {
  ar: { title: "آراء عملائنا", intro: "عملاؤنا اتكلموا عن رحلاتهم معانا. دي آرائهم بكلامهم.", empty: "قريبًا، فيديوهات آراء عملائنا.", cta: "احجز رحلتك على واتساب", seoTitle: "آراء العملاء | رحلة القاهرة", seoDesc: "آراء عملاء رحلة القاهرة عن السواق الخاص والجولات وخدمة المطار بالفيديو.", locale: "ar_EG" },
  en: { title: "What our clients say", intro: "Our clients talk about their trips with us, in their own words.", empty: "Client video reviews are coming soon.", cta: "Book your trip on WhatsApp", seoTitle: "Client reviews | Cairo Voyage", seoDesc: "Video reviews from Cairo Voyage clients about private drivers, tours and airport transfers.", locale: "en_US" },
  fr: { title: "Ce que disent nos clients", intro: "Nos clients racontent leur voyage avec nous, avec leurs propres mots.", empty: "Les avis vidéo de nos clients arrivent bientôt.", cta: "Réservez votre voyage sur WhatsApp", seoTitle: "Avis clients | Cairo Voyage", seoDesc: "Avis vidéo de clients de Cairo Voyage sur les chauffeurs privés, les circuits et les transferts aéroport.", locale: "fr_FR" },
  de: { title: "Was unsere Kunden sagen", intro: "Unsere Kunden erzählen von ihrer Reise mit uns, in ihren eigenen Worten.", empty: "Video-Bewertungen unserer Kunden folgen bald.", cta: "Reise per WhatsApp buchen", seoTitle: "Kundenbewertungen | Cairo Voyage", seoDesc: "Video-Bewertungen von Cairo-Voyage-Kunden zu Privatfahrern, Touren und Flughafentransfers.", locale: "de_DE" },
  it: { title: "Cosa dicono i nostri clienti", intro: "I nostri clienti raccontano il loro viaggio con noi, con parole loro.", empty: "Le recensioni video dei nostri clienti arriveranno presto.", cta: "Prenota il tuo viaggio su WhatsApp", seoTitle: "Recensioni clienti | Cairo Voyage", seoDesc: "Recensioni video dei clienti di Cairo Voyage su autisti privati, tour e transfer aeroportuali.", locale: "it_IT" }
};
function renderReviews(lang, c) {
  const ar = lang === "ar", R = REVIEWS_UI[lang], set = c.settings;
  const brand = ar ? set.brand_ar : set.brand_latin;
  const base = (set.site_url || "").replace(/\/$/, "");
  const wa = text => waLink(set.whatsapp, text.split("{B}").join(brand));
  const pick = o => (o && (o[lang] || o.en)) || "";
  const cards = c.reviews.map(r => {
    const who = esc(r.name) + (r.city ? " · " + esc(r.city) : "");
    return '<figure class="rev-card"><video src="/media/reviews/' + esc(r.video) + '.mp4" poster="/media/reviews/' + esc(r.video) + '-poster.webp" controls playsinline preload="none" aria-label="' + who + '"></video>'
      + '<figcaption><strong>' + who + '</strong>' + (r.trip ? '<span class="rev-trip">' + esc(pick(r.trip)) + '</span>' : '') + (pick(r.quote) ? '<q>' + esc(pick(r.quote)) + '</q>' : '') + '</figcaption></figure>';
  }).join("");
  const head = '<!doctype html><html lang="' + HTML_LANG[lang] + '" dir="' + (ar ? "rtl" : "ltr") + '" data-site="' + (ar ? "ar" : "lt") + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<title>' + esc(R.seoTitle) + '</title><meta name="description" content="' + esc(R.seoDesc) + '">'
    + LANGS.map(k => '<link rel="alternate" hreflang="' + k + '" href="' + base + '/' + k + '/reviews/">').join("") + '<link rel="alternate" hreflang="x-default" href="' + base + '/en/reviews/"><link rel="canonical" href="' + base + '/' + lang + '/reviews/">'
    + '<meta property="og:title" content="' + esc(R.seoTitle) + '"><meta property="og:description" content="' + esc(R.seoDesc) + '"><meta property="og:type" content="website"><meta property="og:url" content="' + base + '/' + lang + '/reviews/"><meta property="og:site_name" content="' + esc(set.brand_latin) + '"><meta property="og:locale" content="' + R.locale + '">'
    + '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#1B2B57">'
    + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link rel="stylesheet" media="print" onload="this.media=&quot;all&quot;" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&family=Reem+Kufi:wght@400..700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">'
    + '<link rel="stylesheet" href="/assets/style.css?v=' + c.version + '">' + analytics(lang, set).head + '</head><body>';
  const hdr = '<header class="hdr"><div class="wrap"><a class="logo" href="/' + lang + '/">' + rMark() + '<span class="l1">' + esc(ar ? set.brand_ar : set.brand_latin.toUpperCase()) + '</span></a><div class="langs" role="group">' + LANGS.map(k => '<a class="lang-pick" href="/' + k + '/reviews/" aria-current="' + (k === lang) + '">' + LANG_BTN[k] + '</a>').join("") + '</div></div></header>';
  const list = cards ? '<div class="rev-grid">' + cards + '</div>' : '<p class="rev-empty">' + esc(R.empty) + '</p>';
  return head + '<div id="site" class="' + (ar ? "ar" : "lt") + ' page-guide">' + hdr
    + '<section class="sec guide-hero"><div class="wrap"><p class="eyebrow">' + esc(brand) + '</p><h1>' + esc(R.title) + '</h1><p class="sub">' + esc(R.intro) + '</p></div></section>'
    + '<section class="sec"><div class="wrap">' + list + '<p class="svc-cta"><a class="btn btn-acc" target="_blank" rel="noopener" href="' + wa(L_HELLO(lang)) + '">' + ic("chat") + esc(R.cta) + '</a></p></div></section>'
    + '<footer class="foot"><div class="wrap"><span>© ' + new Date().getFullYear() + ' ' + esc(brand) + '</span>' + founderLine(set, lang) + '<span>' + phoneLinks(set) + '</span><span>' + emailLink(set) + '</span>' + revLink(lang) + socials(set, lang) + '</div></footer>'
    + '</div>' + analytics(lang, set).body + '</body></html>';
}
const L_HELLO = lang => ({ ar: "مرحبًا {B}، عايز أحجز رحلة.", en: "Hello {B}, I'd like to book a trip.", fr: "Bonjour {B}, je souhaite réserver un voyage.", de: "Hallo {B}, ich möchte eine Reise buchen.", it: "Ciao {B}, vorrei prenotare un viaggio." })[lang];

/* ---------- about page: the founder, with his own story and figures ---------- */
function renderAbout(lang, c) {
  const ar = lang === "ar", A = c.about[lang], set = c.settings;
  const brand = ar ? set.brand_ar : set.brand_latin;
  const base = (set.site_url || "").replace(/\/$/, "");
  const wa = text => waLink(set.whatsapp, text.split("{B}").join(brand));
  const ld = { "@context": "https://schema.org", "@type": "AboutPage", name: A.seoTitle, inLanguage: lang, url: base + "/" + lang + "/about/",
    mainEntity: { "@type": "Person", name: A.name.split(" – ")[0], alternateName: "Abu Khaled", jobTitle: A.role, worksFor: { "@type": "Organization", name: brand, url: base + "/" + lang + "/" }, image: base + "/media/about-ramadan.webp" } };
  const head = '<!doctype html><html lang="' + HTML_LANG[lang] + '" dir="' + (ar ? "rtl" : "ltr") + '" data-site="' + (ar ? "ar" : "lt") + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<title>' + esc(A.seoTitle) + '</title><meta name="description" content="' + esc(A.seoDesc) + '">'
    + LANGS.map(k => '<link rel="alternate" hreflang="' + k + '" href="' + base + '/' + k + '/about/">').join("") + '<link rel="alternate" hreflang="x-default" href="' + base + '/en/about/"><link rel="canonical" href="' + base + '/' + lang + '/about/">'
    + '<meta property="og:title" content="' + esc(A.seoTitle) + '"><meta property="og:description" content="' + esc(A.seoDesc) + '"><meta property="og:type" content="profile"><meta property="og:url" content="' + base + '/' + lang + '/about/"><meta property="og:site_name" content="' + esc(set.brand_latin) + '"><meta property="og:image" content="' + esc(base + '/media/about-ramadan.webp') + '">'
    + '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#1B2B57">'
    + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link rel="stylesheet" media="print" onload="this.media=&quot;all&quot;" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&family=Reem+Kufi:wght@400..700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">'
    + '<link rel="stylesheet" href="/assets/style.css?v=' + c.version + '">' + analytics(lang, set).head
    + '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, "\\u003c") + '</script></head><body>';
  const hdr = '<header class="hdr"><div class="wrap"><a class="logo" href="/' + lang + '/">' + rMark() + '<span class="l1">' + esc(ar ? set.brand_ar : set.brand_latin.toUpperCase()) + '</span></a><div class="langs" role="group">' + LANGS.map(k => '<a class="lang-pick" href="/' + k + '/about/" aria-current="' + (k === lang) + '">' + LANG_BTN[k] + '</a>').join("") + '</div></div></header>';
  const stats = '<div class="ab-stats">' + A.stats.map(x => '<div class="ab-stat"><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></div>').join("") + '</div>';
  const body = '<section class="sec ab-sec"><div class="wrap ab-grid"><figure class="ab-photo"><img src="/media/about-ramadan.webp" alt="' + esc(A.photo_alt) + '" width="800" height="1000" loading="eager" fetchpriority="high"></figure>'
    + '<div class="ab-text"><p class="eyebrow">' + esc(A.eyebrow) + '</p><h1>' + esc(A.title) + '</h1><p class="ab-name">' + esc(A.name) + ' · ' + esc(A.role) + '</p>' + stats
    + A.paras.map(p => '<p class="ab-p">' + esc(p) + '</p>').join("")
    + '<blockquote class="ab-quote">' + esc(A.quote) + '</blockquote>'
    + '<p class="svc-cta"><a class="btn btn-acc" target="_blank" rel="noopener" href="' + wa(L_HELLO(lang)) + '">' + ic("chat") + esc(A.cta) + '</a></p></div></div></section>';
  return head + '<div id="site" class="' + (ar ? "ar" : "lt") + ' page-guide">' + hdr + body
    + '<footer class="foot"><div class="wrap"><span>© ' + new Date().getFullYear() + ' ' + esc(brand) + '</span>' + founderLine(set, lang) + '<span>' + phoneLinks(set) + '</span><span>' + emailLink(set) + '</span>' + revLink(lang) + socials(set, lang) + '</div></footer>'
    + '</div>' + analytics(lang, set).body + '</body></html>';
}

/* ---------- blog: an index and one page per article. Drafts only appear when PREVIEW=1 (for review, never on the live site) ---------- */
const BLOG_UI = {
  ar: { name: "من قلب القاهرة", intro: "نصايح عملية لزيارة القاهرة والجيزة والساحل، من حد بيعرف الطرق كويس.", more: "اقرأ المقال", soon: "قريبًا مقالات بالعربي.", back: "كل المقالات", min: "دقايق قراءة", cta: "احجز سواق خاص على واتساب", seoTitle: "من قلب القاهرة | مدونة رحلة القاهرة", seoDesc: "نصايح عملية لزيارة القاهرة والجيزة والساحل الشمالي، من سواقين بيعرفوا الطرق.", locale: "ar_EG" },
  en: { name: "From Cairo", intro: "Practical advice for visiting Cairo, Giza and the coast, from drivers who know the roads.", more: "Read the article", soon: "Articles in English are coming soon.", back: "All articles", min: "min read", cta: "Book a private driver on WhatsApp", seoTitle: "From Cairo | Cairo Voyage blog", seoDesc: "Practical advice for visiting Cairo, Giza and the North Coast, from drivers who know the roads.", locale: "en_US" },
  fr: { name: "Depuis Le Caire", soon: "Les articles en français arrivent bientôt.", more: "Lire l'article", back: "Tous les articles", min: "min de lecture", cta: "Réserver un chauffeur sur WhatsApp", seoTitle: "Depuis Le Caire | Blog Cairo Voyage", seoDesc: "Conseils pratiques pour visiter Le Caire, Gizeh et la Côte Nord.", locale: "fr_FR", intro: "Conseils pratiques pour visiter Le Caire, Gizeh et la Côte Nord." },
  de: { name: "Aus Kairo", soon: "Artikel auf Deutsch folgen bald.", more: "Artikel lesen", back: "Alle Artikel", min: "Min. Lesezeit", cta: "Privatfahrer per WhatsApp buchen", seoTitle: "Aus Kairo | Cairo Voyage Blog", seoDesc: "Praktische Tipps für Kairo, Gizeh und die Nordküste.", locale: "de_DE", intro: "Praktische Tipps für Kairo, Gizeh und die Nordküste." },
  it: { name: "Da Il Cairo", soon: "Gli articoli in italiano arrivano presto.", more: "Leggi l'articolo", back: "Tutti gli articoli", min: "min di lettura", cta: "Prenota un autista su WhatsApp", seoTitle: "Da Il Cairo | Blog Cairo Voyage", seoDesc: "Consigli pratici per visitare il Cairo, Giza e la Costa Nord.", locale: "it_IT", intro: "Consigli pratici per visitare il Cairo, Giza e la Costa Nord." }
};
const blogPosts = (c, lang) => (c.blog || []).filter(p => p.body && p.body[lang] && (!p.draft || c.previewDrafts));
function blogHead(lang, c, title, desc, path, extra) {
  const set = c.settings, base = (set.site_url || "").replace(/\/$/, "");
  return '<!doctype html><html lang="' + HTML_LANG[lang] + '" dir="' + (lang === "ar" ? "rtl" : "ltr") + '" data-site="' + (lang === "ar" ? "ar" : "lt") + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<title>' + esc(title) + '</title><meta name="description" content="' + esc(desc) + '"><link rel="canonical" href="' + base + '/' + lang + '/' + path + '">'
    + LANGS.map(k => '<link rel="alternate" hreflang="' + k + '" href="' + base + '/' + k + '/' + path + '">').join("") + '<link rel="alternate" hreflang="x-default" href="' + base + '/en/' + path + '">'
    + '<meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(desc) + '"><meta property="og:site_name" content="' + esc(set.brand_latin) + '">'
    + '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#1B2B57">'
    + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link rel="stylesheet" media="print" onload="this.media=&quot;all&quot;" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&family=Reem+Kufi:wght@400..700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">'
    + '<link rel="stylesheet" href="/assets/style.css?v=' + c.version + '">' + analytics(lang, set).head + (extra || '') + '</head><body>';
}
function blogHeader(lang, c, section) {
  const set = c.settings, ar = lang === "ar";
  return '<header class="hdr"><div class="wrap"><a class="logo" href="/' + lang + '/">' + rMark() + '<span class="l1">' + esc(ar ? set.brand_ar : set.brand_latin.toUpperCase()) + '</span></a><div class="langs" role="group">' + LANGS.map(k => '<a class="lang-pick" href="/' + k + '/blog/" aria-current="' + (k === lang) + '">' + LANG_BTN[k] + '</a>').join("") + '</div></div></header>';
}
function blogFoot(lang, c) {
  const set = c.settings, ar = lang === "ar", brand = ar ? set.brand_ar : set.brand_latin;
  return '<footer class="foot"><div class="wrap"><span>© ' + new Date().getFullYear() + ' ' + esc(brand) + '</span>' + founderLine(set, lang) + '<span>' + phoneLinks(set) + '</span><span>' + emailLink(set) + '</span>' + revLink(lang) + socials(set, lang) + '</div></footer>';
}
function renderBlog(lang, c) {
  const B = BLOG_UI[lang], set = c.settings, base = (set.site_url || "").replace(/\/$/, "");
  const posts = blogPosts(c, lang);
  const cards = posts.map(p => {
    const t = p.title[lang], ex = p.excerpt[lang];
    return '<a class="bl-card" href="/' + lang + '/blog/' + esc(p.slug) + '/"><figure><img src="' + esc(p.cover) + '" alt="' + esc(p.cover_alt[lang]) + '" width="720" height="480" loading="lazy"></figure><div class="bl-meta"><time>' + esc(p.date) + '</time></div><h2>' + esc(t) + '</h2><p>' + esc(ex) + '</p><span class="bl-more">' + esc(B.more) + ' →</span></a>';
  }).join("");
  const title = B.seoTitle, desc = B.seoDesc;
  const head = blogHead(lang, c, title, desc, "blog/", '<script type="application/ld+json">' + JSON.stringify({ "@context": "https://schema.org", "@type": "Blog", name: B.name, inLanguage: lang, url: base + "/" + lang + "/blog/" }).replace(/</g, "\\u003c") + '</script>');
  return head + '<div id="site" class="' + (lang === "ar" ? "ar" : "lt") + ' page-guide">' + blogHeader(lang, c)
    + '<section class="sec guide-hero bl-hero"><div class="wrap"><p class="eyebrow">' + esc(set.brand_latin) + '</p><h1>' + esc(B.name) + '</h1><p class="sub">' + esc(B.intro) + '</p></div></section>'
    + '<section class="sec"><div class="wrap">' + (cards ? '<div class="bl-grid">' + cards + '</div>' : '<p class="rev-empty">' + esc(B.soon) + '</p>') + '<p class="svc-cta"><a class="btn btn-acc" target="_blank" rel="noopener" href="' + waLink(set.whatsapp, B.cta) + '">' + ic("chat") + esc(B.cta) + '</a></p></div></section>'
    + blogFoot(lang, c) + '</div>' + analytics(lang, set).body + '</body></html>';
}
function renderPost(lang, c, post) {
  const B = BLOG_UI[lang], set = c.settings, base = (set.site_url || "").replace(/\/$/, "");
  const t = post.title[lang], ex = post.excerpt[lang];
  const blocks = post.body[lang].map(b => {
    if (b[0] === "h2") return '<h2>' + esc(b[1]) + '</h2>';
    if (b[0] === "p") return '<p>' + esc(b[1]) + '</p>';
    if (b[0] === "cta") return '<p class="bl-cta"><a class="btn btn-acc" target="_blank" rel="noopener" href="' + waLink(set.whatsapp, B.cta) + '">' + ic("chat") + esc(b[1]) + '</a></p>';
    return '';
  }).join("");
  const ld = { "@context": "https://schema.org", "@type": "Article", headline: t, description: ex, inLanguage: lang, datePublished: post.date, dateModified: post.date, image: base + post.cover, author: { "@type": "Person", name: "Ramadan Mamdouh Younis", alternateName: "Abu Khaled" }, publisher: { "@type": "Organization", name: set.brand_latin, url: base + "/" + lang + "/" }, mainEntityOfPage: base + "/" + lang + "/blog/" + post.slug + "/" };
  const head = blogHead(lang, c, t + " | " + set.brand_latin, ex, "blog/" + post.slug + "/", '<meta property="og:type" content="article"><meta property="og:image" content="' + esc(base + post.cover) + '"><script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, "\\u003c") + '</script>');
  return head + '<div id="site" class="' + (lang === "ar" ? "ar" : "lt") + ' page-guide">' + blogHeader(lang, c)
    + '<article class="bl-post"><header class="bl-top"><div class="wrap"><p class="bl-back"><a href="/' + lang + '/blog/">← ' + esc(B.back) + '</a></p><p class="eyebrow">' + esc(B.name) + ' · <time>' + esc(post.date) + '</time></p><h1>' + esc(t) + '</h1><p class="sub">' + esc(ex) + '</p></div></header>'
    + '<figure class="bl-cover"><img src="' + esc(post.cover) + '" alt="' + esc(post.cover_alt[lang]) + '" width="720" height="480" fetchpriority="high"></figure>'
    + '<div class="wrap bl-body">' + blocks + '</div></article>'
    + blogFoot(lang, c) + '</div>' + analytics(lang, set).body + '</body></html>';
}

module.exports = { renderPage, renderGuide, renderGallery, renderDriverPage, renderReviews, renderAbout, renderBlog, renderPost, blogPosts, LANGS };
