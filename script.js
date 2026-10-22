'use strict';

var TARGET_BLOCKS = 15, MAX_LEVEL = 5, BASE_SCORE = 100, MAX_COMBO = 5, FEEDBACK_DELAY = 900, STREAK_TARGET = 3, STREAK_BONUS = 1, BLOCK_CLASS = 'block';

var LEVEL_CONFIG = {
  1: { botMin: 6000, botMax: 8000, botAcc: 0.65, time: 15 },
  2: { botMin: 5000, botMax: 7000, botAcc: 0.70, time: 14 },
  3: { botMin: 4000, botMax: 6000, botAcc: 0.75, time: 13 },
  4: { botMin: 3000, botMax: 5000, botAcc: 0.80, time: 12 },
  5: { botMin: 2500, botMax: 4000, botAcc: 0.85, time: 10 }
};

var db = null;
if (typeof firebase !== 'undefined' && window.MTR_FIREBASE_CONFIG && window.MTR_FIREBASE_CONFIG.apiKey !== "MASUKKAN_API_KEY_KAMU_DISINI") {
    try {
        firebase.initializeApp(window.MTR_FIREBASE_CONFIG);
        db = firebase.database();
    } catch (e) {
        console.error("Firebase init failed:", e);
    }
}

function byId(id) { return document.getElementById(id); }
var el = {};

function cacheElements() {
  el.startScreen = byId('start-screen'); el.startBtn = byId('start-btn'); el.humanModeBtn = byId('human-mode-btn'); el.roomPanel = byId('room-panel');
  el.createRoomBtn = byId('create-room-btn'); el.joinRoomBtn = byId('join-room-btn'); el.roomCodeInput = byId('room-code-input'); el.roomMessage = byId('room-message');
  el.winModal = byId('win-modal'); el.modalCard = byId('modal-card'); el.winTitle = byId('win-title'); el.winSubtitle = byId('win-subtitle'); el.nextLevelBtn = byId('next-level-btn');
  el.levelDisplay = byId('level-display'); el.musicBtn = byId('music-btn'); el.questionBox = byId('question-box'); el.turnDisplay = byId('turn-display');
  el.answerInput = byId('answer-input'); el.submitBtn = byId('submit-btn');
  el.p1Score = byId('p1-score'); el.p1Ht = byId('p1-ht'); el.p1Combo = byId('p1-combo'); el.p1Tower = byId('p1-tower'); el.p1Robot = byId('p1-robot'); el.p1Bubble = byId('p1-bubble');
  el.p2Score = byId('p2-score'); el.p2Ht = byId('p2-ht'); el.p2Combo = byId('p2-combo'); el.p2Tower = byId('p2-tower'); el.p2Robot = byId('p2-robot'); el.p2Bubble = byId('p2-bubble');
  el.p2Name = byId('p2-name'); el.p2Card = byId('p2-card'); el.particles = byId('particles-container');
  el.comboBanner = document.querySelector('.center-effects .combo-banner');
  el.comboBannerTop = el.comboBanner ? el.comboBanner.querySelector('.mult-text') : null;
  el.comboBannerText = el.comboBanner ? el.comboBanner.querySelector('.combo-text') : null;
}

// BUG FIXED: Hapus state.level secara global, tambahkan level khusus di tiap player (P1 dan P2)
var state = { gameMode: 'pve', playerRole: 'p1', roomCode: null, running: false, question: null, answered: true, timeLeft: 0, p1: newPlayerState(), p2: newPlayerState() };
function newPlayerState() { return { score: 0, blocks: 0, combo: 1, streak: 0, level: 1 }; } 

var tickTimer = null, botTimer = null, nextQTimer = null;
function clearAllTimers() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } if (botTimer) { clearTimeout(botTimer); botTimer = null; } if (nextQTimer) { clearTimeout(nextQTimer); nextQTimer = null; } }

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[rnd(0, arr.length - 1)]; }
function setText(node, value) { if (node) node.textContent = value; }
function hideEl(node) { if (!node) return; node.classList.add('hidden'); node.style.display = 'none'; }
function showEl(node) { if (!node) return; node.classList.remove('hidden'); node.style.display = ''; }

