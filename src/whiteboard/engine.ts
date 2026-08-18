import {
  boxOf,
  boxesIntersect,
  clamp,
  hitTest,
  pointInPolygon,
  routeConnector,
  smoothPoints,
  unionBoxes,
} from "./geometry";
import { renderScene, screenToWorld, visibleWorldBox, worldToScreen } from "./renderer";
import type { RenderTheme } from "./renderer";
import { DEFAULT_PRESET_ID, resolvePreset } from "./brushes";
import type { BrushFamily } from "./brushes";
import type {
  Box,
  EraserMode,
  BoardSnapshot,
  ElementStyle,
  ElementType,
  GridMode,
  Layer,
  PageBackground,
  PageSnapshot,
  StrokePoint,
  ToolId,
  Viewport,
  WBElement,
} from "./types";

/** How long (ms) a laser-pointer trail point stays visible before fading out. */
export const LASER_LIFETIME = 900;

let idCounter = 0;

export const uid = () =>
  `${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.floor(
    Math.random() * 1e6,
  ).toString(36)}`;

export const DEFAULT_STYLE: ElementStyle = {
  stroke: "#e7e9ee",
  fill: "transparent",
  fillStyle: "solid",
  strokeWidth: 2.5,
  strokeStyle: "solid",
  opacity: 1,
  roughness: 0,
  radius: 12,
  fontSize: 20,
  fontFamily: '"Outfit", system-ui, sans-serif',
  fontWeight: 500,
  textAlign: "left",
  brush: "pen",
  smoothing: 0.6,
  brushPreset: DEFAULT_PRESET_ID,
  lineHeight: 1.35,
};

interface HistoryEntry {
  changes: { id: string; before: WBElement | null; after: WBElement | null }[];
  orderBefore: string[];
  orderAfter: string[];
}

type Interaction =
  | { kind: "none" }
  | { kind: "pan"; startX: number; startY: number; vx: number; vy: number }
  | { kind: "draw"; el: WBElement; raw: StrokePoint[] }
  | { kind: "shape"; el: WBElement; ox: number; oy: number }
  | { kind: "connector"; el: WBElement; ox: number; oy: number }
  | { kind: "marquee"; ox: number; oy: number }
  | {
      kind: "move";
      ox: number;
      oy: number;
      origins: Map<string, { x: number; y: number }>;
    }
  | {
      kind: "resize";
      id: string;
      handle: number;
      start: WBElement;
    }
  | { kind: "rotate"; id: string; cx: number; cy: number; startAngle: number; base: number }
  | { kind: "erase" }
  | { kind: "lasso"; pts: StrokePoint[] }
  | { kind: "laser" };

export interface EngineStats {
  fps: number;
  rendered: number;
  total: number;
}

/** Live, in-memory state of a single page. */
export interface PageState {
  id: string;
  name: string;
  elements: Map<string, WBElement>;
  order: string[];
  layers: Layer[];
  activeLayer: string;
  viewport: Viewport;
  background: PageBackground;
  size: { w: number; h: number } | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
}

/** Default fixed page dimensions (world units) — the canvas is not infinite. */
export const DEFAULT_PAGE_SIZE = { w: 1600, h: 900 };

export function createPage(name: string, background?: Partial<PageBackground>): PageState {
  const layerId = uid();
  return {
    id: uid(),
    name,
    elements: new Map(),
    order: [],
    layers: [{ id: layerId, name: "Layer 1", visible: true, locked: false, opacity: 1 }],
    activeLayer: layerId,
    viewport: { x: 0, y: 0, zoom: 1 },
    background: { grid: "dots", ...background },
    size: { ...DEFAULT_PAGE_SIZE },
    past: [],
    future: [],
  };
}

/**
 * The whiteboard engine: owns the document, the viewport, tool state,
 * input handling, history and the render loop. UI subscribes for updates.
 */
