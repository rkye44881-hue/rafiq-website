/* Two map engines behind one small interface: Google Maps when a key is set in
   firebase-config.json ("googleMapsKey"), otherwise the free OpenStreetMap through Leaflet. */

const CAIRO = { lat: 30.0444, lng: 31.2357 };

export async function loadMaps(config) {
  // "?osm" in the address forces OpenStreetMap (also used when Google refuses the key)
  if (config.googleMapsKey && !new URLSearchParams(location.search).has("osm")) {
    try {
      await loadGoogle(config.googleMapsKey);
      return el => new GoogleView(el, config.googleMapId || "DEMO_MAP_ID");
    } catch (e) {
      console.warn("Google Maps did not load, using OpenStreetMap", e);
    }
  }
  return el => new LeafletView(el);
}

function loadGoogle(key) {
  return new Promise((resolve, reject) => {
    window.__gmReady = resolve;
    // A refused key is reported after the map loaded: switch to OpenStreetMap so the panel keeps working
    window.gm_authFailure = () => {
      reject(new Error("Google Maps key refused"));
      if (!location.search.includes("osm")) location.replace(location.pathname + "?osm=1");
    };
    const s = document.createElement("script");
    s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key)
      + "&v=weekly&libraries=marker&language=ar&region=EG&loading=async&callback=__gmReady";
    s.async = true;
    s.onerror = reject;
    document.head.append(s);
  });
}

/* ---------- OpenStreetMap (Leaflet) ---------- */
class LeafletView {
  constructor(el) {
    this.kind = "leaflet";
    this.map = L.map(el).setView([CAIRO.lat, CAIRO.lng], 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(this.map);
    this.markers = new Map();
    this.lines = new Map();
  }
  invalidate() { this.map.invalidateSize(); }
  onUserMove(cb) { this.map.on("dragstart", cb); }
  setView(p, zoom) { this.map.setView([p.lat, p.lng], zoom ?? this.map.getZoom()); }
  panTo(p) { this.map.panTo([p.lat, p.lng], { animate: false }); }
  fit(points, maxZoom = 15) {
    if (!points.length) return;
    this.invalidate();
    this.map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])).pad(0.2), { maxZoom });
  }
  upsert(id, p, html, popupHtml, onClick) {
    const icon = L.divIcon({ className: "car-marker", html, iconSize: [0, 0] });
    let m = this.markers.get(id);
    if (!m) {
      m = L.marker([p.lat, p.lng], { icon }).addTo(this.map);
      if (popupHtml) m.bindPopup("");
      if (onClick) m.on("click", onClick);
      this.markers.set(id, m);
    } else {
      m.setIcon(icon);
    }
    if (popupHtml && m.getPopup()) m.setPopupContent(popupHtml);
  }
  move(id, p) { this.markers.get(id)?.setLatLng([p.lat, p.lng]); }
  remove(id) { const m = this.markers.get(id); if (m) { this.map.removeLayer(m); this.markers.delete(id); } }
  ids() { return [...this.markers.keys()]; }
  openPopup(id) { this.markers.get(id)?.openPopup(); }
  line(id, points, { color = "#0f5c4d", weight = 5, opacity = 1 } = {}) {
    this.lines.get(id)?.remove();
    if (points.length < 2) { this.lines.delete(id); return; }
    this.lines.set(id, L.polyline(points.map(p => [p.lat, p.lng]), { color, weight, opacity }).addTo(this.map));
  }
}

/* ---------- Google Maps ---------- */
class GoogleView {
  constructor(el, mapId) {
    this.kind = "google";
    this.map = new google.maps.Map(el, {
      center: CAIRO, zoom: 11, mapId,
      colorScheme: "FOLLOW_SYSTEM",
      gestureHandling: "greedy",
      streetViewControl: false, mapTypeControl: false, fullscreenControl: false
    });
    this.info = new google.maps.InfoWindow();
    this.markers = new Map();
    this.popups = new Map();
    this.lines = new Map();
  }
  invalidate() {}
  onUserMove(cb) { this.map.addListener("dragstart", cb); }
  setView(p, zoom) { this.map.setCenter(p); if (zoom) this.map.setZoom(zoom); }
  panTo(p) { this.map.setCenter(p); }
  fit(points, maxZoom = 15) {
    if (!points.length) return;
    const b = new google.maps.LatLngBounds();
    points.forEach(p => b.extend(p));
    this.map.fitBounds(b, 60);
    google.maps.event.addListenerOnce(this.map, "idle", () => { if (this.map.getZoom() > maxZoom) this.map.setZoom(maxZoom); });
  }
  upsert(id, p, html, popupHtml, onClick) {
    let m = this.markers.get(id);
    const el = document.createElement("div");
    el.className = "car-marker g";
    el.innerHTML = html;
    if (!m) {
      m = new google.maps.marker.AdvancedMarkerElement({ map: this.map, position: p, content: el, gmpClickable: true });
      m.addListener("click", () => {
        if (this.popups.get(id)) { this.info.setContent(this.popups.get(id)); this.info.open({ anchor: m, map: this.map }); }
        onClick?.();
      });
      this.markers.set(id, m);
    } else {
      m.content = el;
    }
    this.popups.set(id, popupHtml);
    if (this.info.anchor === m && popupHtml) this.info.setContent(popupHtml);
  }
  move(id, p) { const m = this.markers.get(id); if (m) m.position = p; }
  remove(id) { const m = this.markers.get(id); if (m) { m.map = null; this.markers.delete(id); } }
  ids() { return [...this.markers.keys()]; }
  openPopup(id) {
    const m = this.markers.get(id);
    if (m && this.popups.get(id)) { this.info.setContent(this.popups.get(id)); this.info.open({ anchor: m, map: this.map }); }
  }
  line(id, points, { color = "#0f5c4d", weight = 5, opacity = 1 } = {}) {
    this.lines.get(id)?.setMap(null);
    if (points.length < 2) { this.lines.delete(id); return; }
    this.lines.set(id, new google.maps.Polyline({ map: this.map, path: points, strokeColor: color, strokeWeight: weight, strokeOpacity: opacity }));
  }
}