function makeQuestion(level) {
  if (level <= 1) {
    if (Math.random() < 0.5) { var a = rnd(5, 40), b = rnd(5, 40); return { text: a + ' + ' + b + ' = ?', answer: a + b }; }
    var c = rnd(20, 60), d = rnd(1, 19); return { text: c + ' - ' + d + ' = ?', answer: c - d };
  }
  if (level === 2) {
    var t2 = pick(['kali', 'bagi', 'campur']);
    if (t2 === 'kali') { var a2 = rnd(2, 12), b2 = rnd(2, 12); return { text: a2 + ' \u00D7 ' + b2 + ' = ?', answer: a2 * b2 }; }
    if (t2 === 'bagi') { var div = rnd(2, 12), res = rnd(2, 12); return { text: (div * res) + ' \u00F7 ' + div + ' = ?', answer: res }; }
    var x = rnd(10, 50), y = rnd(10, 50), z = rnd(1, 20); return { text: x + ' + ' + y + ' - ' + z + ' = ?', answer: x + y - z };
  }
  if (level === 3) {
    var t3 = pick(['kali-tambah', 'tambah-kali', 'kurung']);
    if (t3 === 'kali-tambah') { var m1 = rnd(3, 12), m2 = rnd(3, 12), add = rnd(5, 40); return { text: m1 + ' \u00D7 ' + m2 + ' + ' + add + ' = ?', answer: m1 * m2 + add }; }
    if (t3 === 'tambah-kali') { var d = rnd(10, 60), e = rnd(2, 10), f = rnd(2, 10); return { text: d + ' + ' + e + ' \u00D7 ' + f + ' = ?', answer: d + e * f }; }
    var g = rnd(2, 15), h = rnd(2, 15), i = rnd(2, 6); return { text: '(' + g + ' + ' + h + ') \u00D7 ' + i + ' = ?', answer: (g + h) * i };
  }
  if (level === 4) {
    var t4 = pick(['linear', 'kurung', 'bagi-kali']);
    if (t4 === 'linear') { var l_x = rnd(2, 15), l_a = rnd(2, 9), l_b = rnd(1, 25); return { text: l_a + 'x + ' + l_b + ' = ' + (l_a * l_x + l_b) + '  ,  x = ?', answer: l_x }; }
    if (t4 === 'kurung') { var k_x = rnd(2, 15), k_a = rnd(2, 8), k_b = rnd(1, 15); return { text: k_a + '(x + ' + k_b + ') = ' + (k_a * (k_x + k_b)) + '  ,  x = ?', answer: k_x }; }
    var p = rnd(2, 12), q = rnd(2, 12), r = rnd(2, 9); return { text: (p * q) + ' \u00F7 ' + p + ' \u00D7 ' + r + ' = ?', answer: q * r };
  }
  var t5 = pick(['kuadrat', 'akar', 'pola-aritmetika', 'pola-geometri', 'linear-negatif']);
  if (t5 === 'kuadrat') { var sq = rnd(11, 25); return { text: sq + '\u00B2 = ?', answer: sq * sq }; }
  if (t5 === 'akar') { var rt = rnd(6, 20); return { text: '\u221A' + (rt * rt) + ' = ?', answer: rt }; }
  if (t5 === 'pola-aritmetika') { var aw = rnd(2, 15), bd = rnd(3, 12); return { text: [aw, aw+bd, aw+2*bd, aw+3*bd].join(', ') + ', ?', answer: aw + 4*bd }; }
  if (t5 === 'pola-geometri') { var ml = rnd(2, 5), rs = rnd(2, 3); return { text: [ml, ml*rs, ml*rs*rs, ml*Math.pow(rs, 3)].join(', ') + ', ?', answer: ml * Math.pow(rs, 4) }; }
  var neg_x = rnd(-12, -2), neg_c = rnd(3, 9), neg_d = rnd(5, 30); return { text: neg_c + 'x - ' + neg_d + ' = ' + (neg_c * neg_x - neg_d) + '  ,  x = ?', answer: neg_x };
}

