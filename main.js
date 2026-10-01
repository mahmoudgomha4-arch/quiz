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
  onDisconnect,
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

const ADMIN_PASS = "mybestmr123";
let exams = [];
let bankQs = [];
let studentName = "",
  studentGrade = "";
let cur = 0,
  answers = [],
  flags = [],
  timeLeft = 1800,
  timerInt = null;
let currentExamId = null;
let editingQIdx = -1,
  editingBankIdx = -1;
let qeCorrect = 0,
  qeGrade = "second",
  bCorrect = 0,
  bGrade = "second";
let newExamGrade = "second";
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
  if (document.body.classList.contains("dark"))
    ws.style.background =
      "linear-gradient(160deg,#070d1a 0%,#0f1929 50%,#081d3a 100%)";
  else
    ws.style.background =
      "linear-gradient(160deg,#0a1628 0%,#1a2a4a 50%,#0d3b6e 100%)";
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
  renderExamsList();
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

// ===== GRADE =====
window.selGrade = (g) => {
  studentGrade = g;
  document
    .querySelectorAll(".grade-btn")
    .forEach((b) => b.classList.remove("on"));
  document.querySelector(`.grade-btn[data-g="${g}"]`).classList.add("on");
  localStorage.setItem("grade", g);
};
function loadGrade() {
  selGrade("second");
}
const gName = (g) =>
  g === "first"
    ? "الأول الثانوي"
    : g === "second"
      ? "بكالوريا"
      : g === "third"
        ? "الثالث الثانوي"
        : "كل الصفوف";
const gIcon = (g) =>
  g === "first" ? "🏫" : g === "second" ? "📖" : g === "third" ? "🎓" : "📚";

// ===== WELCOME =====
window.showWelcome = async () => {
  const name = document.getElementById("nameInput").value.trim();
  const phone = document.getElementById("phoneInput").value.trim();
  if (name.split(" ").filter((x) => x).length < 3)
    return alert("الاسم يجب أن يكون ثلاثياً أو رباعياً");

  // Pick global phone visibility from any exam? we'll keep simple: require phone if any visible exam has phoneVisible!=false (default true)
  const visibleExams = exams.filter(
    (e) => e.grade === "all" || e.grade === studentGrade,
  );
  const phoneRequired = visibleExams.some((e) => e.phoneVisible !== false);
  if (phoneRequired && phone.length < 11)
    return alert("أدخل رقم هاتف صحيح (11 رقم)");

  studentName = name;
  document.getElementById("wStudentName").innerText = "مرحباً، " + name;
  document.getElementById("wStudentGrade").innerText =
    gIcon(studentGrade) + " " + gName(studentGrade);
  updateWelcomeBg();
  if (window._setPresence)
    window._setPresence({ state: "welcome", name, exam: "" });
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
      !e.archived &&
      (e.grade === "all" || e.grade === studentGrade) &&
      e.showHonor,
  );
  if (!myExams.length) {
    sec.style.display = "none";
    sec.innerHTML = "";
    return;
  }
  let html =
    '<div class="honor-board"><div class="honor-board-title">🏆 لوحة شرف ' +
    gName(studentGrade) +
    " 🏆</div>";
  for (const ex of myExams) {
    const list = await getExamResults(ex.id);
    const myGrade = list.filter((r) => r.gradeKey === studentGrade);
    if (!myGrade.length) continue;
    const ranked = buildRankedList(myGrade, 10);
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
    .filter((e) => e.grade === "all" || e.grade === studentGrade)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  if (!visible.length) {
    container.innerHTML =
      '<div class="no-exams">لا توجد امتحانات متاحة لصفك حالياً</div>';
    return;
  }
  if (getUiMode() === "new") {
    container.innerHTML = renderDashboard(visible);
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
}

window.startExam = async (examId) => {
  closeWelcome();
  const ex = exams.find((e) => e.id === examId);
  if (!ex) return alert("الامتحان غير موجود");
  if (ex.closed) return alert("الامتحان مقفل حالياً");
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
    (r) => r.gradeKey === studentGrade && r.name === studentName,
  );
  if (ex.blockRepeat !== false && past.length > 0)
    return alert("⚠️ لقد أديت هذا الامتحان مسبقاً!");
  if (ex.maxAttempts && ex.maxAttempts > 0 && past.length >= ex.maxAttempts) {
    return alert(`⚠️ استنفدت عدد المحاولات المسموح (${ex.maxAttempts})`);
  }

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
      if (isEssay(q)) return q;
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
  document.getElementById("sGradeBadge").innerText =
    gIcon(studentGrade) + " " + gName(studentGrade);
  buildSidebarGrid(window._qs);
  renderQ();
  startTimer();
  if (window._setPresence)
    window._setPresence({ state: "exam", name: studentName, exam: ex.name });
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
  document.getElementById("optionsDiv").innerHTML = q.a
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
  if (isEssay(q)) renderEssayInput(q);
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
    `${studentName}<br><small style="color:var(--TS)">${gName(studentGrade)}</small>`;
}
function updateSidebarGrid() {
  const qs = window._qs || [];
  qs.forEach((_, i) => {
    const el = document.getElementById("qn" + i);
    if (!el) return;
    el.className = "qn";
    if (answers[i] !== undefined) el.classList.add("ans");
    if (flags[i]) el.classList.add("flg");
    if (cur === i) el.classList.add("cur");
  });
}

// ===== SUBMIT =====
window.submitExam = async (auto = false) => {
  if (!auto) {
    const un = answers.filter((a) => a === undefined).length;
    if (un > 0 && !confirm(`لم تجب على ${un} سؤال. هل تريد التسليم؟`)) return;
  }
  clearInterval(timerInt);
  const qs = window._qs;
  const ex = window._currentExam;
  let score = 0,
    totalPts = 0,
    essayMax = 0,
    hasEssay = false;
  qs.forEach((q, i) => {
    totalPts += qPoints(q);
    if (isEssay(q)) {
      hasEssay = true;
      essayMax += qPoints(q);
    } else if (answers[i] === q.c) score++;
  });
  if (isPreview) {
    alert(`✅ معاينة: ${score}/${totalPts}${hasEssay ? " (بدون المقالي)" : ""}`);
    location.reload();
    return;
  }
  const code = Math.floor(10000 + Math.random() * 90000).toString();
  const snap = qs.map((q) => {
    const o = { q: q.q, a: [...q.a], c: q.c, ctx: q.ctx || "" };
    if (isEssay(q)) {
      o.type = "essay";
      o.maxMark = qPoints(q);
      o.model = q.model || "";
    }
    return o;
  });
  const pct = Math.round((score / totalPts) * 100);
  const passMark = ex.passMark || 50;
  const passed = hasEssay ? false : pct >= passMark;
  const rd = {
    code,
    name: studentName,
    grade: gName(studentGrade),
    gradeKey: studentGrade,
    score,
    total: totalPts,
    mcqScore: score,
    hasEssay,
    pending: hasEssay,
    essayMax,
    userAnswers: answers.map((a) => (a === undefined ? null : a)),
    questionsSnapshot: snap,
    time: new Date().toLocaleString("ar-EG"),
    examId: ex.id,
    examName: ex.name,
    passed,
    passMark,
  };
  await set(ref(db, `examResults/${ex.id}/${code}`), rd);
  await set(ref(db, "results/" + code), rd);
  const badge = document.createElement("div");
  badge.className = "code-badge";
  badge.innerText = `🔑 كودك: ${code}`;
  document.body.appendChild(badge);
  setTimeout(() => badge.remove(), 8000);
  playSound("submit");

  const customMsg = ex.endMsg && ex.endMsg.trim() ? "\n\n" + ex.endMsg : "";
  let resultMsg = `✅ تم تسليم الامتحان بنجاح!\n\n🔑 كودك الشخصي: ${code}\n\n📌 احتفظ بهذا الكود — يمكنك به مراجعة نتيجتك لاحقاً${customMsg}`;

  if (hasEssay)
    resultMsg += "\n\n⏳ يوجد أسئلة مقالية — ستظهر نتيجتك بعد ما يصححها الأستاذ. ادخل بكودك لاحقاً.";
  if (ex.showRes || hasEssay) {
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
    `تسليم: ${studentName} - ${ex.name} - ${hasEssay ? "بانتظار تصحيح المقالي" : score + "/" + totalPts + " - " + (passed ? "ناجح" : "راسب")}`,
  );
};

