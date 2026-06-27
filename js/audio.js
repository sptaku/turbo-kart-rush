/* =========================================================================
 * audio.js  ―  Web Audio によるオリジナルBGM生成 + 効果音
 *  ・著作権物は一切使わず、コード進行とアルペジオから完全合成する。
 *  ・race1/2/3 … コース別の軽快なBGM
 *  ・star     … 無敵中の高速アップテンポBGM
 *  ・SFX      … 取得/ブースト/ヒット/発射 等の短い効果音
 * =======================================================================*/
function midiFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function leadArr(pairs) {
  const a = new Array(32).fill(null);
  for (const [i, m] of pairs) a[i] = m;
  return a;
}

/* ===========================================================================
 * 2スタイルの楽曲。同じコード進行でも「チップチューン」と「オーケストラ」で
 * アレンジ・メロディ・テンポ・リズムを根本から変え、別物の曲にする。
 * ========================================================================= */

// --- チップチューン: ノリの良い疾走系。16分の刻み + 跳ねるベース + 元気なドラム
function makeChipSong(cfg) {
  const N = 32;
  const triad = (seg) => (cfg.types[seg] === 'min' ? [0, 3, 7] : [0, 4, 7]);
  return {
    style: 'chip', bpm: cfg.bpm, steps: N,
    voices: [
      { type: 'triangle', role: 'bass', gain: 0.46,           // ドライブするパンプベース(8分=ルート/オクターブ/5度)
        fn: (i) => {
          if (i % 2 !== 0) return null;
          const seg = Math.floor(i / 8) % 4, r = cfg.roots[seg], m = Math.floor(i / 2) % 4;
          return [[r, r + 12, r + 7, r + 12][m], 1];
        } },
      { type: 'square', role: 'pad', gain: 0.05,              // コードのバッキング(裏拍スタブ)
        fn: (i) => {
          if (i % 4 !== 2) return null;
          const seg = Math.floor(i / 8) % 4, r = cfg.roots[seg] + 12;
          return triad(seg).map((v) => [r + v, 1]);
        } },
      { type: 'square', role: 'arp', gain: 0.075,             // 高速アルペジオ(16分・駆け上がり)
        fn: (i) => {
          const seg = Math.floor(i / 8) % 4;
          const iv = cfg.types[seg] === 'min' ? [0, 3, 7, 12, 15, 12, 7, 3] : [0, 4, 7, 12, 16, 12, 7, 4];
          const r = cfg.roots[seg] + 12;
          return [r + iv[i % 8], 1];
        } },
      { type: 'square', role: 'lead', gain: 0.22,             // 主旋律(キャッチー)
        fn: (i) => (cfg.lead[i] ? [cfg.lead[i], 2] : null) },
      { type: 'triangle', role: 'harm', gain: 0.08,           // 3度下ハモリ
        fn: (i) => (cfg.lead[i] ? [cfg.lead[i] - (cfg.types[Math.floor(i / 8) % 4] === 'min' ? 3 : 4), 2] : null) },
    ],
    drums: (i) => ({
      kick: i % 4 === 0 || i % 8 === 6,
      snare: i % 8 === 4,
      hat: true, ohat: i % 8 === 7,
      crash: i === 0,
    }),
  };
}

