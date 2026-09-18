/* =======================================================================
   MATH TOWER RACE - script.js
   Vanilla JavaScript, tanpa framework.

   Struktur file:
   1.  KONFIGURASI
   2.  AMBIL ELEMEN HTML
   3.  STATE GAME
   4.  HELPER UMUM
   5.  GENERATOR SOAL
   6.  RENDER / TAMPILAN
   7.  EFEK (partikel, suara, animasi)
   8.  LOGIKA JAWABAN
   9.  BOT
   10. TIMER
   11. LEVEL & MODAL
   12. EVENT LISTENER + INIT
   ======================================================================= */

'use strict';

/* =======================================================================
   1. KONFIGURASI
   Semua angka yang mungkin ingin kamu ubah ada di sini.
   ======================================================================= */

var TARGET_BLOCKS = 15;   // tinggi tower untuk menang
var MAX_LEVEL = 5;        // level terakhir
var BASE_SCORE = 100;     // skor dasar per jawaban benar
var MAX_COMBO = 5;        // combo maksimal (x5)
var POWER_MAX = 4;        // jumlah segmen power [####]
var FEEDBACK_DELAY = 900; // jeda (ms) sebelum soal berikutnya muncul

// Kalau CSS temanmu memakai nama class lain untuk balok tower,
// cukup ganti satu baris ini.
var BLOCK_CLASS = 'tower-block';

// Parameter per level.
// botMin/botMax = rentang waktu berpikir BOT (ms)
// botAcc        = peluang BOT menjawab benar (0-1)
// time          = waktu menjawab untuk Player 1 (detik)
var LEVEL_CONFIG = {
  1: { botMin: 6000, botMax: 8000, botAcc: 0.70, time: 15 },
  2: { botMin: 5000, botMax: 7000, botAcc: 0.75, time: 14 },
  3: { botMin: 4000, botMax: 6000, botAcc: 0.80, time: 13 },
  4: { botMin: 3000, botMax: 5000, botAcc: 0.85, time: 12 },
  5: { botMin: 2500, botMax: 4000, botAcc: 0.90, time: 10 }
};

/* =======================================================================
   2. AMBIL ELEMEN HTML
   Pakai fungsi byId() supaya kalau ada elemen yang tidak ketemu,
   kita hanya dapat peringatan di console, bukan error yang
   menghentikan seluruh game.
   ======================================================================= */

function byId(id) {
  var el = document.getElementById(id);
  if (!el) console.warn('[Math Tower Race] Elemen #' + id + ' tidak ditemukan di HTML.');
  return el;
}

var el = {};

function cacheElements() {
  el.startScreen   = byId('start-screen');
  el.startBtn      = byId('start-btn');

  el.winModal      = byId('win-modal');
  el.winTitle      = byId('win-title');
  el.winSubtitle   = byId('win-subtitle');
  el.nextLevelBtn  = byId('next-level-btn');

  el.levelDisplay  = byId('level-display');
  el.musicBtn      = byId('music-btn');

  el.questionBox   = byId('question-box');
  el.powerupBadge  = byId('powerup-badge');
  el.turnDisplay   = byId('turn-display');
  el.answerInput   = byId('answer-input');
  el.submitBtn     = byId('submit-btn');

  el.p1Score  = byId('p1-score');
  el.p1Ht     = byId('p1-ht');
  el.p1Combo  = byId('p1-combo');
  el.p1Power  = byId('p1-power');
  el.p1Tower  = byId('p1-tower');
  el.p1Robot  = byId('p1-robot');
  el.p1Bubble = byId('p1-bubble');

  el.p2Score  = byId('p2-score');
  el.p2Ht     = byId('p2-ht');
  el.p2Combo  = byId('p2-combo');
  el.p2Power  = byId('p2-power');
  el.p2Tower  = byId('p2-tower');
  el.p2Robot  = byId('p2-robot');
  el.p2Bubble = byId('p2-bubble');

  el.particles   = byId('particles-container');

  // Combo banner tidak punya id, jadi diambil lewat class.
  el.comboBanner = document.querySelector('.center-effects .combo-banner');
  el.comboBannerText = el.comboBanner
    ? el.comboBanner.querySelector('.combo-text')
    : null;
}

/* =======================================================================
   3. STATE GAME
   Semua data game disimpan di satu objek supaya mudah di-reset.
   ======================================================================= */

