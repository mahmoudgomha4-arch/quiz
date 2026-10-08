import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  onValue,
  update,
  get,
  push,
  remove,
  query,
  limitToLast,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

const FC = {
  apiKey: "AIzaSyBWgG8TPNLHtzToCC1aqsidwNjpSeKYLQo",
  authDomain: "arabic-exam-2024.firebaseapp.com",
  databaseURL: "https://arabic-exam-2024-default-rtdb.firebaseio.com",
  projectId: "arabic-exam-2024",
  appId: "1:694706485946:web:488bdd16b1ad37d1976083",
};
const app = initializeApp(FC);
const db = getDatabase(app);

// كلمة سر المالك الافتراضية محفوظة كـ hash (PBKDF2) وليس كنص صريح.
const OWNER_DEFAULT = {
  salt: "E3dhh/6S5BaU1O0u0SKUDA==",
  hash: "THYsBk2NC80ftMUAobNNpvmcW5DHnEFxv0DbR5Z7BzM=",
};
let adminAccounts = {};
let ownerProfile = { name: "مالك الموقع", photo: "" };
let pendingAdminProfilePhoto = null;
let pendingNewAdminPhoto = "";
let pendingSiteBackground = "";
let exams = [];
let bankQs = [];
let studentName = "";
let gradingTarget = null;
let cur = 0,
  answers = [],
  flags = [],
  timeLeft = 1800,
  timerInt = null;
let currentExamId = null;
let editingQIdx = -1,
  editingBankIdx = -1;
let qeCorrect = 0,
  bCorrect = 0;
let soundOn = true,
  fontSize = "normal";
let isPreview = false;
let statsCharts = {};
let bankPickerSelected = new Set();

function loadLocal() {
  const c = localStorage.getItem("color"),
    cd = localStorage.getItem("colorD");
  if (c) {
    setCSSVar("--P", c);
    if (cd) setCSSVar("--PD", cd);
    setCSSVar("--PL", c + "22");
  }
  soundOn = localStorage.getItem("sound") !== "false";
  fontSize = localStorage.getItem("fsize") || "normal";
  if (localStorage.getItem("dark") === "true")
    document.body.classList.add("dark");
  setTimeout(() => {
    if (typeof applyFontSize === "function") applyFontSize();
  }, 0);
}
function setCSSVar(k, v) {
  document.documentElement.style.setProperty(k, v);
}
loadLocal();

window.toggleDark = () => {
  const d = !document.body.classList.contains("dark");
  document.body.classList.toggle("dark", d);
  localStorage.setItem("dark", d);
  updateWelcomeBg();
};
function updateWelcomeBg() {
  const ws = document.getElementById("welcomeScreen");
  if (!ws) return;
  const dark = document.body.classList.contains("dark");
  const b = window._branding || {};
  const image = safeImageSource(b.backgroundImage);
  const presets = {
    ocean: dark
      ? "linear-gradient(145deg,#07111d,#12334a)"
      : "linear-gradient(145deg,#0d3548,#176c63)",
    sand: dark
      ? "linear-gradient(145deg,#1d1b17,#3b3021)"
      : "linear-gradient(145deg,#b98a4b,#f0d8a6)",
    night: "linear-gradient(145deg,#07111d,#172238)",
    olive: dark
      ? "linear-gradient(145deg,#111a18,#263a2d)"
      : "linear-gradient(145deg,#344a3d,#a8b98c)",
  };
  const overlay = dark
    ? "linear-gradient(145deg,rgba(5,12,22,.78),rgba(9,25,38,.82))"
    : "linear-gradient(145deg,rgba(7,26,38,.58),rgba(13,51,63,.5))";
  if (image && b.backgroundPreset === "custom") {
    ws.style.background = `${overlay},url("${image}") center/cover fixed no-repeat`;
  } else if (presets[b.backgroundPreset]) {
    ws.style.background = presets[b.backgroundPreset];
  } else if (dark) {
    ws.style.background =
      "linear-gradient(160deg,#070d1a 0%,#0f1929 50%,#081d3a 100%)";
  } else {
    ws.style.background =
      "linear-gradient(160deg,#0a1628 0%,#1a2a4a 50%,#0d3b6e 100%)";
  }
}

// ===== FIREBASE =====
onValue(ref(db, "globalNotification"), (snap) => {
  const n = snap.val();
  if (n && n.message) {
    const d = document.getElementById("notif");
    d.innerText = "📢 " + n.message;
    d.style.display = "block";
    setTimeout(() => (d.style.display = "none"), 9000);
  }
});

onValue(ref(db, "exams"), (snap) => {
  const d = snap.val();
  exams = d ? Object.values(d) : [];
  exams.forEach((e) => _examQCount.set(e.id, (e.questions || []).length));
  if (typeof fillExamSelect === "function") fillExamSelect();
  renderExamsList();
  refreshStudentExamList();
  if (currentExamId) {
    const ex = exams.find((e) => e.id === currentExamId);
    if (ex) renderExamDashboard(ex);
    else backToExamsList();
  }
});

onValue(ref(db, "bankQuestions"), (snap) => {
  const d = snap.val();
  bankQs = d && Array.isArray(d) ? d : d ? Object.values(d) : [];
  if (document.getElementById("adminPanel").style.display === "block")
    renderBankList();
});

function questionPoints(q) {
  const p = Number(q?.points);
  return Number.isFinite(p) && p > 0 ? p : 1;
}
function hasEssayQuestions(r) {
  return (r?.questionsSnapshot || []).some((q) => q.type === "essay");
}
function isResultGradingComplete(r) {
  return !hasEssayQuestions(r) || r.essayGraded === true;
}
const escapeExamHtml = (v) => esc(v);
const fmtNum = (n) => String(Math.round((Number(n) || 0) * 100) / 100);

// ===== (تم حذف الصفوف الدراسية) =====
// ===== WELCOME =====
window.showWelcome = async () => {
  const name = document.getElementById("nameInput").value.trim();
  const phone = document.getElementById("phoneInput").value.trim();
  if (name.split(" ").filter((x) => x).length < 3)
    return alert("الاسم يجب أن يكون ثلاثياً أو رباعياً");

  // Pick global phone visibility from any exam? we'll keep simple: require phone if any visible exam has phoneVisible!=false (default true)
  const visibleExams = exams.filter((e) => !e.archived);
  const phoneRequired = visibleExams.some((e) => e.phoneVisible !== false);
  if (phoneRequired && phone.length < 11)
    return alert("أدخل رقم هاتف صحيح (11 رقم)");

  studentName = name;
  saveStudentIdentity(name, phone);
  {
    const wn = document.getElementById("wStudentName");
    wn.innerHTML = "مرحباً، " + esc(name) + (matchAdminByName(name) ? " " + ADMIN_BADGE : "");
  }
  updateWelcomeBg();
  buildExamList();
  loadHonorForWelcome();
  document.getElementById("welcomeScreen").style.display = "block";
};

async function loadHonorForWelcome() {
  const sec = document.getElementById("honorSection");
  if (!sec) return;
  // exams visible to this student that have showHonor enabled
  const myExams = exams.filter(
    (e) =>
      !e.archived && e.showHonor,
  );
  if (!myExams.length) {
    sec.style.display = "none";
    sec.innerHTML = "";
    return;
  }
  let html =
    '<div class="honor-board"><div class="honor-board-title">🏆 لوحة الشرف 🏆</div>';
  for (const ex of myExams) {
    const list = await getExamResults(ex.id);
    const done = list.filter(isResultGradingComplete);
    if (!done.length) continue;
    const ranked = buildRankedList(done, 10);
    html += `<div class="honor-exam-block">
      <div class="honor-exam-name">${ex.emoji || "📋"} ${ex.name}</div>
      <div class="honor-podium">`;
    ranked.slice(0, 3).forEach((s) => {
      const pct = Math.round((s.score / s.total) * 100);
      const cls = s.rank === 1 ? "gold" : s.rank === 2 ? "silver" : "bronze";
      html += `<div class="honor-podium-card ${cls}">
        <div class="hp-medal">${s.medal}</div>
        <div class="hp-name">${s.name}</div>
        <div class="hp-pct">${pct}%</div>
        <div class="hp-score">${s.score}/${s.total}</div>
      </div>`;
    });
    html += "</div>";
    if (ranked.length > 3) {
      html += '<div class="honor-rest">';
      ranked.slice(3).forEach((s) => {
        const pct = Math.round((s.score / s.total) * 100);
        html += `<div class="honor-rest-row"><span class="hr-rank">${s.medal}</span><span class="hr-name">${s.name}</span><span class="hr-pct">${pct}%</span></div>`;
      });
      html += "</div>";
    }
    html += "</div>";
  }
  html += "</div>";
  if (html.indexOf("honor-exam-block") === -1) {
    sec.style.display = "none";
    sec.innerHTML = "";
    return;
  }
  sec.innerHTML = html;
  sec.style.display = "block";
}

window.closeWelcome = () => {
  document.getElementById("welcomeScreen").style.display = "none";
};

function buildExamList() {
  applySchedules();
  const container = document.getElementById("wExamsList");
  const visible = exams
    .filter((e) => !e.archived)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  if (!visible.length) {
    container.innerHTML =
      '<div class="no-exams">لا توجد امتحانات متاحة حالياً</div>';
    return;
  }
  container.innerHTML = visible
    .map((ex) => {
      const cnt = (ex.questions || []).length;
      const locked = ex.closed || cnt === 0;
      return `<div class="w-exam-card ${locked ? "locked" : ""}"
       onclick="${locked ? "" : "startExam('" + ex.id + "')"}">
      <div class="w-exam-icon">${ex.emoji || "📝"}</div>
      <div class="w-exam-info">
        <div class="w-exam-name">${ex.pinned ? "📌 " : ""}${ex.name}${ex.password ? " 🔑" : ""}</div>
        <div class="w-exam-desc">${ex.desc || ""}</div>
      </div>
      <div class="w-exam-right">
        <div class="w-exam-count">${cnt} سؤال</div>
        ${locked ? `<div class="w-locked-badge">🔒 ${cnt === 0 ? "فارغ" : "مقفل"}</div>` : ""}
      </div>
    </div>`;
    })
    .join("");
  highlightDeepExam();
}

function highlightDeepExam() {
  const id = window._deepExamId;
  if (!id) return;
  const idx = [...exams].filter((e) => !e.archived).findIndex((e) => e.id === id);
  const card = document.querySelectorAll("#wExamsList .w-exam-card")[idx];
  if (!card) return;
  card.classList.add("w-exam-highlight");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  window._deepExamId = null;
}
window.setDeepExam = (id) => {
  window._deepExamId = id;
  const ws = document.getElementById("welcomeScreen");
  if (ws && ws.style.display === "block") buildExamList();
};

window.startExam = async (examId) => {
  // طبّق الجدولة ثم اقرأ أحدث حالة للامتحان من قاعدة البيانات (عشان القفل يشتغل فوراً)
  applySchedules();
  let ex = exams.find((e) => e.id === examId);
  try {
    const fresh = (await get(ref(db, `exams/${examId}`))).val();
    if (fresh) ex = fresh;
    else if (fresh === null && ex) ex = null;
  } catch (e) {
    console.warn("تعذر قراءة حالة الامتحان من الخادم، سيتم استخدام النسخة المحلية", e);
  }
  if (!ex) {
    buildExamList();
    return alert("الامتحان غير موجود");
  }
  if (ex.closed) {
    buildExamList();
    return alert("🔒 الامتحان مقفل حالياً");
  }
  if (!ex.questions || !ex.questions.length)
    return alert("لا توجد أسئلة في هذا الامتحان");

  // password check
  if (ex.password) {
    const p = prompt(`🔑 كلمة سر امتحان "${ex.name}":`);
    if (p === null) return;
    if (p.trim() !== ex.password) return alert("❌ كلمة سر خاطئة");
  }

  // attempts limit
  const allRes = (await get(ref(db, `examResults/${ex.id}`))).val() || {};
  const past = Object.values(allRes).filter(
    (r) => r.name === studentName,
  );
  if (ex.blockRepeat !== false && past.length > 0)
    return alert("⚠️ لقد أديت هذا الامتحان مسبقاً!");
  if (ex.maxAttempts && ex.maxAttempts > 0 && past.length >= ex.maxAttempts) {
    return alert(`⚠️ استنفدت عدد المحاولات المسموح (${ex.maxAttempts})`);
  }

  closeWelcome();

  // apply per-exam color
  if (ex.color) {
    setCSSVar("--P", ex.color);
    setCSSVar("--PL", ex.color + "22");
  }

  // intro popup
  if (ex.introMsg && ex.introMsg.trim()) {
    window._pendingExam = ex;
    document.getElementById("introPopupTitle").innerText = "📜 " + ex.name;
    document.getElementById("introPopupBody").innerText = ex.introMsg;
    document.getElementById("examIntroPopup").style.display = "flex";
    return;
  }
  launch(ex);
};

window.confirmStartExam = () => {
  document.getElementById("examIntroPopup").style.display = "none";
  if (window._pendingExam) {
    launch(window._pendingExam);
    window._pendingExam = null;
  }
};
window.cancelStartExam = () => {
  document.getElementById("examIntroPopup").style.display = "none";
  window._pendingExam = null;
  document.getElementById("welcomeScreen").style.display = "block";
};

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function launch(ex) {
  window._currentExam = ex;
  let qs = [...ex.questions];
  if (ex.shuffleA) {
    qs = qs.map((q) => {
      if (q.type === "essay") return q;
      const idx = [0, 1, 2, 3];
      const sh = shuffleArr(idx);
      return { ...q, a: sh.map((i) => q.a[i]), c: sh.indexOf(q.c) };
    });
  }
  if (ex.shuffleQ) qs = shuffleArr(qs);
  window._qs = qs;
  timeLeft = ex.time || 1800;
  answers = new Array(window._qs.length).fill(undefined);
  flags = new Array(window._qs.length).fill(false);
  cur = 0;
  document.getElementById("adminOpenBtn").style.display = "none";
  document.getElementById("loginWrap").style.display = "none";
  document.body.classList.add("exam-mode");
  document.getElementById("examWrap").style.display = "block";
  document.getElementById("sNameDisp").innerText = studentName;
  buildSidebarGrid(window._qs);
  renderQ();
  startTimer();
  logAction(`دخول الامتحان: ${studentName} - ${ex.name}`);
}

// ===== TIMER =====
function startTimer() {
  if (timerInt) clearInterval(timerInt);
  timerInt = setInterval(() => {
    if (timeLeft <= 0) {
      clearInterval(timerInt);
      submitExam(true);
      return;
    }
    timeLeft--;
    const mm = Math.floor(timeLeft / 60),
      ss = timeLeft % 60;
    const t = document.getElementById("timer");
    t.innerText = `${mm}:${ss < 10 ? "0" + ss : ss}`;
    t.className =
      "timer " + (timeLeft < 60 ? "red" : timeLeft < 300 ? "warn" : "ok");
  }, 1000);
}

// ===== RENDER QUESTION =====
function renderQ() {
  const qs = window._qs,
    q = qs[cur];
  if (!q) return;
  const poem = document.getElementById("poemDiv");
  poem.innerText = q.ctx || "";
  poem.style.display = q.ctx ? "block" : "none";
  document.getElementById("qText").innerText = q.q;
  document.getElementById("qNumBadge").innerText =
    `سؤال ${cur + 1} من ${qs.length}`;
  document.getElementById("flagBtn").className =
    "flag-btn" + (flags[cur] ? " on" : "");
  const letters = ["أ", "ب", "ج", "د"];
  const optionsDiv = document.getElementById("optionsDiv");
  if (q.type === "essay") {
    optionsDiv.innerHTML = `
      <div class="essay-answer-wrap">
        <label for="essayAnswerInput">إجابتك المقالية</label>
        <textarea id="essayAnswerInput" rows="7" maxlength="6000"
          placeholder="اكتب إجابتك هنا..."
          oninput="setEssayAnswer(this.value)">${esc(answers[cur] || "")}</textarea>
        <small>الدرجة القصوى: ${questionPoints(q)}</small>
      </div>`;
  } else {
    optionsDiv.innerHTML = (q.a || [])
      .map(
        (a, i) => `
    <div class="opt${answers[cur] === i ? " on" : ""}" onclick="pickAns(${i},this)">
      <input type="radio" name="ans">
      <div class="opt-mark">${letters[i]}</div>
      <span>${a}</span>
    </div>
  `,
      )
      .join("");
  }
  renderNav();
  updateProg();
  updateSidebarGrid();
}

window.pickAns = (i, el) => {
  answers[cur] = i;
  document.querySelectorAll(".opt").forEach((o) => o.classList.remove("on"));
  el.classList.add("on");
  updateSidebarGrid();
  updateProg();
  playSound("ans");
};
window.setEssayAnswer = (value) => {
  answers[cur] = String(value || "");
  updateSidebarGrid();
  updateProg();
};
window.flagQ = () => {
  flags[cur] = !flags[cur];
  document.getElementById("flagBtn").className =
    "flag-btn" + (flags[cur] ? " on" : "");
  updateSidebarGrid();
};

function renderNav() {
  const qs = window._qs;
  const isLast = cur === qs.length - 1;
  let h = `<button class="btn-prev" onclick="goPrev()">◀ السابق</button>`;
  if (!isLast)
    h += `<button class="btn-next" onclick="goNext()">التالي ▶</button>`;
  if (isLast)
    h += `<button class="btn-submit" onclick="submitExam()">✅ تسليم الامتحان</button>`;
  document.getElementById("navRow").innerHTML = h;
}
window.goNext = () => {
  if (cur < window._qs.length - 1) {
    cur++;
    renderQ();
    scrollTo(0, 0);
  }
};
window.goPrev = () => {
  if (cur > 0) {
    cur--;
    renderQ();
    scrollTo(0, 0);
  }
};

function updateProg() {
  const qs = window._qs,
    tot = qs.length;
  const ans = answers.filter((a) => a !== undefined).length;
  const pct = tot ? Math.round(((cur + 1) / tot) * 100) : 0;
  document.getElementById("progFill").style.width = pct + "%";
  document.getElementById("progTxt").innerText = `${cur + 1} من ${tot}`;
  document.getElementById("ansCnt").innerText = `${ans} أجبت`;
  document.getElementById("ssAns").innerText = ans;
  document.getElementById("ssFlg").innerText = flags.filter((f) => f).length;
  document.getElementById("ssRem").innerText = tot - ans;
}

window.toggleMenu = () => {
  const s = document.getElementById("sidebar"),
    o = document.getElementById("overlay");
  s.classList.toggle("open");
  o.style.display = s.classList.contains("open") ? "block" : "none";
};
function buildSidebarGrid(qs) {
  const g = document.getElementById("qGrid");
  g.innerHTML = "";
  qs.forEach((_, i) => {
    const d = document.createElement("div");
    d.className = "qn";
    d.id = "qn" + i;
    d.innerText = i + 1;
    d.onclick = () => {
      cur = i;
      renderQ();
      toggleMenu();
      scrollTo(0, 0);
    };
    g.appendChild(d);
  });
  document.getElementById("sideInfo").innerHTML =
    `${esc(studentName)}`;
}
function updateSidebarGrid() {
  const qs = window._qs || [];
  qs.forEach((_, i) => {
    const el = document.getElementById("qn" + i);
    if (!el) return;
    el.className = "qn";
    if (answers[i] !== undefined && answers[i] !== "") el.classList.add("ans");
    if (flags[i]) el.classList.add("flg");
    if (cur === i) el.classList.add("cur");
  });
}

// ===== SUBMIT =====
window.submitExam = async (auto = false) => {
  if (!auto) {
    const un = answers.filter((a) => a === undefined || a === "").length;
    if (un > 0 && !confirm(`لم تجب على ${un} سؤال. هل تريد التسليم؟`)) return;
  }
  clearInterval(timerInt);
  const qs = window._qs;
  const ex = window._currentExam;
  let score = 0;
  const total = qs.reduce((sum, q) => sum + questionPoints(q), 0);
  const essayIndices = [];
  qs.forEach((q, i) => {
    if (q.type === "essay") essayIndices.push(i);
    else if (answers[i] === q.c) score += questionPoints(q);
  });
  if (isPreview) {
    alert(`✅ معاينة: ${score}/${total}${essayIndices.length ? " (+ أسئلة مقالية تُصحَّح يدوياً)" : ""}`);
    location.reload();
    return;
  }
  let code = "";
  for (let tries = 0; tries < 8; tries++) {
    code = Math.floor(10000 + Math.random() * 90000).toString();
    try {
      if (!(await get(ref(db, "results/" + code))).exists()) break; // الكود لازم يكون فريد
    } catch {
      break;
    }
  }
  const snap = qs.map((q) => ({
    q: q.q,
    a: [...(q.a || [])],
    c: q.c ?? null,
    ctx: q.ctx || "",
    type: q.type === "essay" ? "essay" : "choice",
    points: questionPoints(q),
  }));
  const pct = total ? Math.round((score / total) * 100) : 0;
  const passMark = ex.passMark || 50;
  const passed = essayIndices.length ? null : pct >= passMark;
  const rd = {
    code,
    name: studentName,
    score,
    total,
    userAnswers: answers.map((a) => (a === undefined ? null : a)),
    questionsSnapshot: snap,
    time: new Date().toLocaleString("ar-EG"),
    examId: ex.id,
    examName: ex.name,
    passed,
    passMark,
    essayGraded: essayIndices.length === 0,
    essayPending: essayIndices.length > 0,
    pendingEssayCount: essayIndices.length,
    essayScores: {},
    submittedAt: Date.now(),
    ...(essayIndices.length ? { essayStatus: "pending" } : {}),
  };
  await set(ref(db, `examResults/${ex.id}/${code}`), rd);
  await set(ref(db, "results/" + code), rd);
  rememberStudentCode(code, ex.id, ex.name, rd.time);
  if (essayIndices.length) {
    try {
      const nref = push(ref(db, "adminNotifications"));
      await update(ref(db), {
        [`essayQueue/${ex.id}__${code}`]: queueEntryFromResult(ex.id, code, rd),
        [`adminNotifications/${nref.key}`]: {
          type: "essay",
          refId: `${ex.id}__${code}`,
          title: "إجابة مقالية جديدة تحتاج تصحيح",
          body: `${studentName} — ${ex.name}`,
          ts: serverTimestamp(),
        },
      });
    } catch (e) {
      console.warn("essay notify failed", e);
    }
  }
  const badge = document.createElement("div");
  badge.className = "code-badge";
  badge.innerText = `🔑 كودك: ${code}`;
  document.body.appendChild(badge);
  setTimeout(() => badge.remove(), 8000);
  playSound("submit");

  const customMsg = ex.endMsg && ex.endMsg.trim() ? "\n\n" + ex.endMsg : "";
  let resultMsg = `✅ تم تسليم الامتحان بنجاح!\n\n🔑 كودك الشخصي: ${code}\n\n📌 احتفظ بهذا الكود — يمكنك به مراجعة نتيجتك لاحقاً${essayIndices.length ? "\n\n✍️ النتيجة معلّقة حتى ينتهي المدرس من تصحيح الأسئلة المقالية." : ""}${customMsg}`;

  if (ex.showRes) {
    // show inline result but hide score (student will search by code to see score)
    showInlineResult({
      ...rd,
      questionsSnapshot: snap,
      userAnswers: answers,
      _showCorrect: !!ex.showCorrect,
      _endMsg: ex.endMsg || "",
      _hideScore: true,
      _code: code,
    });
    setTimeout(() => location.reload(), 60000);
  } else {
    alert(resultMsg);
    location.reload();
  }
  logAction(
    `تسليم: ${studentName} - ${ex.name} - ${essayIndices.length ? "بانتظار تصحيح المقالي" : `${score}/${total} - ${passed ? "ناجح" : "راسب"}`}`,
  );
};

