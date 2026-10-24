/* Rafiq drivers control panel: live map, jobs, drivers, cars, route history.
   Data lives in Firebase (settings in firebase-config.json). */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const DRIVER_EMAIL_DOMAIN = "drivers.rafiq.app"; // same as Driver.kt in the Android app
const ONLINE_WINDOW_MS = 10 * 60 * 1000;         // the app sends at least every 5 minutes while on shift
const CAIRO = [30.0444, 31.2357];
const SPEED_LIMIT = 100;                         // km/h: faster than this shows in red

const STATUS = {
  new: "جديد", accepted: "مقبول", onway: "في الطريق للعميل", arrived: "مع العميل", done: "تم", cancelled: "ملغي"
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const show = (el, on) => el.classList.toggle("hidden", !on);
const emailFromPhone = phone => phone.replace(/\D/g, "") + "@" + DRIVER_EMAIL_DOMAIN;
const localDay = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const toDate = ts => ts && typeof ts.toDate === "function" ? ts.toDate() : null;

function ago(date) {
  if (!date) return "لم يتصل بعد";
  const min = Math.round((Date.now() - date.getTime()) / 60000);
  if (min < 1) return "الآن";
  if (min < 60) return "قبل " + min + " دقيقة";
  const h = Math.round(min / 60);
  if (h < 24) return "قبل " + h + " ساعة";
  return date.toLocaleDateString("ar-EG");
}
const isOnline = d => d.online && toDate(d.updatedAt) && Date.now() - toDate(d.updatedAt).getTime() < ONLINE_WINDOW_MS;
// A moving phone reports every 20 seconds, so no report for 90 seconds means the car is standing still
const speedOf = d => isOnline(d) && Date.now() - toDate(d.updatedAt).getTime() < 90000 ? Math.round(d.speed || 0) : 0;
const speedTag = d => {
  const v = speedOf(d);
  return v >= 5 ? `<span class="speed ${v > SPEED_LIMIT ? "fast" : ""}">${v} كم/س</span>` : "";
};

/* ---------- start ---------- */
let config;
try {
  config = await (await fetch("firebase-config.json", { cache: "no-store" })).json();
} catch (e) {
  config = null;
}
if (!config || !config.apiKey || config.apiKey.startsWith("PASTE")) {
  const m = $("#setup-msg");
  m.textContent = "اللوحة لم تُربط بـ Firebase بعد. املأ الملف fleet/firebase-config.json بإعدادات مشروعك (الخطوات في fleet/README.md).";
  show(m, true);
  throw new Error("firebase-config.json is not filled in");
}

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);
// A second Firebase instance only for creating driver accounts, so the admin stays signed in
const creatorAuth = getAuth(initializeApp(config, "creator"));

const state = { drivers: new Map(), cars: new Map(), jobs: new Map(), jobFilter: "active" };
let unsubs = [];

onAuthStateChanged(auth, async user => {
  unsubs.forEach(u => u());
  unsubs = [];
  if (!user) {
    show($("#app"), false);
    show($("#login"), true);
    return;
  }
  const admin = await getDoc(doc(db, "admins", user.uid)).catch(() => null);
  if (!admin || !admin.exists()) {
    $("#login-error").textContent = "هذا الحساب ليس مديراً. أضف المعرّف " + user.uid + " في مجموعة admins.";
    await signOut(auth);
    return;
  }
  show($("#login"), false);
  show($("#app"), true);
  startApp();
});

$("#login-form").addEventListener("submit", async e => {
  e.preventDefault();
  $("#login-error").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("#login-email").value.trim(), $("#login-password").value);
  } catch (err) {
    $("#login-error").textContent = "البريد أو كلمة المرور غير صحيحة";
  }
});
$("#logout").addEventListener("click", () => signOut(auth));

/* ---------- tabs ---------- */
let currentTab = "map";
$("#tabs").addEventListener("click", e => {
  const b = e.target.closest("button[data-tab]");
  if (!b) return;
  currentTab = b.dataset.tab;
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("active", x === b));
  document.querySelectorAll(".tab").forEach(t => show(t, t.id === "tab-" + currentTab));
  if (currentTab === "map") map.invalidateSize();
  if (currentTab === "tracks") trackMap.invalidateSize();
});