var state = {
  level: 1,
  running: false,       // true hanya saat gameplay berlangsung
  question: null,       // { text, answer } soal Player 1 saat ini
  answered: true,       // true = soal sekarang sudah dijawab (anti double submit)
  timeLeft: 0,
  p1: newPlayerState(),
  p2: newPlayerState()
};

function newPlayerState() {
  return {
    score: 0,      // akumulatif lintas level
    blocks: 0,     // tinggi tower level ini
    combo: 1,      // x1 .. x5
    power: 0,      // 0 .. POWER_MAX
    powerUses: 0   // angka xN di samping bar power
  };
}

// Penampung id timer supaya bisa dihentikan dengan pasti.
var tickTimer = null;     // countdown Player 1
var botTimer = null;      // jadwal jawaban BOT
var nextQTimer = null;    // jeda sebelum soal berikutnya

/* =======================================================================
   4. HELPER UMUM
   ======================================================================= */

function rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[rnd(0, arr.length - 1)];
}

function setText(node, value) {
  if (node) node.textContent = value;
}

// Menyembunyikan elemen: pakai class .hidden DAN inline style.
// Inline style dipakai supaya tetap bekerja walau CSS belum punya .hidden.
function hideEl(node) {
  if (!node) return;
  node.classList.add('hidden');
  node.style.display = 'none';
}

// Menampilkan elemen: hapus class .hidden dan kembalikan display
// ke nilai bawaan CSS (string kosong = "ikuti CSS").
function showEl(node) {
  if (!node) return;
  node.classList.remove('hidden');
  node.style.display = '';
}

// Hentikan semua timer yang sedang berjalan.
function clearAllTimers() {
  if (tickTimer)  { clearInterval(tickTimer); tickTimer = null; }
  if (botTimer)   { clearTimeout(botTimer);   botTimer = null; }
  if (nextQTimer) { clearTimeout(nextQTimer); nextQTimer = null; }
}

/* =======================================================================
   5. GENERATOR SOAL
   Semua soal dijamin berjawaban BILANGAN BULAT,
   supaya cocok dengan <input type="number">.
   ======================================================================= */

function makeQuestion(level) {
  if (level <= 1) return qLevel1();
  if (level === 2) return qLevel2();
  if (level === 3) return qLevel3();
  if (level === 4) return qLevel4();
  return qLevel5();
}

// LEVEL 1 - mudah: penjumlahan & pengurangan
function qLevel1() {
  if (Math.random() < 0.5) {
    var a = rnd(5, 40), b = rnd(5, 40);
    return { text: a + ' + ' + b + ' = ?', answer: a + b };
  }
  var c = rnd(20, 60), d = rnd(1, 19);
  return { text: c + ' - ' + d + ' = ?', answer: c - d };
}

// LEVEL 2 - mudah/menengah: perkalian & pembagian habis
function qLevel2() {
  var t = pick(['kali', 'bagi', 'campur']);
  if (t === 'kali') {
    var a = rnd(2, 12), b = rnd(2, 12);
    return { text: a + ' \u00D7 ' + b + ' = ?', answer: a * b };
  }
  if (t === 'bagi') {
    var pembagi = rnd(2, 12), hasil = rnd(2, 12);
    return { text: (pembagi * hasil) + ' \u00F7 ' + pembagi + ' = ?', answer: hasil };
  }
  var x = rnd(10, 50), y = rnd(10, 50), z = rnd(1, 20);
  return { text: x + ' + ' + y + ' - ' + z + ' = ?', answer: x + y - z };
}

// LEVEL 3 - menengah: operasi campuran (urutan operasi)
function qLevel3() {
  var t = pick(['kali-tambah', 'tambah-kali', 'kurung']);
  if (t === 'kali-tambah') {
    var a = rnd(3, 12), b = rnd(3, 12), c = rnd(5, 40);
    return { text: a + ' \u00D7 ' + b + ' + ' + c + ' = ?', answer: a * b + c };
  }
  if (t === 'tambah-kali') {
    var d = rnd(10, 60), e = rnd(2, 10), f = rnd(2, 10);
    return { text: d + ' + ' + e + ' \u00D7 ' + f + ' = ?', answer: d + e * f };
  }
  var g = rnd(2, 15), h = rnd(2, 15), i = rnd(2, 6);
  return { text: '(' + g + ' + ' + h + ') \u00D7 ' + i + ' = ?', answer: (g + h) * i };
}

