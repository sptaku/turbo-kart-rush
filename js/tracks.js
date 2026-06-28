/* =========================================================================
 * tracks.js  ―  コースデータ(中心線ポリライン方式 / 大コース)
 *   waypoints は数式(楕円)で自動生成し、必要に応じて一部を凹ませてS字等を作る。
 *   roadHalf : 走路の半分の幅(タイル)  shoulder : 芝生(オフロード)の幅。外はレール。
 *   道幅は広く・1周は長く。設置物は中心線(走行ライン)上に置く。
 * =======================================================================*/
const _r1 = (v) => Math.round(v * 10) / 10;

// 楕円の周回ウェイポイント(t=0 が下、i増加で右回り=スタートで+x方向)
function ovalPts(cx, cy, ax, ay, n) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    p.push([_r1(cx + ax * Math.sin(t)), _r1(cy + ay * Math.cos(t))]);
  }
  return p;
}
// 指定indexを中心方向(または外側)へ動かしてS字/コーナーを作る
function dent(pts, cx, cy, idx, amt) {
  const [x, y] = pts[idx];
  const dx = cx - x, dy = cy - y, d = Math.hypot(dx, dy) || 1;
  pts[idx] = [_r1(x + (dx / d) * amt), _r1(y + (dy / d) * amt)];
  return pts;
}
// ウェイポイントの一部を設置点として取り出す
const pick = (pts, idxs) => idxs.map((i) => pts[i]);
// 指定indexの位置に、走路の横方向(接線に直交)へ複数の？ブロックを横並びに置く
// (どんな形状のコースでも、どのラインでも先端が触れるように)
function itemRow(pts, idxs, offs) {
  const out = [], n = pts.length;
  for (const i of idxs) {
    const a = pts[(i - 1 + n) % n], c = pts[(i + 1) % n];
    let dx = c[0] - a[0], dy = c[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const px = -dy, py = dx;                 // 接線に直交 = 走路の横方向
    for (const o of offs) out.push([_r1(pts[i][0] + px * o), _r1(pts[i][1] + py * o)]);
  }
  return out;
}

// ---- Track1: サンシャイン(かんたん) -------------------------------------
//   超かんたん(真円オーバル)との差別化のため、ゆるやかなスイープと軽いS字を持つ
//   流れるコース。道幅は広め・コーナーはどれも穏やかで難しくはない。
const T1 = [
  [55, 66], [78, 64], [95, 56],          // 0-2 下→右へのスイープ
  [99, 42], [92, 32], [97, 22],          // 3-5 右側の軽いS字(ゆるやか)
  [86, 12], [64, 9],                     // 6-7 上ストレート
  [48, 14], [40, 9],                     // 8-9 上部の軽いうねり
  [24, 14], [12, 30],                    // 10-11 左上→左へ
  [14, 50], [32, 63],                    // 12-13 左下スイープ→スタートへ
];

// ---- Track2: デューン(流れるサーキット。右にS字シケイン＋上部にヘアピン) --
// 下ストレート→右スイープ→右上シケイン→上ストレート→上部ヘアピン(突き出し)
// →左ダウンヒル→スタートへ。 (grid 126x88)
const T2 = [
  [36, 78], [66, 81], [94, 77],          // 下ストレート(左→右)
  [112, 66], [116, 50],                  // 右スイープアップ
  [104, 41], [114, 31],                  // 右上シケイン(S字)
  [100, 19], [80, 15],                   // 上ストレートへ
  [63, 17], [54, 7], [43, 9], [41, 21],  // 上部ヘアピン(上へ突き出して折り返す)
  [49, 31], [33, 33],                    // 折り返して左へ
  [15, 47], [18, 67], [27, 75],          // 左ダウンヒル→スタートへ
];

// ---- Track3: ネオン(高速フローイング。2か所のシケイン＋うねる流れ＋
//      上部の折り返しフック・むずかしい) (grid 106x78)
const T3 = [
  [28, 66], [48, 71], [62, 62], [82, 68], // 下ストレート＋シケイン
  [98, 57], [101, 43],                    // 右スイープ上り
  [88, 35], [99, 25],                     // 右シケイン(S字)
  [86, 13], [64, 11], [46, 15],           // 上ストレート(右→左)
  [38, 27], [49, 34],                     // 上部フック(折り返し)
  [33, 40], [16, 36], [11, 50],           // 中左のうねり
  [15, 60], [22, 65],                     // 左下り→スタート
];

// ---- Track4: マグマ・ガントレット(激ムズ) ------------------------------
//   大きな楕円ベースに6か所の鋭いピンチ(シケイン/ヘアピン気味)を刻んだテクニカル周回。
//   道幅は最狭・路肩も薄く、各コーナーの出入口にオイル(マグマ)スリックを配置。 (grid 120x104)
// 楕円ではなく手組みの“入り組んだ”テクニカルコース。
// 右の連続シケイン(エセス)→上の weave →突き出し→左ヘアピン→中央S→左の入り江、と変化が連続。
const T4 = [
  [40, 100], [68, 104], [94, 100],       // 0-2 下ストレート
  [116, 90], [122, 74],                  // 3-4 右スイープ上り
  [108, 66], [120, 56],                  // 5-6 右シケインA
  [110, 44], [122, 34],                  // 7-8 右シケインB(エセス)
  [112, 18], [92, 14],                   // 9-10 右上スイープ
  [80, 26], [68, 16],                    // 11-12 weave
  [56, 28], [46, 14],                    // 13-14 上部の突き出し
  [34, 22], [33, 40],                    // 15-16 左ヘアピン(折り返し下り)
  [46, 48], [32, 58],                    // 17-18 中央S
  [40, 74], [24, 82],                    // 19-20 下左S
  [16, 98], [30, 108],                   // 21-22 左の入り江
];

// ---- Track0: グリーン・メドウ(超かんたん) ------------------------------
//   大きくてなめらかな広い楕円。道幅は最大・路肩も広く・障害物なし。初心者向け。
const T0 = ovalPts(60, 42, 48, 31, 12);

// ---- Track5: ヴォイド・スパイラル(超激ムズ) ----------------------------
//   全コース中いちばん入り組んだ蛇行サーキット。最狭の道＋薄い路肩＋氷で滑る。
//   連続シケイン→右エセス→上部の深い切れ込み→左スイッチバック→入り江、と息つく暇なし。
const T5 = [
  [36, 108], [60, 114], [84, 110],       // 0-2 下ストレート
  [104, 118], [120, 108],                // 3-4 右下フック
  [112, 96], [126, 88],                  // 5-6 シケイン
  [114, 76], [128, 66],                  // 7-8 右エセス
  [116, 52], [128, 42],                  // 9-10 右エセス
  [118, 28], [100, 22],                  // 11-12 右上スイープ
  [92, 36], [80, 24],                    // 13-14 weave
  [68, 34], [60, 18],                    // 15-16 上の突き出し
  [46, 26], [40, 44],                    // 17-18 左ヘアピン
  [54, 52], [38, 62],                    // 19-20 中央S
  [50, 74], [34, 82],                    // 21-22 下のS
  [44, 96], [24, 100],                   // 23-24 左の入り江
  [18, 114], [30, 118],                  // 25-26 左下リターン
];

// ---- Track6: スカイ・ハイ・ループ(超超激ムズ・天空の立体コース) ----------
//   明るい大空＋雲海(オフロード)に浮かぶ細い光の道。全コース最多のジャンプ台で
//   始終ふわりと宙に舞う“立体的”な走り。最狭の道＋氷＋深いW字＝適切に飛ばないと
//   滑り落ちる最難関。形状は連続セレクション＋上部の深いW＋左右エセスで超複雑。
const T6 = [
  [28, 112], [58, 114], [92, 114], [120, 110],   // 0-3 下ストレート(ジャンプ台を連ねる)
  [138, 94], [140, 74],                          // 4-5 右スイープ上り
  [126, 60], [140, 46],                          // 6-7 右エセス
  [132, 30], [110, 24],                          // 8-9 右上スイープ
  [90, 32], [70, 22], [52, 30],                  // 10-12 上部の流れるシケイン(W)
  [34, 26], [24, 44],                            // 13-14 左上スイープ
  [38, 60], [24, 78],                            // 15-16 左エセス
  [34, 96], [24, 110],                           // 17-18 左下リターン
];

// 超超激ムズ専用ギミック(他コースには無い): 下ストレート上で「橋が大きく途切れている」区間。
//   x=76.5 にジャンプ台を“走路+路肩いっぱい”に横一列(端を通っても必ず踏む)、
//   その先 x≈76.9〜81.9 が広いコース欠損(奈落)。穴の手前のジャンプ台は強力に飛ばすので
//   速度を保てば飛び越えられる/飛べなければ奈落に落ちて手前に戻される。
const SKY_GAP_X = 76.5, SKY_GAP_Y = 114;
const FULLW = [-3.6, -3.0, -2.4, -1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.6];  // 道幅いっぱいの横列
const skyRampRow = FULLW.map((o) => [SKY_GAP_X, SKY_GAP_Y + o]);                       // 端も塞ぐジャンプ台列
const skyGap = [];
for (const gx of [77.6, 78.8, 80.0, 81.2]) for (const oy of [-3.3, -2.2, -1.1, 0, 1.1, 2.2, 3.3]) skyGap.push([gx, SKY_GAP_Y + oy]);  // 広い帯状の奈落

// ---- Track7: オーロラ・スプリット(超超超激ムズ・分岐あり) ------------------
//   本線(外回り)＝遠回りだが安全。分岐(内回りショートカット)＝近道だが途中に広い奈落ジャンプ。
//   どちらを通るか選べる“分岐”が他コースに無い目玉。最狭の道＋氷＋上部シケインで最高難度。
const T7 = [
  [30, 118], [60, 120], [92, 118],   // 0-2 下ストレート
  [114, 114],                        // 3 分岐点(内回り/外回りに分かれる)
  [136, 104], [142, 84], [134, 64],  // 4-6 本線=外回りの大きなスイープ(安全だが遠回り)
  [128, 50],                         // 7 合流点
  [134, 36], [114, 28],              // 8-9 右上(なめらか)
  [94, 34], [74, 26], [54, 34], [40, 30],  // 10-13 上部のゆるいシケイン
  [28, 50],                          // 14 左上(なめらか)
  [36, 68], [24, 86], [36, 102], [24, 114], // 15-18 左の緩いエセス→スタートへ
];
// 分岐路(内回りショートカット): 3→7 を内側で直線的に結ぶが、縦直線の途中に広い奈落ジャンプ。
const T7_BRANCH = [[114, 114], [116, 98], [114, 78], [118, 60], [128, 50]];
const T7_BX = 115, T7_BY = 86;
const t7RampRow = FULLW.map((o) => [T7_BX + o, T7_BY]);   // 分岐路の幅いっぱいのジャンプ台列
const t7Gap = [];
for (const gy of [84, 83, 82, 81]) for (const ox of [-3.3, -2.2, -1.1, 0, 1.1, 2.2, 3.3]) t7Gap.push([T7_BX + ox, gy]);  // 分岐路の広い奈落

// ---- Track8: テンペスト・ゲイル(超超超超激ムズ・新ギミック=突風) ------------
//   嵐のサーキット。直線に“突風(横風)ゾーン”があり、乗ると外側へ流される=逆らって操作が必要。
//   さらに下直線に奈落ジャンプ＋氷＋最狭級の道で最高難度。
const T8 = [
  [50, 118], [78, 117], [88, 116], [116, 110],  // 0-3 0=スタート(下ストレート上・コーナーの先)、中ほどに奈落
  [138, 96], [140, 74],                         // 4-5 右スイープ
  [140, 54], [140, 36],                         // 6-7 右ストレート(縦)=突風ゾーン(右へ)
  [122, 26], [100, 30], [80, 22], [60, 30], [42, 24],  // 8-12 上部シケイン
  [26, 44],                                     // 13 左上
  [24, 66], [24, 90],                           // 14-15 左ストレート(縦)=突風ゾーン(左へ)
  [28, 116],                                    // 16 左下コーナー(スタート手前の曲がり)
];
const T8_GAPX = 68, T8_GAPY = 117;
const t8RampRow = FULLW.map((o) => [T8_GAPX, T8_GAPY + o]);   // 下直線の幅いっぱいのジャンプ台列
const t8Gap = [];
for (const gx of [69.2, 70.4, 71.6, 72.8]) for (const oy of [-3.3, -2.2, -1.1, 0, 1.1, 2.2, 3.3]) t8Gap.push([gx, T8_GAPY + oy]);

// ---- Track9: ワープ・ラビリンス(超超超超超激ムズ・新ギミック=ワープ＋複数分岐) ----
//   宇宙の迷宮。本線に加えて2本の分岐があり、片方は「ワープゲート(瞬間移動)」で
//   右側を丸ごとショートカット、もう片方は上部を内側に抜けるタイトな近道。
//   CPUは本線(外回り)を走るので、プレイヤーは分岐＆ワープを使いこなせば一気に逆転。
const T9 = [
  [52, 122], [84, 121],              // 0-1 下ストレート(0=スタート)
  [112, 116],                        // 2 分岐1の分かれ目(内側へ=ワープへ)
  [136, 104], [147, 82], [147, 56], [140, 36],  // 3-6 右の大きなスイープ(本線・なめらか)
  [122, 28], [102, 28],              // 7-8 上ストレート(ワープ出口の近く)
  [84, 34],                          // 9 分岐2の分かれ目
  [64, 26], [44, 32],                // 10-11 上部シケイン(本線)
  [28, 28],                          // 12 分岐2の合流点
  [19, 54], [20, 82], [26, 106],     // 13-15 左の大きなスイープ
  [24, 120], [34, 123],              // 16-17 左下→コーナー(スタート手前)
];
// 分岐1: 本線(wp2)から内側へ入る行き止まりのスパー。先端にワープゲート。
const T9_BRANCH1 = [[112, 116], [98, 110], [88, 98]];
// 分岐2: 上部シケインを内側で抜けるタイトな近道(wp9→wp12)。
const T9_BRANCH2 = [[84, 34], [74, 46], [54, 44], [40, 38], [28, 28]];

// ---- Track10: ワープ・ネクサス(超超超超超超激ムズ・島が点在しワープで大横断) ----
//   走路は宇宙に浮かぶ5つの「島」だけ。島と島の間は空白(=ワープでしか渡れない)。
//   ワープはマップを大きくクロスして「一気に飛ぶ」。島には急カーブも仕込む。
const WOFF = [-3.2, -2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4, 3.2];   // ゲートの全幅横列
// 各島=[x,y]の並び。走行順は A→C→E→B→D(=対角へ飛ぶ五芒星状)。
const T10_ISL = [
  [[134, 55], [145, 66], [131, 76], [142, 90]],  // A 右(S字・急カーブ)
  [[48, 104], [34, 100], [42, 89], [27, 82]],    // C 左下(ジグザグ・急カーブ)
  [[82, 21], [98, 23], [112, 28]],               // E 上(ゆるい)
  [[114, 112], [101, 124], [86, 116]],           // B 右下(V字・急カーブ)
  [[26, 52], [33, 41], [45, 36]],                // D 左(ゆるい弧)
];
const T10 = T10_ISL.flat();
let _t10i = 0;
const T10_ISLANDS = T10_ISL.map((a) => { const r = [_t10i, _t10i + a.length - 1]; _t10i += a.length; return r; });
// ワープゲート: 各島の終端に全幅ゲート→次の島の先頭へ。
const T10_WARPS = (() => {
  const w = [];
  for (let k = 0; k < T10_ISL.length; k++) {
    const isl = T10_ISL[k], nx = T10_ISL[(k + 1) % T10_ISL.length];
    const last = isl[isl.length - 1], prev = isl[isl.length - 2];
    let dx = last[0] - prev[0], dy = last[1] - prev[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const px = -dy, py = dx;
    // 出口は次の島の「2点目」=島の内側(空白チョードの端ではなく、確実に走路の上)へ
    const ex2 = _r1((nx[0][0] + nx[1][0]) / 2), ey2 = _r1((nx[0][1] + nx[1][1]) / 2);
    for (const o of WOFF) w.push({ ex: _r1(last[0] + px * o), ey: _r1(last[1] + py * o), tx: ex2, ty: ey2 });
  }
  return w;
})();

const TRACKS = [
  {
    id: 'meadow',
    name: 'グリーン・メドウ',
    subtitle: 'Green Meadow',
    difficulty: '超かんたん',
    laps: 3,
    tile: 80,
    cols: 122, rows: 86,
    roadHalf: 4.7, shoulder: 1.5,                 // 最大の道幅＋広い路肩で超やさしい
    music: 'race1',
    hazardType: 'none',
    theme: {
      sky: '#8fd0f5', skyDk: '#5aa6e0',
      grass: '#62c93f', grassDk: '#3f9a26',
      road: '#a3a9b1', roadDk: '#848a93', line: '#ffffff',
      wall: '#ffd23f', wallTop: '#fff0a8',
      curb1: '#ffffff', curb2: '#6cc24a',
      boost: '#ffd23f', item: '#ffe680', hazard: '#3a3a44',
      accent: '#ffd23f',
    },
    waypoints: T0,
    items: itemRow(T0, [2, 6, 10], [-3.4, -1.7, 0, 1.7, 3.4]),   // 広い道を横断するように多めに配置
    boosts: pick(T0, [4, 9]),
    hazards: [],
    recover: pick(T0, [1, 7]),                   // ライフ回復ピット
    ramps: pick(T0, [1, 7]),
  },

  {
    id: 'sunshine',
    name: 'サンシャイン・スピードウェイ',
    subtitle: 'Sunshine Speedway',
    difficulty: 'かんたん',
    laps: 3,
    tile: 80,
    cols: 110, rows: 74,
    roadHalf: 3.9, shoulder: 1.1,
    music: 'race1',
    hazardType: 'none',
    theme: {
      sky: '#7cc1f0', skyDk: '#4f93cf',
      grass: '#5cbb3b', grassDk: '#3c8f24',
      road: '#9aa0a8', roadDk: '#7c828b', line: '#ffffff',
      wall: '#e7473c', wallTop: '#ff7a6e',
      curb1: '#e7473c', curb2: '#f7f4ef',
      boost: '#ffd23f', item: '#ffe680', hazard: '#3a3a44',
      accent: '#ffd23f',
    },
    waypoints: T1,
    items: itemRow(T1, [1, 4, 7, 10, 12], [-1.7, 0, 1.7]),
    boosts: pick(T1, [2, 9]),
    hazards: [],
    recover: pick(T1, [7, 12]),                  // ライフ回復ピット
    ramps: pick(T1, [6, 13]),
  },

  {
    id: 'dunes',
    name: 'デューン・チェイス',
    subtitle: 'Dune Chase',
    difficulty: 'ふつう',
    laps: 3,
    tile: 80,
    cols: 126, rows: 88,
    roadHalf: 3.6, shoulder: 1.0,
    music: 'race2',
    hazardType: 'oil',
    theme: {
      sky: '#f6c177', skyDk: '#e08a4a',
      grass: '#d9a566', grassDk: '#b07f44',
      road: '#8b8178', roadDk: '#6e655d', line: '#fdf2d8',
      wall: '#7a4a26', wallTop: '#a06a38',
      curb1: '#c0392b', curb2: '#f0e3c0',
      boost: '#ff8c1a', item: '#ffd9a0', hazard: '#26242a',
      accent: '#ef8354',
    },
    waypoints: T2,
    items: itemRow(T2, [1, 4, 8, 16], [-1.7, 0, 1.7]),
    boosts: pick(T2, [3, 14]),
    hazards: pick(T2, [5, 12, 17]),
    recover: pick(T2, [2, 10]),                  // ライフ回復ピット
    ramps: pick(T2, [2, 9]),
  },

  {
    id: 'neon',
    name: 'ネオン・サーキット',
    subtitle: 'Neon Circuit',
    difficulty: 'むずかしい',
    laps: 3,
    tile: 80,
    cols: 116, rows: 90,
    roadHalf: 3.2, shoulder: 0.9,
    music: 'race3',
    hazardType: 'ice',
    theme: {
      sky: '#0a0a1e', skyDk: '#05050f',
      grass: '#141436', grassDk: '#0c0c22',
      road: '#26284e', roadDk: '#191a36', line: '#5ef2ff',
      wall: '#ff2bd6', wallTop: '#ff79e6',
      curb1: '#5ef2ff', curb2: '#ff2bd6',
      boost: '#5ef2ff', item: '#b58cff', hazard: '#9fe8ff',
      accent: '#5ef2ff',
    },
    waypoints: T3,
    items: itemRow(T3, [1, 4, 9, 16], [-1.4, 0, 1.4]),
    boosts: pick(T3, [3, 14]),
    hazards: pick(T3, [2, 6, 8, 11, 12, 15]),   // 氷を多めに(スリッピーで難しく)
    recover: pick(T3, [5, 17]),                  // ライフ回復ピット
    ramps: pick(T3, [7, 13]),
  },

  {
    id: 'magma',
    name: 'マグマ・ガントレット',
    subtitle: 'Magma Gauntlet',
    difficulty: '激ムズ',
    laps: 3,
    tile: 80,
    cols: 138, rows: 122,
    roadHalf: 2.85, shoulder: 0.7,               // 入り組んだ形状＋全コース最狭の道＋オイルで激ムズ
    music: 'race3',
    hazardType: 'oil',                           // マグマのスリック(乗るとスピン)
    theme: {
      sky: '#2a0d12', skyDk: '#120406',
      grass: '#3a1410', grassDk: '#220a07',      // 焦げた大地
      road: '#3b3338', roadDk: '#2a2226', line: '#ff7a1a',
      wall: '#ff3b1a', wallTop: '#ffae3a',
      curb1: '#ff3b1a', curb2: '#ffd23f',
      boost: '#ff5a1a', item: '#ffcf6a', hazard: '#ff8a2a',
      accent: '#ff5a1a',
    },
    waypoints: T4,
    items: itemRow(T4, [1, 10, 19], [-1.1, 0, 1.1]),
    boosts: pick(T4, [3, 20]),
    hazards: pick(T4, [4, 6, 8, 11, 13, 16, 18, 21]),  // 各コーナーにオイル多数(スピン地獄)
    recover: pick(T4, [2, 20]),                  // ライフ回復ピット
    ramps: pick(T4, [2, 14]),
  },

  {
    id: 'void',
    name: 'ヴォイド・スパイラル',
    subtitle: 'Void Spiral',
    difficulty: '超激ムズ',
    laps: 3,
    tile: 80,
    cols: 144, rows: 130,
    roadHalf: 2.7, shoulder: 0.6,                // 最狭・最薄路肩＋氷で全コース最難
    music: 'race3',
    hazardType: 'ice',                           // 氷(乗ると滑ってコントロール困難)
    theme: {
      sky: '#0b0820', skyDk: '#05030f',
      grass: '#171433', grassDk: '#0d0b20',      // 虚空
      road: '#2b2c44', roadDk: '#1c1d31', line: '#a9b6ff',
      wall: '#8a5cff', wallTop: '#c4a8ff',
      curb1: '#8a5cff', curb2: '#cfe0ff',
      boost: '#7df0ff', item: '#c4a8ff', hazard: '#bfe6ff',
      accent: '#8a5cff',
    },
    waypoints: T5,
    items: itemRow(T5, [1, 11, 21], [-1.0, 0, 1.0]),
    boosts: pick(T5, [3, 22]),
    hazards: pick(T5, [5, 7, 9, 12, 14, 17, 19, 23, 25]),  // 氷を随所に(滑走地獄)
    recover: pick(T5, [2, 13]),                  // ライフ回復ピット
    ramps: pick(T5, [2, 15]),
  },

  {
    id: 'sky',
    name: 'スカイ・ハイ・ループ',
    subtitle: 'Skyhigh Loop',
    difficulty: '超超激ムズ',
    laps: 3,
    tile: 80,
    cols: 147, rows: 120,
    roadHalf: 3.0, shoulder: 0.8,                // 細めの天空路(雲海の縁)。ジャンプ台は直線に配置
    music: 'race3',
    hazardType: 'ice',                           // 凍った天空路(滑ってコース外=落下)
    theme: {
      sky: '#aee9ff', skyDk: '#5fb8f5',          // 抜けるような明るい大空
      grass: '#e6f5ff', grassDk: '#c4e7ff',      // 雲海(オフロード=雲の縁＝落ちそうな見た目)
      road: '#3a2f70', roadDk: '#271f4f', line: '#ffffff',   // 紫に光る空中の道
      wall: '#ff5ec4', wallTop: '#ffcfe9',       // ピンクに光る柵
      curb1: '#ff3b6b', curb2: '#5ef2ff',        // 赤×シアンの縞
      boost: '#ffe24d', item: '#b58cff', hazard: '#cfeeff',  // 氷
      accent: '#ff5ec4',
    },
    waypoints: T6,
    items: itemRow(T6, [5, 9, 12, 18], [-0.85, 0, 0.85]),
    boosts: pick(T6, [3, 13]),
    hazards: pick(T6, [6, 11, 15]),              // 右エセス・シケインの頂・左エセスに氷(滑ると滑落)
    recover: pick(T6, [4, 14]),                  // ライフ回復ピット
    ramps: pick(T6, [1, 8, 17]).concat(skyRampRow),  // 全コース最多のジャンプ台＋橋切れ手前の横一列
    gaps: skyGap,                                // ★他コースに無い「コースが途切れた」ジャンプ区間
  },

  {
    id: 'aurora',
    name: 'オーロラ・スプリット',
    subtitle: 'Aurora Split',
    difficulty: '超超超激ムズ',
    laps: 3,
    tile: 80,
    cols: 149, rows: 128,
    roadHalf: 2.8, shoulder: 0.7,                // 最狭級。さらに分岐＋奈落で最高難度
    music: 'race3',
    hazardType: 'ice',
    theme: {
      sky: '#0d2233', skyDk: '#040f1a',          // 夜空(オーロラ)
      grass: '#10243a', grassDk: '#081626',      // 暗い高原
      road: '#1b3040', roadDk: '#11212c', line: '#7dffd0',   // 緑に光る道
      wall: '#39ff9e', wallTop: '#b6ffe0',       // オーロラグリーンの柵
      curb1: '#39ff9e', curb2: '#b06bff',        // 緑×紫
      boost: '#7dffd0', item: '#b06bff', hazard: '#bfe8ff',  // 氷
      accent: '#39ff9e',
    },
    waypoints: T7,
    branches: [T7_BRANCH],                       // ★本線から分かれて再合流する「分岐路」
    items: itemRow(T7, [1, 9, 13, 17], [-0.8, 0, 0.8]),
    boosts: pick(T7, [2, 8]),
    hazards: pick(T7, [5, 11, 16]),              // 外回り・上部シケイン・左エセスに氷
    recover: pick(T7, [6, 15]),                  // ライフ回復ピット
    ramps: pick(T7, [1, 10]).concat(t7RampRow),  // 本線のジャンプ台＋分岐路の奈落前ジャンプ台列
    gaps: t7Gap,                                 // 分岐路(ショートカット)上の広い奈落
  },

  {
    id: 'storm',
    name: 'テンペスト・ゲイル',
    subtitle: 'Tempest Gale',
    difficulty: '超超超超激ムズ',
    laps: 3,
    tile: 80,
    cols: 149, rows: 128,
    roadHalf: 2.8, shoulder: 0.7,
    music: 'race3',
    hazardType: 'ice',
    windForce: 175,                              // ★新ギミック=突風の強さ(強め=逆らわないと流される)
    theme: {
      sky: '#2b3340', skyDk: '#141a23',          // 鉛色の嵐空
      grass: '#1f2630', grassDk: '#12171f',
      road: '#2a3138', roadDk: '#1a1f26', line: '#cfe9ff',   // 灰色の道
      wall: '#7fe7ff', wallTop: '#d6f6ff',       // 稲妻シアンの柵
      curb1: '#7fe7ff', curb2: '#ffe24d',        // シアン×黄
      boost: '#ffe24d', item: '#9fe8ff', hazard: '#cfeeff',  // 氷
      accent: '#7fe7ff',
    },
    waypoints: T8,
    winds: [                                     // ★突風(横風)ゾーン
      { x: 140, y: 40, dx: 1, dy: 0 }, { x: 140, y: 48, dx: 1, dy: 0 }, { x: 140, y: 56, dx: 1, dy: 0 },   // 右ストレート→外(右)へ
      { x: 24, y: 70, dx: -1, dy: 0 }, { x: 24, y: 82, dx: -1, dy: 0 }, { x: 24, y: 92, dx: -1, dy: 0 },   // 左ストレート→外(左)へ
    ],
    items: itemRow(T8, [3, 9, 12, 16], [-0.8, 0, 0.8]),
    boosts: pick(T8, [2, 13]),
    hazards: pick(T8, [4, 10, 11]),              // 右スイープ・上部シケインに氷
    recover: pick(T8, [5, 14]),                  // ライフ回復ピット
    ramps: pick(T8, [8]).concat(t8RampRow),      // 上部のジャンプ台＋下直線の奈落前ジャンプ台列
    gaps: t8Gap,                                 // 下直線の広い奈落
  },

  {
    id: 'warp',
    name: 'ワープ・ラビリンス',
    subtitle: 'Warp Labyrinth',
    difficulty: '超超超超超激ムズ',
    laps: 3,
    tile: 80,
    cols: 155, rows: 130,
    roadHalf: 2.7, shoulder: 0.7,
    music: 'race3',
    hazardType: 'ice',
    theme: {
      sky: '#160a26', skyDk: '#080414',          // 深紫の宇宙
      grass: '#1a0f2e', grassDk: '#0d0820',
      road: '#241640', roadDk: '#160d28', line: '#ff7df0',   // マゼンタに光る道
      wall: '#c14dff', wallTop: '#e6b3ff',       // 紫の柵
      curb1: '#ff4dd2', curb2: '#7df0ff',        // マゼンタ×シアン
      boost: '#7df0ff', item: '#ffd23f', hazard: '#bfe6ff',  // 氷
      accent: '#ff4dd2',
    },
    waypoints: T9,
    branches: [T9_BRANCH1, T9_BRANCH2],          // ★複数分岐
    warps: [{ ex: 88, ey: 98, tx: 119, ty: 28 }], // ★新ギミック=ワープ(分岐1先端→右上へ瞬間移動)
    items: itemRow(T9, [1, 8, 11, 15], [-0.8, 0, 0.8]),
    boosts: pick(T9, [3, 13]),
    hazards: pick(T9, [5, 10, 14]),              // 右スイープ・上シケイン・左スイープに氷
    recover: pick(T9, [4, 14]),                  // ライフ回復ピット
    ramps: pick(T9, [15]),
  },

  {
    id: 'nexus',
    name: 'ワープ・ネクサス',
    subtitle: 'Warp Nexus',
    difficulty: '超超超超超超激ムズ',
    laps: 3,
    tile: 80,
    cols: 152, rows: 138,
    roadHalf: 3.0, shoulder: 0.8,                // 浮島は少し広め(短い島＋急カーブを走れるように)
    music: 'race3',
    hazardType: 'ice',
    theme: {
      sky: '#02060c', skyDk: '#000204',          // ほぼ漆黒の宇宙
      grass: '#05121c', grassDk: '#020a12',
      road: '#0e2630', roadDk: '#081820', line: '#5effd6',   // ティールに光る道
      wall: '#ffcf3a', wallTop: '#fff0a8',       // 金の柵
      curb1: '#5effd6', curb2: '#ffcf3a',        // ティール×金
      boost: '#5effd6', item: '#ff8af0', hazard: '#bfe6ff',  // 氷
      accent: '#5effd6',
    },
    waypoints: T10,
    islands: T10_ISLANDS,                        // ★走路は5つの浮島だけ(間は空白)
    warps: T10_WARPS,                            // ★ワープで対角へ大横断(全幅ゲート×5)
    items: itemRow(T10, [1, 5, 9, 12], [-0.7, 0, 0.7]),
    boosts: pick(T10, [8, 15]),
    hazards: pick(T10, [2, 6, 12]),              // 急カーブ島に氷
    recover: pick(T10, [1, 11]),                 // ライフ回復ピット
  },
];

if (typeof window !== 'undefined') window.TRACKS = TRACKS;
if (typeof module !== 'undefined') module.exports = { TRACKS };