function showInlineResult(d) {
  const total = Number(d.total) || 0;
  const score = Number(d.score) || 0;
  const waitingForEssays = hasEssayQuestions(d) && !isResultGradingComplete(d);
  const pct = total ? Math.round((score / total) * 100) : 0;
  const passMark = d.passMark || 50;
  const passed = pct >= passMark;
  const hideScore = !!d._hideScore || waitingForEssays;
  const none = (v) => v === undefined || v === null;
  document.getElementById("rName").innerText = hideScore
    ? waitingForEssays
      ? `تم استلام إجابة ${d.name}`
      : `✅ ${d.name} — تم التسليم`
    : `${passed ? "🎉" : "📚"} ${d.name}`;
  if (hideScore) {
    document.getElementById("rCircle").innerHTML =
      `<span style="font-size:32px">✅</span><small>تم</small>`;
  } else {
    document.getElementById("rCircle").innerHTML =
      `<span style="font-size:26px">${fmtNum(score)}/${fmtNum(total)}</span><small>درجتك</small>`;
  }
  const grade =
    pct >= 90
      ? "ممتاز 🌟"
      : pct >= 75
        ? "جيد جداً ✨"
        : pct >= 60
          ? "جيد 👍"
          : pct >= passMark
            ? "مقبول 👌"
            : "يحتاج مراجعة 📚";
  if (hideScore) {
    document.getElementById("rPct").innerHTML =
      `<span style="font-size:16px;color:var(--S);font-weight:800">${
        waitingForEssays
          ? "النتيجة هتظهر بعد ما المدرس يراجع كل الأسئلة المقالية."
          : "تم تسجيل إجاباتك بنجاح"
      }</span>`;
  } else {
    document.getElementById("rPct").innerHTML =
      `${pct}% - ${grade}<br><span style="font-size:13px;color:${passed ? "var(--S)" : "var(--D)"};font-weight:700">${passed ? "✅ ناجح" : "❌ راسب"} (النجاح من ${passMark}%)</span>`;
  }
  let topMsg = `<div style="background:var(--SL);color:var(--S);padding:10px 14px;border-radius:11px;font-weight:700;margin-bottom:10px">🎓 ${esc(d.name)} | 📅 ${esc(d.time)}</div>`;
  if (hideScore && d._code) {
    topMsg += `<div style="background:linear-gradient(135deg,#fff3cd,#ffeaa7);color:#856404;padding:14px 16px;border-radius:11px;font-weight:800;margin-bottom:10px;font-size:15px;border:2px solid #ffc107;text-align:center">🔑 كودك الشخصي: <span style="font-size:20px;letter-spacing:2px">${esc(d._code)}</span><br><span style="font-size:12px;font-weight:700;color:#856404;margin-top:4px;display:block">📌 احتفظ بهذا الكود — ستحتاجه لمراجعة نتيجتك</span></div>`;
  }
  if (waitingForEssays) {
    topMsg += `<div class="essay-pending-notice" role="status">تم تسليم إجاباتك المقالية. لن تظهر الدرجة أو النتيجة قبل ما المدرس يخلّص التصحيح.</div>`;
  }
  if (d._endMsg && d._endMsg.trim()) {
    topMsg += `<div style="background:var(--PL);color:var(--P);padding:10px 14px;border-radius:11px;font-weight:700;margin-bottom:10px;white-space:pre-wrap">💬 ${esc(d._endMsg)}</div>`;
  }
  document.getElementById("rMsg").innerHTML = topMsg;
  if (waitingForEssays) {
    document.getElementById("rTable").innerHTML =
      '<p class="essay-pending-notice">نتيجتك قيد المراجعة. استخدم كودك مرة تانية بعد انتهاء التصحيح.</p>';
  } else if (hideScore) {
    document.getElementById("rTable").innerHTML =
      '<p style="color:var(--TS);text-align:center;padding:14px">🔒 أدخل كودك في صفحة "استعلام بالكود" لمشاهدة نتيجتك</p>';
  } else if (d._showCorrect === false) {
    document.getElementById("rTable").innerHTML =
      '<p style="color:var(--TS);text-align:center;padding:14px">🔒 الإجابات الصحيحة غير ظاهرة لهذا الامتحان</p>';
  } else {
    let h = `<table class="ans-table"><thead><tr><th>#</th><th>السؤال</th><th>إجابتك</th><th>الصحيحة / الدرجة</th><th>النتيجة</th></tr></thead><tbody>`;
    const snap = d.questionsSnapshot || [];
    for (let i = 0; i < snap.length; i++) {
      const q = snap[i];
      const ua = d.userAnswers?.[i];
      if (q.type === "essay") {
        const es = Number(d.essayScores?.[i]) || 0;
        h += `<tr><td>${i + 1}</td><td style="text-align:right">${q.q}</td><td style="text-align:right;white-space:pre-wrap">${none(ua) || ua === "" ? "—" : esc(ua)}</td><td>تصحيح المدرس</td><td>${fmtNum(es)}/${fmtNum(questionPoints(q))}</td></tr>`;
      } else {
        const ok = ua === q.c;
        h += `<tr><td>${i + 1}</td><td style="text-align:right">${q.q}</td><td>${none(ua) ? "—" : q.a[ua]}</td><td>${q.a[q.c]}</td><td class="${ok ? "corr" : "wrong"}">${ok ? "✓" : "✗"}</td></tr>`;
      }
    }
    h += `</tbody></table>`;
    document.getElementById("rTable").innerHTML = h;
  }
  document.getElementById("resultScreen").style.display = "block";
  document.dispatchEvent(new CustomEvent("exam:result-shown", { detail: { d, hideScore, passed, pct } }));
}

// ===== RESULT CHECK BY CODE =====
window.checkResult = async () => {
  const code = document.getElementById("codeInput").value.trim();
  const chosenExam = document.getElementById("codeExamSelect")?.value || "";
  if (!code) return alert("اكتب الكود الأول");
  if (/[.#$\[\]\/]/.test(code)) return alert("❌ الكود غير صحيح");
  let d;
  try {
    if (chosenExam) {
      // اختار امتحان معيّن: ندوّر على الكود جوه نتائج الامتحان ده تحديداً
      const snap = await get(ref(db, `examResults/${chosenExam}/${code}`));
      if (!snap.exists()) return alert("❌ الكود ده غير مسجّل في الامتحان المختار.\nتأكد من الكود أو اختار الامتحان الصحيح.");
      d = snap.val();
    } else {
      const snap = await get(ref(db, "results/" + code));
      if (!snap.exists()) return alert("❌ الكود غير صحيح");
      d = snap.val();
    }
  } catch (e) {
    console.error(e);
    return alert("تعذر الاتصال بالخادم، حاول مرة أخرى.");
  }
  // اقرأ إعدادات الامتحان الحالية: لو المدرس قافل "النتيجة للطلاب" يبقى البحث مقفول
  let ex = exams.find((e) => e.id === d.examId);
  try {
    const fresh = (await get(ref(db, `exams/${d.examId}`))).val();
    if (fresh) ex = fresh;
  } catch (e) {
    console.warn(e);
  }
  if (ex && !ex.showRes) {
    return alert(
      "🔒 النتائج غير متاحة حالياً لهذا الامتحان.\nاحتفظ بكودك وجرّب لاحقاً بعد ما المدرس يفتح النتائج.",
    );
  }
  // أضف الكود لقائمة الطالب المحفوظة لو لسه مش فيها
  if (d.name && normName(d.name) === normName(readStudent().name)) rememberStudentCode(code, d.examId, d.examName, d.time);
  showInlineResult({
    ...d,
    _showCorrect: ex ? !!ex.showCorrect : false,
    _endMsg: ex ? ex.endMsg || "" : "",
  });
};

// ===== ADMIN =====
window.showAdminAuth = async () => {
  // جلسة محفوظة وصالحة؟ ادخل مباشرة بدون كلمة السر
  try {
    const admin = await restorePersistentSession();
    const typed = document.getElementById("nameInput")?.value || "";
    if (admin && normName(admin.name) === normName(typed))
      return await openAdminSession(admin, { restored: true });
  } catch (e) {
    console.warn("session restore failed", e);
  }
  document.getElementById("adminAuthModal").style.display = "flex";
};
window.hideAdminAuth = () =>
  (document.getElementById("adminAuthModal").style.display = "none");
// (تسجيل دخول الأدمن وحسابات الأدمن: انظر نهاية الملف)

window.switchTab = (id, btn) => {
  document
    .querySelectorAll("#adminMainView .atab")
    .forEach((t) => t.classList.remove("on"));
  document
    .querySelectorAll("#adminMainView .atab-content")
    .forEach((t) => t.classList.remove("on"));
  btn.classList.add("on");
  document.getElementById("tab-" + id).classList.add("on");
  if (id === "bank") renderBankList();
  if (id === "logs") loadLogs();
  if (id === "stats") showQuickStats();
  if (id === "forum") onForumTabOpened();
  if (id === "complaints") renderComplaints();
  if (id === "essays") onEssayTabOpened();
  if (id === "certs" && window.CertAdmin) window.CertAdmin.onOpen();
};

window.switchExamTab = (id, btn) => {
  document
    .querySelectorAll("#examDashboard .atab")
    .forEach((t) => t.classList.remove("on"));
  document
    .querySelectorAll("#examDashboard .atab-content")
    .forEach((t) => t.classList.remove("on"));
  btn.classList.add("on");
  document.getElementById("extab-" + id).classList.add("on");
  if (id === "results") loadExamResultsTab();
  if (id === "honor") loadExamHonorTab();
  if (id === "questions") renderExamQList();
};

window.closeModal = (id) =>
  (document.getElementById(id).style.display = "none");

// ===== EXAMS LIST + DASHBOARD =====
function renderExamsList() {
  const c = document.getElementById("examsListArea");
  if (!c) return;
  if (!exams.length) {
    c.innerHTML =
      '<p style="color:var(--TS);text-align:center;padding:30px">لا توجد امتحانات. أضف امتحاناً جديداً.</p>';
    return;
  }
  applySchedules();
  const sorted = [...exams].sort((a, b) => {
    if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0))
      return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    if ((a.archived ? 1 : 0) !== (b.archived ? 1 : 0))
      return (a.archived ? 1 : 0) - (b.archived ? 1 : 0);
    return 0;
  });
  c.innerHTML = sorted
    .map((ex) => {
      const cnt = (ex.questions || []).length;
      return `<div class="exam-list-card${ex.archived ? " archived" : ""}" onclick="openExamDashboard('${ex.id}')">
      <div class="elc-icon" style="background:linear-gradient(135deg,${ex.color || "var(--P)"},var(--PU))">${ex.emoji || "📝"}</div>
      <div class="elc-info">
        <div class="elc-title">${ex.pinned ? "📌 " : ""}${ex.name}${ex.archived ? " 📦" : ""}</div>
        <div class="elc-meta">${ex.desc || "بدون وصف"}</div>
        <div class="elc-badges">
          <span class="elc-badge">${cnt} سؤال</span>
          <span class="elc-badge">${Math.floor((ex.time || 1800) / 60)} دقيقة</span>
          <span class="elc-badge ${ex.closed ? "lock" : "open"}">${ex.closed ? "🔒 مقفل" : "🔓 مفتوح"}</span>
          ${ex.password ? '<span class="elc-badge lock">🔑 محمي</span>' : ""}
          ${ex.shuffleQ ? '<span class="elc-badge">🎲 خلط</span>' : ""}
          ${ex.scheduleOpen || ex.scheduleClose ? '<span class="elc-badge">⏰ مجدول</span>' : ""}
        </div>
      </div>
    </div>`;
    })
    .join("");
}

function applySchedules() {
  const now = Date.now();
  exams.forEach((ex) => {
    if (!ex || !ex.id) return;
    let closed = !!ex.closed;
    const patch = {};
    if (ex.scheduleOpen) {
      const t = new Date(ex.scheduleOpen).getTime();
      if (!isNaN(t) && now >= t && ex.schedOpenDone !== ex.scheduleOpen) {
        patch.schedOpenDone = ex.scheduleOpen; // يتنفذ مرة واحدة فقط
        closed = false;
      }
    }
    if (ex.scheduleClose) {
      const t = new Date(ex.scheduleClose).getTime();
      if (!isNaN(t) && now >= t && ex.schedCloseDone !== ex.scheduleClose) {
        patch.schedCloseDone = ex.scheduleClose;
        closed = true;
      }
    }
    if (!Object.keys(patch).length) return;
    if (closed !== !!ex.closed) patch.closed = closed;
    Object.assign(ex, patch);
    update(ref(db, `exams/${ex.id}`), patch).catch((e) =>
      console.warn("schedule update failed", e),
    );
    if (!closed) scheduleExamAnnounce(ex.id, 2000);
  });
}
function refreshStudentExamList() {
  const ws = document.getElementById("welcomeScreen");
  if (ws && ws.style.display === "block") buildExamList();
}
setInterval(() => {
  if (!exams.length) return;
  applySchedules();
  refreshStudentExamList();
}, 30000);

window.openExamDashboard = (id) => {
  const ex = exams.find((e) => e.id === id);
  if (!ex) return;
  currentExamId = id;
  document.getElementById("adminMainView").style.display = "none";
  document.getElementById("examDashboard").classList.add("on");
  renderExamDashboard(ex);
};
window.backToExamsList = () => {
  currentExamId = null;
  document.getElementById("adminMainView").style.display = "block";
  document.getElementById("examDashboard").classList.remove("on");
  renderExamsList();
};

function renderExamDashboard(ex) {
  document.getElementById("edhIcon").innerText = ex.emoji || "📝";
  document.getElementById("edhTitle").innerText =
    ex.name + (ex.pinned ? " 📌" : "") + (ex.archived ? " 📦" : "");
  document.getElementById("edhMeta").innerText =
    `${(ex.questions || []).length} سؤال • ${Math.floor((ex.time || 1800) / 60)} دقيقة`;

  const setT = (id, on, onTxt, offTxt, onCls, offCls) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerText = on ? onTxt : offTxt;
    el.className = "abtn " + (on ? onCls : offCls);
  };
  const lockBtn = document.getElementById("examOpenBtn");
  if (lockBtn) {
    if (!ex.closed) {
      lockBtn.innerText = "🔒 قفل الامتحان الآن";
      lockBtn.className = "abtn exam-lock-btn-locked";
    } else {
      lockBtn.innerText = "🔓 فتح الامتحان الآن";
      lockBtn.className = "abtn exam-lock-btn-open";
    }
  }
  setT(
    "examPhoneBtn",
    ex.phoneVisible !== false,
    "📱 الهاتف: ظاهر",
    "📵 الهاتف: مخفي",
    "bg-green",
    "bg-red",
  );
  setT(
    "examBlockBtn",
    ex.blockRepeat !== false,
    "🛡️ منع التكرار: مفعل",
    "🔓 التكرار: معطل",
    "bg-red",
    "bg-green",
  );
  setT(
    "examShowResBtn",
    ex.showRes,
    "👁️ النتيجة للطلاب: نعم",
    "👁️ النتيجة للطلاب: لا",
    "bg-green",
    "bg-dark",
  );
  setT(
    "examHonorBtn",
    ex.showHonor,
    "🏆 إظهار الأوائل: نعم",
    "🏆 إظهار الأوائل: لا",
    "bg-green",
    "bg-purple",
  );
  setT(
    "examShuffleQBtn",
    ex.shuffleQ,
    "🎲 خلط الأسئلة: نعم",
    "🎲 خلط الأسئلة: لا",
    "bg-green",
    "bg-teal",
  );
  setT(
    "examShuffleABtn",
    ex.shuffleA,
    "🔀 خلط الإجابات: نعم",
    "🔀 خلط الإجابات: لا",
    "bg-green",
    "bg-teal",
  );
  setT(
    "examShowCorrBtn",
    ex.showCorrect,
    "📝 الإجابات الصحيحة: نعم",
    "📝 الإجابات الصحيحة: لا",
    "bg-green",
    "bg-indigo",
  );
  setT(
    "examReviewBtn",
    ex.allowReview,
    "🔍 السماح بالمراجعة: نعم",
    "🔍 السماح بالمراجعة: لا",
    "bg-green",
    "bg-indigo",
  );
  setT(
    "examPinBtn",
    ex.pinned,
    "📌 مثبّت في الأعلى",
    "📌 تثبيت في الأعلى",
    "bg-gold",
    "bg-dark",
  );
  setT(
    "examArchiveBtn",
    ex.archived,
    "📦 في الأرشيف",
    "📦 أرشفة",
    "bg-orange",
    "bg-dark",
  );

  renderExamQList();
}

// ===== EXAMS CRUD =====
window.openAddExamModal = () => {
  document.getElementById("newExamName").value = "";
  document.getElementById("newExamDesc").value = "";
  document.getElementById("newExamEmoji").value = "📝";
  document.getElementById("addExamModal").style.display = "flex";
};
window.saveNewExam = () => {
  const name = document.getElementById("newExamName").value.trim();
  const desc = document.getElementById("newExamDesc").value.trim();
  const emoji = document.getElementById("newExamEmoji").value.trim() || "📝";
  if (!name) return alert("أدخل اسم الامتحان");
  const id = "exam_" + Date.now();
  const newEx = {
    id,
    name,
    desc,
    emoji,
    questions: [],
    closed: false,
    password: "",
    time: 1800,
    phoneVisible: true,
    blockRepeat: true,
    showRes: false,
    showHonor: false,
    color: "#1a73e8",
  };
  exams.push(newEx);
  saveExams();
  closeModal("addExamModal");
  logAction("إضافة امتحان: " + name);
};

const _examQCount = new Map();
function saveExams() {
  const obj = {};
  exams.forEach((e) => (obj[e.id] = e));
  // أول مرة الامتحان يبقى متاح (كان فاضي وأضفنا له أسئلة) → إشعار للطلاب بعد هدوء التعديل
  exams.forEach((e) => {
    const before = _examQCount.get(e.id);
    if (before === 0 && (e.questions || []).length > 0 && examAnnounceable(e) && !e.announcedAt)
      scheduleExamAnnounce(e.id);
  });
  set(ref(db, "exams"), obj);
}

const getCurEx = () => exams.find((e) => e.id === currentExamId);

window.examToggleClosed = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.closed = !ex.closed;
  saveExams();
  if (!ex.closed) scheduleExamAnnounce(ex.id);
  renderExamDashboard(ex);
};
window.examSetPass = () => {
  const ex = getCurEx();
  if (!ex) return;
  const p = prompt("كلمة سر الامتحان:", ex.password || "");
  if (p !== null) {
    ex.password = p.trim();
    saveExams();
    renderExamDashboard(ex);
  }
};
window.examRemovePass = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.password = "";
  saveExams();
  renderExamDashboard(ex);
  alert("✅ تم إزالة كلمة السر");
};
window.examTogglePhone = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.phoneVisible = !(ex.phoneVisible !== false);
  saveExams();
  renderExamDashboard(ex);
};
window.examToggleBlock = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.blockRepeat = !(ex.blockRepeat !== false);
  saveExams();
  renderExamDashboard(ex);
};
window.examToggleShowRes = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.showRes = !ex.showRes;
  saveExams();
  renderExamDashboard(ex);
};
window.examToggleHonor = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.showHonor = !ex.showHonor;
  saveExams();
  renderExamDashboard(ex);
};
window.examEditMeta = () => {
  const ex = getCurEx();
  if (!ex) return;
  const name = prompt("اسم الامتحان:", ex.name);
  if (name === null) return;
  const emoji = prompt("الإيموجي:", ex.emoji || "📝");
  if (emoji === null) return;
  const desc = prompt("الوصف:", ex.desc || "");
  if (desc === null) return;
  ex.name = name.trim() || ex.name;
  ex.emoji = emoji.trim() || "📝";
  ex.desc = desc.trim();
  saveExams();
  renderExamDashboard(ex);
};
window.examDelete = () => {
  const ex = getCurEx();
  if (!ex) return;
  if (!confirm(`حذف الامتحان "${ex.name}" نهائياً؟`)) return;
  exams = exams.filter((e) => e.id !== ex.id);
  saveExams();
  remove(ref(db, `examResults/${ex.id}`));
  purgeEssayQueue(ex.id);
  logAction("حذف امتحان: " + ex.name);
  backToExamsList();
};
window.openExamColorPicker = () =>
  (document.getElementById("examColorModal").style.display = "flex");
window.setExamColor = (c) => {
  const ex = getCurEx();
  if (!ex) return;
  ex.color = c;
  saveExams();
  renderExamDashboard(ex);
  closeModal("examColorModal");
};

window.examTimeModal = () => {
  const ex = getCurEx();
  if (!ex) return;
  window._tempTime = ex.time || 1800;
  updateTimeDsp();
  document.getElementById("timeModal").style.display = "flex";
};
window.adjExamTime = (m) => {
  window._tempTime = Math.max(60, (window._tempTime || 1800) + m * 60);
  updateTimeDsp();
};
function updateTimeDsp() {
  const t = window._tempTime || 1800;
  const mm = Math.floor(t / 60),
    ss = t % 60;
  document.getElementById("timeDsp").innerText =
    `${mm}:${ss < 10 ? "0" + ss : ss}`;
}
window.saveExamTime = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.time = window._tempTime || 1800;
  saveExams();
  closeModal("timeModal");
  renderExamDashboard(ex);
  alert("✅ تم حفظ الوقت");
};

// ===== EXAM QUESTIONS =====
function renderExamQList() {
  const ex = getCurEx();
  if (!ex) return;
  const c = document.getElementById("examQsList");
  if (!ex.questions || !ex.questions.length) {
    c.innerHTML =
      '<p style="color:var(--TS);text-align:center;padding:20px">لا توجد أسئلة في هذا الامتحان. أضف سؤالاً جديداً أو استورد من البنك.</p>';
    return;
  }
  c.innerHTML =
    '<div style="display:flex;flex-direction:column;gap:8px">' +
    ex.questions
      .map((q, i) => {
        const correctTxt =
          q.type === "essay"
            ? `✍️ سؤال مقالي · ${fmtNum(questionPoints(q))} درجة`
            : `✓ ${(q.a || [])[q.c] || ""}`;
        return `<div class="qi" style="padding:12px 14px">
        <span style="flex:1">
          <strong style="color:var(--P)">${i + 1}.</strong> ${q.q.substring(0, 70)}${q.q.length > 70 ? "..." : ""}
          <br><small style="color:var(--S);font-weight:700">${correctTxt.substring(0, 50)}</small>
        </span>
        <div class="qi-acts">
          <button onclick="openExamQEdit(${i})" title="تعديل">✏️</button>
          <button onclick="delExamQ(${i})" title="حذف">🗑️</button>
        </div>
      </div>`;
      })
      .join("") +
    "</div>";
}

window.openExamQEdit = (idx) => {
  const ex = getCurEx();
  if (!ex) return;
  editingQIdx = idx;
  const q =
    idx === -1
      ? {
        ctx: "",
        q: "",
        a: ["", "", "", ""],
        c: 0,
        type: "choice",
        points: 1,
      }
      : ex.questions[idx];
  document.getElementById("qEditTitle").innerText =
    idx === -1 ? "➕ إضافة سؤال جديد" : "✏️ تعديل السؤال";
  document.getElementById("qeCtx").value = q.ctx || "";
  document.getElementById("qeQ").value = q.q || "";
  for (let i = 0; i < 4; i++)
    document.getElementById("qeA" + i).value = q.a?.[i] || "";
  qeCorrect = q.c || 0;
  document.getElementById("qeType").value = q.type === "essay" ? "essay" : "choice";
  document.getElementById("qePoints").value = questionPoints(q);
  // update UI
  document
    .querySelectorAll("#qeAnswersWrap .qe-answer-row")
    .forEach((r, i) => r.classList.toggle("correct", i === qeCorrect));
  toggleExamQuestionType();
  document.getElementById("qEditModal").style.display = "flex";
};
window.toggleExamQuestionType = () => {
  const isEssay = document.getElementById("qeType")?.value === "essay";
  const sec = document.getElementById("qeAnswersWrap")?.closest(".qe-section");
  if (sec) sec.style.display = isEssay ? "none" : "block";
};
window.qeSelectCorrect = (i) => {
  qeCorrect = i;
  document
    .querySelectorAll("#qeAnswersWrap .qe-answer-row")
    .forEach((r, j) => r.classList.toggle("correct", j === i));
};
window.saveExamQ = () => {
  const ex = getCurEx();
  if (!ex) return;
  const type = document.getElementById("qeType").value === "essay" ? "essay" : "choice";
  const points = Number(document.getElementById("qePoints").value);
  const q = {
    ctx: document.getElementById("qeCtx").value.trim(),
    q: document.getElementById("qeQ").value.trim(),
    a:
      type === "essay"
        ? []
        : [0, 1, 2, 3].map((i) => document.getElementById("qeA" + i).value.trim()),
    c: type === "essay" ? null : qeCorrect,
    type,
    points,
    active: true,
  };
  if (!q.q) return alert("أدخل نص السؤال");
  if (!Number.isFinite(points) || points <= 0)
    return alert("أدخل درجة صحيحة أكبر من صفر");
  if (type !== "essay" && q.a.some((a) => !a))
    return alert("املأ جميع الاختيارات الأربعة");
  if (!ex.questions) ex.questions = [];
  if (editingQIdx === -1) ex.questions.push(q);
  else ex.questions[editingQIdx] = q;
  saveExams();
  closeModal("qEditModal");
  renderExamQList();
  renderExamDashboard(ex);
};
window.delExamQ = (i) => {
  const ex = getCurEx();
  if (!ex) return;
  if (!confirm("حذف السؤال؟")) return;
  ex.questions.splice(i, 1);
  saveExams();
  renderExamQList();
  renderExamDashboard(ex);
};
window.examClearAllQs = () => {
  const ex = getCurEx();
  if (!ex) return;
  if (!confirm("حذف كل أسئلة هذا الامتحان؟")) return;
  ex.questions = [];
  saveExams();
  renderExamQList();
  renderExamDashboard(ex);
};