// LEVEL 4 - menengah/sulit: persamaan linear, x selalu bulat
function qLevel4() {
  var t = pick(['linear', 'kurung', 'bagi-kali']);
  if (t === 'linear') {
    var x = rnd(2, 15), a = rnd(2, 9), b = rnd(1, 25);
    return { text: a + 'x + ' + b + ' = ' + (a * x + b) + '  ,  x = ?', answer: x };
  }
  if (t === 'kurung') {
    var x2 = rnd(2, 15), a2 = rnd(2, 8), b2 = rnd(1, 15);
    return { text: a2 + '(x + ' + b2 + ') = ' + (a2 * (x2 + b2)) + '  ,  x = ?', answer: x2 };
  }
  var p = rnd(2, 12), q = rnd(2, 12), r = rnd(2, 9);
  return { text: (p * q) + ' \u00F7 ' + p + ' \u00D7 ' + r + ' = ?', answer: q * r };
}

// LEVEL 5 - sulit: kuadrat, akar, pola bilangan, x bisa negatif
function qLevel5() {
  var t = pick(['kuadrat', 'akar', 'pola-aritmetika', 'pola-geometri', 'linear-negatif']);

  if (t === 'kuadrat') {
    var a = rnd(11, 25);
    return { text: a + '\u00B2 = ?', answer: a * a };
  }

  if (t === 'akar') {
    var b = rnd(6, 20);
    return { text: '\u221A' + (b * b) + ' = ?', answer: b };
  }

  if (t === 'pola-aritmetika') {
    var awal = rnd(2, 15), beda = rnd(3, 12);
    var deret = [awal, awal + beda, awal + 2 * beda, awal + 3 * beda];
    return {
      text: deret.join(', ') + ', ?',
      answer: awal + 4 * beda
    };
  }

  if (t === 'pola-geometri') {
    var mula = rnd(2, 5), rasio = rnd(2, 3);
    var g = [mula, mula * rasio, mula * rasio * rasio, mula * Math.pow(rasio, 3)];
    return {
      text: g.join(', ') + ', ?',
      answer: mula * Math.pow(rasio, 4)
    };
  }

  // 5x - 13 = -38  ->  x = -5
  var x = rnd(-12, -2), c = rnd(3, 9), d = rnd(5, 30);
  return { text: c + 'x - ' + d + ' = ' + (c * x - d) + '  ,  x = ?', answer: x };
}

/* =======================================================================
   6. RENDER / TAMPILAN
   ======================================================================= */

// Membuat teks bar power, contoh: "[##--] x1"
function powerText(p) {
  var bar = '';
  for (var i = 0; i < POWER_MAX; i++) bar += (i < p.power) ? '#' : '-';
  return '[' + bar + '] x' + p.powerUses;
}

function renderHUD() {
  setText(el.p1Score, state.p1.score);
  setText(el.p1Ht,    state.p1.blocks);
  setText(el.p1Combo, 'x' + state.p1.combo);
  setText(el.p1Power, powerText(state.p1));

  setText(el.p2Score, state.p2.score);
  setText(el.p2Ht,    state.p2.blocks);
  setText(el.p2Combo, 'x' + state.p2.combo);
  setText(el.p2Power, powerText(state.p2));
}

// Kalau CSS belum punya aturan untuk balok, balok akan setinggi 0px
// dan tidak terlihat. Fungsi ini mendeteksi hal itu sekali saja,
// lalu memakai style cadangan agar game tetap bisa dimainkan.
var blockStyleChecked = false;
var needInlineBlock = false;

function createBlock(index, who) {
  var b = document.createElement('div');
  b.className = BLOCK_CLASS + ' ' + who + '-block';
  b.textContent = index;
  if (needInlineBlock) applyFallbackBlockStyle(b, who);
  return b;
}

function applyFallbackBlockStyle(b, who) {
  b.style.width = '70px';
  b.style.height = '22px';
  b.style.margin = '2px auto';
  b.style.border = '3px solid #000';
  b.style.boxSizing = 'border-box';
  b.style.display = 'flex';
  b.style.alignItems = 'center';
  b.style.justifyContent = 'center';
  b.style.fontSize = '10px';
  b.style.color = '#000';
  b.style.background = (who === 'p1') ? '#f1c40f' : '#e74c3c';
}

