// إشعارات الويب للطلاب — اشتراك اختياري، بدون إزعاج، ويحترم قرار المستخدم.
import { getApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, query, limitToLast, onValue } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

const PREF_KEY = "userNotif.v1"; // { state: 'on' | 'off' | 'dismissed', ts }
const LAST_KEY = "userNotif.lastEventTs";
const DISMISS_DAYS = 14;

const supported =
  typeof window !== "undefined" &&
  "Notification" in window &&
  "serviceWorker" in navigator &&
  window.isSecureContext;

const readPref = () => {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) || "null") || {};
  } catch {
    return {};
  }
};
const writePref = (state) => {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ state, ts: Date.now() }));
  } catch {}
};
const toast = (m) => (window.__exam && window.__exam.showToast ? window.__exam.showToast(m) : null);

let swReg = null;
async function registerSW() {
  if (swReg || !supported) return swReg;
  try {
    swReg = await navigator.serviceWorker.register("./sw.js");
  } catch (e) {
    console.warn("sw register failed", e);
  }
  return swReg;
}

const isEnabled = () => supported && Notification.permission === "granted" && readPref().state !== "off";

// ---------- opt-in card (يظهر في صفحة الطالب فقط، ولا يطلب إذن المتصفح إلا بعد ضغطة صريحة) ----------
function renderCard() {
  const card = document.getElementById("userNotifCard");
  if (!card) return;
  if (!supported || Notification.permission === "denied") {
    card.hidden = true; // رفض المستخدم: لا نلحّ عليه
    return;
  }
  const pref = readPref();
  if (Notification.permission === "granted") {
    card.hidden = false;
    if (pref.state === "off") {
      card.innerHTML = `<p class="state">🔕 إشعارات الامتحانات الجديدة متوقفة</p>
        <div class="unotif-actions"><button class="on" data-act="enable">🔔 تشغيل</button></div>`;
    } else {
      card.innerHTML = `<p class="state">🔔 إشعارات الامتحانات الجديدة مفعّلة على هذا الجهاز</p>
        <div class="unotif-actions"><button class="off" data-act="disable">إيقاف الإشعارات</button></div>`;
    }
    return;
  }
  // permission === 'default'
  const dismissedRecently = pref.state === "dismissed" && Date.now() - (pref.ts || 0) < DISMISS_DAYS * 86400000;
  if (dismissedRecently) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  card.innerHTML = `<p>🔔 عايز يوصلك إشعار لما ينزل امتحان جديد؟</p>
    <div class="unotif-actions">
      <button class="on" data-act="allow">تفعيل الإشعارات</button>
      <button class="off" data-act="later">مش دلوقتي</button>
    </div>`;
}

async function onCardClick(e) {
  const act = e.target?.dataset?.act;
  if (!act) return;
  if (act === "later") {
    writePref("dismissed");
  } else if (act === "disable") {
    writePref("off");
    toast("🔕 تم إيقاف الإشعارات");
  } else if (act === "enable") {
    writePref("on");
    toast("🔔 تم تشغيل الإشعارات");
  } else if (act === "allow") {
    try {
      const res = await Notification.requestPermission();
      if (res === "granted") {
        writePref("on");
        await registerSW();
        toast("🔔 تم تفعيل الإشعارات");
      } else if (res === "denied") {
        writePref("off");
      } else {
        writePref("dismissed");
      }
    } catch (err) {
      console.warn(err);
    }
  }
  renderCard();
}

// ---------- show a notification ----------
async function notify(ev) {
  const title = ev.title || "تم نشر امتحان جديد";
  const body = ev.body || "";
  const url = `./?exam=${encodeURIComponent(ev.examId || "")}`;
  const opts = {
    body,
    icon: "./img/app.png",
    badge: "./img/app.png",
    dir: "rtl",
    lang: "ar",
    tag: "exam-" + (ev.id || ev.examId || "x"),
    data: { url, examId: ev.examId || null },
  };
  try {
    const reg = (await registerSW()) || (await navigator.serviceWorker.ready);
    if (reg && reg.showNotification) return await reg.showNotification(title, opts);
  } catch (e) {
    console.warn("sw notification failed", e);
  }
  try {
    new Notification(title, opts);
  } catch (e) {
    console.warn("notification failed", e);
  }
}

// ---------- listen to public events (real-time) ----------
function startListening() {
  const db = getDatabase(getApp());
  let first = true;
  onValue(query(ref(db, "publicEvents"), limitToLast(10)), (snap) => {
    const events = Object.entries(snap.val() || {})
      .map(([id, v]) => ({ id, ...v }))
      .filter((v) => v && v.type === "exam" && v.ts)
      .sort((a, b) => a.ts - b.ts);
    const max = events.reduce((m, v) => Math.max(m, v.ts), 0);
    let last = Number(localStorage.getItem(LAST_KEY)) || 0;
    if (first) {
      first = false;
      if (!last) {
        // أول تشغيل: لا نرسل إشعارات عن أحداث قديمة
        try {
          localStorage.setItem(LAST_KEY, String(max || Date.now()));
        } catch {}
        return;
      }
    }
    const fresh = events.filter((v) => v.ts > last);
    if (!fresh.length) return;
    try {
      localStorage.setItem(LAST_KEY, String(max));
    } catch {}
    if (!isEnabled()) return;
    fresh.slice(-3).forEach((ev) => {
      notify(ev);
      if (document.visibilityState === "visible") toast(`🔔 ${ev.title}: ${ev.body || ""}`);
    });
  });
}

// ---------- deep link (?exam=ID أو ضغطة على الإشعار) ----------
function openExamHint(examId) {
  if (!examId || !window.setDeepExam) return;
  window.setDeepExam(examId);
  toast("📌 الامتحان الجديد متاح — سجّل اسمك وهتلاقيه متعلّم");
}

function init() {
  const card = document.getElementById("userNotifCard");
  if (card) {
    card.addEventListener("click", onCardClick);
    renderCard();
  }
  if (supported) {
    if (Notification.permission === "granted") registerSW();
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "open-exam") openExamHint(e.data.examId);
    });
  }
  const id = new URLSearchParams(location.search).get("exam");
  if (id) {
    openExamHint(id);
    try {
      history.replaceState(null, "", location.pathname);
    } catch {}
  }
  try {
    startListening();
  } catch (e) {
    console.warn("notifications listener failed", e);
  }
}
init();