/* ---------- maps ---------- */
const tiles = () => L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "&copy; OpenStreetMap"
});
const map = L.map("map").setView(CAIRO, 11);
tiles().addTo(map);
const trackMap = L.map("track-map").setView(CAIRO, 11);
tiles().addTo(trackMap);
const markers = new Map();
let fittedOnce = false;

function startApp() {
  unsubs.push(onSnapshot(collection(db, "drivers"), snap => {
    state.drivers = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    renderAll();
  }));
  unsubs.push(onSnapshot(collection(db, "cars"), snap => {
    state.cars = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    renderAll();
  }));
  unsubs.push(onSnapshot(collection(db, "jobs"), snap => {
    state.jobs = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    renderAll();
  }));
  $("#track-form").date.value = localDay();
  setTimeout(() => map.invalidateSize(), 50);
}

// "last seen" times and online dots age even without new data
setInterval(() => { if (state.drivers.size) renderMap(); }, 30000);

function renderAll() {
  renderSelects();
  renderMap();
  renderJobs();
  renderDrivers();
  renderCars();
}

const carLabel = id => {
  const c = state.cars.get(id);
  return c ? [c.model, c.plate].filter(Boolean).join(" • ") : "";
};
const driverName = id => state.drivers.get(id)?.name || "—";
const activeJobOf = id => [...state.jobs.values()].find(j => j.driverId === id && !["done", "cancelled"].includes(j.status));
const sortedDrivers = () => [...state.drivers.values()].sort((a, b) => (isOnline(b) - isOnline(a)) || String(a.name).localeCompare(String(b.name), "ar"));

function renderSelects() {
  const driverOpts = sortedDrivers().map(d => `<option value="${esc(d.id)}">${esc(d.name)}${isOnline(d) ? " ●" : ""}</option>`).join("");
  document.querySelectorAll("select.driver-select").forEach(s => {
    const v = s.value;
    s.innerHTML = (s.closest("#job-form") ? '<option value="">— بدون سائق —</option>' : "") + driverOpts;
    if (v) s.value = v;
  });
  const carOpts = '<option value="">— بدون سيارة —</option>' + [...state.cars.values()].map(c => `<option value="${esc(c.id)}">${esc(carLabel(c.id))}</option>`).join("");
  document.querySelectorAll("select.car-select").forEach(s => {
    const v = s.value;
    s.innerHTML = carOpts;
    s.value = v;
  });
}

/* ---------- live map ---------- */
function popupHtml(d) {
  const job = activeJobOf(d.id);
  return `<b>${esc(d.name)}</b><br>${esc(carLabel(d.carId))}<br>`
    + (isOnline(d) ? `السرعة: ${speedOf(d)} كم/س${speedOf(d) > SPEED_LIMIT ? " ⚠️" : ""}<br>` : "خارج الدوام<br>")
    + (d.battery ? `البطارية: ${d.battery}%<br>` : "")
    + `آخر تحديث: ${ago(toDate(d.updatedAt))}`
    + (job ? `<br><br>الطلب: ${esc(job.title || job.pickup)}<br>${STATUS[job.status] || ""}` : "")
    + (d.phone ? `<br><a href="tel:${esc(d.phone)}">${esc(d.phone)}</a>` : "");
}