function renderHUD() {
  setText(el.p1Score, state.p1.score); setText(el.p1Ht, state.p1.blocks); setText(el.p1Combo, 'x' + state.p1.combo);
  setText(el.p2Score, state.p2.score); setText(el.p2Ht, state.p2.blocks); setText(el.p2Combo, 'x' + state.p2.combo);
  if (byId('p1-level')) byId('p1-level').textContent = state.p1.level + '/' + MAX_LEVEL;
  if (byId('p2-level')) byId('p2-level').textContent = state.p2.level + '/' + MAX_LEVEL;
  
  // BUG FIXED: Tampilkan HUD Badge Top sesuai level si Player secara personal
  var myLevel = state[state.playerRole].level;
  if (myLevel <= MAX_LEVEL) {
     setText(el.levelDisplay, 'LEVEL ' + myLevel + '/' + MAX_LEVEL);
  }
}

function createBlock(index, who) { var b = document.createElement('div'); b.className = BLOCK_CLASS + ' ' + who + '-block'; b.textContent = index; return b; }
function syncTower(towerEl, count, who) {
  if (!towerEl) return;
  while (towerEl.children.length > count) towerEl.removeChild(towerEl.lastChild);
  while (towerEl.children.length < count) towerEl.appendChild(createBlock(towerEl.children.length + 1, who));
}
function renderTowers() { syncTower(el.p1Tower, state.p1.blocks, 'p1'); syncTower(el.p2Tower, state.p2.blocks, 'p2'); }

function renderTurn() {
  if (!el.turnDisplay) return;
  var role = (state.gameMode === 'pvp') ? state.playerRole : 'p1';
  var streakInfo = ' \u00B7 🔥 ' + state[role].streak + '/' + STREAK_TARGET;
  if (!state.running) { el.turnDisplay.textContent = (role === 'p1' ? 'PLAYER 1' : 'PLAYER 2') + '\u2019s TURN'; return; }
  el.turnDisplay.textContent = (role === 'p1' ? 'PLAYER 1' : 'PLAYER 2') + '\u2019s TURN \u00B7 ⏱ ' + state.timeLeft + 's' + streakInfo;
}

function applyLevelBackground(level) { 
  if (level > MAX_LEVEL) return;
  for (var i = 1; i <= MAX_LEVEL; i++) document.body.classList.remove('level-' + i); 
  document.body.classList.add('level-' + level); 
}

function burst(targetEl, emoji, count) {
  if (!el.particles || !targetEl) return;
  var r = targetEl.getBoundingClientRect();
  for (var i = 0; i < count; i++) {
    var p = document.createElement('span'); p.textContent = emoji; p.style.position = 'absolute';
    p.style.left = (r.left + r.width / 2) + 'px'; p.style.top = (r.top + r.height / 2) + 'px';
    p.style.fontSize = rnd(14, 26) + 'px'; p.style.pointerEvents = 'none'; el.particles.appendChild(p);
    var dx = rnd(-110, 110), dy = rnd(-170, -50);
    if (typeof p.animate === 'function') {
      var anim = p.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.4)', opacity: 0 }], { duration: rnd(600, 1000), easing: 'ease-out' });
      anim.onfinish = (function (node) { return function () { if (node.parentNode) node.parentNode.removeChild(node); }; })(p);
    }
  }
}

function flashQuestionBox(mode) { if (!el.questionBox) return; el.questionBox.classList.remove('ok', 'bad'); if (mode) el.questionBox.classList.add(mode); }
function hopRobot(robotEl) { if (!robotEl || typeof robotEl.animate !== 'function') return; robotEl.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-14px)' }, { transform: 'translateY(0)' }], { duration: 320, easing: 'ease-out' }); }