window.examImportFromBank = () => {
  const ex = getCurEx();
  if (!ex) return;
  if (!bankQs.length) return alert("بنك الأسئلة فارغ");
  const filtered = bankQs;
  bankPickerSelected.clear();
  const c = document.getElementById("bankPickerList");
  c.innerHTML = filtered
    .map(
      (q, i) => `
    <div style="background:var(--CB);padding:10px 12px;border-radius:10px;margin-bottom:6px;border:1px solid var(--BR);display:flex;align-items:center;gap:10px;cursor:pointer" onclick="bankPickerToggle(${i},this)" id="bp${i}">
      <input type="checkbox" id="bpcb${i}" style="width:18px;height:18px;flex:none;margin:0">
      <div style="flex:1">
        <strong style="font-size:13px">${q.q}</strong>
        <br><small style="color:var(--S);font-weight:700">✓ ${q.a[q.c]}</small>
      </div>
    </div>
  `,
    )
    .join("");
  window._bankPickerData = filtered;
  document.getElementById("bankPickerModal").style.display = "flex";
};
window.bankPickerToggle = (i, el) => {
  const cb = document.getElementById("bpcb" + i);
  cb.checked = !cb.checked;
  if (cb.checked) bankPickerSelected.add(i);
  else bankPickerSelected.delete(i);
};
window.bankPickerSelectAll = (yes) => {
  bankPickerSelected.clear();
  const data = window._bankPickerData || [];
  data.forEach((_, i) => {
    const cb = document.getElementById("bpcb" + i);
    if (cb) {
      cb.checked = yes;
      if (yes) bankPickerSelected.add(i);
    }
  });
};
window.bankPickerImport = () => {
  const ex = getCurEx();
  if (!ex) return;
  const data = window._bankPickerData || [];
  const picks = Array.from(bankPickerSelected)
    .map((i) => data[i])
    .filter(Boolean);
  if (!picks.length) return alert("لم تختر أي سؤال");
  if (!ex.questions) ex.questions = [];
  ex.questions = [
    ...ex.questions,
    ...picks.map((q) => ({ ...q, active: true })),
  ];
  saveExams();
  closeModal("bankPickerModal");
  renderExamQList();
  renderExamDashboard(ex);
  alert(`✅ تم استيراد ${picks.length} سؤال`);
};