// Menyamakan jumlah balok di layar dengan jumlah balok di state.
function syncTower(towerEl, count, who) {
  if (!towerEl) return;

  while (towerEl.children.length > count) {
    towerEl.removeChild(towerEl.lastChild);
  }
  while (towerEl.children.length < count) {
    var idx = towerEl.children.length + 1;
    var block = createBlock(idx, who);
    towerEl.appendChild(block);

    // Cek sekali: apakah CSS sudah memberi ukuran pada balok?
    if (!blockStyleChecked) {
      blockStyleChecked = true;
      var h = window.getComputedStyle(block).height;
      if (h === '0px' || h === 'auto') {
        needInlineBlock = true;
        applyFallbackBlockStyle(block, who);
        console.info('[Math Tower Race] CSS untuk .' + BLOCK_CLASS +
                     ' belum ada, memakai style cadangan dari JS.');
      }
    }
  }
}

function renderTowers() {
  syncTower(el.p1Tower, state.p1.blocks, 'p1');
  syncTower(el.p2Tower, state.p2.blocks, 'p2');
}

function renderTurn() {
  if (!el.turnDisplay) return;
  if (!state.running) {
    el.turnDisplay.textContent = 'PLAYER 1\u2019s TURN';
    return;
  }
  el.turnDisplay.textContent = 'PLAYER 1\u2019s TURN \u00B7 \u23F1 ' + state.timeLeft + 's';
}

function renderLevel() {
  setText(el.levelDisplay, 'LEVEL ' + state.level + '/' + MAX_LEVEL);
}

// Background per level: class .level-1 .. .level-5 dipasang di <body>.
// Dipasang di body (bukan di .game-container) karena CSS memakai
// selector #game-container sementara HTML memakai class.
function applyLevelBackground(level) {
  for (var i = 1; i <= MAX_LEVEL; i++) {
    document.body.classList.remove('level-' + i);
  }
  document.body.classList.add('level-' + level);
}

/* =======================================================================
   7. EFEK: partikel, suara, animasi kecil
   ======================================================================= */

// Siapkan layer partikel. Hanya diatur lewat JS kalau CSS belum
// memposisikannya (position masih static).
function setupParticleLayer() {
  if (!el.particles) return;
  var pos = window.getComputedStyle(el.particles).position;
  if (pos === 'static') {
    var s = el.particles.style;
    s.position = 'fixed';
    s.left = '0';
    s.top = '0';
    s.width = '100%';
    s.height = '100%';
    s.pointerEvents = 'none';
    s.overflow = 'hidden';
    s.zIndex = '90';
  }
}

// Ledakan partikel kecil di sekitar sebuah elemen.
function burst(targetEl, emoji, count) {
  if (!el.particles || !targetEl) return;
  if (el.particles.children.length > 60) return; // jaga agar tidak berat

  var r = targetEl.getBoundingClientRect();
  for (var i = 0; i < count; i++) {
    var p = document.createElement('span');
    p.textContent = emoji;
    p.style.position = 'absolute';
    p.style.left = (r.left + r.width / 2) + 'px';
    p.style.top = (r.top + r.height / 2) + 'px';
    p.style.fontSize = rnd(14, 26) + 'px';
    p.style.pointerEvents = 'none';
    el.particles.appendChild(p);

    var dx = rnd(-110, 110);
    var dy = rnd(-170, -50);

    if (typeof p.animate === 'function') {
      var anim = p.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.4)', opacity: 0 }
      ], { duration: rnd(600, 1000), easing: 'ease-out' });
      anim.onfinish = (function (node) {
        return function () { if (node.parentNode) node.parentNode.removeChild(node); };
      })(p);
    } else {
      (function (node) {
        setTimeout(function () {
          if (node.parentNode) node.parentNode.removeChild(node);
        }, 800);
      })(p);
    }
  }
}

// Lompatan kecil robot saat berhasil menambah balok.
function hopRobot(robotEl) {
  if (!robotEl || typeof robotEl.animate !== 'function') return;
  robotEl.animate([
    { transform: 'translateY(0)' },
    { transform: 'translateY(-14px)' },
    { transform: 'translateY(0)' }
  ], { duration: 320, easing: 'ease-out' });
}

// Banner combo muncul sebentar saat combo tinggi.
var comboBannerTimer = null;