var comboBannerTimer = null;
function showBanner(atasText, bawahText, durasi) {
  if (!el.comboBanner) return;
  setText(el.comboBannerTop, atasText); setText(el.comboBannerText, bawahText); el.comboBanner.classList.add('show');
  if (comboBannerTimer) clearTimeout(comboBannerTimer);
  comboBannerTimer = setTimeout(function () { el.comboBanner.classList.remove('show'); }, durasi || 1200);
}
function hideBanner() { if (comboBannerTimer) clearTimeout(comboBannerTimer); if (el.comboBanner) el.comboBanner.classList.remove('show'); }
function flashComboBanner(combo) { showBanner('MULTIPLIER!', 'COMBO x' + combo, 1200); }
function showStreakEffect(who) { showBanner('🔥 STREAK!', STREAK_TARGET + 'x STREAK! +' + STREAK_BONUS + ' BLOCK', 1600); var robot = (who === 'p1') ? el.p1Robot : el.p2Robot; if (robot) burst(robot, '🔥', 14); soundStreak(); }

var soundOn = true, audioCtx = null;
function beep(freq, duration, type) {
  if (!soundOn) return;
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx(); if (audioCtx.state === 'suspended') audioCtx.resume();
    var osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = type || 'square'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}
function soundCorrect() { beep(880, 0.12); setTimeout(function () { beep(1320, 0.12); }, 90); }
function soundWrong() { beep(160, 0.25, 'sawtooth'); }
function soundWin() { beep(660, 0.12); setTimeout(function () { beep(880, 0.12); }, 110); setTimeout(function () { beep(1320, 0.2); }, 230); }
function soundStreak() { beep(740, 0.1); setTimeout(function () { beep(990, 0.1); }, 80); setTimeout(function () { beep(1480, 0.18); }, 160); }


/* BUG FIXED: Pisahkan Logika Kenaikan Level Masing-Masing Pemain */
function checkLevelUp(who) {
  var p = state[who];
  if (p.blocks >= TARGET_BLOCKS) {
    p.level++;
    p.blocks = 0;
    p.combo = 1;
    p.streak = 0;
    
    if (p.level > MAX_LEVEL) {
      endGame(who); // Mengakhiri permainan jika sudah menyelesaikan seluruh level
    } else {
      if (who === state.playerRole) {
        showBanner('LEVEL UP!', 'Selamat datang di Level ' + p.level, 2000);
        applyLevelBackground(p.level); // Hanya mengganti background player yang naik level
      }
    }
  }
}

function addStreak(who) {
  var p = state[who]; p.streak += 1;
  if (p.streak >= STREAK_TARGET) {
    p.streak = 0; p.blocks = Math.min(p.blocks + STREAK_BONUS, TARGET_BLOCKS);
    checkLevelUp(who);
    if (who === state.playerRole) showStreakEffect(who); 
    renderHUD(); renderTowers(); renderTurn(); return true;
  }
  renderTurn(); return false;
}

function resetStreak(who) { state[who].streak = 0; renderTurn(); }

function handleCorrect(who) {
  var p = state[who]; var gained = BASE_SCORE * p.combo;
  p.score += gained; p.blocks = Math.min(p.blocks + 1, TARGET_BLOCKS); p.combo = Math.min(p.combo + 1, MAX_COMBO);
  checkLevelUp(who);
  renderHUD(); renderTowers();
  var robot = (who === 'p1') ? el.p1Robot : el.p2Robot; hopRobot(robot); burst(robot, '⭐', 7);
  if (p.combo >= 3 && who === state.playerRole) flashComboBanner(p.combo); return gained;
}

function handleWrong(who) { state[who].combo = 1; renderHUD(); }

function pushGameStateToFirebase() {
  if (!db || state.gameMode !== 'pvp') return;
  var updates = {}; updates[state.playerRole] = state[state.playerRole];
  db.ref('rooms/' + state.roomCode).update(updates);
}

function nextQuestion() {
  if (!state.running) return;
  // BUG FIXED: Soal dipanggil sesuai dengan tingkat level player P1/P2 saat ini 
  state.question = makeQuestion(state[state.playerRole].level); 
  state.answered = false;
  setText(el.questionBox, state.question.text); flashQuestionBox(null);
  if (el.answerInput) { el.answerInput.disabled = false; el.answerInput.value = ''; el.answerInput.focus(); }
  if (el.submitBtn) el.submitBtn.disabled = false; startTimer();
}