window.examImportJSON = () => {
  const ex = getCurEx();
  if (!ex) return;
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = ".json";
  inp.onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        if (Array.isArray(d)) {
          if (!ex.questions) ex.questions = [];
          ex.questions = [...ex.questions, ...d];
          saveExams();
          renderExamQList();
          renderExamDashboard(ex);
          alert(`✅ تم استيراد ${d.length} سؤال`);
        } else alert("صيغة الملف غير صحيحة");
      } catch (err) {
        alert("خطأ في قراءة الملف");
      }
    };
    r.readAsText(f);
  };
  inp.click();
};
window.examExportJSON = () => {
  const ex = getCurEx();
  if (!ex) return;
  const b = new Blob([JSON.stringify(ex.questions || [], null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = `${ex.name}.json`;
  a.click();
};

// ===== EXAM RESULTS / HONOR =====
async function getExamResults(examId) {
  const snap = await get(ref(db, `examResults/${examId}`));
  return Object.values(snap.val() || {});
}

// (تصحيح المقالي وجدول النتائج بالحالات: انظر نهاية الملف)
window.delExamResult = async (examId, code) => {
  if (!confirm("حذف؟")) return;
  await remove(ref(db, `examResults/${examId}/${code}`));
  await remove(ref(db, "results/" + code));
  remove(ref(db, `essayQueue/${examId}__${code}`)).catch(() => {});
  loadExamResultsTab();
};

window.loadExamHonorTab = async () => {
  const ex = getCurEx();
  if (!ex) return;
  const list = (await getExamResults(ex.id)).filter(isResultGradingComplete).sort((a, b) => b.score - a.score);
  const c = document.getElementById("examHonorArea");
  if (!list.length) {
    c.innerHTML =
      '<p style="color:var(--TS);text-align:center;padding:20px">لا توجد نتائج بعد</p>';
    return;
  }
  const ranked = buildRankedList(list);
  c.innerHTML = `<div class="honor-wrap">${ranked
    .map((s) => {
      const pct = Math.round((s.score / s.total) * 100);
      return `<div class="honor-item">
      <div class="honor-rank">${s.medal}</div>
      <div class="honor-info">
        <div class="honor-name">${s.name}</div>
        <div class="honor-sub">المرتبة ${s.rank}</div>
        <div class="honor-prog"><div class="honor-prog-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="honor-score">${s.score}/${s.total} (${pct}%)</div>
    </div>`;
    })
    .join("")}</div>`;
};

function buildRankedList(list, maxDisplay) {
  const sorted = [...list].sort((a, b) => b.score - a.score);
  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  let rank = 1,
    result = [],
    i = 0;
  while (i < sorted.length) {
    const grp = [sorted[i]];
    while (
      i + grp.length < sorted.length &&
      sorted[i + grp.length].score === sorted[i].score
    )
      grp.push(sorted[i + grp.length]);
    const medal = medals[rank - 1] || `${rank}`;
    grp.forEach((s) => result.push({ ...s, rank, medal }));
    rank += grp.length;
    i += grp.length;
    if (maxDisplay && result.length >= maxDisplay) break;
  }
  return maxDisplay ? result.slice(0, maxDisplay) : result;
}

// ===== EXCEL EXPORT (per-exam) =====
window.examExportResultsExcel = async () => {
  const ex = getCurEx();
  if (!ex) return;
  const list = (await getExamResults(ex.id)).filter(isResultGradingComplete).sort((a, b) => b.score - a.score);
  if (!list.length) return alert("لا توجد نتائج");
  const rows = list.map((r, i) => ({
    م: i + 1,
    الاسم: r.name,
    الدرجة: `${r.score}/${r.total}`,
    النسبة: `${Math.round((r.score / r.total) * 100)}%`,
    الوقت: r.time,
    الكود: r.code,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "النتائج");
  XLSX.writeFile(
    wb,
    `نتائج_${ex.name}_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
};

// ===== PDF PRINT (Arabic + English supported via html2canvas) =====
async function generatePDFFromTemplate(filename) {
  const el = document.getElementById("pdfRender");
  // Wait for fonts
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
  });
  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  let heightLeft = imgH;
  let position = 0;
  pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
  heightLeft -= pageH;
  while (heightLeft > 0) {
    position = heightLeft - imgH;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
    heightLeft -= pageH;
  }
  pdf.save(filename);
}

window.examPrintResultsPDF = async () => {
  const ex = getCurEx();
  if (!ex) return;
  const list = (await getExamResults(ex.id)).filter(isResultGradingComplete).sort((a, b) => b.score - a.score);
  if (!list.length) return alert("لا توجد نتائج للطباعة");
  const el = document.getElementById("pdfRender");
  const date = new Date().toLocaleDateString("ar-EG");
  let total = 0,
    count = 0,
    maxScore = 0;
  list.forEach((r) => {
    total += (r.score / r.total) * 100;
    count++;
    if (r.score > maxScore) maxScore = r.score;
  });
  const avg = count ? Math.round(total / count) : 0;
  el.innerHTML = `
    <div class="pdf-header">
      <div class="pdf-logo">📖</div>
      <div class="pdf-title">${ex.name}</div>
      <div class="pdf-sub">نتائج الطلاب</div>
    </div>
    <div class="pdf-info-bar">
      <div class="pdf-info-item"><strong>عدد الطلاب:</strong> ${list.length}</div>
      <div class="pdf-info-item"><strong>المتوسط:</strong> ${avg}%</div>
      <div class="pdf-info-item"><strong>التاريخ:</strong> ${date}</div>
    </div>
    <table class="pdf-table">
      <thead><tr>
        <th style="width:8%">م</th>
        <th style="width:35%">الاسم</th>
        <th style="width:15%">الكود</th>
        <th style="width:14%">الدرجة</th>
        <th style="width:12%">النسبة</th>
        <th style="width:16%">التقدير</th>
      </tr></thead>
      <tbody>
        ${list
      .map((r, i) => {
        const pct = Math.round((r.score / r.total) * 100);
        const grade =
          pct >= 90
            ? "ممتاز"
            : pct >= 75
              ? "جيد جداً"
              : pct >= 60
                ? "جيد"
                : pct >= 50
                  ? "مقبول"
                  : "ضعيف";
        const cls =
          i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
        return `<tr class="${cls}"><td>${i + 1}</td><td style="text-align:right;padding-right:10px">${r.name}</td><td>${r.code}</td><td>${r.score}/${r.total}</td><td>${pct}%</td><td>${grade}</td></tr>`;
      })
      .join("")}
      </tbody>
    </table>
    <div class="pdf-footer">
      <strong>📚 امتحان لغة عربية</strong><br>
      تم التوليد في ${new Date().toLocaleString("ar-EG")}
    </div>
  `;
  try {
    await generatePDFFromTemplate(`نتائج_${ex.name}_${date}.pdf`);
    logAction("طباعة PDF نتائج: " + ex.name);
  } catch (e) {
    alert("حدث خطأ: " + e.message);
  }
};

window.examPrintHonorPDF = async () => {
  const ex = getCurEx();
  if (!ex) return;
  const list = (await getExamResults(ex.id)).filter(isResultGradingComplete).sort((a, b) => b.score - a.score);
  if (!list.length) return alert("لا توجد نتائج للطباعة");
  const ranked = buildRankedList(list, 10);
  const el = document.getElementById("pdfRender");
  const date = new Date().toLocaleDateString("ar-EG");
  el.innerHTML = `
    <div class="pdf-header">
      <div class="pdf-logo" style="background:linear-gradient(135deg,#c8a84b,#f5d78e)">🏆</div>
      <div class="pdf-title" style="color:#a07820">قائمة الأوائل</div>
      <div class="pdf-sub">${ex.name}</div>
    </div>
    <div class="pdf-info-bar">
      <div class="pdf-info-item"><strong>عدد الأوائل:</strong> ${ranked.length}</div>
      <div class="pdf-info-item"><strong>التاريخ:</strong> ${date}</div>
    </div>
    <table class="pdf-table">
      <thead><tr>
        <th style="width:12%">المرتبة</th>
        <th style="width:42%">الاسم</th>
        <th style="width:18%">الدرجة</th>
        <th style="width:14%">النسبة</th>
        <th style="width:14%">الميدالية</th>
      </tr></thead>
      <tbody>
        ${ranked
      .map((r) => {
        const pct = Math.round((r.score / r.total) * 100);
        const cls =
          r.rank === 1
            ? "gold"
            : r.rank === 2
              ? "silver"
              : r.rank === 3
                ? "bronze"
                : "";
        return `<tr class="${cls}"><td class="pdf-rank-cell">${r.rank}</td><td style="text-align:right;padding-right:10px;font-weight:700">${r.name}</td><td>${r.score}/${r.total}</td><td>${pct}%</td><td style="font-size:18px">${r.medal}</td></tr>`;
      })
      .join("")}
      </tbody>
    </table>
    <div class="pdf-footer">
      <strong>🏆 قائمة الأوائل</strong><br>
      تم التوليد في ${new Date().toLocaleString("ar-EG")}
    </div>
  `;
  try {
    await generatePDFFromTemplate(`أوائل_${ex.name}_${date}.pdf`);
    logAction("طباعة PDF أوائل: " + ex.name);
  } catch (e) {
    alert("حدث خطأ: " + e.message);
  }
};

// ===== BANK =====
function renderBankList() {
  const c = document.getElementById("bankList");
  if (!c) return;
  if (!bankQs.length) {
    c.innerHTML =
      '<p style="color:var(--TS);text-align:center;padding:20px">لا توجد أسئلة في البنك</p>';
    return;
  }
  const grades = [{ k: "all", n: "📚 كل الأسئلة" }];
  c.innerHTML = grades
    .map((g) => {
      const f = bankQs;
      if (!f.length) return "";
      return `<div class="bank-group"><h4>${g.n} (${f.length} سؤال)</h4>${f
        .map((q) => {
          const oi = bankQs.findIndex((bq) => bq === q);
          return `<div class="bank-qi"><strong>${q.q}</strong><br><small style="color:var(--S);font-weight:700">✓ ${q.a[q.c]}</small><br><small>${q.a.join(" | ")}</small><div class="bank-acts"><button class="abtn bg-blue" onclick="openBankEdit(${oi})">✏️ تعديل</button><button class="abtn bg-red" onclick="delBankQ(${oi})">🗑️ حذف</button></div></div>`;
        })
        .join("")}</div>`;
    })
    .join("");
}

window.openBankEdit = (i) => {
  editingBankIdx = i;
  const q =
    i === -1
      ? { ctx: "", q: "", a: ["", "", "", ""], c: 0 }
      : bankQs[i];
  document.getElementById("bankModalTitle").innerText =
    i === -1 ? "➕ إضافة سؤال للبنك" : "✏️ تعديل سؤال البنك";
  document.getElementById("bCtx").value = q.ctx || "";
  document.getElementById("bQ").value = q.q || "";
  for (let j = 0; j < 4; j++)
    document.getElementById("bA" + j).value = q.a?.[j] || "";
  bCorrect = q.c || 0;
  document
    .querySelectorAll("#bankModal .qe-answer-row")
    .forEach((r, j) => r.classList.toggle("correct", j === bCorrect));
  document.getElementById("bankModal").style.display = "flex";
};
window.bSelectCorrect = (i) => {
  bCorrect = i;
  document
    .querySelectorAll("#bankModal .qe-answer-row")
    .forEach((r, j) => r.classList.toggle("correct", j === i));
};
window.saveBankQ = () => {
  const nq = {
    ctx: document.getElementById("bCtx").value.trim(),
    q: document.getElementById("bQ").value.trim(),
    a: [0, 1, 2, 3].map((i) => document.getElementById("bA" + i).value.trim()),
    c: bCorrect,
  };
  if (!nq.q) return alert("أدخل نص السؤال");
  if (nq.a.some((a) => !a)) return alert("املأ جميع الاختيارات");
  if (editingBankIdx === -1) bankQs.push(nq);
  else bankQs[editingBankIdx] = nq;
  set(ref(db, "bankQuestions"), bankQs);
  closeModal("bankModal");
  renderBankList();
  logAction("حفظ سؤال بنك");
};
window.delBankQ = (i) => {
  if (!confirm("حذف السؤال؟")) return;
  bankQs.splice(i, 1);
  set(ref(db, "bankQuestions"), bankQs);
  renderBankList();
};

// ===== GLOBAL SETTINGS =====
window.openColorPicker = () =>
  (document.getElementById("colorModal").style.display = "flex");
window.setColor = (c, d) => {
  setCSSVar("--P", c);
  setCSSVar("--PD", d || c);
  setCSSVar("--PL", c + "22");
  localStorage.setItem("color", c);
  localStorage.setItem("colorD", d || c);
  closeModal("colorModal");
  logAction("تغيير اللون: " + c);
};
window.toggleSound = () => {
  soundOn = !soundOn;
  localStorage.setItem("sound", soundOn);
  const b = document.getElementById("soundBtn");
  if (b) b.innerText = soundOn ? "🔊 الأصوات: مفعل" : "🔇 الأصوات: معطل";
};
function applyFontSize() {
  document.body.classList.remove(
    "font-small",
    "font-normal",
    "font-large",
    "font-xlarge",
  );
  document.body.classList.add("font-" + fontSize);
  const nm = {
    small: "صغير",
    normal: "عادي",
    large: "كبير",
    xlarge: "كبير جداً",
  };
  document.querySelectorAll("[data-font-btn]").forEach((b) => {
    b.innerText = "📏 حجم الخط (" + nm[fontSize] + ")";
  });
}
window.changeFontSize = () => {
  const szs = ["small", "normal", "large", "xlarge"];
  let i = szs.indexOf(fontSize);
  fontSize = szs[(i + 1) % szs.length];
  localStorage.setItem("fsize", fontSize);
  applyFontSize();
  const nm = {
    small: "صغير",
    normal: "عادي",
    large: "كبير",
    xlarge: "كبير جداً",
  };
  showToast("📏 حجم الخط: " + nm[fontSize]);
};
function showToast(msg) {
  let t = document.getElementById("_toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "_toast";
    t.style.cssText =
      "position:fixed;bottom:24px;right:50%;transform:translateX(50%);background:linear-gradient(135deg,var(--P),var(--PU));color:#fff;padding:12px 22px;border-radius:30px;font-weight:800;box-shadow:0 8px 24px rgba(0,0,0,.3);z-index:99999;font-family:Cairo,sans-serif;font-size:14px;opacity:0;transition:opacity .25s,transform .25s";
    document.body.appendChild(t);
  }
  t.innerText = msg;
  t.style.opacity = "1";
  t.style.transform = "translateX(50%) translateY(0)";
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateX(50%) translateY(20px)";
  }, 2200);
}
window.resetSettings = () => {
  if (!confirm("إعادة ضبط الإعدادات المحلية؟")) return;
  setCSSVar("--P", "#1a73e8");
  setCSSVar("--PD", "#1557b0");
  setCSSVar("--PL", "#e8f0fe");
  localStorage.removeItem("color");
  localStorage.removeItem("colorD");
  alert("✅ تم إعادة الضبط");
  logAction("إعادة ضبط الإعدادات");
};
window.copyLink = () => {
  navigator.clipboard.writeText(location.href);
  alert("✅ تم نسخ الرابط");
};
window.clearNotif = () => {
  if (!confirm("إلغاء الإشعار الحالي للطلاب؟")) return;
  remove(ref(db, "globalNotification")).then(() => {
    document.getElementById("notif").style.display = "none";
    alert("✅ تم إلغاء الإشعار");
    logAction("إلغاء الإشعار");
  });
};

window.openPublicHonorBoard = async () => {
  document.getElementById("publicHonorModal").style.display = "flex";
  const body = document.getElementById("publicHonorBody");
  body.innerHTML =
    '<div style="padding:20px;color:var(--TS)">⏳ جاري التحميل...</div>';
  const visibleExams = exams.filter((e) => !e.archived && e.showHonor);
  if (!visibleExams.length) {
    body.innerHTML =
      '<p style="padding:20px;color:var(--TS)">لا توجد قوائم أوائل متاحة حالياً</p>';
    return;
  }
  let html = "";
  for (const ex of visibleExams) {
    const list = (await getExamResults(ex.id)).filter(isResultGradingComplete);
    if (!list.length) continue;
    const ranked = buildRankedList(
      [...list].sort((a, b) => b.score - a.score),
      10,
    );
    html += `<div style="margin-bottom:22px">
      <div style="text-align:center;font-size:14px;font-weight:800;color:#a07820;background:linear-gradient(135deg,#fffde7,#fff9c4);padding:8px 14px;border-radius:20px;border:1px solid #f9ab00;margin-bottom:10px;display:inline-block;width:100%;box-sizing:border-box">${ex.emoji || "📋"} ${ex.name}</div>
      <div style="display:flex;gap:8px;justify-content:center;align-items:flex-end;margin-bottom:8px">`;
    const top3 = [
      ranked.find((r) => r.rank === 1),
      ranked.find((r) => r.rank === 2),
      ranked.find((r) => r.rank === 3),
    ].filter(Boolean);
    // podium order: 2nd, 1st, 3rd
    const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
    const heights = { 1: "130px", 2: "110px", 3: "95px" };
    podiumOrder.forEach((s) => {
      if (!s) return;
      const pct = Math.round((s.score / s.total) * 100);
      const cls = s.rank === 1 ? "gold" : s.rank === 2 ? "silver" : "bronze";
      const borderColor =
        s.rank === 1 ? "#f9ab00" : s.rank === 2 ? "#c0c0c0" : "#cd7f32";
      html += `<div style="flex:1;background:rgba(255,255,255,.05);border:2px solid ${borderColor};border-radius:14px;padding:10px 6px;text-align:center;min-height:${heights[s.rank] || "95px"};display:flex;flex-direction:column;align-items:center;justify-content:center;${s.rank === 1 ? "transform:translateY(-8px)" : ""}">
        <div style="font-size:26px">${s.medal}</div>
        <div style="font-size:12px;font-weight:800;color:var(--TX);margin:4px 0;word-break:break-word;min-height:28px;display:flex;align-items:center;justify-content:center">${s.name}</div>
        <div style="font-size:16px;font-weight:900;color:#c8a84b">${pct}%</div>
        <div style="font-size:10px;color:var(--TS)">${s.score}/${s.total}</div>
      </div>`;
    });
    html += "</div>";
    if (ranked.length > 3) {
      html += '<div style="display:flex;flex-direction:column;gap:5px">';
      ranked.slice(3).forEach((s) => {
        const pct = Math.round((s.score / s.total) * 100);
        html += `<div style="display:flex;align-items:center;gap:10px;padding:7px 12px;background:var(--BG);border-radius:10px;border:1px solid var(--BR)">
          <span style="min-width:28px;text-align:center;font-size:14px">${s.medal}</span>
          <span style="flex:1;font-weight:700;color:var(--TX);font-size:13px">${s.name}</span>
          <span style="background:rgba(200,168,75,.15);color:#a07820;padding:2px 10px;border-radius:12px;font-weight:800;font-size:12px">${pct}%</span>
        </div>`;
      });
      html += "</div>";
    }
    html += "</div>";
  }
  body.innerHTML =
    html || '<p style="padding:20px;color:var(--TS)">لا توجد نتائج بعد</p>';
};

window.openNotifModal = () =>
  (document.getElementById("notifModal").style.display = "flex");
window.sendNotif = () => {
  const msg = document.getElementById("notifMsg").value.trim();
  if (!msg) return alert("أدخل نص الإشعار");
  set(ref(db, "globalNotification"), {
    message: msg,
    timestamp: Date.now(),
  }).then(() => {
    alert("✅ تم");
    closeModal("notifModal");
    logAction("إشعار: " + msg);
  });
};
window.clearLogs = () => {
  if (confirm("مسح السجل؟"))
    remove(ref(db, "adminLogs")).then(() => {
      const c = document.getElementById("logsContainer");
      if (c) c.innerHTML = "";
      alert("تم");
    });
};
window.resetAllResults = () => {
  if (!confirm("⚠️ مسح كل النتائج لكل الامتحانات؟")) return;
  if (prompt("كلمة سر الأدمن:") !== ADMIN_PASS) return alert("كلمة سر خطأ");
  Promise.all([
    remove(ref(db, "results")),
    remove(ref(db, "examResults")),
    remove(ref(db, "essayQueue")),
  ]).then(() => {
    alert("✅ تم التصفير");
    logAction("تصفير كل النتائج");
  });
};

// ===== STATS (global) =====
window.showQuickStats = async () => {
  const snap = await get(ref(db, "results"));
  const all = snap.val() || {};
  const gradedList = Object.values(all).filter(isResultGradingComplete);
  const tot = gradedList.length;
  let ts = 0,
    tq = 0,
    mx = 0;
  gradedList.forEach((r) => {
    ts += r.score;
    tq += r.total;
    if (r.score > mx) mx = r.score;
  });
  const avg = tq ? Math.round((ts / tq) * 100) : 0;
  const pass = gradedList.filter((r) => r.score / r.total >= 0.5).length;
  document.getElementById("statsContainer").innerHTML =
    `<div class="stat-cards">
    <div class="stat-c"><div class="stat-n">${tot}</div><div class="stat-l">إجمالي المحاولات</div></div>
    <div class="stat-c"><div class="stat-n">${avg}%</div><div class="stat-l">متوسط النسبة</div></div>
    <div class="stat-c"><div class="stat-n">${fmtNum(mx)}</div><div class="stat-l">أعلى درجة</div></div>
    <div class="stat-c"><div class="stat-n">${tot ? Math.round((pass / tot) * 100) : 0}%</div><div class="stat-l">نسبة النجاح</div></div>
  </div>`;
};
window.showAdvStats = async () => {
  const snap = await get(ref(db, "results"));
  const all = snap.val() || {};
  const res = Object.values(all).filter(isResultGradingComplete);
  const perExam = {};
  let ex = 0,
    vg = 0,
    g = 0,
    w = 0;
  res.forEach((r) => {
    perExam[r.examId] = (perExam[r.examId] || 0) + 1;
    const p = (r.score / r.total) * 100;
    if (p >= 90) ex++;
    else if (p >= 75) vg++;
    else if (p >= 60) g++;
    else w++;
  });
  document.getElementById("statsContainer").innerHTML = `
    <div class="stat-cards">
      <div class="stat-c"><div class="stat-n">${res.length}</div><div class="stat-l">إجمالي</div></div>
      <div class="stat-c"><div class="stat-n" style="color:var(--S)">${ex}</div><div class="stat-l">ممتاز ≥90%</div></div>
      <div class="stat-c"><div class="stat-n" style="color:var(--W)">${vg}</div><div class="stat-l">جيد جداً ≥75%</div></div>
      <div class="stat-c"><div class="stat-n" style="color:var(--D)">${w}</div><div class="stat-l">ضعيف <60%</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
      <div class="chart-c"><canvas id="ch1"></canvas></div>
      <div class="chart-c"><canvas id="ch2"></canvas></div>
    </div>`;
  if (statsCharts.c1) statsCharts.c1.destroy();
  if (statsCharts.c2) statsCharts.c2.destroy();
  statsCharts.c1 = new Chart(document.getElementById("ch1").getContext("2d"), {
    type: "bar",
    data: {
      labels: Object.keys(perExam).map(
        (id) => (exams.find((e) => e.id === id) || {}).name || "امتحان محذوف",
      ),
      datasets: [
        {
          label: "طلاب",
          data: Object.values(perExam),
          backgroundColor: ["#1a73e8", "#0f9d58", "#7b2ff7", "#f9ab00", "#d93025"],
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
    },
  });
  statsCharts.c2 = new Chart(document.getElementById("ch2").getContext("2d"), {
    type: "doughnut",
    data: {
      labels: ["ممتاز", "جيد جداً", "جيد", "ضعيف"],
      datasets: [
        {
          data: [ex, vg, g, w],
          backgroundColor: ["#0f9d58", "#f9ab00", "#1a73e8", "#d93025"],
        },
      ],
    },
    options: { responsive: true },
  });
};

// ===== LOGS =====
window.loadLogs = async () => {
  const snap = await get(ref(db, "adminLogs"));
  const logs = snap.val();
  if (!logs) {
    document.getElementById("logsContainer").innerHTML =
      '<p style="color:var(--TS);text-align:center;padding:20px">لا توجد سجلات</p>';
    return;
  }
  let h = '<div style="display:flex;flex-direction:column;gap:6px">';
  Object.values(logs)
    .reverse()
    .forEach((l) => {
      h += `<div style="background:var(--BG);padding:9px 13px;border-radius:10px;font-size:13px;border:1px solid var(--BR)"><span style="color:var(--P);font-weight:700">${esc(l.time)}</span> — ${esc(l.action)}${l.admin ? ` <span style="color:var(--TS);font-size:12px">👤 ${esc(l.admin)}</span>` : ""}</div>`;
    });
  document.getElementById("logsContainer").innerHTML = h + "</div>";
};

// ===== SOUND =====
function playSound(type) {
  if (!soundOn) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ac.createOscillator(),
      g = ac.createGain();
    osc.connect(g);
    g.connect(ac.destination);
    osc.frequency.value = type === "submit" ? 880 : type === "ans" ? 440 : 660;
    g.gain.value = 0.06;
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.00001, ac.currentTime + 0.3);
    osc.stop(ac.currentTime + 0.3);
  } catch (e) { }
}

// ====================================================================
// ============= NEW ADVANCED ADMIN FEATURES (v2) =====================
// ====================================================================

// --- Per-exam toggle settings ---
window.examToggleShuffleQ = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.shuffleQ = !ex.shuffleQ;
  saveExams();
  renderExamDashboard(ex);
};
window.examToggleShuffleA = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.shuffleA = !ex.shuffleA;
  saveExams();
  renderExamDashboard(ex);
};
window.examToggleShowCorr = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.showCorrect = !ex.showCorrect;
  saveExams();
  renderExamDashboard(ex);
};
window.examToggleReview = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.allowReview = !ex.allowReview;
  saveExams();
  renderExamDashboard(ex);
};
window.examTogglePin = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.pinned = !ex.pinned;
  saveExams();
  renderExamDashboard(ex);
};
window.examToggleArchive = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.archived = !ex.archived;
  saveExams();
  renderExamDashboard(ex);
};

// --- Pass mark modal ---
window.examPassModal = () => {
  const ex = getCurEx();
  if (!ex) return;
  window._tempPass = ex.passMark || 50;
  document.getElementById("passMarkDsp").innerText = window._tempPass + "%";
  document.getElementById("passMarkModal").style.display = "flex";
};
window.adjPassMark = (d) => {
  window._tempPass = Math.max(0, Math.min(100, (window._tempPass || 50) + d));
  document.getElementById("passMarkDsp").innerText = window._tempPass + "%";
};
window.saveExamPassMark = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.passMark = window._tempPass || 50;
  saveExams();
  closeModal("passMarkModal");
  alert("✅ تم حفظ درجة النجاح: " + ex.passMark + "%");
};

// --- Max attempts modal ---
window.examAttemptsModal = () => {
  const ex = getCurEx();
  if (!ex) return;
  window._tempAtt = ex.maxAttempts || 1;
  document.getElementById("attemptsDsp").innerText =
    window._tempAtt === 0 ? "∞" : window._tempAtt;
  document.getElementById("attemptsModal").style.display = "flex";
};
window.adjAttempts = (d) => {
  window._tempAtt = Math.max(0, (window._tempAtt || 1) + d);
  document.getElementById("attemptsDsp").innerText =
    window._tempAtt === 0 ? "∞" : window._tempAtt;
};
window.saveExamAttempts = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.maxAttempts = window._tempAtt || 0;
  saveExams();
  closeModal("attemptsModal");
  alert(
    "✅ عدد المحاولات: " +
    (ex.maxAttempts === 0 ? "غير محدود" : ex.maxAttempts),
  );
};

// --- Schedule modal ---
window.examScheduleModal = () => {
  const ex = getCurEx();
  if (!ex) return;
  document.getElementById("schOpen").value = ex.scheduleOpen || "";
  document.getElementById("schClose").value = ex.scheduleClose || "";
  document.getElementById("scheduleModal").style.display = "flex";
};
window.saveExamSchedule = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.scheduleOpen = document.getElementById("schOpen").value || "";
  ex.scheduleClose = document.getElementById("schClose").value || "";
  saveExams();
  closeModal("scheduleModal");
  alert("✅ تم حفظ الجدولة");
};
window.clearExamSchedule = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.scheduleOpen = "";
  ex.scheduleClose = "";
  saveExams();
  closeModal("scheduleModal");
  alert("✅ تم مسح الجدولة");
};

// --- End message / intro ---
window.examEndMsgModal = () => {
  const ex = getCurEx();
  if (!ex) return;
  document.getElementById("endMsgInput").value = ex.endMsg || "";
  document.getElementById("endMsgModal").style.display = "flex";
};
window.saveExamEndMsg = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.endMsg = document.getElementById("endMsgInput").value;
  saveExams();
  closeModal("endMsgModal");
  alert("✅ تم حفظ الرسالة");
};
window.examIntroModal = () => {
  const ex = getCurEx();
  if (!ex) return;
  document.getElementById("introMsgInput").value = ex.introMsg || "";
  document.getElementById("introMsgModal").style.display = "flex";
};
window.saveExamIntroMsg = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.introMsg = document.getElementById("introMsgInput").value;
  saveExams();
  closeModal("introMsgModal");
  alert("✅ تم حفظ التعليمات");
};

// --- Duplicate / Reset results ---
window.examDuplicate = () => {
  const ex = getCurEx();
  if (!ex) return;
  const copy = {
    ...JSON.parse(JSON.stringify(ex)),
    id: "exam_" + Date.now(),
    name: ex.name + " (نسخة)",
    pinned: false,
    archived: false,
  };
  exams.push(copy);
  saveExams();
  logAction("نسخ امتحان: " + ex.name);
  alert("✅ تم نسخ الامتحان بنجاح");
};
window.examResetResults = async () => {
  const ex = getCurEx();
  if (!ex) return;
  if (!confirm(`تصفير كل نتائج "${ex.name}"؟ هذا الإجراء لا يمكن التراجع عنه.`))
    return;
  await remove(ref(db, `examResults/${ex.id}`));
  purgeEssayQueue(ex.id);
  logAction("تصفير نتائج: " + ex.name);
  alert("✅ تم تصفير نتائج هذا الامتحان");
};

// --- QR helpers (use external API for QR generation) ---
function qrUrlFor(text, size = 300) {
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(text)}&size=${size}x${size}&margin=10`;
}
window.examShowQR = () => {
  const ex = getCurEx();
  if (!ex) return;
  const url = location.origin + location.pathname + "?exam=" + ex.id;
  document.getElementById("qrTitle").innerText = "📱 رمز QR: " + ex.name;
  document.getElementById("qrImageWrap").innerHTML =
    `<img id="qrImg" src="${qrUrlFor(url)}" width="280" height="280" alt="QR">`;
  document.getElementById("qrUrlDisp").innerText = url;
  window._qrUrl = url;
  document.getElementById("qrModal").style.display = "flex";
};
window.openSiteQR = () => {
  const url = location.origin + location.pathname;
  document.getElementById("qrTitle").innerText = "📱 رمز QR: الموقع";
  document.getElementById("qrImageWrap").innerHTML =
    `<img id="qrImg" src="${qrUrlFor(url)}" width="280" height="280" alt="QR">`;
  document.getElementById("qrUrlDisp").innerText = url;
  window._qrUrl = url;
  document.getElementById("qrModal").style.display = "flex";
};
window.copyQRUrl = () => {
  navigator.clipboard
    .writeText(window._qrUrl || "")
    .then(() => alert("✅ تم نسخ الرابط"));
};
window.downloadQR = async () => {
  try {
    const res = await fetch(qrUrlFor(window._qrUrl, 600));
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "qr-code.png";
    a.click();
  } catch (e) {
    alert("فشل التنزيل: " + e.message);
  }
};

// --- Answer key PDF ---
window.examPrintAnswerKey = async () => {
  const ex = getCurEx();
  if (!ex) return;
  if (!ex.questions || !ex.questions.length) return alert("لا توجد أسئلة");
  const el = document.getElementById("pdfRender");
  const date = new Date().toLocaleDateString("ar-EG");
  el.innerHTML = `
    <div class="pdf-header">
      <div class="pdf-logo">📋</div>
      <div class="pdf-title">${ex.name}</div>
      <div class="pdf-sub">مفتاح الإجابة</div>
    </div>
    <div class="pdf-info-bar">
      <div class="pdf-info-item"><strong>عدد الأسئلة:</strong> ${ex.questions.length}</div>
      <div class="pdf-info-item"><strong>الوقت:</strong> ${Math.floor((ex.time || 1800) / 60)} دقيقة</div>
      <div class="pdf-info-item"><strong>التاريخ:</strong> ${date}</div>
    </div>
    <table class="pdf-table">
      <thead><tr><th style="width:8%">م</th><th style="width:54%">السؤال</th><th style="width:30%">الإجابة الصحيحة</th><th style="width:8%">الحرف</th></tr></thead>
      <tbody>
        ${ex.questions
      .map((q, i) => {
        const letters = ["أ", "ب", "ج", "د"];
        return `<tr><td>${i + 1}</td><td style="text-align:right;padding-right:10px">${q.q}</td><td style="text-align:right;padding-right:10px">${q.a[q.c]}</td><td><strong>${letters[q.c]}</strong></td></tr>`;
      })
      .join("")}
      </tbody>
    </table>
    <div class="pdf-footer"><strong>📋 مفتاح إجابة</strong> — ${ex.name} — ${new Date().toLocaleString("ar-EG")}</div>
  `;
  await generatePDFFromTemplate(`مفتاح_${ex.name}.pdf`);
  logAction("طباعة مفتاح إجابة: " + ex.name);
};

// --- Certificates PDF — رسم مباشر على Canvas لضمان ظهور العربية صح ---
window.examPrintCertificates = async () => {
  const ex = getCurEx();
  if (!ex) return;
  const list = (await getExamResults(ex.id)).filter(isResultGradingComplete).sort((a, b) => b.score - a.score);
  const passMark = ex.passMark || 50;
  const passers = list.filter(
    (r) => Math.round((r.score / r.total) * 100) >= passMark,
  );
  if (!passers.length) return alert("لا يوجد ناجحون لطباعة شهادات");
  if (
    !confirm(
      `سيتم إنشاء PDF فيه ${passers.length} شهادة (كل واحدة في صفحة لوحدها). متابعة؟`,
    )
  )
    return;

  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  await new Promise((res) => setTimeout(res, 200));

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "l", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const date = new Date().toLocaleDateString("ar-EG");
  const teacher = "";

  // دالة مساعدة: رسم نص عربي في المنتصف مع wrap تلقائي
  function drawCenteredText(ctx, text, x, y, maxWidth) {
    // نعكس الكلمات علشان Canvas يعرضها صح من اليمين لليسار
    ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    // تقطيع النص لو طويل
    const words = text.split(" ");
    let line = "";
    let lines = [];
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        lines.push(line.trim());
        line = words[n] + " ";
      } else line = testLine;
    }
    lines.push(line.trim());
    const lineH = parseInt(ctx.font) * 1.4;
    lines.forEach((l, i) =>
      ctx.fillText(l, x, y + (i - (lines.length - 1) / 2) * lineH),
    );
    ctx.restore();
    return lines.length;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  const CW = 1400,
    CH = 990; // canvas size (landscape ratio ~1.41)

  for (let i = 0; i < passers.length; i++) {
    const r = passers[i];
    const pct = Math.round((r.score / r.total) * 100);
    const gradeLabel =
      pct >= 90
        ? "ممتاز"
        : pct >= 75
          ? "جيد جداً"
          : pct >= 60
            ? "جيد"
            : "مقبول";
    const gColor =
      pct >= 90
        ? "#0f9d58"
        : pct >= 75
          ? "#1a73e8"
          : pct >= 60
            ? "#7b2ff7"
            : "#a07820";

    const cv = document.createElement("canvas");
    cv.width = CW;
    cv.height = CH;
    const ctx = cv.getContext("2d");

    // ---- خلفية ----
    const bg = ctx.createRadialGradient(CW / 2, 0, 0, CW / 2, CH / 2, CW * 0.8);
    bg.addColorStop(0, "#ffffff");
    bg.addColorStop(0.6, "#fffaf0");
    bg.addColorStop(1, "#fff5dc");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CW, CH);

    // ---- إطار خارجي double ----
    ctx.strokeStyle = "#c8a84b";
    ctx.lineWidth = 8;
    roundRect(ctx, 22, 22, CW - 44, CH - 44, 22);
    ctx.stroke();
    ctx.lineWidth = 2;
    roundRect(ctx, 38, 38, CW - 76, CH - 76, 14);
    ctx.stroke();

    // ---- زخارف الأركان ----
    const corners = [
      [55, 55, 0],
      [CW - 55, 55, Math.PI],
      [55, CH - 55, Math.PI * 1.5],
      [CW - 55, CH - 55, Math.PI * 0.5],
    ];
    ctx.font = "58px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    corners.forEach(([cx, cy]) => {
      ctx.fillText("🌿", cx, cy);
    });

    // ---- خط فاصل ذهبي ----
    const drawGoldLine = (y) => {
      const lg = ctx.createLinearGradient(CW * 0.2, y, CW * 0.8, y);
      lg.addColorStop(0, "transparent");
      lg.addColorStop(0.5, "#c8a84b");
      lg.addColorStop(1, "transparent");
      ctx.strokeStyle = lg;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(CW * 0.2, y);
      ctx.lineTo(CW * 0.8, y);
      ctx.stroke();
    };

    // ---- كوباية الكأس ----
    ctx.font = "100px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🏆", CW / 2, 130);

    // ---- شهادة تقدير ----
    ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = 'bold 72px "Tajawal","Cairo",sans-serif';
    ctx.fillStyle = "#a07820";
    ctx.shadowColor = "rgba(200,168,75,0.35)";
    ctx.shadowBlur = 12;
    ctx.fillText("شهادة تقدير", CW / 2, 230);
    ctx.shadowBlur = 0;
    ctx.restore();

    drawGoldLine(270);

    // ---- تشهد إدارة ----
    ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '28px "Tajawal","Cairo",sans-serif';
    ctx.fillStyle = "#666666";
    ctx.fillText("تشهد إدارة منصة امتحان لغة عربية بأن:", CW / 2, 310);
    ctx.restore();

    // ---- اسم الطالب — مستطيل أزرق ----
    const nameBoxW = Math.min(900, CW - 160);
    const nameBoxX = (CW - nameBoxW) / 2;
    const nameBoxY = 345;
    const nameBoxH = 90;
    ctx.fillStyle = "#eaf2fe";
    ctx.strokeStyle = "rgba(26,115,232,0.3)";
    ctx.lineWidth = 2.5;
    roundRect(ctx, nameBoxX, nameBoxY, nameBoxW, nameBoxH, 18);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = 'bold 52px "Tajawal","Cairo",sans-serif';
    ctx.fillStyle = "#1a73e8";
    // تصغير الخط لو الاسم طويل
    const nameMetrics = ctx.measureText(r.name);
    if (nameMetrics.width > nameBoxW - 60) {
      const ratio = (nameBoxW - 60) / nameMetrics.width;
      const newSize = Math.floor(52 * ratio);
      ctx.font = `bold ${Math.max(newSize, 28)}px "Tajawal","Cairo",sans-serif`;
    }
    ctx.fillText(r.name, CW / 2, nameBoxY + nameBoxH / 2);
    ctx.restore();

    // ---- من الصف وأجتاز ----
    ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '28px "Tajawal","Cairo",sans-serif';
    ctx.fillStyle = "#444444";
    ctx.fillText("قد اجتاز بنجاح امتحان", CW / 2, 480);
    ctx.restore();

    // ---- اسم الامتحان ----
    ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = 'bold 38px "Tajawal","Cairo",sans-serif';
    ctx.fillStyle = "#7b2ff7";
    const examText = '"' + ex.name + '"';
    const examMetrics = ctx.measureText(examText);
    if (examMetrics.width > CW - 160) {
      const ratio2 = (CW - 160) / examMetrics.width;
      ctx.font = `bold ${Math.floor(38 * ratio2)}px "Tajawal","Cairo",sans-serif`;
    }
    ctx.fillText(examText, CW / 2, 535);
    ctx.restore();

    drawGoldLine(580);

    // ---- بطاقات الدرجة / النسبة / التقدير ----
    const cards = [
      {
        label: "الدرجة",
        value: `${r.score}/${r.total}`,
        color: "#0f9d58",
        border: "rgba(15,157,88,0.3)",
      },
      {
        label: "النسبة",
        value: `${pct}%`,
        color: "#1a73e8",
        border: "rgba(26,115,232,0.3)",
      },
      {
        label: "التقدير",
        value: gradeLabel,
        color: gColor,
        border: gColor + "55",
      },
    ];
    const cardW = 200,
      cardH = 110,
      cardGap = 60;
    const cardsTotal = cards.length * cardW + (cards.length - 1) * cardGap;
    const cardsStartX = (CW - cardsTotal) / 2;
    const cardY = 600;
    cards.forEach((card, ci) => {
      const cx = cardsStartX + ci * (cardW + cardGap);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = card.border;
      ctx.lineWidth = 2.5;
      roundRect(ctx, cx, cardY, cardW, cardH, 14);
      ctx.fill();
      ctx.stroke();
      // قيمة
      ctx.save();
      ctx.direction = "rtl";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold 34px "Tajawal","Cairo",sans-serif`;
      ctx.fillStyle = card.color;
      ctx.fillText(card.value, cx + cardW / 2, cardY + 38);
      // تسمية
      ctx.font = '18px "Cairo",sans-serif';
      ctx.fillStyle = "#666666";
      ctx.fillText(card.label, cx + cardW / 2, cardY + 78);
      ctx.restore();
    });

    // ---- التوقيعات ----
    const sigY = 760;
    // خط المعلم (يسار)
    ctx.strokeStyle = "#c8a84b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(120, sigY);
    ctx.lineTo(340, sigY);
    ctx.stroke();
    ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = 'bold 22px "Tajawal","Cairo",sans-serif';
    ctx.fillStyle = "#a07820";
    if (teacher) ctx.fillText(teacher, 230, sigY + 8);
    ctx.font = '17px "Cairo",sans-serif';
    ctx.fillStyle = "#aaaaaa";
    ctx.fillText("التوقيع", 230, sigY + 36);
    ctx.restore();
    // نجوم وسط
    ctx.font = "28px serif";
    ctx.textAlign = "center";
    ctx.fillText("✦ ✦ ✦", CW / 2, sigY - 2);
    // خط التاريخ (يمين)
    ctx.strokeStyle = "#c8a84b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CW - 340, sigY);
    ctx.lineTo(CW - 120, sigY);
    ctx.stroke();
    ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = 'bold 22px "Tajawal","Cairo",sans-serif';
    ctx.fillStyle = "#a07820";
    ctx.fillText(date, CW - 230, sigY + 8);
    ctx.font = '17px "Cairo",sans-serif';
    ctx.fillStyle = "#aaaaaa";
    ctx.fillText("تاريخ الإصدار", CW - 230, sigY + 36);
    ctx.restore();

    // ---- تحويل لـ PDF ----
    const imgData = cv.toDataURL("image/jpeg", 0.97);
    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, 0, pageW, pageH);
  }

  pdf.save(`شهادات_${ex.name}.pdf`);
  logAction(`طباعة ${passers.length} شهادة: ${ex.name}`);
  showToast("✅ تم إنشاء " + passers.length + " شهادة");
};

// --- Question analytics ---
window.examQuestionAnalytics = async () => {
  const ex = getCurEx();
  if (!ex) return;
  const list = await getExamResults(ex.id);
  if (!list.length) return alert("لا توجد نتائج لتحليلها");
  const totalStudents = list.length;
  const stats = (ex.questions || [])
    .map((q, qi) => {
      if (q.type === "essay") return null;
      let correct = 0,
        wrong = 0,
        blank = 0;
      list.forEach((r) => {
        const snap = r.questionsSnapshot || [];
        const sq = snap[qi];
        if (!sq) {
          blank++;
          return;
        }
        const ua = r.userAnswers?.[qi];
        if (ua === undefined || ua === null) blank++;
        else if (ua === sq.c) correct++;
        else wrong++;
      });
      const pct = totalStudents
        ? Math.round((correct / totalStudents) * 100)
        : 0;
      return { q: q.q, correct, wrong, blank, pct, qi: qi + 1 };
    })
    .filter(Boolean)
    .sort((a, b) => a.pct - b.pct);
  const c = document.getElementById("qAnalyticsArea");
  const essayNote = (ex.questions || []).some((q) => q.type === "essay")
    ? '<p class="essay-pending-notice">الأسئلة المقالية غير داخلة في التحليل لأنها بتتصحح يدوياً.</p>'
    : "";
  c.innerHTML = essayNote + stats
    .map((s) => {
      const color =
        s.pct >= 70 ? "var(--S)" : s.pct >= 40 ? "var(--W)" : "var(--D)";
      return `<div style="background:var(--CB);padding:12px 14px;border-radius:12px;margin-bottom:8px;border-right:4px solid ${color}">
      <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:6px">
        <strong style="color:var(--TX);font-size:13px">سؤال ${s.qi}: ${s.q.substring(0, 80)}${s.q.length > 80 ? "..." : ""}</strong>
        <span style="color:${color};font-weight:900;font-size:16px">${s.pct}%</span>
      </div>
      <div style="display:flex;gap:8px;font-size:11px;color:var(--TS)">
        <span>✅ ${s.correct} صحيح</span>
        <span>❌ ${s.wrong} خطأ</span>
        <span>➖ ${s.blank} لم يجب</span>
      </div>
      <div style="height:6px;background:var(--BR);border-radius:4px;margin-top:6px;overflow:hidden"><div style="height:100%;width:${s.pct}%;background:${color}"></div></div>
    </div>`;
    })
    .join("");
  document.getElementById("qAnalyticsModal").style.display = "flex";
};

// --- Export full exam (with results) ---
window.examExportFull = async () => {
  const ex = getCurEx();
  if (!ex) return;
  const results = await getExamResults(ex.id);
  const data = { exam: ex, results, exported: new Date().toISOString() };
  const b = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = `exam_full_${ex.name}.json`;
  a.click();
};

// --- Branding ---
function applyBranding() {
  const b = window._branding || {};
  applySiteBackground();
  // أي اسم مدرس قديم متخزن في قاعدة البيانات مش هيظهر
  const clean = (v) => (/محمد\s*جمال/.test(String(v || "")) ? "" : String(v || ""));
  if (clean(b.title)) {
    const t = document.querySelector(".login-title");
    if (t) t.innerText = clean(b.title);
  }
  const sub = document.querySelector(".login-sub");
  if (sub) sub.innerText = clean(b.subtitle);
  if (b.emoji) {
    const l = document.querySelector(".login-logo");
    if (l) l.innerText = b.emoji;
  }
  if (b.welcomeMsg) {
    let div = document.getElementById("brandWelcomeMsg");
    if (!div) {
      div = document.createElement("div");
      div.id = "brandWelcomeMsg";
      div.style.cssText =
        "background:var(--PL);color:var(--P);padding:10px 14px;border-radius:11px;font-weight:700;margin:8px 0;font-size:13px;text-align:center;white-space:pre-wrap";
      const sub = document.querySelector(".login-sub");
      if (sub && sub.parentNode)
        sub.parentNode.insertBefore(div, sub.nextSibling);
    }
    div.innerText = b.welcomeMsg;
  }
}
onValue(ref(db, "branding"), (snap) => {
  window._branding = snap.val() || {};
  applyBranding();
});

window.openBrandingModal = () => {
  const b = window._branding || {};
  document.getElementById("brandTitle").value = b.title || "";
  document.getElementById("brandSubtitle").value = /محمد\s*جمال/.test(b.subtitle || "") ? "" : b.subtitle || "";
  document.getElementById("brandEmoji").value = b.emoji || "";
  document.getElementById("brandingModal").style.display = "flex";
};
window.saveBranding = () => {
  const b = {
    title: document.getElementById("brandTitle").value.trim(),
    subtitle: document.getElementById("brandSubtitle").value.trim(),
    emoji: document.getElementById("brandEmoji").value.trim(),
  };
  update(ref(db, "branding"), b);
  closeModal("brandingModal");
  alert("✅ تم حفظ هوية الموقع");
};
window.openWelcomeMsgModal = () => {
  const b = window._branding || {};
  document.getElementById("welcomeMsgInput").value = b.welcomeMsg || "";
  document.getElementById("welcomeMsgModal").style.display = "flex";
};
window.saveWelcomeMsg = () => {
  update(ref(db, "branding"), {
    welcomeMsg: document.getElementById("welcomeMsgInput").value,
  });
  closeModal("welcomeMsgModal");
  alert("✅ تم حفظ رسالة الترحيب");
};

// --- Global search ---
window.openSearchModal = () => {
  document.getElementById("searchInput").value = "";
  document.getElementById("searchResults").innerHTML =
    '<p style="color:var(--TS);text-align:center;padding:20px">اكتب كلمة للبحث...</p>';
  document.getElementById("searchModal").style.display = "flex";
  setTimeout(() => document.getElementById("searchInput").focus(), 200);
};
window.runGlobalSearch = async () => {
  const term = document
    .getElementById("searchInput")
    .value.trim()
    .toLowerCase();
  const c = document.getElementById("searchResults");
  if (term.length < 2) {
    c.innerHTML =
      '<p style="color:var(--TS);text-align:center;padding:20px">اكتب على الأقل حرفين...</p>';
    return;
  }
  const matched = [];
  exams.forEach((ex) => {
    if (
      ex.name.toLowerCase().includes(term) ||
      ex.desc?.toLowerCase().includes(term)
    ) {
      matched.push({
        type: "exam",
        label: `📋 ${ex.name}`,
        sub: ex.desc || "",
        action: `openExamDashboard('${ex.id}')`,
      });
    }
    (ex.questions || []).forEach((q, qi) => {
      if (
        q.q.toLowerCase().includes(term) ||
        q.a.some((a) => a.toLowerCase().includes(term))
      ) {
        matched.push({
          type: "q",
          label: `❓ ${q.q.substring(0, 80)}`,
          sub: `في امتحان: ${ex.name}`,
          action: `openExamDashboard('${ex.id}')`,
        });
      }
    });
  });
  bankQs.forEach((q, i) => {
    if (q.q.toLowerCase().includes(term)) {
      matched.push({
        type: "b",
        label: `📚 ${q.q.substring(0, 80)}`,
        sub: "في بنك الأسئلة",
        action: `openBankEdit(${i})`,
      });
    }
  });
  if (!matched.length) {
    c.innerHTML =
      '<p style="color:var(--TS);text-align:center;padding:20px">لا توجد نتائج مطابقة</p>';
    return;
  }
  c.innerHTML =
    matched
      .slice(0, 40)
      .map(
        (m) => `
    <div style="background:var(--CB);padding:10px 12px;border-radius:10px;margin-bottom:6px;cursor:pointer;border:1px solid var(--BR)" onclick="closeModal('searchModal');${m.action}">
      <div style="font-weight:700;color:var(--TX);font-size:13px">${m.label}</div>
      <div style="font-size:11px;color:var(--TS);margin-top:3px">${m.sub}</div>
    </div>
  `,
      )
      .join("") +
    (matched.length > 40
      ? `<p style="color:var(--TS);text-align:center;padding:8px;font-size:12px">و ${matched.length - 40} نتيجة أخرى...</p>`
      : "");
};

// --- Backup / Restore ---
window.fullBackup = async () => {
  const examsSnap = (await get(ref(db, "exams"))).val() || {};
  const bankSnap = (await get(ref(db, "bankQuestions"))).val() || {};
  const resSnap = (await get(ref(db, "examResults"))).val() || {};
  const brandSnap = (await get(ref(db, "branding"))).val() || {};
  const data = {
    version: 2,
    exported: new Date().toISOString(),
    exams: examsSnap,
    bankQuestions: bankSnap,
    examResults: resSnap,
    branding: brandSnap,
  };
  const b = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  logAction("نسخة احتياطية كاملة");
  alert("✅ تم تنزيل النسخة الاحتياطية");
};
window.restoreBackup = () => {
  if (
    !confirm(
      "⚠️ سيتم استبدال البيانات الحالية بمحتوى النسخة الاحتياطية. متابعة؟",
    )
  )
    return;
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = ".json";
  inp.onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        if (d.exams) await set(ref(db, "exams"), d.exams);
        if (d.bankQuestions)
          await set(ref(db, "bankQuestions"), d.bankQuestions);
        if (d.examResults) await set(ref(db, "examResults"), d.examResults);
        if (d.branding) await set(ref(db, "branding"), d.branding);
        logAction("استرجاع نسخة احتياطية");
        alert("✅ تم استرجاع النسخة بنجاح");
      } catch (err) {
        alert("خطأ: " + err.message);
      }
    };
    r.readAsText(f);
  };
  inp.click();
};
window.exportAllExams = () => {
  if (!exams.length) return alert("لا توجد امتحانات");
  const b = new Blob([JSON.stringify(exams, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = `all_exams_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
};
window.importMultipleExams = () => {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = ".json";
  inp.onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        if (!Array.isArray(d))
          return alert("الملف يجب أن يكون مصفوفة امتحانات");
        d.forEach((ex) => {
          ex.id = "exam_" + Date.now() + Math.random().toString(36).slice(2, 6);
          exams.push(ex);
        });
        saveExams();
        alert(`✅ تم استيراد ${d.length} امتحان`);
      } catch (err) {
        alert("خطأ: " + err.message);
      }
    };
    r.readAsText(f);
  };
  inp.click();
};

// ===== COMPLAINTS =====
let _complaintPhoneVisible = false;
let _complaintPhoneRaw = "";

window.openComplaintModal = () => {
  const nameVal = document.getElementById("nameInput").value.trim();
  const phoneVal = document.getElementById("phoneInput").value.trim();
  document.getElementById("complaintText").value = "";
  _complaintPhoneVisible = false;
  _complaintPhoneRaw = phoneVal;

  const infoDiv = document.getElementById("complaintStudentInfo");
  if (nameVal) {
    document.getElementById("complaintStudentName").innerText = nameVal;
    document.getElementById("complaintStudentPhone").innerText = phoneVal
      ? "••••••••••"
      : "لم يُدخل رقم";
    document.getElementById("complaintPhoneToggle").innerText = "👁️ إظهار";
    infoDiv.style.display = "flex";
  } else {
    infoDiv.style.display = "none";
  }
  document.getElementById("complaintModal").style.display = "flex";
};

window.toggleComplaintPhone = () => {
  _complaintPhoneVisible = !_complaintPhoneVisible;
  const phoneEl = document.getElementById("complaintStudentPhone");
  const toggleBtn = document.getElementById("complaintPhoneToggle");
  if (_complaintPhoneVisible) {
    phoneEl.innerText = _complaintPhoneRaw || "لم يُدخل رقم";
    toggleBtn.innerText = "🙈 إخفاء";
  } else {
    phoneEl.innerText = _complaintPhoneRaw ? "••••••••••" : "لم يُدخل رقم";
    toggleBtn.innerText = "👁️ إظهار";
  }
};

window.sendComplaint = async () => {
  const text = document.getElementById("complaintText").value.trim();
  if (!text) return alert("⚠️ من فضلك اكتب نص الشكوى");
  if (text.length < 10)
    return alert("⚠️ الشكوى قصيرة جداً، اشرح المشكلة بوضوح");

  const nameVal = document.getElementById("nameInput").value.trim();
  const phoneVal = document.getElementById("phoneInput").value.trim();

  const complaint = {
    name: nameVal || "زائر غير مسجل",
    phone: phoneVal || "غير متاح",
    text,
    time: new Date().toLocaleString("ar-EG"),
    timestamp: Date.now(),
    read: false,
  };

  try {
    const cref = push(ref(db, "complaints"));
    const nref = push(ref(db, "adminNotifications"));
    await update(ref(db), {
      [`complaints/${cref.key}`]: complaint,
      [`adminNotifications/${nref.key}`]: {
        type: "complaint",
        refId: cref.key,
        title: "شكوى جديدة",
        body: `${complaint.name}: ${text.slice(0, 80)}`,
        ts: serverTimestamp(),
      },
    });
    closeModal("complaintModal");
    alert("✅ تم إرسال شكواك بنجاح. سيتم مراجعتها من قِبل الأستاذ.");
  } catch (e) {
    alert("❌ حدث خطأ: " + e.message);
  }
};

// (إدارة الشكاوى للأدمن + الإشعارات: انظر نهاية الملف — حالة القراءة لكل أدمن على حدة)

// ===== AI EXTRACT =====
let aiExtractedQs = [];
let _aiFileText = "";
let _aiFileB64 = "";
let _aiFileIsImg = false;

window.openAIExtractModal = () => {
  window.resetAIExtract();
  document.getElementById("aiExtractModal").style.display = "flex";
};

window.resetAIExtract = () => {
  document.getElementById("aiStep1").style.display = "block";
  document.getElementById("aiStep2").style.display = "none";
  document.getElementById("aiStep3").style.display = "none";
  document.getElementById("aiStepErr").style.display = "none";
  document.getElementById("aiFileInput").value = "";
  document.getElementById("aiFileName").style.display = "none";
  document.getElementById("aiImgPreview").style.display = "none";
  aiExtractedQs = [];
  _aiFileText = "";
  _aiFileB64 = "";
  _aiFileIsImg = false;
};

window.aiFileSelected = (input) => {
  const file = input.files[0];
  if (!file) return;
  document.getElementById("aiFileName").innerText = "📄 " + file.name;
  document.getElementById("aiFileName").style.display = "block";
  const isImg = file.type.startsWith("image/");
  _aiFileIsImg = isImg;
  const reader = new FileReader();
  if (isImg) {
    reader.onload = (e) => {
      _aiFileB64 = e.target.result.split(",")[1];
      document.getElementById("aiPreviewImg").src = e.target.result;
      document.getElementById("aiImgPreview").style.display = "block";
    };
    reader.readAsDataURL(file);
  } else if (file.name.toLowerCase().endsWith(".pdf")) {
    reader.onload = (e) => {
      const bytes = new Uint8Array(e.target.result);
      _aiFileB64 = btoa(String.fromCharCode(...bytes));
      _aiFileIsImg = false;
      _aiFileText = "[pdf]";
    };
    reader.readAsArrayBuffer(file);
  } else {
    reader.onload = (e) => {
      _aiFileText = e.target.result;
      _aiFileIsImg = false;
    };
    reader.readAsText(file, "utf-8");
  }
};

window.runAIExtract = async () => {
  const hasContent = _aiFileIsImg
    ? _aiFileB64
    : _aiFileText && _aiFileText.trim();
  if (!hasContent) return alert("برجاء رفع ملف أولاً");
  const numQ = document.getElementById("aiNumQ").value;
  const qType = document.getElementById("aiQType").value;
  const typeAr = {
    mixed: "مختلطة (أكمل + معنى + اختيار من متعدد)",
    mcq: "اختيار من متعدد (4 خيارات)",
    complete: "أكمل الآية أو العبارة",
    meaning: "معنى الكلمة من النص",
  };
  document.getElementById("aiStep1").style.display = "none";
  document.getElementById("aiStep2").style.display = "block";
  document.getElementById("aiStepErr").style.display = "none";
  const msgs = [
    "بيقرأ النص ويحلله...",
    "بيولّد الأسئلة...",
    "بيراجع الإجابات...",
    "بيرتب النتائج...",
  ];
  let mi = 0;
  const iv = setInterval(() => {
    document.getElementById("aiLoadMsg").innerText = msgs[mi++ % msgs.length];
  }, 2000);
  try {
    const instrText = `أنت مساعد متخصص في إنشاء أسئلة امتحانات اللغة العربية والقرآن الكريم.
من النص أو الصورة، استخرج بالضبط ${numQ} سؤال من نوع: ${typeAr[qType]}.
شروط:
- كل سؤال له 4 خيارات فقط
- الإجابة الصحيحة مستندة للنص
- الأسئلة متنوعة تغطي أجزاء مختلفة
- أسئلة أكمل الآية: اكتب بداية الآية والطالب يكمل
- أسئلة المعنى: اسأل عن معنى كلمة موجودة في النص
أرجع JSON فقط بدون أي نص قبله أو بعده:
[{"q":"نص السؤال","a":["خيار1","خيار2","خيار3","خيار4"],"c":0,"ctx":""}]
حيث c هو index الإجابة الصحيحة (0-3).`;

    let userContent;
    if (_aiFileIsImg) {
      const mimeMatch = document
        .getElementById("aiPreviewImg")
        .src.match(/^data:([^;]+);/);
      const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
      userContent = [
        {
          type: "image",
          source: { type: "base64", media_type: mime, data: _aiFileB64 },
        },
        { type: "text", text: instrText },
      ];
    } else if (_aiFileText === "[pdf]") {
      userContent = [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: _aiFileB64,
          },
        },
        { type: "text", text: instrText },
      ];
    } else {
      userContent = instrText + "\n\nالنص:\n" + _aiFileText.slice(0, 4000);
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{ role: "user", content: userContent }],
      }),
    });
    clearInterval(iv);
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error?.message || "خطأ في الـ API");
    }
    const data = await res.json();
    let raw = data.content
      .map((b) => b.text || "")
      .join("")
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length)
      throw new Error("لم يتم استخراج أي أسئلة");
    aiExtractedQs = parsed.map((q) => ({
      ...q,
      active: true,
    }));
    _renderAIResults();
  } catch (e) {
    clearInterval(iv);
    document.getElementById("aiStep2").style.display = "none";
    document.getElementById("aiStep1").style.display = "block";
    document.getElementById("aiStepErr").innerText = "❌ " + e.message;
    document.getElementById("aiStepErr").style.display = "block";
  }
};

