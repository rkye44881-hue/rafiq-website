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

const state = { drivers: new Map(), cars: new Map(), jobs: new Map(), jobFilter: "active", kmDaily: [], follow: null };
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

  $("#driver-list").innerHTML = drivers.map(d => {
    const job = activeJobOf(d.id);
    const status = isLost(d) ? `<span class="warn">انقطع الاتصال ${esc(ago(toDate(d.updatedAt)))}</span>`
      : esc(job ? STATUS[job.status] + " — " + (job.title || job.pickup) : isOnline(d) ? "متاح" : ago(toDate(d.updatedAt)));
    return `<li data-id="${esc(d.id)}" class="${state.follow === d.id ? "following" : ""}">
      <span class="name"><span class="dot ${isLost(d) ? "lost" : isOnline(d) ? "on" : ""}"></span>${esc(d.name)}${speedTag(d)}</span>
      <span class="sub">${esc(carLabel(d.carId) || "بدون سيارة")}${d.battery && isOnline(d) ? " • 🔋" + d.battery + "%" : ""}</span>
      <span class="sub">${status}</span>
      ${typeof d.lat === "number" ? `<button class="small ghost follow" data-follow="${esc(d.id)}">${state.follow === d.id ? "إيقاف المتابعة" : "🎯 تابع العربية"}</button>` : ""}
    </li>`;
  }).join("") || '<li class="sub">لا يوجد سائقين بعد. أضفهم من تبويب السائقين.</li>';

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
  const [kms, shifts] = await Promise.all([inRange("kmDaily"), inRange("shifts")]);
  const jobs = [...state.jobs.values()].filter(j => {
    if (j.status !== "done") return false;
    const day = localDay(toDate(j.doneAt) || toDate(j.updatedAt) || new Date());
    return day >= from && day <= to;
  });

  const byDriver = new Map();
  const row = id => byDriver.get(id) || byDriver.set(id, { days: new Set(), trips: 0, money: 0, km: 0 }).get(id);
  shifts.forEach(s => row(s.driverId).days.add(s.date));
  kms.forEach(k => { const r = row(k.driverId); r.km += k.km || 0; r.days.add(k.date); });
  jobs.forEach(j => { if (!j.driverId) return; const r = row(j.driverId); r.trips++; r.money += num(j.price); });

  const byCar = new Map();
  const carRow = id => byCar.get(id) || byCar.set(id, { km: 0, readings: [] }).get(id);
  kms.forEach(k => { if (k.carId) carRow(k.carId).km += k.km || 0; });
  shifts.forEach(s => { if (s.carId && s.startKm != null) carRow(s.carId).readings.push(Number(s.startKm)); });

  const drivers = [...byDriver.entries()].map(([id, r]) => ({ name: driverName(id), days: r.days.size, trips: r.trips, money: r.money, km: r.km }));
  const cars = [...byCar.entries()].map(([id, r]) => {
    const c = state.cars.get(id);
    const odo = r.readings.length > 1 ? Math.max(...r.readings) - Math.min(...r.readings) : null;
    return { name: c ? c.plate + (c.model ? " • " + c.model : "") : "سيارة محذوفة", km: r.km, odo };
  });
  const total = drivers.reduce((t, d) => ({ trips: t.trips + d.trips, money: t.money + d.money, km: t.km + d.km }), { trips: 0, money: 0, km: 0 });
  lastReport = { from, to, drivers, cars };

  out.innerHTML = `
    <div class="stats report-totals">
      <div class="stat"><b>${fmt(total.trips)}</b><span>رحلة مكتملة</span></div>
      <div class="stat"><b>${fmt(total.money)}</b><span>الإيراد</span></div>
      <div class="stat"><b>${fmt(total.km)}</b><span>كيلومتر</span></div>
    </div>
    <h3>السائقين</h3>
    <div class="table-wrap"><table><tr><th>السائق</th><th>أيام الدوام</th><th>الرحلات</th><th>الإيراد</th><th>كم (GPS)</th></tr>
    ${drivers.map(d => `<tr><td><b>${esc(d.name)}</b></td><td>${d.days}</td><td>${d.trips}</td><td>${fmt(d.money)}</td><td>${fmt(d.km)}</td></tr>`).join("") || '<tr><td colspan="5" class="sub">لا توجد بيانات في هذه الفترة</td></tr>'}
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
  const lines = [["الفترة", r.from + " - " + r.to], [], ["السائق", "أيام الدوام", "الرحلات", "الإيراد", "كم"]]
    .concat(r.drivers.map(d => [d.name, d.days, d.trips, Math.round(d.money), Math.round(d.km)]))
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

$("#track-form").addEventListener("submit", async e => {
  e.preventDefault();
  const { driverId, date } = Object.fromEntries(new FormData(e.target));
  const info = $("#track-info");
  trackMap.line("route", []);
  trackMap.remove("start");
  trackMap.remove("end");
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
  const path = points.map(p => ({ lat: p.lat, lng: p.lng }));
  trackMap.line("route", path);
  trackMap.upsert("start", path[0], '<div class="pin dot-start"><span class="label">البداية</span></div>');
  trackMap.upsert("end", path.at(-1), '<div class="pin dot-end"><span class="label">النهاية</span></div>');
  trackMap.fit(path, 17);
  const time = d => d ? d.toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" }) : "";
  info.innerHTML = `<b>${esc(driverName(driverId))}</b><br>
    المسافة: <b>${dist.toFixed(1)} كم</b><br>
    من ${time(points[0].t)} إلى ${time(points.at(-1).t)}<br>
    <span class="sub">${points.length} نقطة</span>`;
});