export class WhiteboardEngine {
  boardId: string;
  boardName: string;
  hydrated = false;
  userDirty = false;
  /** Pages of the board; the active page's state is mirrored on the engine. */
  pages: PageState[] = [];
  activePageId = "";
  elements = new Map<string, WBElement>();
  order: string[] = [];
  layers: Layer[] = [{ id: "layer-1", name: "Layer 1", visible: true, locked: false, opacity: 1 }];
  activeLayer = "layer-1";
  private _viewport: Viewport = { x: 0, y: 0, zoom: 1 };
  /** Viewport is always clamped so the fixed page fully covers the screen. */
  get viewport(): Viewport {
    return this._viewport;
  }
  set viewport(v: Viewport) {
    this._viewport = this.clampViewport(v);
  }
  selection = new Set<string>();
  tool: ToolId = "select";
  style: ElementStyle = { ...DEFAULT_STYLE };
  gridMode: GridMode = "dots";
  /** Per-page paper settings (mirrored from the active page). */
  pageBackground: PageBackground = { grid: "dots" };
  pageSize: { w: number; h: number } | null = { ...DEFAULT_PAGE_SIZE };
  /** Guards the one-time "frame the page" pass after the canvas is measured. */
  pageFitted = false;
  snapToGrid = false;
  gridSize = 20;
  editingId: string | null = null;
  eraserMode: EraserMode = "object";
  eraserSize = 24;
  /** Internal clipboard for copy / cut / paste of elements. */
  clipboard: WBElement[] = [];
  stats: EngineStats = { fps: 60, rendered: 0, total: 0 };
  /** Monotonic counter used by React to detect UI-relevant changes. */
  version = 0;
  /** True once a saved board has been restored (or restore found nothing). */
  connectorRouting: "straight" | "orthogonal" | "curved" = "orthogonal";

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private theme: RenderTheme = {
    canvas: "#0d1016",
    grid: "rgba(255,255,255,0.09)",
    gridStrong: "rgba(255,255,255,0.16)",
    selection: "#38bdf8",
    selectionFill: "rgba(56,189,248,0.12)",
    text: "#e7e9ee",
  };
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private interaction: Interaction = { kind: "none" };
  private marquee: Box | null = null;
  private laser: StrokePoint[] = [];
  private lasso: StrokePoint[] | null = null;
  private snapLines: { x?: number; y?: number }[] = [];
  private dirty = true;
  private raf = 0;
  private listeners = new Set<() => void>();
  private lastFrame = performance.now?.() ?? 0;
  private size = { w: 0, h: 0, dpr: 1 };
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; zoom: number; cx: number; cy: number } | null = null;
  private spaceDown = false;

  constructor(boardId: string, boardName = "Untitled board") {
    this.boardId = boardId;
    this.boardName = boardName;
    const first = createPage("Page 1");
    this.pages = [first];
    this.activePageId = first.id;
    this.adoptPage(first);
  }

  /* ------------------------------------------------------------------ */
  /* Pages                                                               */
  /* ------------------------------------------------------------------ */
  private adoptPage(p: PageState) {
    this.elements = p.elements;
    this.order = p.order;
    this.layers = p.layers;
    this.activeLayer = p.activeLayer;
    this.viewport = p.viewport;
    this.gridMode = p.background.grid;
    this.pageBackground = p.background;
    this.pageSize = p.size;
    this.past = p.past;
    this.future = p.future;
  }

  /** Writes the mirrored live state back into the active page record. */
  private commitPage() {
    const p = this.pages.find((x) => x.id === this.activePageId);
    if (!p) return;
    p.elements = this.elements;
    p.order = this.order;
    p.layers = this.layers;
    p.activeLayer = this.activeLayer;
    p.viewport = this.viewport;
    p.background = { ...this.pageBackground, grid: this.gridMode };
    p.size = this.pageSize;
    p.past = this.past;
    p.future = this.future;
  }

  get activePage(): PageState {
    return this.pages.find((p) => p.id === this.activePageId) ?? this.pages[0]!;
  }

  setActivePage(id: string) {
    if (id === this.activePageId) return;
    const next = this.pages.find((p) => p.id === id);
    if (!next) return;
    this.stopEditing();
    this.commitPage();
    this.activePageId = id;
    this.selection.clear();
    this.interaction = { kind: "none" };
    this.adoptPage(next);
    this.fitPage();
    this.commitUI();
  }

  addPage(name?: string) {
    this.commitPage();
    const page = createPage(name ?? `Page ${this.pages.length + 1}`, {
      ...this.pageBackground,
    });
    page.size = this.pageSize ? { ...this.pageSize } : null;
    this.pages = [...this.pages, page];
    this.activePageId = page.id;
    this.selection.clear();
    this.editingId = null;
    this.adoptPage(page);
    this.commitUI();
    return page.id;
  }

  duplicatePage(id: string) {
    this.commitPage();
    const src = this.pages.find((p) => p.id === id);
    if (!src) return;
    const copy = createPage(`${src.name} copy`, src.background);
    copy.size = src.size ? { ...src.size } : null;
    const remap = new Map<string, string>();
    for (const oldId of src.order) {
      const el = src.elements.get(oldId);
      if (!el) continue;
      const nid = uid();
      remap.set(oldId, nid);
      copy.elements.set(nid, {
        ...el,
        id: nid,
        style: { ...el.style },
        ...(el.points ? { points: el.points.map((p) => ({ ...p })) } : {}),
      });
      copy.order.push(nid);
    }
    // keep connector bindings pointing inside the copy
    for (const el of copy.elements.values()) {
      if (el.startBind?.elementId && remap.has(el.startBind.elementId))
        el.startBind = { ...el.startBind, elementId: remap.get(el.startBind.elementId)! };
      if (el.endBind?.elementId && remap.has(el.endBind.elementId))
        el.endBind = { ...el.endBind, elementId: remap.get(el.endBind.elementId)! };
    }
    copy.layers = src.layers.map((l) => ({ ...l }));
    copy.activeLayer = copy.layers[0]!.id;
    copy.viewport = { ...src.viewport };
    const idx = this.pages.findIndex((p) => p.id === id);
    this.pages = [...this.pages.slice(0, idx + 1), copy, ...this.pages.slice(idx + 1)];
    this.activePageId = copy.id;
    this.selection.clear();
    this.adoptPage(copy);
    this.commitUI();
  }

  removePage(id: string) {
    if (this.pages.length === 1) return;
    const idx = this.pages.findIndex((p) => p.id === id);
    if (idx < 0) return;
    this.pages = this.pages.filter((p) => p.id !== id);
    if (this.activePageId === id) {
      const next = this.pages[Math.max(0, idx - 1)]!;
      this.activePageId = next.id;
      this.selection.clear();
      this.editingId = null;
      this.adoptPage(next);
    }
    this.commitUI();
  }

  renamePage(id: string, name: string) {
    const p = this.pages.find((x) => x.id === id);
    if (!p) return;
    p.name = name;
    this.commitUI();
  }

  reorderPage(id: string, toIndex: number) {
    const from = this.pages.findIndex((p) => p.id === id);
    if (from < 0) return;
    const next = [...this.pages];
    const [moved] = next.splice(from, 1);
    next.splice(clamp(toIndex, 0, next.length), 0, moved!);
    this.pages = next;
    this.commitUI();
  }

  setPageBackground(patch: Partial<PageBackground>) {
    this.pageBackground = { ...this.pageBackground, ...patch };
    if (patch.grid) this.gridMode = patch.grid;
    this.commitPage();
    this.commitUI();
  }

  /** Fixed page dimensions in world units, or null for infinite canvas. */
  setPageSize(size: { w: number; h: number } | null) {
    this.pageSize = size ?? { ...DEFAULT_PAGE_SIZE };
    this.commitPage();
    this.fitPage();
    this.commitUI();
  }

  /* ------------------------------------------------------------------ */
  /* Subscription                                                        */
  /* ------------------------------------------------------------------ */
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }
  invalidate() {
    this.dirty = true;
  }
  private commitUI() {
    this.dirty = true;
    this.emit();
  }

  /* ------------------------------------------------------------------ */
  /* Canvas lifecycle                                                    */
  /* ------------------------------------------------------------------ */
  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.resize();
    const loop = () => {
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  detach() {
    cancelAnimationFrame(this.raf);
    this.canvas = null;
    this.ctx = null;
  }
  setTheme(theme: RenderTheme) {
    this.theme = theme;
    this.dirty = true;
  }
  resize() {
    const c = this.canvas;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.size = { w: rect.width, h: rect.height, dpr };
    c.width = Math.floor(rect.width * dpr);
    c.height = Math.floor(rect.height * dpr);
    if (!this.pageSize) this.pageSize = { ...DEFAULT_PAGE_SIZE };
    if (rect.width > 0) {
      if (!this.pageFitted) {
        this.pageFitted = true;
        this.fitPage();
      } else {
        // keep the sheet covering the screen after a window resize
        this.viewport = this._viewport;
      }
    }
    this.dirty = true;
  }

  /** Smallest zoom at which the page still covers the whole viewport. */
  get minZoom() {
    const size = this.pageSize;
    if (!size || !this.size.w || !this.size.h) return 0.02;
    return Math.max(this.size.w / size.w, this.size.h / size.h);
  }

  /** Keeps the page edges outside the viewport (no infinite board around it). */
  private clampViewport(v: Viewport): Viewport {
    const size = this.pageSize;
    if (!size || !this.size.w || !this.size.h) return v;
    const zoom = clamp(v.zoom, this.minZoom, 64);
    const vw = this.size.w / zoom;
    const vh = this.size.h / zoom;
    const maxX = size.w - vw;
    const maxY = size.h - vh;
    return {
      zoom,
      x: maxX <= 0 ? maxX / 2 : clamp(v.x, 0, maxX),
      y: maxY <= 0 ? maxY / 2 : clamp(v.y, 0, maxY),
    };
  }

  /** Fits the page so it exactly covers the viewport. */
  fitPage() {
    const size = this.pageSize ?? DEFAULT_PAGE_SIZE;
    const zoom = this.minZoom;
    this.viewport = {
      zoom,
      x: size.w / 2 - this.size.w / 2 / zoom,
      y: size.h / 2 - this.size.h / 2 / zoom,
    };
    this.commitUI();
  }


  /** Removes every element on the current page (one undoable action). */
  clearPage() {
    if (!this.order.length) return;
    this.deleteElements([...this.order]);
  }

  private frame() {
    const now = performance.now();
    const dt = now - this.lastFrame;
    this.lastFrame = now;
    if (this.laser.length) {
      // Time-based expiry gives the trail a smooth, constant-speed fade.
      const cutoff = now - LASER_LIFETIME;
      const kept = this.laser.filter((p) => (p.t ?? now) > cutoff);
      if (kept.length !== this.laser.length) this.laser = kept;
      this.dirty = true;
    }
    if (!this.dirty || !this.ctx) return;
    this.dirty = false;

    const world = visibleWorldBox(this.viewport, this.size.w, this.size.h);
    const visible: WBElement[] = [];
    const layerMap = new Map(this.layers.map((l) => [l.id, l]));
    for (const id of this.order) {
      const el = this.elements.get(id);
      if (!el) continue;
      const layer = layerMap.get(el.layerId);
      if (layer && !layer.visible) continue;
      const b = boxOf(el);
      const pad = el.style.strokeWidth * 2 + 8;
      if (
        !boxesIntersect(world, {
          x: b.x - pad,
          y: b.y - pad,
          w: b.w + pad * 2,
          h: b.h + pad * 2,
        })
      )
        continue;
      if (el.id === this.editingId && (el.type === "text" || el.type === "sticky")) {
        visible.push({ ...el, text: "" });
        continue;
      }
      visible.push(
        layer && layer.opacity < 1
          ? { ...el, style: { ...el.style, opacity: el.style.opacity * layer.opacity } }
          : el,
      );
    }

    const preview =
      this.interaction.kind === "draw" ||
      this.interaction.kind === "shape" ||
      this.interaction.kind === "connector"
        ? this.interaction.el
        : null;

    const rendered = renderScene(
      this.ctx,
      {
        elements: visible,
        viewport: this.viewport,
        width: this.size.w,
        height: this.size.h,
        dpr: this.size.dpr,
        theme: this.theme,
        gridMode: this.gridMode,
        selection: this.selection,
        preview,
        marquee: this.marquee,
        laser: this.laser,
        laserLifetime: LASER_LIFETIME,
        pageBox: this.pageSize,
        pageColor: this.pageBackground.color,
        ...(this.lasso ? { lasso: this.lasso } : {}),
        snapLines: this.snapLines,
      },
      () => (this.dirty = true),
    );

    const fps = dt > 0 ? 1000 / dt : 60;
    this.stats = {
      fps: Math.round(this.stats.fps * 0.9 + fps * 0.1),
      rendered,
      total: this.elements.size,
    };
  }

  /** Family of the active brush preset (drives the pointer cursor). */
  get brushFamily(): BrushFamily {
    return resolvePreset(this.style).family;
  }

  /* ------------------------------------------------------------------ */
  /* Document mutations + history                                        */
  /* ------------------------------------------------------------------ */
  getElements(): WBElement[] {
    return this.order.map((id) => this.elements.get(id)).filter((e): e is WBElement => !!e);
  }

  private pushHistory(entry: HistoryEntry) {
    this.past.push(entry);
    if (this.past.length > 500) this.past.shift();
    this.future = [];
  }

  /** Runs `fn` and records a single undoable transaction. */
  transact(fn: () => void, touched?: string[]) {
    const orderBefore = [...this.order];
    const ids = touched ?? [...this.elements.keys()];
    const before = new Map<string, WBElement | null>();
    for (const id of ids) before.set(id, this.elements.get(id) ?? null);
    fn();
    const allIds = new Set([...ids, ...this.order]);
    const changes: HistoryEntry["changes"] = [];
    for (const id of allIds) {
      const b = before.has(id) ? (before.get(id) ?? null) : (this.elements.get(id) ?? null);
      const a = this.elements.get(id) ?? null;
      if (b !== a) changes.push({ id, before: b ? { ...b } : null, after: a ? { ...a } : null });
    }
    if (changes.length || orderBefore.join() !== this.order.join()) {
      this.pushHistory({ changes, orderBefore, orderAfter: [...this.order] });
    }
    this.commitUI();
  }

  addElement(el: WBElement, record = true) {
    const apply = () => {
      this.elements.set(el.id, el);
      this.order.push(el.id);
    };
    if (record) this.transact(apply, [el.id]);
    else apply();
  }

  updateElements(ids: string[], patch: (el: WBElement) => Partial<WBElement>, record = true) {
    const apply = () => {
      for (const id of ids) {
        const el = this.elements.get(id);
        if (!el || el.locked) continue;
        this.elements.set(id, { ...el, ...patch(el), version: el.version + 1 });
      }
    };
    if (record) this.transact(apply, ids);
    else {
      apply();
      this.commitUI();
    }
  }

  deleteElements(ids: string[]) {
    const gone = new Set(ids);
    this.transact(() => {
      for (const id of ids) {
        const el = this.elements.get(id);
        if (el?.locked) continue;
        this.elements.delete(id);
      }
      // free connector endpoints that pointed at the deleted elements
      for (const id of this.order) {
        const el = this.elements.get(id);
        if (!el) continue;
        const startGone = el.startBind?.elementId && gone.has(el.startBind.elementId);
        const endGone = el.endBind?.elementId && gone.has(el.endBind.elementId);
        if (!startGone && !endGone) continue;
        const next = { ...el };
        if (startGone) delete next.startBind;
        if (endGone) delete next.endBind;
        this.elements.set(id, next);
      }
      this.order = this.order.filter((id) => this.elements.has(id));
      ids.forEach((id) => this.selection.delete(id));
    }, ids);
  }

  undo() {
    const entry = this.past.pop();
    if (!entry) return;
    for (const c of entry.changes) {
      if (c.before) this.elements.set(c.id, c.before);
      else this.elements.delete(c.id);
    }
    this.order = entry.orderBefore.filter((id) => this.elements.has(id));
    this.future.push(entry);
    this.selection.clear();
    this.commitUI();
  }

  redo() {
    const entry = this.future.pop();
    if (!entry) return;
    for (const c of entry.changes) {
      if (c.after) this.elements.set(c.id, c.after);
      else this.elements.delete(c.id);
    }
    this.order = entry.orderAfter.filter((id) => this.elements.has(id));
    this.past.push(entry);
    this.selection.clear();
    this.commitUI();
  }

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }

  /* ------------------------------------------------------------------ */
  /* Viewport                                                            */
  /* ------------------------------------------------------------------ */
  zoomAt(screenX: number, screenY: number, factor: number) {
    const v = this.viewport;
    const next = clamp(v.zoom * factor, 0.02, 64);
    const k = next / v.zoom;
    const wx = screenX / v.zoom + v.x;
    const wy = screenY / v.zoom + v.y;
    this.viewport = {
      zoom: next,
      x: wx - (wx - v.x) / k,
      y: wy - (wy - v.y) / k,
    };
    this.commitUI();
  }

  setZoom(zoom: number) {
    this.zoomAt(this.size.w / 2, this.size.h / 2, clamp(zoom, 0.02, 64) / this.viewport.zoom);
  }

  panBy(dx: number, dy: number) {
    this.viewport = {
      ...this.viewport,
      x: this.viewport.x + dx / this.viewport.zoom,
      y: this.viewport.y + dy / this.viewport.zoom,
    };
    this.commitUI();
  }

  zoomToBox(box: Box, padding = 80) {
    if (!this.size.w) return;
    const zoom = clamp(
      Math.min(
        (this.size.w - padding * 2) / Math.max(box.w, 1),
        (this.size.h - padding * 2) / Math.max(box.h, 1),
      ),
      0.02,
      6,
    );
    this.viewport = {
      zoom,
      x: box.x + box.w / 2 - this.size.w / 2 / zoom,
      y: box.y + box.h / 2 - this.size.h / 2 / zoom,
    };
    this.commitUI();
  }

  zoomToFit() {
    const box = unionBoxes(this.getElements().map(boxOf));
    if (!box) {
      this.viewport = { x: -this.size.w / 2, y: -this.size.h / 2, zoom: 1 };
      this.commitUI();
      return;
    }
    this.zoomToBox(box);
  }

  zoomToSelection() {
    const box = unionBoxes(
      this.getElements()
        .filter((e) => this.selection.has(e.id))
        .map(boxOf),
    );
    if (box) this.zoomToBox(box);
  }

  get viewportSize() {
    return this.size;
  }

  /* ------------------------------------------------------------------ */
  /* Element factory                                                     */
  /* ------------------------------------------------------------------ */
  createElement(type: ElementType, x: number, y: number, w = 0, h = 0): WBElement {
    const style = { ...this.style };
    if (type === "sticky") {
      style.fill = style.fill === "transparent" ? "#fbbf24" : style.fill;
      style.stroke = "#1a1205";
      style.fontSize = 18;
    }
    return {
      id: uid(),
      type,
      x,
      y,
      w,
      h,
      angle: 0,
      layerId: this.activeLayer,
      locked: false,
      style,
      seed: Math.floor(Math.random() * 100000),
      version: 0,
      ...(type === "draw" || type === "line" || type === "arrow" ? { points: [] } : {}),
      ...(type === "text" || type === "sticky" ? { text: "" } : {}),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Hit testing                                                         */
  /* ------------------------------------------------------------------ */
  elementAt(wx: number, wy: number): WBElement | null {
    const tol = 6 / this.viewport.zoom;
    const layerMap = new Map(this.layers.map((l) => [l.id, l]));
    for (let i = this.order.length - 1; i >= 0; i--) {
      const el = this.elements.get(this.order[i]!);
      if (!el) continue;
      const layer = layerMap.get(el.layerId);
      if (layer && (!layer.visible || layer.locked)) continue;
      if (hitTest(el, wx, wy, tol)) return el;
    }
    return null;
  }

  /** Returns index of a resize handle (0..3) or -1, or 9 for rotation. */
  private handleAt(screenX: number, screenY: number): number {
    if (this.selection.size !== 1) return -1;
    const id = [...this.selection][0]!;
    const el = this.elements.get(id);
    if (!el) return -1;
    const b = boxOf(el);
    const tl = worldToScreen(this.viewport, b.x, b.y);
    const w = b.w * this.viewport.zoom;
    const h = b.h * this.viewport.zoom;
    const pts: [number, number, number][] = [
      [tl.x, tl.y, 0],
      [tl.x + w, tl.y, 1],
      [tl.x, tl.y + h, 2],
      [tl.x + w, tl.y + h, 3],
      [tl.x + w / 2, tl.y - 26, 9],
    ];
    for (const [hx, hy, idx] of pts) {
      if (Math.abs(screenX - hx) <= 8 && Math.abs(screenY - hy) <= 8) return idx;
    }
    return -1;
  }

  private snap(value: number) {
    return this.snapToGrid ? Math.round(value / this.gridSize) * this.gridSize : value;
  }

  /* ------------------------------------------------------------------ */
  /* Pointer handling                                                    */
  /* ------------------------------------------------------------------ */
  setSpace(down: boolean) {
    this.spaceDown = down;
  }

  pointerDown(sx: number, sy: number, e: PointerEvent) {
    this.pointers.set(e.pointerId, { x: sx, y: sy });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      if (a && b) {
        this.pinch = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          zoom: this.viewport.zoom,
          cx: (a.x + b.x) / 2,
          cy: (a.y + b.y) / 2,
        };
      }
      this.interaction = { kind: "none" };
      return;
    }
    const w = screenToWorld(this.viewport, sx, sy);
    const middle = e.button === 1;

    if (this.tool === "hand" || middle || this.spaceDown) {
      this.interaction = {
        kind: "pan",
        startX: sx,
        startY: sy,
        vx: this.viewport.x,
        vy: this.viewport.y,
      };
      return;
    }

    switch (this.tool) {
      case "laser":
        this.laser = [{ x: w.x, y: w.y, p: 1, t: performance.now() }];
        this.interaction = { kind: "laser" };
        return;
      case "eraser":
        this.interaction = { kind: "erase" };
        this.eraseAt(w.x, w.y);
        return;
      case "lasso":
        if (!e.shiftKey) this.selection.clear();
        this.lasso = [{ x: w.x, y: w.y, p: 1 }];
        this.interaction = { kind: "lasso", pts: this.lasso };
        this.commitUI();
        return;
      case "draw": {
        const el = this.createElement("draw", w.x, w.y);
        el.points = [{ x: 0, y: 0, p: e.pressure > 0 ? e.pressure : 0.5 }];
        this.interaction = { kind: "draw", el, raw: [{ x: 0, y: 0, p: 0.5 }] };
        this.dirty = true;
        return;
      }
      case "text":
      case "sticky": {
        const isSticky = this.tool === "sticky";
        const existing = this.elementAt(w.x, w.y);
        if (existing && (existing.type === "text" || existing.type === "sticky")) {
          this.selection = new Set([existing.id]);
          this.startEditing(existing.id);
          this.tool = "select";
          this.commitUI();
          return;
        }
        const el = this.createElement(
          isSticky ? "sticky" : "text",
          this.snap(w.x),
          this.snap(w.y),
          isSticky ? 200 : 240,
          isSticky ? 200 : Math.round(this.style.fontSize * 1.4),
        );
        el.text = "";
        this.addElement(el);
        this.selection = new Set([el.id]);
        this.editingId = el.id;
        this.tool = "select";
        // The pointerup that follows this click must not close the editor.
        this.interaction = { kind: "none" };
        this.commitUI();
        return;
      }
      case "connector": {
        const start = this.elementAt(w.x, w.y);
        const el = this.createElement("arrow", w.x, w.y, 0, 0);
        el.routing = this.connectorRouting;
        el.points = [
          { x: 0, y: 0, p: 1 },
          { x: 0, y: 0, p: 1 },
        ];
        if (start && start.type !== "arrow" && start.type !== "line")
          el.startBind = { elementId: start.id };
        this.interaction = { kind: "connector", el, ox: w.x, oy: w.y };
        this.dirty = true;
        return;
      }
      case "rect":
      case "ellipse":
      case "diamond":
      case "triangle":
      case "star":
      case "line":
      case "arrow": {
        const el = this.createElement(this.tool, this.snap(w.x), this.snap(w.y), 0, 0);
        if (el.points)
          el.points = [
            { x: 0, y: 0, p: 1 },
            { x: 0, y: 0, p: 1 },
          ];
        this.interaction = { kind: "shape", el, ox: this.snap(w.x), oy: this.snap(w.y) };
        this.dirty = true;
        return;
      }
      default:
        break;
    }

    // select tool
    const handle = this.handleAt(sx, sy);
    if (handle >= 0) {
      const id = [...this.selection][0]!;
      const el = this.elements.get(id);
      if (el) {
        if (handle === 9) {
          const b = boxOf(el);
          const cx = b.x + b.w / 2,
            cy = b.y + b.h / 2;
          this.interaction = {
            kind: "rotate",
            id,
            cx,
            cy,
            startAngle: Math.atan2(w.y - cy, w.x - cx),
            base: el.angle,
          };
        } else {
          this.interaction = { kind: "resize", id, handle, start: { ...el } };
        }
        return;
      }
    }

    const hit = this.elementAt(w.x, w.y);
    if (hit) {
      const groupIds = hit.groupId
        ? this.getElements()
            .filter((el) => el.groupId === hit.groupId)
            .map((el) => el.id)
        : [hit.id];
      if (e.shiftKey) {
        const has = this.selection.has(hit.id);
        groupIds.forEach((id) => (has ? this.selection.delete(id) : this.selection.add(id)));
      } else if (!this.selection.has(hit.id)) {
        this.selection = new Set(groupIds);
      }
      if (e.altKey) this.duplicateSelection(0);
      const origins = new Map<string, { x: number; y: number }>();
      for (const id of this.selection) {
        const el = this.elements.get(id);
        if (el && !el.locked) origins.set(id, { x: el.x, y: el.y });
      }
      this.interaction = { kind: "move", ox: w.x, oy: w.y, origins };
      this.commitUI();
      return;
    }

    if (!e.shiftKey) this.selection.clear();
    this.marquee = { x: w.x, y: w.y, w: 0, h: 0 };
    this.interaction = { kind: "marquee", ox: w.x, oy: w.y };
    this.commitUI();
  }

  pointerMove(sx: number, sy: number, e: PointerEvent) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: sx, y: sy });
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      if (a && b) {
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const target = clamp((this.pinch.zoom * dist) / this.pinch.dist, 0.02, 64);
        this.zoomAt(this.pinch.cx, this.pinch.cy, target / this.viewport.zoom);
      }
      return;
    }

    const w = screenToWorld(this.viewport, sx, sy);
    const it = this.interaction;
    switch (it.kind) {
      case "pan": {
        this.viewport = {
          ...this.viewport,
          x: it.vx - (sx - it.startX) / this.viewport.zoom,
          y: it.vy - (sy - it.startY) / this.viewport.zoom,
        };
        this.commitUI();
        break;
      }
      case "laser": {
        const last = this.laser[this.laser.length - 1];
        // resample so fast strokes still fade evenly
        if (last) {
          const dist = Math.hypot(w.x - last.x, w.y - last.y);
          const steps = Math.min(12, Math.floor(dist / (6 / this.viewport.zoom)));
          for (let i = 1; i <= steps; i++)
            this.laser.push({
              x: last.x + ((w.x - last.x) * i) / (steps + 1),
              y: last.y + ((w.y - last.y) * i) / (steps + 1),
              p: 1,
              t: performance.now(),
            });
        }
        this.laser.push({ x: w.x, y: w.y, p: 1, t: performance.now() });
        this.dirty = true;
        break;
      }
      case "connector": {
        const el = it.el;
        const target = this.elementAt(w.x, w.y);
        const valid =
          target && target.id !== el.id && target.type !== "arrow" && target.type !== "line"
            ? target
            : null;
        if (valid) el.endBind = { elementId: valid.id };
        else delete el.endBind;

        this.routeConnectorElement(el, { x: it.ox, y: it.oy }, { x: w.x, y: w.y });
        this.dirty = true;
        break;
      }

      case "erase":
        this.eraseAt(w.x, w.y);
        break;
      case "lasso": {
        it.pts.push({ x: w.x, y: w.y, p: 1 });
        this.lasso = it.pts;
        this.dirty = true;
        break;
      }
      case "draw": {
        const el = it.el;
        const local = { x: w.x - el.x, y: w.y - el.y };
        const prev = it.raw[it.raw.length - 1];
        const speed = prev ? Math.hypot(local.x - prev.x, local.y - prev.y) : 0;
        const pressure =
          e.pressure > 0 && e.pointerType === "pen" ? e.pressure : clamp(1 - speed / 40, 0.25, 1);
        it.raw.push({ x: local.x, y: local.y, p: pressure });
        el.points = smoothPoints(it.raw, this.style.smoothing);
        this.dirty = true;
        break;
      }
      case "shape": {
        const el = it.el;
        let nx = this.snap(w.x);
        let ny = this.snap(w.y);
        if (e.shiftKey) {
          const d = Math.max(Math.abs(nx - it.ox), Math.abs(ny - it.oy));
          nx = it.ox + Math.sign(nx - it.ox) * d;
          ny = it.oy + Math.sign(ny - it.oy) * d;
        }
        el.w = nx - it.ox;
        el.h = ny - it.oy;
        if (el.points)
          el.points = [
            { x: 0, y: 0, p: 1 },
            { x: el.w, y: el.h, p: 1 },
          ];
        this.dirty = true;
        break;
      }
      case "marquee": {
        this.marquee = {
          x: Math.min(it.ox, w.x),
          y: Math.min(it.oy, w.y),
          w: Math.abs(w.x - it.ox),
          h: Math.abs(w.y - it.oy),
        };
        const box = this.marquee;
        const next = new Set<string>();
        for (const el of this.getElements()) {
          if (el.locked) continue;
          if (boxesIntersect(box, boxOf(el))) next.add(el.id);
        }
        this.selection = next;
        this.commitUI();
        break;
      }
      case "move": {
        let dx = w.x - it.ox;
        let dy = w.y - it.oy;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const lines: { x?: number; y?: number }[] = [];
        for (const [id, origin] of it.origins) {
          const el = this.elements.get(id);
          if (!el) continue;
          let nx = origin.x + dx;
          let ny = origin.y + dy;
          if (this.snapToGrid) {
            nx = this.snap(nx);
            ny = this.snap(ny);
          }
          this.elements.set(id, { ...el, x: nx, y: ny });
        }
        // smart alignment guides against non-selected elements
        if (it.origins.size === 1) {
          const id = [...it.origins.keys()][0]!;
          const el = this.elements.get(id);
          if (el) {
            const b = boxOf(el);
            const tolerance = 6 / this.viewport.zoom;
            for (const other of this.getElements()) {
              if (other.id === id) continue;
              const ob = boxOf(other);
              const pairs: [number, number, "x" | "y"][] = [
                [b.x, ob.x, "x"],
                [b.x + b.w / 2, ob.x + ob.w / 2, "x"],
                [b.x + b.w, ob.x + ob.w, "x"],
                [b.y, ob.y, "y"],
                [b.y + b.h / 2, ob.y + ob.h / 2, "y"],
                [b.y + b.h, ob.y + ob.h, "y"],
              ];
              for (const [mine, theirs, axis] of pairs) {
                if (Math.abs(mine - theirs) < tolerance) {
                  const delta = theirs - mine;
                  const cur = this.elements.get(id)!;
                  this.elements.set(
                    id,
                    axis === "x" ? { ...cur, x: cur.x + delta } : { ...cur, y: cur.y + delta },
                  );
                  lines.push(axis === "x" ? { x: theirs } : { y: theirs });
                }
              }
            }
          }
        }
        this.refreshConnectors();
        this.snapLines = lines.slice(0, 4);
        this.commitUI();
        break;
      }
      case "resize": {
        const el = this.elements.get(it.id);
        if (!el) break;
        const s = it.start;
        const right = s.x + s.w;
        const bottom = s.y + s.h;
        let nx = s.x,
          ny = s.y,
          nw = s.w,
          nh = s.h;
        if (it.handle === 0) {
          nx = w.x;
          ny = w.y;
          nw = right - w.x;
          nh = bottom - w.y;
        } else if (it.handle === 1) {
          ny = w.y;
          nw = w.x - s.x;
          nh = bottom - w.y;
        } else if (it.handle === 2) {
          nx = w.x;
          nw = right - w.x;
          nh = w.y - s.y;
        } else {
          nw = w.x - s.x;
          nh = w.y - s.y;
        }
        if (e.shiftKey && s.w && s.h) {
          const ratio = Math.abs(s.w / s.h);
          nh = Math.sign(nh || 1) * (Math.abs(nw) / ratio);
        }
        const scaleX = s.w ? nw / s.w : 1;
        const scaleY = s.h ? nh / s.h : 1;
        const points = s.points?.map((p) => ({
          x: p.x * scaleX,
          y: p.y * scaleY,
          p: p.p,
        }));
        this.elements.set(it.id, {
          ...el,
          x: nx,
          y: ny,
          w: nw,
          h: nh,
          ...(points ? { points } : {}),
        });
        this.commitUI();
        break;
      }
      case "rotate": {
        const el = this.elements.get(it.id);
        if (!el) break;
        const angle = Math.atan2(w.y - it.cy, w.x - it.cx) - it.startAngle + it.base;
        const stepped = e.shiftKey ? Math.round(angle / (Math.PI / 12)) * (Math.PI / 12) : angle;
        this.elements.set(it.id, { ...el, angle: stepped });
        this.commitUI();
        break;
      }
      default:
        break;
    }
  }

  pointerUp(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const it = this.interaction;
    this.interaction = { kind: "none" };
    this.snapLines = [];
    this.marquee = null;

    if (it.kind === "lasso") {
      const poly = it.pts;
      this.lasso = null;
      if (poly.length > 2) {
        for (const el of this.getElements()) {
          if (el.locked) continue;
          const b = boxOf(el);
          if (pointInPolygon(b.x + b.w / 2, b.y + b.h / 2, poly)) this.selection.add(el.id);
        }
      }
      this.commitUI();
      return;
    }
    if (it.kind === "draw") {
      const el = it.el;
      const pts = el.points ?? [];
      if (pts.length < 2) {
        this.dirty = true;
        return;
      }
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      el.points = pts.map((p) => ({ x: p.x - minX, y: p.y - minY, p: p.p }));
      el.x += minX;
      el.y += minY;
      el.w = maxX - minX;
      el.h = maxY - minY;
      this.addElement(el);
      return;
    }
    if (it.kind === "shape") {
      const el = it.el;
      if (Math.abs(el.w) < 2 && Math.abs(el.h) < 2) {
        el.w = 160;
        el.h = 120;
        if (el.points)
          el.points = [
            { x: 0, y: 0, p: 1 },
            { x: 160, y: 120, p: 1 },
          ];
      }
      this.addElement(el);
      this.selection = new Set([el.id]);
      this.commitUI();
      return;
    }
    if (it.kind === "connector") {
      const el = it.el;
      const len = Math.hypot(el.w, el.h);
      if (len < 6 && !el.endBind) {
        this.dirty = true;
        return;
      }
      this.addElement(el);
      this.selection = new Set([el.id]);
      this.commitUI();
      return;
    }
    if (it.kind === "move" || it.kind === "resize" || it.kind === "rotate") {
      this.refreshConnectors();
      // finalize as a history entry using current state
      this.transact(() => {}, [...this.selection]);
    }
    this.commitUI();
  }

  /* ------------------------------------------------------------------ */
  /* Smart connectors                                                    */
  /* ------------------------------------------------------------------ */

  /** Recomputes the polyline of a connector element in place. */
  private routeConnectorElement(
    el: WBElement,
    fallbackStart: { x: number; y: number },
    fallbackEnd: { x: number; y: number },
  ) {
    const startEl = el.startBind?.elementId ? this.elements.get(el.startBind.elementId) : null;
    const endEl = el.endBind?.elementId ? this.elements.get(el.endBind.elementId) : null;
    const pts = routeConnector(
      { box: startEl ? boxOf(startEl) : null, point: fallbackStart },
      { box: endEl ? boxOf(endEl) : null, point: fallbackEnd },
      el.routing ?? this.connectorRouting,
    );
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    el.x = first.x;
    el.y = first.y;
    el.w = last.x - first.x;
    el.h = last.y - first.y;
    el.points = pts.map((p) => ({ x: p.x - first.x, y: p.y - first.y, p: 1 }));
  }

  /** Re-routes every bound connector (after a move / resize / delete). */
  refreshConnectors() {
    let changed = false;
    for (const id of this.order) {
      const el = this.elements.get(id);
      if (!el || (!el.startBind?.elementId && !el.endBind?.elementId)) continue;
      const pts = el.points ?? [];
      const startPt = { x: el.x, y: el.y };
      const lastPt = pts[pts.length - 1];
      const endPt = lastPt
        ? { x: el.x + lastPt.x, y: el.y + lastPt.y }
        : { x: el.x + el.w, y: el.y + el.h };
      const next = { ...el, points: pts.map((p) => ({ ...p })) };
      this.routeConnectorElement(next, startPt, endPt);
      this.elements.set(id, next);
      changed = true;
    }
    if (changed) this.dirty = true;
  }

  /** Binds a connector endpoint to an element (or frees it when null). */
  bindConnector(connectorId: string, end: "start" | "end", elementId: string | null) {
    const el = this.elements.get(connectorId);
    if (!el) return;
    const next = { ...el };
    const key = end === "start" ? "startBind" : "endBind";
    if (elementId) next[key] = { elementId };
    else delete next[key];
    this.elements.set(connectorId, next);
    this.refreshConnectors();
    this.commitUI();
  }

  setConnectorRouting(routing: "straight" | "orthogonal" | "curved") {
    this.connectorRouting = routing;
    for (const id of this.selection) {
      const el = this.elements.get(id);
      if (el && (el.type === "arrow" || el.type === "line"))
        this.elements.set(id, { ...el, routing });
    }
    this.refreshConnectors();
    this.commitUI();
  }

  private eraseAt(wx: number, wy: number) {
    const mode = this.eraserMode;
    if (mode === "object" || mode === "stroke" || mode === "smart") {
      const hit = this.elementAt(wx, wy);
      if (!hit || hit.locked) return;
      if (mode === "stroke" && hit.type !== "draw" && hit.type !== "line" && hit.type !== "arrow")
        return;
      if (mode === "smart" && this.selection.size && !this.selection.has(hit.id)) return;
      this.deleteElements([hit.id]);
      return;
    }
    // Pixel / partial eraser: split freehand strokes around the brush tip.
    const r = this.eraserSize / 2;
    const targets = this.getElements().filter(
      (el) =>
        !el.locked &&
        el.type === "draw" &&
        el.points &&
        boxesIntersect({ x: wx - r, y: wy - r, w: r * 2, h: r * 2 }, boxOf(el)),
    );
    if (!targets.length) return;
    const removed: string[] = [];
    const added: WBElement[] = [];
    for (const el of targets) {
      const runs: StrokePoint[][] = [];
      let run: StrokePoint[] = [];
      let cut = false;
      for (const p of el.points!) {
        const inside = Math.hypot(el.x + p.x - wx, el.y + p.y - wy) <= r;
        if (inside) {
          cut = true;
          if (run.length > 1) runs.push(run);
          run = [];
        } else run.push(p);
      }
      if (run.length > 1) runs.push(run);
      if (!cut) continue;
      removed.push(el.id);
      for (const seg of runs) {
        const minX = Math.min(...seg.map((q) => q.x));
        const minY = Math.min(...seg.map((q) => q.y));
        const maxX = Math.max(...seg.map((q) => q.x));
        const maxY = Math.max(...seg.map((q) => q.y));
        added.push({
          ...el,
          id: uid(),
          x: el.x + minX,
          y: el.y + minY,
          w: maxX - minX,
          h: maxY - minY,
          points: seg.map((q) => ({ x: q.x - minX, y: q.y - minY, p: q.p })),
          style: { ...el.style },
          version: 0,
        });
      }
    }
    if (!removed.length) return;
    this.transact(() => {
      removed.forEach((id) => this.elements.delete(id));
      for (const el of added) {
        this.elements.set(el.id, el);
        this.order.push(el.id);
      }
      this.order = this.order.filter((id) => this.elements.has(id));
    }, [...removed, ...added.map((a) => a.id)]);
  }

  wheel(e: WheelEvent, rect: DOMRect) {
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    if (e.ctrlKey || e.metaKey) {
      this.zoomAt(x, y, Math.exp(-dy * 0.0022));
    } else if (e.shiftKey) {
      this.panBy(-dy, 0);
    } else {
      const dx = e.deltaX * (e.deltaMode === 1 ? 16 : 1);
      this.panBy(-dx, -dy);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Commands used by the UI                                             */
  /* ------------------------------------------------------------------ */
  setTool(tool: ToolId) {
    // Any deliberate tool pick counts as user intent: a late board restore
    // must not clobber it.
    this.userDirty = true;
    if (this.editingId) this.stopEditing();
    this.tool = tool;
    this.commitUI();
  }

  setStyle(patch: Partial<ElementStyle>) {
    this.style = { ...this.style, ...patch };
    if (this.selection.size) {
      this.updateElements([...this.selection], (el) => ({
        style: { ...el.style, ...patch },
      }));
    } else this.commitUI();
  }

  selectAll() {
    this.selection = new Set(
      this.getElements()
        .filter((e) => !e.locked)
        .map((e) => e.id),
    );
    this.commitUI();
  }

  clearSelection() {
    this.selection.clear();
    this.commitUI();
  }

  duplicateSelection(offset = 24) {
    const clones: WBElement[] = [];
    this.transact(() => {
      for (const id of this.selection) {
        const el = this.elements.get(id);
        if (!el) continue;
        const clone: WBElement = {
          ...el,
          id: uid(),
          x: el.x + offset,
          y: el.y + offset,
          ...(el.points ? { points: el.points.map((p) => ({ ...p })) } : {}),
          style: { ...el.style },
        };
        this.elements.set(clone.id, clone);
        this.order.push(clone.id);
        clones.push(clone);
      }
    });
    this.selection = new Set(clones.map((c) => c.id));
    this.commitUI();
  }

  deleteSelection() {
    this.deleteElements([...this.selection]);
  }

  toggleLock() {
    const ids = [...this.selection];
    const anyUnlocked = ids.some((id) => !this.elements.get(id)?.locked);
    this.transact(() => {
      for (const id of ids) {
        const el = this.elements.get(id);
        if (el) this.elements.set(id, { ...el, locked: anyUnlocked });
      }
    }, ids);
  }

  reorder(mode: "front" | "back" | "forward" | "backward") {
    const ids = new Set(this.selection);
    if (!ids.size) return;
    this.transact(() => {
      const sel = this.order.filter((id) => ids.has(id));
      const rest = this.order.filter((id) => !ids.has(id));
      if (mode === "front") this.order = [...rest, ...sel];
      else if (mode === "back") this.order = [...sel, ...rest];
      else {
        const dir = mode === "forward" ? 1 : -1;
        const next = [...this.order];
        const indices = dir === 1 ? next.map((_, i) => i).reverse() : next.map((_, i) => i);
        for (const i of indices) {
          const id = next[i]!;
          if (!ids.has(id)) continue;
          const j = i + dir;
          if (j < 0 || j >= next.length || ids.has(next[j]!)) continue;
          next[i] = next[j]!;
          next[j] = id;
        }
        this.order = next;
      }
    }, []);
  }

  align(mode: "left" | "center-x" | "right" | "top" | "center-y" | "bottom") {
    const els = this.getElements().filter((e) => this.selection.has(e.id) && !e.locked);
    if (els.length < 2) return;
    const box = unionBoxes(els.map(boxOf));
    if (!box) return;
    this.transact(
      () => {
        for (const el of els) {
          const b = boxOf(el);
          let dx = 0,
            dy = 0;
          if (mode === "left") dx = box.x - b.x;
          else if (mode === "right") dx = box.x + box.w - (b.x + b.w);
          else if (mode === "center-x") dx = box.x + box.w / 2 - (b.x + b.w / 2);
          else if (mode === "top") dy = box.y - b.y;
          else if (mode === "bottom") dy = box.y + box.h - (b.y + b.h);
          else dy = box.y + box.h / 2 - (b.y + b.h / 2);
          this.elements.set(el.id, { ...el, x: el.x + dx, y: el.y + dy });
        }
      },
      els.map((e) => e.id),
    );
  }

  distribute(axis: "x" | "y") {
    const els = this.getElements()
      .filter((e) => this.selection.has(e.id))
      .sort((a, b) => (axis === "x" ? boxOf(a).x - boxOf(b).x : boxOf(a).y - boxOf(b).y));
    if (els.length < 3) return;
    const first = boxOf(els[0]!);
    const last = boxOf(els[els.length - 1]!);
    const span = axis === "x" ? last.x + last.w - first.x : last.y + last.h - first.y;
    const totalSize = els.reduce((acc, e) => acc + (axis === "x" ? boxOf(e).w : boxOf(e).h), 0);
    const gap = (span - totalSize) / (els.length - 1);
    let cursor = axis === "x" ? first.x : first.y;
    this.transact(
      () => {
        for (const el of els) {
          const b = boxOf(el);
          if (axis === "x") {
            this.elements.set(el.id, { ...el, x: el.x + (cursor - b.x) });
            cursor += b.w + gap;
          } else {
            this.elements.set(el.id, { ...el, y: el.y + (cursor - b.y) });
            cursor += b.h + gap;
          }
        }
      },
      els.map((e) => e.id),
    );
  }

  flip(axis: "x" | "y") {
    const ids = [...this.selection];
    this.transact(() => {
      for (const id of ids) {
        const el = this.elements.get(id);
        if (!el) continue;
        const points = el.points?.map((p) => ({
          x: axis === "x" ? el.w - p.x : p.x,
          y: axis === "y" ? el.h - p.y : p.y,
          p: p.p,
        }));
        this.elements.set(id, { ...el, ...(points ? { points } : {}), angle: -el.angle });
      }
    }, ids);
  }

  nudge(dx: number, dy: number) {
    this.updateElements([...this.selection], (el) => ({ x: el.x + dx, y: el.y + dy }));
  }

  /* Layers ------------------------------------------------------------ */
  addLayer() {
    const layer: Layer = {
      id: uid(),
      name: `Layer ${this.layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
    };
    this.layers = [...this.layers, layer];
    this.activeLayer = layer.id;
    this.commitUI();
  }
  updateLayer(id: string, patch: Partial<Layer>) {
    this.layers = this.layers.map((l) => (l.id === id ? { ...l, ...patch } : l));
    this.commitUI();
  }
  removeLayer(id: string) {
    if (this.layers.length === 1) return;
    const ids = this.getElements()
      .filter((e) => e.layerId === id)
      .map((e) => e.id);
    this.transact(() => {
      ids.forEach((i) => this.elements.delete(i));
      this.order = this.order.filter((i) => this.elements.has(i));
    }, ids);
    this.layers = this.layers.filter((l) => l.id !== id);
    if (this.activeLayer === id) this.activeLayer = this.layers[0]!.id;
    this.commitUI();
  }
  setActiveLayer(id: string) {
    this.activeLayer = id;
    this.commitUI();
  }

  /* Clipboard ---------------------------------------------------------- */
  copySelection(cut = false) {
    this.clipboard = this.getElements()
      .filter((e) => this.selection.has(e.id))
      .map((e) => ({
        ...e,
        style: { ...e.style },
        ...(e.points ? { points: e.points.map((p) => ({ ...p })) } : {}),
      }));
    if (cut) this.deleteSelection();
  }

  paste(offset = 28) {
    if (!this.clipboard.length) return;
    const groupRemap = new Map<string, string>();
    const clones = this.clipboard.map((e) => {
      let groupId = e.groupId;
      if (groupId) {
        if (!groupRemap.has(groupId)) groupRemap.set(groupId, uid());
        groupId = groupRemap.get(groupId)!;
      }
      return {
        ...e,
        id: uid(),
        x: e.x + offset,
        y: e.y + offset,
        style: { ...e.style },
        ...(e.points ? { points: e.points.map((p) => ({ ...p })) } : {}),
        ...(groupId ? { groupId } : {}),
      } as WBElement;
    });
    this.insertElements(clones);
  }

  /* Grouping ------------------------------------------------------------ */
  group() {
    const ids = [...this.selection];
    if (ids.length < 2) return;
    const gid = uid();
    this.updateElements(ids, () => ({ groupId: gid }));
  }

  ungroup() {
    const ids = [...this.selection];
    if (!ids.length) return;
    this.transact(() => {
      for (const id of ids) {
        const el = this.elements.get(id);
        if (!el) continue;
        const { groupId: _drop, ...rest } = el;
        this.elements.set(id, { ...rest, version: el.version + 1 });
      }
    }, ids);
  }

  setEraser(patch: { mode?: EraserMode; size?: number }) {
    if (patch.mode) this.eraserMode = patch.mode;
    if (patch.size) this.eraserSize = patch.size;
    this.commitUI();
  }

  /** Enter inline editing for a text-bearing element. */
  startEditing(id: string) {
    const el = this.elements.get(id);
    if (!el || el.locked) return;
    this.editingId = id;
    this.selection = new Set([id]);
    this.commitUI();
  }

  stopEditing() {
    if (!this.editingId) return;
    const el = this.elements.get(this.editingId);
    this.editingId = null;
    // Only text boxes disappear when left empty; an empty sticky is still a note.
    if (el && el.type === "text" && !(el.text ?? "").trim()) {
      this.deleteElements([el.id]);
      return;
    }
    this.commitUI();
  }

  /* Serialization ------------------------------------------------------ */
  toSnapshot(): BoardSnapshot {
    this.commitPage();
    return {
      id: this.boardId,
      name: this.boardName,
      activePageId: this.activePageId,
      pages: this.pages.map<PageSnapshot>((p) => ({
        id: p.id,
        name: p.name,
        elements: p.order.map((id) => p.elements.get(id)!).filter(Boolean),
        order: [...p.order],
        layers: p.layers,
        viewport: p.viewport,
        background: p.background,
        size: p.size,
      })),
      updatedAt: Date.now(),
    };
  }

  loadSnapshot(snap: BoardSnapshot) {
    this.boardId = snap.id;
    this.boardName = snap.name;

    const fromSnapshot = (ps: PageSnapshot, index: number): PageState => {
      const page = createPage(ps.name || `Page ${index + 1}`, ps.background);
      page.id = ps.id || page.id;
      page.elements = new Map((ps.elements ?? []).map((e) => [e.id, e]));
      page.order = (ps.order ?? []).filter((id) => page.elements.has(id));
      for (const e of ps.elements ?? []) if (!page.order.includes(e.id)) page.order.push(e.id);
      if (ps.layers?.length) page.layers = ps.layers;
      page.activeLayer = page.layers[0]!.id;
      if (ps.viewport) page.viewport = ps.viewport;
      page.size = ps.size ?? { ...DEFAULT_PAGE_SIZE };
      return page;
    };

    let pages: PageState[];
    if (snap.pages?.length) {
      pages = snap.pages.map(fromSnapshot);
    } else {
      // legacy v1 single-page board
      pages = [
        fromSnapshot(
          {
            id: uid(),
            name: "Page 1",
            elements: snap.elements ?? [],
            order: snap.order ?? [],
            layers: snap.layers ?? [],
            viewport: snap.viewport ?? { x: -400, y: -300, zoom: 1 },
            background: { grid: "dots" },
            size: { ...DEFAULT_PAGE_SIZE },
          },
          0,
        ),
      ];
    }

    this.pages = pages;
    this.activePageId = pages.find((p) => p.id === snap.activePageId)?.id ?? pages[0]!.id;
    this.selection.clear();
    this.editingId = null;
    this.adoptPage(this.activePage);
    this.fitPage();
    this.hydrated = true;
    this.commitUI();
  }

  /** Insert elements (import/templates/paste) as one undoable action. */
  insertElements(els: WBElement[], select = true) {
    this.transact(
      () => {
        for (const el of els) {
          this.elements.set(el.id, el);
          this.order.push(el.id);
        }
      },
      els.map((e) => e.id),
    );
    if (select) this.selection = new Set(els.map((e) => e.id));
    this.commitUI();
  }

  screenToWorld(sx: number, sy: number) {
    return screenToWorld(this.viewport, sx, sy);
  }
  worldToScreen(wx: number, wy: number) {
    return worldToScreen(this.viewport, wx, wy);
  }
}