function _renderAIResults() {
  document.getElementById("aiStep2").style.display = "none";
  document.getElementById("aiStep3").style.display = "block";
  const labels = ["أ", "ب", "ج", "د"];
  document.getElementById("aiResultsContainer").innerHTML = aiExtractedQs
    .map(
      (q, i) => `
    <div class="ai-q-card">
      <div class="ai-q-num">سؤال ${i + 1}</div>
      <div class="ai-q-text">${q.q}</div>
      <div class="ai-q-opts">${q.a.map((o, j) => `<div class="ai-q-opt${j === q.c ? " ai-correct" : ""}">${labels[j]}) ${o}</div>`).join("")}</div>
      <div class="ai-q-ans">✓ الإجابة الصحيحة: ${q.a[q.c]}</div>
    </div>`,
    )
    .join("");
}

window.aiAddToBank = () => {
  if (!aiExtractedQs.length) return;
  bankQs = [...bankQs, ...aiExtractedQs];
  set(ref(db, "bankQuestions"), bankQs);
  logAction("AI استخراج " + aiExtractedQs.length + " سؤال للبنك");
  closeModal("aiExtractModal");
  showToast("✅ تم إضافة " + aiExtractedQs.length + " سؤال لبنك الأسئلة");
};

window.aiAddToExam = () => {
  const ex = getCurEx();
  if (!ex) return alert("لم يتم تحديد امتحان");
  if (!ex.questions) ex.questions = [];
  ex.questions = [...ex.questions, ...aiExtractedQs];
  saveExams();
  logAction(
    "AI استخراج " + aiExtractedQs.length + " سؤال للامتحان: " + ex.name,
  );
  closeModal("aiExtractModal");
  renderExamQList();
  renderExamDashboard(ex);
  showToast("✅ تم إضافة " + aiExtractedQs.length + " سؤال للامتحان");
};

// ===== INIT =====
const sb = document.getElementById("soundBtn");
if (sb) sb.innerText = soundOn ? "🔊 الأصوات: مفعل" : "🔇 الأصوات: معطل";

// auto-apply schedules every 30s
setInterval(() => {
  if (exams.length) applySchedules();
}, 30000);

// allow direct exam links via ?exam=ID (after login)
const urlExamId = new URLSearchParams(location.search).get("exam");
if (urlExamId) window._directExamId = urlExamId;

// =====================================================================
// ===== حسابات الأدمن + المالك + خلفية الموقع + منتدى الأدمن =====
// =====================================================================

// ---------- helpers ----------
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function safeImageSource(value) {
  const src = String(value || "").trim();
  return /^(data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$|https:\/\/[^\s"'()\\]+$)/i.test(
    src,
  )
    ? src
    : "";
}

function base64FromBytes(bytes) {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

async function makePasswordHash(password, saltBase64 = "") {
  if (!window.crypto || !crypto.subtle)
    throw new Error("المتصفح لا يدعم التشفير. افتح الموقع عبر رابط https.");
  const salt = saltBase64
    ? Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0))
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    key,
    256,
  );
  return {
    salt: base64FromBytes(salt),
    hash: base64FromBytes(new Uint8Array(bits)),
  };
}

async function verifyPassword(password, cred) {
  if (!cred || !cred.salt || !cred.hash) return false;
  const r = await makePasswordHash(password, cred.salt);
  return r.hash === cred.hash;
}

const acctCred = (a) =>
  a && a.passwordSalt && a.passwordHash
    ? { salt: a.passwordSalt, hash: a.passwordHash }
    : null;

async function getOwnerRecord() {
  const rec = (await get(ref(db, "adminProfiles/owner"))).val() || {};
  const cred = acctCred(rec) || OWNER_DEFAULT;
  return { rec, cred };
}

// هل كلمة السر مستخدمة عند المالك أو أدمن تاني؟ (الدخول بكلمة السر لازم تكون فريدة)
async function passwordTaken(password, exceptId) {
  if (exceptId !== "owner") {
    const { cred } = await getOwnerRecord();
    if (await verifyPassword(password, cred)) return true;
  }
  const accounts = (await get(ref(db, "adminAccounts"))).val() || {};
  for (const [id, a] of Object.entries(accounts)) {
    if (id === exceptId) continue;
    if (await verifyPassword(password, acctCred(a))) return true;
  }
  return false;
}

async function compressImageFile(file, maxBytes = 300000, maxSide = 1440) {
  if (!file || !file.type?.startsWith("image/"))
    throw new Error("اختر ملف صورة صالحاً.");
  if (file.size > 12 * 1024 * 1024)
    throw new Error("حجم الصورة الأصلية أكبر من 12 ميجابايت.");
  const originalData = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("تعذرت قراءة الصورة."));
    r.readAsDataURL(file);
  });
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("تعذر فتح ملف الصورة."));
    image.src = originalData;
  });
  let scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  for (let attempt = 0; attempt < 12; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذر تجهيز الصورة.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const quality = Math.max(0.42, 0.82 - attempt * 0.045);
    const result = canvas.toDataURL("image/jpeg", quality);
    const bytes = Math.ceil((result.length - result.indexOf(",") - 1) * 0.75);
    if (bytes <= maxBytes) return result;
    if (attempt % 3 === 2) scale *= 0.82;
  }
  throw new Error("الصورة ما زالت كبيرة بعد ضغطها. اختر صورة أصغر.");
}

function setImagePreview(id, source, alt) {
  const el = document.getElementById(id);
  if (!el) return;
  const src = safeImageSource(source);
  el.innerHTML = src ? `<img src="${esc(src)}" alt="${esc(alt || "")}">` : "";
}

const isOwner = () => window._currentAdmin?.role === "owner";
function requireOwner() {
  if (isOwner()) return false;
  alert("هذا الإجراء متاح لمالك الموقع فقط.");
  return true;
}
const validPassword = (pw) => typeof pw === "string" && pw.length >= 8;

async function logAction(a) {
  push(ref(db, "adminLogs"), {
    action: a,
    admin: window._currentAdmin?.name || "",
    time: new Date().toLocaleString("ar-EG"),
  });
}

// ---------- login ----------
let _authFails = 0,
  _authLockUntil = 0,
  _authBusy = false;

window.checkAdminAuth = async () => {
  if (_authBusy) return;
  if (Date.now() < _authLockUntil) {
    const sec = Math.ceil((_authLockUntil - Date.now()) / 1000);
    return alert(`محاولات كتير غلط. استنى ${sec} ثانية وجرّب تاني.`);
  }
  const input = document.getElementById("adminPassInput");
  const p = input.value;
  if (!p) return;
  _authBusy = true;
  try {
    const typedName = document.getElementById("nameInput")?.value || "";
    const nameOk = (adminName) => normName(adminName) === normName(typedName);
    const { rec, cred } = await getOwnerRecord();
    if (await verifyPassword(p, cred)) {
      if (!nameOk(rec.name || ownerProfile.name)) {
        return alert("اكتب اسمك في خانة الاسم بالظبط زي ما هو مكتوب في حساب الأدمن، وبعدين كلمة السر.");
      }
      _authFails = 0;
      await openAdminSession({
        id: "owner",
        role: "owner",
        name: rec.name || ownerProfile.name,
        photo: rec.photo || "",
      });
      return;
    }
    const accounts = (await get(ref(db, "adminAccounts"))).val() || {};
    for (const [id, a] of Object.entries(accounts)) {
      if (!(await verifyPassword(p, acctCred(a)))) continue;
      if (a.active === false) {
        return alert("حساب الأدمن ده متعطّل. كلّم المالك.");
      }
      if (!nameOk(a.name)) {
        return alert("اكتب اسمك في خانة الاسم بالظبط زي ما هو مكتوب في حساب الأدمن، وبعدين كلمة السر.");
      }
      _authFails = 0;
      await openAdminSession({ id, role: "admin", name: a.name, photo: a.photo });
      return;
    }
    _authFails++;
    if (_authFails >= 5) {
      _authFails = 0;
      _authLockUntil = Date.now() + 30000;
    }
    alert("❌ كلمة السر خطأ!");
  } catch (e) {
    console.error("Admin sign-in failed", e);
    alert(e.message || "تعذر التحقق من الحساب. تأكد من الاتصال وحاول تاني.");
  } finally {
    _authBusy = false;
  }
};

async function openAdminSession(admin, opts = {}) {
  window._currentAdmin = {
    id: admin.id,
    role: admin.role,
    name: admin.name || (admin.role === "owner" ? "مالك الموقع" : "أدمن"),
    photo: safeImageSource(admin.photo),
  };
  pendingAdminProfilePhoto = null;
  document.body.classList.add("is-admin");
  document.body.classList.toggle("owner-admin", admin.role === "owner");
  document.getElementById("adminPanel").style.display = "block";
  backToExamsList();
  renderBankList();
  renderAdminAccounts();
  updateAdminIdentity(true);
  hideAdminAuth();
  document.getElementById("adminPassInput").value = "";
  // ارجع لأول تاب (امتحانات) عند كل دخول
  const firstTab = document.querySelector("#adminMainView .atab");
  if (firstTab) window.switchTab("exams", firstTab);
  renderForum();
  startAdminRealtime();
  if (opts.restored) {
    watchOwnSession();
  } else {
    logAction("دخول لوحة التحكم");
    createPersistentSession(window._currentAdmin).catch((e) =>
      console.warn("persist session failed", e),
    );
  }
  document.dispatchEvent(new CustomEvent("admin:session-start", { detail: window._currentAdmin }));
}

window.closeAdminPanel = () => {
  stopAdminRealtime();
  document.getElementById("adminPanel").style.display = "none";
  document.body.classList.remove("is-admin", "owner-admin");
  window._currentAdmin = null;
  document.dispatchEvent(new CustomEvent("admin:session-end"));
};

function updateAdminIdentity(fillProfile = false) {
  const admin = window._currentAdmin;
  if (!admin) return;
  const title = document.getElementById("adminHeaderTitle");
  const avatar = document.getElementById("adminHeaderAvatar");
  const badge = document.getElementById("adminRoleBadge");
  if (title) title.innerText = `⚙️ لوحة التحكم — ${admin.name}`;
  if (badge) {
    badge.innerText = admin.role === "owner" ? "👑 المالك" : "أدمن";
    badge.className = "role-badge" + (admin.role === "owner" ? " owner" : "");
  }
  if (avatar) {
    const src = safeImageSource(admin.photo);
    avatar.hidden = !src;
    if (src) avatar.src = src;
    else avatar.removeAttribute("src");
  }
  if (fillProfile) {
    const n = document.getElementById("adminProfileNameInput");
    if (n) n.value = admin.name;
    setImagePreview("adminProfilePreview", admin.photo, "صورتي");
    const f = document.getElementById("adminProfileFile");
    if (f) f.value = "";
  }
}

window.openMyAccountTab = () => {
  const b = document.getElementById("accountTabBtn");
  if (b) window.switchTab("account", b);
};

// ---------- live data ----------
onValue(ref(db, "adminAccounts"), (snap) => {
  adminAccounts = snap.val() || {};
  if (typeof refreshAdminEntry === "function") refreshAdminEntry();
  renderAdminAccounts();
  const me = window._currentAdmin;
  if (me && me.role === "admin") {
    const cur = adminAccounts[me.id];
    if (!cur || cur.active === false) {
      window.closeAdminPanel();
      alert("تم تعطيل حساب الأدمن بتاعك أو حذفه.");
    } else {
      window._currentAdmin = {
        ...me,
        name: cur.name || me.name,
        photo: safeImageSource(cur.photo),
      };
      updateAdminIdentity();
    }
  }
  renderForum();
});

onValue(ref(db, "adminProfiles/owner"), (snap) => {
  const v = snap.val() || {};
  ownerProfile = {
    name: v.name || "مالك الموقع",
    photo: safeImageSource(v.photo),
  };
  if (typeof refreshAdminEntry === "function") refreshAdminEntry();
  if (window._currentAdmin?.id === "owner") {
    window._currentAdmin = { ...window._currentAdmin, ...ownerProfile };
    updateAdminIdentity();
  }
  renderForum();
});

