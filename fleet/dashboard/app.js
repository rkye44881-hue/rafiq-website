/* Go2cairo control panel: live map, alerts, jobs, drivers, cars and oil changes, reports, route history.
   Data lives in Firebase (settings in firebase-config.json). */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, query, where, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { loadMaps } from "./maps.js";

const DRIVER_EMAIL_DOMAIN = "drivers.rafiq.app"; // same as Driver.kt in the Android app
const ONLINE_WINDOW_MS = 10 * 60 * 1000;         // the app sends at least every 2 minutes while on shift
const LOST_AFTER_MS = 6 * 60 * 1000;             // on shift but silent this long: alert
const LOW_BATTERY = 15;                          // %
const SPEED_LIMIT = 100;                         // km/h: faster than this shows in red
const OIL_EVERY_KM = 5000;                       // default oil change interval
const TRAIL_POINTS = 60;                         // the line behind each moving car

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
// A moving phone reports every 5 seconds, so no report for 30 seconds means the car is standing still
const speedOf = d => isOnline(d) && Date.now() - toDate(d.updatedAt).getTime() < 30000 ? Math.round(d.speed || 0) : 0;
// On shift (the phone never said it stopped) but no report for a while: phone off, no signal, or the app was closed
const isLost = d => d.online && toDate(d.updatedAt) && Date.now() - toDate(d.updatedAt).getTime() > LOST_AFTER_MS;
const num = v => Number(String(v ?? "").replace(/[٠-٩]/g, c => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/[^\d.]/g, "")) || 0;
const fmt = n => Math.round(n).toLocaleString("ar-EG");
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

const state = { drivers: new Map(), cars: new Map(), jobs: new Map(), jobFilter: "active", driverFilter: "all", kmDaily: [], follow: null };
const makeMap = await loadMaps(config);
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
  if (currentTab === "map") map.invalidate();
  if (currentTab === "tracks") trackMap.invalidate();
  if (currentTab === "cars" || currentTab === "reports") loadKm().then(() => { renderCars(); renderAlerts(); });
  if (currentTab === "expenses") loadExpenses();
});

/* ---------- maps ---------- */
const map = makeMap($("#map"));
const trackMap = makeMap($("#track-map"));
map.onUserMove(() => { if (state.follow) { state.follow = null; renderMap(); } });
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
  setReportPeriod("today");
  loadKm().then(() => { renderCars(); renderAlerts(); });
  setTimeout(() => map.invalidate(), 50);
}

// "last seen" times, online dots and alerts age even without new data
setInterval(() => { if (state.drivers.size) { renderMap(); renderAlerts(); } }, 20000);

function renderAll() {
  renderSelects();
  renderMap();
  renderAlerts();
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
    + (d.battery ? `البطارية: ${d.battery}%${d.battery < LOW_BATTERY ? " ⚠️" : ""}<br>` : "")
    + `آخر تحديث: ${ago(toDate(d.updatedAt))}`
    + (job ? `<br><br>الطلب: ${esc(job.title || job.pickup)}<br>${STATUS[job.status] || ""}` : "")
    + (d.phone ? `<br><a href="tel:${esc(d.phone)}">${esc(d.phone)}</a>` : "");
}

function pinHtml(d) {
  const v = speedOf(d);
  const cls = [isOnline(d) ? "on" : "", isLost(d) ? "lost" : "", v > SPEED_LIMIT ? "fast" : ""].join(" ");
  // Moving: an arrow turned to where the car is heading. Standing: a dot.
  const head = v >= 5 ? `<span class="arrow" style="transform:rotate(${Math.round(d.heading || 0)}deg)"></span>` : `<span class="arrow still"></span>`;
  return `<div class="pin ${cls}">${head}<span class="label">${esc(d.name)}${v >= 5 ? " · " + v + " كم/س" : ""}</span></div>`;
}