function flashComboBanner(combo) {
  if (!el.comboBanner) return;
  setText(el.comboBannerText, 'COMBO x' + combo);
  el.comboBanner.style.opacity = '1';
  if (comboBannerTimer) clearTimeout(comboBannerTimer);
  comboBannerTimer = setTimeout(function () {
    el.comboBanner.style.opacity = '0';
  }, 1200);
}

/* --- Suara sederhana (Web Audio API, tanpa file audio) --- */
var soundOn = true;
var audioCtx = null;

function beep(freq, duration, type) {
  if (!soundOn) return;
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    // Kalau browser menolak, game tetap jalan tanpa suara.
  }
}

function soundCorrect() { beep(880, 0.12); setTimeout(function () { beep(1320, 0.12); }, 90); }
function soundWrong()   { beep(160, 0.25, 'sawtooth'); }
function soundWin()     { beep(660, 0.12); setTimeout(function () { beep(880, 0.12); }, 110);
                          setTimeout(function () { beep(1320, 0.2); }, 230); }

/* =======================================================================
   8. LOGIKA JAWABAN
   ======================================================================= */

// Apakah soal berikutnya untuk pemain ini adalah Power-Up Question?
function isPowerReady(p) {
  return p.power >= POWER_MAX;
}

// Dipanggil saat seorang pemain menjawab BENAR.
function handleCorrect(who) {
  var p = state[who];
  var powered = isPowerReady(p);

  // skor dihitung dengan combo saat ini, baru combo dinaikkan
  var gained = BASE_SCORE * p.combo * (powered ? 2 : 1);
  p.score += gained;

  // tambah balok, tidak pernah melebihi 15
  var add = powered ? 2 : 1;
  p.blocks = Math.min(p.blocks + add, TARGET_BLOCKS);

  // combo naik sampai maksimal
  p.combo = Math.min(p.combo + 1, MAX_COMBO);

  // power: kalau dipakai -> reset, kalau belum -> isi
  if (powered) {
    p.power = 0;
    p.powerUses += 1;
  } else {
    p.power = Math.min(p.power + 1, POWER_MAX);
  }

  renderHUD();
  renderTowers();

  var robot = (who === 'p1') ? el.p1Robot : el.p2Robot;
  hopRobot(robot);
  burst(robot, powered ? '\u26A1' : '\u2B50', powered ? 12 : 7);
  if (p.combo >= 3) flashComboBanner(p.combo);

  return gained;
}

// Dipanggil saat seorang pemain menjawab SALAH atau kehabisan waktu.
function handleWrong(who) {
  var p = state[who];
  p.combo = 1;          // combo reset
  if (isPowerReady(p)) p.power = 0;  // kesempatan power-up hangus
  renderHUD();
}

// Membuat dan menampilkan soal baru untuk Player 1.
function nextQuestion() {
  if (!state.running) return;

  state.question = makeQuestion(state.level);
  state.answered = false;

  setText(el.questionBox, state.question.text);

  // Badge power-up hanya untuk Player 1
  if (isPowerReady(state.p1)) showEl(el.powerupBadge);
  else hideEl(el.powerupBadge);

  if (el.answerInput) {
    el.answerInput.disabled = false;
    el.answerInput.value = '';
    el.answerInput.focus();
  }
  if (el.submitBtn) el.submitBtn.disabled = false;

  startTimer();
}

// Menyiapkan soal berikutnya setelah jeda feedback.
function scheduleNextQuestion() {
  if (nextQTimer) clearTimeout(nextQTimer);
  nextQTimer = setTimeout(function () {
    nextQTimer = null;
    nextQuestion();
  }, FEEDBACK_DELAY);
}

// Mengunci input selama jeda feedback (anti kirim jawaban berkali-kali).
function lockInput() {
  if (el.answerInput) el.answerInput.disabled = true;
  if (el.submitBtn) el.submitBtn.disabled = true;
}

