/* =========================================================================
 * game.js  ―  ゲーム本体(物理 / 描画 / アイテム / AI / ループ)
 * =======================================================================*/
'use strict';

// ---- ユーティリティ -------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
function angNorm(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const TAU = Math.PI * 2;
function fmtTime(s) {
  if (s == null || !isFinite(s)) return "--:--.--";
  const m = Math.floor(s / 60), sec = s % 60;
  return m + ":" + sec.toFixed(2).padStart(5, "0");
}
function ordinal(p) { const v = p % 100; const s = ["th", "st", "nd", "rd"]; return p + (s[(v - 20) % 10] || s[v] || s[0]); }
// 5速のトップ速度(baseMaxに対する割合) と km/h 換算
const GEAR_FRAC = [0, 0.24, 0.44, 0.63, 0.82, 1.0];
const NUM_GEARS = 5;
const KMH_PER_PX = 0.32;   // 表示用(px/s → km/h)
const HUMAN_BASE = 610;    // 人間の最高速(基準)
const JUMP_GRAV = 680;     // ジャンプの重力(高さの減速)
// CPUの強さ4段階(speed=最高速倍率, item=アイテム使用間隔の倍率(小さいほど多用))
const AI_DIFF = {
  weak:   { speed: 0.80, item: 1.9, label: '弱い' },
  normal: { speed: 0.93, item: 1.0, label: '普通' },
  strong: { speed: 1.00, item: 0.7, label: '強い' },
  super:  { speed: 1.08, item: 0.45, label: '超強い' },
};
// 沿道シーナリー(リッチ表示用)。コースidごとの種類
const SCENERY_BY_TRACK = {
  meadow: ['tree', 'tree', 'rock', 'tree'],
  sunshine: ['tree', 'tree', 'rock', 'tree'],
  dunes: ['cactus', 'rock', 'cactus', 'dune'],
  neon: ['pillar', 'sign', 'pillar', 'sign'],
  magma: ['lavarock', 'flame', 'lavarock', 'spike'],
  void: ['pillar', 'spike', 'pillar', 'sign'],
};

// 車種(後方視点シルエットの違い)。kindごとに翼/車体/タイヤ/キャビンを変える
const KART_KINDS = {
  // wing: big(F1二段) / spoiler(支柱付き) / lip(小リップ) / cage(ロールバー) / none
  // body: taper / kart / boxy / round / wide   cabin: helmet(オープン) / roof(屋根+リアガラス) / tall(背高屋根)
  f1:     { trk: 24, tireW: 14, wing: 'big',     body: 'taper', bw: 28, tw: 21, topY: -27, cabin: 'helmet', exh: 2, label: 'F1' },
  kart:   { trk: 21, tireW: 13, wing: 'none',    body: 'kart',  bw: 24, tw: 19, topY: -22, cabin: 'helmet', exh: 1, label: 'ゴーカート' },
  buggy:  { trk: 25, tireW: 18, wing: 'cage',    body: 'boxy',  bw: 30, tw: 25, topY: -24, cabin: 'helmet', exh: 2, label: 'バギー' },
  sport:  { trk: 21, tireW: 11, wing: 'lip',     body: 'round', bw: 30, tw: 22, topY: -26, cabin: 'roof',   exh: 2, label: 'スポーツ' },
  van:    { trk: 23, tireW: 11, wing: 'lip',     body: 'boxy',  bw: 33, tw: 30, topY: -31, cabin: 'tall',   exh: 1, label: 'ワゴン' },
  muscle: { trk: 25, tireW: 16, wing: 'spoiler', body: 'wide',  bw: 33, tw: 25, topY: -25, cabin: 'roof',   exh: 2, label: 'マッスル' },
};
// レーサー設定(色・名前・車種) — グランプリは最大20台。車種を混ぜて見た目に変化を出す
const RACERS = [
  { name: 'レッド',     body: '#e8412e', dark: '#a82518', kind: 'f1' },
  { name: 'ブルー',     body: '#2f7df0', dark: '#1c4fa8', kind: 'sport' },
  { name: 'イエロー',   body: '#f2c233', dark: '#b8901a', kind: 'buggy' },
  { name: 'グリーン',   body: '#34c24a', dark: '#1f8030', kind: 'van' },
  { name: 'パープル',   body: '#9b59f0', dark: '#6a32b0', kind: 'muscle' },
  { name: 'オレンジ',   body: '#ff8c1a', dark: '#c25e00', kind: 'kart' },
  { name: 'シアン',     body: '#1fc8d8', dark: '#138c98', kind: 'f1' },
  { name: 'ピンク',     body: '#ff5fa2', dark: '#c23070', kind: 'sport' },
  { name: 'ライム',     body: '#9bd62a', dark: '#6a9410', kind: 'buggy' },
  { name: 'シルバー',   body: '#c0c6cf', dark: '#7d828b', kind: 'muscle' },
  { name: 'ネイビー',   body: '#3a4a8c', dark: '#22305c', kind: 'van' },
  { name: 'ティール',   body: '#1aa890', dark: '#0e6b5c', kind: 'kart' },
  { name: 'マゼンタ',   body: '#e22ccd', dark: '#9b1a8c', kind: 'f1' },
  { name: 'ゴールド',   body: '#d4af2a', dark: '#9a7c12', kind: 'sport' },
  { name: 'ブラウン',   body: '#9c6b3f', dark: '#684525', kind: 'buggy' },
  { name: 'スカイ',     body: '#5ec8ff', dark: '#2a8fcc', kind: 'van' },
  { name: 'コーラル',   body: '#ff7a5e', dark: '#c24e38', kind: 'muscle' },
  { name: 'ミント',     body: '#5ee8b0', dark: '#2ca878', kind: 'kart' },
  { name: 'ラベンダー', body: '#b89bf0', dark: '#7a5fc0', kind: 'f1' },
  { name: 'クリムゾン', body: '#c01535', dark: '#820a20', kind: 'sport' },
];

// アイテム定義(順位に応じた抽選重み)
const ITEMS = ['banana', 'green', 'red', 'mushroom', 'star', 'bomb', 'grapple'];
const ITEM_LABEL = {
  banana: 'バナナ', green: 'グリーンボール', red: 'レッドボール',
  mushroom: 'キノコ', star: 'スター', bomb: 'ボムへい', grapple: 'グラップル',
};

// ============================ Track =======================================
class Track {
  constructor(def, mirror = false) {
    this.def = def;
    this.mirror = mirror;
    this.tile = def.tile;
    this.theme = def.theme;
    this.hazardType = def.hazardType || 'none';
    this.laps = def.laps || 3;
    this.cols = def.cols; this.rows = def.rows;
    this.w = this.cols * this.tile; this.h = this.rows * this.tile;
    this.roadHalf = def.roadHalf * this.tile;
    this.shoulder = def.shoulder * this.tile;
    this.wallDist = this.roadHalf + this.shoulder;       // ここを越えるとレール(壁)
    // ミラーモード: コース全体を左右反転(X座標を反転)。すべての座標に一貫適用。
    const M = mirror ? ([c, r]) => [this.cols - c, r] : ([c, r]) => [c, r];
    // 中心線(粗) world px
    this.wps = def.waypoints.map(M).map(([c, r]) => ({ x: c * this.tile, y: r * this.tile }));
    // 滑らかな密ポリライン(Catmull-Rom 閉曲線)
    this.pathSeg = 12;                                 // waypoint間の分割数
    this.path = this._buildPath(this.wps, this.pathSeg);
    // ミニマップ用の範囲
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (const p of this.path) { bx0 = Math.min(bx0, p.x); by0 = Math.min(by0, p.y); bx1 = Math.max(bx1, p.x); by1 = Math.max(by1, p.y); }
    const mg = this.tile * 2;
    this.bounds = { minX: bx0 - mg, minY: by0 - mg, maxX: bx1 + mg, maxY: by1 + mg };
    this.itemBoxes = (def.items || []).map(M).map(([c, r]) => ({ x: c * this.tile, y: r * this.tile, active: true, t: 0 }));
    this.boosts = (def.boosts || []).map(M).map(([c, r]) => ({ x: c * this.tile, y: r * this.tile }));
    this.hazards = (def.hazards || []).map(M).map(([c, r]) => ({ x: c * this.tile, y: r * this.tile }));
    this.boostR = this.tile * 1.0;
    this.hazardR = this.tile * 1.1;
    // ライフ回復ゾーン(F-ZERO風ピット。少し長め)
    this.recover = (def.recover || []).map(M).map(([c, r]) => ({ x: c * this.tile, y: r * this.tile }));
    this.recoverR = this.tile * 2.4;
    // ジャンプ台(踏むと空中へ。設置物方式)
    this.ramps = (def.ramps || []).map(M).map(([c, r]) => ({ x: c * this.tile, y: r * this.tile }));
    this.rampR = this.tile * 0.5;   // ジャンプ台に到達した瞬間に飛ぶよう判定を狭める
    // コース欠損(奈落)。グラウンド状態でここに来ると落下→手前に戻る。空中ならすり抜け。
    this.gaps = (def.gaps || []).map(M).map(([c, r]) => ({ x: c * this.tile, y: r * this.tile }));
    this.gapR = this.tile * 0.7;
    // 分岐路(本線から分かれて再合流するもう一つの道)。本線と同じ幅の走路として描画/判定。
    this.branchPaths = (def.branches || []).map((b) =>
      this._buildPath(b.map(M).map(([c, r]) => ({ x: c * this.tile, y: r * this.tile })), this.pathSeg, true));
    // 突風(横風)ゾーン: 乗っているとカートが dx,dy 方向へ流される(新ギミック)。
    this.winds = (def.winds || []).map((w) => {
      const [c, r] = M([w.x, w.y]);
      let dx = w.dx, dy = w.dy;
      if (mirror) dx = -dx;                       // X反転に合わせて横風も左右反転
      const L = Math.hypot(dx, dy) || 1;
      return { x: c * this.tile, y: r * this.tile, dx: dx / L, dy: dy / L };
    });
    this.windR = this.tile * 2.2;                 // 風ゾーンの半径
    this.windForce = def.windForce || 130;        // 流される強さ(px/s)
    // ワープ(瞬間移動)ゲート: entry に触れると exit へテレポート(新ギミック)。
    this.warps = (def.warps || []).map((w) => {
      const [ex, ey] = M([w.ex, w.ey]); const [tx, ty] = M([w.tx, w.ty]);
      return { ex: ex * this.tile, ey: ey * this.tile, tx: tx * this.tile, ty: ty * this.tile };
    });
    this.warpR = this.tile * 1.3;
    // 「島」方式: islands=描画する走路の区間(waypoint範囲)。区間の間の本線はvoid(空白=ワープ必須)。
    this.islands = def.islands || null;
    this.voidRanges = [];   // void になるセグメントindexの範囲
    if (this.islands) {
      const ps = this.pathSeg, N = this.path.length;
      for (let k = 0; k < this.islands.length; k++) {
        const endPt = this.islands[k][1] * ps;
        const nextStartPt = this.islands[(k + 1) % this.islands.length][0] * ps;
        this.voidRanges.push({ a: endPt % N, b: ((nextStartPt - 1) % N + N) % N });
      }
    }
    // ミニマップが切れないよう、分岐路/ワープ点も表示範囲(bounds)に含める
    const mg2 = this.tile * 2;
    const expand = (x, y) => {
      this.bounds.minX = Math.min(this.bounds.minX, x - mg2); this.bounds.minY = Math.min(this.bounds.minY, y - mg2);
      this.bounds.maxX = Math.max(this.bounds.maxX, x + mg2); this.bounds.maxY = Math.max(this.bounds.maxY, y + mg2);
    };
    for (const bp of this.branchPaths) for (const p of bp) expand(p.x, p.y);
    for (const w of this.warps) { expand(w.ex, w.ey); expand(w.tx, w.ty); }
    this._buildScenery(def);
    // 大コースでもメモリを抑えるためベイク画像は縮小解像度(最長辺~3000px)
    this.bakeScale = Math.min(0.7, 3000 / Math.max(this.w, this.h));
    this._bake();
  }

  // 沿道の装飾(リッチ表示でのみ描画)。走路の外側(レールの先)に並べる。
  _buildScenery(def) {
    this.scenery = [];
    if (this.islands) return;   // 島方式(宇宙に点在)は沿道装飾なし(空白に木が並ばないように)
    const kinds = SCENERY_BY_TRACK[def.id] || ['tree'];
    const P = this.path, n = P.length, tile = this.tile;
    const place = (a, px, py, side, near) => {
      const off = this.wallDist + tile * (near ? 0.6 + Math.random() * 1.6 : 2.4 + Math.random() * 3.4);
      this.scenery.push({
        x: a.x + px * side * off, y: a.y + py * side * off,
        kind: kinds[(Math.random() * kinds.length) | 0],
        s: (near ? 0.8 : 1.1) + Math.random() * 0.7, ph: Math.random() * 6.28,
      });
    };
    for (let i = 0; i < n; i += 3) {                 // 沿道をより密に(リッチ表示で奥行き感)
      const a = P[i], b = P[(i + 1) % n];
      let dx = b.x - a.x, dy = b.y - a.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const px = -dy, py = dx;
      for (const side of [-1, 1]) {
        if (Math.random() < 0.82) place(a, px, py, side, true);
        if (Math.random() < 0.45) place(a, px, py, side, false);   // 奥に大きめをもう一列
      }
    }
  }

  _buildPath(pts, seg, open) {
    const n = pts.length, out = [];
    const cr = (p0, p1, p2, p3, t) => {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };
    const idx = open ? (j) => Math.max(0, Math.min(n - 1, j)) : (j) => (j % n + n) % n;
    const last = open ? n - 1 : n;   // open: 端点間のセグメントのみ(ループしない)
    for (let i = 0; i < last; i++) {
      const p0 = pts[idx(i - 1)], p1 = pts[idx(i)], p2 = pts[idx(i + 1)], p3 = pts[idx(i + 2)];
      for (let s = 0; s < seg; s++) {
        const t = s / seg;
        out.push({ x: cr(p0.x, p1.x, p2.x, p3.x, t), y: cr(p0.y, p1.y, p2.y, p3.y, t) });
      }
    }
    if (open) out.push({ x: pts[n - 1].x, y: pts[n - 1].y });   // 終端点を含める
    return out;
  }
  // 点から開いたポリラインまでの最短距離(分岐路用)
  _distToPoly(x, y, P) {
    let best = 1e18;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const abx = b.x - a.x, aby = b.y - a.y, L = abx * abx + aby * aby || 1;
      let t = ((x - a.x) * abx + (y - a.y) * aby) / L; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = a.x + abx * t - x, dy = a.y + aby * t - y; const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  }
  // 走路の通路までの最短距離(本線 + 分岐路)。表面判定・壁判定に使う(進捗は本線のみ)。
  _corridorDist(x, y) {
    let d = this._distInfo(x, y).d;
    if (this.branchPaths) for (const bp of this.branchPaths) { const bd = this._distToPoly(x, y, bp); if (bd < d) d = bd; }
    return d;
  }

  // 中心線までの最短距離
  _distInfo(x, y) {
    let best = 1e18, bi = 0;
    const P = this.path, n = P.length;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      const abx = b.x - a.x, aby = b.y - a.y;
      const L = abx * abx + aby * aby || 1;
      let t = ((x - a.x) * abx + (y - a.y) * aby) / L; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = a.x + abx * t - x, dy = a.y + aby * t - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) { best = d2; bi = i; }
    }
    return { d: Math.sqrt(best), i: bi };
  }

  surfaceAt(x, y) {
    for (const rc of this.recover) if ((x - rc.x) ** 2 + (y - rc.y) ** 2 < this.recoverR * this.recoverR) return 'recover';
    for (const b of this.boosts) if ((x - b.x) ** 2 + (y - b.y) ** 2 < this.boostR * this.boostR) return 'boost';
    for (const h of this.hazards) if ((x - h.x) ** 2 + (y - h.y) ** 2 < this.hazardR * this.hazardR) return 'hazard';
    for (const gp of this.gaps) if ((x - gp.x) ** 2 + (y - gp.y) ** 2 < this.gapR * this.gapR) return 'gap';
    const di = this._distInfo(x, y);
    let d = di.d, onBranch = false;
    if (this.branchPaths) for (const bp of this.branchPaths) { const bd = this._distToPoly(x, y, bp); if (bd < d) { d = bd; onBranch = true; } }
    // 本線のこの区間が「空白(void)」なら落下(=ワープでしか越えられない)。分岐路上は除く。
    if (!onBranch && this.voidRanges.length && di.d <= this.wallDist && this._inVoid(di.i)) return 'gap';
    if (d <= this.roadHalf) return 'road';
    if (d <= this.wallDist) return 'grass';
    return 'wall';
  }
  _inVoid(i) {
    for (const r of this.voidRanges) {
      if (r.a <= r.b) { if (i >= r.a && i <= r.b) return true; }
      else if (i >= r.a || i <= r.b) return true;   // ループ境界をまたぐ範囲
    }
    return false;
  }
  isWallPt(x, y) {
    if (x < 0 || y < 0 || x > this.w || y > this.h) return true;
    return this._corridorDist(x, y) > this.wallDist;
  }
  isBlocked(x, y, r) {
    r = r || 17;
    return this.isWallPt(x, y) || this.isWallPt(x + r, y) || this.isWallPt(x - r, y) ||
      this.isWallPt(x, y + r) || this.isWallPt(x, y - r);
  }
  // 最寄りの中心線上の点と進行方向(レスキュー用)
  nearestOnPath(x, y) {
    const info = this._distInfo(x, y);
    const P = this.path, n = P.length;
    const a = P[info.i], b = P[(info.i + 1) % n];
    const abx = b.x - a.x, aby = b.y - a.y, L = abx * abx + aby * aby || 1;
    let t = ((x - a.x) * abx + (y - a.y) * aby) / L; t = t < 0 ? 0 : t > 1 ? 1 : t;
    // 少し先に置いて壁に再接触しにくくする
    const c = P[(info.i + 2) % n];
    return { x: a.x + abx * t, y: a.y + aby * t, angle: Math.atan2(c.y - a.y, c.x - a.x), seg: info.i };
  }

  // 走路を一度だけオフスクリーンに描画(縮小解像度)
  _bake() {
    const bs = this.bakeScale;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(this.w * bs); cv.height = Math.ceil(this.h * bs);
    const g = cv.getContext('2d');
    g.scale(bs, bs);   // 以降は world px で描けば縮小されて格納される
    const th = this.theme, P = this.path, tile = this.tile;

    // 場外(レールの外)
    g.fillStyle = th.grassDk; g.fillRect(0, 0, this.w, this.h);

    const strokeOf = (pts, w, color, dash, closed) => {
      g.lineWidth = w; g.strokeStyle = color; g.lineJoin = 'round'; g.lineCap = 'round';
      g.setLineDash(dash || []);
      g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      if (closed) g.closePath();
      g.stroke();
      g.setLineDash([]);
    };
    // 本線+分岐路を「層ごと」に重ねて描く(走路が芝生の上に来るように)
    const branches = this.branchPaths || [];
    const layers = [
      [(this.wallDist + tile * 0.22) * 2, th.wall],          // ガードレール
      [this.wallDist * 2, th.grass],                         // 芝生(路肩)
      [(this.roadHalf + tile * 0.16) * 2, th.curb1],         // 縁石(走路フチ)
      [this.roadHalf * 2, th.road],                          // 走路
    ];
    // islands があれば島の区間だけ走路を描く(間は空白=描かない)。無ければ従来どおり全周。
    const runs = this.islands ? this.islands.map(([a, b]) => [a * this.pathSeg, b * this.pathSeg]) : null;
    const strokeRanges = (w, c, dash) => {
      if (runs) {
        for (const [s, e] of runs) { const pts = []; for (let i = s; i <= e; i++) pts.push(P[i % P.length]); strokeOf(pts, w, c, dash, false); }
      } else strokeOf(P, w, c, dash, true);
    };
    for (const [w, c] of layers) {
      strokeRanges(w, c, null);
      for (const bp of branches) strokeOf(bp, w, c, null, false);
    }
    strokeRanges(tile * 0.09, th.line, [tile * 0.55, tile * 0.55]);   // センターライン(破線)
    for (const bp of branches) strokeOf(bp, tile * 0.09, th.line, [tile * 0.55, tile * 0.55], false);

    this._bakeGaps(g);   // コース欠損(奈落)を走路の上に描く=道が途切れて見える
    this._bakeWinds(g);  // 突風ゾーン(流れる矢印)を描く
    this._bakeWarps(g);  // ワープゲート(入口/出口のポータル)を描く
    this._bakeStart(g);
    for (const rc of this.recover) this._bakeRecover(g, rc);
    for (const b of this.boosts) this._bakeBoost(g, b);
    for (const h of this.hazards) this._bakeHazard(g, h);

    this.canvas = cv;
  }

  _pathDir(i) {
    const P = this.path, n = P.length;
    const a = P[i % n], b = P[(i + 3) % n];
    return Math.atan2(b.y - a.y, b.x - a.x);
  }
  _bakeStart(g) {
    const a = this.path[0], ang = this._pathDir(0);
    g.save(); g.translate(a.x, a.y); g.rotate(ang);
    const wlen = this.roadHalf * 2, depth = this.tile * 0.85, rows = 2, cols = 10;
    const ch = wlen / cols, cd = depth / rows;
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        g.fillStyle = ((i + j) & 1) ? '#111' : '#fff';
        g.fillRect(-depth / 2 + i * cd, -wlen / 2 + j * ch, cd, ch);
      }
    g.restore();
  }
  _bakeBoost(g, b) {
    const info = this._distInfo(b.x, b.y);
    const ang = this._pathDir(info.i);
    g.save(); g.translate(b.x, b.y); g.rotate(ang);
    const w = this.roadHalf * 1.6, h = this.tile * 1.4;
    g.fillStyle = this.theme.boost; g.globalAlpha = 0.9;
    g.fillRect(-h / 2, -w / 2, h, w); g.globalAlpha = 1;
    g.fillStyle = 'rgba(255,255,255,0.92)';
    for (let k = 0; k < 3; k++) {
      const ox = -h / 2 + 10 + k * (h / 3);
      g.beginPath();
      g.moveTo(ox, -w / 2 + 8); g.lineTo(ox + 16, 0); g.lineTo(ox, w / 2 - 8);
      g.lineTo(ox + 6, w / 2 - 8); g.lineTo(ox + 22, 0); g.lineTo(ox + 6, -w / 2 + 8);
      g.closePath(); g.fill();
    }
    g.restore();
  }
  // コース欠損(奈落)。走路+路肩をまたぐ深い谷として描き、はっきり崖に見えるようにする。
  _bakeGaps(g) {
    if (!this.gaps || !this.gaps.length) return;
    // 穴のクラスタごと(進行方向の近い点をまとめて1つの谷として描く)
    const used = new Array(this.gaps.length).fill(false);
    for (let s = 0; s < this.gaps.length; s++) {
      if (used[s]) continue;
      const cluster = [this.gaps[s]]; used[s] = true;
      for (let j = s + 1; j < this.gaps.length; j++) {
        if (used[j]) continue;
        if (Math.abs(this.gaps[j].x - this.gaps[s].x) < this.tile * 6 && Math.abs(this.gaps[j].y - this.gaps[s].y) < this.tile * 6) {
          cluster.push(this.gaps[j]); used[j] = true;
        }
      }
      this._bakeOneGap(g, cluster);
    }
  }
  _bakeOneGap(g, gaps) {
    const tile = this.tile;
    let cx = 0, cy = 0; for (const p of gaps) { cx += p.x; cy += p.y; } cx /= gaps.length; cy /= gaps.length;
    const ang = this._pathDir(this._distInfo(cx, cy).i);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    let lo = 1e9, hi = -1e9;                          // 進行方向に投影した穴の広がり
    for (const p of gaps) { const t = (p.x - cx) * ca + (p.y - cy) * sa; if (t < lo) lo = t; if (t > hi) hi = t; }
    const len = (hi - lo) + this.gapR * 2.2;
    const halfW = this.wallDist + tile * 0.3;         // 路肩の外まで覆う=道幅いっぱいの谷
    g.save(); g.translate(cx, cy); g.rotate(ang);
    // 谷の本体: 中央ほど暗い深さグラデ(奈落の深さを表現)
    const deep = g.createLinearGradient(-len / 2, 0, len / 2, 0);
    deep.addColorStop(0, '#11203f'); deep.addColorStop(0.5, '#020512'); deep.addColorStop(1, '#11203f');
    g.fillStyle = deep; g.fillRect(-len / 2, -halfW, len, halfW * 2);
    // さらに中心を黒く落とす(底なし感)
    const core = g.createLinearGradient(0, -halfW, 0, halfW);
    core.addColorStop(0, 'rgba(0,0,0,0)'); core.addColorStop(0.5, 'rgba(0,0,0,0.55)'); core.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = core; g.fillRect(-len * 0.32, -halfW, len * 0.64, halfW * 2);
    // 破断したアスファルトのギザギザ縁(手前=+lo側 と 奥=+hi側)。明るいリップで段差を強調。
    const acc = this.theme.accent || '#ff5ec4';
    const edge = (sx, dir) => {
      g.fillStyle = this.theme.road || '#333';
      g.beginPath(); g.moveTo(sx, -halfW);
      let yy = -halfW; let k = 0;
      while (yy < halfW) {
        const jut = dir * tile * (0.18 + 0.18 * (k % 2));   // ギザギザの出っ張り
        g.lineTo(sx + jut, yy + tile * 0.18);
        g.lineTo(sx, yy + tile * 0.36);
        yy += tile * 0.36; k++;
      }
      g.lineTo(sx, halfW); g.lineTo(sx - dir * tile * 0.5, halfW); g.lineTo(sx - dir * tile * 0.5, -halfW); g.closePath(); g.fill();
      g.fillStyle = acc; g.fillRect(sx - dir * tile * 0.06, -halfW, tile * 0.12, halfW * 2);  // 光る縁
    };
    edge(-len / 2 + tile * 0.1, 1);     // 手前の崖っぷち
    edge(len / 2 - tile * 0.1, -1);     // 奥の崖っぷち
    // 落下していく道路の破片(浮遊する板)
    g.fillStyle = 'rgba(150,170,230,0.45)';
    for (let i = 0; i < 6; i++) g.fillRect((-0.34 + 0.13 * i) * len, (-0.55 + 0.22 * (i % 4)) * halfW, tile * 0.3, tile * 0.13);
    g.restore();
  }
  // ワープゲート: 入口(マゼンタ寄り)と出口(シアン寄り)に渦巻くポータルを描く。
  _bakeWarps(g) {
    if (!this.warps || !this.warps.length) return;
    const tile = this.tile, R = this.warpR;
    const portal = (x, y, entry) => {
      const RV = R * 1.7;                            // 見た目は判定より一回り大きく(遠くからでも分かる)
      g.save(); g.translate(x, y);
      const halo = g.createRadialGradient(0, 0, RV * 0.2, 0, 0, RV * 1.25);   // 外周グロー
      halo.addColorStop(0, entry ? 'rgba(255,77,210,0.55)' : 'rgba(125,240,255,0.55)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(0, 0, RV * 1.25, 0, TAU); g.fill();
      g.fillStyle = 'rgba(8,3,22,0.88)'; g.beginPath(); g.arc(0, 0, RV * 0.95, 0, TAU); g.fill();  // 渦の暗い穴
      for (let i = 0; i < 5; i++) {                  // 同心の明るいリング(太め)
        g.beginPath(); g.arc(0, 0, RV * (0.92 - i * 0.17), 0, TAU);
        g.lineWidth = tile * 0.2; g.globalAlpha = 1 - i * 0.13;
        g.strokeStyle = (i % 2 === 0) === entry ? '#ff4dd2' : '#7df0ff';   // 入口=マゼンタ基調 / 出口=シアン基調
        g.stroke();
      }
      g.globalAlpha = 1; g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(0, 0, RV * 0.16, 0, TAU); g.fill();            // 中心の白い光点
      g.restore();
    };
    for (const w of this.warps) { portal(w.ex, w.ey, true); portal(w.tx, w.ty, false); }
  }
  // 突風(横風)ゾーン: 風向きへ流れる矢印の筋を描く(乗ると流される合図)。
  _bakeWinds(g) {
    if (!this.winds || !this.winds.length) return;
    const tile = this.tile, R = this.windR;
    for (const w of this.winds) {
      g.save(); g.translate(w.x, w.y); g.rotate(Math.atan2(w.dy, w.dx));
      const grd = g.createLinearGradient(-R, 0, R, 0);    // 風向きに向かって明るくなる帯
      grd.addColorStop(0, 'rgba(150,220,255,0.10)'); grd.addColorStop(1, 'rgba(150,220,255,0.30)');
      g.fillStyle = grd;
      g.beginPath(); g.ellipse(0, 0, R * 1.15, R * 0.95, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(220,245,255,0.9)'; g.lineWidth = tile * 0.12; g.lineCap = 'round';
      for (let i = -3; i <= 3; i++) {            // 風向きへ流れる矢印を多めに(はっきり)
        const yy = i * R * 0.26, x0 = -R * 0.8, x1 = R * 0.8;
        g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, yy); g.stroke();
        g.beginPath(); g.moveTo(x1, yy); g.lineTo(x1 - tile * 0.34, yy - tile * 0.2);
        g.moveTo(x1, yy); g.lineTo(x1 - tile * 0.34, yy + tile * 0.2); g.stroke();
      }
      g.restore();
    }
  }
  // ライフ回復ピット(走路をまたぐ長めの緑ストライプ + 十字マーク)
  _bakeRecover(g, rc) {
    const info = this._distInfo(rc.x, rc.y);
    const ang = this._pathDir(info.i);
    g.save(); g.translate(rc.x, rc.y); g.rotate(ang);
    const w = this.roadHalf * 2, len = this.recoverR * 1.7;   // 進行方向に長い帯
    g.fillStyle = 'rgba(60,230,120,0.42)'; g.fillRect(-len / 2, -w / 2, len, w);
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = this.tile * 0.12;
    g.strokeRect(-len / 2, -w / 2, len, w);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    const cs = this.tile * 0.5, n = Math.max(2, Math.round(len / (this.tile * 1.3)));
    for (let k = 0; k < n; k++) {
      const cx = -len / 2 + (k + 0.5) * (len / n);
      g.fillRect(cx - cs * 0.16, -cs / 2, cs * 0.32, cs);     // 十字(＋ = 回復)
      g.fillRect(cx - cs / 2, -cs * 0.16, cs, cs * 0.32);
    }
    g.restore();
  }
  _bakeHazard(g, h) {
    g.save(); g.translate(h.x, h.y);
    g.fillStyle = this.theme.hazard; g.globalAlpha = 0.82;
    g.beginPath(); g.ellipse(0, 0, this.hazardR, this.hazardR * 0.8, 0, 0, TAU); g.fill();
    g.globalAlpha = 1;
    if (this.hazardType === 'ice') {
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-26, 0); g.lineTo(26, 0); g.moveTo(0, -22); g.lineTo(0, 22); g.stroke();
    } else {
      g.fillStyle = 'rgba(120,90,200,0.35)';
      g.beginPath(); g.ellipse(0, 0, this.hazardR * 0.6, this.hazardR * 0.45, 0, 0, TAU); g.fill();
    }
    g.restore();
  }
}