function scheduleNextQuestion() {
  if (nextQTimer) clearTimeout(nextQTimer);
  nextQTimer = setTimeout(function () { nextQTimer = null; nextQuestion(); }, FEEDBACK_DELAY);
}

function lockInput() { if (el.answerInput) el.answerInput.disabled = true; if (el.submitBtn) el.submitBtn.disabled = true; }

function submitAnswer() {
  if (!state.running || state.answered || !el.answerInput) return;
  var raw = el.answerInput.value.trim();
  if (raw === '') { setText(el.questionBox, '✏️ Isi jawabanmu dulu!'); setTimeout(function () { if (state.running && !state.answered && state.question) setText(el.questionBox, state.question.text); }, 700); return; }
  var value = parseInt(raw, 10);
  if (isNaN(value)) { setText(el.questionBox, '✏️ Masukkan angka, ya!'); setTimeout(function () { if (state.running && !state.answered && state.question) setText(el.questionBox, state.question.text); }, 700); return; }

  state.answered = true; stopTimer(); lockInput();
  var role = state.playerRole;
  setText(role === 'p1' ? el.p1Bubble : el.p2Bubble, value);

  if (value === state.question.answer) {
    var gained = handleCorrect(role); var dapatBonus = addStreak(role);
    if (state.gameMode === 'pvp') pushGameStateToFirebase();
    if (dapatBonus) setText(el.questionBox, '🔥 STREAK x' + STREAK_TARGET + '! +' + STREAK_BONUS + ' BALOK (+' + gained + ')');
    else setText(el.questionBox, '✅ BENAR! +' + gained);
    flashQuestionBox('ok'); soundCorrect();
  } else {
    handleWrong(role); resetStreak(role);
    if (state.gameMode === 'pvp') pushGameStateToFirebase();
    setText(el.questionBox, '❌ SALAH! Jawaban: ' + state.question.answer); flashQuestionBox('bad'); soundWrong();
  }

  // BUG FIXED: Pastikan game tidak stuck di soal lama ketika salah jawab. Panggil soal baru secepatnya.
  if (state.running) scheduleNextQuestion(); 
}

function scheduleBot() {
  if (!state.running || state.gameMode !== 'pve') return;
  var cfg = LEVEL_CONFIG[state.p2.level]; // Bot punya timer sendiri sesuai levelnya
  botTimer = setTimeout(botTurn, rnd(cfg.botMin, cfg.botMax));
}

function botTurn() {
  botTimer = null;
  if (!state.running || state.gameMode !== 'pve') return;
  
  var cfg = LEVEL_CONFIG[state.p2.level]; var q = makeQuestion(state.p2.level); var benar = Math.random() < cfg.botAcc;

  if (benar) {
    setText(el.p2Bubble, q.answer); handleCorrect('p2'); addStreak('p2');
  } else {
    var meleset = q.answer + pick([-3, -2, -1, 1, 2, 3]);
    setText(el.p2Bubble, meleset); handleWrong('p2'); resetStreak('p2');
    if (el.p2Card && typeof el.p2Card.animate === 'function') {
      el.p2Card.animate([{ transform: 'translateX(-5px)', borderColor: '#ff0000' }, { transform: 'translateX(5px)', borderColor: '#ff0000' }, { transform: 'translateX(0)', borderColor: '#ff5a5a' }], { duration: 300 });
    }
  }
  
  if (state.running) scheduleBot();
}

function startTimer() { 
  stopTimer(); 
  state.timeLeft = LEVEL_CONFIG[state[state.playerRole].level].time; 
  renderTurn(); 
  tickTimer = setInterval(function () { 
    state.timeLeft -= 1; renderTurn(); 
    if (state.timeLeft <= 0) timeUp(); 
  }, 1000); 
}

function stopTimer() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }

function timeUp() {
  stopTimer();
  if (!state.running || state.answered) return;
  state.answered = true; lockInput();
  var role = state.playerRole;
  handleWrong(role); resetStreak(role);
  if (state.gameMode === 'pvp') pushGameStateToFirebase();
  setText(el.questionBox, '⏰ WAKTU HABIS! Jawaban: ' + state.question.answer); flashQuestionBox('bad'); setText(role === 'p1' ? el.p1Bubble : el.p2Bubble, '—'); soundWrong();
  
  // BUG FIXED: Jangan diam saja jika waktu habis. Lanjutkan game.
  if (state.running) scheduleNextQuestion();
}