function renderMap() {
  const drivers = sortedDrivers();
  const online = drivers.filter(isOnline);
  const busy = online.filter(d => activeJobOf(d.id));
  $("#stats").innerHTML =
    `<div class="stat"><b>${online.length}</b><span>في الدوام</span></div>`
    + `<div class="stat"><b>${busy.length}</b><span>في طلب</span></div>`
    + `<div class="stat"><b>${[...state.jobs.values()].filter(j => j.status === "new").length}</b><span>طلبات تنتظر</span></div>`;

  $("#driver-list").innerHTML = drivers.map(d => {
    const job = activeJobOf(d.id);
    return `<li data-id="${esc(d.id)}">
      <span class="name"><span class="dot ${isOnline(d) ? "on" : ""}"></span>${esc(d.name)}${speedTag(d)}</span>
      <span class="sub">${esc(carLabel(d.carId) || "بدون سيارة")}</span>
      <span class="sub">${job ? esc(STATUS[job.status] + " — " + (job.title || job.pickup)) : isOnline(d) ? "متاح" : esc(ago(toDate(d.updatedAt)))}</span>
    </li>`;
  }).join("") || '<li class="sub">لا يوجد سائقين بعد. أضفهم من تبويب السائقين.</li>';

  for (const [id, m] of markers) if (!state.drivers.has(id)) { map.removeLayer(m); markers.delete(id); }
  const withPos = drivers.filter(d => typeof d.lat === "number" && typeof d.lng === "number");
  for (const d of withPos) {
    const icon = L.divIcon({ className: "car-marker", html: `<div class="${isOnline(d) ? "on" : ""} ${speedOf(d) > SPEED_LIMIT ? "fast" : ""}">🚗 ${esc(d.name)}${speedOf(d) >= 5 ? " · " + speedOf(d) + " كم/س" : ""}</div>`, iconSize: [0, 0] });
    let m = markers.get(d.id);
    if (!m) {
      m = L.marker([d.lat, d.lng], { icon }).addTo(map).bindPopup("");
      markers.set(d.id, m);
    } else {
      m.setLatLng([d.lat, d.lng]).setIcon(icon);
    }
    m.setPopupContent(popupHtml(d));
  }
  if (!fittedOnce && withPos.length) {
    fittedOnce = true;
    map.invalidateSize(); // the map was created while the panel was still hidden
    map.fitBounds(L.latLngBounds(withPos.map(d => [d.lat, d.lng])).pad(0.3), { maxZoom: 14 });
  }
}

$("#driver-list").addEventListener("click", e => {
  const li = e.target.closest("li[data-id]");
  const m = li && markers.get(li.dataset.id);
  if (m) { map.setView(m.getLatLng(), 15); m.openPopup(); }
});

/* ---------- jobs ---------- */
$("#job-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  await addDoc(collection(db, "jobs"), {
    ...f,
    driverId: f.driverId || null,
    status: "new",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  e.target.reset();
});

$("#job-filter").addEventListener("click", e => {
  const b = e.target.closest("button[data-f]");
  if (!b) return;
  state.jobFilter = b.dataset.f;
  document.querySelectorAll("#job-filter button").forEach(x => x.classList.toggle("active", x === b));
  renderJobs();
});

function renderJobs() {
  const today = localDay();
  let jobs = [...state.jobs.values()].sort((a, b) => (toDate(b.createdAt)?.getTime() || Date.now()) - (toDate(a.createdAt)?.getTime() || Date.now()));
  if (state.jobFilter === "active") jobs = jobs.filter(j => !["done", "cancelled"].includes(j.status));
  if (state.jobFilter === "today") jobs = jobs.filter(j => localDay(toDate(j.createdAt) || new Date()) === today);
  const driverOpts = sortedDrivers().map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("");
  $("#jobs-table").innerHTML = '<tr><th>الطلب</th><th>من / إلى</th><th>العميل</th><th>السائق</th><th>الحالة</th><th></th></tr>'
    + (jobs.map(j => `<tr data-id="${esc(j.id)}">
      <td><b>${esc(j.title || "طلب")}</b><div class="sub">${esc(j.pickupTime)}${j.price ? " • " + esc(j.price) : ""}</div>${j.notes ? `<div class="sub">${esc(j.notes)}</div>` : ""}</td>
      <td>${esc(j.pickup)}<div class="sub">${esc(j.dropoff)}</div></td>
      <td>${esc(j.customerName)}<div class="sub">${esc(j.customerPhone)}</div></td>
      <td><select data-act="assign"><option value="">—</option>${driverOpts}</select></td>
      <td><span class="badge ${esc(j.status)}">${esc(STATUS[j.status] || j.status)}</span><div class="sub">${esc(ago(toDate(j.updatedAt)))}</div></td>
      <td class="actions">
        ${["done", "cancelled"].includes(j.status) ? "" : '<button class="small ghost" data-act="done">تم</button><button class="small danger" data-act="cancel">إلغاء</button>'}
        <button class="small danger" data-act="delete">حذف</button>
      </td></tr>`).join("") || '<tr><td colspan="6" class="sub">لا توجد طلبات</td></tr>');
  document.querySelectorAll("#jobs-table tr[data-id]").forEach(tr => {
    tr.querySelector("select").value = state.jobs.get(tr.dataset.id).driverId || "";
  });
}