// Smooth movement: each new position is reached gradually over about the time until the next report
const anim = new Map();   // id -> { from, to, start, dur, pos }
const trails = new Map(); // id -> recent positions
function animateTo(id, to) {
  const a = anim.get(id);
  if (!a) { anim.set(id, { from: to, to, start: 0, dur: 0, pos: to }); map.move(id, to); return; }
  if (a.to.lat === to.lat && a.to.lng === to.lng) return;
  anim.set(id, { from: a.pos, to, start: performance.now(), dur: 4800, pos: a.pos });
}
function frame(now) {
  for (const [id, a] of anim) {
    if (!a.dur) continue;
    const t = Math.min(1, (now - a.start) / a.dur);
    a.pos = { lat: a.from.lat + (a.to.lat - a.from.lat) * t, lng: a.from.lng + (a.to.lng - a.from.lng) * t };
    map.move(id, a.pos);
    if (state.follow === id) map.panTo(a.pos);
    if (t >= 1) a.dur = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function renderMap() {
  const drivers = sortedDrivers();
  const online = drivers.filter(isOnline);
  const busy = online.filter(d => activeJobOf(d.id));
  $("#stats").innerHTML =
    `<div class="stat"><b>${online.length}</b><span>في الدوام</span></div>`
    + `<div class="stat"><b>${busy.length}</b><span>في طلب</span></div>`
    + `<div class="stat"><b>${[...state.jobs.values()].filter(j => j.status === "new").length}</b><span>طلبات تنتظر</span></div>`;

  const onCount = drivers.filter(isOnline).length;
  $("#list-toggle").innerHTML = `<span>السائقين: <span style="color:var(--green)">● ${onCount} متصل</span> • ${drivers.length - onCount} غير متصل</span><span class="arrow-icon">▲</span>`;
  const shown = state.driverFilter === "on" ? drivers.filter(isOnline) : state.driverFilter === "off" ? drivers.filter(d => !isOnline(d)) : drivers;
  $("#driver-list").innerHTML = shown.map(d => {
    const job = activeJobOf(d.id);
    const status = isLost(d) ? `<span class="warn">انقطع الاتصال ${esc(ago(toDate(d.updatedAt)))}</span>`
      : esc(job ? STATUS[job.status] + " — " + (job.title || job.pickup) : isOnline(d) ? "متاح" : ago(toDate(d.updatedAt)));
    return `<li data-id="${esc(d.id)}" class="${state.follow === d.id ? "following" : ""}">
      <span class="name"><span class="dot ${isLost(d) ? "lost" : isOnline(d) ? "on" : ""}"></span>${esc(d.name)}${speedTag(d)}</span>
      <span class="sub">${esc(carLabel(d.carId) || "بدون سيارة")}${d.battery && isOnline(d) ? " • 🔋" + d.battery + "%" : ""}</span>
      <span class="sub">${status}</span>
      ${typeof d.lat === "number" ? `<button class="small ghost follow" data-follow="${esc(d.id)}">${state.follow === d.id ? "إيقاف المتابعة" : "🎯 تابع العربية"}</button>` : ""}
    </li>`;
  }).join("") || (drivers.length ? '<li class="sub">لا يوجد سائقين هنا</li>' : '<li class="sub">لا يوجد سائقين بعد. أضفهم من تبويب السائقين.</li>');

  for (const id of map.ids()) if (!state.drivers.has(id)) { map.remove(id); anim.delete(id); map.line("trail-" + id, []); }
  const withPos = drivers.filter(d => typeof d.lat === "number" && typeof d.lng === "number");
  for (const d of withPos) {
    const p = { lat: d.lat, lng: d.lng };
    map.upsert(d.id, anim.get(d.id)?.pos || p, pinHtml(d), popupHtml(d));
    animateTo(d.id, p);
    // The line behind the car: where it went in the last few minutes
    const tr = trails.get(d.id) || [];
    const last = tr.at(-1);
    if (!last || last.lat !== p.lat || last.lng !== p.lng) tr.push(p);
    if (tr.length > TRAIL_POINTS) tr.shift();
    trails.set(d.id, tr);
    map.line("trail-" + d.id, isOnline(d) ? tr : [], { color: "#1e8e3e", weight: 4, opacity: 0.55 });
  }
  if (!fittedOnce && withPos.length) {
    fittedOnce = true;
    map.fit(withPos.map(d => ({ lat: d.lat, lng: d.lng })), 14);
  }
}

// The list folds away to give the map the screen; the choice is remembered on this device
const side = $("#tab-map .side");
try { if (localStorage.getItem("listFolded") === "1" || (localStorage.getItem("listFolded") === null && innerWidth < 760)) side.classList.add("folded"); } catch (e) {}
$("#list-toggle").addEventListener("click", () => {
  side.classList.toggle("folded");
  try { localStorage.setItem("listFolded", side.classList.contains("folded") ? "1" : "0"); } catch (e) {}
  setTimeout(() => map.invalidate(), 50);
});
$("#driver-filter").addEventListener("click", e => {
  const b = e.target.closest("button[data-f]");
  if (!b) return;
  state.driverFilter = b.dataset.f;
  document.querySelectorAll("#driver-filter button").forEach(x => x.classList.toggle("active", x === b));
  renderMap();
});

$("#driver-list").addEventListener("click", e => {
  const f = e.target.closest("[data-follow]");
  if (f) {
    state.follow = state.follow === f.dataset.follow ? null : f.dataset.follow;
    if (state.follow) {
      const a = anim.get(state.follow);
      if (a) map.setView(a.pos, 16);
    }
    renderMap();
    return;
  }
  const li = e.target.closest("li[data-id]");
  const a = li && anim.get(li.dataset.id);
  if (a) { map.setView(a.pos, 15); map.openPopup(li.dataset.id); }
});

/* ---------- alerts ---------- */
function renderAlerts() {
  const alerts = [];
  for (const d of state.drivers.values()) {
    if (isLost(d)) alerts.push(`📵 انقطع الاتصال بـ <b>${esc(d.name)}</b> وهو في الدوام — آخر ظهور ${esc(ago(toDate(d.updatedAt)))}`);
    else if (isOnline(d) && d.battery && d.battery < LOW_BATTERY) alerts.push(`🪫 بطارية <b>${esc(d.name)}</b> ${d.battery}%`);
    if (speedOf(d) > SPEED_LIMIT) alerts.push(`⚠️ <b>${esc(d.name)}</b> سرعته ${speedOf(d)} كم/س`);
  }
  for (const c of state.cars.values()) {
    const o = oilStatus(c);
    if (o && o.left < 0) alerts.push(`🛢 <b>${esc(c.plate)}</b> متأخرة على تغيير الزيت ${fmt(-o.left)} كم`);
  }
  $("#alerts").innerHTML = alerts.map(a => `<div class="alert">${a}</div>`).join("");
  const badge = $("#alert-count");
  badge.textContent = alerts.length;
  show(badge, alerts.length > 0);
}

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
  await addDoc(collection(db, "cars"), {
    ...f,
    odometer: f.odometer ? num(f.odometer) : null,
    odometerAt: f.odometer ? serverTimestamp() : null,
    oilEveryKm: f.oilEveryKm ? num(f.oilEveryKm) : OIL_EVERY_KM,
    lastOilKm: f.lastOilKm ? num(f.lastOilKm) : null,
    createdAt: serverTimestamp()
  });
  e.target.reset();
});