// --- オーケストラ: 荘厳/映画的。ゆったりテンポ・持続する弦・歌う金管・ハープ・ティンパニ
function makeOrchSong(cfg) {
  const N = 32;
  const triad = (seg) => (cfg.types[seg] === 'min' ? [0, 3, 7] : [0, 4, 7]);
  const L = cfg.leadOrch || cfg.lead;
  return {
    style: 'orch', bpm: Math.round(cfg.bpm * 0.8), steps: N,    // 少しゆったり
    voices: [
      { role: 'bass', gain: 0.34,                              // コントラバス(2分で支える)
        fn: (i) => {
          const seg = Math.floor(i / 8) % 4, r = cfg.roots[seg], m = i % 8;
          if (m === 0) return [r, 6];
          if (m === 4) return [r + 7, 4];                       // 5度へ
          return null;
        } },
      { role: 'pad', gain: 0.085,                              // 弦の和音(1小節持続=レガート)
        fn: (i) => {
          if (i % 8 !== 0) return null;
          const seg = Math.floor(i / 8) % 4, r = cfg.roots[seg] + 12;
          return triad(seg).map((v) => [r + v, 8]);
        } },
      { role: 'pad', gain: 0.05,                               // 高弦(2小節持続で広がり)
        fn: (i) => {
          if (i % 16 !== 0) return null;
          const seg = Math.floor(i / 8) % 4, r = cfg.roots[seg] + 24;
          return triad(seg).map((v) => [r + v, 16]);
        } },
      { role: 'arp', gain: 0.07,                               // ハープ/ピッツィカート(分散和音)
        fn: (i) => {
          if (i % 2 !== 0) return null;
          const seg = Math.floor(i / 8) % 4;
          const iv = cfg.types[seg] === 'min' ? [0, 3, 7, 12, 7, 3] : [0, 4, 7, 12, 7, 4];
          const r = cfg.roots[seg] + 12;
          return [r + iv[Math.floor(i / 2) % iv.length], 2];
        } },
      { role: 'lead', gain: 0.22,                              // 金管の歌(長い音符でのびやかに)
        fn: (i) => (L[i] ? [L[i], 4] : null) },
      { role: 'harm', gain: 0.1,                               // 金管ハモリ(3度下)
        fn: (i) => (L[i] ? [L[i] - 3, 4] : null) },
    ],
    drums: (i) => ({
      kick: i % 8 === 0 || i % 8 === 4,                        // ティンパニ 1拍・3拍
      snare: false, hat: false,
      crash: i % 32 === 0,                                     // 小節頭にシンバル
    }),
  };
}

// コード進行(コース別) + 2スタイル分のメロディ。
//   I–V–vi–IV のような平凡進行をやめ、二次ドミナント/アンダルシア終止/短調ドライブで
//   ゲームミュージック的な“かっこよさ”を狙う(原曲は不使用・完全オリジナル)。
const SONG_CFG = {
  // C: I – III(=V/vi) – vi – IV / 二次ドミナントの高揚感(明るく疾走)
  race1: {
    bpm: 154, roots: [36, 40, 45, 41], types: ['maj', 'maj', 'min', 'maj'],
    lead: leadArr([[0, 72], [2, 76], [4, 79], [6, 84], [8, 80], [10, 83], [12, 88], [14, 83], [16, 81], [18, 84], [19, 88], [20, 84], [22, 81], [24, 81], [26, 77], [28, 79], [30, 76]]),
    leadOrch: leadArr([[0, 84], [6, 88], [8, 83], [12, 87], [16, 88], [20, 84], [24, 81], [28, 77]]),
  },
  // Dm: i – VII – VI – V / アンダルシア終止(劇的・冒険的)
  race2: {
    bpm: 160, roots: [38, 36, 34, 33], types: ['min', 'maj', 'maj', 'maj'],
    lead: leadArr([[0, 81], [2, 77], [4, 74], [6, 77], [8, 79], [10, 76], [12, 72], [14, 76], [16, 77], [18, 74], [20, 70], [22, 74], [24, 76], [26, 73], [28, 69], [30, 73]]),
    leadOrch: leadArr([[0, 86], [6, 81], [8, 84], [12, 79], [16, 82], [20, 77], [24, 81], [28, 76]]),
  },
  // Am: i – VI – VII – V / 短調のドライブ感(攻めたバトル風)
  race3: {
    bpm: 170, roots: [45, 41, 43, 40], types: ['min', 'maj', 'maj', 'maj'],
    lead: leadArr([[0, 81], [2, 84], [4, 88], [6, 84], [8, 84], [10, 81], [12, 77], [14, 81], [16, 79], [18, 83], [20, 86], [22, 83], [24, 83], [26, 80], [28, 76], [30, 80]]),
    leadOrch: leadArr([[0, 88], [6, 84], [8, 84], [12, 81], [16, 86], [20, 83], [24, 80], [28, 83]]),
  },
};