// ---------- accounts management (owner) ----------
function renderAdminAccounts() {
  const list = document.getElementById("adminAccountsList");
  if (!list) return;
  const entries = Object.entries(adminAccounts || {});
  if (!entries.length) {
    list.innerHTML = '<p class="admin-help">لسه مفيش حسابات أدمن. أنشئ أول حساب من فوق.</p>';
    return;
  }
  list.innerHTML = entries
    .map(([id, a]) => {
      const name = esc(a.name || "أدمن");
      const photo = safeImageSource(a.photo);
      const avatar = photo
        ? `<img src="${esc(photo)}" alt="">`
        : `<span class="admin-account-placeholder">${esc((a.name || "أ").slice(0, 1))}</span>`;
      const off = a.active === false;
      return `<div class="admin-account-row">
        <div class="admin-account-info">${avatar}<span>${name}<small class="${off ? "off" : ""}">${off ? "متعطّل" : "مفعّل"}</small></span></div>
        <div class="admin-inline-actions">
          <button class="abtn bg-blue" onclick="resetAdminPassword('${esc(id)}')">🔑 كلمة السر</button>
          <button class="abtn bg-orange" onclick="toggleAdminAccount('${esc(id)}')">${off ? "تفعيل" : "تعطيل"}</button>
          <button class="abtn bg-red" onclick="deleteAdminAccount('${esc(id)}')">حذف</button>
        </div>
      </div>`;
    })
    .join("");
}

window.previewAdminPhoto = async (input, target) => {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const img = await compressImageFile(file, 120000, 480);
    if (target === "new") {
      pendingNewAdminPhoto = img;
      setImagePreview("newAdminPhotoPreview", img, "صورة الأدمن الجديد");
    } else {
      pendingAdminProfilePhoto = img;
      setImagePreview("adminProfilePreview", img, "صورتي");
    }
  } catch (e) {
    alert(e.message || "تعذر تحميل الصورة.");
    input.value = "";
  }
};

window.createAdminAccount = async () => {
  if (requireOwner()) return;
  const name = document.getElementById("newAdminName").value.trim();
  const password = document.getElementById("newAdminPassword").value;
  if (!name) return alert("اكتب اسم الأدمن.");
  if (!validPassword(password))
    return alert("كلمة السر لازم تكون 8 أحرف على الأقل.");
  try {
    if (await passwordTaken(password, null))
      return alert("كلمة السر دي مستخدمة بالفعل. اختار كلمة سر مختلفة لكل أدمن.");
    const cred = await makePasswordHash(password);
    await set(push(ref(db, "adminAccounts")), {
      name,
      photo: safeImageSource(pendingNewAdminPhoto),
      passwordSalt: cred.salt,
      passwordHash: cred.hash,
      active: true,
      createdAt: Date.now(),
    });
    document.getElementById("newAdminName").value = "";
    document.getElementById("newAdminPassword").value = "";
    document.getElementById("newAdminPhotoFile").value = "";
    document.getElementById("newAdminPhotoPreview").replaceChildren();
    pendingNewAdminPhoto = "";
    logAction(`إنشاء حساب أدمن: ${name}`);
    showToast("✅ تم إنشاء حساب الأدمن");
  } catch (e) {
    console.error(e);
    alert(e.message || "تعذر إنشاء الحساب. تحقق من الاتصال وحاول تاني.");
  }
};

window.resetAdminPassword = async (id) => {
  if (requireOwner()) return;
  const acc = adminAccounts[id];
  if (!acc) return;
  const pw = prompt(`كلمة السر الجديدة للأدمن "${acc.name}" (8 أحرف على الأقل):`);
  if (pw === null) return;
  if (!validPassword(pw)) return alert("كلمة السر لازم تكون 8 أحرف على الأقل.");
  try {
    if (await passwordTaken(pw, id))
      return alert("كلمة السر دي مستخدمة بالفعل. اختار كلمة سر مختلفة.");
    const cred = await makePasswordHash(pw);
    await update(ref(db, `adminAccounts/${id}`), {
      passwordSalt: cred.salt,
      passwordHash: cred.hash,
    });
    revokeAdminSessions(id);
    logAction(`تغيير كلمة سر الأدمن: ${acc.name}`);
    showToast("✅ تم تغيير كلمة السر");
  } catch (e) {
    console.error(e);
    alert(e.message || "تعذر تغيير كلمة السر.");
  }
};

window.toggleAdminAccount = async (id) => {
  if (requireOwner()) return;
  const acc = adminAccounts[id];
  if (!acc) return;
  try {
    await update(ref(db, `adminAccounts/${id}`), { active: acc.active === false });
    if (acc.active !== false) revokeAdminSessions(id);
    logAction(`${acc.active === false ? "تفعيل" : "تعطيل"} حساب الأدمن: ${acc.name}`);
  } catch (e) {
    console.error(e);
    alert("تعذر تحديث الحساب.");
  }
};

window.deleteAdminAccount = async (id) => {
  if (requireOwner()) return;
  const acc = adminAccounts[id];
  if (!acc || !confirm(`حذف حساب الأدمن "${acc.name}" نهائياً؟`)) return;
  try {
    await remove(ref(db, `adminAccounts/${id}`));
    revokeAdminSessions(id);
    logAction(`حذف حساب الأدمن: ${acc.name}`);
  } catch (e) {
    console.error(e);
    alert("تعذر حذف الحساب.");
  }
};

// ---------- my profile / my password (any admin) ----------
window.saveAdminProfile = async () => {
  const me = window._currentAdmin;
  if (!me) return alert("سجّل الدخول للوحة التحكم الأول.");
  const name = document.getElementById("adminProfileNameInput").value.trim();
  if (!name) return alert("اكتب اسمك.");
  const photo =
    pendingAdminProfilePhoto !== null
      ? pendingAdminProfilePhoto
      : safeImageSource(me.photo);
  const path = me.role === "owner" ? "adminProfiles/owner" : `adminAccounts/${me.id}`;
  try {
    await update(ref(db, path), { name, photo });
    window._currentAdmin = { ...me, name, photo };
    pendingAdminProfilePhoto = null;
    updateAdminIdentity(true);
    showToast("✅ تم حفظ ملفك الشخصي");
  } catch (e) {
    console.error(e);
    alert("تعذر حفظ الملف الشخصي.");
  }
};

window.removeMyPhoto = async () => {
  const me = window._currentAdmin;
  if (!me || !confirm("حذف صورتك؟")) return;
  const path = me.role === "owner" ? "adminProfiles/owner" : `adminAccounts/${me.id}`;
  try {
    await update(ref(db, path), { photo: "" });
    window._currentAdmin = { ...me, photo: "" };
    pendingAdminProfilePhoto = null;
    updateAdminIdentity(true);
  } catch (e) {
    console.error(e);
    alert("تعذر حذف الصورة.");
  }
};

window.changeMyPassword = async () => {
  const me = window._currentAdmin;
  if (!me) return;
  const oldPw = document.getElementById("myOldPass").value;
  const newPw = document.getElementById("myNewPass").value;
  const newPw2 = document.getElementById("myNewPass2").value;
  if (!oldPw) return alert("اكتب كلمة السر الحالية.");
  if (!validPassword(newPw)) return alert("كلمة السر الجديدة لازم تكون 8 أحرف على الأقل.");
  if (newPw !== newPw2) return alert("تأكيد كلمة السر مش مطابق.");
  try {
    let cred, path;
    if (me.role === "owner") {
      cred = (await getOwnerRecord()).cred;
      path = "adminProfiles/owner";
    } else {
      cred = acctCred((await get(ref(db, `adminAccounts/${me.id}`))).val());
      path = `adminAccounts/${me.id}`;
    }
    if (!(await verifyPassword(oldPw, cred)))
      return alert("❌ كلمة السر الحالية غلط.");
    if (await passwordTaken(newPw, me.id))
      return alert("كلمة السر دي مستخدمة بالفعل. اختار كلمة سر مختلفة.");
    const n = await makePasswordHash(newPw);
    await update(ref(db, path), { passwordSalt: n.salt, passwordHash: n.hash });
    revokeAdminSessions(me.id, readSavedSession()?.sid); // سجّل خروج باقي الأجهزة
    ["myOldPass", "myNewPass", "myNewPass2"].forEach(
      (id) => (document.getElementById(id).value = ""),
    );
    logAction("تغيير كلمة السر الشخصية");
    showToast("✅ تم تغيير كلمة السر");
  } catch (e) {
    console.error(e);
    alert(e.message || "تعذر تغيير كلمة السر.");
  }
};

// ---------- site background (owner only) ----------
const BG_PRESETS = ["ocean", "sand", "night", "olive"];

function applySiteBackground() {
  const b = window._branding || {};
  const image = safeImageSource(b.backgroundImage);
  const root = document.documentElement;
  if (image && b.backgroundPreset === "custom") {
    root.style.setProperty("--site-bg", `url("${image}")`);
    document.body.dataset.bg = "custom";
  } else {
    root.style.removeProperty("--site-bg");
    document.body.dataset.bg = BG_PRESETS.includes(b.backgroundPreset)
      ? b.backgroundPreset
      : "default";
  }
  if (!pendingSiteBackground) {
    setImagePreview(
      "siteBackgroundPreview",
      b.backgroundPreset === "custom" ? image : "",
      "خلفية الموقع الحالية",
    );
  }
  updateWelcomeBg();
}

window.previewSiteBackground = async (input) => {
  if (requireOwner()) {
    input.value = "";
    return;
  }
  const file = input.files?.[0];
  if (!file) return;
  try {
    pendingSiteBackground = await compressImageFile(file, 500000, 1600);
    setImagePreview("siteBackgroundPreview", pendingSiteBackground, "معاينة الخلفية");
  } catch (e) {
    alert(e.message || "تعذر تحميل صورة الخلفية.");
    input.value = "";
  }
};

window.selectSiteBackground = async (preset) => {
  if (requireOwner()) return;
  if (preset !== "default" && !BG_PRESETS.includes(preset)) return;
  try {
    await update(ref(db, "branding"), {
      backgroundPreset: preset,
      backgroundImage: null,
    });
    pendingSiteBackground = "";
    const f = document.getElementById("siteBackgroundFile");
    if (f) f.value = "";
    logAction(`تغيير خلفية الموقع: ${preset}`);
    showToast("✅ تم تغيير الخلفية");
  } catch (e) {
    console.error(e);
    alert("تعذر تغيير الخلفية. حاول تاني.");
  }
};

window.saveSiteBackground = async () => {
  if (requireOwner()) return;
  if (!pendingSiteBackground)
    return alert("اختار صورة واستنى المعاينة تظهر قبل الحفظ.");
  try {
    await update(ref(db, "branding"), {
      backgroundPreset: "custom",
      backgroundImage: pendingSiteBackground,
    });
    pendingSiteBackground = "";
    const f = document.getElementById("siteBackgroundFile");
    if (f) f.value = "";
    logAction("رفع خلفية مخصصة للموقع");
    showToast("✅ تم حفظ خلفية الموقع");
  } catch (e) {
    console.error(e);
    alert("تعذر حفظ الصورة. تحقق من اتصال قاعدة البيانات.");
  }
};

// ---------- admin forum (group chat) ----------
const FORUM_PATH = "adminForum/messages";
let forumMsgs = [];
let lastForumSend = 0;
let _forumRenderedCount = -1;
const _forumPendingReceipts = new Set();
const _forumSeenIds = new Set();
let _forumFirstSnapshot = true;
const _forumReceiptOpen = new Set();

const TICK_ONE =
  '<svg viewBox="0 0 16 11" width="16" height="11" aria-hidden="true"><path d="M1.5 5.8l3.6 3.6L12.5 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TICK_TWO =
  '<svg viewBox="0 0 21 11" width="21" height="11" aria-hidden="true"><path d="M1.5 5.8l3.6 3.6L12 2M8 8.6l.8.8L19 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function forumIdentity(m) {
  let name = m.name || "أدمن";
  let photo = "";
  let role = m.role === "owner" ? "owner" : "admin";
  if (m.uid === "owner") {
    name = ownerProfile.name || name;
    photo = ownerProfile.photo;
    role = "owner";
  } else if (adminAccounts[m.uid]) {
    name = adminAccounts[m.uid].name || name;
    photo = adminAccounts[m.uid].photo;
    role = "admin";
  }
  return { name, photo: safeImageSource(photo), role };
}

const adminNameById = (id) =>
  id === "owner"
    ? ownerProfile.name || "مالك الموقع"
    : adminAccounts[id]?.name || "أدمن";

// المستلمون = كل الأدمنز الفعّالين ما عدا صاحب الرسالة
function forumRecipients(m) {
  const ids = [
    "owner",
    ...Object.keys(adminAccounts || {}).filter((id) => adminAccounts[id]?.active !== false),
  ];
  return ids.filter((id) => id !== m.uid);
}

// حالة الرسالة من الـ database: sent ✓ | delivered ✓✓ | read ✓✓ (أزرق)
function forumReceipt(m) {
  const rcp = forumRecipients(m);
  const dl = m.deliveredTo || {};
  const rd = m.readBy || {};
  const readers = rcp.filter((id) => rd[id]);
  const got = rcp.filter((id) => dl[id] || rd[id]);
  // ✓ أُرسلت | ✓✓ رمادي: وصلت لأدمن واحد على الأقل | ✓✓ أزرق: قرأها أدمن واحد على الأقل
  // (التفاصيل بتوضح مين قرأ ومين لسه — عشان أدمن غير نشط ما يعطّلش العلامة)
  let state = "sent";
  if (readers.length > 0) state = "read";
  else if (got.length > 0) state = "delivered";
  return {
    state,
    total: rcp.length,
    readCount: readers.length,
    readers: readers.map(adminNameById),
    waiting: rcp.filter((id) => !rd[id]).map(adminNameById),
  };
}

function forumReceiptLabel(r) {
  if (r.state === "read") return "تمت القراءة";
  if (r.state === "delivered") return "تم التسليم";
  return "تم الإرسال";
}

function forumTabVisible() {
  const t = document.getElementById("tab-forum");
  const panel = document.getElementById("adminPanel");
  const main = document.getElementById("adminMainView");
  return !!(
    t &&
    t.classList.contains("on") &&
    panel?.style.display === "block" &&
    main?.style.display !== "none"
  );
}

function forumUnreadFor(me) {
  const since = effectiveSince();
  return forumMsgs.filter(
    (m) => m.uid !== me.id && !(m.readBy && m.readBy[me.id]) && (m.ts || Date.now()) >= since,
  );
}

function updateForumBadge() {
  const badge = document.getElementById("forumBadge");
  const me = window._currentAdmin;
  if (!badge || !me) return;
  const unread =
    forumTabVisible() && document.visibilityState !== "hidden" ? 0 : forumUnreadFor(me).length;
  badge.hidden = unread === 0;
  badge.innerText = unread > 99 ? "99+" : String(unread);
}

// كتابة إيصالات الاستلام/القراءة الخاصة بهذا الأدمن فقط داخل كل رسالة
function pushForumReceipts(kind, msgs) {
  const me = window._currentAdmin;
  if (!me || !msgs.length) return;
  const upd = {};
  msgs.forEach((m) => {
    const k = `${m.id}:${kind}:${me.id}`;
    if (_forumPendingReceipts.has(k)) return;
    _forumPendingReceipts.add(k);
    upd[`${FORUM_PATH}/${m.id}/${kind}/${me.id}`] = serverTimestamp();
  });
  if (!Object.keys(upd).length) return;
  update(ref(db), upd).catch((e) => {
    console.warn("forum receipt failed", e);
    msgs.forEach((m) => _forumPendingReceipts.delete(`${m.id}:${kind}:${me.id}`));
  });
}

function markForumDelivered() {
  const me = window._currentAdmin;
  if (!me) return;
  pushForumReceipts(
    "deliveredTo",
    forumMsgs.filter(
      (m) => m.uid !== me.id && !(m.deliveredTo && m.deliveredTo[me.id]) && !(m.readBy && m.readBy[me.id]),
    ),
  );
}

function markForumRead() {
  const me = window._currentAdmin;
  if (!me || !forumTabVisible() || document.visibilityState === "hidden") return;
  pushForumReceipts(
    "readBy",
    forumMsgs.filter((m) => m.uid !== me.id && !(m.readBy && m.readBy[me.id])),
  );
}

window.toggleForumReceipt = (id) => {
  if (_forumReceiptOpen.has(id)) _forumReceiptOpen.delete(id);
  else _forumReceiptOpen.add(id);
  renderForum();
};

function renderForum(forceScroll = false) {
  const me = window._currentAdmin;
  const box = document.getElementById("forumMessages");
  if (!me || !box) return;
  if (!forumTabVisible()) {
    updateForumBadge();
    return;
  }
  if (!forumMsgs.length) {
    box.innerHTML =
      '<p class="admin-help" style="text-align:center;margin:auto">لسه مفيش رسائل. ابدأ أنت المحادثة 👋</p>';
    _forumRenderedCount = 0;
    markForumRead();
    updateForumBadge();
    return;
  }
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
  const lastIsMine = forumMsgs[forumMsgs.length - 1].uid === me.id;
  const since = effectiveSince();
  let html = "";
  let lastDay = "";
  let dividerShown = false;
  forumMsgs.forEach((m) => {
    const d = new Date(m.ts || Date.now());
    const day = d.toDateString();
    if (day !== lastDay) {
      lastDay = day;
      html += `<div class="forum-day">${esc(d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" }))}</div>`;
    }
    const idn = forumIdentity(m);
    const mine = m.uid === me.id;
    if (!mine && !dividerShown && !(m.readBy && m.readBy[me.id]) && (m.ts || Date.now()) >= since) {
      dividerShown = true;
      html += '<div class="forum-unread-divider"><span>رسائل جديدة</span></div>';
    }
    const av = idn.photo
      ? `<img class="forum-av" src="${esc(idn.photo)}" alt="">`
      : `<span class="forum-av">${esc((idn.name || "؟").slice(0, 1))}</span>`;
    const canDel = mine || me.role === "owner";
    const time = d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
    let ticks = "";
    let detail = "";
    if (mine) {
      const r = forumReceipt(m);
      const tip = `${forumReceiptLabel(r)}${r.total ? ` (${r.readCount}/${r.total} قرأوها)` : ""}`;
      ticks = `<button type="button" class="forum-ticks ${r.state}" title="${esc(tip)}" aria-label="${esc(tip)}" onclick="toggleForumReceipt('${esc(m.id)}')">${r.state === "sent" ? TICK_ONE : TICK_TWO}</button>`;
      if (_forumReceiptOpen.has(m.id)) {
        detail = `<div class="forum-receipt-detail">
          <div><b>${forumReceiptLabel(r)}</b>${r.total ? ` · ${r.readCount}/${r.total}` : ""}</div>
          ${r.readers.length ? `<div class="ok">قرأها: ${r.readers.map(esc).join("، ")}</div>` : ""}
          ${r.waiting.length ? `<div class="wait">لم يقرأها بعد: ${r.waiting.map(esc).join("، ")}</div>` : ""}
          ${!r.total ? "<div>لا يوجد أدمن آخر حالياً.</div>" : ""}
        </div>`;
      }
    }
    html += `<div class="forum-msg ${mine ? "me" : "other"}">
      ${av}
      <div class="forum-bubble">
        <div class="forum-name">${idn.role === "owner" ? '<span class="crown">👑</span>' : ""}${esc(idn.name)}</div>
        <div class="forum-text">${esc(m.text)}</div>
        <div class="forum-meta"><span>${esc(time)}</span>${ticks}${canDel ? `<button class="forum-del" title="حذف" onclick="deleteForumMessage('${esc(m.id)}')">🗑️</button>` : ""}</div>
        ${detail}
      </div>
    </div>`;
  });
  box.innerHTML = html;
  if (forceScroll || nearBottom || lastIsMine || _forumRenderedCount < 0) {
    box.scrollTop = box.scrollHeight;
  }
  _forumRenderedCount = forumMsgs.length;
  markForumRead();
  updateForumBadge();
}

window.onForumTabOpened = () => {
  renderForum(true);
  setTimeout(() => document.getElementById("forumInput")?.focus(), 60);
};

onValue(query(ref(db, FORUM_PATH), limitToLast(200)), (snap) => {
  const v = snap.val() || {};
  forumMsgs = Object.entries(v)
    .map(([id, m]) => ({ id, ...m }))
    .filter((m) => m && typeof m.text === "string")
    .sort((a, b) => (a.ts || 0) - (b.ts || 0) || (a.id < b.id ? -1 : 1));
  const me = window._currentAdmin;
  if (me) {
    // رسالة جديدة من أدمن آخر وأنا مش فاتح المنتدى → تنبيه فوري
    forumMsgs.forEach((m) => {
      if (_forumSeenIds.has(m.id)) return;
      _forumSeenIds.add(m.id);
      if (_forumFirstSnapshot || m.uid === me.id) return;
      if (forumTabVisible() && document.visibilityState !== "hidden") return;
      showToast(`💬 ${forumIdentity(m).name}: ${m.text.slice(0, 40)}`);
      playSound("ans");
    });
    markForumDelivered();
  } else {
    forumMsgs.forEach((m) => _forumSeenIds.add(m.id));
  }
  _forumFirstSnapshot = false;
  renderForum();
  refreshAdminBadges();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    markForumRead();
    updateForumBadge();
  }
});

window.sendForumMessage = async () => {
  const me = window._currentAdmin;
  if (!me) return;
  const input = document.getElementById("forumInput");
  const text = input.value.trim();
  if (!text) return;
  if (Date.now() - lastForumSend < 600) return;
  lastForumSend = Date.now();
  input.value = "";
  input.style.height = "auto";
  try {
    await set(push(ref(db, FORUM_PATH)), {
      uid: me.id,
      name: me.name,
      role: me.role,
      text: text.slice(0, 1000),
      ts: serverTimestamp(),
    });
  } catch (e) {
    console.error(e);
    input.value = text;
    alert("تعذر إرسال الرسالة. تحقق من الاتصال.");
  }
};

window.deleteForumMessage = async (id) => {
  const me = window._currentAdmin;
  const m = forumMsgs.find((x) => x.id === id);
  if (!me || !m) return;
  if (m.uid !== me.id && me.role !== "owner") return;
  if (!confirm("حذف الرسالة دي؟")) return;
  try {
    await remove(ref(db, `${FORUM_PATH}/${id}`));
  } catch (e) {
    console.error(e);
    alert("تعذر حذف الرسالة.");
  }
};

window.clearForum = async () => {
  if (requireOwner()) return;
  if (!confirm("مسح كل رسائل المنتدى نهائياً؟")) return;
  try {
    await remove(ref(db, FORUM_PATH));
    logAction("مسح رسائل منتدى الأدمن");
  } catch (e) {
    console.error(e);
    alert("تعذر مسح الرسائل.");
  }
};

(() => {
  const input = document.getElementById("forumInput");
  if (!input) return;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      window.sendForumMessage();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });
})();

// ======================================================================
//  Persistent admin session (token آمن — لا يتم حفظ كلمة السر أبداً)
// ======================================================================
const SESSION_KEY = "examAdminSession.v1";
const SESSION_TTL = 30 * 24 * 3600 * 1000; // 30 يوم (تتجدد تلقائياً)

async function sha256B64(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return base64FromBytes(new Uint8Array(buf));
}
function newSessionToken() {
  return base64FromBytes(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function readSavedSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    return s && s.id && s.sid && s.token ? s : null;
  } catch {
    return null;
  }
}
function clearSavedSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

let _sessionUnsub = null;
function watchOwnSession() {
  if (_sessionUnsub) _sessionUnsub();
  const s = readSavedSession();
  if (!s) return;
  let seen = false;
  _sessionUnsub = onValue(ref(db, `adminSessions/${s.id}/${s.sid}`), (snap) => {
    if (snap.exists()) {
      seen = true;
      return;
    }
    // الجلسة اتلغت من جهاز تاني أو من المالك → اخرج فوراً
    if (seen && window._currentAdmin) {
      clearSavedSession();
      window.closeAdminPanel();
      alert("تم إنهاء جلسة الدخول بتاعتك. سجّل الدخول من جديد.");
      document.getElementById("adminAuthModal").style.display = "flex";
    }
  });
}

async function createPersistentSession(admin) {
  if (!window.crypto || !crypto.subtle) return;
  const token = newSessionToken();
  const sref = push(ref(db, `adminSessions/${admin.id}`));
  const now = Date.now();
  await set(sref, {
    h: await sha256B64(token),
    created: now,
    expires: now + SESSION_TTL,
    ua: String(navigator.userAgent || "").slice(0, 120),
  });
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: admin.id, sid: sref.key, token }));
  } catch (e) {
    console.warn("تعذر حفظ الجلسة على الجهاز", e);
    return;
  }
  watchOwnSession();
  // تنظيف الجلسات المنتهية الخاصة بنفس الحساب
  try {
    const all = (await get(ref(db, `adminSessions/${admin.id}`))).val() || {};
    const upd = {};
    Object.entries(all).forEach(([sid, v]) => {
      if (!v || (v.expires || 0) < now) upd[`adminSessions/${admin.id}/${sid}`] = null;
    });
    if (Object.keys(upd).length) await update(ref(db), upd);
  } catch {}
}

