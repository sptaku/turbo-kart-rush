/* =========================================================================
 * input.js  ―  キーボード入力
 * 1P: WASD + 左Shift(ドリフト) + Space(アイテム)
 * 2P: 矢印 + 右Shift(ドリフト) + Enter(アイテム)
 * =======================================================================*/
const PLAYER_CONTROLS = [
  { accel: 'KeyW', brake: 'KeyS', left: 'KeyA', right: 'KeyD', drift: 'ShiftLeft', item: 'Space', shiftUp: 'KeyE', shiftDown: 'KeyQ' },
  { accel: 'ArrowUp', brake: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', drift: 'ShiftRight', item: 'Enter', shiftUp: 'Period', shiftDown: 'Comma' },
  { accel: 'KeyI', brake: 'KeyK', left: 'KeyJ', right: 'KeyL', drift: 'KeyU', item: 'KeyO', shiftUp: 'KeyP', shiftDown: 'Semicolon' },
  { accel: 'KeyT', brake: 'KeyG', left: 'KeyF', right: 'KeyH', drift: 'KeyR', item: 'KeyY', shiftUp: 'KeyB', shiftDown: 'KeyV' },
  // 5〜8P は基本コントローラ向け(キーボードは割当のみ・密集するため非推奨)
  { accel: 'Numpad8', brake: 'Numpad5', left: 'Numpad4', right: 'Numpad6', drift: 'Numpad0', item: 'NumpadAdd', shiftUp: 'Numpad9', shiftDown: 'Numpad7' },
  { accel: 'Digit8', brake: 'Digit5', left: 'Digit4', right: 'Digit6', drift: 'Digit0', item: 'Digit1', shiftUp: 'Digit9', shiftDown: 'Digit7' },
  { accel: 'KeyZ', brake: 'KeyX', left: 'KeyC', right: 'KeyN', drift: 'KeyM', item: 'Backquote', shiftUp: 'BracketLeft', shiftDown: 'BracketRight' },
  { accel: 'Quote', brake: 'Slash', left: 'Backslash', right: 'Minus', drift: 'Equal', item: 'Digit2', shiftUp: 'Digit3', shiftDown: 'Backspace' },
];

// ページのスクロール等を防ぐためにpreventDefaultするキー
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space', 'KeyE', 'KeyQ',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftRight', 'Enter', 'Period', 'Comma',
  'KeyI', 'KeyK', 'KeyJ', 'KeyL', 'KeyU', 'KeyO', 'KeyP', 'Semicolon',
  'KeyT', 'KeyG', 'KeyF', 'KeyH', 'KeyR', 'KeyY', 'KeyB', 'KeyV',
  'Numpad8', 'Numpad5', 'Numpad4', 'Numpad6', 'Numpad0', 'NumpadAdd', 'Numpad9', 'Numpad7',
  'Digit8', 'Digit5', 'Digit4', 'Digit6', 'Digit0', 'Digit1', 'Digit9', 'Digit7', 'Digit2', 'Digit3',
  'KeyZ', 'KeyX', 'KeyC', 'KeyN', 'KeyM', 'Backquote', 'BracketLeft', 'BracketRight',
  'Quote', 'Slash', 'Backslash', 'Minus', 'Equal', 'Backspace',
]);

class Input {
  constructor() {
    this.down = Object.create(null);     // code -> bool (押しっぱなし)
    this.pressed = Object.create(null);  // code -> bool (このフレームに押された)
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!this.enabled) return;
      if (!this.down[e.code]) this.pressed[e.code] = true;
      this.down[e.code] = true;
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      this.down[e.code] = false;
    });

    // フォーカスを失ったら全キー解放(押しっぱなし暴走の防止)
    window.addEventListener('blur', () => { this.down = Object.create(null); });

    this._gpPrev = Object.create(null);   // ゲームパッドのボタン前回状態(エッジ検出用)
    this.gamepadCount = 0;
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('gamepadconnected', () => this._countPads());
      window.addEventListener('gamepaddisconnected', () => this._countPads());
    }
  }

  isDown(code) { return !!this.down[code]; }
  wasPressed(code) { return !!this.pressed[code]; }
  // 画面上のタッチボタン等からキー入力を擬似的に与える(キーボードと同じ扱い)
  vKey(code, isDown) {
    if (isDown) { if (!this.down[code]) this.pressed[code] = true; this.down[code] = true; }
    else { this.down[code] = false; }
  }
  endFrame() { this.pressed = Object.create(null); }

  _pads() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
    return navigator.getGamepads() || [];
  }
  _countPads() { this.gamepadCount = this._pads().filter(Boolean).length; }

  // プレイヤー番号 i (0始まり) に割り当てたゲームパッドの操作を返す。無ければ null。
  readGamepad(i) {
    const pads = this._pads();
    const gp = pads[i];
    if (!gp) return null;
    const pressed = (n) => { const b = gp.buttons[n]; return !!b && (b.pressed || b.value > 0.4); };
    const ax = (n) => gp.axes[n] || 0;
    const edge = (n) => {
      const key = i + ':' + n, now = pressed(n), was = !!this._gpPrev[key];
      this._gpPrev[key] = now; return now && !was;
    };
    const cl = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);
    // ステア: 左スティックX + 十字キー左右
    let steer = 0; const sx = ax(0);
    if (Math.abs(sx) > 0.2) steer = cl(sx);
    if (pressed(14)) steer = -1; if (pressed(15)) steer = 1;
    let throttle = 0;
    if (pressed(0) || pressed(7)) throttle += 1;   // A / RT
    if (pressed(1) || pressed(6)) throttle -= 1;   // B / LT
    return {
      throttle, steer,
      drift: pressed(5),          // R1
      item: edge(2),              // X
      shiftUp: edge(3),           // Y
      shiftDown: edge(4),         // L1
    };
  }
}

const input = new Input();
if (typeof window !== 'undefined') { window.input = input; window.PLAYER_CONTROLS = PLAYER_CONTROLS; }