function endGame(winner) {
  if (!state.running) return;
  state.running = false; clearAllTimers(); lockInput();
  if (el.turnDisplay) el.turnDisplay.textContent = 'GAME OVER';
  hideBanner(); flashQuestionBox(null); state.raceWinner = winner;

  var imWinner = (state.playerRole === winner);

  if (imWinner) {
    soundWin(); var robot = (state.playerRole === 'p1' ? el.p1Robot : el.p2Robot); if (robot) burst(robot, '🎉', 14);
    if (el.modalCard) el.modalCard.classList.remove('lose');
    setText(el.winTitle, '🏆 GAME COMPLETE! 🏆'); 
    setText(el.winSubtitle, 'Kamu berhasil mencapai Level 5 lebih dulu! Skor: ' + state[state.playerRole].score); 
    setText(el.nextLevelBtn, 'MAIN LAGI 🔄');
  } else {
    soundWrong(); if (el.modalCard) el.modalCard.classList.add('lose'); 
    setText(el.winTitle, '😵 YOU LOSE!'); 
    setText(el.winSubtitle, 'Lawan mencapai Level 5 lebih dulu. Skormu: ' + state[state.playerRole].score); 
    setText(el.nextLevelBtn, 'MAIN LAGI 🔄');
  }
  showEl(el.winModal);
}

function startGame(isGuestSync) {
  clearAllTimers(); state.running = true; state.answered = true;
  if (!isGuestSync) { state.p1 = newPlayerState(); state.p2 = newPlayerState(); }
  if (el.p1Tower) el.p1Tower.innerHTML = ''; if (el.p2Tower) el.p2Tower.innerHTML = ''; setText(el.p1Bubble, ''); setText(el.p2Bubble, ''); if (el.answerInput) el.answerInput.value = '';
  hideEl(el.winModal); hideBanner(); flashQuestionBox(null); if (el.modalCard) el.modalCard.classList.remove('lose');
  
  applyLevelBackground(state[state.playerRole].level); 
  renderHUD(); renderTowers(); renderTurn();

  if (state.gameMode === 'pve') { 
    setText(el.p2Name, 'PLAYER 2 (BOT)'); 
    nextQuestion(); scheduleBot(); 
  } else { 
    setText(el.p2Name, state.playerRole === 'p1' ? 'PLAYER 2 (GUEST)' : 'PLAYER 1 (HOST)'); 
  }
}

function handleNextLevel() {
  hideEl(el.winModal);
  if (state.gameMode === 'pvp') {
    if (state.playerRole === 'p1' && db) {
      db.ref('rooms/' + state.roomCode).update({ p1: newPlayerState(), p2: newPlayerState() });
      startGame(false); nextQuestion();
    } else {
      el.turnDisplay.textContent = 'Menunggu Host Restart...';
    }
  } else {
    startGame(false); nextQuestion();
  }
}

function listenToRoom(code) {
  if (!db) return;
  db.ref('rooms/' + code).on('value', snap => {
    var data = snap.val(); if (!data) return;
    
    // Hanya perbarui state lawan secara realtime (supaya menaranya bertambah)
    if (state.playerRole === 'p1') {
       if (data.p2) state.p2 = data.p2;
    } else {
       if (data.p1) state.p1 = data.p1;
       // Pemicu Guest saat ditekan 'Main Lagi' oleh Host
       if (data.status === 'playing' && !state.running && data.p1 && data.p1.level === 1 && data.p2 && data.p2.level === 1) {
           hideEl(el.startScreen); startGame(true); nextQuestion();
       }
    }
    
    renderHUD(); renderTowers();
    
    if (state.running) {
       if (state.p1.level > MAX_LEVEL) endGame('p1');
       else if (state.p2.level > MAX_LEVEL) endGame('p2');
    }
  });
}