function showInlineResult(d) {
  const pct = Math.round((d.score / d.total) * 100);
  const passMark = d.passMark || 50;
  const passed = pct >= passMark;
  const hideScore = !!d._hideScore || !!d.pending;
  document.getElementById("rName").innerText = hideScore
    ? `✅ ${d.name} — تم التسليم`
    : `${passed ? "🎉" : "📚"} ${d.name}`;
  if (hideScore) {
    document.getElementById("rCircle").innerHTML =
      `<span style="font-size:32px">✅</span><small>تم</small>`;
  } else {
    document.getElementById("rCircle").innerHTML =
      `<span style="font-size:26px">${d.score}/${d.total}</span><small>درجتك</small>`;
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
      `<span style="font-size:16px;color:var(--S);font-weight:800">تم تسجيل إجاباتك بنجاح</span>`;
  } else {
    document.getElementById("rPct").innerHTML =
      `${pct}% - ${grade}<br><span style="font-size:13px;color:${passed ? "var(--S)" : "var(--D)"};font-weight:700">${passed ? "✅ ناجح" : "❌ راسب"} (النجاح من ${passMark}%)</span>`;
  }
  let topMsg = `<div style="background:var(--SL);color:var(--S);padding:10px 14px;border-radius:11px;font-weight:700;margin-bottom:10px">🎓 ${d.grade} | 📅 ${d.time}</div>`;
  if (d.pending && d.code) {
    topMsg += `<div style="background:linear-gradient(135deg,#fff3cd,#ffeaa7);color:#856404;padding:14px 16px;border-radius:11px;font-weight:800;margin-bottom:10px;font-size:15px;border:2px solid #ffc107;text-align:center">🔑 كودك: <span style="font-size:20px;letter-spacing:2px">${d.code}</span></div>`;
  }
  if (hideScore && d._code) {
    topMsg += `<div style="background:linear-gradient(135deg,#fff3cd,#ffeaa7);color:#856404;padding:14px 16px;border-radius:11px;font-weight:800;margin-bottom:10px;font-size:15px;border:2px solid #ffc107;text-align:center">🔑 كودك الشخصي: <span style="font-size:20px;letter-spacing:2px">${d._code}</span><br><span style="font-size:12px;font-weight:700;color:#856404;margin-top:4px;display:block">📌 احتفظ بهذا الكود — ستحتاجه لمراجعة نتيجتك</span></div>`;
  }
  if (d._endMsg && d._endMsg.trim()) {
    topMsg += `<div style="background:var(--PL);color:var(--P);padding:10px 14px;border-radius:11px;font-weight:700;margin-bottom:10px;white-space:pre-wrap">💬 ${d._endMsg}</div>`;
  }
  document.getElementById("rMsg").innerHTML = topMsg;
  if (hideScore) {
    document.getElementById("rTable").innerHTML =
      '<p style="color:var(--TS);text-align:center;padding:14px">🔒 أدخل كودك في صفحة "استعلام بالكود" لمشاهدة نتيجتك</p>';
  } else if (d._showCorrect === false) {
    document.getElementById("rTable").innerHTML =
      '<p style="color:var(--TS);text-align:center;padding:14px">🔒 الإجابات الصحيحة غير ظاهرة لهذا الامتحان</p>';
  } else {
    let h = `<table class="ans-table"><thead><tr><th>#</th><th>السؤال</th><th>إجابتك</th><th>الصحيحة</th><th>نتيجة</th></tr></thead><tbody>`;
    for (let i = 0; i < d.questionsSnapshot.length; i++) {
      const q = d.questionsSnapshot[i],
        ua = d.userAnswers ? d.userAnswers[i] : undefined,
        ok = ua === q.c;
      if (isEssay(q)) continue;
      h += `<tr><td>${i + 1}</td><td style="text-align:right">${q.q}</td><td>${ua != null ? q.a[ua] : "—"}</td><td>${q.a[q.c]}</td><td class="${ok ? "corr" : "wrong"}">${ok ? "✓" : "✗"}</td></tr>`;
    }
    h += `</tbody></table>`;
    document.getElementById("rTable").innerHTML = h;
  }
  window._lastResult = d;
  if (d.pending) {
    document.getElementById("rName").innerText = `⏳ ${d.name} — بانتظار التصحيح`;
    document.getElementById("rCircle").innerHTML =
      `<span style="font-size:32px">⏳</span><small>قيد التصحيح</small>`;
    document.getElementById("rPct").innerHTML =
      `<span style="font-size:15px;color:var(--W);font-weight:800">النتيجة ستظهر بعد ما الأستاذ يصحح الأسئلة المقالية</span>`;
    document.getElementById("rTable").innerHTML =
      '<p style="color:var(--TS);text-align:center;padding:14px">🔒 النتيجة مخفية لحد ما يتم تصحيح المقالي. ادخل بكودك لاحقاً وهتلاقيها.</p>';
  } else if (!hideScore && d.hasEssay) {
    document.getElementById("rTable").innerHTML += renderEssayReview(d);
  }
  document.getElementById("resultScreen").style.display = "block";
}

// ===== RESULT CHECK BY CODE =====
window.checkResult = async () => {
  const code = document.getElementById("codeInput").value.trim();
  if (!code) return;
  const snap = await get(ref(db, "results/" + code));
  if (!snap.exists()) return alert("❌ الكود غير صحيح");
  showInlineResult(snap.val());
};

// ===== ADMIN =====
window.showAdminAuth = () =>
  (document.getElementById("adminAuthModal").style.display = "flex");
window.hideAdminAuth = () =>
  (document.getElementById("adminAuthModal").style.display = "none");
window.checkAdminAuth = () => {
  const p = document.getElementById("adminPassInput").value;
  if (p === ADMIN_PASS) {
    document.getElementById("adminPanel").style.display = "block";
    backToExamsList();
    renderBankList();
    hideAdminAuth();
    document.getElementById("adminPassInput").value = "";
    if (window._setPresence) window._setPresence({ state: "admin" });
    logAction("دخول لوحة التحكم");
  } else {
    alert("❌ كلمة السر خطأ!");
  }
};
window.closeAdminPanel = () =>
  (document.getElementById("adminPanel").style.display = "none");