// Dipanggil saat tombol Jawab ditekan atau Enter.
function submitAnswer() {
  if (!state.running) return;
  if (state.answered) return;        // soal ini sudah dijawab
  if (!el.answerInput) return;

  var raw = el.answerInput.value.trim();

  // Input kosong TIDAK dihitung salah, hanya diberi peringatan.
  if (raw === '') {
    setText(el.questionBox, '\u270F Isi jawabanmu dulu!');
    setTimeout(function () {
      if (state.running && !state.answered && state.question) {
        setText(el.questionBox, state.question.text);
      }
    }, 700);
    return;
  }

  var value = parseInt(raw, 10);
  if (isNaN(value)) {
    setText(el.questionBox, '\u270F Masukkan angka, ya!');
    setTimeout(function () {
      if (state.running && !state.answered && state.question) {
        setText(el.questionBox, state.question.text);
      }
    }, 700);
    return;
  }

  state.answered = true;
  stopTimer();
  lockInput();
  setText(el.p1Bubble, value);

  if (value === state.question.answer) {
    var gained = handleCorrect('p1');
    setText(el.questionBox, '\u2705 BENAR! +' + gained);
    soundCorrect();
  } else {
    handleWrong('p1');
    setText(el.questionBox, '\u274C SALAH! Jawaban: ' + state.question.answer);
    soundWrong();
  }

  hideEl(el.powerupBadge);

  if (checkWin()) return;
  scheduleNextQuestion();
}

/* =======================================================================
   9. BOT
   BOT berjalan paralel dengan Player 1 (sistem simultan).
   Setiap "ronde", BOT berpikir selama botMin..botMax milidetik,
   lalu menjawab benar dengan peluang botAcc.
   ======================================================================= */

function scheduleBot() {
  if (!state.running) return;
  var cfg = LEVEL_CONFIG[state.level];
  var delay = rnd(cfg.botMin, cfg.botMax);
  botTimer = setTimeout(botTurn, delay);
}

function botTurn() {
  botTimer = null;
  if (!state.running) return;

  var cfg = LEVEL_CONFIG[state.level];
  var q = makeQuestion(state.level);     // soal versi BOT
  var benar = Math.random() < cfg.botAcc;

  if (benar) {
    setText(el.p2Bubble, q.answer);
    handleCorrect('p2');
  } else {
    // jawaban meleset sedikit, supaya terlihat seperti salah hitung
    var meleset = q.answer + pick([-3, -2, -1, 1, 2, 3]);
    setText(el.p2Bubble, meleset);
    handleWrong('p2');
  }

  if (checkWin()) return;
  scheduleBot();
}

/* =======================================================================
   10. TIMER
   ======================================================================= */

function startTimer() {
  stopTimer();
  state.timeLeft = LEVEL_CONFIG[state.level].time;
  renderTurn();
  tickTimer = setInterval(function () {
    state.timeLeft -= 1;
    renderTurn();
    if (state.timeLeft <= 0) timeUp();
  }, 1000);
}

function stopTimer() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}

function timeUp() {
  stopTimer();
  if (!state.running || state.answered) return;

  state.answered = true;
  lockInput();
  handleWrong('p1');
  setText(el.questionBox, '\u23F0 WAKTU HABIS! Jawaban: ' + state.question.answer);
  setText(el.p1Bubble, '\u2014');
  soundWrong();
  hideEl(el.powerupBadge);

  if (checkWin()) return;
  scheduleNextQuestion();
}

/* =======================================================================
   11. LEVEL & MODAL
   ======================================================================= */

// Mengecek apakah ada yang sudah mencapai 15 balok.
// Mengembalikan true kalau level sudah selesai.
function checkWin() {
  if (state.p1.blocks >= TARGET_BLOCKS) { endLevel('p1'); return true; }
  if (state.p2.blocks >= TARGET_BLOCKS) { endLevel('p2'); return true; }
  return false;
}