// 無敵BGM(スター): チップ=高速ピコピコ / オーケストラ=弦トレモロ+金管ファンファーレ
const STAR_CHIP = {
  style: 'chip', bpm: 188, steps: 16,
  voices: [
    { type: 'square', role: 'lead', gain: 0.22,
      fn: (i) => { const sc = [0, 2, 4, 5, 7, 9, 11, 12]; return [72 + sc[i % 8] + (i >= 8 ? 12 : 0), 1]; } },
    { type: 'sawtooth', role: 'arp', gain: 0.12,
      fn: (i) => { const p = [0, 7, 12, 7]; return [48 + p[i % 4], 1]; } },
    { type: 'triangle', role: 'bass', gain: 0.5,
      fn: (i) => { const r = [36, 36, 43, 43, 41, 41, 45, 45]; return i % 2 === 0 ? [r[Math.floor(i / 2) % 8], 1] : null; } },
  ],
  drums: (i) => ({ kick: i % 2 === 0, snare: i % 4 === 2, hat: true }),
};
const STAR_ORCH = {
  style: 'orch', bpm: 150, steps: 16,
  voices: [
    { role: 'lead', gain: 0.22,                                // 金管ファンファーレ
      fn: (i) => { const sc = [0, 4, 7, 12, 7, 12, 16, 12]; return [60 + sc[i % 8], 2]; } },
    { role: 'arp', gain: 0.12,                                 // 弦トレモロ的な刻み
      fn: (i) => { const p = [0, 7, 12, 16]; return [48 + p[i % 4], 1]; } },
    { role: 'bass', gain: 0.42,
      fn: (i) => { const r = [36, 36, 41, 41, 43, 43, 45, 45]; return i % 2 === 0 ? [r[Math.floor(i / 2) % 8], 2] : null; } },
  ],
  drums: (i) => ({ kick: i % 2 === 0, snare: false, crash: i % 8 === 0 }),
};

