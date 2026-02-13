// ── Firebase Cloud Sync ──
// Set your Firebase Realtime Database URL here.
// To set up (free, takes 1 min):
//   1. Go to https://console.firebase.google.com
//   2. Create a project (disable analytics if asked)
//   3. Build → Realtime Database → Create Database → Start in test mode
//   4. Copy the URL (looks like https://your-project-default-rtdb.firebaseio.com)
//   5. Paste it below
const DB_URL = 'https://adbexam-31fc9-default-rtdb.europe-west1.firebasedatabase.app';

// ── Data ──
let ALL_QUESTIONS = [];
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

// ── State ──
let CUR_SEC = '';
let CUR_IDX = 0;
let CUR_QS = [];
let SECS = [];
let SEC_QS = {};
let CLOUD_OK = false;

// ── Cloud sync helpers ──
function safeKey(name) {
  return encodeURIComponent(name).replace(/\./g, '%2E');
}

async function cloudSave(username, data) {
  if (!DB_URL) return;
  try {
    await fetch(`${DB_URL}/users/${safeKey(username)}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (e) { /* silent - localStorage is the fallback */ }
}

async function cloudLoad(username) {
  if (!DB_URL) return null;
  try {
    const resp = await fetch(`${DB_URL}/users/${safeKey(username)}.json`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) { return null; }
}

async function cloudLoadAll() {
  if (!DB_URL) return null;
  try {
    const resp = await fetch(`${DB_URL}/users.json`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data) return null;
    // Decode keys back to usernames
    const result = {};
    for (const [key, val] of Object.entries(data)) {
      result[decodeURIComponent(key)] = val;
    }
    return result;
  } catch (e) { return null; }
}

// ── Local storage helpers ──
function getStore() {
  try { return JSON.parse(localStorage.getItem('denizci_quiz') || '{}'); }
  catch (e) { return {}; }
}
function setStore(d) { localStorage.setItem('denizci_quiz', JSON.stringify(d)); }
function getUser() { return localStorage.getItem('denizci_user') || ''; }
function setUser(u) { localStorage.setItem('denizci_user', u); }

function getUserData(u) {
  const s = getStore();
  return s[u] || { answers: {}, completed: {} };
}

function saveUserData(u, d) {
  const s = getStore();
  s[u] = d;
  setStore(s);
  cloudSave(u, d); // async, fire-and-forget
}

function getAllUsers() { return Object.keys(getStore()); }

// Merge cloud data into local (cloud wins for any question not yet answered locally)
function mergeData(local, cloud) {
  if (!cloud) return local;
  const merged = {
    answers: { ...(cloud.answers || {}), ...(local.answers || {}) },
    completed: { ...(cloud.completed || {}), ...(local.completed || {}) }
  };
  return merged;
}

// ── Utility ──
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function escAttr(s) { return s.replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Render dispatcher ──
function render(screen, data) {
  const app = document.getElementById('app');
  if (screen === 'login') app.innerHTML = renderLogin();
  else if (screen === 'dash') app.innerHTML = renderDash();
  else if (screen === 'quiz') app.innerHTML = renderQuiz();
  else if (screen === 'secResult') app.innerHTML = renderSecResult();
}

// ══════════════════════════════════════
// LOGIN SCREEN
// ══════════════════════════════════════
function renderLogin() {
  const users = getAllUsers();
  const cloudStatus = DB_URL
    ? `<span style="color:#4ade80;font-size:11px">☁ Bulut senkronizasyonu aktif</span>`
    : `<span style="color:#f59e0b;font-size:11px">⚠ Bulut bağlantısı yok (sadece bu cihaz)</span>`;

  let h = `<div class="login">
    <span class="icon">⚓</span>
    <h1>Denizci Sınav</h1>
    <p class="sub">Amatör Denizciler İçin Sınav Soru Bankası • ${ALL_QUESTIONS.length} Soru</p>
    <input class="login-input" id="nameInput" placeholder="Adınızı girin..." maxlength="20" autocomplete="off" onkeydown="if(event.key==='Enter')doLogin()">
    <br><button class="login-btn" onclick="doLogin()">Giriş Yap</button>`;

  if (users.length > 0) {
    h += `<div style="margin-top:24px"><p style="font-size:13px;color:#64748b;margin-bottom:8px">Kayıtlı kullanıcılar:</p>`;
    users.forEach(u => {
      const ud = getUserData(u);
      const total = Object.keys(ud.answers).length;
      h += `<button class="btn btn-secondary btn-sm" style="margin:4px" onclick="quickLogin('${escAttr(u)}')">${esc(u)} (${total}/${ALL_QUESTIONS.length})</button>`;
    });
    h += `</div>`;
  }

  h += `<div style="margin-top:24px">${cloudStatus}</div>`;
  h += `</div>`;
  return h;
}

async function doLogin() {
  const name = document.getElementById('nameInput').value.trim();
  if (!name) return;
  setUser(name);

  // Merge local + cloud data
  const local = getUserData(name);
  const cloud = await cloudLoad(name);
  const merged = mergeData(local, cloud);
  saveUserData(name, merged);

  render('dash');
}

async function quickLogin(name) {
  setUser(name);

  const local = getUserData(name);
  const cloud = await cloudLoad(name);
  const merged = mergeData(local, cloud);
  saveUserData(name, merged);

  render('dash');
}

function doLogout() {
  setUser('');
  CUR_SEC = '';
  CUR_IDX = 0;
  CUR_QS = [];
  render('login');
}

// ══════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════
function renderDash() {
  const u = getUser();
  const ud = getUserData(u);
  const totalAnswered = Object.keys(ud.answers).length;
  const totalCorrect = ALL_QUESTIONS.filter(q => ud.answers[q.id] === q.correct).length;
  const pct = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  const col = pct >= 70 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444';

  let h = `<div class="topbar">
    <span class="user">👤 ${esc(u)}</span>
    <button class="logout" onclick="doLogout()">Çıkış</button>
  </div>`;

  h += `<div class="dash-header">
    <span class="icon">⚓</span>
    <h2>Denizci Sınav</h2>
    <p class="sub">${totalAnswered}/${ALL_QUESTIONS.length} soru tamamlandı</p>
  </div>`;

  // Overall score ring
  if (totalAnswered > 0) {
    h += `<div class="overall-score">
      <div class="score-ring" style="border-color:${col}">
        <span class="pct" style="color:${col}">%${pct}</span>
        <span class="lbl">${totalCorrect}/${totalAnswered}</span>
      </div>
    </div>`;
  }

  // Leaderboard (show always if there are users)
  const users = getAllUsers();
  if (users.length > 0) {
    const board = users.map(name => {
      const d = getUserData(name);
      const ans = Object.keys(d.answers).length;
      const cor = ALL_QUESTIONS.filter(q => d.answers[q.id] === q.correct).length;
      return { name, ans, cor, pct: ans > 0 ? Math.round((cor / ans) * 100) : 0 };
    }).sort((a, b) => b.cor - a.cor || b.pct - a.pct);

    h += `<div class="lb-card"><h3>🏆 Sıralama</h3>`;
    board.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
      const isMe = p.name === u ? ' style="color:#60a5fa;font-weight:600"' : '';
      h += `<div class="lb-row">
        <span class="rank">${medal}</span>
        <span class="uname"${isMe}>${esc(p.name)}</span>
        <span class="score" style="color:${p.pct >= 70 ? '#4ade80' : p.pct >= 50 ? '#eab308' : '#f87171'}">${p.cor}/${p.ans} (%${p.pct})</span>
      </div>`;
    });
    h += `</div>`;
  }

  // Section list
  h += `<h3 style="font-size:15px;margin:16px 0 10px">📚 Bölümler</h3>`;
  h += `<div class="section-list">`;

  SECS.forEach((sec, si) => {
    const qs = SEC_QS[sec];
    const answered = qs.filter(q => ud.answers[q.id] !== undefined).length;
    const correct = qs.filter(q => ud.answers[q.id] === q.correct).length;
    const total = qs.length;
    const secPct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    const progPct = Math.round((answered / total) * 100);
    const isDone = answered === total;
    const isPartial = answered > 0 && !isDone;
    const badgeCls = isDone ? 'done' : isPartial ? 'partial' : 'new';
    const badgeText = isDone ? `%${secPct} ✓` : isPartial ? `${answered}/${total}` : 'Yeni';
    const fillCol = isDone ? (secPct >= 70 ? '#22c55e' : '#eab308') : '#2563eb';

    h += `<div class="section-item" onclick="startSection(${si})">
      <div class="top">
        <span class="name">${esc(sec)}</span>
        <span class="badge ${badgeCls}">${badgeText}</span>
      </div>
      <div class="prog-bar"><div class="prog-fill" style="width:${progPct}%;background:${fillCol}"></div></div>
      <div class="stats">
        <span>${answered}/${total} soru</span>
        ${answered > 0 ? `<span>${correct} doğru</span>` : ''}
      </div>
    </div>`;
  });

  h += `</div>`;

  // Actions
  h += `<div class="dash-actions">`;
  if (totalAnswered > 0) {
    const wrongCount = ALL_QUESTIONS.filter(q => ud.answers[q.id] !== undefined && ud.answers[q.id] !== q.correct).length;
    if (wrongCount > 0) {
      h += `<button class="btn btn-danger" onclick="retryAllWrong()">Yanlışları Tekrarla (${wrongCount})</button>`;
    }
    h += `<button class="btn btn-secondary btn-sm" onclick="showResetModal()">Sıfırla</button>`;
  }
  h += `</div>`;
  h += `<div id="modal"></div>`;

  return h;
}

// ── Modal helpers ──
function showResetModal() {
  document.getElementById('modal').innerHTML = `
    <div class="modal-bg" onclick="closeModal()">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>Sıfırla</h3>
        <p>Tüm ilerlemeniz silinecek. Emin misiniz?</p>
        <div class="btns">
          <button class="btn btn-secondary" onclick="closeModal()">İptal</button>
          <button class="btn btn-danger" onclick="doReset()">Sıfırla</button>
        </div>
      </div>
    </div>`;
}

function closeModal() {
  const modal = document.getElementById('modal');
  if (modal) modal.innerHTML = '';
}

function doReset() {
  const u = getUser();
  saveUserData(u, { answers: {}, completed: {} });
  render('dash');
}

// ══════════════════════════════════════
// START A SECTION
// ══════════════════════════════════════
function startSection(secIdx) {
  const sec = SECS[secIdx];
  if (!sec || !SEC_QS[sec]) { render('dash'); return; }
  const u = getUser();
  const ud = getUserData(u);
  CUR_SEC = sec;
  CUR_QS = SEC_QS[sec];

  // Resume from first unanswered, or start from beginning
  const firstUnanswered = CUR_QS.findIndex(q => ud.answers[q.id] === undefined);
  CUR_IDX = firstUnanswered >= 0 ? firstUnanswered : 0;
  render('quiz');
}

function retryAllWrong() {
  const u = getUser();
  const ud = getUserData(u);
  const wrongs = ALL_QUESTIONS.filter(q => ud.answers[q.id] !== undefined && ud.answers[q.id] !== q.correct);
  if (!wrongs.length) return;

  // Clear answers for wrong ones
  wrongs.forEach(q => { delete ud.answers[q.id]; });
  saveUserData(u, ud);

  // Shuffle
  for (let i = wrongs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wrongs[i], wrongs[j]] = [wrongs[j], wrongs[i]];
  }

  CUR_SEC = 'Yanlış Cevaplar';
  CUR_QS = wrongs;
  CUR_IDX = 0;
  render('quiz');
}

// ══════════════════════════════════════
// QUIZ SCREEN
// ══════════════════════════════════════
function renderQuiz() {
  const u = getUser();
  const ud = getUserData(u);
  const q = CUR_QS[CUR_IDX];
  const total = CUR_QS.length;
  const prog = ((CUR_IDX + 1) / total) * 100;
  const ans = ud.answers[q.id];
  const answered = ans !== undefined;
  const isOk = ans === q.correct;

  let h = `<div class="quiz-topbar">
    <span class="sec">${esc(CUR_SEC)}</span>
    <span class="prog">${CUR_IDX + 1}/${total}</span>
  </div>`;

  h += `<div class="prog-bar-wrap"><div class="prog-bar-fill" style="width:${prog}%"></div></div>`;

  h += `<div class="q-card">
    <div class="q-num">Soru ${CUR_IDX + 1}</div>
    <div class="q-text">${esc(q.question)}</div>
  </div>`;

  h += `<div class="opts">`;
  q.options.forEach((opt, i) => {
    let c = 'opt';
    if (answered) {
      c += ' dis';
      if (i === q.correct) c += ' ok';
      else if (i === ans && i !== q.correct) c += ' no';
    }
    h += `<div class="${c}" onclick="pickOpt(${q.id},${i})">
      <span class="ltr">${LETTERS[i]}</span>
      <span class="txt">${esc(opt)}</span>
    </div>`;
  });
  h += `</div>`;

  if (answered) {
    h += `<div class="exp-box ${isOk ? 'is-ok' : 'is-no'}">
      <div class="elbl">${isOk ? '✅ Doğru!' : '❌ Yanlış!'}</div>
      <div>${esc(q.explanation)}</div>
    </div>`;
  }

  h += `<div class="quiz-nav">`;
  h += `<button class="btn btn-secondary" onclick="quizPrev()" ${CUR_IDX === 0 ? 'disabled' : ''}>← Önceki</button>`;
  h += `<button class="btn btn-secondary btn-sm" onclick="quizBack()" style="padding:8px 12px">✕</button>`;

  if (answered) {
    const isLast = CUR_IDX === total - 1;
    h += `<button class="btn btn-primary" onclick="quizNext()">${isLast ? 'Sonuçlar →' : 'Sonraki →'}</button>`;
  } else {
    h += `<button class="btn btn-primary" disabled style="opacity:.3">Sonraki →</button>`;
  }
  h += `</div>`;

  return h;
}

function pickOpt(qid, idx) {
  const u = getUser();
  const ud = getUserData(u);
  if (ud.answers[qid] !== undefined) return;
  ud.answers[qid] = idx;
  saveUserData(u, ud);
  render('quiz');
}

function quizNext() {
  if (CUR_IDX < CUR_QS.length - 1) {
    CUR_IDX++;
    render('quiz');
    window.scrollTo(0, 0);
  } else {
    render('secResult');
  }
}

function quizPrev() {
  if (CUR_IDX > 0) {
    CUR_IDX--;
    render('quiz');
    window.scrollTo(0, 0);
  }
}

function quizBack() {
  render('dash');
}

// ══════════════════════════════════════
// SECTION RESULTS
// ══════════════════════════════════════
function renderSecResult() {
  const u = getUser();
  const ud = getUserData(u);
  const qs = CUR_QS;
  const total = qs.length;
  const answered = qs.filter(q => ud.answers[q.id] !== undefined).length;
  const correct = qs.filter(q => ud.answers[q.id] === q.correct).length;
  const wrong = answered - correct;
  const skipped = total - answered;
  const pct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  const col = pct >= 70 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444';

  // Only mark real sections as completed, not virtual retry sections
  if (SEC_QS[CUR_SEC] && skipped === 0) {
    ud.completed[CUR_SEC] = true;
    saveUserData(u, ud);
  }

  let h = `<div class="sec-result">
    <h2>${esc(CUR_SEC)}</h2>
    <div class="ring" style="border-color:${col}">
      <span class="num" style="color:${col}">%${pct}</span>
      <span class="lbl">${correct}/${answered}</span>
    </div>
    <div class="mini-stats">
      <div class="mini-stat"><div class="v" style="color:#4ade80">${correct}</div><div class="l">Doğru</div></div>
      <div class="mini-stat"><div class="v" style="color:#f87171">${wrong}</div><div class="l">Yanlış</div></div>
      <div class="mini-stat"><div class="v" style="color:#fbbf24">${skipped}</div><div class="l">Boş</div></div>
    </div>`;

  // Wrong answers list
  const wrongs = qs.filter(q => {
    const a = ud.answers[q.id];
    return a !== undefined && a !== q.correct;
  });

  if (wrongs.length > 0) {
    h += `<div class="wrong-list"><h3>❌ Yanlış Cevaplar (${wrongs.length})</h3>`;
    wrongs.forEach(q => {
      const a = ud.answers[q.id];
      h += `<div class="w-item">
        <div class="wq">${esc(q.question)}</div>
        <div class="wa">✘ Senin cevabın: ${LETTERS[a]}. ${esc(q.options[a])}</div>
        <div class="wc">✔ Doğru cevap: ${LETTERS[q.correct]}. ${esc(q.options[q.correct])}</div>
        <div class="we">${esc(q.explanation)}</div>
      </div>`;
    });
    h += `</div>`;
  }

  h += `<div class="sec-actions">
    <button class="btn btn-secondary" onclick="render('dash')">← Ana Menü</button>`;
  if (wrongs.length > 0) {
    h += `<button class="btn btn-danger" onclick="retrySecWrong()">Yanlışları Tekrarla</button>`;
  }
  h += `</div></div>`;

  return h;
}

function retrySecWrong() {
  const u = getUser();
  const ud = getUserData(u);
  const wrongs = CUR_QS.filter(q => {
    const a = ud.answers[q.id];
    return a !== undefined && a !== q.correct;
  });

  wrongs.forEach(q => { delete ud.answers[q.id]; });
  saveUserData(u, ud);

  for (let i = wrongs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wrongs[i], wrongs[j]] = [wrongs[j], wrongs[i]];
  }

  CUR_SEC = 'Yanlış Tekrar: ' + CUR_SEC;
  CUR_QS = wrongs;
  CUR_IDX = 0;
  render('quiz');
}

// ══════════════════════════════════════
// INIT — load questions then start
// ══════════════════════════════════════
async function init() {
  try {
    const resp = await fetch('questions.json');
    if (!resp.ok) throw new Error(resp.status);
    ALL_QUESTIONS = await resp.json();
  } catch (e) {
    document.getElementById('app').innerHTML = '<div class="login"><p style="color:#f87171">questions.json yüklenemedi!</p></div>';
    return;
  }

  // Build section index
  SECS = [...new Set(ALL_QUESTIONS.map(q => q.section))];
  SECS.forEach(s => { SEC_QS[s] = ALL_QUESTIONS.filter(q => q.section === s); });

  // If cloud is configured, sync all cloud users into local store
  if (DB_URL) {
    const cloudAll = await cloudLoadAll();
    if (cloudAll) {
      const store = getStore();
      for (const [name, cloudData] of Object.entries(cloudAll)) {
        store[name] = mergeData(store[name] || { answers: {}, completed: {} }, cloudData);
      }
      setStore(store);
    }
  }

  // Check for returning user
  const saved = getUser();
  if (saved && getStore()[saved]) {
    render('dash');
  } else {
    render('login');
  }
}

init();