$("#jobs-table").addEventListener("change", async e => {
  if (e.target.dataset.act !== "assign") return;
  const id = e.target.closest("tr").dataset.id;
  // A new driver starts the job from the beginning
  await updateDoc(doc(db, "jobs", id), { driverId: e.target.value || null, status: "new", updatedAt: serverTimestamp() });
});
$("#jobs-table").addEventListener("click", async e => {
  const act = e.target.dataset.act;
  const tr = e.target.closest("tr[data-id]");
  if (!act || !tr || act === "assign") return;
  const ref = doc(db, "jobs", tr.dataset.id);
  if (act === "done") await updateDoc(ref, { status: "done", doneAt: serverTimestamp(), updatedAt: serverTimestamp() });
  if (act === "cancel" && confirm("إلغاء هذا الطلب؟")) await updateDoc(ref, { status: "cancelled", updatedAt: serverTimestamp() });
  if (act === "delete" && confirm("حذف الطلب نهائياً؟")) await deleteDoc(ref);
});

/* ---------- drivers ---------- */
$("#driver-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const msg = $("#driver-msg");
  msg.className = "wide msg";
  msg.textContent = "جاري الإضافة…";
  try {
    const cred = await createUserWithEmailAndPassword(creatorAuth, emailFromPhone(f.phone), f.password);
    await signOut(creatorAuth);
    await setDoc(doc(db, "drivers", cred.user.uid), {
      name: f.name.trim(), phone: f.phone.trim(), carId: f.carId || null, online: false, createdAt: serverTimestamp()
    });
    msg.textContent = `تمت الإضافة. يدخل السائق في التطبيق برقم ${f.phone} وكلمة المرور التي كتبتها.`;
    e.target.reset();
  } catch (err) {
    msg.className = "wide msg warn";
    msg.textContent = err.code === "auth/email-already-in-use" ? "هذا الرقم مسجل من قبل." : "تعذرت الإضافة: " + (err.code || err.message);
  }
});

function renderDrivers() {
  const carOpts = '<option value="">— بدون سيارة —</option>' + [...state.cars.values()].map(c => `<option value="${esc(c.id)}">${esc(carLabel(c.id))}</option>`).join("");
  const today = localDay();
  $("#drivers-table").innerHTML = '<tr><th>السائق</th><th>الحالة</th><th>السيارة</th><th>طلبات اليوم</th><th></th></tr>'
    + (sortedDrivers().map(d => {
      const doneToday = [...state.jobs.values()].filter(j => j.driverId === d.id && j.status === "done" && localDay(toDate(j.doneAt) || toDate(j.updatedAt) || new Date()) === today).length;
      return `<tr data-id="${esc(d.id)}">
        <td><b>${esc(d.name)}</b><div class="sub">${esc(d.phone)}</div></td>
        <td><span class="dot ${isOnline(d) ? "on" : ""}"></span> ${isOnline(d) ? "في الدوام" : "خارج الدوام"}<div class="sub">${esc(ago(toDate(d.updatedAt)))}${d.battery ? " • 🔋" + d.battery + "%" : ""}</div></td>
        <td><select data-act="car">${carOpts}</select></td>
        <td>${doneToday}</td>
        <td class="actions"><button class="small danger" data-act="delete">حذف</button></td>
      </tr>`;
    }).join("") || '<tr><td colspan="5" class="sub">لا يوجد سائقين بعد</td></tr>');
  document.querySelectorAll("#drivers-table tr[data-id]").forEach(tr => {
    tr.querySelector("select").value = state.drivers.get(tr.dataset.id).carId || "";
  });
}

$("#drivers-table").addEventListener("change", async e => {
  if (e.target.dataset.act !== "car") return;
  await updateDoc(doc(db, "drivers", e.target.closest("tr").dataset.id), { carId: e.target.value || null });
});
$("#drivers-table").addEventListener("click", async e => {
  if (e.target.dataset.act !== "delete") return;
  const id = e.target.closest("tr").dataset.id;
  if (!confirm("حذف " + driverName(id) + "؟ لن يستطيع استخدام التطبيق بعد الآن.")) return;
  await deleteDoc(doc(db, "drivers", id));
});

