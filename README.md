# Rafiq: private driver & private tours website

Static website in four languages (Arabic, English, French, German) for a private driver, transfer and private tour service in Cairo, Alexandria, the North Coast and the rest of Egypt.

- **Hosting:** Cloudflare Pages (free)
- **Dashboard:** [Pages CMS](https://app.pagescms.org) (free), configured by `.pages.yml`
- **Bookings:** every button opens WhatsApp with a ready-made message

## How it is built

```
content/          ← everything editable from the dashboard
  settings.json     brand name, WhatsApp number, email, site URL, hero photo
  places.json       Explore section: museums, sites, mosques, malls, parks, markets
  tours.json        ready-made tours, duration, price
  services.json     services in four languages
  fleet.json        cars, seats, bags, photos
  text/{ar,en,fr,de}.json   all page text per language
media/            ← photos uploaded from the dashboard
src/              ← design and code (not edited from the dashboard)
  render.js         builds each language page
  client.js         Explore accordion, "my day" plan, booking form
  shared.js         icons, illustrations, helpers
  style.css         the design
  labels/           small interface labels per language
public/           ← copied as-is (favicon, language redirect)
build.js          ← `node build.js` writes the finished site to dist/
```

No npm packages are needed. Node 18 or newer.

```bash
node build.js            # build into dist/
npx serve dist           # optional: preview locally
```

## Cloudflare Pages settings

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | `node build.js` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION` = `20` |

Every change saved in the dashboard is a commit on `main`, and Cloudflare rebuilds the site automatically within about a minute.

---

## بالعربي: إزاي تعدّل الموقع

1. ادخل **https://app.pagescms.org** وسجّل دخول بحساب GitHub.
2. اختار المستودع **rafiq-website**.
3. هتلاقي في القائمة:
   - **الإعدادات العامة**: رقم واتساب، الإيميل، صورة الواجهة.
   - **أماكن استكشف**: إضافة أو إخفاء متحف أو مول أو مسجد...
   - **الجولات الجاهزة والأسعار**
   - **الخدمات** و**السيارات** (ومنها ترفع صور العربيات)
   - **نصوص الموقع**: لكل لغة لوحدها
4. عدّل واضغط **Save**. الموقع بيتحدّث لوحده خلال دقيقة تقريباً.