function endLevel(winner) {
  state.running = false;     // ini menghentikan BOT & timer secara logis
  clearAllTimers();          // dan ini menghentikannya secara nyata
  lockInput();
  hideEl(el.powerupBadge);
  if (el.turnDisplay) el.turnDisplay.textContent = 'ROUND OVER';

  if (winner === 'p1') {
    soundWin();
    if (el.p1Robot) burst(el.p1Robot, '\uD83C\uDF89', 14);

    if (state.level >= MAX_LEVEL) {
      // Level 5 selesai -> game tamat, tidak ada level 6.
      setText(el.winTitle, '\uD83C\uDFC6 GAME COMPLETE! \uD83C\uDFC6');
      setText(el.winSubtitle,
        'Kamu menyelesaikan seluruh 5 level! Skor akhir: ' + state.p1.score +
        ' (BOT: ' + state.p2.score + ')');
      setText(el.nextLevelBtn, 'MAIN LAGI DARI LEVEL 1 \uD83D\uDD04');
    } else {
      setText(el.winTitle, '\uD83C\uDF89 LEVEL PASSED! \uD83C\uDF89');
      setText(el.winSubtitle,
        'Skor: ' + state.p1.score + ' \u00B7 Komputer akan bergerak lebih cepat di level berikutnya!');
      setText(el.nextLevelBtn, 'LANJUT LEVEL ' + (state.level + 1) + ' \u279C');
    }
  } else {
    soundWrong();
    setText(el.winTitle, '\uD83D\uDE35 LEVEL GAGAL!');
    setText(el.winSubtitle,
      'Menara BOT sampai 15 duluan. Skormu tetap disimpan: ' + state.p1.score);
    setText(el.nextLevelBtn, 'ULANGI LEVEL ' + state.level + ' \uD83D\uDD04');
  }

  showEl(el.winModal);
}

// Menyiapkan ulang satu level (tower, combo, power, timer, input).
// Skor TIDAK di-reset karena sistemnya akumulatif.
function startLevel(level) {
  clearAllTimers();

  state.level = Math.min(Math.max(level, 1), MAX_LEVEL);
  state.running = true;
  state.answered = true;
  state.question = null;

  state.p1.blocks = 0; state.p1.combo = 1; state.p1.power = 0;
  state.p2.blocks = 0; state.p2.combo = 1; state.p2.power = 0;

  if (el.p1Tower) el.p1Tower.innerHTML = '';
  if (el.p2Tower) el.p2Tower.innerHTML = '';
  setText(el.p1Bubble, '?');
  setText(el.p2Bubble, '?');
  if (el.answerInput) el.answerInput.value = '';

  hideEl(el.winModal);
  hideEl(el.powerupBadge);
  if (el.comboBanner) el.comboBanner.style.opacity = '0';

  applyLevelBackground(state.level);
  renderLevel();
  renderHUD();
  renderTowers();
  renderTurn();

  nextQuestion();
  scheduleBot();
}

// Tombol di modal: lanjut / ulangi / main lagi dari awal.
function handleNextLevel() {
  hideEl(el.winModal);

  var p1Menang = state.p1.blocks >= TARGET_BLOCKS;

  if (p1Menang && state.level >= MAX_LEVEL) {
    // Game tamat -> mulai lagi dari nol.
    state.p1 = newPlayerState();
    state.p2 = newPlayerState();
    startLevel(1);
    return;
  }

  if (p1Menang) startLevel(state.level + 1);  // naik level
  else startLevel(state.level);               // ulangi level yang sama
}

/* =======================================================================
   12. EVENT LISTENER + INIT
   Semua listener dipasang SATU KALI di sini, supaya tidak
   pernah terdaftar berkali-kali.
   ======================================================================= */

function bindEvents() {
  if (el.startBtn) {
    el.startBtn.addEventListener('click', function () {
      hideEl(el.startScreen);
      state.p1 = newPlayerState();
      state.p2 = newPlayerState();
      startLevel(1);
    });
  }

  if (el.submitBtn) {
    el.submitBtn.addEventListener('click', submitAnswer);
  }

  if (el.answerInput) {
    el.answerInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitAnswer();
      }
    });
  }

  if (el.nextLevelBtn) {
    el.nextLevelBtn.addEventListener('click', handleNextLevel);
  }

  if (el.musicBtn) {
    el.musicBtn.addEventListener('click', function () {
      soundOn = !soundOn;
      el.musicBtn.textContent = soundOn ? '\uD83C\uDFB5 BGM: ON' : '\uD83D\uDD07 BGM: OFF';
      if (soundOn) beep(660, 0.1);
    });
  }
}

function init() {
  cacheElements();
  setupParticleLayer();
  bindEvents();

  // Kondisi awal: game belum jalan, input mati, start screen tampil.
  state.running = false;
  lockInput();
  showEl(el.startScreen);
  hideEl(el.winModal);
  hideEl(el.powerupBadge);
  if (el.comboBanner) el.comboBanner.style.opacity = '0';

  applyLevelBackground(1);
  renderLevel();
  renderHUD();
  setText(el.questionBox, 'READY?');
  renderTurn();
}

// Jalankan init setelah HTML selesai dimuat.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