/* ---------- cars ---------- */
$("#car-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  await addDoc(collection(db, "cars"), { ...f, odometer: f.odometer ? Number(f.odometer) : null, createdAt: serverTimestamp() });
  e.target.reset();
});

function renderCars() {
  const soon = localDay(new Date(Date.now() + 14 * 86400000));
  const flag = date => date ? (date <= soon ? `<span class="warn">${esc(date)}</span>` : esc(date)) : "—";
  $("#cars-table").innerHTML = '<tr><th>السيارة</th><th>السائق</th><th>العداد</th><th>الصيانة القادمة</th><th>انتهاء الرخصة</th><th></th></tr>'
    + ([...state.cars.values()].map(c => {
      const drivers = [...state.drivers.values()].filter(d => d.carId === c.id).map(d => d.name).join("، ");
      return `<tr data-id="${esc(c.id)}">
        <td><b>${esc(c.plate)}</b><div class="sub">${esc([c.model, c.color].filter(Boolean).join(" • "))}</div>${c.notes ? `<div class="sub">${esc(c.notes)}</div>` : ""}</td>
        <td>${esc(drivers || "—")}</td>
        <td>${c.odometer != null ? esc(Number(c.odometer).toLocaleString("ar-EG")) + " كم" : "—"} <button class="small ghost" data-act="odo">تعديل</button></td>
        <td>${flag(c.nextService)}</td>
        <td>${flag(c.licenseExpiry)}</td>
        <td class="actions"><button class="small danger" data-act="delete">حذف</button></td>
      </tr>`;
    }).join("") || '<tr><td colspan="6" class="sub">لا توجد سيارات بعد</td></tr>');
}

$("#cars-table").addEventListener("click", async e => {
  const act = e.target.dataset.act;
  const tr = e.target.closest("tr[data-id]");
  if (!act || !tr) return;
  const ref = doc(db, "cars", tr.dataset.id);
  if (act === "odo") {
    const v = prompt("قراءة العداد الحالية (كم):", state.cars.get(tr.dataset.id).odometer ?? "");
    if (v !== null && v.trim() !== "" && !isNaN(Number(v))) await updateDoc(ref, { odometer: Number(v) });
  }
  if (act === "delete" && confirm("حذف السيارة؟")) await deleteDoc(ref);
});

/* ---------- route history ---------- */
let trackLayer = null;
const km = (a, b) => {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

$("#track-form").addEventListener("submit", async e => {
  e.preventDefault();
  const { driverId, date } = Object.fromEntries(new FormData(e.target));
  const info = $("#track-info");
  if (trackLayer) { trackMap.removeLayer(trackLayer); trackLayer = null; }
  const snap = await getDoc(doc(db, "tracks", driverId + "_" + date));
  const points = (snap.exists() ? snap.data().points || [] : [])
    .map(p => ({ lat: p.lat, lng: p.lng, t: toDate(p.t) }))
    .sort((a, b) => a.t - b.t);
  if (points.length < 2) {
    info.innerHTML = "لا يوجد مسار مسجّل لهذا السائق في هذا اليوم.";
    return;
  }
  let dist = 0;
  for (let i = 1; i < points.length; i++) dist += km(points[i - 1], points[i]);
  const line = L.polyline(points.map(p => [p.lat, p.lng]), { color: "#0f5c4d", weight: 5 });
  const start = L.circleMarker([points[0].lat, points[0].lng], { radius: 8, color: "#1e8e3e", fillOpacity: 1 }).bindTooltip("البداية");
  const end = L.circleMarker([points.at(-1).lat, points.at(-1).lng], { radius: 8, color: "#c5221f", fillOpacity: 1 }).bindTooltip("النهاية");
  trackLayer = L.layerGroup([line, start, end]).addTo(trackMap);
  trackMap.fitBounds(line.getBounds().pad(0.15));
  const time = d => d ? d.toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" }) : "";
  info.innerHTML = `<b>${esc(driverName(driverId))}</b><br>
    المسافة: <b>${dist.toFixed(1)} كم</b><br>
    من ${time(points[0].t)} إلى ${time(points.at(-1).t)}<br>
    <span class="sub">${points.length} نقطة</span>`;
});