// Kilometres per car per day (sent by the driver app), kept for 6 months back
let kmLoadedAt = 0;
async function loadKm() {
  if (Date.now() - kmLoadedAt < 120000) return;
  kmLoadedAt = Date.now();
  const from = localDay(new Date(Date.now() - 183 * 86400000));
  const snap = await getDocs(query(collection(db, "kmDaily"), where("date", ">=", from))).catch(() => null);
  if (snap) state.kmDaily = snap.docs.map(d => d.data());
}

/* Odometer now = the last reading (typed by the driver at the start of a shift, or here)
   plus the GPS kilometres driven since that day. */
function odometerNow(c) {
  if (c.odometer == null) return null;
  const since = localDay(toDate(c.odometerAt) || new Date(0));
  const extra = state.kmDaily.filter(k => k.carId === c.id && k.date >= since).reduce((s, k) => s + (k.km || 0), 0);
  return Number(c.odometer) + extra;
}
function oilStatus(c) {
  const now = odometerNow(c);
  if (now == null || c.lastOilKm == null) return null;
  return { now, left: Number(c.lastOilKm) + Number(c.oilEveryKm || OIL_EVERY_KM) - now };
}

function renderCars() {
  const soon = localDay(new Date(Date.now() + 14 * 86400000));
  const flag = date => date ? (date <= soon ? `<span class="warn">${esc(date)}</span>` : esc(date)) : "—";
  $("#cars-table").innerHTML = '<tr><th>السيارة</th><th>السائق</th><th>العداد</th><th>تغيير الزيت</th><th>الصيانة القادمة</th><th>انتهاء الرخصة</th><th></th></tr>'
    + ([...state.cars.values()].map(c => {
      const drivers = [...state.drivers.values()].filter(d => d.carId === c.id).map(d => d.name).join("، ");
      const now = odometerNow(c);
      const o = oilStatus(c);
      const oil = !o ? `<span class="sub">سجّل عداد آخر تغيير</span>`
        : o.left < 0 ? `<span class="warn">متأخر ${fmt(-o.left)} كم</span>`
        : o.left < 500 ? `<span class="soon">باقي ${fmt(o.left)} كم</span>` : `باقي ${fmt(o.left)} كم`;
      return `<tr data-id="${esc(c.id)}">
        <td><b>${esc(c.plate)}</b><div class="sub">${esc([c.model, c.color].filter(Boolean).join(" • "))}</div>${c.notes ? `<div class="sub">${esc(c.notes)}</div>` : ""}</td>
        <td>${esc(drivers || "—")}</td>
        <td>${now != null ? fmt(now) + " كم" : "—"}<div class="sub">${c.odometerAt ? "آخر قراءة " + esc(ago(toDate(c.odometerAt))) : ""}</div><button class="small ghost" data-act="odo">تعديل</button></td>
        <td>${oil}<div class="sub">كل ${fmt(c.oilEveryKm || OIL_EVERY_KM)} كم</div><button class="small ghost" data-act="oil">🛢 تم التغيير</button></td>
        <td>${flag(c.nextService)}</td>
        <td>${flag(c.licenseExpiry)}</td>
        <td class="actions"><button class="small ghost" data-act="every">الزيت كل كام كم</button><button class="small danger" data-act="delete">حذف</button></td>
      </tr>`;
    }).join("") || '<tr><td colspan="7" class="sub">لا توجد سيارات بعد</td></tr>');
}

