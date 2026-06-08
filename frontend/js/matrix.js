/* matrix.js — animated "digital rain" backdrop for the Matrix theme.
   ------------------------------------------------------------------
   Deliberately lightweight so it runs smoothly on school laptops & phones:
     - throttled to ~18 fps (not a frame hog)
     - automatically pauses when the browser tab is hidden
     - skipped entirely if the user prefers reduced motion (accessibility)
   app.js calls MatrixRain.start() / .stop() when the theme changes. */

const MatrixRain = {
  canvas: null, ctx: null, raf: null, last: 0,
  fontSize: 16, drops: [],
  // A mix of katakana, digits and a few branded glyphs.
  chars: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789QRAMS</>{}'.split(''),

  start() {
    this.canvas = document.getElementById('matrixRain');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    this.canvas.style.display = 'block';
    // Respect motion-sensitive users: draw ONE static "frozen rain" field, no loop.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this._drawStatic();
      return;
    }
    this._onResize = () => this.resize();
    this._onVis = () => { document.hidden ? this._pause() : this._run(); };
    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVis);
    this._run();
  },

  /* A single non-animated frame for reduced-motion devices (still looks Matrix-y). */
  _drawStatic() {
    const c = this.ctx, w = this.canvas.width, h = this.canvas.height;
    c.fillStyle = '#02060a'; c.fillRect(0, 0, w, h);
    c.font = this.fontSize + "px 'Courier New', monospace";
    const rows = Math.max(1, Math.floor(h / this.fontSize));
    for (let i = 0; i < this.drops.length; i++) {
      const len = 4 + ((Math.random() * rows) | 0);
      for (let k = 0; k < len; k++) {
        c.fillStyle = k === len - 1 ? '#d6ffe0' : 'rgba(25,195,74,' + (0.12 + Math.random() * 0.4).toFixed(2) + ')';
        c.fillText(this.chars[(Math.random() * this.chars.length) | 0], i * this.fontSize, k * this.fontSize);
      }
    }
  },

  stop() {
    this._pause();
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    if (this._onVis) document.removeEventListener('visibilitychange', this._onVis);
    if (this.canvas) {
      this.canvas.style.display = 'none';
      if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  },

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    const cols = Math.max(1, Math.floor(this.canvas.width / this.fontSize));
    // each column starts a little above the top, at a random height
    this.drops = new Array(cols).fill(0).map(() => Math.floor(Math.random() * -60));
  },

  _run() { if (!this.raf) this.raf = requestAnimationFrame((t) => this._frame(t)); },
  _pause() { if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; } },

  _frame(t) {
    this.raf = null;
    if (t - this.last > 55) { this.last = t; this._draw(); } // ~18 fps
    this._run();
  },

  _draw() {
    const c = this.ctx, w = this.canvas.width, h = this.canvas.height;
    c.fillStyle = 'rgba(2, 8, 4, 0.10)';        // fade the previous frame -> trailing tails
    c.fillRect(0, 0, w, h);
    c.font = this.fontSize + "px 'Courier New', monospace";
    for (let i = 0; i < this.drops.length; i++) {
      const ch = this.chars[(Math.random() * this.chars.length) | 0];
      const x = i * this.fontSize, y = this.drops[i] * this.fontSize;
      c.fillStyle = Math.random() > 0.975 ? '#d6ffe0' : '#19c34a'; // bright head / green tail
      c.fillText(ch, x, y);
      if (y > h && Math.random() > 0.975) this.drops[i] = 0;       // recycle column
      this.drops[i]++;
    }
  },
};