// ============================ Kart ========================================
class Kart {
  constructor(opts) {
    this.id = opts.id;
    this.def = RACERS[opts.id % RACERS.length];
    this.name = this.def.name;
    this.isHuman = opts.isHuman;
    this.controls = opts.controls || null; // 1P/2Pキー割当
    this.x = opts.x; this.y = opts.y; this.angle = opts.angle;

    this.speed = 0;
    this.baseMax = this.isHuman ? 610 : 565;   // 大コース向けに速め。AIは少し控えめ
    this.accel = 1020;                         // 発進をパンチの効いた加速に
    this.reverseMax = -170;
    this.turnRate = 2.0;                       // 旋回はマイルドに(曲がりすぎ防止)
    this.steerSmooth = 0;                      // ハンドル入力の平滑化
    this.gear = 1;                             // 現在ギア(1..5)
    this.trans = 'auto';                       // 'auto' | 'semi' | 'manual'
    this.bumpTimer = 0;                        // 衝突演出(画面シェイク)用
    this.airZ = 0; this.airVz = 0;             // ジャンプ(空中の高さ/上昇速度)
    this.maxLife = 100; this.life = 100;       // ライフ(耐久力)。0以下で爆発
    this.hurtCd = 0;                           // 連続ダメージの間隔
    this.hurtFlash = 0;                        // 被ダメージ表示
    this._exploded = false;                    // 人間: 爆発して脱落(操作不能)
    this._retired = false;                     // CPU: 爆発してリタイヤ(消滅)
    this.kbx = 0; this.kby = 0;                // ノックバック速度(跳ね返り)
    this.wallHitCd = 0;                        // 壁ヒット音の連発防止
    this._progBest = 0;                        // これまでの最大前進量
    this._stuckTimer = 0;                      // 前進できていない継続時間(レスキュー判定)
    this._pinTimer = 0;                        // アクセル中なのに動けていない時間(デッドロック検出)
    this._lastX = this.x; this._lastY = this.y;
    this.rescueFlash = 0;                      // レスキュー表示
    this.fireFlash = 0;                        // アイテム発射光
    this.dashTimer = 0;                        // グラップル・ダッシュ
    this.dashTarget = null;
    this.assist = false;                       // 1人プレイ時の操作アシスト

    this.boostTimer = 0;
    this.invincTimer = 0;   // スター
    this.spinTimer = 0;     // スピンアウト
    this.spinAngle = 0;
    this.hop = 0;
    this.drifting = false;
    this.driftDir = 0;
    this.driftCharge = 0;

    this.item = null;
    this.itemFlash = 0;
    this.dropImmune = 0;    // 自分が置いたバナナへの一時無敵

    // 周回管理(中心線上の連続位置で判定)
    this._lastSeg = null;  // 直前フレームの最寄りpathセグメント
    this._prog = 0;        // 連続進捗(順位用)
    this._passedHalf = false; // コース中間を通過したか(誤カウント防止)
    this.lapCount = 0;     // 完了ラップ数
    this.finished = false;
    this.finishTime = 0;
    this.progress = 0;
    this.place = 1;
    this.bestLap = null;   // ベストラップ(タイムアタック用)
    this.lastLapTime = 0;
    this._lapStart = 0;

    // AI用
    this.aiItemTimer = 1 + Math.random() * 2;
    this.aiJitter = (Math.random() - 0.5) * 0.4;

    this.control = { throttle: 0, steer: 0, drift: false, item: false };
  }

  // ダメージを与える。無敵(スター/復帰/ダッシュ)中・爆発中は無効。0以下で爆発。
  hurt(amount, game) {
    if (!game.lifeOn || this.gone || this.invincTimer > 0 || this.dashTimer > 0 || this.finished) return;
    let scale;
    if (this.isHuman) scale = game.playerDamageScale;
    else if (game.cpuDamageRandom) {                          // CPUごとに一度だけランダム倍率を割り当て
      if (this._cpuDmgScale == null) this._cpuDmgScale = game._rollCpuDmg(game.cpuDamageRandom);
      scale = this._cpuDmgScale;
    } else scale = game.cpuDamageScale;
    const dmg = amount * (scale != null ? scale : 1);
    if (dmg <= 0) return;                                                       // ダメージなし(0倍/無敵CPU)
    this.life -= dmg;
    this.hurtFlash = Math.min(0.5, this.hurtFlash + 0.16);
    if (this.life <= 0) { this.life = 0; game.explodeKart(this); }
  }

  get gone() { return this._exploded || this._retired; }   // レースから外れた(爆発/リタイヤ)
  get radius() { return 30; }       // 壁(レール)用の半径
  get bodyR() { return 76; }        // カート同士の当たり判定(疑似3Dで大きく描画される見た目に合わせて広め)

  update(dt, game, ts) {
    ts = ts == null ? 1 : ts;          // タイムスロー係数
    const sdt = dt * ts;               // 物理用の実時間
    const T = game.track;

    if (this.invincTimer > 0) this.invincTimer -= dt;
    if (this.boostTimer > 0) this.boostTimer -= sdt;
    if (this.dropImmune > 0) this.dropImmune -= dt;
    if (this.itemFlash > 0) this.itemFlash -= dt;
    if (this.bumpTimer > 0) this.bumpTimer -= dt;
    if (this.wallHitCd > 0) this.wallHitCd -= dt;
    if (this.rescueFlash > 0) this.rescueFlash -= dt;
    if (this.fireFlash > 0) this.fireFlash -= dt;
    if (this.hurtCd > 0) this.hurtCd -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.hop > 0) this.hop = Math.max(0, this.hop - dt * 3);

    let c = this.control;

    // スピンアウト中は操作不能
    if (this.spinTimer > 0) {
      this.spinTimer -= dt;
      this.spinAngle += 16 * dt;
      this.speed *= (1 - 1.6 * sdt);
      c = { throttle: 0, steer: 0, drift: false, item: false };
    } else {
      this.spinAngle = 0;
      // アイテム使用
      if (c.item && this.item) game.useItem(this);
    }

    // グラップル・ダッシュ中: ターゲットへロックオンして高速移動(通常操作は無効)
    const dashing = this.dashTimer > 0;
    if (dashing) {
      this.dashTimer -= dt;
      this.drifting = false; this.spinTimer = 0;
      if (this.dashTarget) {
        const want = Math.atan2(this.dashTarget.y - this.y, this.dashTarget.x - this.x);
        this.angle += angNorm(want - this.angle) * Math.min(1, 10 * dt);
        if (dist2(this.x, this.y, this.dashTarget.x, this.dashTarget.y) < 70 * 70) this.dashTimer = Math.min(this.dashTimer, 0.04);
      }
      if (Math.random() < 0.9) game.spawnParticle(this.x - Math.cos(this.angle) * 18, this.y - Math.sin(this.angle) * 18, Math.random() < 0.5 ? '#5ef2ff' : '#fff', 'boost');
    }

    const countdown = game.state === 'countdown';
    let surf = T.surfaceAt(this.x, this.y);
    const throttle = countdown ? 0 : c.throttle;
    const sp0 = Math.abs(this.speed);