// name → { chip, orch } の2変種
const SONGS = {
  race1: { chip: makeChipSong(SONG_CFG.race1), orch: makeOrchSong(SONG_CFG.race1) },
  race2: { chip: makeChipSong(SONG_CFG.race2), orch: makeOrchSong(SONG_CFG.race2) },
  race3: { chip: makeChipSong(SONG_CFG.race3), orch: makeOrchSong(SONG_CFG.race3) },
  star: { chip: STAR_CHIP, orch: STAR_ORCH },
};

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.noiseBuf = null;
    this.muted = false;

    this.song = null;
    this.songName = null;
    this.timer = null;
    this.nextStep = 0;
    this.stepTime = 0;
    this.lookahead = 0.025;   // s
    this.scheduleAhead = 0.12; // s
    this.musicStyle = 'chip';  // 'chip'(ピコピコ) | 'orchestra'(オーケストラ)
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    // 全体をまとめるコンプレッサー(豪華で安定した鳴り、クリップ防止)
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 22; comp.ratio.value = 3.2;
    comp.attack.value = 0.004; comp.release.value = 0.25;
    this.master.connect(comp); comp.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);

    // ホール残響(オーケストラ用のセンド。手続き的に生成したIR)
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this._makeReverbIR(2.4, 2.6);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.4;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.7;
    this.sfxGain.connect(this.master);

    // ノイズ波形(ドラム用)
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }
  // name → 現スタイルの曲データ(chip/orch)を選ぶ
  _variant(name) {
    const s = SONGS[name]; if (!s) return null;
    return (this.musicStyle === 'orchestra' ? s.orch : s.chip) || s.chip;
  }
  // 音楽スタイル切替(再生中なら即・別アレンジへ差し替え)
  setMusicStyle(style) {
    this.musicStyle = (style === 'orchestra') ? 'orchestra' : 'chip';
    if (this.songName) {
      this.song = this._variant(this.songName);
      if (this.song && this.nextStep >= this.song.steps) this.nextStep = 0;
    }
  }

  // 残響用インパルス応答(指数減衰ノイズ)を生成
  _makeReverbIR(seconds, decay) {
    const rate = this.ctx.sampleRate, len = Math.floor(rate * seconds);
    const ir = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return ir;
  }

  // --- 音楽再生 -----------------------------------------------------------
  playMusic(name) {
    if (!this.ctx) return;
    this.songName = name;
    this.song = this._variant(name);
    this.nextStep = 0;
    this.stepTime = this.ctx.currentTime + 0.08;
    if (!this.timer) this.timer = setInterval(() => this._schedule(), this.lookahead * 1000);
  }
  // 進行中に曲だけ差し替え(レース↔スター)
  switchMusic(name) {
    if (!this.ctx || this.songName === name) return;
    this.songName = name;
    this.song = this._variant(name);
    this.nextStep = 0;
  }
  stopMusic() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.song = null;
    this.songName = null;
  }

  _schedule() {
    if (!this.song || !this.ctx) return;
    while (this.stepTime < this.ctx.currentTime + this.scheduleAhead) {
      this._playStep(this.nextStep, this.stepTime);
      const stepDur = (60 / this.song.bpm) / 4;
      this.stepTime += stepDur;
      this.nextStep = (this.nextStep + 1) % this.song.steps;
    }
  }

  _playStep(step, t) {
    const s = this.song;
    const stepDur = (60 / s.bpm) / 4;
    const orch = s.style === 'orch' && this.reverb;
    for (const v of s.voices) {
      const r = v.fn(step);
      if (!r) continue;
      const notes = Array.isArray(r[0]) ? r : [r];
      for (const nn of notes) {
        const dur = nn[1] * stepDur * (orch ? 1.0 : 0.94);
        if (orch) this._orchVoice(t, midiFreq(nn[0]), dur, v.role || 'pad', v.gain);
        else this._tone(t, midiFreq(nn[0]), dur, v.type, v.gain);
      }
    }
    if (s.drums) {
      const d = s.drums(step);
      if (orch) {                                  // ティンパニ + シンバル(管弦楽)
        if (d.kick) this._timpani(t, 70);
        if (d.snare) this._timpani(t, 104);
        if (d.crash) this._noise(t, 1.2, 2600, 0.1);
      } else {
        if (d.kick) this._kick(t);
        if (d.snare) this._snare(t);
        if (d.hat) this._hat(t, d.kick ? 0.05 : 0.085);
        if (d.ohat) this._noise(t, 0.12, 6500, 0.06);
        if (d.crash) this._noise(t, 0.5, 4000, 0.12);
      }
    }
  }

  // オーケストラ風の発音(弦/金管/コントラバス/ピッツィカート)。残響センドへも送る
  _orchVoice(t, freq, dur, role, gainVal) {
    const ctx = this.ctx;
    let attack, rel, cutoff, detune, oscType = 'sawtooth', peak = gainVal * 1.5;
    if (role === 'pad' || role === 'harm') { attack = 0.16; rel = 0.5; cutoff = 2000; detune = 7; }       // 弦
    else if (role === 'bass') { attack = 0.05; rel = 0.2; cutoff = 700; detune = 0; }                     // 低弦
    else if (role === 'lead') { attack = 0.07; rel = 0.3; cutoff = 2800; detune = 4; peak = gainVal * 1.7; } // 金管
    else if (role === 'arp') { attack = 0.004; rel = 0.16; cutoff = 3200; detune = 0; oscType = 'triangle'; peak = gainVal * 1.2; } // ピッツィカート
    else { attack = 0.06; rel = 0.25; cutoff = 2400; detune = 4; }
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
    const out = ctx.createGain();
    const oscList = [];
    const mkOsc = (det) => {
      const o = ctx.createOscillator(); o.type = oscType; o.frequency.value = freq; o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + rel + 0.05); oscList.push(o);
    };
    mkOsc(-detune); if (detune) mkOsc(detune);
    if (role === 'pad' || role === 'harm' || role === 'lead') {   // やわらかいビブラート
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5; lg.gain.value = freq * 0.006; lfo.connect(lg);
      for (const o of oscList) lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + rel + 0.05);
    }
    lp.connect(out);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(peak, t + attack);
    if (role === 'arp') {
      out.gain.exponentialRampToValueAtTime(0.0001, t + attack + 0.16);   // 弾く=速い減衰
    } else {
      const susEnd = Math.max(t + attack + 0.02, t + dur);
      out.gain.setValueAtTime(peak, susEnd);
      out.gain.exponentialRampToValueAtTime(0.0001, susEnd + rel);
    }
    out.connect(this.musicGain);
    out.connect(this.reverb);
  }

  // ティンパニ(ピッチが落ちる柔らかい打撃 + マレットのアタックノイズ)
  _timpani(t, freq) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.6, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(this.musicGain);
    if (this.reverb) g.connect(this.reverb);
    o.start(t); o.stop(t + 0.55);
    this._noise(t, 0.05, 700, 0.05);
  }

  _tone(t, freq, dur, type, gainVal, dest) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gainVal, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _kick(t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.musicGain);
    o.start(t); o.stop(t + 0.18);
  }
  _noise(t, dur, hp, gainVal) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.musicGain);
    src.start(t); src.stop(t + dur + 0.02);
  }
  _snare(t) { this._noise(t, 0.16, 1400, 0.32); }
  _hat(t, gainVal) { this._noise(t, 0.04, 7000, gainVal); }

  // --- エンジン音(連続音。アクセル中に大きく、速度でピッチが上がる) -------
  startEngine() {
    if (!this.ctx || this.engine) return;
    const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 70;
    const o2 = this.ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 35; o2.detune.value = 5;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 2;
    const g = this.ctx.createGain(); g.gain.value = 0.0001;
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.sfxGain);
    o1.start(); o2.start();
    this.engine = { o1, o2, lp, g };
  }
  updateEngine(throttle, speedRatio) {
    if (!this.engine || !this.ctx) return;
    const t = this.ctx.currentTime, e = this.engine;
    const f = 52 + speedRatio * 190 + (throttle > 0 ? 14 : 0);
    e.o1.frequency.setTargetAtTime(f, t, 0.06);
    e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    e.lp.frequency.setTargetAtTime(420 + speedRatio * 1000 + (throttle > 0 ? 160 : 0), t, 0.07);
    // 控えめに(背景の唸り程度)。アクセル中だけ少し大きく。
    const target = (throttle > 0 ? 0.022 + speedRatio * 0.016 : 0.006 + speedRatio * 0.007);
    e.g.gain.setTargetAtTime(target, t, 0.05);
  }
  stopEngine() {
    if (!this.engine) return;
    const e = this.engine; this.engine = null;
    try {
      e.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
      e.o1.stop(this.ctx.currentTime + 0.2); e.o2.stop(this.ctx.currentTime + 0.2);
    } catch (err) { /* noop */ }
  }

  // --- 効果音 -------------------------------------------------------------
  _sfx(freqs, dur, type, gainVal, slide) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freqs[0], t);
    if (slide) {
      for (let i = 1; i < freqs.length; i++)
        o.frequency.exponentialRampToValueAtTime(freqs[i], t + (dur * i) / (freqs.length - 1));
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gainVal || 0.4, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  sfxPickup()   { this._sfx([660, 990, 1320], 0.22, 'square', 0.35, true); }
  sfxBoost()    { this._sfx([300, 900], 0.3, 'sawtooth', 0.35, true); }
  sfxHit()      { this._sfx([400, 80], 0.35, 'sawtooth', 0.45, true); }
  sfxShell()    { this._sfx([900, 500], 0.18, 'square', 0.3, true); }
  sfxDrop()     { this._sfx([500, 300], 0.12, 'triangle', 0.3, true); }
  sfxStar()     { this._sfx([784, 1047, 1319, 1568], 0.4, 'square', 0.4, true); }
  sfxSlow()     { this._sfx([1200, 200], 0.6, 'sine', 0.4, true); }
  sfxBeep()     { this._sfx([880], 0.15, 'square', 0.4, false); }
  // SFX用のノイズ(thud)。sfxGainへ。
  _sfxThud(gain, dur, lp) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp || 700;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain || 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.14));
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t); src.stop(t + (dur || 0.14) + 0.02);
  }
  // カート同士の衝突(ドン!)
  sfxBump(vol = 1) { this._sfx([240, 70], 0.15, 'square', 0.5 * vol, true); this._sfxThud(0.5 * vol, 0.18, 500); }
  sfxJump()   { this._sfx([320, 760, 1020], 0.26, 'square', 0.34, true); }
  sfxLand()   { this._sfxThud(0.42, 0.16, 600); this._sfx([520, 200], 0.12, 'sine', 0.3, true); }
  // 壁(レール)接触(ガッ)
  sfxWall()   { this._sfx([190, 90], 0.1, 'sawtooth', 0.34, true); this._sfxThud(0.32, 0.1, 900); }
  // レスキュー(復帰)
  sfxRescue() { this._sfx([300, 1000, 620], 0.45, 'sine', 0.4, true); }
  // グラップル・ダッシュ(発射→リール)
  sfxGrapple() { this._sfx([500, 1500], 0.12, 'square', 0.35, true); this._sfx([200, 1100], 0.4, 'sawtooth', 0.32, true); }
  sfxGo()       { this._sfx([523, 784, 1047], 0.5, 'square', 0.45, true); }
  sfxBomb()     { if (!this.ctx) this.init(); this._noise(this.ctx.currentTime, 0.4, 200, 0.5); this._sfx([200, 40], 0.4, 'sawtooth', 0.4, true); }
  sfxFinish()   {
    if (!this.ctx) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this._sfx([f], 0.25, 'square', 0.4, false), i * 120));
  }
}

const audio = new AudioSystem();
if (typeof window !== 'undefined') { window.audio = audio; window.SONGS = SONGS; }