async function logAction(a) {
  push(ref(db, "adminLogs"), {
    action: a,
    time: new Date().toLocaleString("ar-EG"),
  });
}

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
  if (id === "complaints") loadAdminComplaints();
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
          <span class="elc-badge">${gIcon(ex.grade || "all")} ${gName(ex.grade || "all")}</span>
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
  let changed = false;
  exams.forEach((ex) => {
    if (ex.scheduleOpen) {
      const t = new Date(ex.scheduleOpen).getTime();
      if (now >= t && ex.closed) {
        ex.closed = false;
        changed = true;
      }
    }
    if (ex.scheduleClose) {
      const t = new Date(ex.scheduleClose).getTime();
      if (now >= t && !ex.closed) {
        ex.closed = true;
        changed = true;
      }
    }
  });
  if (changed) saveExams();
}

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
    `${gName(ex.grade || "all")} • ${(ex.questions || []).length} سؤال • ${Math.floor((ex.time || 1800) / 60)} دقيقة`;

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
  newExamGrade = "second";
  document
    .querySelectorAll(
      '#newExamGradeRow .qe-grade-btn, [onclick="selNewExamGrade(this)"]',
    )
    .forEach((b) => b.classList.remove("on"));
  document
    .querySelector('#newExamGradeRow .qe-grade-btn[data-g="second"]')
    .classList.add("on");
  document.getElementById("addExamModal").style.display = "flex";
};
window.selNewExamGrade = (btn) => {
  document
    .querySelectorAll('[onclick="selNewExamGrade(this)"]')
    .forEach((b) => b.classList.remove("on"));
  btn.classList.add("on");
  newExamGrade = btn.dataset.g;
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
    grade: newExamGrade,
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

function saveExams() {
  const obj = {};
  exams.forEach((e) => (obj[e.id] = e));
  set(ref(db, "exams"), obj);
}

const getCurEx = () => exams.find((e) => e.id === currentExamId);

window.examToggleClosed = () => {
  const ex = getCurEx();
  if (!ex) return;
  ex.closed = !ex.closed;
  saveExams();
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
window.examChangeGrade = () => {
  const ex = getCurEx();
  if (!ex) return;
  const g = prompt("الصف (first / second / third / all):", ex.grade || "first");
  if (["first", "second", "third", "all"].includes(g)) {
    ex.grade = g;
    saveExams();
    renderExamDashboard(ex);
  } else if (g !== null) alert("قيمة غير صحيحة");
};
window.examDelete = () => {
  const ex = getCurEx();
  if (!ex) return;
  if (!confirm(`حذف الامتحان "${ex.name}" نهائياً؟`)) return;
  exams = exams.filter((e) => e.id !== ex.id);
  saveExams();
  remove(ref(db, `examResults/${ex.id}`));
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
        const correctTxt = q.a[q.c] || "";
        return `<div class="qi" style="padding:12px 14px">
        <span style="flex:1">
          <strong style="color:var(--P)">${i + 1}.</strong> ${q.q.substring(0, 70)}${q.q.length > 70 ? "..." : ""}
          <br><small style="color:var(--S);font-weight:700">${isEssay(q) ? "✍️ مقالي — " + qPoints(q) + " درجة" : "✓ " + correctTxt.substring(0, 50)}</small>
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
        grade: ex.grade === "all" ? "second" : ex.grade || "second",
      }
      : ex.questions[idx];
  document.getElementById("qEditTitle").innerText =
    idx === -1 ? "➕ إضافة سؤال جديد" : "✏️ تعديل السؤال";
  document.getElementById("qeCtx").value = q.ctx || "";
  document.getElementById("qeQ").value = q.q || "";
  for (let i = 0; i < 4; i++)
    document.getElementById("qeA" + i).value = q.a?.[i] || "";
  qeCorrect = q.c || 0;
  qeGrade = q.grade || (ex.grade === "all" ? "second" : ex.grade) || "second";
  // update UI
  document
    .querySelectorAll("#qeAnswersWrap .qe-answer-row")
    .forEach((r, i) => r.classList.toggle("correct", i === qeCorrect));
  document
    .querySelectorAll("#qeGradeRow .qe-grade-btn")
    .forEach((b) => b.classList.toggle("on", b.dataset.g === qeGrade));
  qeSelectType(isEssay(q) ? "essay" : "mcq");
  document.getElementById("qeMaxMark").value = q.maxMark || 5;
  document.getElementById("qeModel").value = q.model || "";
  document.getElementById("qEditModal").style.display = "flex";
};
window.qeSelectCorrect = (i) => {
  qeCorrect = i;
  document
    .querySelectorAll("#qeAnswersWrap .qe-answer-row")
    .forEach((r, j) => r.classList.toggle("correct", j === i));
};
window.qeSelectGrade = (btn) => {
  qeGrade = btn.dataset.g;
  document
    .querySelectorAll("#qeGradeRow .qe-grade-btn")
    .forEach((b) => b.classList.remove("on"));
  btn.classList.add("on");
};

window.saveExamQ = () => {
  const ex = getCurEx();
  if (!ex) return;
  const q = {
    ctx: document.getElementById("qeCtx").value.trim(),
    q: document.getElementById("qeQ").value.trim(),
    a: [0, 1, 2, 3].map((i) => document.getElementById("qeA" + i).value.trim()),
    c: qeCorrect,
    grade: qeGrade,
    active: true,
  };
  if (!q.q) return alert("أدخل نص السؤال");
  if (qeType === "essay") {
    q.type = "essay";
    q.a = ["", "", "", ""];
    q.c = 0;
    q.maxMark = Math.max(0.5, Number(document.getElementById("qeMaxMark").value) || 5);
    q.model = document.getElementById("qeModel").value.trim();
  } else if (q.a.some((a) => !a))
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
  const grade = ex.grade || "all";
  const filtered =
    grade === "all" ? bankQs : bankQs.filter((q) => q.grade === grade);
  if (!filtered.length) return alert("لا توجد أسئلة في البنك مناسبة لهذا الصف");
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
        <br><small style="color:var(--TS)">${gIcon(q.grade)} ${gName(q.grade)}</small>
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
async function getExamResults(examId, includePending = false) {
  const snap = await get(ref(db, `examResults/${examId}`));
  const all = Object.values(snap.val() || {});
  return includePending ? all : all.filter((r) => !r.pending);
}

window.loadExamResultsTab = async () => {
  const ex = getCurEx();
  if (!ex) return;
  const list = (await getExamResults(ex.id, true)).sort((a, b) =>
    a.pending && !b.pending ? -1 : !a.pending && b.pending ? 1 : b.score - a.score,
  );
  const c = document.getElementById("examResultsArea");
  if (!list.length) {
    c.innerHTML =
      '<p style="color:var(--TS);text-align:center;padding:20px">لا توجد نتائج بعد</p>';
    return;
  }
  const pend = list.filter((r) => r.pending).length;
  let h = pend
    ? `<div style="background:var(--WL);color:#856404;padding:10px 14px;border-radius:11px;font-weight:700;margin-bottom:10px">⏳ ${pend} طالب بانتظار تصحيح المقالي — نتيجتهم مخفية لحد ما تصحح</div>`
    : "";
  h += `<table><thead><tr><th>م</th><th>الاسم</th><th>الكود</th><th>الدرجة</th><th>النسبة</th><th>الوقت</th><th>تصحيح</th><th>حذف</th></tr></thead><tbody>`;
  list.forEach((s, i) => {
    const pct = Math.round((s.score / s.total) * 100);
    h += `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td style="font-family:monospace">${s.code}</td><td>${s.pending ? "⏳ بانتظار التصحيح" : s.score + "/" + s.total}</td><td>${s.pending ? "—" : pct + "%"}</td><td style="font-size:11px">${s.time}</td><td>${s.hasEssay ? `<button class="abtn bg-purple" onclick="openEssayGrade('${ex.id}','${s.code}')" style="padding:5px 9px;font-size:11px">✍️ ${s.pending ? "تصحيح" : "تعديل"}</button>` : "—"}</td><td><button class="abtn bg-red" onclick="delExamResult('${ex.id}','${s.code}')" style="padding:5px 9px;font-size:11px">🗑️</button></td></tr>`;
  });
  c.innerHTML = h + "</tbody></table>";
};
window.delExamResult = async (examId, code) => {
  if (!confirm("حذف؟")) return;
  await remove(ref(db, `examResults/${examId}/${code}`));
  await remove(ref(db, "results/" + code));
  loadExamResultsTab();
};

window.loadExamHonorTab = async () => {
  const ex = getCurEx();
  if (!ex) return;
  const list = (await getExamResults(ex.id)).sort((a, b) => b.score - a.score);
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
        <div class="honor-sub">${s.grade} • المرتبة ${s.rank}</div>
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
  const list = (await getExamResults(ex.id)).sort((a, b) => b.score - a.score);
  if (!list.length) return alert("لا توجد نتائج");
  const rows = list.map((r, i) => ({
    م: i + 1,
    الاسم: r.name,
    الصف: r.grade,
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
  const list = (await getExamResults(ex.id)).sort((a, b) => b.score - a.score);
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
      <div class="pdf-sub">نتائج الطلاب — إعداد الأستاذ محمد جمال</div>
    </div>
    <div class="pdf-info-bar">
      <div class="pdf-info-item"><strong>الصف:</strong> ${gName(ex.grade || "all")}</div>
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
      <strong>📚 امتحان لغة عربية</strong> — مستر محمد جمال — أطواب<br>
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
  const list = (await getExamResults(ex.id)).sort((a, b) => b.score - a.score);
  if (!list.length) return alert("لا توجد نتائج للطباعة");
  const ranked = buildRankedList(list, 10);
  const el = document.getElementById("pdfRender");
  const date = new Date().toLocaleDateString("ar-EG");
  el.innerHTML = `
    <div class="pdf-header">
      <div class="pdf-logo" style="background:linear-gradient(135deg,#c8a84b,#f5d78e)">🏆</div>
      <div class="pdf-title" style="color:#a07820">قائمة الأوائل</div>
      <div class="pdf-sub">${ex.name} — إعداد الأستاذ محمد جمال</div>
    </div>
    <div class="pdf-info-bar">
      <div class="pdf-info-item"><strong>الصف:</strong> ${gName(ex.grade || "all")}</div>
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
      <strong>🏆 قائمة الأوائل</strong> — مستر محمد جمال — أطواب<br>
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
  const grades = [
    { k: "first", n: "🏫 الأول" },
    { k: "second", n: "🎓 بكالوريا" },
    { k: "third", n: "🎓 الثالث" },
  ];
  c.innerHTML = grades
    .map((g) => {
      const f = bankQs.filter((q) => q.grade === g.k);
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
      ? { ctx: "", q: "", a: ["", "", "", ""], c: 0, grade: "second" }
      : bankQs[i];
  document.getElementById("bankModalTitle").innerText =
    i === -1 ? "➕ إضافة سؤال للبنك" : "✏️ تعديل سؤال البنك";
  document.getElementById("bCtx").value = q.ctx || "";
  document.getElementById("bQ").value = q.q || "";
  for (let j = 0; j < 4; j++)
    document.getElementById("bA" + j).value = q.a?.[j] || "";
  bCorrect = q.c || 0;
  bGrade = q.grade || "second";
  document
    .querySelectorAll("#bankModal .qe-answer-row")
    .forEach((r, j) => r.classList.toggle("correct", j === bCorrect));
  document
    .querySelectorAll("#bGradeRow .qe-grade-btn")
    .forEach((b) => b.classList.toggle("on", b.dataset.g === bGrade));
  document.getElementById("bankModal").style.display = "flex";
};
window.bSelectCorrect = (i) => {
  bCorrect = i;
  document
    .querySelectorAll("#bankModal .qe-answer-row")
    .forEach((r, j) => r.classList.toggle("correct", j === i));
};
window.bSelectGrade = (btn) => {
  bGrade = btn.dataset.g;
  document
    .querySelectorAll("#bGradeRow .qe-grade-btn")
    .forEach((b) => b.classList.remove("on"));
  btn.classList.add("on");
};

window.saveBankQ = () => {
  const nq = {
    ctx: document.getElementById("bCtx").value.trim(),
    q: document.getElementById("bQ").value.trim(),
    a: [0, 1, 2, 3].map((i) => document.getElementById("bA" + i).value.trim()),
    c: bCorrect,
    grade: bGrade,
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
    const list = await getExamResults(ex.id);
    if (!list.length) continue;
    const ranked = buildRankedList(
      [...list].sort((a, b) => b.score - a.score),
      10,
    );
    html += `<div style="margin-bottom:22px">
      <div style="text-align:center;font-size:14px;font-weight:800;color:#a07820;background:linear-gradient(135deg,#fffde7,#fff9c4);padding:8px 14px;border-radius:20px;border:1px solid #f9ab00;margin-bottom:10px;display:inline-block;width:100%;box-sizing:border-box">${ex.emoji || "📋"} ${ex.name} — ${gName(ex.grade || "all")}</div>
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
  ]).then(() => {
    alert("✅ تم التصفير");
    logAction("تصفير كل النتائج");
  });
};

// ===== STATS (global) =====
window.showQuickStats = async () => {
  const snap = await get(ref(db, "results"));
  const all = Object.fromEntries(
    Object.entries(snap.val() || {}).filter(([k, r]) => !r.pending),
  );
  const tot = Object.keys(all).length;
  let ts = 0,
    tq = 0,
    mx = 0;
  Object.values(all).forEach((r) => {
    ts += r.score;
    tq += r.total;
    if (r.score > mx) mx = r.score;
  });
  const avg = tq ? Math.round((ts / tq) * 100) : 0;
  const pass = Object.values(all).filter(
    (r) => r.score / r.total >= 0.5,
  ).length;
  document.getElementById("statsContainer").innerHTML =
    `<div class="stat-cards">
    <div class="stat-c"><div class="stat-n">${tot}</div><div class="stat-l">إجمالي المحاولات</div></div>
    <div class="stat-c"><div class="stat-n">${avg}%</div><div class="stat-l">متوسط النسبة</div></div>
    <div class="stat-c"><div class="stat-n">${mx}</div><div class="stat-l">أعلى درجة</div></div>
    <div class="stat-c"><div class="stat-n">${tot ? Math.round((pass / tot) * 100) : 0}%</div><div class="stat-l">نسبة النجاح</div></div>
  </div>`;
};
window.showAdvStats = async () => {
  const snap = await get(ref(db, "results"));
  const all = Object.fromEntries(
    Object.entries(snap.val() || {}).filter(([k, r]) => !r.pending),
  );
  const res = Object.values(all);
  const gc = { first: 0, second: 0, third: 0 };
  let ex = 0,
    vg = 0,
    g = 0,
    w = 0;
  res.forEach((r) => {
    if (r.gradeKey === "first") gc.first++;
    else if (r.gradeKey === "second") gc.second++;
    else gc.third++;
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
      labels: ["أولى", "ثانية", "ثالثة"],
      datasets: [
        {
          label: "طلاب",
          data: [gc.first, gc.second, gc.third],
          backgroundColor: ["#1a73e8", "#0f9d58", "#7b2ff7"],
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
      h += `<div style="background:var(--BG);padding:9px 13px;border-radius:10px;font-size:13px;border:1px solid var(--BR)"><span style="color:var(--P);font-weight:700">${l.time}</span> — ${l.action}</div>`;
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
      <div class="pdf-sub">مفتاح الإجابة — مستر محمد جمال</div>
    </div>
    <div class="pdf-info-bar">
      <div class="pdf-info-item"><strong>الصف:</strong> ${gName(ex.grade || "all")}</div>
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
        return `<tr><td>${i + 1}</td><td style="text-align:right;padding-right:10px">${q.q}</td><td style="text-align:right;padding-right:10px">${isEssay(q) ? "✍️ مقالي (" + qPoints(q) + " درجة)" + (q.model ? " — " + q.model : "") : q.a[q.c]}</td><td><strong>${isEssay(q) ? "—" : letters[q.c]}</strong></td></tr>`;
      })
      .join("")}
      </tbody>
    </table>
    <div class="pdf-footer"><strong>📋 مفتاح إجابة</strong> — ${ex.name} — ${new Date().toLocaleString("ar-EG")}</div>
  `;
  await generatePDFFromTemplate(`مفتاح_${ex.name}.pdf`);
  logAction("طباعة مفتاح إجابة: " + ex.name);
};

// --- Certificates PDF (10 تصميمات) — رسم مباشر على Canvas لضمان ظهور العربية صح ---
const CERT_DESIGNS = [
  { id: 1, name: "ذهبي كلاسيك", bg: ["#ffffff", "#fffaf0", "#fff5dc"], border: "#c8a84b", bstyle: "double", title: "#a07820", titleText: "شهادة تقدير", line: "#c8a84b", sub: "#666666", body: "#444444", nameBg: "#eaf2fe", nameStroke: "rgba(26,115,232,0.3)", nameColor: "#1a73e8", exam: "#7b2ff7", cardBg: "#ffffff", icon: "🏆", corner: "🌿", sig: "#a07820", sigSub: "#aaaaaa", pattern: null },
  { id: 2, name: "أزرق ملكي", bg: ["#ffffff", "#f1f7ff", "#dcebff"], border: "#1a56b0", bstyle: "single", title: "#0d3b8c", titleText: "شهادة تقدير", line: "#1a56b0", sub: "#5a6b85", body: "#33405a", nameBg: "#e6f0ff", nameStroke: "rgba(13,59,140,0.35)", nameColor: "#0d3b8c", exam: "#1a56b0", cardBg: "#ffffff", icon: "🎓", corner: "✦", sig: "#0d3b8c", sigSub: "#8a97ad", pattern: "dots" },
  { id: 3, name: "أخضر زمردي", bg: ["#ffffff", "#f1fbf5", "#dcf3e5"], border: "#0b6e4f", bstyle: "dashed", title: "#0b6e4f", titleText: "شهادة شكر وتقدير", line: "#0b6e4f", sub: "#55705f", body: "#2f4a3b", nameBg: "#e3f6ea", nameStroke: "rgba(11,110,79,0.35)", nameColor: "#0b6e4f", exam: "#00897b", cardBg: "#ffffff", icon: "🌿", corner: "🍃", sig: "#0b6e4f", sigSub: "#8aa397", pattern: "diag" },
  { id: 4, name: "بنفسجي ملكي", bg: ["#ffffff", "#f8f1ff", "#ead9fb"], border: "#6a1b9a", bstyle: "ribbon", title: "#6a1b9a", titleText: "شهادة تفوق", line: "#6a1b9a", sub: "#76608a", body: "#47345a", nameBg: "#f1e4fb", nameStroke: "rgba(106,27,154,0.35)", nameColor: "#6a1b9a", exam: "#c2185b", cardBg: "#ffffff", icon: "👑", corner: null, sig: "#6a1b9a", sigSub: "#9d8bb0", pattern: null },
  { id: 5, name: "داكن فاخر", bg: ["#1c2b4a", "#14213d", "#0b1424"], border: "#d4af37", bstyle: "double", title: "#f5d78e", titleText: "شهادة تقدير", line: "#d4af37", sub: "#c9d1e0", body: "#e3e8f2", nameBg: "#22345a", nameStroke: "rgba(212,175,55,0.6)", nameColor: "#f5d78e", exam: "#ffd54f", cardBg: "#1f2f52", icon: "🏆", corner: "⭐", sig: "#f5d78e", sigSub: "#9aa7bf", pattern: "stars" },
  { id: 6, name: "وردي أنيق", bg: ["#ffffff", "#fff1f6", "#fddbe8"], border: "#c2185b", bstyle: "dashed", title: "#c2185b", titleText: "شهادة تقدير", line: "#e91e63", sub: "#8a5a6c", body: "#5a3444", nameBg: "#fde6ef", nameStroke: "rgba(194,24,91,0.35)", nameColor: "#c2185b", exam: "#8e24aa", cardBg: "#ffffff", icon: "🌸", corner: "🌸", sig: "#c2185b", sigSub: "#b08a98", pattern: "dots" },
  { id: 7, name: "برتقالي دافئ", bg: ["#fffdf8", "#fff3e0", "#ffe0b2"], border: "#e65100", bstyle: "corners", title: "#d84315", titleText: "شهادة نجاح وتميز", line: "#ef6c00", sub: "#8d6e63", body: "#5d4037", nameBg: "#fff0dc", nameStroke: "rgba(230,81,0,0.35)", nameColor: "#d84315", exam: "#6d4c41", cardBg: "#ffffff", icon: "🌟", corner: null, sig: "#d84315", sigSub: "#a1887f", pattern: null },
  { id: 8, name: "فيروزي بحري", bg: ["#ffffff", "#e8fafc", "#c7eef3"], border: "#00838f", bstyle: "ribbon", title: "#006064", titleText: "شهادة تقدير", line: "#00acc1", sub: "#4f7f85", body: "#2c5a60", nameBg: "#d9f4f7", nameStroke: "rgba(0,131,143,0.4)", nameColor: "#006064", exam: "#00838f", cardBg: "#ffffff", icon: "🏅", corner: null, sig: "#006064", sigSub: "#7fa3a8", pattern: "diag" },
  { id: 9, name: "أسود وذهبي", bg: ["#262626", "#171717", "#0a0a0a"], border: "#c8a84b", bstyle: "corners", title: "#e9c46a", titleText: "شهادة امتياز", line: "#c8a84b", sub: "#bdbdbd", body: "#e0e0e0", nameBg: "#2a2a2a", nameStroke: "rgba(200,168,75,0.6)", nameColor: "#f5d78e", exam: "#e9c46a", cardBg: "#232323", icon: "💎", corner: null, sig: "#e9c46a", sigSub: "#8c8c8c", pattern: null },
  { id: 10, name: "ورق قديم", bg: ["#f8ecc9", "#f0dca6", "#e4c982"], border: "#6d4c1f", bstyle: "ornate", title: "#5d3a0f", titleText: "شهادة تقدير", line: "#6d4c1f", sub: "#7a6340", body: "#4e3a1c", nameBg: "#f6e6b8", nameStroke: "rgba(109,76,31,0.5)", nameColor: "#5d3a0f", exam: "#8d3b0c", cardBg: "#fbf1d3", icon: "📜", corner: null, sig: "#5d3a0f", sigSub: "#8a7447", pattern: null },
];

function certRoundRect(ctx, x, y, w, h, r) {
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

function drawCertificate(ctx, CW, CH, D, d) {
  const F = '"Tajawal","Cairo",sans-serif';
  const txt = (t, x, y, font, color, base) => {
    ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.textBaseline = base || "middle";
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(t, x, y);
    ctx.restore();
  };
  // خلفية
  const bg = ctx.createRadialGradient(CW / 2, 0, 0, CW / 2, CH / 2, CW * 0.8);
  bg.addColorStop(0, D.bg[0]);
  bg.addColorStop(0.6, D.bg[1]);
  bg.addColorStop(1, D.bg[2]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CW, CH);
  // نقش الخلفية
  if (D.pattern === "dots") {
    ctx.fillStyle = D.border + "1c";
    for (let y = 70; y < CH; y += 38)
      for (let x = 70; x < CW; x += 38) {
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
  } else if (D.pattern === "diag") {
    ctx.strokeStyle = D.border + "14";
    ctx.lineWidth = 2;
    for (let k = -CH; k < CW; k += 34) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k + CH, CH);
      ctx.stroke();
    }
  } else if (D.pattern === "stars") {
    ctx.fillStyle = D.border + "55";
    ctx.font = "18px serif";
    ctx.textAlign = "center";
    for (let i = 0; i < 70; i++) {
      const x = (i * 197) % (CW - 120) + 60;
      const y = (i * 131) % (CH - 120) + 60;
      ctx.fillText("✦", x, y);
    }
  }
  // الإطار
  ctx.strokeStyle = D.border;
  ctx.fillStyle = D.border;
  if (D.bstyle === "double") {
    ctx.lineWidth = 8;
    certRoundRect(ctx, 22, 22, CW - 44, CH - 44, 22);
    ctx.stroke();
    ctx.lineWidth = 2;
    certRoundRect(ctx, 38, 38, CW - 76, CH - 76, 14);
    ctx.stroke();
  } else if (D.bstyle === "single") {
    ctx.lineWidth = 14;
    ctx.strokeRect(24, 24, CW - 48, CH - 48);
    ctx.lineWidth = 2;
    ctx.strokeRect(50, 50, CW - 100, CH - 100);
  } else if (D.bstyle === "dashed") {
    ctx.lineWidth = 6;
    certRoundRect(ctx, 22, 22, CW - 44, CH - 44, 30);
    ctx.stroke();
    ctx.setLineDash([18, 10]);
    ctx.lineWidth = 3;
    certRoundRect(ctx, 46, 46, CW - 92, CH - 92, 18);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (D.bstyle === "ribbon") {
    ctx.fillRect(0, 0, CW, 36);
    ctx.fillRect(0, CH - 36, CW, 36);
    ctx.lineWidth = 2;
    ctx.strokeRect(60, 62, CW - 120, CH - 124);
    ctx.fillRect(0, 36, 14, CH - 72);
    ctx.fillRect(CW - 14, 36, 14, CH - 72);
  } else if (D.bstyle === "corners") {
    ctx.lineWidth = 2;
    ctx.strokeRect(34, 34, CW - 68, CH - 68);
    ctx.lineWidth = 12;
    const L = 130, o = 22;
    [[o, o, 1, 1], [CW - o, o, -1, 1], [o, CH - o, 1, -1], [CW - o, CH - o, -1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(x, y + sy * L);
      ctx.lineTo(x, y);
      ctx.lineTo(x + sx * L, y);
      ctx.stroke();
    });
  } else if (D.bstyle === "ornate") {
    ctx.lineWidth = 12;
    ctx.strokeRect(22, 22, CW - 44, CH - 44);
    ctx.lineWidth = 3;
    ctx.strokeRect(44, 44, CW - 88, CH - 88);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(56, 56, CW - 112, CH - 112);
    [[44, 44], [CW - 44, 44], [44, CH - 44], [CW - 44, CH - 44]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // زخارف الأركان
  if (D.corner) {
    ctx.font = "58px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    [[55, 55], [CW - 55, 55], [55, CH - 55], [CW - 55, CH - 55]].forEach(([cx, cy]) => ctx.fillText(D.corner, cx, cy));
  }
  const goldLine = (y) => {
    const lg = ctx.createLinearGradient(CW * 0.2, y, CW * 0.8, y);
    lg.addColorStop(0, "rgba(0,0,0,0)");
    lg.addColorStop(0.5, D.line);
    lg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.strokeStyle = lg;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(CW * 0.2, y);
    ctx.lineTo(CW * 0.8, y);
    ctx.stroke();
  };
  // أيقونة + عنوان
  ctx.font = "100px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = D.title;
  ctx.fillText(D.icon, CW / 2, 130);
  ctx.save();
  ctx.shadowColor = D.line + "59";
  ctx.shadowBlur = 12;
  txt(D.titleText, CW / 2, 230, "bold 72px " + F, D.title);
  ctx.restore();
  goldLine(270);
  txt("تشهد إدارة منصة امتحان لغة عربية بأن:", CW / 2, 310, "28px " + F, D.sub);
  // اسم الطالب
  const nbW = Math.min(900, CW - 160), nbX = (CW - nbW) / 2, nbY = 345, nbH = 90;
  ctx.fillStyle = D.nameBg;
  ctx.strokeStyle = D.nameStroke;
  ctx.lineWidth = 2.5;
  certRoundRect(ctx, nbX, nbY, nbW, nbH, 18);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.font = "bold 52px " + F;
  const nw = ctx.measureText(d.name).width;
  let nf = 52;
  if (nw > nbW - 60) nf = Math.max(Math.floor(52 * ((nbW - 60) / nw)), 28);
  ctx.restore();
  txt(d.name, CW / 2, nbY + nbH / 2, `bold ${nf}px ` + F, D.nameColor);
  txt("من " + d.grade + " — قد اجتاز بنجاح امتحان", CW / 2, 480, "28px " + F, D.body);
  // اسم الامتحان
  const examText = '"' + d.examName + '"';
  ctx.save();
  ctx.font = "bold 38px " + F;
  const ew = ctx.measureText(examText).width;
  ctx.restore();
  const ef = ew > CW - 160 ? Math.floor(38 * ((CW - 160) / ew)) : 38;
  txt(examText, CW / 2, 535, `bold ${ef}px ` + F, D.exam);
  goldLine(580);
  // بطاقات
  const cards = [
    { label: "الدرجة", value: `${d.score}/${d.total}`, color: "#0f9d58", border: "rgba(15,157,88,0.4)" },
    { label: "النسبة", value: `${d.pct}%`, color: "#1a73e8", border: "rgba(26,115,232,0.4)" },
    { label: "التقدير", value: d.gradeLabel, color: d.gColor, border: d.gColor + "66" },
  ];
  const cW = 200, cH = 110, cG = 60;
  const cStart = (CW - (cards.length * cW + (cards.length - 1) * cG)) / 2;
  cards.forEach((card, ci) => {
    const cx = cStart + ci * (cW + cG);
    ctx.fillStyle = D.cardBg;
    ctx.strokeStyle = card.border;
    ctx.lineWidth = 2.5;
    certRoundRect(ctx, cx, 600, cW, cH, 14);
    ctx.fill();
    ctx.stroke();
    txt(card.value, cx + cW / 2, 638, "bold 34px " + F, card.color);
    txt(card.label, cx + cW / 2, 678, '18px "Cairo",sans-serif', D.sub);
  });
  // التوقيعات
  const sigY = 760;
  ctx.strokeStyle = D.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(120, sigY);
  ctx.lineTo(340, sigY);
  ctx.moveTo(CW - 340, sigY);
  ctx.lineTo(CW - 120, sigY);
  ctx.stroke();
  txt(d.teacher, 230, sigY + 8, "bold 22px " + F, D.sig, "top");
  txt("المعلم", 230, sigY + 36, '17px "Cairo",sans-serif', D.sigSub, "top");
  txt(d.date, CW - 230, sigY + 8, "bold 22px " + F, D.sig, "top");
  txt("تاريخ الإصدار", CW - 230, sigY + 36, '17px "Cairo",sans-serif', D.sigSub, "top");
  ctx.font = "28px serif";
  ctx.textAlign = "center";
  ctx.fillStyle = D.line;
  ctx.fillText("✦ ✦ ✦", CW / 2, sigY - 2);
}

function certGradeInfo(pct) {
  return {
    gradeLabel: pct >= 90 ? "ممتاز" : pct >= 75 ? "جيد جداً" : pct >= 60 ? "جيد" : "مقبول",
    gColor: pct >= 90 ? "#0f9d58" : pct >= 75 ? "#1a73e8" : pct >= 60 ? "#7b2ff7" : "#a07820",
  };
}

window.examPrintCertificates = async () => {
  const ex = getCurEx();
  if (!ex) return;
  const list = (await getExamResults(ex.id)).sort((a, b) => b.score - a.score);
  const passMark = ex.passMark || 50;
  const passers = list.filter((r) => Math.round((r.score / r.total) * 100) >= passMark);
  if (!passers.length) return alert("لا يوجد ناجحون لطباعة شهادات");
  const D = CERT_DESIGNS.find((x) => x.id === (ex.certDesign || 1)) || CERT_DESIGNS[0];
  if (!confirm(`سيتم إنشاء PDF فيه ${passers.length} شهادة بتصميم "${D.name}" (كل واحدة في صفحة لوحدها). متابعة؟`)) return;
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  await new Promise((res) => setTimeout(res, 200));
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "l", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const date = new Date().toLocaleDateString("ar-EG");
  const CW = 1400, CH = 990;
  for (let i = 0; i < passers.length; i++) {
    const r = passers[i];
    const pct = Math.round((r.score / r.total) * 100);
    const cv = document.createElement("canvas");
    cv.width = CW;
    cv.height = CH;
    drawCertificate(cv.getContext("2d"), CW, CH, D, {
      name: r.name, grade: r.grade, examName: ex.name, score: r.score, total: r.total, pct,
      ...certGradeInfo(pct), date, teacher: "الأستاذ / محمد جمال",
    });
    if (i > 0) pdf.addPage();
    pdf.addImage(cv.toDataURL("image/jpeg", 0.97), "JPEG", 0, 0, pageW, pageH);
  }
  pdf.save(`شهادات_${ex.name}.pdf`);
  logAction(`طباعة ${passers.length} شهادة (تصميم ${D.id}): ${ex.name}`);
  showToast("✅ تم إنشاء " + passers.length + " شهادة");
};

window.openCertDesigns = async () => {
  const ex = getCurEx();
  if (!ex) return;
  window._certSel = ex.certDesign || 1;
  const g = document.getElementById("certDesignGrid");
  g.innerHTML = "";
  document.getElementById("certDesignModal").style.display = "flex";
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  CERT_DESIGNS.forEach((D) => {
    const w = document.createElement("div");
    w.className = "cert-opt" + (D.id === window._certSel ? " on" : "");
    const cv = document.createElement("canvas");
    cv.width = 700;
    cv.height = 495;
    const c2 = cv.getContext("2d");
    c2.scale(0.5, 0.5);
    drawCertificate(c2, 1400, 990, D, {
      name: "اسم الطالب الرباعي", grade: "بكالوريا", examName: ex.name, score: 18, total: 20, pct: 90,
      ...certGradeInfo(90), date: new Date().toLocaleDateString("ar-EG"), teacher: "الأستاذ / محمد جمال",
    });
    w.appendChild(cv);
    const n = document.createElement("div");
    n.className = "cert-name";
    n.innerText = `${D.id}. ${D.name}`;
    w.appendChild(n);
    w.onclick = () => {
      window._certSel = D.id;
      g.querySelectorAll(".cert-opt").forEach((x) => x.classList.remove("on"));
      w.classList.add("on");
    };
    g.appendChild(w);
  });
};
window.saveCertDesign = (print) => {
  const ex = getCurEx();
  if (!ex) return;
  ex.certDesign = window._certSel || 1;
  saveExams();
  closeModal("certDesignModal");
  showToast("✅ تم حفظ تصميم الشهادة");
  if (print) examPrintCertificates();
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
        if (isEssay(sq)) {
          const g = (r.essayGrades || {})[qi];
          if (r.pending || !g) blank++;
          else if ((g.mark || 0) >= qPoints(sq) / 2) correct++;
          else wrong++;
          return;
        }
        const ua = r.userAnswers?.[qi];
        if (ua === undefined) blank++;
        else if (ua === sq.c) correct++;
        else wrong++;
      });
      const pct = totalStudents
        ? Math.round((correct / totalStudents) * 100)
        : 0;
      return { q: q.q, correct, wrong, blank, pct, qi: qi + 1 };
    })
    .sort((a, b) => a.pct - b.pct);
  const c = document.getElementById("qAnalyticsArea");
  c.innerHTML = stats
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
  if (b.title) {
    const t = document.querySelector(".login-title");
    if (t) t.innerText = b.title;
  }
  if (b.subtitle) {
    const s = document.querySelector(".login-sub");
    if (s) s.innerText = b.subtitle;
  }
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
  document.getElementById("brandSubtitle").value = b.subtitle || "";
  document.getElementById("brandEmoji").value = b.emoji || "";
  document.getElementById("brandingModal").style.display = "flex";
};
window.saveBranding = () => {
  const b = {
    title: document.getElementById("brandTitle").value.trim(),
    subtitle: document.getElementById("brandSubtitle").value.trim(),
    emoji: document.getElementById("brandEmoji").value.trim(),
    welcomeMsg: (window._branding || {}).welcomeMsg || "",
  };
  set(ref(db, "branding"), b);
  closeModal("brandingModal");
  alert("✅ تم حفظ هوية الموقع");
};
window.openWelcomeMsgModal = () => {
  const b = window._branding || {};
  document.getElementById("welcomeMsgInput").value = b.welcomeMsg || "";
  document.getElementById("welcomeMsgModal").style.display = "flex";
};
window.saveWelcomeMsg = () => {
  const cur = window._branding || {};
  cur.welcomeMsg = document.getElementById("welcomeMsgInput").value;
  set(ref(db, "branding"), cur);
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
  const gradeVal = studentGrade;

  const complaint = {
    name: nameVal || "زائر غير مسجل",
    phone: phoneVal || "غير متاح",
    grade: gName(gradeVal),
    text,
    time: new Date().toLocaleString("ar-EG"),
    timestamp: Date.now(),
    read: false,
  };

  try {
    await push(ref(db, "complaints"), complaint);
    closeModal("complaintModal");
    alert("✅ تم إرسال شكواك بنجاح. سيتم مراجعتها من قِبل الأستاذ.");
  } catch (e) {
    alert("❌ حدث خطأ: " + e.message);
  }
};

window.loadAdminComplaints = async () => {
  loadAdminGrievances();
  const c = document.getElementById("complaintsContainer");
  c.innerHTML =
    '<p style="color:var(--TS);text-align:center;padding:20px">جاري التحميل...</p>';
  const snap = await get(ref(db, "complaints"));
  const data = snap.val();
  if (!data) {
    c.innerHTML =
      '<p style="color:var(--TS);text-align:center;padding:20px">لا توجد شكاوى حتى الآن</p>';
    return;
  }
  const list = Object.entries(data).sort(
    (a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0),
  );
  c.innerHTML = list
    .map(
      ([key, r]) => `
    <div style="background:var(--CB);border:1.5px solid ${r.read ? "var(--BR)" : "#d63031"};border-radius:16px;padding:16px;margin-bottom:10px;box-shadow:var(--SH)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--TX)">👤 ${r.name}</div>
          <div style="font-size:12px;color:var(--TS);margin-top:2px">📚 ${r.grade || "-"} &nbsp;|&nbsp; 📱 <span id="phone_${key}" style="font-family:monospace">••••••</span>
            <button onclick="toggleAdminPhone('${key}','${(r.phone || "").replace(/'/g, "\\'")}',this)" style="background:var(--IB);border:1px solid var(--BR);border-radius:6px;padding:1px 7px;cursor:pointer;font-size:10px;font-family:'Cairo',sans-serif;font-weight:700;color:var(--TS);margin-right:4px;transition:.2s">إظهار</button>
          </div>
        </div>
        <div style="font-size:11px;color:var(--TS);text-align:left">${r.time || ""}</div>
      </div>
      <div style="background:var(--BG);border-radius:12px;padding:12px;font-size:14px;line-height:1.7;color:var(--TX);border-right:3px solid #d63031;margin-bottom:10px">${r.text}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="abtn bg-green" onclick="markComplaintRead('${key}')" style="padding:6px 12px;font-size:12px">✅ تم الاطلاع</button>
        <button class="abtn bg-red" onclick="deleteComplaint('${key}')" style="padding:6px 12px;font-size:12px">🗑️ حذف</button>
      </div>
    </div>
  `,
    )
    .join("");
};

window.toggleAdminPhone = (key, phone, btn) => {
  const el = document.getElementById("phone_" + key);
  if (el.innerText.includes("•")) {
    el.innerText = phone || "غير متاح";
    btn.innerText = "إخفاء";
  } else {
    el.innerText = "••••••";
    btn.innerText = "إظهار";
  }
};

window.markComplaintRead = async (key) => {
  await update(ref(db, `complaints/${key}`), { read: true });
  loadAdminComplaints();
};
window.deleteComplaint = async (key) => {
  if (!confirm("حذف الشكوى؟")) return;
  await remove(ref(db, `complaints/${key}`));
  loadAdminComplaints();
};
window.clearAllComplaints = async () => {
  if (!confirm("⚠️ حذف كل الشكاوى نهائياً؟")) return;
  await remove(ref(db, "complaints"));
  loadAdminComplaints();
};

// ===== COMPLAINTS LISTENER (badge for admin) =====
onValue(ref(db, "complaints"), (snap) => {
  const data = snap.val();
  const unread = data ? Object.values(data).filter((c) => !c.read).length : 0;
  window._cmpUnread = unread;
  updateComplaintsBadge();
});

// ===== AI EXTRACT =====
let aiGrade = "second";
let aiExtractedQs = [];
let _aiFileText = "";
let _aiFileB64 = "";
let _aiFileIsImg = false;

window.aiSelectGrade = (btn) => {
  aiGrade = btn.dataset.g;
  document.querySelectorAll("#aiGradeRow button").forEach((b) => {
    const on = b === btn;
    b.style.background = on ? "var(--P)" : "var(--CB)";
    b.style.color = on ? "#fff" : "var(--TX)";
    b.style.borderColor = on ? "var(--P)" : "var(--BR)";
  });
};

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
      grade: aiGrade,
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
loadGrade();
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
// ===== إضافات: مقالي / تظلم / متصلون الآن / داش بورد / تصميم الواجهة =====
// =====================================================================
const esc = (t) =>
  String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const isEssay = (q) => !!q && q.type === "essay";
const qPoints = (q) => (isEssay(q) ? Number(q.maxMark) || 1 : 1);
let qeType = "mcq";

// ----- محرر السؤال: نوع السؤال -----
window.qeSelectType = (t) => {
  qeType = t;
  document.querySelectorAll("#qeTypeSection [data-t]").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
  document.getElementById("qeEssayExtra").style.display = t === "essay" ? "block" : "none";
  const sec = document.getElementById("qeAnswersWrap").closest(".qe-section");
  if (sec) sec.style.display = t === "essay" ? "none" : "";
};

// ----- واجهة الطالب: إجابة مقالية -----
function renderEssayInput(q) {
  const d = document.getElementById("optionsDiv");
  d.innerHTML = `<div class="essay-box"><div class="essay-tag">✍️ سؤال مقالي — ${qPoints(q)} درجة (بيتصحح بواسطة الأستاذ)</div><textarea id="essayInput" class="essay-input" rows="8" placeholder="اكتب إجابتك هنا..."></textarea></div>`;
  const t = document.getElementById("essayInput");
  t.value = answers[cur] || "";
  t.oninput = () => {
    answers[cur] = t.value.trim() ? t.value : undefined;
    updateSidebarGrid();
    updateProg();
  };
}

// ----- مراجعة المقالي للطالب + زر التظلم -----
function renderEssayReview(d) {
  const sq = d.questionsSnapshot || [];
  let h = "";
  sq.forEach((q, i) => {
    if (!isEssay(q)) return;
    const g = (d.essayGrades || {})[i] || {};
    const ans = d.userAnswers ? d.userAnswers[i] : null;
    h += `<div class="essay-review">
      <div class="er-q">✍️ ${i + 1}. ${esc(q.q)}</div>
      <div class="er-ans"><b>إجابتك:</b><br>${ans ? esc(ans).replace(/\n/g, "<br>") : "<i>لم تجب</i>"}</div>
      <div class="er-mark">الدرجة: <b>${g.mark ?? 0} / ${qPoints(q)}</b></div>
      ${g.comment ? `<div class="er-cmt">💬 تعليق الأستاذ: ${esc(g.comment)}</div>` : ""}
      ${d.code ? `<button class="abtn bg-orange" style="padding:7px 14px;font-size:12px;margin-top:8px" onclick="openGrievance('${d.code}',${i})">⚖️ تظلم على التصحيح</button>` : ""}
    </div>`;
  });
  return h ? `<h4 style="margin:18px 0 8px;text-align:right">✍️ الأسئلة المقالية</h4>` + h : "";
}

// ----- تظلم الطالب -----
window.openGrievance = async (code, qi) => {
  const d = window._lastResult;
  if (!d) return;
  const ex = await get(ref(db, `grievances/${code}_${qi}`));
  if (ex.exists()) return alert("⚠️ سبق وقدمت تظلم على هذا السؤال، وبيتراجع من الأستاذ.");
  window._grv = { code, qi };
  const q = d.questionsSnapshot[qi];
  const g = (d.essayGrades || {})[qi] || {};
  document.getElementById("grvInfo").innerHTML = `<b>${esc(q.q)}</b><br>درجتك الحالية: ${g.mark ?? 0}/${qPoints(q)}`;
  document.getElementById("grvText").value = "";
  document.getElementById("grievanceModal").style.display = "flex";
};
window.sendGrievance = async () => {
  const G = window._grv,
    d = window._lastResult;
  if (!G || !d) return;
  const text = document.getElementById("grvText").value.trim();
  if (text.length < 5) return alert("⚠️ اكتب سبب التظلم بوضوح");
  const q = d.questionsSnapshot[G.qi];
  const g = (d.essayGrades || {})[G.qi] || {};
  try {
    await set(ref(db, `grievances/${G.code}_${G.qi}`), {
      code: G.code,
      examId: d.examId || "",
      examName: d.examName || "",
      name: d.name,
      qi: G.qi,
      qText: q.q,
      answer: (d.userAnswers && d.userAnswers[G.qi]) || "",
      mark: g.mark ?? 0,
      maxMark: qPoints(q),
      comment: g.comment || "",
      text,
      status: "pending",
      time: new Date().toLocaleString("ar-EG"),
      timestamp: Date.now(),
    });
    closeModal("grievanceModal");
    alert("✅ تم إرسال التظلم. هيراجعه الأستاذ ويعدل الدرجة لو لزم.");
  } catch (e) {
    alert("❌ حدث خطأ: " + e.message);
  }
};

// ----- تصحيح المقالي (أدمن) -----
window.openEssayGrade = async (examId, code, grvKey) => {
  const snap = await get(ref(db, `examResults/${examId}/${code}`));
  if (!snap.exists()) return alert("النتيجة غير موجودة");
  const r = snap.val();
  window._grading = { examId, code, r, grvKey: grvKey || null };
  document.getElementById("egTitle").innerText = `✍️ تصحيح: ${r.name}`;
  document.getElementById("egInfo").innerText = `${r.examName || ""} — كود ${code}`;
  let h = "";
  (r.questionsSnapshot || []).forEach((q, i) => {
    if (!isEssay(q)) return;
    const g = (r.essayGrades || {})[i] || {};
    const max = qPoints(q);
    const ans = r.userAnswers ? r.userAnswers[i] : null;
    h += `<div class="eg-item">
      <div class="eg-q">${i + 1}. ${esc(q.q)}</div>
      ${q.model ? `<div class="eg-model">✅ <b>نموذج الإجابة:</b> ${esc(q.model)}</div>` : ""}
      <div class="eg-ans"><b>إجابة الطالب:</b><br>${ans ? esc(ans).replace(/\n/g, "<br>") : "<i>لم يجب</i>"}</div>
      <div class="eg-row">
        <label>الدرجة (من ${max})</label>
        <input type="number" id="egMark${i}" min="0" max="${max}" step="0.5" value="${g.mark ?? ""}" placeholder="0" />
        <input type="text" id="egCmt${i}" placeholder="تعليق للطالب (اختياري)" value="${esc(g.comment || "")}" />
      </div></div>`;
  });
  document.getElementById("egBody").innerHTML = h || "<p>لا توجد أسئلة مقالية</p>";
  document.getElementById("essayGradeModal").style.display = "flex";
};
window.saveEssayGrades = async () => {
  const G = window._grading;
  if (!G) return;
  const r = G.r,
    qs = r.questionsSnapshot || [];
  let mcq = r.mcqScore;
  if (mcq === undefined) {
    mcq = 0;
    qs.forEach((q, i) => {
      if (!isEssay(q) && r.userAnswers && r.userAnswers[i] === q.c) mcq++;
    });
  }
  const essayGrades = {};
  let sum = 0;
  for (let i = 0; i < qs.length; i++) {
    if (!isEssay(qs[i])) continue;
    const v = document.getElementById("egMark" + i).value;
    if (v === "") return alert("أدخل درجة لكل سؤال مقالي (ولو صفر)");
    const m = Math.min(Math.max(parseFloat(v) || 0, 0), qPoints(qs[i]));
    essayGrades[i] = { mark: m, comment: document.getElementById("egCmt" + i).value.trim() };
    sum += m;
  }
  const score = mcq + sum;
  const pct = Math.round((score / r.total) * 100);
  const upd = { essayGrades, score, mcqScore: mcq, pending: false, passed: pct >= (r.passMark || 50), gradedAt: Date.now() };
  try {
    await update(ref(db, `examResults/${G.examId}/${G.code}`), upd);
    await update(ref(db, `results/${G.code}`), upd);
    if (G.grvKey) await update(ref(db, `grievances/${G.grvKey}`), { status: "resolved", resolvedAt: Date.now() });
  } catch (e) {
    return alert("❌ حدث خطأ: " + e.message);
  }
  closeModal("essayGradeModal");
  showToast("✅ تم حفظ التصحيح — النتيجة ظهرت للطالب");
  logAction(`تصحيح مقالي: ${r.name} - ${score}/${r.total}`);
  if (getCurEx()) loadExamResultsTab();
  loadAdminGrievances();
};

// ----- التظلمات (أدمن) -----
window.loadAdminGrievances = async () => {
  const c = document.getElementById("grievancesContainer");
  if (!c) return;
  const data = (await get(ref(db, "grievances"))).val();
  if (!data) {
    c.innerHTML = '<p style="color:var(--TS);text-align:center;padding:14px">لا توجد تظلمات</p>';
    return;
  }
  const list = Object.entries(data).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
  c.innerHTML = list
    .map(([key, g]) => {
      const done = g.status === "resolved";
      return `<div style="background:var(--CB);border:1.5px solid ${done ? "var(--BR)" : "#f9ab00"};border-radius:16px;padding:14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:8px">
        <b>👤 ${esc(g.name)} <small style="color:var(--TS)">(${esc(g.examName)})</small></b>
        <span style="font-size:11px;color:var(--TS)">${esc(g.time)} ${done ? "• ✅ تمت المراجعة" : "• ⏳ جديد"}</span>
      </div>
      <div style="font-size:13px;margin-bottom:6px"><b>السؤال:</b> ${esc(g.qText)}</div>
      <div style="font-size:13px;background:var(--BG);padding:8px 10px;border-radius:9px;margin-bottom:6px"><b>إجابة الطالب:</b> ${esc(g.answer) || "—"}<br><b>الدرجة:</b> ${g.mark}/${g.maxMark} ${g.comment ? "— " + esc(g.comment) : ""}</div>
      <div style="font-size:14px;border-right:3px solid #f9ab00;padding:6px 10px;margin-bottom:8px">⚖️ ${esc(g.text)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="abtn bg-purple" style="padding:6px 12px;font-size:12px" onclick="openEssayGrade('${g.examId}','${g.code}','${key}')">✍️ إعادة التصحيح</button>
        ${done ? "" : `<button class="abtn bg-green" style="padding:6px 12px;font-size:12px" onclick="resolveGrievance('${key}')">✅ تمت المراجعة</button>`}
        <button class="abtn bg-red" style="padding:6px 12px;font-size:12px" onclick="deleteGrievance('${key}')">🗑️</button>
      </div></div>`;
    })
    .join("");
};
window.resolveGrievance = async (k) => {
  await update(ref(db, `grievances/${k}`), { status: "resolved", resolvedAt: Date.now() });
  loadAdminGrievances();
};
window.deleteGrievance = async (k) => {
  if (!confirm("حذف التظلم؟")) return;
  await remove(ref(db, `grievances/${k}`));
  loadAdminGrievances();
};
function updateComplaintsBadge() {
  const n = (window._cmpUnread || 0) + (window._grvPending || 0);
  const tab = document.querySelector("[onclick*=\"switchTab('complaints'\"]");
  if (tab) tab.innerText = n > 0 ? `📢 الشكاوى والتظلمات (${n})` : "📢 الشكاوى";
}
onValue(ref(db, "grievances"), (snap) => {
  const d = snap.val();
  window._grvPending = d ? Object.values(d).filter((g) => g.status !== "resolved").length : 0;
  updateComplaintsBadge();
});

// ----- المتصلون الآن -----
const presRef = push(ref(db, "presence"));
const presState = { state: "visiting", name: "", exam: "" };
window._setPresence = (patch) => {
  Object.assign(presState, patch || {});
  set(presRef, { ...presState, ts: Date.now() }).catch(() => {});
};
onValue(ref(db, ".info/connected"), (s) => {
  if (s.val() === true) {
    onDisconnect(presRef).remove();
    window._setPresence({});
  }
});
setInterval(() => window._setPresence({}), 60000);
window.addEventListener("pagehide", () => remove(presRef).catch(() => {}));
window._presRaw = {};
function onlineList() {
  const now = Date.now();
  return Object.values(window._presRaw || {}).filter((p) => p && now - (p.ts || 0) < 180000 && p.state !== "admin");
}
function renderOnlineBadge() {
  const b = document.getElementById("onlineBadge");
  if (!b) return;
  const l = onlineList();
  const inExam = l.filter((p) => p.state === "exam").length;
  b.innerText = `🟢 متصل الآن: ${l.length}` + (inExam ? ` (${inExam} في امتحان)` : "");
}
onValue(ref(db, "presence"), (snap) => {
  window._presRaw = snap.val() || {};
  renderOnlineBadge();
});
setInterval(renderOnlineBadge, 30000);
window.openOnlineModal = () => {
  const l = onlineList();
  document.getElementById("onlineBody").innerHTML = l.length
    ? l
        .map((p) => `<div style="padding:9px 12px;background:var(--BG);border-radius:10px;margin-bottom:6px;font-size:13px">${p.state === "exam" ? "📝" : p.state === "welcome" ? "📋" : "👀"} <b>${esc(p.name) || "زائر"}</b> — ${p.state === "exam" ? "في امتحان «" + esc(p.exam) + "»" : p.state === "welcome" ? "بيختار امتحان" : "بيتصفح الموقع"}</div>`)
        .join("")
    : '<p style="text-align:center;color:var(--TS);padding:16px">لا يوجد أحد متصل حالياً</p>';
  document.getElementById("onlineModal").style.display = "flex";
};

// ----- تصميم الواجهة (قديم / جديد) + الداش بورد -----
function getUiMode() {
  return (window._site || {}).uiMode || "new";
}
function applyUiMode() {
  document.body.classList.toggle("ui-new", getUiMode() === "new");
  const b = document.getElementById("uiModeAdminBtn");
  if (b) {
    const cur = (window._site || {}).uiMode || "new";
    b.innerText = cur === "new" ? "🖥️ تصميم الواجهة: الجديد (داش بورد) — اضغط للرجوع للقديم" : "🖥️ تصميم الواجهة: القديم (كروت) — اضغط للجديد";
  }
}
function refreshWelcomeIfOpen() {
  const w = document.getElementById("welcomeScreen");
  if (w && w.style.display === "block") buildExamList();
}
window.adminToggleUiMode = async () => {
  const site = window._site || {};
  const next = (site.uiMode || "new") === "new" ? "old" : "new";
  await set(ref(db, "siteSettings"), { ...site, uiMode: next, uiVer: Date.now() });
  showToast(next === "new" ? "✅ تم تفعيل التصميم الجديد للكل" : "✅ تم الرجوع للتصميم القديم للكل");
};
onValue(ref(db, "siteSettings"), (snap) => {
  window._site = snap.val() || {};
  applyUiMode();
  refreshWelcomeIfOpen();
});
applyUiMode();

function renderDashboard(visible) {
  const open = visible.filter((e) => !e.closed && (e.questions || []).length);
  const totalQ = visible.reduce((a, e) => a + (e.questions || []).length, 0);
  const essayN = visible.filter((e) => (e.questions || []).some(isEssay)).length;
  const stat = (ic, n, l) => `<div class="dash-stat"><div class="ds-ic">${ic}</div><div class="ds-n">${n}</div><div class="ds-l">${l}</div></div>`;
  const stats = `<div class="dash-stats">${stat("🟢", open.length, "امتحان متاح")}${stat("❓", totalQ, "إجمالي الأسئلة")}${stat("✍️", essayN, "فيها مقالي")}${stat("🔒", visible.length - open.length, "مقفل / فارغ")}</div>`;
  const tiles = visible
    .map((ex) => {
      const qs = ex.questions || [];
      const cnt = qs.length;
      const lk = ex.closed || cnt === 0;
      const ess = qs.filter(isEssay).length;
      return `<div class="dash-tile ${lk ? "locked" : ""}" style="--tc:${esc(ex.color || "#1a73e8")}" onclick="${lk ? "" : "startExam('" + ex.id + "')"}">
        <div class="dt-top"><div class="dt-ic">${ex.emoji || "📝"}</div><div class="dt-status ${lk ? "off" : "on"}">${lk ? (cnt === 0 ? "فارغ" : "🔒 مقفل") : "🟢 متاح"}</div></div>
        <div class="dt-name">${ex.pinned ? "📌 " : ""}${esc(ex.name)}${ex.password ? " 🔑" : ""}</div>
        <div class="dt-desc">${esc(ex.desc || "")}</div>
        <div class="dt-chips"><span>❓ ${cnt} سؤال</span><span>⏱️ ${Math.floor((ex.time || 1800) / 60)} د</span>${ess ? `<span>✍️ ${ess} مقالي</span>` : ""}<span>🎯 نجاح ${ex.passMark || 50}%</span></div>
        <div class="dt-go">${lk ? "غير متاح الآن" : "ابدأ الامتحان ◀"}</div></div>`;
    })
    .join("");
  return `<div class="dash">${stats}<div class="dash-grid">${tiles}</div></div>`;
}