    // ===== ジャンプ台 / 空中 =====
    if (this.airZ > 0 || this.airVz > 0) {            // 空中(放物線)
      this.airVz -= JUMP_GRAV * dt;
      this.airZ += this.airVz * dt;
      if (this.airZ <= 0) {                           // 着地
        this.airZ = 0; this.airVz = 0;
        this.boostTimer = Math.max(this.boostTimer, 0.4);   // 着地でちょいブースト(ご褒美)
        audio.sfxLand();
        for (let p = 0; p < 10; p++) game.spawnParticle(this.x, this.y, p % 2 ? '#fff' : '#ffd23f', 'boost');
      }
    } else if (!countdown && this.spinTimer <= 0 && sp0 > 70) {   // ジャンプ台に「触れた瞬間」に発進
      // 中心ではなく車体の先端(進行方向のノーズ)で判定する。中心で見ると車体半分が
      // ランプを通り過ぎてから飛ぶ=「乗ってから遅れて飛ぶ」感じになるため。
      const cosA = Math.cos(this.angle), sinA = Math.sin(this.angle);
      const nx = this.x + cosA * this.bodyR, ny = this.y + sinA * this.bodyR;  // 先端
      const rr = T.rampR * T.rampR;
      for (const rp of T.ramps) {
        if (dist2(nx, ny, rp.x, rp.y) < rr || dist2(this.x, this.y, rp.x, rp.y) < rr) {
          // 進行方向すぐ先に奈落があるジャンプ台は強力に飛ばす(広い崖を確実に越える)
          let big = false;
          for (const gp of T.gaps) {
            const dx = gp.x - this.x, dy = gp.y - this.y;
            const along = dx * cosA + dy * sinA, perp = Math.abs(-dx * sinA + dy * cosA);
            if (along > -T.tile && along < T.tile * 8 && perp < T.tile * 4.5) { big = true; break; }
          }
          this.airVz = big ? (235 + Math.min(sp0, this.baseMax) * 0.22) : (165 + Math.min(sp0, this.baseMax) * 0.12);
          this.airZ = 0.5;
          audio.sfxJump();
          break;
        }
      }
    }
    if (this.airZ > 0) surf = 'air';                  // 空中は芝生/ハザード/奈落の影響を受けずすり抜け
    // ワープ(瞬間移動)ゲート: 先端が入口に触れたら出口へテレポート。奈落判定より先に処理。
    this._warpCd = (this._warpCd || 0) - dt;
    if (T.warps.length && this._warpCd <= 0 && this.airZ <= 0 && !this.gone && !this.finished && game.state === 'racing') {
      const cw = Math.cos(this.angle), sw = Math.sin(this.angle);
      const wnx = this.x + cw * this.bodyR, wny = this.y + sw * this.bodyR;
      const wr = T.warpR * T.warpR;
      for (const w of T.warps) {
        if (dist2(wnx, wny, w.ex, w.ey) < wr || dist2(this.x, this.y, w.ex, w.ey) < wr) {
          game.warpKart(this, w);
          return;                                      // テレポート後はこのフレームの物理を中断
        }
      }
    }
    // 接地状態でコース欠損(奈落/空白)に来た = 落下。手前に戻して大ダメージ。
    if (surf === 'gap' && !this.gone && !this.finished && game.state === 'racing') {
      game.fallInGap(this);
      return;                                          // 以降の物理は中断(テレポート済み)
    }

    // ===== ギア / 変速(全モードで現ギアが頭打ち=ギアに意味を持たせる。
    //   AT/セミは高回転で即シフトするので失速せずキビキビ走れる) =====
    const gearTopOf = (g) => this.baseMax * GEAR_FRAC[g];
    if (!countdown && !dashing && this.spinTimer <= 0 && this.speed > -5) {
      const rv0 = sp0 / Math.max(1, gearTopOf(this.gear));
      if (this.trans === 'manual') {
        if (c.shiftUp && this.gear < NUM_GEARS) this.gear++;
        else if (c.shiftDown && this.gear > 1) this.gear--;
        if (sp0 < 25 && this.gear > 1 && throttle <= 0) this.gear = 1;   // 再発進補助
      } else {                                          // AT / セミAT
        if (this.trans === 'semi' && c.shiftUp && this.gear < NUM_GEARS) this.gear++;
        else if (this.trans === 'semi' && c.shiftDown && this.gear > 1) this.gear--;
        else if (rv0 > 0.93 && this.gear < NUM_GEARS && throttle >= 0) this.gear++;   // すぐ上げる
        else if (rv0 < 0.55 && this.gear > 1) this.gear--;
      }
    }
    const gTop = gearTopOf(this.gear);
    const rev = sp0 / Math.max(1, gTop);

    // 最高速: 現ギアの少し上で頭打ち(シフトを誘発)。芝生/スター/ブースト/ダッシュは別枠。
    let maxSp = this.baseMax;
    if (surf === 'grass') maxSp = this.baseMax * 0.4;
    if (this.boostTimer <= 0 && !dashing && this.invincTimer <= 0)
      maxSp = Math.min(maxSp, gTop + this.baseMax * 0.04);
    if (this.invincTimer > 0) maxSp += 150;       // スターは明確に速い
    if (this.boostTimer > 0) maxSp += 280;
    if (dashing) maxSp = this.baseMax * 1.95;

    // ブーストパッド
    if (surf === 'boost') {
      this.boostTimer = Math.max(this.boostTimer, 0.7);
      this.speed = Math.max(this.speed, this.baseMax + 200);
      if (Math.random() < 0.6) game.spawnParticle(this.x, this.y, T.theme.boost, 'boost');
    }

    // 加減速(低ギアほど強い加速。レブ手前は少し絞るが失速はさせない)
    let accelMul = [0, 1.3, 1.14, 1.0, 0.92, 0.86][this.gear] || 1;
    if (throttle > 0 && rev > 0.95) accelMul *= Math.max(0.3, 1 - (rev - 0.95) * 6);
    if (throttle > 0) this.speed += this.accel * throttle * accelMul * sdt;
    else if (throttle < 0) this.speed += this.accel * throttle * sdt;
    // エンジンブレーキ(現速度がギアトップを大きく超えたら減速 = コーナー進入のシフトダウンが効く)
    if (this.boostTimer <= 0 && !dashing && this.invincTimer <= 0 && sp0 > gTop * 1.1 && throttle >= 0)
      this.speed *= (1 - 2.0 * sdt);

    // ライフ: コース外(芝生)で減少 / 回復ゾーンで回復(空中・カウントダウン中は対象外)
    if (game.lifeOn && game.state === 'racing' && this.airZ <= 0 && !this.gone) {
      if (surf === 'grass') { if (game.offcourseDamage) this.hurt(15 * dt, game); }  // コース外ダメージ(設定でON/OFF)
      else if (surf === 'recover') {
        this.life = Math.min(this.maxLife, this.life + 36 * dt);
        if (Math.random() < 0.35) game.spawnParticle(this.x, this.y, Math.random() < 0.5 ? '#7dffb0' : '#ffffff', 'star');
      }
    }

    // 抗力(芝生/オイルは強め, 氷は弱め)
    let drag = 1.15;
    if (surf === 'grass') drag = 3.6;
    if (surf === 'hazard') drag = T.hazardType === 'oil' ? 4.8 : 0.35;
    this.speed *= (1 - drag * sdt);
    if (Math.abs(this.speed) < 4 && throttle === 0) this.speed = 0;
    this.speed = clamp(this.speed, this.reverseMax, maxSp);
    if (dashing) this.speed = Math.max(this.speed, this.baseMax * 1.7);   // ダッシュ速度を維持

    // (オイルはランダムなスピンをさせない。滑り=操作で対処できるグリップ低下のみ)

    // ステアリング(入力を平滑化して急なフルロックを防ぐ。止まっている時は曲がらない)
    const steer = c.steer;
    let gripCap = 1;
    if (surf === 'hazard') gripCap = T.hazardType === 'ice' ? 0.55 : 0.72;  // 氷/オイルは滑る(操作は可能)
    if (this.airZ > 0) gripCap *= 0.4;                                       // 空中は舵が利きにくい
    // 入力スムージング(アシスト時は少しキビキビ)
    const smoothK = this.assist ? 11 : 8;
    this.steerSmooth += (steer - this.steerSmooth) * Math.min(1, smoothK * dt);
    if (Math.abs(this.steerSmooth) < 0.02) this.steerSmooth = 0;
    if (!dashing && Math.abs(this.speed) > 14 && this.steerSmooth !== 0) {   // 低速でも少し向きを変えられる(壁向きデッドロック緩和)
      const sp = clamp(Math.abs(this.speed) / 240, 0, 1);
      let turn = this.turnRate * this.steerSmooth * (0.4 + 0.6 * sp) * gripCap * sdt;
      if (this.drifting) turn *= 1.4;
      if (this.speed < 0) turn = -turn;
      this.angle += turn;
    }

    // ドリフト & ミニターボ
    if (!countdown && !dashing && c.drift && Math.abs(this.speed) > 150 && steer !== 0 && this.spinTimer <= 0) {
      if (!this.drifting) { this.drifting = true; this.driftDir = steer; this.driftCharge = 0; this.hop = 0.3; }
      this.driftCharge += sdt;
      const col = this.driftCharge > 1.5 ? '#ff7b00' : (this.driftCharge > 0.7 ? '#3bd6ff' : '#ddd');
      if (Math.random() < 0.7) {
        const bx = this.x - Math.cos(this.angle) * 14, by = this.y - Math.sin(this.angle) * 14;
        game.spawnParticle(bx, by, col, 'spark');
      }
    } else if (this.drifting) {
      if (this.driftCharge > 1.5) { this.boostTimer = Math.max(this.boostTimer, 0.9); audio.sfxBoost(); }
      else if (this.driftCharge > 0.7) { this.boostTimer = Math.max(this.boostTimer, 0.5); }
      this.drifting = false; this.driftCharge = 0;
    }

    // 突風(横風)ゾーン: 接地中はカートが風向きへ流される。逆らって操作する必要がある(新ギミック)。
    let windX = 0, windY = 0;
    if (T.winds.length && this.airZ <= 0 && !this.gone) {
      for (const w of T.winds) {
        if (dist2(this.x, this.y, w.x, w.y) < T.windR * T.windR) { windX += w.dx * T.windForce; windY += w.dy * T.windForce; }
      }
      if ((windX || windY) && this.isHuman && Math.random() < 0.5)   // 風の流れを可視化(自機周り)
        game.spawnParticle(this.x - windX * 0.15, this.y - windY * 0.15, '#cfeeff', 'star');
    }
    // 移動(前進速度 + 反発速度 kb + 突風。壁=レールに沿って滑る)
    const preSpeed = Math.abs(this.speed);
    const mvx = Math.cos(this.angle) * this.speed + this.kbx + windX;
    const mvy = Math.sin(this.angle) * this.speed + this.kby + windY;
    const nx = this.x + mvx * sdt;
    const ny = this.y + mvy * sdt;
    let fx = this.x, fy = this.y, hitX = false, hitY = false;
    if (!T.isBlocked(nx, this.y, this.radius)) fx = nx; else { hitX = true; this.kbx *= -0.3; }
    if (!T.isBlocked(fx, ny, this.radius)) fy = ny; else { hitY = true; this.kby *= -0.3; }
    this.x = fx; this.y = fy;
    // 反発速度の減衰
    const kd = Math.max(0, 1 - 9 * sdt);
    this.kbx *= kd; this.kby *= kd;
    if (Math.abs(this.kbx) < 3) this.kbx = 0;
    if (Math.abs(this.kby) < 3) this.kby = 0;
    if (hitX && hitY) this.speed *= 0.55;       // 正面衝突は減速
    else if (hitX || hitY) this.speed *= 0.88;  // かすめる程度なら滑って続行
    // 壁(レール)にぶつかった手応え(音・火花・画面シェイク)
    if ((hitX || hitY) && preSpeed > 150 && this.wallHitCd <= 0) {
      this.wallHitCd = 0.28;
      this.bumpTimer = Math.max(this.bumpTimer, 0.2);
      audio.sfxWall();
      const fxx = Math.cos(this.angle), fyy = Math.sin(this.angle);
      for (let p = 0; p < 7; p++)
        game.spawnParticle(this.x + fxx * this.radius, this.y + fyy * this.radius, p % 2 ? '#ffffff' : T.theme.curb1, 'spark');
    }

    if (this.boostTimer > 0 && Math.random() < 0.5)
      game.spawnParticle(this.x - Math.cos(this.angle) * 16, this.y - Math.sin(this.angle) * 16, '#ffb020', 'boost');
    if (this.invincTimer > 0 && Math.random() < 0.6)
      game.spawnParticle(this.x + (Math.random() - 0.5) * 30, this.y + (Math.random() - 0.5) * 30,
        `hsl(${(game.time * 360) % 360},90%,60%)`, 'star');

    // レスキュー: ①走路に沿って長時間前進できていない ②アクセルを踏んでいるのに
    // 実際にほぼ動けていない(壁を向いて旋回も前進もできないデッドロック等) のいずれか。
    if (game.state === 'racing' && !this.finished) {
      if (this._prog > this._progBest + 0.4) {   // 走路に沿って前進できている
        this._progBest = this._prog;
        this._stuckTimer = 0;
      } else {
        this._stuckTimer += dt;                   // どこにも進めていない
      }
      const moved = Math.hypot(this.x - this._lastX, this.y - this._lastY);
      if (moved < 0.6 && this.spinTimer <= 0 && this.control && Math.abs(this.control.throttle) > 0.1) {
        this._pinTimer += dt;                     // 進もうとしているのに動けていない
      } else {
        this._pinTimer = 0;
      }
      if (this._stuckTimer > 5 || this._pinTimer > 2.5) game.rescue(this);
    } else {
      this._stuckTimer = 0; this._progBest = this._prog; this._pinTimer = 0;
    }
    this._lastX = this.x; this._lastY = this.y;

    // チェックポイント/周回
    game.checkProgress(this);
  }

  // 速度に対応するギア(表示・オート用)
  _gearForSpeed(sp) {
    const f = sp / Math.max(1, this.baseMax);
    for (let g = 1; g < NUM_GEARS; g++) if (f <= GEAR_FRAC[g] + 0.02) return g;
    return NUM_GEARS;
  }

  startSpin() {
    if (this.invincTimer > 0 || this.spinTimer > 0) return;
    this.spinTimer = this.assist ? 0.85 : 1.1;
    this.speed *= 0.35;
    audio.sfxHit();
  }

  // --- AI 操作生成(中心線をピュアパースート追従) ------------------------
  computeAI(game) {
    const T = game.track, P = T.path, n = P.length;
    const sp = Math.abs(this.speed);
    // 中心線上の最近点
    const near = T._distInfo(this.x, this.y).i;
    // 速いほど先を読む(短め=中心線を密に追従してコーナーで膨らみにくい)
    const look = 3 + Math.round(clamp(sp / 150, 0, 1) * 4);
    let aimIdx = (near + look) % n, gateAim = false;
    // 先読み点が「空白(void)」に入る=ワープ手前 → 島の終端(ゲート)を狙う(空白へ逸れない)
    if (T.voidRanges && T.voidRanges.length && T._inVoid(aimIdx)) {
      for (const r of T.voidRanges) {
        const inR = r.a <= r.b ? (aimIdx >= r.a && aimIdx <= r.b) : (aimIdx >= r.a || aimIdx <= r.b);
        if (inR) { aimIdx = r.a; gateAim = true; break; }
      }
    }
    const aim = P[aimIdx];
    const aim2 = gateAim ? aim : P[(aimIdx + 4) % n];
    const desired = Math.atan2(aim.y - this.y, aim.x - this.x);
    const diff = angNorm(desired - this.angle);
    // 先のカーブのきつさ(局所的に)
    const curve = Math.abs(angNorm(Math.atan2(aim2.y - aim.y, aim2.x - aim.x) - desired));

    let steer = clamp(diff * 1.8 + this.aiJitter * 0.3, -1, 1);
    // コーナー手前で目標速度まで落とす(必要な時だけ軽くブレーキ)
    const sharp = Math.max(curve, Math.abs(diff));
    const targetSpeed = this.baseMax * (sharp > 0.9 ? 0.5 : sharp > 0.55 ? 0.72 : 1.1);
    let throttle = 1;
    if (sp > targetSpeed + 60) throttle = -0.4;       // かなり速い時だけ軽くブレーキ
    else if (sp > targetSpeed) throttle = 0.35;        // 緩める
    // 芝生に出たら戻すため強めに切る
    if (T.surfaceAt(this.x, this.y) === 'grass') { throttle = Math.max(throttle, 0.6); steer = clamp(diff * 2.3, -1, 1); }
    const drift = sharp > 0.5 && sp > 260 && throttle > 0;

    // アイテム使用判断(難易度でアイテム多用)
    let useItem = false;
    if (this.item && !this.finished) {
      this.aiItemTimer -= 1 / 60;
      if (this.aiItemTimer <= 0) { useItem = true; this.aiItemTimer = (1.5 + Math.random() * 2.5) * (this.aiItemMul || 1); }
    }
    this.control = { throttle, steer, drift, item: useItem };
  }
}

// ============================ 投擲物 ======================================
class Projectile {
  constructor(opts) {
    Object.assign(this, opts); // type,x,y,vx,vy,owner,life
    this.r = 14;
    this.bounces = 0;
    this.fuse = opts.fuse || 0;
    this.dead = false;
  }
  update(dt, game, ts) {
    const sdt = dt * ts;
    const T = game.track;
    this.life -= sdt;
    if (this.life <= 0) { this.dead = true; if (this.type === 'bomb') game.explode(this.x, this.y, this.owner); return; }

    if (this.type === 'red') {
      // 前の順位のカートへホーミング
      const target = game.redTarget(this.owner);
      if (target) {
        const want = Math.atan2(target.y - this.y, target.x - this.x);
        const cur = Math.atan2(this.vy, this.vx);
        const na = cur + angNorm(want - cur) * clamp(4 * sdt, 0, 1);
        const sp = Math.hypot(this.vx, this.vy);
        this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
      }
    }
    if (this.type === 'bomb') {
      this.fuse -= sdt;
      this.vx *= (1 - 1.2 * sdt); this.vy *= (1 - 1.2 * sdt);
      if (this.fuse <= 0) { this.dead = true; game.explode(this.x, this.y, this.owner); return; }
    }

    let nx = this.x + this.vx * sdt, ny = this.y + this.vy * sdt;
    if (T.isWallPt(nx, this.y)) { this.vx = -this.vx; nx = this.x; this.bounces++; }
    if (T.isWallPt(this.x, ny)) { this.vy = -this.vy; ny = this.y; this.bounces++; }
    this.x = nx; this.y = ny;
    if ((this.type === 'green' || this.type === 'red') && this.bounces > 4) this.dead = true;
  }
}