async function restorePersistentSession() {
  const s = readSavedSession();
  if (!s || !window.crypto || !crypto.subtle) return null;
  try {
    const rec = (await get(ref(db, `adminSessions/${s.id}/${s.sid}`))).val();
    if (!rec || (rec.expires || 0) < Date.now() || rec.h !== (await sha256B64(s.token))) {
      clearSavedSession();
      return null;
    }
    let admin;
    if (s.id === "owner") {
      const { rec: o } = await getOwnerRecord();
      admin = { id: "owner", role: "owner", name: o.name || ownerProfile.name, photo: o.photo || "" };
    } else {
      const a = (await get(ref(db, `adminAccounts/${s.id}`))).val();
      if (!a || a.active === false) {
        clearSavedSession();
        return null;
      }
      admin = { id: s.id, role: "admin", name: a.name, photo: a.photo };
    }
    if ((rec.expires || 0) - Date.now() < SESSION_TTL / 2) {
      update(ref(db, `adminSessions/${s.id}/${s.sid}`), { expires: Date.now() + SESSION_TTL }).catch(() => {});
    }
    return admin;
  } catch (e) {
    // مشكلة اتصال: نسيب الجلسة المحفوظة ونطلب تسجيل الدخول العادي
    console.warn("session restore failed", e);
    return null;
  }
}

async function destroyPersistentSession() {
  const s = readSavedSession();
  clearSavedSession();
  if (_sessionUnsub) {
    _sessionUnsub();
    _sessionUnsub = null;
  }
  if (s) {
    try {
      await remove(ref(db, `adminSessions/${s.id}/${s.sid}`));
    } catch (e) {
      console.warn("remove session failed", e);
    }
  }
}

// إبطال كل جلسات حساب معيّن (عند تغيير كلمة السر/التعطيل/الحذف)
function revokeAdminSessions(id, exceptSid) {
  return get(ref(db, `adminSessions/${id}`))
    .then((snap) => {
      const upd = {};
      Object.keys(snap.val() || {}).forEach((sid) => {
        if (sid !== exceptSid) upd[`adminSessions/${id}/${sid}`] = null;
      });
      return Object.keys(upd).length ? update(ref(db), upd) : null;
    })
    .catch((e) => console.warn("revoke sessions failed", e));
}

window.adminLogout = async () => {
  if (!window._currentAdmin) return;
  if (!confirm("تسجيل الخروج من لوحة التحكم؟\nهتحتاج كلمة السر عشان تدخل تاني.")) return;
  logAction("تسجيل خروج");
  await destroyPersistentSession();
  window.closeAdminPanel();
  const inp = document.getElementById("adminPassInput");
  if (inp) inp.value = "";
  document.getElementById("adminAuthModal").style.display = "flex";
};

// ======================================================================
//  Admin real-time core: per-admin read state + notifications + badges
// ======================================================================
let adminReads = {};
let complaintsData = {};
let adminNotifs = [];
let essayQueue = {};
let _rtUnsubs = [];
let _rtSinceFallback = 0;
let _sinceWriting = false;
const _notifSeen = new Set();
let _notifFirst = true;
const effectiveSince = () => Number(adminReads.since) || _rtSinceFallback || 0;

function setBadge(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = !(n > 0);
  el.textContent = n > 99 ? "99+" : String(n);
}

const complaintIsRead = (key, c) => c.read === true || !!(adminReads.complaints && adminReads.complaints[key]);
const unreadComplaintKeys = () =>
  Object.entries(complaintsData)
    .filter(([k, c]) => c && !complaintIsRead(k, c))
    .map(([k]) => k);

const notifAlive = (n) => n.type !== "complaint" || !!complaintsData[n.refId];
const unreadNotifs = () => {
  const since = effectiveSince();
  return adminNotifs.filter(
    (n) => notifAlive(n) && (n.ts || Date.now()) >= since && !(adminReads.notifications && adminReads.notifications[n.id]),
  );
};

function refreshAdminBadges() {
  const me = window._currentAdmin;
  if (!me) return;
  const nNotif = unreadNotifs().length;
  setBadge("complaintsBadge", unreadComplaintKeys().length);
  setBadge("notifBellCount", nNotif);
  document.getElementById("notifBell")?.classList.toggle("has-unread", nNotif > 0);
  setBadge("essayQueueBadge", essayAttentionCount());
  updateForumBadge();
  document.title = (nNotif > 0 ? `(${nNotif}) ` : "") + document.title.replace(/^\(\d+\)\s/, "");
}

function clearAdminBadges() {
  ["complaintsBadge", "notifBellCount", "essayQueueBadge", "forumBadge"].forEach((id) => setBadge(id, 0));
  document.getElementById("notifBell")?.classList.remove("has-unread");
  document.title = document.title.replace(/^\(\d+\)\s/, "");
}

const NOTIF_ICONS = { complaint: "📢", essay: "✍️" };
const notifIcon = (t) => NOTIF_ICONS[t] || "🔔";

function timeAgo(ts) {
  const s = Math.max(0, Math.round((Date.now() - (Number(ts) || Date.now())) / 1000));
  if (s < 45) return "الآن";
  if (s < 3600) return `منذ ${Math.max(1, Math.round(s / 60))} د`;
  if (s < 86400) return `منذ ${Math.round(s / 3600)} س`;
  return new Date(ts).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
}

function renderNotifPanel() {
  const list = document.getElementById("notifList");
  if (!list) return;
  const me = window._currentAdmin;
  if (!me) return;
  const since = effectiveSince();
  const items = adminNotifs.filter(notifAlive).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 50);
  if (!items.length) {
    list.innerHTML = '<div class="notif-empty">لا توجد إشعارات حتى الآن 🎉</div>';
    return;
  }
  list.innerHTML = items
    .map((n) => {
      const unread = (n.ts || Date.now()) >= since && !(adminReads.notifications && adminReads.notifications[n.id]);
      return `<button type="button" class="notif-item ${unread ? "unread" : ""}" onclick="openNotification('${esc(n.id)}')">
        <span class="notif-ic">${notifIcon(n.type)}</span>
        <span class="notif-txt"><b>${esc(n.title || "إشعار")}</b><small>${esc(n.body || "")}</small></span>
        <span class="notif-time">${esc(timeAgo(n.ts))}${unread ? '<i class="notif-dot-s"></i>' : ""}</span>
      </button>`;
    })
    .join("");
}

window.toggleNotifPanel = (force) => {
  const p = document.getElementById("notifPanel");
  if (!p) return;
  const open = typeof force === "boolean" ? force : p.hidden;
  p.hidden = !open;
  if (open) renderNotifPanel();
};
document.addEventListener("click", (e) => {
  const p = document.getElementById("notifPanel");
  if (p && !p.hidden && !e.target.closest(".notif-wrap")) p.hidden = true;
});

function markNotifsRead(ids) {
  const me = window._currentAdmin;
  if (!me || !ids.length) return Promise.resolve();
  const upd = {};
  ids.forEach((id) => (upd[`adminReads/${me.id}/notifications/${id}`] = serverTimestamp()));
  return update(ref(db), upd).catch((e) => console.warn("mark notif read failed", e));
}

window.markAllNotificationsRead = () => {
  const ids = unreadNotifs().map((n) => n.id);
  // الشكاوى المرتبطة تتعلّم كمقروءة لهذا الأدمن أيضاً؟ لا — الشكوى تُقرأ بفتحها فقط
  const me = window._currentAdmin;
  if (!me || !ids.length) return;
  markNotifsRead(ids);
};

function goToAdminTab(id) {
  if (currentExamId) window.backToExamsList();
  const btn = document.getElementById(id + "TabBtn");
  if (btn) window.switchTab(id, btn);
}

window.openNotification = async (id) => {
  const n = adminNotifs.find((x) => x.id === id);
  window.toggleNotifPanel(false);
  if (!n) return;
  if (n.type === "complaint") {
    if (!complaintsData[n.refId]) {
      showToast("الشكوى دي اتحذفت");
      return markNotifsRead([id]);
    }
    goToAdminTab("complaints");
    _openComplaints.add(n.refId);
    renderComplaints();
    markComplaintReadForMe(n.refId);
    setTimeout(() => document.getElementById("cmp_" + n.refId)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    return;
  }
  await markNotifsRead([id]);
  if (n.type === "essay") {
    goToAdminTab("essays");
    const [examId, code] = String(n.refId || "").split("__");
    if (examId && code) window.gradeEssays(examId, code);
  }
};

function handleNewNotifs() {
  const me = window._currentAdmin;
  if (!me) return;
  if (_notifFirst) {
    adminNotifs.forEach((n) => _notifSeen.add(n.id));
    _notifFirst = false;
    return;
  }
  adminNotifs.forEach((n) => {
    if (_notifSeen.has(n.id)) return;
    _notifSeen.add(n.id);
    if (!notifAlive(n)) return;
    showToast(`${notifIcon(n.type)} ${n.title || "إشعار جديد"}${n.body ? " — " + String(n.body).slice(0, 50) : ""}`);
    playSound("ans");
  });
}

function stopAdminRealtime() {
  _rtUnsubs.forEach((u) => {
    try {
      u();
    } catch {}
  });
  _rtUnsubs = [];
  adminReads = {};
  complaintsData = {};
  adminNotifs = [];
  essayQueue = {};
  _sinceWriting = false;
  _notifSeen.clear();
  _notifFirst = true;
  _forumFirstSnapshot = true;
  clearAdminBadges();
}

function startAdminRealtime() {
  stopAdminRealtime();
  const me = window._currentAdmin;
  if (!me) return;
  const uid = me.id;
  _rtSinceFallback = Date.now();
  // 1) حالة القراءة الخاصة بهذا الأدمن فقط
  _rtUnsubs.push(
    onValue(ref(db, `adminReads/${uid}`), (snap) => {
      adminReads = snap.val() || {};
      if (!adminReads.since && !_sinceWriting) {
        _sinceWriting = true;
        set(ref(db, `adminReads/${uid}/since`), serverTimestamp()).catch(() => (_sinceWriting = false));
      }
      refreshAdminBadges();
      renderNotifPanel();
      renderComplaintsIfVisible();
      renderForum();
    }),
  );
  // 2) الإشعارات (مشتركة) — الحالة مقروء/غير مقروء بتتحسب من adminReads
  _rtUnsubs.push(
    onValue(query(ref(db, "adminNotifications"), limitToLast(100)), (snap) => {
      adminNotifs = Object.entries(snap.val() || {})
        .map(([id, n]) => ({ id, ...n }))
        .filter((n) => n && n.type)
        .sort((a, b) => (a.ts || 0) - (b.ts || 0));
      handleNewNotifs();
      refreshAdminBadges();
      renderNotifPanel();
    }),
  );
  // 3) الشكاوى
  _rtUnsubs.push(
    onValue(ref(db, "complaints"), (snap) => {
      complaintsData = snap.val() || {};
      refreshAdminBadges();
      renderNotifPanel();
      renderComplaintsIfVisible();
    }),
  );
  // 4) طابور التصحيح المقالي (خفيف)
  _rtUnsubs.push(
    onValue(ref(db, "essayQueue"), (snap) => {
      essayQueue = snap.val() || {};
      refreshAdminBadges();
      renderEssayQueueIfVisible();
    }),
  );
  markForumDelivered();
  ensureEssayQueueBackfill();
}

// ======================================================================
//  Complaints (per-admin read state)
// ======================================================================
let _openComplaints = new Set();
let _complaintFilter = "all";

async function markComplaintReadForMe(key) {
  const me = window._currentAdmin;
  if (!me || !complaintsData[key]) return;
  if (complaintIsRead(key, complaintsData[key])) return;
  const upd = { [`adminReads/${me.id}/complaints/${key}`]: serverTimestamp() };
  adminNotifs
    .filter((n) => n.type === "complaint" && n.refId === key)
    .forEach((n) => (upd[`adminReads/${me.id}/notifications/${n.id}`] = serverTimestamp()));
  try {
    await update(ref(db), upd);
  } catch (e) {
    console.warn("mark complaint read failed", e);
  }
}

window.toggleComplaint = (key) => {
  if (_openComplaints.has(key)) _openComplaints.delete(key);
  else {
    _openComplaints.add(key);
    markComplaintReadForMe(key); // الفتح = قراءة (لهذا الأدمن فقط)
  }
  renderComplaints();
};

window.markComplaintRead = async (key) => {
  await markComplaintReadForMe(key);
};

window.markAllComplaintsRead = async () => {
  const me = window._currentAdmin;
  if (!me) return;
  const keys = unreadComplaintKeys();
  if (!keys.length) return;
  const upd = {};
  keys.forEach((k) => (upd[`adminReads/${me.id}/complaints/${k}`] = serverTimestamp()));
  adminNotifs
    .filter((n) => n.type === "complaint" && keys.includes(n.refId))
    .forEach((n) => (upd[`adminReads/${me.id}/notifications/${n.id}`] = serverTimestamp()));
  await update(ref(db), upd).catch((e) => console.warn(e));
};

window.setComplaintFilter = (f) => {
  _complaintFilter = f;
  renderComplaints();
};

function renderComplaintsIfVisible() {
  const t = document.getElementById("tab-complaints");
  if (t && t.classList.contains("on") && window._currentAdmin) renderComplaints();
}

function renderComplaints() {
  const c = document.getElementById("complaintsContainer");
  if (!c || !window._currentAdmin) return;
  const all = Object.entries(complaintsData || {})
    .filter(([, r]) => r && typeof r === "object")
    .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
  if (!all.length) {
    c.innerHTML = '<p class="cmp-empty">لا توجد شكاوى حتى الآن</p>';
    return;
  }
  const unreadN = all.filter(([k, r]) => !complaintIsRead(k, r)).length;
  const list = _complaintFilter === "unread" ? all.filter(([k, r]) => !complaintIsRead(k, r)) : all;
  const bar = `<div class="cmp-filter" role="tablist">
      <button type="button" class="${_complaintFilter === "all" ? "on" : ""}" onclick="setComplaintFilter('all')">الكل (${all.length})</button>
      <button type="button" class="${_complaintFilter === "unread" ? "on" : ""}" onclick="setComplaintFilter('unread')">غير المقروءة <span class="cmp-count">${unreadN}</span></button>
    </div>`;
  if (!list.length) {
    c.innerHTML = bar + '<p class="cmp-empty">كل الشكاوى مقروءة عندك ✅</p>';
    return;
  }
  c.innerHTML =
    bar +
    list
      .map(([key, r]) => {
        const unread = !complaintIsRead(key, r);
        const open = _openComplaints.has(key);
        const text = String(r.text || "");
        const prev = text.length > 90 ? text.slice(0, 90) + "…" : text;
        return `<article class="cmp-card ${unread ? "unread" : ""} ${open ? "open" : ""}" id="cmp_${esc(key)}">
          <header class="cmp-head" onclick="toggleComplaint('${esc(key)}')" role="button" tabindex="0">
            <span class="cmp-dot" ${unread ? "" : "hidden"} title="غير مقروءة"></span>
            <div class="cmp-main">
              <div class="cmp-name">👤 ${esc(r.name || "زائر")}</div>
              <div class="cmp-preview">${open ? "" : esc(prev)}</div>
            </div>
            <div class="cmp-side"><span class="cmp-time">${esc(r.time || "")}</span><span class="cmp-chev">${open ? "▲" : "▼"}</span></div>
          </header>
          ${
            open
              ? `<div class="cmp-body">
            <div class="cmp-text">${esc(text)}</div>
            <div class="cmp-phone">📱 <span id="phone_${esc(key)}" class="mono">••••••</span>
              <button type="button" class="cmp-mini" data-phone="${esc(r.phone || "")}" onclick="toggleAdminPhone('${esc(key)}', this.dataset.phone, this)">إظهار</button>
            </div>
            <div class="cmp-actions">
              <button class="abtn bg-red" onclick="deleteComplaint('${esc(key)}')" style="padding:6px 12px;font-size:12px">🗑️ حذف</button>
            </div>
          </div>`
              : ""
          }
        </article>`;
      })
      .join("");
}

window.loadAdminComplaints = async () => {
  renderComplaints();
};

window.toggleAdminPhone = (key, phone, btn) => {
  const el = document.getElementById("phone_" + key);
  if (!el) return;
  if (el.innerText.includes("•")) {
    el.innerText = phone || "غير متاح";
    btn.innerText = "إخفاء";
  } else {
    el.innerText = "••••••";
    btn.innerText = "إظهار";
  }
};

window.deleteComplaint = async (key) => {
  if (!confirm("حذف الشكوى؟")) return;
  const upd = { [`complaints/${key}`]: null };
  adminNotifs
    .filter((n) => n.type === "complaint" && n.refId === key)
    .forEach((n) => (upd[`adminNotifications/${n.id}`] = null));
  try {
    await update(ref(db), upd);
    _openComplaints.delete(key);
  } catch (e) {
    console.error(e);
    alert("تعذر حذف الشكوى.");
  }
};

window.clearAllComplaints = async () => {
  if (!confirm("⚠️ حذف كل الشكاوى نهائياً؟")) return;
  const upd = { complaints: null };
  adminNotifs.filter((n) => n.type === "complaint").forEach((n) => (upd[`adminNotifications/${n.id}`] = null));
  try {
    await update(ref(db), upd);
    _openComplaints.clear();
  } catch (e) {
    console.error(e);
    alert("تعذر حذف الشكاوى.");
  }
};

// ======================================================================
//  Essay grading workflow: Pending → Under Review → Corrected → Reviewed
// ======================================================================
const ESSAY_LOCK_MS = 30 * 60 * 1000; // القفل المؤقت بيفك لوحده بعد 30 دقيقة
const ESSAY_STATUS = {
  pending: { ar: "بانتظار التصحيح", en: "Pending", cls: "pending", icon: "⏳" },
  under_review: { ar: "قيد المراجعة", en: "Under Review", cls: "review", icon: "🔍" },
  corrected: { ar: "تم التصحيح", en: "Corrected", cls: "corrected", icon: "✅" },
  reviewed: { ar: "تمت المراجعة", en: "Reviewed", cls: "reviewed", icon: "🛡️" },
};
const Q_MAP = {
  essayStatus: "status",
  essayLockedBy: "lockedBy",
  essayLockedById: "lockedById",
  essayLockedAt: "lockedAt",
  essayGradedBy: "gradedBy",
  essayGradedById: "gradedById",
  essayGradedAtTs: "gradedAtTs",
  essayReviewedBy: "reviewedBy",
  essayReviewedById: "reviewedById",
  essayReviewedAtTs: "reviewedAtTs",
  pendingEssayCount: "pending",
};

const essayIndexes = (r) =>
  (r?.questionsSnapshot || []).map((q, i) => (q.type === "essay" ? i : -1)).filter((i) => i >= 0);
const essayGradedCount = (r) =>
  essayIndexes(r).filter((i) => r.essayScores && r.essayScores[i] !== undefined && r.essayScores[i] !== null).length;

function essayStatusOf(r) {
  if (!hasEssayQuestions(r)) return null;
  if (r.essayGraded === true) return r.essayStatus === "reviewed" ? "reviewed" : "corrected";
  if (r.essayStatus === "under_review" && Date.now() - (Number(r.essayLockedAt) || 0) < ESSAY_LOCK_MS)
    return "under_review";
  return "pending";
}

function fmtTs(ts, fallback = "") {
  const n = Number(ts);
  return n ? new Date(n).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : fallback;
}

function essayBadgeHtml(status) {
  const s = ESSAY_STATUS[status];
  if (!s) return "—";
  return `<span class="es-badge ${s.cls}" title="${s.en}">${s.icon} ${s.ar}<small>${s.en}</small></span>`;
}

// سطر "مين/إمتى" حسب الحالة
function essayMetaHtml(r) {
  const st = essayStatusOf(r);
  const parts = [];
  if (st === "under_review") parts.push(`🔍 بواسطة ${esc(r.essayLockedBy || "أدمن")} · ${esc(timeAgo(r.essayLockedAt))}`);
  if (st === "pending") {
    const total = essayIndexes(r).length;
    const done = essayGradedCount(r);
    if (done) parts.push(`✏️ مسودة ${done}/${total}`);
  }
  if (st === "corrected" || st === "reviewed") {
    parts.push(
      r.essayGradedBy
        ? `✅ صحّحه ${esc(r.essayGradedBy)} · ${esc(fmtTs(r.essayGradedAtTs, r.gradedAt || ""))}`
        : `✅ مصحَّح${r.gradedAt ? " · " + esc(r.gradedAt) : ""}`,
    );
  }
  if (st === "reviewed")
    parts.push(`🛡️ راجعه ${esc(r.essayReviewedBy || "أدمن")} · ${esc(fmtTs(r.essayReviewedAtTs, r.essayReviewedAt || ""))}`);
  return parts.length ? `<div class="es-meta">${parts.join("<br>")}</div>` : "";
}

const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

function queueBase(examId, code, r) {
  return compact({
    examId,
    examName: r.examName || "",
    code,
    name: r.name || "",
    time: r.time || "",
    submittedAt: r.submittedAt || 0,
    total: essayIndexes(r).length,
  });
}

function queueEntryFromResult(examId, code, r) {
  const st = essayStatusOf(r);
  return compact({
    ...queueBase(examId, code, r),
    status: st,
    pending: r.essayGraded === true ? 0 : Math.max(0, essayIndexes(r).length - essayGradedCount(r)),
    gradedBy: r.essayGradedBy,
    gradedById: r.essayGradedById,
    gradedAtTs: r.essayGradedAtTs,
    reviewedBy: r.essayReviewedBy,
    reviewedById: r.essayReviewedById,
    reviewedAtTs: r.essayReviewedAtTs,
    lockedBy: r.essayLockedBy,
    lockedById: r.essayLockedById,
    lockedAt: r.essayLockedAt,
  });
}

// تحديث ذرّي (نتيجة الامتحان + نتيجة الطالب + فهرس الطابور) في عملية واحدة
function patchEssay(examId, code, patch, result) {
  const upd = {};
  Object.entries(patch).forEach(([k, v]) => {
    upd[`examResults/${examId}/${code}/${k}`] = v;
    upd[`results/${code}/${k}`] = v;
  });
  const qk = `essayQueue/${examId}__${code}`;
  Object.entries(queueBase(examId, code, result || {})).forEach(([k, v]) => (upd[`${qk}/${k}`] = v));
  Object.entries(patch).forEach(([k, v]) => {
    if (Q_MAP[k]) upd[`${qk}/${Q_MAP[k]}`] = v;
  });
  return update(ref(db), upd);
}

async function ensureEssayQueueBackfill() {
  try {
    if ((await get(ref(db, "essayQueueMeta/backfilledAt"))).val()) return;
    const all = (await get(ref(db, "examResults"))).val() || {};
    const existing = (await get(ref(db, "essayQueue"))).val() || {};
    const upd = {};
    Object.entries(all).forEach(([examId, byCode]) =>
      Object.entries(byCode || {}).forEach(([code, r]) => {
        if (!r || !hasEssayQuestions(r)) return;
        const key = `${examId}__${code}`;
        if (!existing[key]) upd[`essayQueue/${key}`] = queueEntryFromResult(examId, code, r);
      }),
    );
    upd["essayQueueMeta/backfilledAt"] = serverTimestamp();
    await update(ref(db), upd);
  } catch (e) {
    console.warn("essay queue backfill failed", e);
  }
}

function purgeEssayQueue(examId) {
  const upd = {};
  Object.keys(essayQueue || {})
    .filter((k) => k.startsWith(examId + "__"))
    .forEach((k) => (upd[`essayQueue/${k}`] = null));
  if (Object.keys(upd).length) update(ref(db), upd).catch(() => {});
}

// الأدمن ينتبه لـ: Pending + Under Review + (Corrected لسه محتاج اعتماد)
function queueStatus(e) {
  if (e.status === "under_review" && Date.now() - (Number(e.lockedAt) || 0) >= ESSAY_LOCK_MS) return "pending";
  return e.status || "pending";
}
const essayAttentionCount = () =>
  Object.values(essayQueue || {}).filter((e) => ["pending", "under_review"].includes(queueStatus(e))).length;

// ---------- grading modal ----------
window.gradeEssays = async (examId, code) => {
  const me = window._currentAdmin;
  if (!me) return;
  const snap = await get(ref(db, `examResults/${examId}/${code}`));
  if (!snap.exists()) {
    update(ref(db), { [`essayQueue/${examId}__${code}`]: null }).catch(() => {});
    return alert("النتيجة غير موجودة");
  }
  const result = snap.val();
  const essays = (result.questionsSnapshot || [])
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => question.type === "essay");
  if (!essays.length) return alert("لا توجد أسئلة مقالية في هذه النتيجة");
  const status = essayStatusOf(result);
  if (status === "under_review" && result.essayLockedById !== me.id) {
    if (!confirm(`${result.essayLockedBy || "أدمن آخر"} بيراجع الإجابة دي دلوقتي.\nتفتحها برضه؟`)) return;
  }
  let lockedByMe = false;
  if (!result.essayGraded) {
    try {
      const lock = {
        essayStatus: "under_review",
        essayLockedBy: me.name,
        essayLockedById: me.id,
        essayLockedAt: Date.now(),
      };
      await patchEssay(examId, code, lock, result);
      Object.assign(result, lock);
      lockedByMe = true;
    } catch (e) {
      console.warn("lock failed", e);
    }
  }
  gradingTarget = { examId, code, result, lockedByMe };
  document.getElementById("essayGradeTitle").innerText =
    `تصحيح إجابات ${result.name || "الطالب"} — ${result.examName || ""}`;
  renderEssayModalStatus();
  document.getElementById("essayGradeList").innerHTML = essays
    .map(({ question, index }, number) => {
      const has = result.essayScores && result.essayScores[index] !== undefined && result.essayScores[index] !== null;
      return `
        <section class="essay-grade-item" data-qi="${index}">
          <h4>السؤال ${number + 1} — الدرجة القصوى ${fmtNum(questionPoints(question))}
            <span class="eq-state ${has ? "done" : "todo"}" id="eqState_${index}">${has ? "✅ مُصحَّح" : "⏳ لم يُصحَّح"}</span></h4>
          <p class="essay-grade-question">${esc(question.q)}</p>
          <div class="essay-grade-answer">${esc(result.userAnswers?.[index] || "لم يكتب الطالب إجابة")}</div>
          <label for="essayScore_${index}">الدرجة المستحقة</label>
          <input class="essay-score-input" id="essayScore_${index}" data-index="${index}"
            type="number" min="0" max="${questionPoints(question)}" step="0.5" placeholder="—"
            value="${has ? Number(result.essayScores[index]) : ""}"
            oninput="document.getElementById('eqState_${index}').className='eq-state dirty';document.getElementById('eqState_${index}').innerText='✏️ تعديل غير محفوظ'" />
        </section>`;
    })
    .join("");
  const revBtn = document.getElementById("essayReviewBtn");
  if (revBtn) revBtn.hidden = !(result.essayGraded === true && status !== "reviewed");
  const draftBtn = document.getElementById("essayDraftBtn");
  if (draftBtn) draftBtn.hidden = result.essayGraded === true;
  document.getElementById("essayGradeModal").style.display = "flex";
};

