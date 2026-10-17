# Moving go2cairo.com to cairovoyage.com

Goal: every old go2cairo.com address sends visitors and Google to the closest page on cairovoyage.com with a permanent (301) redirect.

1. Add go2cairo.com to Cloudflare (free plan) and change its nameservers at the registrar to the two Cloudflare gives.
2. DNS: one proxied (orange cloud) record so Cloudflare answers for the domain:
   - A `@` → `192.0.2.1` (proxied), A `www` → `192.0.2.1` (proxied).
3. Rules → Redirect Rules → Bulk Redirects: upload `go2cairo-redirects.csv` (specific pages, checked first).
4. Rules → Redirect Rules → Single Redirects (catch-all, after the bulk list):
   - If hostname is `go2cairo.com` or `www.go2cairo.com` and path starts with `/ar` → `https://cairovoyage.com/ar/` (301)
   - Everything else on go2cairo.com → `https://cairovoyage.com/en/` (301)
5. Google Search Console, go2cairo.com property → Settings → Change of address → cairovoyage.com.
6. Keep go2cairo.com renewed for at least a year.