function bindEvents() {
  if (el.startBtn) { el.startBtn.addEventListener('click', function () { state.gameMode = 'pve'; state.playerRole = 'p1'; hideEl(el.startScreen); startGame(false); nextQuestion(); }); }
  if (el.humanModeBtn) { el.humanModeBtn.addEventListener('click', function () { hideEl(document.querySelector('.mode-buttons')); hideEl(document.querySelector('.mode-heading')); showEl(el.roomPanel); }); }
  
  if (el.createRoomBtn) {
    el.createRoomBtn.addEventListener('click', function () {
      if (!db || window.MTR_FIREBASE_CONFIG.apiKey === "MASUKKAN_API_KEY_KAMU_DISINI") { 
        el.roomMessage.innerHTML = "<span style='color:#ff5a5a;'>Koneksi Firebase gagal! Cek file firebase-config.js</span>"; return; 
      }
      el.roomMessage.innerHTML = "Membuat room...";
      try {
        var code = Math.random().toString(36).substring(2, 6).toUpperCase(); state.gameMode = 'pvp'; state.playerRole = 'p1'; state.roomCode = code;
        db.ref('rooms/' + code).set({ status: 'waiting', p1: newPlayerState(), p2: newPlayerState() }).then(() => {
          el.roomMessage.innerHTML = "Kode kamu: <b>" + code + "</b><br>Menunggu Player 2 bergabung...";
          db.ref('rooms/' + code + '/status').on('value', snap => { if (snap.val() === 'playing') { hideEl(el.startScreen); startGame(true); nextQuestion(); listenToRoom(code); } });
        }).catch(err => { el.roomMessage.innerHTML = "<span style='color:#ff5a5a;'>Gagal! Pastikan API Key di firebase-config.js sudah diganti.</span>"; });
      } catch (e) { el.roomMessage.innerHTML = "<span style='color:#ff5a5a;'>Terjadi error sistem.</span>"; }
    });
  }

  if (el.joinRoomBtn) {
    el.joinRoomBtn.addEventListener('click', function () {
      if (!db || window.MTR_FIREBASE_CONFIG.apiKey === "MASUKKAN_API_KEY_KAMU_DISINI") { el.roomMessage.innerHTML = "<span style='color:#ff5a5a;'>Koneksi Firebase gagal!</span>"; return; }
      var code = el.roomCodeInput.value.toUpperCase().trim();
      if (!code) { el.roomMessage.innerHTML = "<span style='color:#ff5a5a;'>Isi kode room terlebih dahulu!</span>"; return; }
      el.roomMessage.innerHTML = "Mencari room...";
      db.ref('rooms/' + code).once('value').then(snap => {
        if (snap.exists() && snap.val().status === 'waiting') {
          state.gameMode = 'pvp'; state.playerRole = 'p2'; state.roomCode = code; db.ref('rooms/' + code).update({ status: 'playing' });
          hideEl(el.startScreen); startGame(true); nextQuestion(); listenToRoom(code);
        } else { el.roomMessage.innerHTML = "<span style='color:#ff5a5a;'>Room tidak ditemukan atau sudah penuh!</span>"; }
      }).catch(err => { el.roomMessage.innerHTML = "<span style='color:#ff5a5a;'>Gagal mencari room. Cek API Key.</span>"; });
    });
  }

  if (el.submitBtn) { el.submitBtn.addEventListener('click', submitAnswer); }
  if (el.answerInput) { el.answerInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submitAnswer(); } }); }
  if (el.nextLevelBtn) { el.nextLevelBtn.addEventListener('click', handleNextLevel); }
  if (el.musicBtn) { el.musicBtn.addEventListener('click', function () { soundOn = !soundOn; el.musicBtn.textContent = soundOn ? '🎵 BGM: ON' : '🔇 BGM: OFF'; if (soundOn) beep(660, 0.1); }); }
}

function init() {
  cacheElements(); bindEvents(); state.running = false; lockInput(); showEl(el.startScreen); hideEl(el.winModal); hideBanner(); applyLevelBackground(1); renderHUD(); setText(el.questionBox, 'READY?'); renderTurn();
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }