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
      this._listeners = null;
    }
    get className() { return [...this.classList.set].join(' '); }
    set className(value) {
      this.classList.set = new Set(String(value ?? '').split(/\s+/).filter(Boolean));
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
    // 元素级监听真的记下来、也真的派发：画布上的 mousedown（右键 = 手动瞄准）就挂在这里，
    // 只记不派的话，"鼠标这条路"在无头环境里永远走不通，只能靠测试自己去戳私有字段。
    addEventListener(type, fn) {
      if (!this._listeners) this._listeners = new Map();
      const list = this._listeners.get(type) ?? [];
      list.push(fn);
      this._listeners.set(type, list);
    }
    removeEventListener(type, fn) {
      const list = this._listeners?.get(type);
      if (list) this._listeners.set(type, list.filter((f) => f !== fn));
    }
    dispatchEvent(event) {
      for (const fn of this._listeners?.get(event?.type) ?? []) fn(event);
      return true;
    }
    getBoundingClientRect() { return { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720, x: 0, y: 0 }; }
    // 同 `querySelectorAll`：默认给一个空元素；`opts.backElement` 塞进来之后
    // `[data-act="back"]` 查得到它（焦点环的"返回"与界面自己挂的返回处理器都走这一条）。
    querySelector(sel) {
      return backElement && String(sel).includes('data-act="back"') ? backElement : new FakeElement('div');
    }
    // 默认什么都没有——`innerHTML` 在这个桩件里只是一根字符串，解析不出元素来。
    // 要量"焦点环在真主循环里怎么走"的测试可以拿 `opts.focusables` 塞一份名单进来
    // （每一项是一块矩形 + 一点 dataset），于是 `FocusRing.attach` 收得到东西，
    // 那条路就不用只靠浏览器那条实测了。
    querySelectorAll() { return focusables; }
    closest() { return null; }
    setPointerCapture() {}
    releasePointerCapture() {}
    focus() {}
    // 真的派发一次 click：`click()` 是浏览器上"程序化点一下"的入口，
    // 焦点环（v82）走的就是这条路——桩件里没有它，那条路在离线就整条走不通
    // （而离线能走通才是这个项目的一贯做法）。
    click() {
      if (!this._listeners?.get('click')) return;
      this.dispatchEvent({ type: 'click' });
    }
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

  /** `opts.backElement`：{ box, dataset }——这一屏的"返回"那颗。 */
  const backElement = opts.backElement
    ? (() => {
        const el = new FakeElement('button');
        Object.assign(el.dataset, { act: 'back', ...(opts.backElement.dataset ?? {}) });
        const box = opts.backElement.box;
        el.getBoundingClientRect = () => ({ left: box.x, top: box.y, right: box.x + box.w, bottom: box.y + box.h, width: box.w, height: box.h, x: box.x, y: box.y });
        return el;
      })()
    : null;

  /** `opts.focusables`：[{ box: {x,y,w,h}, dataset }]——焦点环能落到的那几项。 */
  const focusables = (opts.focusables ?? []).map(({ box, dataset = {} }) => {
    const el = new FakeElement('button');
    Object.assign(el.dataset, dataset);
    el.getBoundingClientRect = () => ({ left: box.x, top: box.y, right: box.x + box.w, bottom: box.y + box.h, width: box.w, height: box.h, x: box.x, y: box.y });
    return el;
  });

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
    focusables,
    backElement,
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