$("#cars-table").addEventListener("click", async e => {
  const act = e.target.dataset.act;
  const tr = e.target.closest("tr[data-id]");
  if (!act || !tr) return;
  const c = state.cars.get(tr.dataset.id);
  const ref = doc(db, "cars", c.id);
  const ask = (msg, def) => {
    const v = prompt(msg, def ?? "");
    return v !== null && v.trim() !== "" && num(v) > 0 ? num(v) : null;
  };
  if (act === "odo") {
    const v = ask("قراءة العداد الحالية (كم):", c.odometer);
    if (v != null) await updateDoc(ref, { odometer: v, odometerAt: serverTimestamp() });
  }
  if (act === "oil") {
    const now = odometerNow(c);
    const v = ask("عداد العربية وقت تغيير الزيت (كم):", now != null ? Math.round(now) : "");
    if (v != null) await updateDoc(ref, { lastOilKm: v, lastOilAt: serverTimestamp() });
  }
  if (act === "every") {
    const v = ask("تغيير الزيت كل كام كيلو؟", c.oilEveryKm || OIL_EVERY_KM);
    if (v != null) await updateDoc(ref, { oilEveryKm: v });
  }
  if (act === "delete" && confirm("حذف السيارة؟")) await deleteDoc(ref);
});

/* ---------- expenses ---------- */
const EXPENSE_TYPES = { fuel: "⛽ بنزين", toll: "🛣 كارتة", parking: "🅿️ ركنة", wash: "🧽 غسيل", repair: "🔧 صيانة", other: "أخرى" };
let expensePeriod = "today";

$("#expense-periods").addEventListener("click", e => {
  const b = e.target.closest("button[data-p]");
  if (!b) return;
  expensePeriod = b.dataset.p;
  document.querySelectorAll("#expense-periods button").forEach(x => x.classList.toggle("active", x === b));
  loadExpenses();
});

async function loadExpenses() {
  const out = $("#expense-out");
  try {
    await renderExpenses(out);
  } catch (err) {
    out.innerHTML = '<p class="warn">تعذر عرض المصاريف: ' + esc(err.code || err.message) + '</p>';
  }
}