// ============================ Game ========================================
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.running = false;
    this.paused = false;
    this.touch = false;            // タッチ端末(スマホ等)ではHUDを親指エリアから避ける
    this.onFinish = null;
    this.richGfx = true;            // リッチな見た目(沿道装飾・空の演出)
    this.W = 0; this.H = 0;
    this._raf = null;
    this._last = 0;
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.W = W; this.H = H;
    this.canvas.width = Math.floor(W * this.dpr);
    this.canvas.height = Math.floor(H * this.dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
  }

  startRace(opts) {
    this.resize();
    this.mode = opts.mode || 'vs';                 // 'gp' | 'time' | 'vs'
    this.def = TRACKS[opts.trackIndex];
    this.trackIndex = opts.trackIndex;
    this.mirror = !!opts.mirror;                    // ミラーモード(コース左右反転)
    this.mirrorControls = !!opts.mirrorControls;   // 操作も反転するオプション
    this.pedalSwap = !!opts.pedalSwap;             // アクセルとブレーキを入れ替える
    this.track = new Track(this.def, this.mirror);
    this.numHumans = opts.players || 1;
    this.trans = opts.trans || 'auto';             // 変速モード(共通の既定)
    this.transModes = opts.transModes || [];       // プレイヤーごとの変速モード(任意)
    this.aiDiff = opts.aiDiff || 'normal';         // CPUの強さ
    if (opts.richGfx != null) this.richGfx = opts.richGfx;   // 画質(リッチ/シンプル)
    const total = opts.numKarts || (this.mode === 'time' ? 1 : 4);
    this.noItems = (this.mode === 'time');         // タイムアタックはアイテム無し
    this.lifeOn = (opts.lifeOn !== false);         // ライフ(耐久)システム。テスト等で無効化可
    // ダメージ倍率はプレイヤー/CPUで独立(0=なし)。旧 damageScale 指定時は両方に適用(後方互換)。
    const baseDmg = (opts.damageScale != null ? opts.damageScale : 1);
    this.playerDamageScale = (opts.playerDamageScale != null ? opts.playerDamageScale : baseDmg);
    this.cpuDamageScale = (opts.cpuDamageScale != null ? opts.cpuDamageScale : baseDmg);
    this.cpuDamageRandom = opts.cpuDamageRandom || null;   // 'incl'|'excl'|null: CPUごとにランダム倍率
    this.cpuDamagePool = (opts.cpuDamagePool && opts.cpuDamagePool.length) ? opts.cpuDamagePool : null;  // 抽選プール(解放段で拡張)
    this.speedMul = opts.speedMul || 1;            // 最高速倍率(1/1.5/2/2.5/3)
    this.subSteps = opts.accuratePhysics ? 4 : 1;  // 高精度物理: 1フレームを分割積分
    this.offcourseDamage = (opts.offcourseDamage !== false);   // コース外(芝生)でダメージを受けるか
    this.gpRace = opts.gpRace || null;             // {index,total} 表示用
    this.time = 0;
    this.raceTime = 0;
    this.state = 'countdown';
    this._gameoverAt = 0; this._deadHuman = null;   // ゲームオーバー状態をリセット
    this.countdown = 3.0;
    this.lastBeep = 3;
    this.musicMode = 'race';
    this.hintTimer = 4.5;

    this.particles = [];
    this.projectiles = [];
    this.obstacles = [];
    this.explosions = [];
    this.slowTimer = 0;
    this.slowOwner = null;
    this._bumpCd = 0;
    this._finished = false;

    this.finishOrder = [];

    this._placeKarts(total);
    this.humans = this.karts.filter(k => k.isHuman);
    // 前のステージでリタイヤしたCPUを引き継ぐ(復活させない設定の場合)
    if (opts.retiredIds && opts.retiredIds.length) {
      const set = new Set(opts.retiredIds);
      for (const k of this.karts) if (!k.isHuman && set.has(k.id)) k._retired = true;
    }
    if (this.noItems) this.track.itemBoxes = [];   // アイテムボックスを消す

    audio.resume();
    audio.playMusic(this.def.music);
    audio.startEngine();

    this.running = true;
    this.paused = false;
    this._last = performance.now();
    if (this._raf) cancelAnimationFrame(this._raf);
    this._loop();
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    audio.stopMusic();
    audio.stopEngine();
  }
  pause() { if (this.running && !this.paused) { this.paused = true; audio.stopMusic(); audio.stopEngine(); } }
  resume() {
    if (this.running && this.paused) {
      this.paused = false; this._last = performance.now();
      audio.resume();
      audio.playMusic(this.musicMode === 'star' ? 'star' : this.def.music);
      audio.startEngine();
      this._loop();
    }
  }

  _loop() {
    if (!this.running || this.paused) return;
    this._raf = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    let dt = (now - this._last) / 1000;
    this._last = now;
    dt = Math.min(dt, 1 / 30); // 大きなコマ落ち対策
    // 高精度物理: 1フレームを分割して積分(衝突/壁の精度UP・高速でも貫通しにくい)。
    // 押下エッジ(アイテム/シフト)は最初のサブステップだけ有効にして多重発火を防ぐ。
    const steps = this.subSteps || 1;
    for (let i = 0; i < steps; i++) { this.update(dt / steps); if (i === 0) input.endFrame(); }
    this.render();
  }

  // ---- 更新 -------------------------------------------------------------
  update(dt) {
    this.time += dt;

    // ゲームオーバー(プレイヤー爆発): 爆発演出だけ進め、少し経ったら画面を出す
    if (this.state === 'gameover') {
      for (const p of this.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
      this.particles = this.particles.filter(p => p.t < p.life);
      for (const e of this.explosions) { e.t += dt; e.r = lerp(e.r0, e.rMax, clamp(e.t / 0.35, 0, 1)); }
      this.explosions = this.explosions.filter(e => e.t < 0.5);
      if (this._gameoverAt && this.time >= this._gameoverAt) {
        this._gameoverAt = 0;
        if (this.onGameOver) this.onGameOver(this._deadHuman);
      }
      return;
    }

    if (this.state === 'countdown') {
      const prev = Math.ceil(this.countdown);
      this.countdown -= dt;
      const cur = Math.ceil(this.countdown);
      if (cur !== prev && cur >= 1 && cur <= 3) audio.sfxBeep();
      if (this.countdown <= 0) { this.state = 'racing'; audio.sfxGo(); }
    } else if (this.state === 'racing') {
      this.raceTime = (this.raceTime || 0) + dt;
      if (this.hintTimer > 0) this.hintTimer -= dt;
    }

    // 人間の操作 → control へ
    for (const k of this.karts) {
      if (k.gone) continue;                           // 爆発/リタイヤは操作・AIを止める
      if (k.isHuman && !k.finished) this._readHuman(k);
      else k.computeAI(this);
    }

    // タイムスロー
    const slowActive = this.slowTimer > 0;
    if (slowActive) this.slowTimer -= dt;

    // カート更新
    for (const k of this.karts) {
      if (k.gone) continue;
      const ts = (slowActive && k !== this.slowOwner) ? 0.4 : 1;
      k.update(dt, this, ts);
    }

    // 投擲物
    for (const p of this.projectiles) p.update(dt, this, slowActive ? 0.4 : 1);
    this.projectiles = this.projectiles.filter(p => !p.dead);

    // アイテムボックス再出現
    for (const b of this.track.itemBoxes) if (!b.active) { b.t -= dt; if (b.t <= 0) b.active = true; }

    // 障害物(バナナ)
    for (const o of this.obstacles) o.life -= dt;
    this.obstacles = this.obstacles.filter(o => o.life > 0);

    // 爆発
    for (const e of this.explosions) { e.t += dt; e.r = lerp(e.r0, e.rMax, clamp(e.t / 0.35, 0, 1)); }
    this.explosions = this.explosions.filter(e => e.t < 0.5);

    // 当たり判定
    this._collisions();

    // パーティクル
    for (const p of this.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
    this.particles = this.particles.filter(p => p.t < p.life);

    // 順位
    this._ranking();

    // スターBGM切替
    const anyStar = this.karts.some(k => k.invincTimer > 0);
    if (anyStar && this.musicMode !== 'star') { audio.switchMusic('star'); this.musicMode = 'star'; }
    else if (!anyStar && this.musicMode === 'star') { audio.switchMusic(this.def.music); this.musicMode = 'race'; }

    // 終了判定(全人間がゴール or 脱落)。爆発した人間は「終わった」扱いにして続行可能に。
    if (this.state === 'racing' && this.humans.every(k => k.finished || k._exploded)) {
      this.state = 'finished';
      this._finishDelay = 1.2;
    } else if (this.state === 'finished') {
      this._finishDelay -= dt;
      if (this._finishDelay <= 0 && !this._finished) {
        this._finished = true;
        this._showResults();
      }
    }

    // エンジン音(ローカルの人間カートが基準。アクセル中に鳴る)
    let eThr = 0, eSr = 0;
    for (const h of this.humans) {
      if (h.finished || h._exploded) continue;
      eThr = Math.max(eThr, Math.max(0, (h.control && h.control.throttle) || 0));
      eSr = Math.max(eSr, Math.min(1, Math.abs(h.speed) / h.baseMax));
    }
    audio.updateEngine(eThr, eSr);
  }

  _readHuman(k) {
    const c = k.controls;
    const accel = input.isDown(c.accel) ? 1 : 0;
    const brake = input.isDown(c.brake) ? 1 : 0;
    const ctrl = {
      throttle: accel - brake,
      steer: (input.isDown(c.left) ? -1 : 0) + (input.isDown(c.right) ? 1 : 0),
      drift: input.isDown(c.drift),
      item: input.wasPressed(c.item),
      shiftUp: input.wasPressed(c.shiftUp),
      shiftDown: input.wasPressed(c.shiftDown),
    };
    // コントローラ(Bluetooth/USB)も併用。プレイヤー番号=k.id に割り当て。
    const gp = input.readGamepad(k.id);
    if (gp) {
      if (ctrl.throttle === 0) ctrl.throttle = gp.throttle;
      if (ctrl.steer === 0) ctrl.steer = gp.steer;
      ctrl.drift = ctrl.drift || gp.drift;
      ctrl.item = ctrl.item || gp.item;
      ctrl.shiftUp = ctrl.shiftUp || gp.shiftUp;
      ctrl.shiftDown = ctrl.shiftDown || gp.shiftDown;
    }
    if (this.mirrorControls) ctrl.steer = -ctrl.steer;   // 操作反転オプション(左右逆)
    if (this.pedalSwap) ctrl.throttle = -ctrl.throttle;  // アクセル/ブレーキ反転(スロットル符号反転=入替と等価)
    k.control = ctrl;
  }

  // ---- 進行/周回 --------------------------------------------------------
  // コース外/スタックしたカートを近くの走路へ戻す(レスキュー)
  // CPUのダメージ倍率をランダムに1つ選ぶ。プール(解放段で拡張)があればそれを、無ければ
  // 基本プールを使う。mode='incl' は 0倍(無敵CPU)も候補に入れる。
  _rollCpuDmg(mode) {
    let pool = this.cpuDamagePool;
    if (!pool || !pool.length) {                       // フォールバック(プール未指定時)
      pool = [2, 1.5, 1, 0.5, 1 / 3, 0.2, 0.1];
      if (mode === 'incl') pool = pool.concat([0]);
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ワープ(瞬間移動): entry→exit へテレポート。出口の本線方向を向き、速度は維持。
  //   周回判定を壊さないよう _lastSeg / _passedHalf / _prog を整える。
  warpKart(k, w) {
    const T = this.track, N = T.path.length;
    for (let p = 0; p < 12; p++) this.spawnParticle(w.ex, w.ey, p % 2 ? '#ff7df0' : '#7df0ff', 'star');  // 入口の演出
    const np = T.nearestOnPath(w.tx, w.ty);
    k.x = w.tx; k.y = w.ty; k.angle = np.angle;
    k.kbx = 0; k.kby = 0; k.airZ = 0; k.airVz = 0;
    k.speed = Math.max(Math.abs(k.speed), 90);          // 出口で止まらないよう最低速を保証
    k._warpCd = 1.0;                                     // 連続発動を防ぐクールダウン
    const segB = np.seg, segA = (k._lastSeg != null) ? k._lastSeg : segB;
    let d = segB - segA; if (d > N / 2) d -= N; if (d < -N / 2) d += N;
    if (d > 0) k._prog += d;                             // 前進分を加算(ショートカット恩恵)
    // ワープで前方へスタートラインを跨いだら周回成立(島コースは最後の周回がワープ越え)
    if (segA > N * 0.7 && segB < N * 0.3 && k._passedHalf && !k.finished) { k._passedHalf = false; this._completeLap(k); }
    if (segB / N >= 0.4) k._passedHalf = true;           // 中間をまたいでも周回成立できるように
    k._lastSeg = segB; k._lastX = k.x; k._lastY = k.y;
    k._stuckTimer = 0; k._pinTimer = 0; k._progBest = k._prog;
    k.invincTimer = Math.max(k.invincTimer, 0.7); k.rescueFlash = 1.0;
    for (let p = 0; p < 22; p++) this.spawnParticle(k.x, k.y, p % 2 ? '#ff7df0' : '#7df0ff', 'star');     // 出口の演出
    if (k.isHuman) audio.sfxRescue();
  }

  // 奈落に落ちた: 大ダメージ＋穴の手前(ジャンプ台より前)に戻して再挑戦させる。
  fallInGap(k) {
    k.hurt(26, this);                                  // 落下ダメージ(lifeOn/damageScale適用)
    if (k.gone) return;                                // ダメージで爆発したらそのまま
    const T = this.track, P = T.path, n = P.length;
    let idx = T._distInfo(k.x, k.y).i;
    let acc = 0; const backDist = T.tile * 7;          // 穴・ジャンプ台より十分手前へ
    for (let s = 0; s < n && acc < backDist; s++) {
      const a = P[((idx - 1) % n + n) % n], b = P[idx];
      acc += Math.hypot(b.x - a.x, b.y - a.y);
      idx = ((idx - 1) % n + n) % n;
    }
    const a = P[idx], b = P[(idx + 1) % n];
    k.x = a.x; k.y = a.y; k.angle = Math.atan2(b.y - a.y, b.x - a.x);
    k.speed = 60; k.steerSmooth = 0; k.spinTimer = 0; k.drifting = false; k.kbx = 0; k.kby = 0;
    k.airZ = 0; k.airVz = 0; k.boostTimer = 0;
    k.invincTimer = Math.max(k.invincTimer, 1.6);
    k._lastSeg = null; k._stuckTimer = 0; k._progBest = k._prog; k._pinTimer = 0; k._lastX = k.x; k._lastY = k.y;
    k.rescueFlash = 1.2;
    for (let p = 0; p < 18; p++) this.spawnParticle(k.x, k.y, p % 2 ? '#a9b6ff' : '#ffffff', 'star');
    if (k.isHuman) audio.sfxRescue();
  }

  rescue(k) {
    const np = this.track.nearestOnPath(k.x, k.y);
    k.x = np.x; k.y = np.y; k.angle = np.angle;
    k.speed = 70; k.steerSmooth = 0; k.spinTimer = 0; k.drifting = false;
    k.kbx = 0; k.kby = 0;
    k.invincTimer = Math.max(k.invincTimer, 1.4);   // 復帰直後は少し無敵
    k._lastSeg = null;                              // テレポート分の誤クロス検出を防ぐ
    k._stuckTimer = 0; k._progBest = k._prog; k._pinTimer = 0;   // スタック判定をリセット
    k._lastX = k.x; k._lastY = k.y;
    k.rescueFlash = 1.2;
    for (let p = 0; p < 16; p++) this.spawnParticle(k.x, k.y, p % 2 ? '#9fe8ff' : '#ffffff', 'star');
    if (k.isHuman) audio.sfxRescue();
  }

  // 中心線上の連続位置でスタートライン前方通過を検出(半径ベースのチェックポイントを廃止)
  // → どんなライン取りでも一周すれば必ずカウント。後退・振動では増えない(誤カウント防止)。
  checkProgress(k) {
    if (k.finished) return;
    const T = this.track, N = T.path.length;
    const seg = T._distInfo(k.x, k.y).i;            // 0..N-1 (path[0]=スタート)
    const prev = k._lastSeg;
    if (prev != null) {
      // 連続進捗(順位用): 前後の差をラップ境界を跨いでも滑らかに加算
      let d = seg - prev;
      if (d > N / 2) d -= N;
      if (d < -N / 2) d += N;
      k._prog += d;
      if (prev > N * 0.7 && seg < N * 0.3) {         // 前方へスタートを通過
        if (k._passedHalf) { k._passedHalf = false; this._completeLap(k); }
      } else if (prev < N * 0.3 && seg > N * 0.7) {  // 後退でスタートを通過 → 1周戻す
        k._passedHalf = true;
        if (k.lapCount > 0) k.lapCount--;
      }
    }
    const f = seg / N;
    if (f > 0.4 && f < 0.6) k._passedHalf = true;     // コース中間を通過したらラップ成立可
    k._lastSeg = seg;
  }
  _completeLap(k) {
    const now = this.raceTime || 0;
    k.lastLapTime = now - k._lapStart;
    const isBest = (k.bestLap == null || k.lastLapTime < k.bestLap);
    if (isBest) k.bestLap = k.lastLapTime;
    k._lapStart = now;
    k.lapCount++;
    if (k.lapCount >= this.def.laps) {
      k.finished = true;
      k.finishTime = now;
      this.finishOrder.push(k);
      if (k.isHuman) audio.sfxFinish();
    } else if (k.isHuman) {
      // 周回完了の告知(ラップタイム＋残り周回)＋専用チャイム
      k._lapMsg = { time: k.lastLapTime, lapNum: k.lapCount, lapsLeft: this.def.laps - k.lapCount, best: isBest };
      k._lapMsgUntil = this.time + 2.8;
      audio.sfxLap();
    }
  }

  _ranking() {
    for (const k of this.karts) {
      k.progress = k.finished ? (1e9 - k.finishTime) : (k._prog || 0);
    }
    // 走行中(爆発/リタイヤしていない)のカートだけで順位付け。脱落は最後尾。
    const active = this.karts.filter(k => !k.gone).sort((a, b) => b.progress - a.progress);
    active.forEach((k, i) => k.place = i + 1);
    let p = active.length + 1;
    for (const k of this.karts) if (k.gone) k.place = p++;
  }

  // ---- アイテム ---------------------------------------------------------
  giveItem(k) {
    // 順位に応じた重み(後ろほど強いアイテム)
    const place = k.place;
    let pool;
    if (place === 1) pool = ['banana', 'banana', 'green', 'green', 'mushroom', 'red'];
    else if (place === 2) pool = ['green', 'red', 'mushroom', 'mushroom', 'banana', 'grapple', 'bomb'];
    else pool = ['mushroom', 'red', 'star', 'grapple', 'grapple', 'bomb', 'star'];
    k.item = pool[Math.floor(Math.random() * pool.length)];
    k.itemFlash = 0.6;
    audio.sfxPickup();
  }

  useItem(k) {
    const type = k.item; if (!type) return;
    k.item = null;
    const fx = Math.cos(k.angle), fy = Math.sin(k.angle);
    // 投擲物は自機の少し前方(画面に映る位置)から発射。発射光も出す。
    const ahead = k.radius + 150;
    const sx = k.x + fx * ahead, sy = k.y + fy * ahead;
    const fire = () => { k.fireFlash = 0.22; for (let p = 0; p < 8; p++) this.spawnParticle(sx, sy, p % 2 ? '#fff' : '#ffd23f', 'spark'); };
    switch (type) {
      case 'mushroom':
        k.boostTimer = Math.max(k.boostTimer, 1.4); audio.sfxBoost(); break;
      case 'star':
        k.invincTimer = 7.5; audio.sfxStar(); break;
      case 'banana':
        this.obstacles.push({ type: 'banana', x: k.x - fx * 40, y: k.y - fy * 40, owner: k, life: 18, r: 16 });
        k.dropImmune = 0.6; audio.sfxDrop(); break;
      case 'green':
        this.projectiles.push(new Projectile({ type: 'green', x: sx, y: sy, vx: fx * (640 + Math.max(0, k.speed)), vy: fy * (640 + Math.max(0, k.speed)), owner: k, life: 6 }));
        fire(); audio.sfxShell(); break;
      case 'red':
        this.projectiles.push(new Projectile({ type: 'red', x: sx, y: sy, vx: fx * 560, vy: fy * 560, owner: k, life: 7 }));
        fire(); audio.sfxShell(); break;
      case 'bomb':
        this.projectiles.push(new Projectile({ type: 'bomb', x: sx, y: sy, vx: fx * 480, vy: fy * 480, owner: k, life: 4, fuse: 1.6 }));
        fire(); audio.sfxDrop(); break;
      case 'grapple': {
        // 前を走るカートにロックオンして高速で引き寄せられる(無敵で突っ込む)。
        // 前方にいなければ、コース前方の点へダッシュ。
        let target = null, best = 1100 * 1100;
        for (const o of this.karts) {
          if (o === k || o.finished || o.gone) continue;
          if (o.place >= k.place) continue;           // 自分より前のカートのみ
          const dd = dist2(k.x, k.y, o.x, o.y);
          if (dd < best) { best = dd; target = o; }
        }
        let tx, ty;
        if (target) { tx = target.x; ty = target.y; }
        else {
          const info = this.track._distInfo(k.x, k.y);
          const p = this.track.path[(info.i + 16) % this.track.path.length];
          tx = p.x; ty = p.y;
        }
        k.dashTimer = 0.75; k.dashTarget = { x: tx, y: ty };
        k.invincTimer = Math.max(k.invincTimer, 1.0);
        fire(); audio.sfxGrapple();
        break;
      }
    }
  }

  redTarget(owner) {
    // ownerの1つ前の順位のカート
    const ahead = this.karts.filter(k => k !== owner && k.place < owner.place && !k.finished);
    if (!ahead.length) return null;
    ahead.sort((a, b) => b.place - a.place); // ownerに最も近い前方
    return ahead[0];
  }

  explode(x, y, owner) {
    this.explosions.push({ x, y, r: 10, r0: 10, rMax: 70, t: 0 });
    audio.sfxBomb();
    for (let i = 0; i < 18; i++) this.spawnParticle(x, y, i % 2 ? '#ff8800' : '#ffe000', 'boost');
    for (const k of this.karts) {
      if (k.invincTimer > 0 || k.finished) continue;
      if (dist2(k.x, k.y, x, y) < 80 * 80) k.startSpin();
    }
  }

  // ライフが0になったカートの爆発。プレイヤー=脱落(全員爆発でゲームオーバー)、CPU=リタイヤ(消滅)。
  explodeKart(k) {
    if (k.gone) return;
    this.explosions.push({ x: k.x, y: k.y, r: 12, r0: 12, rMax: 96, t: 0 });
    audio.sfxBomb();
    for (let i = 0; i < 30; i++) this.spawnParticle(k.x, k.y, i % 3 === 0 ? '#ff3a1a' : (i % 3 === 1 ? '#ff8800' : '#ffe000'), 'boost');
    k.speed = 0; k.kbx = 0; k.kby = 0;
    if (k.isHuman) {
      k._exploded = true;                  // 人間は復活しない=このレースは脱落(操作不能)
      // 生存している人間が一人もいなくなったらゲームオーバー。
      // VSで誰かが生きていれば、脱落者の画面を暗くしたままレースは続行する。
      if (this.humans.every(h => h._exploded)) {
        this._deadHuman = k;
        this.state = 'gameover';
        this._gameoverAt = this.time + 0.9;   // 爆発を少し見せてからゲームオーバー画面へ
      }
    } else {
      k._retired = true;                   // CPUはリタイヤ(以後コースから消える)
    }
  }

  _collisions() {
    if (this._bumpCd > 0) this._bumpCd -= 1 / 60;
    // アイテムボックス: カートの「先端」が触れたときだけ取得
    const boxR = this.track.tile * 0.66;
    for (const k of this.karts) {
      if (k.finished || k.item || k.itemFlash > 0 || k.gone) continue;
      const nx = k.x + Math.cos(k.angle) * (k.radius + 12);   // 先端
      const ny = k.y + Math.sin(k.angle) * (k.radius + 12);
      for (const b of this.track.itemBoxes) {
        if (!b.active) continue;
        if (dist2(nx, ny, b.x, b.y) < boxR * boxR) {
          b.active = false; b.t = 1.2;                         // 割とすぐ復活
          this.giveItem(k);
          // 取得エフェクト(？ブロックが弾けて光が散る)
          const th = this.track.theme;
          for (let p = 0; p < 24; p++) this.spawnParticle(b.x, b.y, p % 3 === 0 ? th.item : (p % 3 === 1 ? '#ffffff' : '#ffd23f'), 'star');
          for (let p = 0; p < 6; p++) this.spawnParticle(b.x, b.y, '#fff', 'boost');
          break;
        }
      }
    }
    // 投擲物 vs カート
    for (const p of this.projectiles) {
      for (const k of this.karts) {
        if (k.finished || k.airZ > 0 || k.gone) continue;   // 空中/爆発/リタイヤはすり抜け
        if (k === p.owner && p.life > 5.6) continue; // 発射直後は自分に当たらない
        if (dist2(k.x, k.y, p.x, p.y) < (k.radius + p.r) * (k.radius + p.r)) {
          if (k.invincTimer > 0) { p.dead = true; continue; }
          if (p.type === 'bomb') { this.explode(p.x, p.y, p.owner); }
          else { k.startSpin(); }
          p.dead = true; break;
        }
      }
    }
    // バナナ vs カート
    for (const o of this.obstacles) {
      for (const k of this.karts) {
        if (k.finished || k.airZ > 0 || k.gone) continue;   // 空中/爆発/リタイヤはすり抜け
        if (k === o.owner && k.dropImmune > 0) continue;
        if (dist2(k.x, k.y, o.x, o.y) < (k.radius + o.r) * (k.radius + o.r)) {
          if (k.invincTimer > 0) { o.life = 0; continue; }
          k.startSpin(); o.life = 0; break;
        }
      }
    }
    // カート同士(ぶつかると強く弾かれ・減速・火花・画面シェイク)
    for (let i = 0; i < this.karts.length; i++)
      for (let j = i + 1; j < this.karts.length; j++) {
        const a = this.karts[i], b = this.karts[j];
        if (a.airZ > 0 || b.airZ > 0 || a.gone || b.gone) continue;  // 空中/爆発/リタイヤは衝突しない
        const min = a.bodyR + b.bodyR;
        if (dist2(a.x, a.y, b.x, b.y) < min * min) {
          let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
          dx /= d; dy /= d;
          const overlap = (min - d);
          // 開幕(カウントダウン+わずかな猶予)は衝突を“成立”させず、静かに分離だけする
          const live = this.state === 'racing' && this.raceTime > 0.4;
          if (!live) {
            const push = overlap / 2 + 0.5;
            a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push;
            continue;
          }
          const aStar = a.invincTimer > 0, bStar = b.invincTimer > 0;
          if (aStar !== bStar) {
            // 片方がスター: スター側は無傷で貫通、相手を強く吹き飛ばしてクラッシュ
            const star = aStar ? a : b, victim = aStar ? b : a;
            const sx = aStar ? dx : -dx, sy = aStar ? dy : -dy;   // スター→相手 方向
            victim.x += sx * (overlap + 6); victim.y += sy * (overlap + 6);
            victim.kbx += sx * 560; victim.kby += sy * 560;       // 強い吹き飛ばし
            victim.startSpin();
            if (victim.hurtCd <= 0) { victim.hurtCd = 0.4; victim.hurt(38, this); }  // スター激突=大ダメージ
            star.speed = Math.max(star.speed, star.baseMax * 0.7); // スター側は止まらない
          } else {
            // 通常 or 両者スター: 押し合い＆反発
            const push = overlap / 2 + 2, sep = 360;
            a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push;
            a.kbx -= dx * sep; a.kby -= dy * sep;
            b.kbx += dx * sep; b.kby += dy * sep;
            if (!aStar) {
              const impact = (Math.abs(a.speed) + Math.abs(b.speed)) * 0.5;
              const dmg = clamp((impact - 70) / 45, 3, 13);
              a.speed *= 0.7; b.speed *= 0.7;
              if (a.hurtCd <= 0) { a.hurtCd = 0.35; a.hurt(dmg, this); }
              if (b.hurtCd <= 0) { b.hurtCd = 0.35; b.hurt(dmg, this); }
            }
          }
          a.bumpTimer = 0.38; b.bumpTimer = 0.38;
          // 手応え(音・火花): プレイヤーの近くの接触だけ鳴らす。距離で音量を絞る。
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const near = this._nearHuman(mx, my);
          const audible = near < this.track.tile * 4;
          if (audible && this._bumpCd <= 0) {
            this._bumpCd = 0.1;
            audio.sfxBump(clamp(1 - near / (this.track.tile * 4), 0.25, 1));
            for (let p = 0; p < 16; p++) this.spawnParticle(mx, my, p % 2 ? '#ffd23f' : '#ffffff', 'spark');
          }
        }
      }
  }

  // 最寄りの人間カートまでの距離(分割画面では全員のうち最短)
  _nearHuman(x, y) {
    let best = Infinity;
    for (const h of this.humans) { const d = Math.hypot(h.x - x, h.y - y); if (d < best) best = d; }
    return best;
  }

  spawnParticle(x, y, color, kind) {
    if (this.particles.length > 260) return;
    const sp = kind === 'spark' ? 60 : 40;
    this.particles.push({
      x, y, color, kind,
      vx: (Math.random() - 0.5) * sp, vy: (Math.random() - 0.5) * sp,
      t: 0, life: kind === 'star' ? 0.5 : 0.4, r: 3 + Math.random() * 3,
    });
  }

  _showResults() {
    audio.stopMusic();
    audio.stopEngine();
    // 未ゴールのカートを進捗順で追加
    const rest = this.karts.filter(k => !k.finished).sort((a, b) => b.progress - a.progress);
    const order = [...this.finishOrder, ...rest];
    const results = order.map((k, i) => ({
      place: i + 1, id: k.id, name: k.name, body: k.def.body,
      isHuman: k.isHuman,
      time: k.finished ? k.finishTime : null,
      bestLap: k.bestLap,
    }));
    const retiredIds = this.karts.filter(k => k._retired).map(k => k.id);   // リタイヤしたCPU
    if (this.onFinish) this.onFinish({ mode: this.mode, trackIndex: this.trackIndex, gpRace: this.gpRace, order: results, retiredIds });
  }

  // スタート位置を「走路の実中央」に補正して生成(壁めり込み防止)
  _placeKarts(total) {
    const T = this.track, tile = T.tile, P = T.path, N = P.length;
    // スタート(path[0])から「コースに沿って」後方へ distPx の地点と前方向きを返す。
    // 離散頂点にスナップせず直線補間する(各行が別位置になりカートのスタックを防ぐ=カオスモード対策)。
    const backPoint = (distPx) => {
      let i = 0, acc = 0, segLen = 0;
      while (acc < distPx) {
        const prev = (i - 1 + N) % N;
        segLen = Math.hypot(P[i].x - P[prev].x, P[i].y - P[prev].y);
        acc += segLen;
        i = prev;
        if (i === 0) break;
      }
      const ahead = (i + 1) % N;                       // distPx より手前側の頂点
      const t = segLen > 0 ? Math.max(0, Math.min(1, (acc - distPx) / segLen)) : 0;
      const x = P[i].x + (P[ahead].x - P[i].x) * t;
      const y = P[i].y + (P[ahead].y - P[i].y) * t;
      let fx = P[ahead].x - P[i].x, fy = P[ahead].y - P[i].y; const fl = Math.hypot(fx, fy) || 1;
      return { x, y, fx: fx / fl, fy: fy / fl };
    };

    this.karts = [];
    for (let i = 0; i < total; i++) {
      const row = Math.floor(i / 2);
      const bp = backPoint(tile * (1.3 + row * 2.1));               // 列ごとに後方へ(当たり半径拡大に合わせ間隔も拡大)
      const fwd = Math.atan2(bp.fy, bp.fx);
      const rx = -bp.fy, ry = bp.fx;                                // 走路の横方向
      const side = (i % 2 === 0 ? -1 : 1) * T.roadHalf * 0.5;
      let x = bp.x + rx * side, y = bp.y + ry * side;
      let tries = 0;
      while (T.isBlocked(x, y, 18) && tries < 40) { x += bp.fx * 6; y += bp.fy * 6; tries++; }
      const isHuman = i < this.numHumans;
      const k = new Kart({
        id: i, isHuman,
        controls: isHuman ? PLAYER_CONTROLS[i] : null,
        x, y, angle: fwd,
      });
      k.assist = isHuman && this.numHumans === 1;   // 1人プレイは操作アシストON
      // 変速モードはプレイヤーごとに指定可(無指定は共通設定→auto)
      k.trans = isHuman ? ((this.transModes && this.transModes[i]) || this.trans || 'auto') : 'auto';
      if (!isHuman) {                                        // CPUの強さを反映
        const d = AI_DIFF[this.aiDiff] || AI_DIFF.normal;
        k.baseMax = HUMAN_BASE * d.speed;
        k.aiItemMul = d.item;
      }
      this.karts.push(k);
    }

    // 初期重なりの解消(台数が多くても開幕でいきなり衝突にならないよう離す)。
    // 分離と「レール内へ寄せる」を交互に行い、カオスモードの大量カートでも収束させる。
    const nudgeIn = (k, step) => {
      const seg = T.nearestOnPath(k.x, k.y).seg, p = P[seg];
      let dx = p.x - k.x, dy = p.y - k.y; const dl = Math.hypot(dx, dy) || 1;
      k.x += (dx / dl) * step; k.y += (dy / dl) * step;
    };
    // 反復回数: 台数が多いほど増やすが、総当たりO(n^2)が膨大な超台数(エラーカオス等)では
    // フリーズしないよう総作業量を上限化(開幕の残り重なりはカウントダウン中に解消される)。
    const nK = this.karts.length;
    const passes = Math.max(6, Math.min(80, nK <= 250 ? 14 + Math.floor(nK / 4) : Math.floor(5e6 / (nK * nK))));
    for (let pass = 0; pass < passes; pass++) {
      for (let i = 0; i < this.karts.length; i++)
        for (let j = i + 1; j < this.karts.length; j++) {
          const a = this.karts[i], b = this.karts[j];
          let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
          const minD = a.bodyR + b.bodyR + 8;
          if (d < minD) { dx /= d; dy /= d; const p = (minD - d) / 2; a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p; }
        }
      for (const k of this.karts) if (T.isBlocked(k.x, k.y, k.radius)) nudgeIn(k, 10);
    }
    // 最終: 確実にレール内へ戻す
    for (const k of this.karts) for (let t = 0; t < 40 && T.isBlocked(k.x, k.y, k.radius); t++) nudgeIn(k, 8);

    // 最高速倍率: 速度・加速・旋回を一律スケール(コーナー半径を保ちつつ全体を速く)
    if (this.speedMul !== 1) {
      for (const k of this.karts) { k.baseMax *= this.speedMul; k.accel *= this.speedMul; k.turnRate *= this.speedMul; }
    }
  }

  // ===================== 描画 (Mode 7 擬似3D) ===========================
  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);

    const viewports = this._viewports();
    for (const vp of viewports) this._renderView(ctx, vp);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // 分割線(グリッドの列・行境界)＋空きセルに順位表
    if (this.numHumans >= 2) {
      const { cols, rows } = this._grid();
      const cw = this.W / cols, ch = this.H / rows;
      ctx.fillStyle = '#05060f';
      for (let c = 1; c < cols; c++) ctx.fillRect(cw * c - 3, 0, 6, this.H);
      for (let r = 1; r < rows; r++) ctx.fillRect(0, ch * r - 3, this.W, 6);
      for (let i = this.numHumans; i < cols * rows; i++) {   // 余ったセルに順位表
        this._renderStandingsPanel(ctx, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch);
      }
    }
    for (const vp of viewports) { ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this._renderHUD(ctx, vp); }
    // 爆発して脱落したプレイヤーの画面は暗くして「リタイア」表示(VSで他が生存している間)
    for (const vp of viewports) {
      if (!vp.kart._exploded) continue;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.save();
      ctx.beginPath(); ctx.rect(vp.x, vp.y, vp.w, vp.h); ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
      const s = Math.min(vp.w, vp.h);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ff6a45'; ctx.font = `bold ${Math.round(s * 0.1)}px sans-serif`;
      ctx.fillText('💥 リタイア', vp.x + vp.w / 2, vp.y + vp.h / 2 - s * 0.04);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `bold ${Math.round(s * 0.038)}px sans-serif`;
      ctx.fillText('他のプレイヤーを待っています…', vp.x + vp.w / 2, vp.y + vp.h / 2 + s * 0.06);
      ctx.restore();
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._renderCenterText(ctx);
  }

  // 3人プレイ時の空き(右下)セルに全体の順位表を描く
  // 余ったセルに順位表(走行中のカートのみ。入りきらない分は省略表示)
  _renderStandingsPanel(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = '#0b0c16'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = 'bold 18px sans-serif'; ctx.fillText('順位', x + 18, y + 14);
    const active = this.karts.filter(k => !k.gone).sort((a, b) => a.place - b.place);
    const rowH = 26, maxRows = Math.max(3, Math.floor((h - 56) / rowH));
    const shown = active.slice(0, maxRows);
    let yy = y + 44;
    for (const k of shown) {
      ctx.fillStyle = k.place === 1 ? '#ffd23f' : '#fff';
      ctx.font = 'bold 16px sans-serif'; ctx.fillText(ordinal(k.place), x + 16, yy);
      ctx.fillStyle = k.def.body; this._roundRect(ctx, x + 62, yy - 1, 16, 16, 4); ctx.fill();
      ctx.fillStyle = k.isHuman ? '#9fe8ff' : '#cfd3da';
      ctx.font = (k.isHuman ? 'bold ' : '') + '15px sans-serif';
      ctx.fillText(k.name + (k.isHuman ? '（操作）' : ''), x + 86, yy + 1);
      yy += rowH;
    }
    if (active.length > shown.length) {
      ctx.fillStyle = '#7788aa'; ctx.font = '13px sans-serif';
      ctx.fillText('…他 ' + (active.length - shown.length) + '台', x + 16, yy + 2);
    }
    ctx.restore();
  }

  // プレイヤー数に応じた分割グリッド(列×行)
  _grid() {
    const n = this.numHumans;
    if (n <= 1) return { cols: 1, rows: 1 };
    if (n === 2) return { cols: 1, rows: 2 };   // 上下
    if (n <= 4) return { cols: 2, rows: 2 };
    if (n <= 6) return { cols: 3, rows: 2 };
    return { cols: 4, rows: 2 };                 // 7〜8人
  }
  _viewports() {
    const n = this.numHumans, W = this.W, H = this.H;
    if (n === 1) return [{ x: 0, y: 0, w: W, h: H, kart: this.humans[0], label: 'P1' }];
    const { cols, rows } = this._grid();
    const cw = W / cols, ch = H / rows, vps = [];
    for (let i = 0; i < n; i++) {
      vps.push({ x: (i % cols) * cw, y: Math.floor(i / cols) * ch, w: cw, h: ch, kart: this.humans[i], label: 'P' + (i + 1) });
    }
    return vps;
  }

  // カメラ定数
  static get HORIZON() { return 0.45; }
  static get CAM_BACK() { return 98; }
  static get CAM_HEIGHT() { return 172; }
  static get FOCAL_K() { return 0.9; }
  static get STRIP() { return 2; }

  _renderView(ctx, vp) {
    const k = vp.kart, T = this.track, th = T.theme;
    const vw = vp.w, vh = vp.h, dpr = this.dpr;
    const horizonY = vp.y + vh * Game.HORIZON;
    const a = k.angle;
    const Fx = Math.cos(a), Fy = Math.sin(a);
    const Rx = -Math.sin(a), Ry = Math.cos(a);
    // 速度が乗るほど視界を広げて疾走感を出す
    const sr = Math.min(1, Math.abs(k.speed) / k.baseMax);
    const focal = vh * Game.FOCAL_K * (1 - 0.08 * sr);
    const camH = Game.CAM_HEIGHT;
    // 衝突時は画面を揺らす
    const shk = k.bumpTimer > 0 ? Math.min(1, k.bumpTimer / 0.38) * 28 : 0;
    const jx = shk ? (Math.random() - 0.5) * shk : 0, jy = shk ? (Math.random() - 0.5) * shk : 0;
    const camx = k.x - Fx * Game.CAM_BACK + jx, camy = k.y - Fy * Game.CAM_BACK + jy;

    // 空 + 地平線下のベース(テクスチャ外の隙間用)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.beginPath(); ctx.rect(vp.x, vp.y, vw, vh); ctx.clip();
    const sky = ctx.createLinearGradient(0, vp.y, 0, horizonY);
    sky.addColorStop(0, th.sky); sky.addColorStop(1, th.skyDk);
    ctx.fillStyle = sky; ctx.fillRect(vp.x, vp.y, vw, horizonY - vp.y);
    ctx.fillStyle = th.grassDk; ctx.fillRect(vp.x, horizonY, vw, vp.y + vh - horizonY);
    // リッチ表示: 空の演出(星・太陽/月・遠景シルエット)。カメラ向きで横にパララックス。
    if (this.richGfx) {
      const dark = (th.sky.charCodeAt(1) < 0x38);   // 暗いテーマ(ネオン/マグマ)か簡易判定
      const pan = ((a / TAU) % 1 + 1) % 1;          // 0..1(方位)
      const spx = vp.x + ((1 - pan) * vw * 2) % vw - vw * 0.0;
      if (dark) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 40; i++) {
          const hx = vp.x + ((i * 97 + pan * vw * 1.5) % vw);
          const hy = vp.y + (i * 53 % (horizonY - vp.y)) * 0.85;
          ctx.globalAlpha = 0.3 + 0.6 * ((i * 7) % 5) / 5;
          ctx.fillRect(hx, hy, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
      // 太陽/月
      const sunX = vp.x + (0.7 - pan) * vw * 1.6 + vw * 0.2;
      const sunY = vp.y + (horizonY - vp.y) * 0.42;
      if (sunX > vp.x - 60 && sunX < vp.x + vw + 60) {
        const g2 = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 60);
        g2.addColorStop(0, dark ? 'rgba(220,235,255,0.95)' : 'rgba(255,250,210,0.95)');
        g2.addColorStop(1, 'rgba(255,240,180,0)');
        ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(sunX, sunY, 60, 0, TAU); ctx.fill();
        ctx.fillStyle = dark ? '#e8f0ff' : '#fff6cf'; ctx.beginPath(); ctx.arc(sunX, sunY, 26, 0, TAU); ctx.fill();
      }
      const skyH = horizonY - vp.y;
      // 雲(やわらかい白。明るいテーマのみ。方位でパララックス)
      if (!dark) {
        for (let i = 0; i < 5; i++) {
          const cw = vw * (0.2 + (i % 3) * 0.06);
          const cx2 = vp.x + (((i * 0.31 + pan * 0.7) % 1.25) - 0.12) * vw;
          const cy2 = vp.y + skyH * (0.1 + (i % 3) * 0.1);
          ctx.fillStyle = `rgba(255,255,255,${0.4 + (i % 2) * 0.18})`;
          ctx.beginPath();
          ctx.ellipse(cx2, cy2, cw * 0.5, cw * 0.16, 0, 0, TAU);
          ctx.ellipse(cx2 + cw * 0.24, cy2 + 3, cw * 0.32, cw * 0.12, 0, 0, TAU);
          ctx.ellipse(cx2 - cw * 0.26, cy2 + 4, cw * 0.28, cw * 0.11, 0, 0, TAU);
          ctx.fill();
        }
      }
      // 遠景の山(2層): 奥は淡く霞んで、手前は濃く。地平線にかぶせて奥行きを出す。
      ctx.fillStyle = th.grassDk; ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.moveTo(vp.x, horizonY);
      for (let i = 0; i <= 20; i++) {
        const hx = vp.x + (i / 20) * vw;
        const h = (Math.sin(i * 0.8 + pan * 5 + 1.7) * 0.5 + 0.5) * skyH * 0.26 + 10;
        ctx.lineTo(hx, horizonY - h);
      }
      ctx.lineTo(vp.x + vw, horizonY); ctx.closePath(); ctx.fill();
      ctx.fillStyle = th.grassDk; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(vp.x, horizonY);
      for (let i = 0; i <= 16; i++) {
        const hx = vp.x + (i / 16) * vw;
        const h = (Math.sin(i * 1.3 + pan * 6) * 0.5 + 0.5) * skyH * 0.16 + 6;
        ctx.lineTo(hx, horizonY - h);
      }
      ctx.lineTo(vp.x + vw, horizonY); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // 地面(Mode 7): 走査線ごとにアフィン変換でテクスチャを射影
    const bottom = vp.y + vh;
    const STRIP = Game.STRIP;
    for (let sy = Math.floor(horizonY) + 1; sy < bottom; sy += STRIP) {
      const p = sy - horizonY;
      if (p < 2) continue;
      const p2 = p + STRIP;
      const d = (camH * focal) / p;
      const d2 = (camH * focal) / p2;
      if (d > 90000) continue;
      const s = d / focal;
      const Wxx = Rx * s, Wxy = Ry * s;            // 画面+1px右 → world
      const ddp = (d2 - d) / STRIP;                 // 画面+1px下 → 奥行き変化
      const Wyx = Fx * ddp, Wyy = Fy * ddp;
      const det = Wxx * Wyy - Wyx * Wxy;
      if (Math.abs(det) < 1e-6) continue;
      const i00 = Wyy / det, i01 = -Wyx / det, i10 = -Wxy / det, i11 = Wxx / det;
      const Ox = camx + Fx * d, Oy = camy + Fy * d;
      // texel(u,v) → 画面(グローバルCSS)。ベイクは bs 倍縮小なので A..D を /bs 補正
      const bs = T.bakeScale;
      const A = i00 / bs, C = i01 / bs, E = (vp.x + vw / 2) - i00 * Ox - i01 * Oy;
      const B = i10 / bs, D = i11 / bs, F = sy - i10 * Ox - i11 * Oy;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath(); ctx.rect(vp.x, sy, vw, STRIP); ctx.clip();
      ctx.setTransform(A * dpr, B * dpr, C * dpr, D * dpr, E * dpr, F * dpr);
      ctx.drawImage(T.canvas, 0, 0);
      ctx.restore();
    }

    // 遠景フォグ(地平線付近を空色に溶かす)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.beginPath(); ctx.rect(vp.x, horizonY, vw, vh * 0.22); ctx.clip();
    const fog = ctx.createLinearGradient(0, horizonY, 0, horizonY + vh * 0.22);
    fog.addColorStop(0, th.skyDk); fog.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.85; ctx.fillStyle = fog; ctx.fillRect(vp.x, horizonY, vw, vh * 0.22);
    ctx.restore();

    // --- スプライト(ビルボード) ---
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.beginPath(); ctx.rect(vp.x, vp.y, vw, vh); ctx.clip();

    const cam = { x: camx, y: camy }, Fv = { x: Fx, y: Fy }, Rv = { x: Rx, y: Ry };
    const sprites = [];
    const add = (wx, wy, draw) => {
      const pr = this._project(wx, wy, cam, Fv, Rv, focal, horizonY, vp);
      if (pr) sprites.push({ pr, draw });
    };
    if (this.richGfx && T.scenery) for (const sc of T.scenery) add(sc.x, sc.y, (c, P) => this._spScenery(c, P, sc, T.theme));
    for (const rp of T.ramps) add(rp.x, rp.y, (c, P) => this._spRamp(c, P));
    for (const b of T.itemBoxes) if (b.active) add(b.x, b.y, (c, P) => this._spItemBox(c, P));
    for (const o of this.obstacles) add(o.x, o.y, (c, P) => this._spBanana(c, P));
    for (const pj of this.projectiles) add(pj.x, pj.y, (c, P) => this._spProjectile(c, P, pj));
    for (const ex of this.explosions) add(ex.x, ex.y, (c, P) => this._spExplosion(c, P, ex));
    for (const pa of this.particles) add(pa.x, pa.y, (c, P) => this._spParticle(c, P, pa));
    for (const kt of this.karts) if (kt !== k && !kt.gone) add(kt.x, kt.y, (c, P) => this._spKart(c, P, kt, false));
    // 奥から手前へ
    sprites.sort((u, v) => v.pr.fdist - u.pr.fdist);
    for (const sp of sprites) sp.draw(ctx, sp.pr);

    // 自分のカート(画面下部の固定スプライト)
    this._drawSelfKart(ctx, vp, k);

    // 接近カートの警告矢印(画面に映っていない近くのカートを画面端に表示)
    const warnR = 560;
    const ccx = vp.x + vw / 2, ccy = vp.y + vh * 0.56;
    for (const o of this.karts) {
      if (o === k || o.gone) continue;
      const rx = o.x - k.x, ry = o.y - k.y;
      const dist = Math.hypot(rx, ry);
      if (dist > warnR) continue;
      const pr2 = this._project(o.x, o.y, cam, Fv, Rv, focal, horizonY, vp);
      const onScreen = pr2 && pr2.sx > vp.x + 24 && pr2.sx < vp.x + vw - 24 && pr2.sy > horizonY + 6 && pr2.sy < vp.y + vh - 8;
      if (onScreen) continue;                       // 既に見えているカートは出さない
      const fwd = rx * Fx + ry * Fy, lat = rx * Rx + ry * Ry;
      let dirx = lat, diry = -fwd;                  // 画面: 右=+lat, 上(前方)=-fwd
      const dl = Math.hypot(dirx, diry) || 1; dirx /= dl; diry /= dl;
      const ex = ccx + dirx * vw * 0.42, ey = ccy + diry * vh * 0.36;
      const near = 1 - clamp(dist / warnR, 0, 1);   // 近いほど1
      const size = 15 + near * 20;
      const pulse = dist < 160 ? (0.7 + 0.3 * Math.sin(this.time * 18)) : 1;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(Math.atan2(diry, dirx));
      ctx.globalAlpha = (0.55 + near * 0.45) * pulse;
      ctx.fillStyle = o.def.body; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(size, 0); ctx.lineTo(-size * 0.65, size * 0.7); ctx.lineTo(-size * 0.2, 0); ctx.lineTo(-size * 0.65, -size * 0.7);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // 衝突の白フラッシュ
    if (k.bumpTimer > 0) {
      ctx.globalAlpha = Math.min(1, k.bumpTimer / 0.38) * 0.32;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(vp.x, vp.y, vw, vh);
      ctx.globalAlpha = 1;
    }
    // レスキュー表示
    if (k.rescueFlash > 0) {
      ctx.globalAlpha = Math.min(1, k.rescueFlash);
      ctx.fillStyle = '#5ef2ff';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('コースに戻ります！', vp.x + vw / 2, vp.y + vh * 0.4);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  _project(wx, wy, cam, F, R, focal, horizonY, vp) {
    const rx = wx - cam.x, ry = wy - cam.y;
    const fdist = rx * F.x + ry * F.y;
    if (fdist < 26) return null;
    const lat = rx * R.x + ry * R.y;
    const p = (Game.CAM_HEIGHT * focal) / fdist;
    const sy = horizonY + p;
    if (sy > vp.y + vp.h + 80) return null;
    const sx = vp.x + vp.w / 2 + (lat * focal) / fdist;
    return { sx, sy, scale: focal / fdist, fdist };
  }

  _spKart(ctx, P, k, isSelf) {
    const sc = clamp(P.scale * 96, 12, 320);   // ライバルを大きく(プレイヤーと揃える)
    // 走行中のわずかな上下揺れ + 旋回での傾き
    const sr = Math.min(1, Math.abs(k.speed) / k.baseMax);
    const bob = Math.sin(this.time * 15 + k.id * 1.7) * 2 * sr * (sc / 64);
    const tilt = clamp(k.steerSmooth, -1, 1) * 0.12;
    ctx.save();
    ctx.translate(P.sx, P.sy + bob);
    ctx.rotate(tilt);
    this._kartSprite(ctx, 0, 0, sc, k, isSelf, k.airZ ? k.airZ * (sc / 64) : 0);
    ctx.restore();
    // ライバルのライフ小バー(ダメージ時のみ。混戦でも一目で分かるように)
    if (!isSelf && k.life < k.maxLife - 0.5 && sc > 28) {
      const r = clamp(k.life / k.maxLife, 0, 1), bw = sc * 0.6, bx = P.sx - bw / 2, by = P.sy - sc * 0.72;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = r > 0.5 ? '#46e06a' : (r > 0.25 ? '#ffd23f' : '#ff4d3d');
      ctx.fillRect(bx, by, bw * r, 3);
    }
  }
  // 共通: 後方視点のレーシングカート(かっこよく)
  _kartSprite(ctx, x, y, sc, k, isSelf, lift = 0) {
    ctx.save();
    ctx.translate(x, y);
    const u = sc / 64;
    const d = k.def;
    const S = KART_KINDS[d.kind] || KART_KINDS.f1;
    const RR = (px, py, w, h, r) => { this._roundRect(ctx, px * u, py * u, w * u, h * u, r * u); };

    const bodyLt = this._shadeHex(d.body, 70);   // ハイライト寄りの明色
    const bodyHi = this._shadeHex(d.body, 36);
    const wingLt = this._shadeHex(d.dark, 46);
    const wingDk = this._shadeHex(d.dark, -28);
    const bw = S.bw, tw = S.tw, ty = S.topY, by = 15, belly = 21;

    // 接地影(車体幅に合わせる)。ジャンプ中は影を小さく薄く地面に残す。
    const shS = lift > 0 ? Math.max(0.4, 1 - lift / 180) : 1;
    ctx.fillStyle = `rgba(0,0,0,${0.26 * shS})`;
    ctx.beginPath(); ctx.ellipse(0, 16 * u, (bw + 9) * u * shS, 11 * u * shS, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(0,0,0,${0.22 * shS})`;
    ctx.beginPath(); ctx.ellipse(1 * u, 17 * u, (bw - 3) * u * shS, 7 * u * shS, 0, 0, TAU); ctx.fill();
    if (lift > 0) ctx.translate(0, -lift);       // 機体を持ち上げる(影は地面に残る)
    // スター無敵オーラ
    if (k.invincTimer > 0) {
      ctx.globalAlpha = 0.55; ctx.fillStyle = `hsl(${(this.time * 480) % 360},90%,62%)`;
      ctx.beginPath(); ctx.arc(0, -10 * u, 36 * u, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    if (this.slowTimer > 0 && k !== this.slowOwner) {
      ctx.globalAlpha = 0.4; ctx.fillStyle = '#3bb0ff';
      ctx.beginPath(); ctx.arc(0, -10 * u, 30 * u, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    const spin = k.spinTimer > 0 ? Math.sin(this.time * 30) * 0.28 : 0;
    ctx.rotate(spin);

    // ブースト炎(最初に=タイヤ/ボディの後ろ)
    if (k.boostTimer > 0) {
      const fl = 12 + Math.random() * 12;
      for (const ex of [-15, 15]) {
        ctx.fillStyle = Math.sin(this.time * 45 + ex) > 0 ? '#ff7a1a' : '#ffe23a';
        ctx.beginPath();
        ctx.moveTo((ex - 5) * u, 12 * u); ctx.lineTo(ex * u, (14 + fl) * u); ctx.lineTo((ex + 5) * u, 12 * u);
        ctx.closePath(); ctx.fill();
      }
    }

    // リアタイヤ(車種で幅/位置が変わる。円柱シェーディング+ハブ)
    const trk = S.trk, twW = S.tireW;
    for (const sx of [-1, 1]) {
      const tx = sx > 0 ? trk : -(trk + twW);
      const tg = ctx.createLinearGradient(tx * u, 0, (tx + twW) * u, 0);
      tg.addColorStop(0, '#050507'); tg.addColorStop(0.5, '#3c3c47'); tg.addColorStop(1, '#070709');
      ctx.fillStyle = tg; RR(tx, -13, twW, 27, 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.13)'; RR(tx + twW * 0.25, -13, twW * 0.2, 27, 1.6); ctx.fill();
      if (d.kind === 'buggy') {                       // ブロックタイヤ(トレッド溝)
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        for (let yy = -11; yy < 13; yy += 5) { RR(tx, yy, twW, 1.8, 0.6); ctx.fill(); }
      }
      const hx = (sx > 0 ? trk + twW * 0.5 : -(trk + twW * 0.5)) * u;
      const hg = ctx.createRadialGradient(hx - 1.4 * u, -2.5 * u, 0.4 * u, hx, 0, 8 * u);
      hg.addColorStop(0, '#d6d9e2'); hg.addColorStop(0.5, '#70737f'); hg.addColorStop(1, '#202028');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.ellipse(hx, 0, 4 * u, 8 * u, 0, 0, TAU); ctx.fill();
      const wspin = this.time * (3 + Math.abs(k.speed) / 45);   // 速度で速く回る
      ctx.fillStyle = '#101016';
      for (let s = 0; s < 2; s++) {
        const a2 = wspin + s * Math.PI;
        if (Math.cos(a2) > 0.1) ctx.fillRect(hx - 1.6 * u, Math.sin(a2) * 6 * u - u, 3.2 * u, 2 * u);
      }
    }

    // === 後部の翼/バー(車体の後ろに描く) ===
    if (S.wing === 'big') {                         // F1の二段ウイング
      const wg = ctx.createLinearGradient(0, -40 * u, 0, -28 * u);
      wg.addColorStop(0, wingLt); wg.addColorStop(1, wingDk);
      ctx.fillStyle = wg; RR(-33, -36, 66, 8, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; RR(-33, -36, 66, 2.2, 2); ctx.fill();
      ctx.fillStyle = wingDk; RR(-34, -40, 5, 14, 2); ctx.fill(); RR(29, -40, 5, 14, 2); ctx.fill();
      ctx.fillStyle = d.dark; RR(-3.5, -34, 7, 12, 2); ctx.fill();
    } else if (S.wing === 'spoiler') {              // マッスル: 支柱付き跳ね上げ
      ctx.fillStyle = wingDk; RR(-20, -33, 4, 12, 1.5); ctx.fill(); RR(16, -33, 4, 12, 1.5); ctx.fill();
      const wg = ctx.createLinearGradient(0, -38 * u, 0, -31 * u);
      wg.addColorStop(0, wingLt); wg.addColorStop(1, wingDk);
      ctx.fillStyle = wg; RR(-26, -37, 52, 6, 2.5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; RR(-26, -37, 52, 1.8, 1.5); ctx.fill();
    } else if (S.wing === 'cage') {                 // バギー: ロールケージ
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#26262c'; ctx.lineWidth = 4 * u;
      ctx.beginPath();
      ctx.moveTo(-15 * u, 6 * u); ctx.lineTo(-12 * u, (ty + 1) * u);
      ctx.lineTo(12 * u, (ty + 1) * u); ctx.lineTo(15 * u, 6 * u);
      ctx.moveTo(-12 * u, (ty + 6) * u); ctx.lineTo(12 * u, (ty + 6) * u);
      ctx.stroke();
      ctx.strokeStyle = '#54545e'; ctx.lineWidth = 1.4 * u;
      ctx.beginPath();
      ctx.moveTo(-15 * u, 6 * u); ctx.lineTo(-12 * u, (ty + 1) * u);
      ctx.lineTo(12 * u, (ty + 1) * u); ctx.lineTo(15 * u, 6 * u); ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // === 車体(bw/tw/topYで形が変わる) ===
    ctx.beginPath();
    ctx.moveTo(-bw * u, by * u);
    ctx.lineTo(-tw * u, (ty + 9) * u);
    ctx.quadraticCurveTo(-(tw - 6) * u, ty * u, 0, ty * u);
    ctx.quadraticCurveTo((tw - 6) * u, ty * u, tw * u, (ty + 9) * u);
    ctx.lineTo(bw * u, by * u);
    ctx.quadraticCurveTo(0, belly * u, -bw * u, by * u);
    ctx.closePath();
    const bg = ctx.createLinearGradient(0, ty * u, 0, belly * u);
    bg.addColorStop(0, bodyLt); bg.addColorStop(0.4, d.body); bg.addColorStop(1, d.dark);
    ctx.fillStyle = bg; ctx.fill();
    ctx.lineWidth = 1.6 * u; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
    // 陰影 + レーシングストライプ(ボディ内にクリップ)
    ctx.save(); ctx.clip();
    const sp = ctx.createRadialGradient(-6 * u, (ty + 7) * u, 1 * u, -2 * u, (ty + 12) * u, 30 * u);
    sp.addColorStop(0, 'rgba(255,255,255,0.6)'); sp.addColorStop(0.5, 'rgba(255,255,255,0.13)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sp; ctx.fillRect(-bw * u, ty * u, bw * 2 * u, 32 * u);
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; RR(-(bw - 2), ty + 7, 3.4, 34, 1.6); ctx.fill();
    const cg = ctx.createLinearGradient(0, 3 * u, 0, belly * u);
    cg.addColorStop(0, 'rgba(0,0,0,0)'); cg.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = cg; ctx.fillRect(-bw * u, 1 * u, bw * 2 * u, 20 * u);
    if (S.cabin === 'helmet') {                      // オープン系のみセンターストライプ
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(-4 * u, ty * u, 8 * u, (belly - ty) * u);
      ctx.fillStyle = d.dark; ctx.fillRect(-1.4 * u, ty * u, 2.8 * u, (belly - ty) * u);
    }
    ctx.restore();

    // サイドポッド前縁の差し色
    ctx.fillStyle = bodyHi; RR(-(bw - 2), 8, 10, 8, 3); ctx.fill(); RR(bw - 12, 8, 10, 8, 3); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; RR(-(bw - 2), 13.5, 10, 2.5, 1.4); ctx.fill(); RR(bw - 12, 13.5, 10, 2.5, 1.4); ctx.fill();

    // 小リップスポイラー(スポーツ/ワゴン: 車体後縁に低く)
    if (S.wing === 'lip') {
      ctx.fillStyle = wingDk; RR(-(tw - 1), ty - 3, (tw - 1) * 2, 4, 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; RR(-(tw - 1), ty - 3, (tw - 1) * 2, 1.3, 1); ctx.fill();
    }

    // === キャビン ===
    if (S.cabin === 'helmet') {
      // コックピット + ドライバー(球状ヘルメット)
      ctx.fillStyle = '#14141b';
      ctx.beginPath(); ctx.ellipse(0, -16 * u, 12 * u, 9 * u, 0, 0, TAU); ctx.fill();
      const hl = ctx.createRadialGradient(-3 * u, -22 * u, 1 * u, 0, -19 * u, 10 * u);
      hl.addColorStop(0, '#ffffff'); hl.addColorStop(0.5, '#dadae3'); hl.addColorStop(1, '#9596a2');
      ctx.fillStyle = hl;
      ctx.beginPath(); ctx.arc(0, -19 * u, 8 * u, 0, TAU); ctx.fill();
      ctx.fillStyle = d.body;
      ctx.fillRect(-8 * u, -25 * u, 16 * u, 4 * u);
      ctx.fillStyle = '#0c0c14';
      ctx.beginPath(); ctx.arc(0, -18 * u, 6.5 * u, 0.12 * Math.PI, 0.88 * Math.PI); ctx.fill();
      ctx.fillStyle = 'rgba(120,200,255,0.5)';
      ctx.beginPath(); ctx.arc(-2 * u, -18.5 * u, 2.3 * u, 0, TAU); ctx.fill();
    } else {
      // 屋根付き(スポーツ/マッスル/ワゴン): ルーフ + リアガラス
      ctx.fillStyle = d.dark; RR(-(tw - 3), ty - 1, (tw - 3) * 2, 3, 2); ctx.fill();   // ルーフ後縁
      const winTop = ty + 2, winH = S.cabin === 'tall' ? 17 : 13, winBot = winTop + winH, winW = tw - 5;
      const gg = ctx.createLinearGradient(0, winTop * u, 0, winBot * u);
      gg.addColorStop(0, '#10161f'); gg.addColorStop(1, '#33485f');
      ctx.fillStyle = gg; this._roundRect(ctx, -winW * u, winTop * u, winW * 2 * u, winH * u, 3 * u); ctx.fill();
      ctx.fillStyle = 'rgba(160,210,255,0.28)'; this._roundRect(ctx, -(winW - 1) * u, (winTop + 1) * u, (winW - 1) * 2 * u, 3.2 * u, 2 * u); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(-winW * 0.5 * u, winTop * u, 2.6 * u, winH * u);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; RR(-(tw - 3), ty - 1, (tw - 3) * 2, 1.5, 1); ctx.fill();
      if (S.cabin === 'tall') {                       // ワゴンはルーフレール
        ctx.fillStyle = wingDk; RR(-(tw - 4), ty, 2, 4, 1); ctx.fill(); RR(tw - 6, ty, 2, 4, 1); ctx.fill();
      }
    }

    // エキゾースト + ブレーキランプ(車種で本数/幅が変わる)
    ctx.fillStyle = '#d2d2da';
    ctx.beginPath();
    if (S.exh === 2) { ctx.arc(-15 * u, 12 * u, 3 * u, 0, TAU); ctx.arc(15 * u, 12 * u, 3 * u, 0, TAU); }
    else { ctx.arc(0, 12.5 * u, 3.4 * u, 0, TAU); }
    ctx.fill();
    const lx = bw - 7;
    const braking = k.control && k.control.throttle < 0;
    ctx.fillStyle = braking ? '#ff5247' : '#c01d12';
    if (braking) { ctx.shadowColor = '#ff3b2e'; ctx.shadowBlur = 6 * u; }
    RR(-lx, 3, 7, 4, 1.5); ctx.fill(); RR(lx - 7, 3, 7, 4, 1.5); ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  _drawSelfKart(ctx, vp, k) {
    if (k._exploded) return;                 // 爆発したら自機は描かない(爆発演出のみ)
    const vw = vp.w, vh = vp.h;
    const baseScale = vh / 300;
    const sr = Math.min(1, Math.abs(k.speed) / k.baseMax);     // 速度比
    const steerVis = k.steerSmooth + (k.drifting ? k.driftDir * 0.45 : 0);
    // コーナーでの横移動 と 車体の傾き(ロール)
    const lean = clamp(steerVis, -1.4, 1.4) * 26 * baseScale;
    const tilt = clamp(steerVis, -1, 1) * 0.17 * (0.55 + 0.45 * sr);
    // エンジンの上下揺れ(常時+速度で増す) と 左右の揺れ
    const bob = Math.sin(this.time * 16) * (1.2 + 2.8 * sr) * baseScale;
    const sway = Math.sin(this.time * 7.3) * (1.0 + 1.8 * sr) * baseScale;
    // アクセル/ブレーキでの前後の沈み込み
    const pitch = clamp(k.control ? k.control.throttle : 0, -1, 1);
    // エンジンの細かい振動(常時。アクセル中・高速ほど強い=動いている感)
    const accelOn = k.control && k.control.throttle > 0;
    const rumble = (Math.sin(this.time * 67) + Math.sin(this.time * 113) * 0.5) * (0.5 + sr * 1.3 + (accelOn ? 0.6 : 0)) * baseScale;
    const rumbleY = Math.sin(this.time * 91) * (0.4 + sr * 0.9) * baseScale;
    const shake = (k.spinTimer > 0 ? (Math.random() - 0.5) * 12 : 0) + (k.bumpTimer > 0 ? (Math.random() - 0.5) * 18 : 0) + rumble;
    const x = vp.x + vw / 2 + lean + sway + shake;
    const y = vp.y + vh * 0.82 + bob - pitch * 3 * baseScale + rumbleY;

    // 排気の煙(動いている感)。マフラー位置から立ち上って消える。
    if (this.richGfx && Math.abs(k.speed) > 30) {
      for (let i = 0; i < 3; i++) {
        const ph = (this.time * 1.6 + i * 0.33) % 1;
        const px2 = x + (i === 1 ? 14 : -14) * baseScale + Math.sin(this.time * 3 + i) * 6 * baseScale;
        const py2 = y + (10 - ph * 46) * baseScale;
        ctx.globalAlpha = (1 - ph) * 0.28 * (0.4 + sr);
        ctx.fillStyle = accelOn ? 'rgba(210,210,220,1)' : 'rgba(170,170,180,1)';
        ctx.beginPath(); ctx.arc(px2, py2, (3 + ph * 9) * baseScale, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // グラップル・ダッシュ: 前方へ伸びるビーム(=引き寄せられている表現)
    if (k.dashTimer > 0) {
      ctx.save();
      const topY = vp.y + vh * Game.HORIZON;
      ctx.globalAlpha = 0.85; ctx.strokeStyle = '#5ef2ff'; ctx.lineWidth = 5 * baseScale; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y - 28 * baseScale); ctx.lineTo(x, topY + 8); ctx.stroke();
      ctx.globalAlpha = 0.95; ctx.fillStyle = '#d8fbff';
      const seg = 42 * baseScale, off = (this.time * 900) % seg;
      for (let ly = y - 28 * baseScale; ly > topY; ly -= seg) {
        const yy = ly - off;
        if (yy > topY) { ctx.beginPath(); ctx.moveTo(x - 7 * baseScale, yy); ctx.lineTo(x, yy - 9 * baseScale); ctx.lineTo(x + 7 * baseScale, yy); ctx.closePath(); ctx.fill(); }
      }
      ctx.restore();
    }

    // 高速 or ブーストでスピードライン(流れる線=走っている感)
    const lines = (k.boostTimer > 0 || k.dashTimer > 0) ? 18 : (sr > 0.5 ? Math.round((sr - 0.5) * 26) : 0);
    if (lines > 0) {
      ctx.save();
      ctx.globalAlpha = (k.boostTimer > 0 || k.dashTimer > 0) ? 0.55 : 0.3;
      ctx.strokeStyle = k.dashTimer > 0 ? 'rgba(150,240,255,0.9)' : (k.boostTimer > 0 ? '#fff' : 'rgba(255,255,255,0.85)');
      ctx.lineWidth = 2;
      for (let i = 0; i < lines; i++) {
        const lx = vp.x + Math.random() * vw;
        const ly = vp.y + vh * Game.HORIZON + Math.random() * vh * 0.55;
        const len = 18 + Math.random() * 26 * (0.4 + sr);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly + len); ctx.stroke();
      }
      ctx.restore();
    }

    // 傾けて描画(ドリフト中はさらに振る)
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt + (k.drifting ? -k.driftDir * 0.1 : 0));
    this._kartSprite(ctx, 0, 0, 82 * baseScale, k, true, k.airZ ? k.airZ * (82 * baseScale / 64) : 0);   // 自機は一回り小さめ
    ctx.restore();

    // 衝突インパクト(自機の位置で弾ける星)
    if (k.bumpTimer > 0) {
      const a = Math.min(1, k.bumpTimer / 0.38);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5 * baseScale;
      const cy = y - 16 * baseScale;
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * TAU + this.time * 6;
        const r1 = (16 + (1 - a) * 10) * baseScale, r2 = (34 + (1 - a) * 46) * baseScale;
        ctx.strokeStyle = i % 2 ? '#fff' : '#ffd23f';
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.lineTo(x + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(30 * baseScale)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💥', x, cy);
      ctx.restore();
    }
    // アイテム発射光(自機の前方=画面では上)
    if (k.fireFlash > 0) {
      const a = Math.min(1, k.fireFlash / 0.22);
      const mx = x, my = y - 58 * baseScale;
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, 32 * baseScale);
      g.addColorStop(0, `rgba(255,255,210,${0.95 * a})`); g.addColorStop(1, 'rgba(255,200,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, 32 * baseScale, 0, TAU); ctx.fill();
    }
    // アイテム取得の煌めきリング + GET!
    if (k.itemFlash > 0) {
      const a = Math.min(1, k.itemFlash / 0.6);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * baseScale;
      ctx.beginPath(); ctx.arc(x, y - 14 * baseScale, ((1 - a) * 90 + 26) * baseScale, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffd23f'; ctx.font = `bold ${Math.round(22 * baseScale)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('GET!', x, y - 74 * baseScale);
      ctx.restore();
    }
  }

  // 沿道の装飾(リッチ表示)。種類ごとに簡単なビルボードを描く。
  _spScenery(ctx, P, sc, th) {
    const h = clamp(P.scale * 80 * sc.s, 4, 360);
    const x = P.sx, y = P.sy;
    ctx.save();
    // 接地影
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(x, y, h * 0.28, h * 0.08, 0, 0, TAU); ctx.fill();
    const w = h * 0.5;
    switch (sc.kind) {
      case 'tree':
        ctx.fillStyle = '#6b4326'; ctx.fillRect(x - h * 0.05, y - h * 0.4, h * 0.1, h * 0.4);
        ctx.fillStyle = '#2f8f34'; ctx.beginPath(); ctx.arc(x, y - h * 0.55, h * 0.3, 0, TAU); ctx.fill();
        ctx.fillStyle = '#3fb04a'; ctx.beginPath(); ctx.arc(x - h * 0.12, y - h * 0.62, h * 0.18, 0, TAU); ctx.fill();
        break;
      case 'cactus':
        ctx.fillStyle = '#3f8f4a';
        this._roundRect(ctx, x - h * 0.07, y - h * 0.7, h * 0.14, h * 0.7, h * 0.06); ctx.fill();
        this._roundRect(ctx, x - h * 0.26, y - h * 0.5, h * 0.12, h * 0.28, h * 0.05); ctx.fill();
        this._roundRect(ctx, x + h * 0.14, y - h * 0.58, h * 0.12, h * 0.3, h * 0.05); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x - h * 0.02, y - h * 0.7, h * 0.04, h * 0.7);
        break;
      case 'rock': case 'dune':
        ctx.fillStyle = sc.kind === 'dune' ? '#caa05e' : '#8a8a92';
        ctx.beginPath(); ctx.ellipse(x, y - h * 0.18, w * 0.5, h * 0.22, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(x - w * 0.12, y - h * 0.26, w * 0.18, h * 0.08, 0, 0, TAU); ctx.fill();
        break;
      case 'pillar':
        ctx.fillStyle = '#171a36'; this._roundRect(ctx, x - h * 0.09, y - h * 0.95, h * 0.18, h * 0.95, h * 0.03); ctx.fill();
        ctx.fillStyle = th.wall; ctx.fillRect(x - h * 0.11, y - h * 0.95, h * 0.04, h * 0.95);
        ctx.fillStyle = th.line; ctx.fillRect(x + h * 0.07, y - h * 0.95, h * 0.04, h * 0.95);
        ctx.fillStyle = th.line; ctx.beginPath(); ctx.arc(x, y - h * 0.95, h * 0.1, 0, TAU); ctx.fill();
        break;
      case 'sign':
        ctx.fillStyle = '#0c0c1a'; this._roundRect(ctx, x - h * 0.03, y - h * 0.8, h * 0.06, h * 0.8, 2); ctx.fill();
        ctx.fillStyle = th.item; this._roundRect(ctx, x - h * 0.32, y - h * 0.95, h * 0.64, h * 0.3, h * 0.04); ctx.fill();
        ctx.fillStyle = th.line; this._roundRect(ctx, x - h * 0.27, y - h * 0.9, h * 0.54, h * 0.2, h * 0.03); ctx.fill();
        break;
      case 'lavarock': case 'spike':
        ctx.fillStyle = '#241416';
        if (sc.kind === 'spike') { ctx.beginPath(); ctx.moveTo(x - w * 0.32, y); ctx.lineTo(x, y - h * 0.85); ctx.lineTo(x + w * 0.32, y); ctx.closePath(); ctx.fill(); }
        else { ctx.beginPath(); ctx.ellipse(x, y - h * 0.2, w * 0.5, h * 0.24, 0, Math.PI, 0); ctx.fill(); }
        ctx.strokeStyle = '#ff6a1a'; ctx.lineWidth = Math.max(1, h * 0.03);
        ctx.beginPath(); ctx.moveTo(x - w * 0.2, y - h * 0.1); ctx.lineTo(x, y - h * 0.3); ctx.lineTo(x + w * 0.15, y - h * 0.12); ctx.stroke();
        break;
      case 'flame': {
        const fl = 0.7 + 0.3 * Math.sin(this.time * 12 + sc.ph);
        const g = ctx.createLinearGradient(x, y, x, y - h * fl);
        g.addColorStop(0, '#ffe23a'); g.addColorStop(0.6, '#ff7a1a'); g.addColorStop(1, 'rgba(255,40,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x - w * 0.22, y); ctx.quadraticCurveTo(x - w * 0.1, y - h * 0.5 * fl, x, y - h * fl);
        ctx.quadraticCurveTo(x + w * 0.1, y - h * 0.5 * fl, x + w * 0.22, y); ctx.closePath(); ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  // ジャンプ台(せり上がる台＋上向きシェブロン)
  _spRamp(ctx, P) {
    const sc = clamp(P.scale * 92, 10, 320), u = sc / 64;
    const th = this.track.theme;
    ctx.save(); ctx.translate(P.sx, P.sy);
    // 接地影
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(0, 7 * u, 46 * u, 13 * u, 0, 0, TAU); ctx.fill();
    // 本体(手前広→奥狭の台形=せり上がるスロープ)
    ctx.beginPath();
    ctx.moveTo(-42 * u, 7 * u); ctx.lineTo(42 * u, 7 * u);
    ctx.lineTo(25 * u, -30 * u); ctx.lineTo(-25 * u, -30 * u); ctx.closePath();
    const g = ctx.createLinearGradient(0, 7 * u, 0, -30 * u);
    g.addColorStop(0, '#33373f'); g.addColorStop(1, '#6b7480');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2 * u; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
    // サイドの縞(警告)
    ctx.fillStyle = '#13151a';
    ctx.beginPath(); ctx.moveTo(-42 * u, 7 * u); ctx.lineTo(-33 * u, 7 * u); ctx.lineTo(-21 * u, -30 * u); ctx.lineTo(-25 * u, -30 * u); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(42 * u, 7 * u); ctx.lineTo(33 * u, 7 * u); ctx.lineTo(21 * u, -30 * u); ctx.lineTo(25 * u, -30 * u); ctx.closePath(); ctx.fill();
    // 前縁の明るいリップ
    ctx.fillStyle = th.accent || '#ffd23f'; this._roundRect(ctx, -42 * u, 2 * u, 84 * u, 6 * u, 2 * u); ctx.fill();
    // 上向きシェブロン(流れるアニメ=飛べる合図)
    for (let i = 0; i < 3; i++) {
      const yy = (1 - i * 11 - ((this.time * 2) % 1) * 11) * u;
      ctx.globalAlpha = 0.95 - i * 0.25; ctx.fillStyle = '#ffe23a';
      ctx.beginPath();
      ctx.moveTo(0, yy - 11 * u); ctx.lineTo(14 * u, yy); ctx.lineTo(8 * u, yy);
      ctx.lineTo(0, yy - 6 * u); ctx.lineTo(-8 * u, yy); ctx.lineTo(-14 * u, yy); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // 4方向のきらめき(？マークの代わりに使う中央マーク)。パスのみ(呼び出し側でfill)。
  _drawSpark(ctx, cx, cy, R) {
    const c = R * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - R);
    ctx.quadraticCurveTo(cx + c, cy - c, cx + R, cy);
    ctx.quadraticCurveTo(cx + c, cy + c, cx, cy + R);
    ctx.quadraticCurveTo(cx - c, cy + c, cx - R, cy);
    ctx.quadraticCurveTo(cx - c, cy - c, cx, cy - R);
    ctx.closePath();
  }

  _spItemBox(ctx, P) {
    const sc = clamp(P.scale * 60, 8, 220), u = sc / 60;
    ctx.save(); ctx.translate(P.sx, P.sy - sc * 0.34);   // 当たり判定(地面)に近い位置に表示
    const bob = Math.sin(this.time * 3 + P.sx * 0.05) * 4 * u;
    ctx.translate(0, bob);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, sc * 0.55, sc * 0.5, sc * 0.16, 0, 0, TAU); ctx.fill();
    ctx.rotate(Math.sin(this.time * 2 + P.sx) * 0.25);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; this._roundRect(ctx, -sc * 0.52, -sc * 0.52, sc * 1.04, sc * 1.04, sc * 0.16); ctx.fill();
    ctx.fillStyle = this.track.theme.item; this._roundRect(ctx, -sc * 0.45, -sc * 0.45, sc * 0.9, sc * 0.9, sc * 0.14); ctx.fill();
    // 中央マーク: ？ではなく きらめき(★型スパーク)
    ctx.fillStyle = '#7a4b00'; this._drawSpark(ctx, 0, 0, sc * 0.34); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; this._drawSpark(ctx, 0, 0, sc * 0.17); ctx.fill();
    ctx.restore();
  }
  _spBanana(ctx, P) {
    const sc = clamp(P.scale * 34, 5, 130);
    ctx.save(); ctx.translate(P.sx, P.sy - sc * 0.4);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, sc * 0.5, sc * 0.6, sc * 0.18, 0, 0, TAU); ctx.fill();
    ctx.scale(sc / 16, sc / 16);
    ctx.fillStyle = '#f4d23a';
    ctx.beginPath(); ctx.arc(0, 0, 13, Math.PI * 0.15, Math.PI * 1.15); ctx.arc(2, 2, 9, Math.PI * 1.15, Math.PI * 0.15, true); ctx.fill();
    ctx.fillStyle = '#5a3d12'; ctx.fillRect(8, -12, 3, 6);
    ctx.restore();
  }
  _spProjectile(ctx, P, pj) {
    const sc = clamp(P.scale * 30, 5, 120);
    ctx.save(); ctx.translate(P.sx, P.sy - sc * 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, sc * 0.6, sc * 0.6, sc * 0.18, 0, 0, TAU); ctx.fill();
    if (pj.type === 'bomb') {
      ctx.fillStyle = '#202024'; ctx.beginPath(); ctx.arc(0, 0, sc * 0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = Math.sin(this.time * 30) > 0 ? '#fff' : '#f55';
      ctx.beginPath(); ctx.arc(sc * 0.2, -sc * 0.6, sc * 0.12, 0, TAU); ctx.fill();
    } else {
      const col = pj.type === 'red' ? '#e23b2e' : '#39c24a';
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, sc * 0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(0, -sc * 0.1, sc * 0.28, Math.PI, 0); ctx.fill();
    }
    ctx.restore();
  }
  _spExplosion(ctx, P, e) {
    const sc = clamp(P.scale * e.r * 2.2, 6, 400);
    ctx.save(); ctx.translate(P.sx, P.sy - sc * 0.3); ctx.globalAlpha = clamp(1 - e.t / 0.5, 0, 1);
    ctx.fillStyle = '#ff9b1a'; ctx.beginPath(); ctx.arc(0, 0, sc * 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe23a'; ctx.beginPath(); ctx.arc(0, 0, sc * 0.3, 0, TAU); ctx.fill();
    ctx.restore();
  }
  _spParticle(ctx, P, pa) {
    const sc = clamp(P.scale * pa.r * 2, 1, 40);
    ctx.save(); ctx.globalAlpha = clamp(1 - pa.t / pa.life, 0, 1);
    ctx.fillStyle = pa.color; ctx.beginPath(); ctx.arc(P.sx, P.sy - sc, sc, 0, TAU); ctx.fill();
    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // 16進カラーを明るく(amt>0)/暗く(amt<0)した rgb() 文字列を返す(立体シェーディング用)
  _shadeHex(hex, amt) {
    const h = hex.replace('#', '');
    const f = h.length === 3 ? (i) => parseInt(h[i] + h[i], 16) : (i) => parseInt(h.substr(i * 2, 2), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v + amt)));
    return `rgb(${c(f(0))},${c(f(1))},${c(f(2))})`;
  }

  // ---- HUD --------------------------------------------------------------
  _renderHUD(ctx, vp) {
    const k = vp.kart;
    const x0 = vp.x + 16, y0 = vp.y + 14;
    ctx.save();
    ctx.textBaseline = 'top';

    // 周回 & 順位/タイム
    const timeMode = this.mode === 'time';
    const boxW = 176, boxH = timeMode ? 80 : 64;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this._roundRect(ctx, x0, y0, boxW, boxH, 10); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
    let header = vp.label + ' ' + k.name;
    if (this.mode === 'gp' && this.gpRace) header = 'RACE ' + this.gpRace.index + '/' + this.gpRace.total;
    ctx.fillText(header, x0 + 12, y0 + 8);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('LAP ' + Math.min(k.lapCount + 1, this.def.laps) + '/' + this.def.laps, x0 + 12, y0 + 28);
    if (timeMode) {
      ctx.font = 'bold 22px monospace'; ctx.fillStyle = '#9fe8ff';
      ctx.fillText(fmtTime(this.raceTime || 0), x0 + 12, y0 + 52);
      ctx.textAlign = 'right'; ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#ffd23f';
      ctx.fillText('BEST ' + fmtTime(k.bestLap), x0 + boxW - 10, y0 + 60);
    } else {
      ctx.textAlign = 'right';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillStyle = k.place === 1 ? '#ffd23f' : '#fff';
      ctx.fillText(ordinal(k.place), x0 + boxW - 12, y0 + 16);
      ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#cfd3da';
      ctx.fillText('/ ' + this.karts.filter(c => !c.gone).length, x0 + boxW - 12, y0 + 44);   // 残っている台数
    }

    // ライフバー(プレイヤーの耐久力)。残量で緑→黄→赤、少なくなると点滅。
    {
      const lw = boxW, lx = x0, ly = y0 + boxH + 6, lh = 17;
      const r = clamp(k.life / k.maxLife, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; this._roundRect(ctx, lx, ly, lw, lh, 6); ctx.fill();
      ctx.save();
      if (r < 0.25) ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(this.time * 9));   // 危険=点滅
      ctx.fillStyle = r > 0.5 ? '#46e06a' : (r > 0.25 ? '#ffd23f' : '#ff4d3d');
      this._roundRect(ctx, lx + 2, ly + 2, Math.max(0, (lw - 4) * r), lh - 4, 4); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('LIFE', lx + 7, ly + lh / 2 + 1);
      ctx.textAlign = 'right'; ctx.fillText(String(Math.ceil(k.life)), lx + lw - 7, ly + lh / 2 + 1);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }

    // 持ちアイテム表示(各画面の上中央に大きく。取得直後は光る)。タイムアタックは非表示
    if (!timeMode) {
      const bs = 70, cx = vp.x + vp.w / 2, ixc = cx - bs / 2, iyc = vp.y + 22;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 11px sans-serif'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('アイテム', cx, iyc - 4);
      if (k.itemFlash > 0) {                         // 取得の瞬間に光る
        const a = Math.min(1, k.itemFlash / 0.6);
        ctx.save(); ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = `hsl(${(this.time * 360) % 360},90%,66%)`;
        this._roundRect(ctx, ixc - 6 * a, iyc - 6 * a, bs + 12 * a, bs + 12 * a, 14); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; this._roundRect(ctx, ixc, iyc, bs, bs, 12); ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = k.item ? '#ffd23f' : 'rgba(255,255,255,0.22)';
      this._roundRect(ctx, ixc, iyc, bs, bs, 12); ctx.stroke();
      if (k.item) {
        this._drawItemIcon(ctx, k.item, cx, iyc + bs / 2 - 7);
        ctx.fillStyle = '#ffe680'; ctx.font = 'bold 12px sans-serif'; ctx.textBaseline = 'middle';
        ctx.fillText(ITEM_LABEL[k.item] || '', cx, iyc + bs - 13);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.22)'; this._drawSpark(ctx, cx, iyc + bs / 2, bs * 0.22); ctx.fill();
      }
    }

    // スピードメーター(km/h ＋ ギア ＋ 変速モード)。タッチ操作時は親指を避けて下中央へ。
    const touchSolo = this.touch && this.numHumans === 1;
    const mw = 168;
    const mx = touchSolo ? (vp.x + vp.w / 2 - mw / 2) : (vp.x + 16);
    const my = vp.y + vp.h - (touchSolo ? 60 : 86);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; this._roundRect(ctx, mx, my, mw, 52, 10); ctx.fill();
    const kmh = Math.round(Math.abs(k.speed) * KMH_PER_PX);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = k.boostTimer > 0 ? '#ff8c1a' : '#ffffff';
    ctx.font = 'bold 34px sans-serif'; ctx.fillText(String(kmh), mx + 12, my + 38);
    ctx.fillStyle = '#9fb0c0'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('km/h', mx + 12 + ctx.measureText(String(kmh)).width + 6, my + 38);
    // ギア
    const gearLabel = (Math.abs(k.speed) < 10 && k.control && k.control.throttle <= 0) ? 'N' : (k.speed < -10 ? 'R' : String(k.gear));
    ctx.textAlign = 'right';
    ctx.fillStyle = '#5ef2ff'; ctx.font = 'bold 30px sans-serif'; ctx.fillText(gearLabel, mx + mw - 14, my + 36);
    ctx.fillStyle = '#9fb0c0'; ctx.font = 'bold 11px sans-serif';
    const tl = k.trans === 'manual' ? 'MT' : (k.trans === 'semi' ? 'セミAT' : 'AT');
    ctx.fillText(tl, mx + mw - 14, my + 48);

    // 速度バー(下部)。タッチ時は親指エリアと重なるので非表示。
    if (!touchSolo) {
      const bw = 130, bx = vp.x + 16, by = vp.y + vp.h - 26;
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; this._roundRect(ctx, bx, by, bw, 12, 6); ctx.fill();
      const ratio = clamp(Math.abs(k.speed) / (k.baseMax + 280), 0, 1);
      ctx.fillStyle = k.boostTimer > 0 ? '#ff8c1a' : '#5ef2ff';
      this._roundRect(ctx, bx, by, bw * ratio, 12, 6); ctx.fill();
    }

    // スピン/無敵/スロー表示
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (k.invincTimer > 0) {
      ctx.fillStyle = `hsl(${(this.time * 480) % 360},90%,60%)`;
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('★ むてき！ ★', vp.x + vp.w / 2, vp.y + 28);
    }
    if (k.dashTimer > 0) {
      ctx.fillStyle = '#5ef2ff'; ctx.font = 'bold 18px sans-serif';
      ctx.fillText('🪝 グラップル・ダッシュ！', vp.x + vp.w / 2, vp.y + 52);
    }
    ctx.restore();

    // 周回完了バナー(ラップタイム＋残り周回)。完了の瞬間にポップして数秒で消える。
    if (k._lapMsg && this.time < k._lapMsgUntil) {
      const DUR = 2.8, age = DUR - (k._lapMsgUntil - this.time);
      const alpha = Math.min(1, age / 0.22, (k._lapMsgUntil - this.time) / 0.5);   // 出はスケールイン/終わりはフェード
      const pop = 0.8 + 0.2 * Math.min(1, age / 0.3);
      const s = clamp(Math.min(vp.w, vp.h * 1.4) / 640, 0.55, 1.3);
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(vp.x + vp.w / 2, vp.y + vp.h * 0.30);
      ctx.scale(pop * s, pop * s);
      ctx.textAlign = 'center';
      const accent = k._lapMsg.best ? '#ffd23f' : '#5ef2ff';
      const pw = 380, ph = 124;
      ctx.fillStyle = 'rgba(8,10,24,0.82)'; this._roundRect(ctx, -pw / 2, -ph / 2, pw, ph, 16); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = accent; this._roundRect(ctx, -pw / 2, -ph / 2, pw, ph, 16); ctx.stroke();
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#fff'; ctx.font = 'bold 30px sans-serif'; ctx.letterSpacing = '2px';
      ctx.fillText('LAP ' + k._lapMsg.lapNum + ' COMPLETE', 0, -26);
      ctx.fillStyle = accent; ctx.font = 'bold 36px monospace';
      ctx.fillText(fmtTime(k._lapMsg.time) + (k._lapMsg.best ? '  BEST!' : ''), 0, 14);
      const remain = k._lapMsg.lapsLeft === 1 ? 'FINAL LAP!' : k._lapMsg.lapsLeft + ' LAPS TO GO';
      ctx.fillStyle = k._lapMsg.lapsLeft === 1 ? '#ff7a4d' : '#ffe08a'; ctx.font = 'bold 24px sans-serif';
      ctx.fillText(remain, 0, 46);
      ctx.letterSpacing = '0px';
      ctx.restore();
    }

    this._renderMinimap(ctx, vp, k);
  }

  // ミニマップ(コース全体と全カートの位置。後ろの相手も把握できる)
  _renderMinimap(ctx, vp, k) {
    const T = this.track, b = T.bounds;
    const bw = b.maxX - b.minX, bh = b.maxY - b.minY;
    const mw = Math.min(150, vp.w * 0.16);
    const mh = mw * (bh / bw);
    const mx = vp.x + vp.w - mw - 14, my = vp.y + 86;     // 右上(順位/アイテム枠の下)
    const sx = (x) => mx + ((x - b.minX) / bw) * mw;
    const sy = (y) => my + ((y - b.minY) / bh) * mh;
    ctx.save();
    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    this._roundRect(ctx, mx - 8, my - 8, mw + 16, mh + 16, 8); ctx.fill();
    // コース
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(3, mw * 0.07); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (T.islands) {                              // 島方式: 島の区間だけ描く(間は空白)
      for (const [a, b] of T.islands) {
        ctx.beginPath(); ctx.moveTo(sx(T.path[a * T.pathSeg].x), sy(T.path[a * T.pathSeg].y));
        for (let i = a * T.pathSeg + 1; i <= b * T.pathSeg; i++) ctx.lineTo(sx(T.path[i % T.path.length].x), sy(T.path[i % T.path.length].y));
        ctx.stroke();
      }
    } else {
      ctx.beginPath(); ctx.moveTo(sx(T.path[0].x), sy(T.path[0].y));
      for (let i = 1; i < T.path.length; i++) ctx.lineTo(sx(T.path[i].x), sy(T.path[i].y));
      ctx.closePath(); ctx.stroke();
    }
    // 分岐路(あれば): 本線とは別色で「もう一つのルート」として描く
    if (T.branchPaths && T.branchPaths.length) {
      ctx.strokeStyle = T.theme.accent || '#ff5ec4';
      ctx.lineWidth = Math.max(2.5, mw * 0.055);
      for (const bp of T.branchPaths) {
        ctx.beginPath(); ctx.moveTo(sx(bp[0].x), sy(bp[0].y));
        for (let i = 1; i < bp.length; i++) ctx.lineTo(sx(bp[i].x), sy(bp[i].y));
        ctx.stroke();
      }
    }
    // ワープ(あれば): 入口(マゼンタ)→出口(シアン)を点線リンク＋丸で表示
    if (T.warps && T.warps.length) {
      for (const w of T.warps) {
        ctx.setLineDash([mw * 0.07, mw * 0.07]);
        ctx.strokeStyle = 'rgba(150,220,255,0.75)'; ctx.lineWidth = Math.max(1.5, mw * 0.03);
        ctx.beginPath(); ctx.moveTo(sx(w.ex), sy(w.ey)); ctx.lineTo(sx(w.tx), sy(w.ty)); ctx.stroke();
        ctx.setLineDash([]);
        const dot = Math.max(2.5, mw * 0.05);
        ctx.fillStyle = '#ff4dd2'; ctx.beginPath(); ctx.arc(sx(w.ex), sy(w.ey), dot, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7df0ff'; ctx.beginPath(); ctx.arc(sx(w.tx), sy(w.ty), dot, 0, TAU); ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';   // 以降の描画用に本線色へ戻す
    // スタートライン
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx(T.path[0].x), sy(T.path[0].y), Math.max(2.5, mw * 0.04), 0, TAU); ctx.fill();
    // カート(自分は白縁の大きめドット、相手は色ドット)
    for (const o of this.karts) {
      if (o === k || o.gone) continue;       // 爆発/リタイヤはミニマップから消す
      ctx.fillStyle = o.def.body;
      ctx.beginPath(); ctx.arc(sx(o.x), sy(o.y), Math.max(3, mw * 0.045), 0, TAU); ctx.fill();
    }
    ctx.fillStyle = k.def.body;
    ctx.beginPath(); ctx.arc(sx(k.x), sy(k.y), Math.max(4, mw * 0.06), 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  _drawItemIcon(ctx, type, cx, cy) {
    ctx.save(); ctx.translate(cx, cy);
    switch (type) {
      case 'mushroom':
        ctx.fillStyle = '#e8412e'; ctx.beginPath(); ctx.arc(0, -2, 15, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-6, -6, 3, 0, TAU); ctx.arc(6, -4, 3, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f0e6d0'; ctx.fillRect(-7, -2, 14, 12); break;
      case 'banana':
        ctx.fillStyle = '#f4d23a'; ctx.beginPath(); ctx.arc(0, 0, 14, Math.PI * 0.15, Math.PI * 1.15); ctx.arc(2, 2, 9, Math.PI * 1.15, Math.PI * 0.15, true); ctx.fill(); break;
      case 'green': case 'red':
        ctx.fillStyle = type === 'red' ? '#e23b2e' : '#39c24a'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(0, -2, 8, Math.PI, 0); ctx.fill(); break;
      case 'star': {
        ctx.fillStyle = '#ffd23f'; ctx.beginPath();
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const r = i % 2 ? 6 : 15; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill(); break;
      }
      case 'bomb':
        ctx.fillStyle = '#202024'; ctx.beginPath(); ctx.arc(0, 2, 13, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#fa3'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, -10); ctx.lineTo(8, -16); ctx.stroke(); break;
      case 'grapple':
        // ロックオン照準
        ctx.strokeStyle = '#5ef2ff'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-16, 0); ctx.lineTo(-8, 0); ctx.moveTo(16, 0); ctx.lineTo(8, 0);
        ctx.moveTo(0, -16); ctx.lineTo(0, -8); ctx.moveTo(0, 16); ctx.lineTo(0, 8); ctx.stroke();
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.fill(); break;
    }
    ctx.restore();
  }

  _renderCenterText(ctx) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (this.state === 'countdown') {
      const n = Math.ceil(this.countdown);
      const frac = this.countdown - Math.floor(this.countdown);
      const scale = 1 + (1 - frac) * 0.6;
      ctx.save();
      ctx.translate(this.W / 2, this.H / 2);
      ctx.scale(scale, scale);
      ctx.fillStyle = n <= 0 ? '#37e23a' : '#fff';
      ctx.strokeStyle = '#111'; ctx.lineWidth = 6;
      ctx.font = 'bold 120px sans-serif';
      const txt = n >= 1 ? String(n) : 'GO!';
      ctx.strokeText(txt, 0, 0); ctx.fillText(txt, 0, 0);
      ctx.restore();
    }

    // 操作ヒント(発進直後にフェード表示)
    if ((this.state === 'racing' && this.hintTimer > 0) || this.state === 'countdown') {
      const al = this.state === 'countdown' ? 0.95 : clamp(this.hintTimer / 1.2, 0, 0.95);
      ctx.globalAlpha = al;
      ctx.font = 'bold 20px sans-serif';
      const msg = this.touch
        ? '画面のボタンで操作 ◀▶＝ハンドル ／ アクセル・ブレーキ・アイテム'
        : (this.numHumans === 2
          ? '1P: W=アクセル A/D=ハンドル ／ 2P: ↑=アクセル ←/→=ハンドル'
          : 'W=アクセル（押しっぱなし）　A/D=ハンドル　左Shift=ドリフト　Space=アイテム');
      const w = ctx.measureText(msg).width + 36;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      this._roundRect(ctx, this.W / 2 - w / 2, this.H - 92, w, 34, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(msg, this.W / 2, this.H - 74);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

if (typeof window !== 'undefined') window.Game = Game;