function renderEssayModalStatus() {
  const el = document.getElementById("essayStatusLine");
  if (!el || !gradingTarget) return;
  const r = gradingTarget.result;
  el.innerHTML = `${essayBadgeHtml(essayStatusOf(r))}${essayMetaHtml(r)}`;
}

function readEssayInputs(result) {
  const out = {};
  let missing = 0;
  for (const input of document.querySelectorAll("#essayGradeList .essay-score-input")) {
    const index = Number(input.dataset.index);
    const question = result.questionsSnapshot[index];
    if (input.value.trim() === "") {
      missing++;
      continue;
    }
    const points = Number(input.value);
    if (!Number.isFinite(points) || points < 0 || points > questionPoints(question)) {
      return { error: `الدرجة لازم تكون من 0 إلى ${questionPoints(question)}` };
    }
    out[index] = points;
  }
  return { scores: out, missing };
}

window.saveEssayDraft = async () => {
  const me = window._currentAdmin;
  if (!gradingTarget || !me) return;
  const { examId, code, result } = gradingTarget;
  const r = readEssayInputs(result);
  if (r.error) return alert(r.error);
  const essayScores = { ...(result.essayScores || {}), ...r.scores };
  const total = essayIndexes(result).length;
  const done = Object.keys(essayScores).filter((i) => essayIndexes(result).includes(Number(i))).length;
  try {
    await patchEssay(examId, code, { essayScores, pendingEssayCount: Math.max(0, total - done) }, result);
    result.essayScores = essayScores;
    showToast("✅ تم حفظ المسودة");
    // حدّث علامات كل سؤال
    Object.keys(r.scores).forEach((i) => {
      const s = document.getElementById("eqState_" + i);
      if (s) {
        s.className = "eq-state done";
        s.innerText = "✅ مُصحَّح";
      }
    });
  } catch (e) {
    console.error(e);
    alert("تعذر حفظ المسودة. تحقق من الاتصال.");
  }
};

window.saveEssayGrades = async () => {
  const me = window._currentAdmin;
  if (!gradingTarget || !me) return;
  const { examId, code, result } = gradingTarget;
  const r = readEssayInputs(result);
  if (r.error) return alert(r.error);
  if (r.missing) {
    return alert(`لسه ${r.missing} سؤال مقالي من غير درجة.\nكمّل تصحيحهم أو اضغط "حفظ مسودة".`);
  }
  const essayScores = { ...(result.essayScores || {}), ...r.scores };
  let score = 0;
  let total = 0;
  (result.questionsSnapshot || []).forEach((question, index) => {
    const points = questionPoints(question);
    total += points;
    if (question.type === "essay") score += Number(essayScores[index]) || 0;
    else if (result.userAnswers?.[index] === question.c) score += points;
  });
  const passMark = result.passMark || 50;
  const pct = total ? Math.round((score / total) * 100) : 0;
  const patch = {
    score,
    total,
    essayScores,
    essayGraded: true,
    essayPending: false,
    pendingEssayCount: 0,
    passed: pct >= passMark,
    gradedAt: new Date().toLocaleString("ar-EG"),
    essayStatus: "corrected",
    essayGradedBy: me.name,
    essayGradedById: me.id,
    essayGradedAtTs: Date.now(),
    essayLockedBy: null,
    essayLockedById: null,
    essayLockedAt: null,
    // أي تعديل على الدرجات بعد المراجعة يحتاج مراجعة جديدة
    essayReviewedBy: null,
    essayReviewedById: null,
    essayReviewedAtTs: null,
    essayReviewedAt: null,
  };
  try {
    await patchEssay(examId, code, patch, result);
  } catch (e) {
    console.error(e);
    return alert("تعذر حفظ التصحيح. تحقق من الاتصال وحاول تاني.");
  }
  closeModal("essayGradeModal");
  gradingTarget = null;
  logAction(`تصحيح مقالي: ${result.name} (${fmtNum(score)}/${fmtNum(total)})`);
  if (getCurEx()?.id === examId) await loadExamResultsTab();
  alert("تم حفظ التصحيح، وأصبحت النتيجة متاحة للطالب.");
};

window.markEssayReviewed = async (examId, code) => {
  const me = window._currentAdmin;
  if (!me) return;
  if (!examId && gradingTarget) ({ examId, code } = gradingTarget);
  const snap = await get(ref(db, `examResults/${examId}/${code}`));
  if (!snap.exists()) return alert("النتيجة غير موجودة");
  const result = snap.val();
  if (result.essayGraded !== true) return alert("لازم التصحيح يخلص الأول قبل اعتماد المراجعة.");
  try {
    await patchEssay(
      examId,
      code,
      {
        essayStatus: "reviewed",
        essayReviewedBy: me.name,
        essayReviewedById: me.id,
        essayReviewedAtTs: Date.now(),
        essayReviewedAt: new Date().toLocaleString("ar-EG"),
      },
      result,
    );
  } catch (e) {
    console.error(e);
    return alert("تعذر اعتماد المراجعة.");
  }
  logAction(`اعتماد مراجعة مقالي: ${result.name}`);
  showToast("🛡️ تم اعتماد المراجعة");
  if (gradingTarget && gradingTarget.code === code) {
    closeModal("essayGradeModal");
    gradingTarget = null;
  }
  if (getCurEx()?.id === examId) loadExamResultsTab();
};

window.cancelEssayGrading = async () => {
  const t = gradingTarget;
  gradingTarget = null;
  closeModal("essayGradeModal");
  if (t && t.lockedByMe && !t.result.essayGraded) {
    try {
      await patchEssay(
        t.examId,
        t.code,
        { essayStatus: "pending", essayLockedBy: null, essayLockedById: null, essayLockedAt: null },
        t.result,
      );
    } catch (e) {
      console.warn("unlock failed", e);
    }
  }
};

// ---------- exam results tab (with status filters) ----------
let _resultsFilter = "all";
window.setResultsFilter = (f) => {
  _resultsFilter = f;
  loadExamResultsTab();
};

window.loadExamResultsTab = async () => {
  const ex = getCurEx();
  if (!ex) return;
  const list = (await getExamResults(ex.id)).sort((a, b) => {
    const pa = isResultGradingComplete(a) ? 1 : 0;
    const pb = isResultGradingComplete(b) ? 1 : 0;
    return pa - pb || b.score - a.score; // اللي محتاج تصحيح الأول
  });
  const c = document.getElementById("examResultsArea");
  if (!list.length) {
    c.innerHTML = '<p style="color:var(--TS);text-align:center;padding:20px">لا توجد نتائج بعد</p>';
    return;
  }
  const counts = { pending: 0, under_review: 0, corrected: 0, reviewed: 0 };
  list.forEach((s) => {
    const st = essayStatusOf(s);
    if (st) counts[st]++;
  });
  const hasEssay = Object.values(counts).some((n) => n > 0);
  let bar = "";
  if (hasEssay) {
    const chip = (key, label, n) =>
      `<button type="button" class="es-chip ${_resultsFilter === key ? "on" : ""} ${key}" onclick="setResultsFilter('${key}')">${label} <b>${n}</b></button>`;
    bar =
      '<div class="es-filter">' +
      chip("all", "الكل", list.length) +
      chip("pending", "Pending · بانتظار التصحيح", counts.pending) +
      chip("under_review", "Under Review · قيد المراجعة", counts.under_review) +
      chip("corrected", "Corrected · تم التصحيح", counts.corrected) +
      chip("reviewed", "Reviewed · تمت المراجعة", counts.reviewed) +
      "</div>";
  }
  const shown = list.filter((s) => _resultsFilter === "all" || essayStatusOf(s) === _resultsFilter);
  let h = `${bar}<table><thead><tr><th>م</th><th>الاسم</th><th>الكود</th><th>الدرجة</th><th>النسبة</th><th>الوقت</th>${hasEssay ? "<th>حالة التصحيح</th>" : ""}<th>إدارة</th></tr></thead><tbody>`;
  shown.forEach((s, i) => {
    const st = essayStatusOf(s);
    const pending = hasEssayQuestions(s) && !isResultGradingComplete(s);
    const pct = s.total ? Math.round((s.score / s.total) * 100) : 0;
    const gradeBtn = hasEssayQuestions(s)
      ? `<button class="abtn bg-orange" onclick="gradeEssays('${esc(ex.id)}','${esc(s.code)}')" style="padding:5px 9px;font-size:11px;margin-bottom:10px;">${pending ? "✍️ تصحيح المقالي" : "مراجعة التصحيح"}</button> `
      : "";
    const reviewBtn =
      st === "corrected"
        ? `<button class="abtn bg-purple" onclick="markEssayReviewed('${esc(ex.id)}','${esc(s.code)}')" style="padding:5px 9px;font-size:11px;margin-bottom:10px;">🛡️ اعتماد</button> `
        : "";
    h += `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td style="font-family:monospace">${esc(s.code)}</td><td>${pending ? '<span class="essay-badge">بانتظار تصحيح المقالي</span>' : `${fmtNum(s.score)}/${fmtNum(s.total)}`}</td><td>${pending ? "—" : pct + "%"}</td><td style="font-size:11px; margin-bottom:5px;">${esc(s.time)}</td>${hasEssay ? `<td>${st ? essayBadgeHtml(st) + essayMetaHtml(s) : "—"}</td>` : ""}<td>${gradeBtn}${reviewBtn}<button class="abtn bg-red" onclick="delExamResult('${esc(ex.id)}','${esc(s.code)}')" style="padding:5px 15px;width:70%;font-size:11px">حذف</button></td></tr>`;
  });
  if (!shown.length) h += `<tr><td colspan="${hasEssay ? 8 : 7}" style="padding:18px;color:var(--TS)">لا توجد نتائج بهذه الحالة</td></tr>`;
  c.innerHTML = h + "</tbody></table>";
};

// ---------- essay queue tab (كل الامتحانات) ----------
let _eqFilter = "attention";
let _eqSearch = "";
window.setEssayQueueFilter = (f) => {
  _eqFilter = f;
  renderEssayQueue();
};
window.setEssayQueueSearch = (v) => {
  _eqSearch = String(v || "").trim().toLowerCase();
  renderEssayQueue();
};
window.onEssayTabOpened = () => renderEssayQueue();

function renderEssayQueueIfVisible() {
  const t = document.getElementById("tab-essays");
  if (t && t.classList.contains("on") && window._currentAdmin) renderEssayQueue();
}

function renderEssayQueue() {
  const box = document.getElementById("essayQueueContainer");
  if (!box || !window._currentAdmin) return;
  const entries = Object.entries(essayQueue || {})
    .filter(([, e]) => e && e.code)
    .map(([key, e]) => ({ key, ...e, st: queueStatus(e) }));
  const counts = { pending: 0, under_review: 0, corrected: 0, reviewed: 0 };
  entries.forEach((e) => counts[e.st] !== undefined && counts[e.st]++);
  const attention = counts.pending + counts.under_review;
  const chip = (key, label, n) =>
    `<button type="button" class="es-chip ${_eqFilter === key ? "on" : ""} ${key}" onclick="setEssayQueueFilter('${key}')">${label} <b>${n}</b></button>`;
  let html = `<div class="es-summary">
      <div class="es-kpi warn"><b>${attention}</b><span>تحتاج تصحيح الآن</span></div>
      <div class="es-kpi"><b>${counts.corrected}</b><span>مصحَّحة وتنتظر الاعتماد</span></div>
      <div class="es-kpi ok"><b>${counts.reviewed}</b><span>تمت مراجعتها</span></div>
    </div>
    <div class="es-filter">
      ${chip("attention", "تحتاج إجراء", attention)}
      ${chip("pending", "Pending", counts.pending)}
      ${chip("under_review", "Under Review", counts.under_review)}
      ${chip("corrected", "Corrected", counts.corrected)}
      ${chip("reviewed", "Reviewed", counts.reviewed)}
      ${chip("all", "الكل", entries.length)}
    </div>
    <input type="search" class="es-search" placeholder="🔎 بحث باسم الطالب أو الامتحان أو الكود" value="${esc(_eqSearch)}" oninput="setEssayQueueSearch(this.value)">`;
  let shown = entries.filter((e) => {
    if (_eqFilter === "attention") return ["pending", "under_review"].includes(e.st);
    if (_eqFilter === "all") return true;
    return e.st === _eqFilter;
  });
  if (_eqSearch) {
    shown = shown.filter((e) => `${e.name} ${e.examName} ${e.code}`.toLowerCase().includes(_eqSearch));
  }
  shown.sort((a, b) => {
    const order = { pending: 0, under_review: 1, corrected: 2, reviewed: 3 };
    return order[a.st] - order[b.st] || (b.submittedAt || 0) - (a.submittedAt || 0);
  });
  if (!shown.length) {
    html += `<p class="cmp-empty">${_eqFilter === "attention" && !_eqSearch ? "ممتاز! مفيش إجابات مقالية محتاجة تصحيح 🎉" : "لا توجد نتائج مطابقة"}</p>`;
  } else {
    html += '<div class="es-list">' + shown.map((e) => {
      const meta = [];
      if (e.st === "under_review") meta.push(`🔍 بواسطة ${esc(e.lockedBy || "أدمن")} · ${esc(timeAgo(e.lockedAt))}`);
      if (e.st === "pending" && e.total && e.pending !== undefined && e.pending < e.total)
        meta.push(`✏️ مسودة ${e.total - e.pending}/${e.total}`);
      if (e.st === "corrected" || e.st === "reviewed")
        meta.push(`✅ صحّحه ${esc(e.gradedBy || "—")}${e.gradedAtTs ? " · " + esc(fmtTs(e.gradedAtTs)) : ""}`);
      if (e.st === "reviewed")
        meta.push(`🛡️ راجعه ${esc(e.reviewedBy || "—")}${e.reviewedAtTs ? " · " + esc(fmtTs(e.reviewedAtTs)) : ""}`);
      const when = e.submittedAt ? fmtTs(e.submittedAt) : e.time || "";
      const act =
        e.st === "pending" || e.st === "under_review"
          ? `<button class="abtn bg-orange" onclick="gradeEssays('${esc(e.examId)}','${esc(e.code)}')">✍️ تصحيح</button>`
          : e.st === "corrected"
            ? `<button class="abtn bg-purple" onclick="markEssayReviewed('${esc(e.examId)}','${esc(e.code)}')">🛡️ اعتماد</button><button class="abtn bg-blue" onclick="gradeEssays('${esc(e.examId)}','${esc(e.code)}')">👁️ فتح</button>`
            : `<button class="abtn bg-blue" onclick="gradeEssays('${esc(e.examId)}','${esc(e.code)}')">👁️ فتح</button>`;
      return `<div class="es-row ${e.st}">
          <div class="es-row-main">
            <div class="es-row-top"><b>${esc(e.name || "—")}</b>${essayBadgeHtml(e.st)}</div>
            <div class="es-row-sub">📝 ${esc(e.examName || "—")} · 🔑 <span class="mono">${esc(e.code)}</span> · 🕒 ${esc(when)}</div>
            ${meta.length ? `<div class="es-meta">${meta.join(" &nbsp;|&nbsp; ")}</div>` : ""}
          </div>
          <div class="es-row-act">${act}</div>
        </div>`;
    }).join("") + "</div>";
  }
  const sel = box.querySelector(".es-search");
  const hadFocus = sel && document.activeElement === sel;
  const pos = hadFocus ? sel.selectionStart : 0;
  box.innerHTML = html;
  if (hadFocus) {
    const n = box.querySelector(".es-search");
    n.focus();
    try {
      n.setSelectionRange(pos, pos);
    } catch {}
  }
}

// ======================================================================
//  Announce new exam to students (public event feed)
// ======================================================================
const _announceTimers = new Map();
const examAnnounceable = (ex) =>
  !!ex && !ex.closed && !ex.archived && (ex.questions || []).length > 0;

async function announceExam(examId, { force = false } = {}) {
  const ex = exams.find((e) => e.id === examId);
  if (!examAnnounceable(ex)) return false;
  if (ex.announcedAt && !force) return false;
  const ev = push(ref(db, "publicEvents"));
  await update(ref(db), {
    [`publicEvents/${ev.key}`]: {
      type: "exam",
      examId: ex.id,
      title: "تم نشر امتحان جديد",
      body: String(ex.name || "").slice(0, 120),
      ts: serverTimestamp(),
    },
    [`exams/${ex.id}/announcedAt`]: serverTimestamp(),
  });
  return true;
}

// تأجيل الإرسال شوية عشان لو الأدمن لسه بيضيف أسئلة ما يتبعتش إشعار لامتحان ناقص
function scheduleExamAnnounce(examId, delay = 45000) {
  clearTimeout(_announceTimers.get(examId));
  _announceTimers.set(
    examId,
    setTimeout(() => {
      _announceTimers.delete(examId);
      announceExam(examId).catch((e) => console.warn("announce failed", e));
    }, delay),
  );
}

window.examNotifyStudents = async () => {
  const ex = getCurEx();
  if (!ex) return;
  if (!examAnnounceable(ex)) return alert("الامتحان لازم يكون مفتوح وفيه أسئلة عشان نبعت إشعار للطلاب.");
  if (!confirm(`إرسال إشعار للطلاب بامتحان "${ex.name}" الآن؟`)) return;
  try {
    await announceExam(ex.id, { force: true });
    logAction("إشعار الطلاب بالامتحان: " + ex.name);
    showToast("🔔 تم إرسال الإشعار للطلاب");
  } catch (e) {
    console.error(e);
    alert("تعذر إرسال الإشعار.");
  }
};

// ======================================================================
//  Shared helpers for feature modules (certificates / notifications)
// ======================================================================
window.__exam = {
  db,
  esc,
  showToast,
  logAction,
  requireOwner,
  isOwner,
  getCurEx,
  getExamResults,
  isResultGradingComplete,
  hasEssayQuestions,
  fmtNum,
  getExams: () => exams,
  getStudentName: () => studentName,
  getAdmin: () => window._currentAdmin,
};

// ======================================================================
//  Student profile (الاسم + الأكواد يفضلوا محفوظين) + بحث بالكود والامتحان
//  + إظهار "أدمن" جنب الاسم وزر لوحة التحكم للأدمن فقط
// ======================================================================
const STUDENT_KEY = "studentProfile.v1";
const normName = (v) =>
  String(v || "")
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function readStudent() {
  try {
    const p = JSON.parse(localStorage.getItem(STUDENT_KEY) || "null");
    return p && typeof p === "object"
      ? { name: p.name || "", phone: p.phone || "", codes: Array.isArray(p.codes) ? p.codes : [] }
      : { name: "", phone: "", codes: [] };
  } catch {
    return { name: "", phone: "", codes: [] };
  }
}
function writeStudent(p) {
  try {
    localStorage.setItem(STUDENT_KEY, JSON.stringify(p));
  } catch (e) {
    console.warn("تعذر حفظ بيانات الطالب", e);
  }
}
function saveStudentIdentity(name, phone) {
  const p = readStudent();
  p.name = name;
  p.phone = phone;
  writeStudent(p);
}
function rememberStudentCode(code, examId, examName, time) {
  const p = readStudent();
  p.codes = [{ code, examId, examName, time }, ...p.codes.filter((c) => !(c.code === code && c.examId === examId))].slice(0, 30);
  writeStudent(p);
  renderStudentCard();
}

// ---- أسماء الأدمنز (للمطابقة فقط) ----
function adminNameList() {
  const list = [{ id: "owner", name: ownerProfile.name || "مالك الموقع" }];
  Object.entries(adminAccounts || {}).forEach(([id, a]) => {
    if (a && a.active !== false) list.push({ id, name: a.name || "" });
  });
  return list;
}
function matchAdminByName(name) {
  const n = normName(name);
  if (!n) return null;
  return adminNameList().find((a) => normName(a.name) === n) || null;
}

const ADMIN_BADGE = '<span class="admin-name-badge">👑 أدمن</span>';

function refreshAdminEntry() {
  const name = document.getElementById("nameInput")?.value || "";
  const adm = matchAdminByName(name);
  const btn = document.getElementById("adminOpenBtn");
  const tag = document.getElementById("adminNameTag");
  document.body.classList.toggle("name-is-admin", !!adm);
  if (btn) btn.hidden = !adm;
  if (tag) {
    tag.hidden = !adm;
    tag.innerHTML = adm ? `${ADMIN_BADGE} <span>تم التعرف على حساب الأدمن «${esc(adm.name)}»</span>` : "";
  }
  const w = document.getElementById("wStudentName");
  if (w && studentName && document.getElementById("welcomeScreen")?.style.display === "block") {
    const a2 = matchAdminByName(studentName);
    w.innerHTML = "مرحباً، " + esc(studentName) + (a2 ? " " + ADMIN_BADGE : "");
  }
  renderStudentCard();
}

function renderStudentCard() {
  const card = document.getElementById("studentCard");
  if (!card) return;
  const p = readStudent();
  if (!p.name) {
    card.hidden = true;
    card.innerHTML = "";
    return;
  }
  const adm = matchAdminByName(p.name);
  const codes = p.codes
    .map(
      (c, i) => `<button type="button" class="sc-code" data-i="${i}" title="${esc(c.examName || "")}">
        <span class="mono">${esc(c.code)}</span><small>${esc(c.examName || "امتحان")}</small></button>`,
    )
    .join("");
  card.hidden = false;
  card.innerHTML = `<div class="sc-head"><div><b>👤 ${esc(p.name)}</b> ${adm ? ADMIN_BADGE : ""}</div>
      <button type="button" class="sc-logout" data-act="logout">🚪 تسجيل خروج</button></div>
    ${codes ? `<div class="sc-label">🔑 أكوادك (اضغط على الكود لعرض النتيجة):</div><div class="sc-codes">${codes}</div>` : '<div class="sc-label">لسه ما سلّمتش أي امتحان من هذا الجهاز.</div>'}`;
}

function fillExamSelect() {
  const sel = document.getElementById("codeExamSelect");
  if (!sel) return;
  const keep = sel.value;
  sel.innerHTML =
    '<option value="">🔎 أي امتحان (تلقائي)</option>' +
    exams
      .filter((e) => !e.archived)
      .map((e) => `<option value="${esc(e.id)}">${esc(e.emoji || "📝")} ${esc(e.name)}</option>`)
      .join("");
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}

window.studentLogout = () => {
  if (!confirm("تسجيل الخروج؟ هيتم مسح اسمك وأكوادك المحفوظة من هذا الجهاز.")) return;
  try {
    localStorage.removeItem(STUDENT_KEY);
  } catch {}
  studentName = "";
  ["nameInput", "phoneInput", "codeInput"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("welcomeScreen").style.display = "none";
  refreshAdminEntry();
};

(function initStudentUI() {
  const nameEl = document.getElementById("nameInput");
  const phoneEl = document.getElementById("phoneInput");
  if (!nameEl) return;
  const p = readStudent();
  if (p.name) nameEl.value = p.name;
  if (p.phone && phoneEl) phoneEl.value = p.phone;
  nameEl.addEventListener("input", refreshAdminEntry);
  nameEl.addEventListener("change", () => {
    const v = nameEl.value.trim();
    if (v) saveStudentIdentity(v, phoneEl?.value.trim() || "");
  });
  const card = document.getElementById("studentCard");
  card?.addEventListener("click", (e) => {
    if (e.target.closest("[data-act='logout']")) return window.studentLogout();
    const b = e.target.closest(".sc-code");
    if (!b) return;
    const c = readStudent().codes[Number(b.dataset.i)];
    if (!c) return;
    document.getElementById("codeInput").value = c.code;
    const sel = document.getElementById("codeExamSelect");
    if (sel && c.examId) sel.value = c.examId;
    window.checkResult();
  });
  fillExamSelect();
  refreshAdminEntry();
})();
