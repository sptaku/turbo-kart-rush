/* =========================================================================
 * main.js  ―  画面遷移・モード選択・グランプリ進行・リザルト
 * モード: gp(グランプリ 1人+CPU9) / time(タイムアタック) / vs(VS 1人 or 2人)
 * =======================================================================*/
(function () {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  game.resize();

  // ---- タッチ端末(スマホ等)判定 + 画面操作パネル ------------------------
  const isTouch = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  game.touch = isTouch;
  const touchControls = document.getElementById('touch-controls');
  const rotateHint = document.getElementById('tc-rotate');
  const shiftCol = document.getElementById('tc-shift');
  function showTouch(on) {
    if (!isTouch) return;
    touchControls.classList.toggle('show', on);
    rotateHint.classList.toggle('show', on);
    // ギア(シフト)ボタンは P1 がセミAT/MT のときだけ出す(ATは自動変速で不要)
    if (on && shiftCol) shiftCol.style.display = (transModes[0] !== 'auto') ? 'flex' : 'none';
  }
  if (isTouch) {
    const P1 = window.PLAYER_CONTROLS[0];
    const KEYMAP = { left: P1.left, right: P1.right, accel: P1.accel, brake: P1.brake, item: P1.item, drift: P1.drift,
      shiftUp: P1.shiftUp, shiftDown: P1.shiftDown };
    touchControls.querySelectorAll('.tc-btn').forEach((btn) => {
      const code = KEYMAP[btn.dataset.k];
      const down = (e) => {
        e.preventDefault(); btn.classList.add('on');
        audio.init(); audio.resume();
        if (window.input) window.input.vKey(code, true);
        try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      };
      const up = (e) => { if (e) e.preventDefault(); btn.classList.remove('on'); if (window.input) window.input.vKey(code, false); };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  // ---- 状態 --------------------------------------------------------------
  let mode = 'vs';       // 'gp' | 'time' | 'vs'
  let players = 1;       // 1〜4人(VSを8回遊ぶと1〜8人に解放)
  let cpuCount = 3;      // VSのCPU台数 0〜5
  let vsPlays = 0;       // VSモードを遊んだ回数(8回で1〜8人を解放)
  try { vsPlays = parseInt(localStorage.getItem('vs_plays') || '0', 10) || 0; } catch (e) {}
  let vs8Unlocked = vsPlays >= 8;
  let gpCpu = 9;         // グランプリのCPU台数 1〜19(デフォルト9)
  let transModes = ['auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto']; // プレイヤー(最大8)ごとの変速
  const SPEED_OPTS = [1, 1.5, 2, 2.5, 3];   // 最高速倍率
  let speedIdx = 0;                          // SPEED_OPTS のインデックス
  let accuratePhysics = false;               // 高精度物理(分割積分)
  let offcourseDamage = true;                // コース外(芝生)でダメージを受けるか
  let musicStyle = 'chip'; // 'chip'(ピコピコ) | 'orchestra'(オーケストラ)
  let richGfx = true;     // リッチ(沿道装飾・空) / シンプル
  let aiDiff = 'normal';  // CPUの強さ: weak | normal | strong | super
  let chaosLevel = 0;     // 0=OFF / 1=カオス(×10) / 2=スーパー(×15) / 3=ハイパー(×20) / 4=エラー(×100)
  // 公開版(GitHub Pages 等の *.github.io)は重くなりすぎないよう上限を「スーパーカオス」に制限。
  // ローカル(file:// / localhost)は従来どおり全カオス(本当のカオス=5)まで開放。
  const _host = (typeof location !== 'undefined' && location.hostname) || '';
  const _qs = (typeof location !== 'undefined' && location.search) || '';
  const isPublished = /(^|\.)github\.io$/i.test(_host) || /[?&]pub=1/.test(_qs);   // ?pub=1 で公開版相当を確認可
  const CHAOS_CAP = isPublished ? 2 : 5;   // 到達できる最大カオスレベル(2=スーパー)
  let superUnlocked = false;   // スーパーカオス解放済みか(カオス設定5連打で解放)
  let hyperUnlocked = false;   // ハイパーカオス解放済みか(解放後さらに10連打で解放)
  let errorUnlocked = false;   // エラーカオス解放済みか(解放後さらに13連打で解放)
  let trueUnlocked = false;    // 本当のカオス解放済みか(解放後さらに31連打で解放)
  try { superUnlocked = localStorage.getItem('superchaos_unlocked') === '1'; } catch (e) {}
  try { hyperUnlocked = localStorage.getItem('hyperchaos_unlocked') === '1'; } catch (e) {}
  try { errorUnlocked = localStorage.getItem('errorchaos_unlocked') === '1'; } catch (e) {}
  try { trueUnlocked = localStorage.getItem('truechaos_unlocked') === '1'; } catch (e) {}
  let gpReviveCpu = true; // グランプリ: リタイヤしたCPUを次のステージで復活させるか
  // ダメージ倍率。sc:true はスーパーカオス(以上)ON時のみ(2倍/1.5倍/1/15/1/20)、
  // hc:true はハイパーカオス(以上)ON時のみ選べる(3倍/2.5倍/1/25/1/30)。
  const DMG_OPTS = [
    { scale: 3, label: '3倍', hc: true }, { scale: 2.5, label: '2.5倍', hc: true },
    { scale: 2, label: '2倍', sc: true }, { scale: 1.5, label: '1.5倍', sc: true },
    { scale: 1, label: '通常' }, { scale: 1 / 2, label: '1/2' }, { scale: 1 / 3, label: '1/3' },
    { scale: 1 / 5, label: '1/5' }, { scale: 1 / 10, label: '1/10' },
    { scale: 1 / 15, label: '1/15', sc: true }, { scale: 1 / 20, label: '1/20', sc: true },
    { scale: 1 / 25, label: '1/25', hc: true }, { scale: 1 / 30, label: '1/30', hc: true },
    { scale: 0, label: 'なし' },
  ];
  const DMG_NORMAL = DMG_OPTS.findIndex(o => o.scale === 1);
  const DMG_HALF = DMG_OPTS.findIndex(o => o.scale === 1 / 2);
  // その倍率が今のカオスレベルで選べないか(sc=スーパー以上=2, hc=ハイパー以上=3 が必要)
  const dmgLocked = (o) => (o.sc && chaosLevel < 2) || (o.hc && chaosLevel < 3);
  // CPUランダム用の抽選プール: 今“選べる”倍率(0=なしは除く)。incl のときだけ 0 も加える。
  //   → スーパー/ハイパーを解放(ON)すると、追加された倍率も自動でランダムの候補に入る。
  const buildCpuPool = (mode) => {
    const pool = DMG_OPTS.filter(o => !dmgLocked(o) && o.scale > 0).map(o => o.scale);
    if (mode === 'incl') pool.push(0);
    return pool;
  };
  // CPUは固定倍率に加えて「ランダム」も選べる(各CPUごとに違う倍率を割り当て)。
  //   ランダム(なし含む)=0倍(無敵)もあり得る / ランダム(なし除く)=必ず多少はダメージ。
  const DMG_CPU = DMG_OPTS.concat([
    { random: 'incl', label: 'ランダム(なし含む)' },
    { random: 'excl', label: 'ランダム(なし除く)' },
  ]);
  // ダメージ量はプレイヤーとCPUで独立。既定はプレイヤー1/2・CPU通常。
  let dmgIdxP = DMG_HALF;     // プレイヤーのダメージ倍率(DMG_OPTS のindex)
  let dmgIdxC = DMG_NORMAL;   // CPUのダメージ倍率(DMG_CPU のindex)
  let mirrorUnlocked = false;   // ミラーモード解放済みか(GP全1位で解放・localStorage保存)
  try { mirrorUnlocked = localStorage.getItem('mirror_unlocked') === '1'; } catch (e) {}
  let mirror = false;           // ミラーモード(コース左右反転)ON/OFF
  let mirrorControls = false;   // 操作も反転するオプション
  let pedalUnlocked = false;    // アクセル/ブレーキ反転モード解放済みか(ミラー+操作反転でGP完走→解放)
  try { pedalUnlocked = localStorage.getItem('pedal_unlocked') === '1'; } catch (e) {}
  let pedalSwap = false;        // アクセルとブレーキを入れ替える
  let lastTrackIndex = 0;
  let gp = null;         // { seq, idx, points:{id:pts}, info:{id:{name,body,isHuman}} }
  let pendingRematch = null, pendingNext = null;

  // place(1..) → 得点。最大20台に対応(以降は0点)
  const POINTS = [0, 25, 20, 17, 15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1, 1, 1, 1];

  // ---- 画面切り替え ------------------------------------------------------
  const screens = {
    title: document.getElementById('screen-title'),
    gp: document.getElementById('screen-gp'),
    vs: document.getElementById('screen-vs'),
    course: document.getElementById('screen-course'),
    help: document.getElementById('screen-help'),
    results: document.getElementById('screen-results'),
    gameover: document.getElementById('screen-gameover'),
    pause: document.getElementById('screen-pause'),
  };
  const overlay = document.getElementById('overlay');
  const toolbar = document.getElementById('toolbar');
  function show(name) {
    for (const k in screens) screens[k].classList.toggle('active', k === name);
    overlay.style.pointerEvents = name ? 'auto' : 'none';
    showTouch(false);                 // メニュー表示中はタッチ操作パネルを隠す
  }
  function hideAll() { for (const k in screens) screens[k].classList.remove('active'); }

  // ---- オーディオはユーザー操作で初期化 ----------------------------------
  function ensureAudio() { audio.init(); audio.resume(); }
  window.addEventListener('pointerdown', ensureAudio, { once: true });
  window.addEventListener('keydown', ensureAudio, { once: true });

  // ---- コースカード生成 --------------------------------------------------
  const courseList = document.getElementById('course-list');
  TRACKS.forEach((t, idx) => {
    const card = document.createElement('div');
    card.className = 'course-card';
    const th = t.theme;
    card.innerHTML = `
      <div class="thumb" style="background:linear-gradient(135deg, ${th.sky}, ${th.skyDk}); position:relative;">
        <div style="position:absolute; inset:18px; border-radius:10px;
          background:repeating-linear-gradient(45deg, ${th.road} 0 14px, ${th.roadDk} 14px 28px);
          box-shadow: inset 0 0 0 6px ${th.grass};"></div>
        <div style="position:absolute; top:10px; left:12px; font-size:24px;">${['🌱', '☀️', '🏜️', '🌃', '🌋', '🌌', '🌈', '🌠', '🌩️', '🌀', '🛸'][idx] || '🏁'}</div>
      </div>
      <div class="meta">
        <div class="nm">${t.name}</div>
        <div class="sub">${t.subtitle}・${t.laps}周</div>
        <span class="diff">難易度: ${t.difficulty}</span>
      </div>`;
    card.addEventListener('click', () => beginRace(idx));
    courseList.appendChild(card);
  });

  // VSのCPU最低数: 人間1人なら最低1台、2人以上なら0台もOK
  const minCpu = () => (players >= 2 ? 0 : 1);

  // 合計カート数を算出。カオス=×10、スーパー=×15、ハイパー=×20、エラー=×100、本当=×200。
  const CHAOS_MUL = [1, 10, 15, 20, 100, 200];
  const CHAOS_TAG = ['', '（🌀カオス×10）', '（🌟スーパーカオス×15）', '（🔥ハイパーカオス×20）', '（💥エラーカオス×100）', '（🌪本当のカオス×200）'];
  const chaosMul = () => CHAOS_MUL[chaosLevel] || 1;
  const chaosTag = () => CHAOS_TAG[chaosLevel] || '';
  function totalKarts() {
    if (mode === 'time') return 1;                   // タイムアタックはCPU無し
    if (mode === 'gp') return 1 + gpCpu * chaosMul();          // 1人 + CPU(1〜19)×倍率
    return players + Math.max(minCpu(), cpuCount) * chaosMul(); // vs
  }

  // ---- レース開始 --------------------------------------------------------
  function beginRace(trackIndex) {
    if (mode === 'vs') {              // VSを遊んだ回数をカウント。8回で1〜8人を解放。
      vsPlays++;
      try { localStorage.setItem('vs_plays', String(vsPlays)); } catch (e) {}
      if (vsPlays >= 8 && !vs8Unlocked) { vs8Unlocked = true; revealVs8(); }
    }
    lastTrackIndex = trackIndex;
    ensureAudio();
    audio.setMusicStyle(musicStyle);
    hideAll();
    overlay.style.pointerEvents = 'none';
    toolbar.classList.remove('hidden');
    showTouch(true);                  // レース中はタッチ操作パネルを表示(タッチ端末のみ)
    const retiredIds = (mode === 'gp' && !gpReviveCpu && gp) ? (gp.retired || []) : [];
    const opts = { mode, trackIndex, players, numKarts: totalKarts(), trans: transModes[0], transModes, richGfx, aiDiff,
      mirror, mirrorControls: mirror && mirrorControls, pedalSwap, retiredIds,
      playerDamageScale: DMG_OPTS[dmgIdxP].scale,
      cpuDamageScale: DMG_CPU[dmgIdxC].random ? 1 : DMG_CPU[dmgIdxC].scale,
      cpuDamageRandom: DMG_CPU[dmgIdxC].random || null,
      cpuDamagePool: DMG_CPU[dmgIdxC].random ? buildCpuPool(DMG_CPU[dmgIdxC].random) : null,
      speedMul: SPEED_OPTS[speedIdx], accuratePhysics, offcourseDamage };
    if (mode === 'gp' && gp) opts.gpRace = { index: gp.idx + 1, total: gp.seq.length };
    game.startRace(opts);
  }

  function startGP() {
    mode = 'gp'; players = 1;
    gp = { seq: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], idx: 0, points: {}, info: {}, allFirst: true, retired: [] };   // 超かんたん〜超超超超超超激ムズ全11コース連戦
    saveGP(0);                       // 中断・再開用に保存(続きから = 第1戦)
    beginRace(gp.seq[0]);
  }

  // ---- グランプリの中断/再開(localStorageに進捗を保存) -------------------
  const GP_KEY = 'gp_save';
  const gpResumeBtn = document.getElementById('gp-resume');
  function saveGP(resumeIdx) {
    if (!gp) return;
    try {
      localStorage.setItem(GP_KEY, JSON.stringify({
        seq: gp.seq, idx: resumeIdx, points: gp.points, info: gp.info, allFirst: gp.allFirst, retired: gp.retired || [],
        s: { gpCpu, aiDiff, transModes, mirror, mirrorControls, pedalSwap, chaosLevel, gpReviveCpu, dmgIdxP, dmgIdxC, speedIdx, accuratePhysics, offcourseDamage },
      }));
    } catch (e) {}
    refreshGPResume();
  }
  function clearGP() { try { localStorage.removeItem(GP_KEY); } catch (e) {} refreshGPResume(); }
  function loadGPSave() { try { return JSON.parse(localStorage.getItem(GP_KEY) || 'null'); } catch (e) { return null; } }
  function refreshGPResume() {
    const v = loadGPSave();
    const ok = !!(v && Array.isArray(v.seq) && v.idx != null && v.idx < v.seq.length);
    gpResumeBtn.hidden = !ok;
    if (ok) gpResumeBtn.textContent = `▶ グランプリの続き（第${v.idx + 1}/${v.seq.length}戦から）`;
  }
  function resumeGP() {
    const v = loadGPSave();
    if (!v || !Array.isArray(v.seq) || v.idx == null || v.idx >= v.seq.length
        || v.seq.some((i) => i < 0 || i >= TRACKS.length)) { clearGP(); return; }
    const s = v.s || {};
    if (s.gpCpu != null) gpCpu = s.gpCpu;
    if (s.aiDiff) aiDiff = s.aiDiff;
    if (Array.isArray(s.transModes)) transModes = s.transModes;
    mirror = !!s.mirror; mirrorControls = !!s.mirrorControls; pedalSwap = !!s.pedalSwap;
    let cl = s.chaosLevel || 0;
    if (cl === 5 && !trueUnlocked) cl = errorUnlocked ? 4 : hyperUnlocked ? 3 : superUnlocked ? 2 : 1;   // 未解放なら下げる
    if (cl === 4 && !errorUnlocked) cl = hyperUnlocked ? 3 : superUnlocked ? 2 : 1;
    if (cl === 3 && !hyperUnlocked) cl = superUnlocked ? 2 : 1;
    if (cl === 2 && !superUnlocked) cl = 1;
    chaosLevel = Math.min(cl, CHAOS_CAP);   // 公開版は上限(スーパー)までに丸める
    gpReviveCpu = (s.gpReviveCpu !== false);
    if (s.dmgIdxP != null && s.dmgIdxP >= 0 && s.dmgIdxP < DMG_OPTS.length) dmgIdxP = s.dmgIdxP;
    if (s.dmgIdxC != null && s.dmgIdxC >= 0 && s.dmgIdxC < DMG_CPU.length) dmgIdxC = s.dmgIdxC;
    if (dmgLocked(DMG_OPTS[dmgIdxP])) dmgIdxP = DMG_NORMAL;   // 解放条件を満たさない倍率は通常へ戻す
    if (dmgLocked(DMG_CPU[dmgIdxC])) dmgIdxC = DMG_NORMAL;
    updateDmgUI();
    if (s.speedIdx != null && s.speedIdx >= 0 && s.speedIdx < SPEED_OPTS.length) { speedIdx = s.speedIdx; updateSpeedUI(); }
    accuratePhysics = !!s.accuratePhysics; updatePhysUI();
    offcourseDamage = (s.offcourseDamage !== false); updateOffUI();
    mode = 'gp'; players = 1;
    gp = { seq: v.seq, idx: v.idx, points: v.points || {}, info: v.info || {}, allFirst: !!v.allFirst, retired: v.retired || [] };
    beginRace(gp.seq[gp.idx]);
  }
  gpResumeBtn.addEventListener('click', resumeGP);
  refreshGPResume();                 // 起動時: 中断中のGPがあれば「続きから」を表示

  // ---- リザルト ----------------------------------------------------------
  const fmtT = (t) => (t == null ? 'リタイア' : fmtTime(t));
  function addRow(ol, place, body, name, right, you) {
    const medal = ['', '🥇', '🥈', '🥉'];
    const li = document.createElement('li');
    if (you) li.classList.add('you');
    li.innerHTML =
      `<span class="rank ${place === 1 ? 'p1' : ''}">${medal[place] || place}</span>` +
      `<span class="chip" style="background:${body}"></span>` +
      `<span class="nm">${name}</span>` +
      `<span class="tm">${right}</span>`;
    ol.appendChild(li);
  }

  game.onFinish = (res) => {
    toolbar.classList.add('hidden');
    game.stop();
    const ol = document.getElementById('result-list'); ol.innerHTML = '';
    const titleEl = document.getElementById('result-title');
    const subEl = document.getElementById('result-sub');
    const btnNext = document.getElementById('next-race');
    const btnRematch = document.getElementById('rematch');
    const btnChange = document.getElementById('change-course');
    btnNext.hidden = true; btnRematch.hidden = false; btnChange.hidden = false;
    btnRematch.textContent = '🔄 もう一度（同じコース）';
    pendingRematch = () => beginRace(res.trackIndex);
    pendingNext = null;

    if (res.mode === 'time') {
      const me = res.order.find(r => r.isHuman) || res.order[0];
      titleEl.textContent = '⏱ タイムアタック結果';
      const key = 'ta_best_' + TRACKS[res.trackIndex].id;
      const prev = parseFloat(localStorage.getItem(key) || '');
      let rec = '';
      if (me.time != null && (!isFinite(prev) || me.time < prev)) { localStorage.setItem(key, String(me.time)); rec = ' 🏆 NEW RECORD!'; }
      const best = parseFloat(localStorage.getItem(key) || '');
      subEl.innerHTML = `${TRACKS[res.trackIndex].name}<br>トータル <b>${fmtT(me.time)}</b>${rec}　／　ベストラップ ${fmtT(me.bestLap)}<br>コース記録 ${fmtT(isFinite(best) ? best : null)}`;
      addRow(ol, 1, me.body, me.name, fmtT(me.time), true);

    } else if (res.mode === 'gp') {
      res.order.forEach(r => {
        gp.points[r.id] = (gp.points[r.id] || 0) + (POINTS[r.place] || 0);
        gp.info[r.id] = { name: r.name, body: r.body, isHuman: r.isHuman };
      });
      // リタイヤCPUを引き継ぐ設定なら、今戦でリタイヤしたCPUを累積
      if (!gpReviveCpu) gp.retired = [...new Set([...(gp.retired || []), ...(res.retiredIds || [])])];
      const standings = Object.keys(gp.info).map(id => ({ id: +id, ...gp.info[id], pts: gp.points[id] || 0 }))
        .sort((a, b) => b.pts - a.pts);
      const me = res.order.find(r => r.isHuman);
      if (!me || me.place !== 1) gp.allFirst = false;   // 全レース1位の判定
      const isFinal = gp.idx >= gp.seq.length - 1;
      if (!isFinal) {
        saveGP(gp.idx + 1);          // ここまでの成績を保存(続き=次戦から)。中断してもOK。
        titleEl.textContent = `🏆 第${gp.idx + 1}戦 結果（総合成績）`;
        subEl.textContent = `${TRACKS[res.trackIndex].name}：あなたは ${ordinal(me.place)}！` + (mirror ? '（🪞ミラー）' : '');
        btnNext.hidden = false; btnRematch.hidden = true; btnChange.hidden = true;
        btnNext.textContent = `▶ 第${gp.idx + 2}戦へ（${TRACKS[gp.seq[gp.idx + 1]].name}）`;
        pendingNext = () => { gp.idx++; beginRace(gp.seq[gp.idx]); };
      } else {
        clearGP();                   // グランプリ完了 → 保存を消去
        const champ = standings[0];
        titleEl.textContent = '🏆 グランプリ 総合成績';
        let sub = `優勝：${champ.name}${champ.isHuman ? '（YOU）' : ''}！`;
        // 全レース1位 → ミラーモード解放(初回はlocalStorageに保存)
        if (gp.allFirst) {
          const wasNew = !mirrorUnlocked;
          mirrorUnlocked = true;
          try { localStorage.setItem('mirror_unlocked', '1'); } catch (e) {}
          revealMirror();
          sub += wasNew ? '　🎉 全レース1位達成！ 🪞ミラーモードを解放しました！'
                        : '　🪞 全レース1位達成！（ミラーモード解放済み）';
        }
        // ミラー＋操作反転でGP完走 → アクセル/ブレーキ反転モード解放
        if (mirror && mirrorControls) {
          const wasNew = !pedalUnlocked;
          pedalUnlocked = true;
          try { localStorage.setItem('pedal_unlocked', '1'); } catch (e) {}
          revealPedal();
          sub += wasNew ? '　🎊 ミラー＋操作反転で完走！ 🔁アクセル/ブレーキ反転モードを解放しました！'
                        : '　🔁 ミラー＋操作反転で完走！（アクセル/ブレーキ反転 解放済み）';
        }
        subEl.textContent = sub;
        btnNext.hidden = true; btnRematch.hidden = false; btnChange.hidden = true;
        btnRematch.textContent = '🔄 もう一度グランプリ';
        pendingRematch = () => startGP();
      }
      standings.forEach((s, i) => addRow(ol, i + 1, s.body, s.name + (s.isHuman ? '（YOU）' : ''), s.pts + ' pts', s.isHuman));

    } else { // vs
      titleEl.textContent = 'リザルト';
      subEl.textContent = TRACKS[res.trackIndex].name;
      res.order.forEach(r => addRow(ol, r.place, r.body, r.name + (r.isHuman ? '（YOU）' : ''), fmtT(r.time), r.isHuman));
    }
    show('results');
  };

  // ---- ゲームオーバー(プレイヤーのライフが0) ----------------------------
  let pendingGameoverRetry = null;
  const goSub = document.getElementById('gameover-sub');
  const goRetry = document.getElementById('gameover-retry');
  game.onGameOver = () => {
    toolbar.classList.add('hidden');
    game.stop();
    const ti = lastTrackIndex;
    if (mode === 'gp' && gp) {
      goSub.innerHTML = `${TRACKS[ti].name}（第${gp.idx + 1}/${gp.seq.length}戦）でライフが尽きました…`;
      goRetry.textContent = '🔄 このコースを最初から';
      pendingGameoverRetry = () => beginRace(gp.seq[gp.idx]);   // 同じ戦を最初から(成績は維持)
    } else {
      goSub.innerHTML = `${TRACKS[ti].name} でライフが尽きました…`;
      goRetry.textContent = '🔄 もう一度';
      pendingGameoverRetry = () => beginRace(ti);
    }
    show('gameover');
  };
  goRetry.addEventListener('click', () => { if (pendingGameoverRetry) pendingGameoverRetry(); });
  document.getElementById('gameover-title').addEventListener('click', () => { game.stop(); show('title'); });

  // ---- ボタン配線 --------------------------------------------------------
  document.querySelectorAll('#screen-title [data-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      const m = b.dataset.mode;
      if (m === 'gp') { mode = 'gp'; refreshGP(); show('gp'); }
      else if (m === 'time') { mode = 'time'; players = 1; show('course'); }
      else if (m === 'vs') { mode = 'vs'; refreshVS(); show('vs'); }
    });
  });

  // ---- グランプリ設定(CPU台数 1〜19) ------------------------------------
  const gpVal = document.getElementById('gp-cpu-val');
  const gpMinus = document.getElementById('gp-cpu-minus');
  const gpPlus = document.getElementById('gp-cpu-plus');
  function refreshGP() {
    gpCpu = Math.max(1, Math.min(19, gpCpu));
    gpVal.textContent = gpCpu;
    gpMinus.disabled = gpCpu <= 1;
    gpPlus.disabled = gpCpu >= 19;
    const cpus = gpCpu * chaosMul();
    document.getElementById('gp-summary').innerHTML =
      `あなた <b>1人</b>＋CPU <b>${cpus}台</b>${chaosTag()} ＝ 合計 <b>${1 + cpus}台</b>で全11コース連戦`;
  }
  gpMinus.addEventListener('click', () => { gpCpu--; refreshGP(); });
  gpPlus.addEventListener('click', () => { gpCpu++; refreshGP(); });
  document.getElementById('gp-start').addEventListener('click', () => startGP());

  // ---- VS 設定(人数・CPU台数・各自の変速) ------------------------------
  const segP = document.getElementById('vs-players');
  const segC = document.getElementById('vs-cpu');
  const segT = document.getElementById('vs-trans');
  const vsSummary = document.getElementById('vs-summary');
  const TRANS_CYCLE = ['auto', 'semi', 'manual'];
  const TRANS_SH = { auto: 'AT', semi: 'セミAT', manual: 'MT' };
  function revealVs8() { segP.querySelectorAll('.vs8-only').forEach((b) => { b.hidden = false; }); }
  if (vs8Unlocked) revealVs8();   // 起動時に解放済みなら5〜8人ボタンを表示
  function refreshVS() {
    // 人間1人ならCPU最低1。0ボタンは無効化し、0なら1へ。
    const cmin = minCpu();
    if (cpuCount < cmin) cpuCount = cmin;
    segP.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v === players));
    segC.querySelectorAll('button').forEach((b) => {
      const v = +b.dataset.v;
      b.disabled = v < cmin;
      b.style.opacity = v < cmin ? '0.3' : '';
      b.classList.toggle('on', v === cpuCount);
    });
    // 各プレイヤーの変速ボタン(タップで AT→セミAT→MT 循環)
    segT.innerHTML = '';
    for (let i = 0; i < players; i++) {
      const b = document.createElement('button');
      b.dataset.p = i; b.className = 'on';
      b.textContent = `P${i + 1}: ${TRANS_SH[transModes[i]]}`;
      segT.appendChild(b);
    }
    const cpus = Math.max(minCpu(), cpuCount) * chaosMul();
    const total = players + cpus;
    const splitTxt = players >= 7 ? '（画面4×2分割）' : players >= 5 ? '（画面3×2分割）' : players >= 3 ? '（画面2×2分割）' : players === 2 ? '（画面上下分割）' : '';
    vsSummary.innerHTML = `プレイヤー <b>${players}人</b>＋CPU <b>${cpus}台</b>${chaosTag()} ＝ 合計 <b>${total}台</b>${splitTxt}` +
      (players === 1 ? '<br>※1人のときはCPU最低1台' : '') +
      (players >= 5 ? '<br>※5〜8人はコントローラ推奨' : '');
  }
  segP.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    players = +b.dataset.v; refreshVS();
  });
  segC.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    cpuCount = +b.dataset.v; refreshVS();
  });
  segT.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const i = +b.dataset.p;
    transModes[i] = TRANS_CYCLE[(TRANS_CYCLE.indexOf(transModes[i]) + 1) % 3];
    if (i === 0) transBtn.textContent = '⚙ ミッション: ' + TRANS_LABEL[transModes[0]];   // タイトル表示も同期
    refreshVS();
  });
  document.getElementById('vs-go').addEventListener('click', () => show('course'));
  // 変速モード切替(AT → セミAT → MT を循環)。タイトルのボタンは P1 の設定。
  const transBtn = document.getElementById('trans-toggle');
  const TRANS_SEQ = ['auto', 'semi', 'manual'];
  const TRANS_LABEL = { auto: 'オートマ（AT）', semi: 'セミオートマ', manual: 'マニュアル（MT）' };
  const TRANS_SHORT = { auto: 'AT', semi: 'セミAT', manual: 'MT' };
  transBtn.addEventListener('click', () => {
    transModes[0] = TRANS_SEQ[(TRANS_SEQ.indexOf(transModes[0]) + 1) % TRANS_SEQ.length];
    transBtn.textContent = '⚙ ミッション: ' + TRANS_LABEL[transModes[0]];
  });

  // CPUの強さ切替(弱い → 普通 → 強い → 超強い を循環)
  const cpuBtn = document.getElementById('cpu-toggle');
  const CPU_SEQ = ['weak', 'normal', 'strong', 'super'];
  const CPU_LABEL = { weak: '弱い', normal: '普通', strong: '強い', super: '超強い' };
  cpuBtn.addEventListener('click', () => {
    aiDiff = CPU_SEQ[(CPU_SEQ.indexOf(aiDiff) + 1) % CPU_SEQ.length];
    cpuBtn.textContent = '🤖 CPUの強さ: ' + CPU_LABEL[aiDiff];
  });

  // 🌀 カオス(×10)。連打で🌟スーパー(5)→🔥ハイパー(10)→💥エラー(13)を解放/ON。
  // 判定は「直前クリックから0.6秒以内なら連打継続」方式(合計時間の窓ではないので13連打も届く)。
  const chaosBtn = document.getElementById('chaos-toggle');
  let chaosStreak = 0, chaosLast = 0;
  const CHAOS_TXT = ['🌀 カオスモード: OFF', '🌀 カオスモード: ON（CPU×10！）', '🌟 スーパーカオス: ON（CPU×15！）',
    '🔥 ハイパーカオス: ON（CPU×20！）', '💥 エラーカオス: ON（CPU×100！）', '🌪 本当のカオス: ON（CPU×200！）'];
  function updateChaosUI() {
    chaosBtn.textContent = CHAOS_TXT[chaosLevel] || CHAOS_TXT[0];
    chaosBtn.classList.toggle('super-on', chaosLevel === 2);
    chaosBtn.classList.toggle('hyper-on', chaosLevel === 3);
    chaosBtn.classList.toggle('error-on', chaosLevel === 4);
    chaosBtn.classList.toggle('true-on', chaosLevel === 5);
    chaosBtn.classList.toggle('super-unlocked', superUnlocked && !hyperUnlocked);
    chaosBtn.classList.toggle('hyper-unlocked', hyperUnlocked && !errorUnlocked);
    chaosBtn.classList.toggle('error-unlocked', errorUnlocked && !trueUnlocked);
    chaosBtn.classList.toggle('true-unlocked', trueUnlocked);   // 解放状況を見た目で表示
  }
  const maxLevel = () => Math.min(CHAOS_CAP, trueUnlocked ? 5 : errorUnlocked ? 4 : hyperUnlocked ? 3 : superUnlocked ? 2 : 1);
  chaosBtn.addEventListener('click', () => {
    const now = Date.now();
    chaosStreak = (now - chaosLast < 600) ? chaosStreak + 1 : 1;   // 0.6秒以内なら連打継続
    chaosLast = now;
    if (chaosStreak >= 31 && errorUnlocked && CHAOS_CAP >= 5) {     // 31連打 → 本当のカオス解放+ON
      const wasNew = !trueUnlocked;
      trueUnlocked = true;
      try { localStorage.setItem('truechaos_unlocked', '1'); } catch (e) {}
      chaosLevel = 5; updateChaosUI();
      if (wasNew) { chaosBtn.textContent = '🌪 本当のカオス 解放！！！！'; setTimeout(updateChaosUI, 1800); }
      return;
    }
    if (chaosStreak >= 13 && hyperUnlocked && CHAOS_CAP >= 4) {     // 13連打 → エラーカオス解放+ON
      const wasNew = !errorUnlocked;
      errorUnlocked = true;
      try { localStorage.setItem('errorchaos_unlocked', '1'); } catch (e) {}
      chaosLevel = 4; updateChaosUI();
      if (wasNew) { chaosBtn.textContent = '💥 ERROR CHAOS UNLOCKED 💥'; setTimeout(updateChaosUI, 1700); }
      return;
    }
    if (chaosStreak >= 10 && superUnlocked && CHAOS_CAP >= 3) {     // 10連打 → ハイパー解放+ON
      const wasNew = !hyperUnlocked;
      hyperUnlocked = true;
      try { localStorage.setItem('hyperchaos_unlocked', '1'); } catch (e) {}
      chaosLevel = 3; updateChaosUI();
      if (wasNew) { chaosBtn.textContent = '🔥 ハイパーカオスモード 解放！！！'; setTimeout(updateChaosUI, 1600); }
      return;
    }
    if (chaosStreak >= 5) {                                   // 5連打 → スーパー解放+ON
      const wasNew = !superUnlocked;
      superUnlocked = true;
      try { localStorage.setItem('superchaos_unlocked', '1'); } catch (e) {}
      chaosLevel = 2; updateChaosUI();
      if (wasNew) { chaosBtn.textContent = '🌟 スーパーカオスモード 解放！！'; setTimeout(updateChaosUI, 1500); }
      return;
    }
    // 単発クリック(連打1回目)はモード循環。連打中(2〜4回目)はコンボ蓄積のみで何もしない。
    if (chaosStreak === 1) {
      chaosLevel = (chaosLevel + 1) % (maxLevel() + 1);
      updateChaosUI();
      let reset = false;   // 解放条件を満たさなくなった倍率を通常へ戻す
      if (dmgLocked(DMG_OPTS[dmgIdxP])) { dmgIdxP = DMG_NORMAL; reset = true; }
      if (dmgLocked(DMG_CPU[dmgIdxC])) { dmgIdxC = DMG_NORMAL; reset = true; }
      if (reset) updateDmgUI();
    }
  });
  updateChaosUI();   // 起動時の表示(解放済みなら見た目に反映)

  // 🚑 リタイヤCPUの次ステージ復活(グランプリ)。OFFだと脱落したCPUは以後不在。
  const reviveBtn = document.getElementById('revive-toggle');
  reviveBtn.addEventListener('click', () => {
    gpReviveCpu = !gpReviveCpu;
    reviveBtn.textContent = '🚑 リタイヤCPU(GP): ' + (gpReviveCpu ? '次戦で復活' : '復活しない（脱落のまま）');
  });

  // 💥 ダメージ倍率切替(プレイヤー/CPU 独立)。スーパー以上で 2倍/1.5倍/1/15/1/20、
  //    ハイパー以上で 3倍/2.5倍/1/25/1/30 も循環に含む。
  const dmgBtn = document.getElementById('dmg-toggle');
  const dmgCpuBtn = document.getElementById('dmg-cpu-toggle');
  function updateDmgUI() {
    dmgBtn.textContent = '💥 自分のダメージ: ' + DMG_OPTS[dmgIdxP].label;
    dmgCpuBtn.textContent = '💥 CPUのダメージ: ' + DMG_CPU[dmgIdxC].label;
  }
  const cycleDmg = (idx, list) => { do { idx = (idx + 1) % list.length; } while (dmgLocked(list[idx])); return idx; };
  dmgBtn.addEventListener('click', () => { dmgIdxP = cycleDmg(dmgIdxP, DMG_OPTS); updateDmgUI(); });
  dmgCpuBtn.addEventListener('click', () => { dmgIdxC = cycleDmg(dmgIdxC, DMG_CPU); updateDmgUI(); });
  updateDmgUI();

  // 🏎 最高速倍率(通常→1.5→2→2.5→3倍)
  const speedBtn = document.getElementById('speed-toggle');
  function updateSpeedUI() { speedBtn.textContent = '🏎 最高速: ' + (speedIdx === 0 ? '通常' : SPEED_OPTS[speedIdx] + '倍'); }
  speedBtn.addEventListener('click', () => { speedIdx = (speedIdx + 1) % SPEED_OPTS.length; updateSpeedUI(); });
  updateSpeedUI();

  // ⚛ 高精度物理(分割積分)ON/OFF
  const physBtn = document.getElementById('phys-toggle');
  function updatePhysUI() { physBtn.textContent = '⚛ 高精度物理: ' + (accuratePhysics ? 'ON' : 'OFF'); }
  physBtn.addEventListener('click', () => { accuratePhysics = !accuratePhysics; updatePhysUI(); });
  updatePhysUI();

  // 🌱 コース外ダメージ ON/OFF
  const offBtn = document.getElementById('offcourse-toggle');
  function updateOffUI() { offBtn.textContent = '🌱 コース外ダメージ: ' + (offcourseDamage ? 'あり' : 'なし'); }
  offBtn.addEventListener('click', () => { offcourseDamage = !offcourseDamage; updateOffUI(); });
  updateOffUI();

  // 音楽スタイル切替(ピコピコ ⇄ オーケストラ)。再生中でも即反映。
  const musicBtn = document.getElementById('music-toggle');
  const MUSIC_LABEL = { chip: 'ピコピコ', orchestra: 'オーケストラ' };
  musicBtn.addEventListener('click', () => {
    musicStyle = musicStyle === 'chip' ? 'orchestra' : 'chip';
    musicBtn.textContent = '🎵 音楽: ' + MUSIC_LABEL[musicStyle];
    ensureAudio();
    audio.setMusicStyle(musicStyle);
  });

  // 画質切替(リッチ ⇄ シンプル)。実行中なら即反映。
  const gfxBtn = document.getElementById('gfx-toggle');
  gfxBtn.addEventListener('click', () => {
    richGfx = !richGfx;
    gfxBtn.textContent = '🖼 画質: ' + (richGfx ? 'リッチ' : 'シンプル（軽量）');
    if (game.running) game.richGfx = richGfx;
  });

  // 📺 白黒（昭和）モード … 画面全体をモノクロ＋ブラウン管(走査線/ビネット)演出。設定は保存。
  let bwMode = false;
  try { bwMode = localStorage.getItem('bw_mode') === '1'; } catch (e) {}
  const bwBtn = document.getElementById('bw-toggle');
  function applyBw() {
    document.body.classList.toggle('showa-bw', bwMode);
    bwBtn.classList.toggle('on', bwMode);
    bwBtn.textContent = '📺 白黒（昭和）モード: ' + (bwMode ? 'ON' : 'OFF');
  }
  bwBtn.addEventListener('click', () => {
    bwMode = !bwMode;
    try { localStorage.setItem('bw_mode', bwMode ? '1' : '0'); } catch (e) {}
    applyBw();
  });
  applyBw();   // 起動時に保存済み設定を反映

  // 🪞 ミラーモード(GP全1位で解放)。解放後は常時表示。コース反転＋操作反転オプション。
  const mirrorBtn = document.getElementById('mirror-toggle');
  const mirrorCtlBtn = document.getElementById('mirrorctl-toggle');
  function updateMirrorUI() {
    mirrorBtn.textContent = '🪞 ミラーモード: ' + (mirror ? 'ON' : 'OFF');
    mirrorCtlBtn.textContent = '↔ 操作も反転: ' + (mirrorControls ? 'ON' : 'OFF');
    mirrorCtlBtn.disabled = !mirror;                 // 操作反転はミラーON時のみ有効
    mirrorCtlBtn.style.opacity = mirror ? '' : '0.4';
  }
  function revealMirror() {
    document.querySelectorAll('.mirror-only').forEach((b) => { b.hidden = false; });
    updateMirrorUI();
  }
  mirrorBtn.addEventListener('click', () => { mirror = !mirror; updateMirrorUI(); });
  mirrorCtlBtn.addEventListener('click', () => { if (!mirror) return; mirrorControls = !mirrorControls; updateMirrorUI(); });
  if (mirrorUnlocked) revealMirror();                // 起動時に解放済みなら表示

  // 🔁 アクセル/ブレーキ反転モード(ミラー＋操作反転でGP完走で解放)
  const pedalBtn = document.getElementById('pedal-toggle');
  function updatePedalUI() { pedalBtn.textContent = '🔁 アクセル/ブレーキ反転: ' + (pedalSwap ? 'ON' : 'OFF'); }
  function revealPedal() {
    document.querySelectorAll('.pedal-only').forEach((b) => { b.hidden = false; });
    updatePedalUI();
  }
  pedalBtn.addEventListener('click', () => { pedalSwap = !pedalSwap; updatePedalUI(); });
  if (pedalUnlocked) revealPedal();                  // 起動時に解放済みなら表示

  document.getElementById('to-help').addEventListener('click', () => show('help'));
  document.querySelectorAll('[data-back]').forEach((b) =>
    b.addEventListener('click', () => show(b.dataset.back)));

  document.getElementById('next-race').addEventListener('click', () => { if (pendingNext) pendingNext(); });
  document.getElementById('rematch').addEventListener('click', () => { if (pendingRematch) pendingRematch(); });
  document.getElementById('change-course').addEventListener('click', () => show('course'));
  document.getElementById('to-title').addEventListener('click', () => { gp = null; show('title'); });

  // ---- ツールバー & ポーズ ----------------------------------------------
  const btnMute = document.getElementById('btn-mute');
  btnMute.addEventListener('click', () => { btnMute.textContent = audio.toggleMute() ? '🔇' : '🔊'; });
  const btnPause = document.getElementById('btn-pause');
  function doPause() {
    if (!game.running || game.paused) return;
    game.pause();
    toolbar.classList.add('hidden');
    show('pause');
  }
  function doResume() {
    hideAll();
    overlay.style.pointerEvents = 'none';
    toolbar.classList.remove('hidden');
    showTouch(true);
    game.resume();
  }
  btnPause.addEventListener('click', doPause);
  document.getElementById('resume').addEventListener('click', doResume);
  document.getElementById('quit').addEventListener('click', () => {
    game.stop(); gp = null;
    toolbar.classList.add('hidden');
    show('title');
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && game.running) { if (game.paused) doResume(); else doPause(); }
  });

  show('title');
})();
