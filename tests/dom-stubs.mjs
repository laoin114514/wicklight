/**
 * 无头环境桩件：为 Node 提供最小可用的 DOM / Canvas2D / WebAudio 实现，
 * 让构建产物 dist/app.js 可以在 node 中运行，从而做冒烟测试。
 * 这里刻意实现得“宽容”一些：任何未知的绘制调用都记录数量而不是抛错。
 */
export function installDomStubs(opts = {}) {
  const calls = { ctxCalls: 0 };

  class FakeGradient {
    addColorStop() {}
  }
  class FakePattern {
    setTransform() {}
  }
  class FakeImageData {
    constructor(w, h) {
      this.width = w;
      this.height = h;
      this.data = new Uint8ClampedArray(Math.max(1, w * h * 4));
    }
  }
  class FakeCtx {
    constructor() {
      this.globalAlpha = 1;
      this.globalCompositeOperation = 'source-over';
      this.fillStyle = '#000';
      this.strokeStyle = '#000';
      this.lineWidth = 1;
      this.filter = 'none';
      this.font = '10px sans-serif';
      this.textAlign = 'left';
      this.textBaseline = 'alphabetic';
      this.imageSmoothingEnabled = true;
    }
    _c() {
      calls.ctxCalls += 1;
    }
    setTransform() { this._c(); }
    resetTransform() { this._c(); }
    save() { this._c(); }
    restore() { this._c(); }
    translate() { this._c(); }
    rotate() { this._c(); }
    scale() { this._c(); }
    clearRect() { this._c(); }
    fillRect() { this._c(); }
    strokeRect() { this._c(); }
    beginPath() { this._c(); }
    closePath() { this._c(); }
    moveTo() { this._c(); }
    lineTo() { this._c(); }
    rect() { this._c(); }
    arc() { this._c(); }
    ellipse() { this._c(); }
    quadraticCurveTo() { this._c(); }
    bezierCurveTo() { this._c(); }
    fill() { this._c(); }
    stroke() { this._c(); }
    clip() { this._c(); }
    drawImage() { this._c(); }
    setLineDash() { this._c(); }
    fillText() { this._c(); }
    strokeText() { this._c(); }
    createRadialGradient() { this._c(); return new FakeGradient(); }
    createLinearGradient() { this._c(); return new FakeGradient(); }
    createPattern() { this._c(); return new FakePattern(); }
    createImageData(w, h) { this._c(); return new FakeImageData(w, h); }
    getImageData(x, y, w, h) { this._c(); return new FakeImageData(w, h); }
    putImageData() { this._c(); }
    measureText(text) { this._c(); return { width: String(text ?? '').length * 6 }; }
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
  }

  class FakeClassList {
    constructor() { this.set = new Set(); }
    add(...names) { names.forEach((n) => this.set.add(n)); }
    remove(...names) { names.forEach((n) => this.set.delete(n)); }
    toggle(name, force) { if (force === undefined ? !this.set.has(name) : force) this.set.add(name); else this.set.delete(name); }
    contains(name) { return this.set.has(name); }
  }

  class FakeStyle {
    constructor() {
      this.props = new Map();
    }
    setProperty(k, v) {
      this.props.set(String(k), String(v));
    }
    getPropertyValue(k) {
      return this.props.get(String(k)) ?? '';
    }
    removeProperty(k) {
      this.props.delete(String(k));
    }
  }

  class FakeElement {
    constructor(tag = 'div') {
      this.tagName = String(tag).toUpperCase();
      this.style = new FakeStyle();
      this.dataset = {};
      this.classList = new FakeClassList();
      this.children = [];
      this._html = '';
      this._text = '';
      this.width = 300;
      this.height = 150;
      this.clientWidth = 1280;
      this.clientHeight = 720;
      this._ctx = null;
    }
    get innerHTML() { return this._html; }
    set innerHTML(value) { this._html = String(value); this.children = []; }
    get textContent() { return this._text; }
    set textContent(value) { this._text = String(value); }
    appendChild(child) { this.children.push(child); return child; }
    removeChild(child) { this.children = this.children.filter((c) => c !== child); return child; }
    remove() {}
    setAttribute() {}
    getAttribute() { return null; }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720, x: 0, y: 0 }; }
    querySelector() { return new FakeElement('div'); }
    querySelectorAll() { return []; }
    closest() { return null; }
    setPointerCapture() {}
    releasePointerCapture() {}
    focus() {}
    getContext(kind) {
      if (kind !== '2d') return null;
      if (!this._ctx) {
        this._ctx = new FakeCtx();
        this._ctx.canvas = this;
      }
      return this._ctx;
    }
    toDataURL() { return 'data:,'; }
  }

  class FakeCanvas extends FakeElement {
    constructor() { super('canvas'); }
  }

  const CanvasClass = opts.canvasClass ?? FakeCanvas;

  const registry = new Map();
  const getElement = (id) => {
    if (!registry.has(id)) registry.set(id, id === 'game' ? new CanvasClass() : new FakeElement('div'));
    return registry.get(id);
  };

  const listeners = new Map();
  const addListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  };
  const dispatch = (type, event = {}) => {
    for (const fn of listeners.get(type) ?? []) fn({ type, preventDefault() {}, ...event });
  };

  const documentStub = {
    readyState: 'complete',
    hidden: false,
    createElement: (tag) => (tag === 'canvas' ? new CanvasClass() : new FakeElement(tag)),
    getElementById: getElement,
    querySelector: () => new FakeElement('div'),
    querySelectorAll: () => [],
    addEventListener: addListener,
    removeEventListener: () => {},
    body: new FakeElement('body'),
    documentElement: new FakeElement('html'),
    fonts: { ready: Promise.resolve(), load: () => Promise.resolve() },
  };

  const storage = new Map();
  const localStorageStub = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
    key: (i) => Array.from(storage.keys())[i] ?? null,
    get length() { return storage.size; },
  };

  class FakeAudioParam {
    constructor(value = 0) { this.value = value; }
    setValueAtTime() { return this; }
    linearRampToValueAtTime() { return this; }
    exponentialRampToValueAtTime() { return this; }
    setTargetAtTime() { return this; }
    cancelScheduledValues() { return this; }
    setValueCurveAtTime() { return this; }
  }

  class FakeNode {
    constructor() { this.gain = new FakeAudioParam(1); this.frequency = new FakeAudioParam(440); this.Q = new FakeAudioParam(1); }
    connect(node) { return node; }
    disconnect() {}
    start() {}
    stop() {}
  }

  const audioState = { time: 0, contexts: [] };
  class FakeAudioContext {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.state = 'running';
      this.destination = new FakeNode();
      audioState.contexts.push(this);
    }
    createGain() { return new FakeNode(); }
    createOscillator() { const n = new FakeNode(); n.type = 'sine'; return n; }
    createBiquadFilter() { const n = new FakeNode(); n.type = 'lowpass'; return n; }
    createDynamicsCompressor() { const n = new FakeNode(); n.threshold = new FakeAudioParam(-24); n.knee = new FakeAudioParam(30); n.ratio = new FakeAudioParam(12); n.attack = new FakeAudioParam(0.003); n.release = new FakeAudioParam(0.25); return n; }
    createBufferSource() { const n = new FakeNode(); n.buffer = null; n.loop = false; return n; }
    createStereoPanner() { const n = new FakeNode(); n.pan = new FakeAudioParam(0); return n; }
    createBuffer(channels, length) {
      const data = new Float32Array(length);
      return { length, sampleRate: 48000, numberOfChannels: channels, getChannelData: () => data };
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }

  // 假的 history：只够 BackGuard 用（pushState / back / length / state）。
  // back() 会真的派发 popstate——没这一条，浏览器返回键那条路径在无头环境里
  // 永远走不到，等于没测。
  const historyStack = [null];
  const historyStub = {
    get length() { return historyStack.length; },
    get state() { return historyStack[historyStack.length - 1]; },
    pushState(state) { historyStack.push(state ?? null); },
    replaceState(state) { historyStack[historyStack.length - 1] = state ?? null; },
    back() {
      if (historyStack.length > 1) historyStack.pop();
      dispatch('popstate', { state: historyStub.state });
    },
  };

  const intervals = [];
  const timeouts = [];
  const rafQueue = [];

  const windowStub = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    location: { href: 'http://localhost/', reload() {} },
    history: historyStub,
    navigator: undefined,
    addEventListener: addListener,
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; },
    clearTimeout: () => {},
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
    clearInterval: () => {},
    AudioContext: FakeAudioContext,
    DOMMatrix: class { scale() { return this; } translate() { return this; } rotate() { return this; } },
    Image: class { constructor() { this.onload = null; this.onerror = null; } set src(_v) { this.onerror?.(new Error('no network in test')); } },
    performance: { now: () => audioState.time * 1000 },
    localStorage: localStorageStub,
    dispatch,
  };
  windowStub.navigator = {
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    userAgent: 'node-smoke-test',
    getGamepads: () => [],
  };

  const define = (key, value) => {
    try {
      globalThis[key] = value;
    } catch {
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
  };
  define('window', windowStub);
  define('document', documentStub);
  define('navigator', windowStub.navigator);
  define('localStorage', localStorageStub);
  define('matchMedia', windowStub.matchMedia);
  define('DOMMatrix', windowStub.DOMMatrix);
  define('Image', windowStub.Image);
  define('performance', windowStub.performance);
  define('requestAnimationFrame', windowStub.requestAnimationFrame);
  define('cancelAnimationFrame', windowStub.cancelAnimationFrame);
  define('Window', class Window {});
  define('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
  define('setInterval', windowStub.setInterval);
  define('clearInterval', windowStub.clearInterval);

  return {
    calls,
    audioState,
    intervals,
    timeouts,
    dispatch,
    history: historyStub,
    FakeElement,
    FakeCanvas,
    getElement,
    /** 推进模拟时间并执行一帧 */
    frame(dtMs = 16.67) {
      audioState.time += dtMs / 1000;
      for (const ctx of audioState.contexts) ctx.currentTime = audioState.time;
      for (const interval of intervals) interval.fn();
      const queue = rafQueue.splice(0, rafQueue.length);
      for (const fn of queue) fn(audioState.time * 1000);
    },
    pendingFrames() {
      return rafQueue.length;
    },
  };
}