async function renderExpenses(out) {
  const [from, to] = PERIODS[expensePeriod]();
  out.innerHTML = '<p class="sub">جاري التحميل…</p>';
  const snap = await getDocs(query(collection(db, "expenses"), where("date", ">=", from), where("date", "<=", to))).catch(err => err);
  if (!snap || !snap.docs) {
    out.innerHTML = '<p class="warn">تعذر التحميل' + (snap && snap.code === "permission-denied" ? ': قواعد الأمان الجديدة لسه ما اتنشرتش في Firebase.' : '.') + '</p>';
    return;
  }
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
  const total = list.reduce((t, x) => t + (x.amount || 0), 0);
  const sumBy = key => {
    const m = new Map();
    list.forEach(x => m.set(x[key], (m.get(x[key]) || 0) + (x.amount || 0)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const time = d => d ? d.toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
  out.innerHTML = `
    <div class="stats report-totals">
      <div class="stat"><b>${fmt(total)}</b><span>إجمالي (جنيه)</span></div>
      <div class="stat"><b>${list.length}</b><span>مصروف</span></div>
      <div class="stat"><b>${list.filter(x => x.hasPhoto).length}</b><span>بوصل</span></div>
    </div>
    ${list.length ? `<h3>حسب النوع</h3><p>${sumBy("type").map(([k, v]) => `${esc(EXPENSE_TYPES[k] || k)}: <b>${fmt(v)}</b>`).join(" &nbsp;•&nbsp; ")}</p>
    <h3>حسب السائق</h3><p>${sumBy("driverId").map(([k, v]) => `${esc(driverName(k))}: <b>${fmt(v)}</b>`).join(" &nbsp;•&nbsp; ")}</p>` : ""}
    <div class="table-wrap"><table><tr><th>الوقت</th><th>السائق</th><th>النوع</th><th>المبلغ</th><th>ملاحظة</th><th>الوصل</th><th></th></tr>
    ${list.map(x => `<tr data-id="${esc(x.id)}">
      <td>${esc(time(toDate(x.createdAt)))}</td>
      <td><b>${esc(driverName(x.driverId))}</b><div class="sub">${esc(carLabel(x.carId))}</div></td>
      <td>${esc(EXPENSE_TYPES[x.type] || x.type)}</td>
      <td><b>${fmt(x.amount || 0)}</b></td>
      <td>${esc(x.note)}</td>
      <td>${x.hasPhoto ? '<button class="small ghost" data-act="photo">📷 عرض</button>' : '<span class="sub">—</span>'}</td>
      <td><button class="small danger" data-act="delete">حذف</button></td>
    </tr>`).join("") || '<tr><td colspan="7" class="sub">لا توجد مصاريف في هذه الفترة</td></tr>'}
    </table></div>`;
}

$("#expense-out").addEventListener("click", async e => {
  const act = e.target.dataset.act;
  const tr = e.target.closest("tr[data-id]");
  if (!act || !tr) return;
  const id = tr.dataset.id;
  if (act === "photo") {
    const view = $("#photo-view");
    const img = view.querySelector("img");
    img.removeAttribute("src");
    view.classList.add("loading");
    show(view, true);
    const p = await getDoc(doc(db, "expensePhotos", id)).catch(() => null);
    view.classList.remove("loading");
    if (p && p.exists()) img.src = "data:image/jpeg;base64," + p.data().data;
    else { show(view, false); alert("الصورة لسه ما وصلتش (ممكن السائق مفيش عنده نت)"); }
  }
  if (act === "delete" && confirm("حذف المصروف؟")) {
    await deleteDoc(doc(db, "expensePhotos", id)).catch(() => {});
    await deleteDoc(doc(db, "expenses", id));
    loadExpenses();
  }
});
$("#photo-view").addEventListener("click", e => { if (e.target.tagName !== "IMG") show($("#photo-view"), false); });

/* ---------- reports ---------- */
const PERIODS = {
  today: () => [localDay(), localDay()],
  yesterday: () => { const y = localDay(new Date(Date.now() - 86400000)); return [y, y]; },
  week: () => [localDay(new Date(Date.now() - 6 * 86400000)), localDay()],
  month: () => { const d = new Date(); return [localDay(new Date(d.getFullYear(), d.getMonth(), 1)), localDay()]; },
  lastMonth: () => { const d = new Date(); return [localDay(new Date(d.getFullYear(), d.getMonth() - 1, 1)), localDay(new Date(d.getFullYear(), d.getMonth(), 0))]; }
};
function setReportPeriod(p) {
  const [from, to] = PERIODS[p]();
  const f = $("#report-form");
  f.from.value = from;
  f.to.value = to;
  document.querySelectorAll("#report-periods button").forEach(b => b.classList.toggle("active", b.dataset.p === p));
}
$("#report-periods").addEventListener("click", e => {
  const b = e.target.closest("button[data-p]");
  if (!b) return;
  setReportPeriod(b.dataset.p);
  $("#report-form").requestSubmit();
});

let lastReport = null;
$("#report-form").addEventListener("submit", async e => {
  e.preventDefault();
  const { from, to } = Object.fromEntries(new FormData(e.target));
  const out = $("#report-out");
  out.innerHTML = '<p class="sub">جاري الحساب…</p>';
  const inRange = q => getDocs(query(collection(db, q), where("date", ">=", from), where("date", "<=", to))).then(s => s.docs.map(d => d.data())).catch(() => []);
  const [kms, shifts, expenses] = await Promise.all([inRange("kmDaily"), inRange("shifts"), inRange("expenses")]);
  const jobs = [...state.jobs.values()].filter(j => {
    if (j.status !== "done") return false;
    const day = localDay(toDate(j.doneAt) || toDate(j.updatedAt) || new Date());
    return day >= from && day <= to;
  });

  const byDriver = new Map();
  const row = id => byDriver.get(id) || byDriver.set(id, { days: new Set(), trips: 0, money: 0, km: 0, spent: 0 }).get(id);
  expenses.forEach(x => { if (x.driverId) row(x.driverId).spent += x.amount || 0; });
  shifts.forEach(s => row(s.driverId).days.add(s.date));
  kms.forEach(k => { const r = row(k.driverId); r.km += k.km || 0; r.days.add(k.date); });
  jobs.forEach(j => { if (!j.driverId) return; const r = row(j.driverId); r.trips++; r.money += num(j.price); });

  const byCar = new Map();
  const carRow = id => byCar.get(id) || byCar.set(id, { km: 0, readings: [] }).get(id);
  kms.forEach(k => { if (k.carId) carRow(k.carId).km += k.km || 0; });
  shifts.forEach(s => { if (s.carId && s.startKm != null) carRow(s.carId).readings.push(Number(s.startKm)); });

  const drivers = [...byDriver.entries()].map(([id, r]) => ({ name: driverName(id), days: r.days.size, trips: r.trips, money: r.money, km: r.km, spent: r.spent }));
  const cars = [...byCar.entries()].map(([id, r]) => {
    const c = state.cars.get(id);
    const odo = r.readings.length > 1 ? Math.max(...r.readings) - Math.min(...r.readings) : null;
    return { name: c ? c.plate + (c.model ? " • " + c.model : "") : "سيارة محذوفة", km: r.km, odo };
  });
  const total = drivers.reduce((t, d) => ({ trips: t.trips + d.trips, money: t.money + d.money, km: t.km + d.km, spent: t.spent + d.spent }), { trips: 0, money: 0, km: 0, spent: 0 });
  lastReport = { from, to, drivers, cars };

  out.innerHTML = `
    <div class="stats report-totals">
      <div class="stat"><b>${fmt(total.trips)}</b><span>رحلة مكتملة</span></div>
      <div class="stat"><b>${fmt(total.money)}</b><span>الإيراد</span></div>
      <div class="stat"><b>${fmt(total.km)}</b><span>كيلومتر</span></div>
      <div class="stat"><b>${fmt(total.spent)}</b><span>مصاريف</span></div>
      <div class="stat"><b>${fmt(total.money - total.spent)}</b><span>الصافي</span></div>
    </div>
    <h3>السائقين</h3>
    <div class="table-wrap"><table><tr><th>السائق</th><th>أيام الدوام</th><th>الرحلات</th><th>الإيراد</th><th>المصاريف</th><th>كم (GPS)</th></tr>
    ${drivers.map(d => `<tr><td><b>${esc(d.name)}</b></td><td>${d.days}</td><td>${d.trips}</td><td>${fmt(d.money)}</td><td>${fmt(d.spent)}</td><td>${fmt(d.km)}</td></tr>`).join("") || '<tr><td colspan="6" class="sub">لا توجد بيانات في هذه الفترة</td></tr>'}
    </table></div>
    <h3>السيارات</h3>
    <div class="table-wrap"><table><tr><th>السيارة</th><th>كم (GPS)</th><th>كم حسب العداد</th></tr>
    ${cars.map(c => `<tr><td><b>${esc(c.name)}</b></td><td>${fmt(c.km)}</td><td>${c.odo != null ? fmt(c.odo) : '<span class="sub">محتاج قراءتين أو أكتر</span>'}</td></tr>`).join("") || '<tr><td colspan="3" class="sub">لا توجد بيانات في هذه الفترة</td></tr>'}
    </table></div>
    <p class="sub">الإيراد = مجموع خانة «السعر» في الطلبات المكتملة. «كم حسب العداد» = الفرق بين أول وآخر قراءة كتبها السائق في بداية الدوام.</p>
    <button class="ghost" id="report-csv">⬇️ تنزيل Excel (CSV)</button>`;
});

$("#report-out").addEventListener("click", e => {
  if (e.target.id !== "report-csv" || !lastReport) return;
  const r = lastReport;
  const lines = [["الفترة", r.from + " - " + r.to], [], ["السائق", "أيام الدوام", "الرحلات", "الإيراد", "المصاريف", "كم"]]
    .concat(r.drivers.map(d => [d.name, d.days, d.trips, Math.round(d.money), Math.round(d.spent), Math.round(d.km)]))
    .concat([[], ["السيارة", "كم GPS", "كم العداد"]])
    .concat(r.cars.map(c => [c.name, Math.round(c.km), c.odo ?? ""]));
  const csv = "\ufeff" + lines.map(l => l.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "go2cairo-report-" + r.from + "-" + r.to + ".csv";
  a.click();
});

/* ---------- route history ---------- */
const km = (a, b) => {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const STOP_MIN_MS = 10 * 60 * 1000;   // standing this long counts as a stop
const STOP_RADIUS_KM = 0.12;           // GPS drift while standing stays within this
const REPLAY_BASE = 60;                // at ×1, one minute of the day plays in one second
const REPLAY_GAP_CAP_MS = 60 * 1000;   // a long gap (stop, no signal) plays as at most one minute
const clock = d => d ? d.toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" }) : "";
const minutes = ms => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? Math.floor(m / 60) + " س " + (m % 60) + " د" : m + " د";
};

/* The phone only saves a point after moving 15 m, so standing still leaves a time gap
   between points that are close together. Points within a small circle for 10+ minutes = a stop. */
function findStops(points) {
  const stops = [];
  let i = 0;
  while (i < points.length - 1) {
    let j = i;
    while (j + 1 < points.length && km(points[i], points[j + 1]) <= STOP_RADIUS_KM) j++;
    // Left when the first point outside the circle was saved
    const leftAt = j + 1 < points.length ? points[j + 1].t : points[j].t;
    if (leftAt - points[i].t >= STOP_MIN_MS) {
      stops.push({ lat: points[i].lat, lng: points[i].lng, from: points[i].t, to: leftAt, ms: leftAt - points[i].t, ongoing: j + 1 >= points.length });
      i = j + 1;
    } else {
      i++;
    }
  }
  return stops;
}

// Replay: a car moves along the day's route; the line behind it fills in as it goes
const replay = { points: [], timeline: [], total: 0, pos: 0, speed: 1, playing: false, last: 0, drawn: 0 };
let stopIds = [];

function buildTimeline(points) {
  // Play time for each point, with long gaps shortened so a 40-minute stop does not take 40 seconds
  let acc = 0;
  replay.timeline = points.map((p, i) => {
    if (i) acc += Math.min(p.t - points[i - 1].t, REPLAY_GAP_CAP_MS);
    return acc;
  });
  replay.total = acc;
}

function replayAt(pos) {
  const tl = replay.timeline, pts = replay.points;
  let i = 1;
  while (i < tl.length - 1 && tl[i] < pos) i++;
  const a = pts[i - 1], b = pts[i];
  const span = tl[i] - tl[i - 1];
  const f = span > 0 ? Math.min(1, Math.max(0, (pos - tl[i - 1]) / span)) : 1;
  return {
    i,
    p: { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f },
    t: new Date(a.t.getTime() + (b.t - a.t) * f),
    heading: Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180 / Math.PI,
    kmh: span > 0 && b.t - a.t > 0 ? km(a, b) / ((b.t - a.t) / 3600000) : 0
  };
}

function drawReplay() {
  const r = replayAt(replay.pos);
  const moving = r.kmh >= 5 && r.kmh < 200;
  trackMap.upsert("replay", r.p, `<div class="pin on replay"><span class="arrow ${moving ? "" : "still"}" style="transform:rotate(${Math.round(r.heading)}deg)"></span><span class="label">${esc(clock(r.t))}${moving ? " · " + Math.round(r.kmh) + " كم/س" : ""}</span></div>`);
  // Redraw the played line only when it gains a point
  if (r.i !== replay.drawn) {
    replay.drawn = r.i;
    trackMap.line("played", replay.points.slice(0, r.i).map(p => ({ lat: p.lat, lng: p.lng })).concat([r.p]), { color: "#34a853", weight: 6 });
  }
  const bar = $("#replay-bar");
  if (bar) bar.value = Math.round(replay.pos / replay.total * 1000);
  const now = $("#replay-time");
  if (now) now.textContent = clock(r.t);
}

function replayFrame(ts) {
  if (!replay.playing) return;
  const dt = replay.last ? ts - replay.last : 0;
  replay.last = ts;
  replay.pos = Math.min(replay.total, replay.pos + dt * REPLAY_BASE * replay.speed);
  drawReplay();
  if (replay.pos >= replay.total) { setPlaying(false); return; }
  requestAnimationFrame(replayFrame);
}

function setPlaying(on) {
  replay.playing = on;
  replay.last = 0;
  const b = $("#replay-play");
  if (b) b.textContent = on ? "⏸ إيقاف" : "▶ تشغيل";
  if (on) {
    if (replay.pos >= replay.total) { replay.pos = 0; replay.drawn = 0; }
    requestAnimationFrame(replayFrame);
  }
}

$("#track-info").addEventListener("click", e => {
  if (e.target.id === "replay-play") setPlaying(!replay.playing);
  const sp = e.target.closest("[data-speed]");
  if (sp) {
    replay.speed = Number(sp.dataset.speed);
    document.querySelectorAll("#replay-speeds button").forEach(x => x.classList.toggle("active", x === sp));
  }
  const st = e.target.closest("[data-stop]");
  if (st) {
    const s = replay.stops[Number(st.dataset.stop)];
    trackMap.setView(s, 17);
    trackMap.openPopup("stop-" + st.dataset.stop);
  }
});
$("#track-info").addEventListener("input", e => {
  if (e.target.id !== "replay-bar") return;
  replay.pos = Number(e.target.value) / 1000 * replay.total;
  replay.drawn = -1;
  drawReplay();
});

$("#track-form").addEventListener("submit", async e => {
  e.preventDefault();
  const { driverId, date } = Object.fromEntries(new FormData(e.target));
  const info = $("#track-info");
  setPlaying(false);
  trackMap.line("route", []);
  trackMap.line("played", []);
  ["start", "end", "replay", ...stopIds].forEach(id => trackMap.remove(id));
  stopIds = [];
  const snap = await getDoc(doc(db, "tracks", driverId + "_" + date));
  const points = (snap.exists() ? snap.data().points || [] : [])
    .map(p => ({ lat: p.lat, lng: p.lng, t: toDate(p.t) }))
    .filter(p => p.t)
    .sort((a, b) => a.t - b.t);
  if (points.length < 2) {
    info.innerHTML = "لا يوجد مسار مسجّل لهذا السائق في هذا اليوم.";
    return;
  }
  let dist = 0;
  for (let i = 1; i < points.length; i++) dist += km(points[i - 1], points[i]);
  const path = points.map(p => ({ lat: p.lat, lng: p.lng }));
  trackMap.line("route", path, { color: "#7a8a85", weight: 5, opacity: 0.7 });
  trackMap.upsert("start", path[0], '<div class="pin dot-start"><span class="label">البداية</span></div>');
  trackMap.upsert("end", path.at(-1), '<div class="pin dot-end"><span class="label">النهاية</span></div>');

  const stops = findStops(points);
  stops.forEach((s, k) => {
    const id = "stop-" + k;
    stopIds.push(id);
    trackMap.upsert(id, s, `<div class="pin stop"><span class="label">⏸ ${esc(minutes(s.ms))}</span></div>`,
      `<b>وقفة ${esc(minutes(s.ms))}</b><br>من ${esc(clock(s.from))} إلى ${esc(s.ongoing ? "آخر نقطة " + clock(s.to) : clock(s.to))}`);
  });
  trackMap.fit(path, 17);

  replay.points = points;
  replay.stops = stops;
  replay.pos = 0;
  replay.drawn = -1;
  buildTimeline(points);
  const stopTotal = stops.reduce((t, s) => t + s.ms, 0);

  info.innerHTML = `<b>${esc(driverName(driverId))}</b><br>
    المسافة: <b>${dist.toFixed(1)} كم</b><br>
    من ${esc(clock(points[0].t))} إلى ${esc(clock(points.at(-1).t))}<br>
    <div class="replay">
      <div class="replay-row"><button id="replay-play" type="button">▶ تشغيل</button><b id="replay-time">${esc(clock(points[0].t))}</b></div>
      <input id="replay-bar" type="range" min="0" max="1000" value="0" aria-label="مكان العرض">
      <div class="filters" id="replay-speeds" dir="ltr">
        <button type="button" data-speed="1" class="active">×1</button>
        <button type="button" data-speed="2">×2</button>
        <button type="button" data-speed="3">×3</button>
        <button type="button" data-speed="4">×4</button>
        <button type="button" data-speed="8">×8</button>
      </div>
      <p class="sub">×1 = كل دقيقة من اليوم في ثانية</p>
    </div>
    <h3>الوقفات (10 دقايق أو أكتر): ${stops.length}${stops.length ? " — المجموع " + esc(minutes(stopTotal)) : ""}</h3>
    ${stops.map((s, k) => `<button type="button" class="stop-row ghost" data-stop="${k}">⏸ <b>${esc(minutes(s.ms))}</b> — ${esc(clock(s.from))} إلى ${esc(clock(s.to))}</button>`).join("") || '<p class="sub">مفيش وقفات طويلة</p>'}`;
  drawReplay();
});
