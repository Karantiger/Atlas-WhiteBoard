import { resolvePreset } from "./brushes";
import { boxOf, rng, strokeWorldPoints } from "./geometry";
import type { Box, StrokePoint, WBElement, Viewport } from "./types";

export interface RenderTheme {
  canvas: string;
  grid: string;
  gridStrong: string;
  selection: string;
  selectionFill: string;
  text: string;
}

export interface RenderOptions {
  viewport: Viewport;
  width: number;
  height: number;
  dpr: number;
  theme: RenderTheme;
  gridMode: "none" | "dots" | "lines";
  selection: Set<string>;
  /** Element currently being drawn (not yet committed). */
  preview?: WBElement | null;
  marquee?: Box | null;
  laser?: StrokePoint[];
  /** Laser trail point lifetime in ms (drives the fade). */
  laserLifetime?: number;
  /** Optional page paper rectangle drawn behind the elements. */
  pageBox?: { w: number; h: number } | null;
  pageColor?: string | undefined;

  lasso?: StrokePoint[];
  snapLines?: { x?: number; y?: number }[];
}

const imageCache = new Map<string, HTMLImageElement>();

export function getImage(src: string, onLoad: () => void) {
  const cached = imageCache.get(src);
  if (cached) return cached.complete ? cached : null;
  if (typeof Image === "undefined") return null;
  const img = new Image();
  img.onload = onLoad;
  img.src = src;
  imageCache.set(src, img);
  return null;
}

/** World -> screen helpers. */
export const worldToScreen = (v: Viewport, x: number, y: number) => ({
  x: (x - v.x) * v.zoom,
  y: (y - v.y) * v.zoom,
});

export const screenToWorld = (v: Viewport, x: number, y: number) => ({
  x: x / v.zoom + v.x,
  y: y / v.zoom + v.y,
});

export function visibleWorldBox(v: Viewport, width: number, height: number): Box {
  const a = screenToWorld(v, 0, 0);
  const b = screenToWorld(v, width, height);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D, el: WBElement) {
  const s = el.style;
  ctx.strokeStyle = s.stroke;
  ctx.lineWidth = s.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.strokeStyle === "dashed") ctx.setLineDash([s.strokeWidth * 3, s.strokeWidth * 2.5]);
  else if (s.strokeStyle === "dotted") ctx.setLineDash([0.01, s.strokeWidth * 2.2]);
  else ctx.setLineDash([]);
}

function hachureFill(ctx: CanvasRenderingContext2D, b: Box, el: WBElement) {
  const gap = Math.max(5, el.style.strokeWidth * 3);
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x, b.y, b.w, b.h);
  ctx.clip();
  ctx.strokeStyle = el.style.fill;
  ctx.lineWidth = Math.max(1, el.style.strokeWidth * 0.6);
  ctx.setLineDash([]);
  ctx.beginPath();
  for (let i = -b.h; i < b.w; i += gap) {
    ctx.moveTo(b.x + i, b.y + b.h);
    ctx.lineTo(b.x + i + b.h, b.y);
  }
  ctx.stroke();
  ctx.restore();
}

function pathForShape(ctx: CanvasRenderingContext2D, el: WBElement, b: Box) {
  const { x, y, w, h } = b;
  ctx.beginPath();
  switch (el.type) {
    case "rect": {
      const r = Math.min(el.style.radius, w / 2, h / 2);
      ctx.roundRect(x, y, w, h, r);
      break;
    }
    case "ellipse":
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case "diamond":
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      break;
    case "triangle":
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    case "star": {
      const cx = x + w / 2,
        cy = y + h / 2;
      const outerX = w / 2,
        outerY = h / 2;
      for (let i = 0; i < 10; i++) {
        const ang = (Math.PI / 5) * i - Math.PI / 2;
        const rx = i % 2 === 0 ? outerX : outerX * 0.42;
        const ry = i % 2 === 0 ? outerY : outerY * 0.42;
        const px = cx + Math.cos(ang) * rx;
        const py = cy + Math.sin(ang) * ry;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    default:
      ctx.rect(x, y, w, h);
  }
}

function drawFreehand(ctx: CanvasRenderingContext2D, el: WBElement) {
  const pts = strokeWorldPoints(el);
  if (!pts.length) return;
  const s = el.style;
  const preset = resolvePreset(s);
  const base = s.strokeWidth * preset.weight;
  const rand = rng(el.seed);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);
  ctx.strokeStyle = s.stroke;
  ctx.fillStyle = s.stroke;

  if (preset.kind === "highlighter") {
    ctx.globalCompositeOperation = "multiply";
    ctx.lineCap = "butt";
  }
  if (preset.kind === "neon") {
    ctx.shadowBlur = base * 4;
    ctx.shadowColor = s.stroke;
  }

  // Single tap -> dot
  if (pts.length === 1) {
    const p = pts[0]!;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, base / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const n = pts.length;
  const taperLen = Math.max(2, Math.round(n * 0.18));
  const widthAt = (i: number, p: StrokePoint, prev: StrokePoint) => {
    let w = base * (1 - preset.pressure + preset.pressure * (0.35 + p.p * 0.9));
    if (preset.kind === "calligraphy" || preset.kind === "chisel") {
      const nib = preset.kind === "chisel" ? Math.PI / 6 : Math.PI / 4;
      const ang = Math.atan2(p.y - prev.y, p.x - prev.x);
      w = base * (0.18 + Math.abs(Math.cos(ang - nib)) * 1.35);
    } else if (preset.kind === "water") {
      const speed = Math.hypot(p.x - prev.x, p.y - prev.y);
      w = base * (0.4 + Math.min(1.1, 1.3 / (1 + speed * 0.12)) * (0.5 + p.p * 0.8));
    } else if (preset.kind === "highlighter") {
      w = base;
    }
    if (preset.taper > 0) {
      const head = Math.min(1, i / taperLen);
      const tail = Math.min(1, (n - 1 - i) / taperLen);
      const t = Math.min(head, tail);
      w *= 1 - preset.taper + preset.taper * t;
    }
    return Math.max(0.35, w);
  };

  // Smooth interpolated spine (quadratic midpoints) drawn as tapered
  // variable-width segments -> no jagged corners at any zoom level.
  const drawSpine = (widthScale: number, alphaScale: number) => {
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * alphaScale;
    for (let i = 1; i < n; i++) {
      const prev = pts[i - 1]!;
      const cur = pts[i]!;
      const next = pts[i + 1] ?? cur;
      const w = widthAt(i, cur, prev) * widthScale;
      ctx.lineWidth = w;
      ctx.beginPath();
      const mx0 = (prev.x + cur.x) / 2;
      const my0 = (prev.y + cur.y) / 2;
      const mx1 = (cur.x + next.x) / 2;
      const my1 = (cur.y + next.y) / 2;
      ctx.moveTo(i === 1 ? prev.x : mx0, i === 1 ? prev.y : my0);
      ctx.quadraticCurveTo(cur.x, cur.y, i === n - 1 ? cur.x : mx1, i === n - 1 ? cur.y : my1);
      ctx.stroke();
    }
    ctx.globalAlpha = a0;
  };

  switch (preset.kind) {
    case "soft": {
      drawSpine(1.9, 0.16);
      drawSpine(1.35, 0.24);
      drawSpine(1, 0.9);
      break;
    }
    case "airbrush": {
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * 0.1;
      for (let i = 1; i < n; i++) {
        const p = pts[i]!;
        const prev = pts[i - 1]!;
        const w = widthAt(i, p, prev);
        const dots = 8;
        for (let d = 0; d < dots; d++) {
          const t = rand();
          const ang = rand() * Math.PI * 2;
          const rr = Math.sqrt(rand()) * w;
          ctx.beginPath();
          ctx.arc(
            prev.x + (p.x - prev.x) * t + Math.cos(ang) * rr,
            prev.y + (p.y - prev.y) * t + Math.sin(ang) * rr,
            Math.max(0.4, w * 0.12),
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
      ctx.globalAlpha = a0;
      break;
    }
    case "pencil":
    case "chalk": {
      drawSpine(1, preset.kind === "chalk" ? 0.55 : 0.85);
      const passes = preset.kind === "chalk" ? 4 : 2;
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * (preset.kind === "chalk" ? 0.28 : 0.35);
      for (let i = 1; i < n; i++) {
        const prev = pts[i - 1]!;
        const cur = pts[i]!;
        const w = widthAt(i, cur, prev);
        for (let g = 0; g < passes; g++) {
          const jx = (rand() - 0.5) * w * 2.2 * preset.grain;
          const jy = (rand() - 0.5) * w * 2.2 * preset.grain;
          ctx.lineWidth = Math.max(0.3, w * (0.2 + rand() * 0.35));
          ctx.beginPath();
          ctx.moveTo(prev.x + jx, prev.y + jy);
          ctx.lineTo(cur.x + jx, cur.y + jy);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = a0;
      break;
    }
    case "water": {
      drawSpine(1.25, 0.28);
      drawSpine(1, 0.75);
      break;
    }
    default:
      drawSpine(1, 1);
  }

  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  size: number,
) {
  const ang = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - size * Math.cos(ang - Math.PI / 7), toY - size * Math.sin(ang - Math.PI / 7));
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - size * Math.cos(ang + Math.PI / 7), toY - size * Math.sin(ang + Math.PI / 7));
  ctx.stroke();
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(" ")) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else current = test;
    }
    lines.push(current);
  }
  return lines;
}

function drawText(ctx: CanvasRenderingContext2D, el: WBElement, b: Box, padDefault: number) {
  const s = el.style;
  if (!el.text) return;
  const pad = s.padding ?? padDefault;
  ctx.save();
  ctx.fillStyle = s.stroke;
  ctx.font = `${s.italic ? "italic " : ""}${s.fontWeight} ${s.fontSize}px ${s.fontFamily}`;
  ctx.textBaseline = "top";
  ctx.textAlign = s.textAlign;
  if (s.letterSpacing) {
    // Supported in modern Chromium/Safari; ignored elsewhere.
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
      `${s.letterSpacing}px`;
  }
  const maxWidth = Math.max(16, b.w - pad * 2);
  const source = (el.text ?? "").split("\n");
  const listed =
    s.listStyle === "bullet"
      ? source.map((l) => (l.trim() ? `•  ${l}` : l))
      : s.listStyle === "number"
        ? source.map((l, i) => (l.trim() ? `${i + 1}.  ${l}` : l))
        : source;
  const lines = wrapText(ctx, listed.join("\n"), maxWidth);
  const lh = s.fontSize * (s.lineHeight ?? 1.35);
  const tx =
    s.textAlign === "center"
      ? b.x + b.w / 2
      : s.textAlign === "right"
        ? b.x + b.w - pad
        : b.x + pad;
  lines.forEach((line, i) => {
    const y = b.y + pad + i * lh;
    ctx.fillText(line, tx, y);
    if (s.underline && line) {
      const w = ctx.measureText(line).width;
      const x0 = s.textAlign === "center" ? tx - w / 2 : s.textAlign === "right" ? tx - w : tx;
      ctx.fillRect(x0, y + s.fontSize * 1.08, w, Math.max(1, s.fontSize * 0.06));
    }
  });
  ctx.restore();
}

/** Number of wrapped lines a text/sticky element needs at its width. */
export function measureTextHeight(
  ctx: CanvasRenderingContext2D,
  el: WBElement,
  width: number,
): number {
  const s = el.style;
  const pad = s.padding ?? (el.type === "sticky" ? 14 : 0);
  ctx.save();
  ctx.font = `${s.italic ? "italic " : ""}${s.fontWeight} ${s.fontSize}px ${s.fontFamily}`;
  const lines = wrapText(ctx, el.text ?? "", Math.max(16, width - pad * 2));
  ctx.restore();
  return pad * 2 + Math.max(1, lines.length) * s.fontSize * (s.lineHeight ?? 1.35);
}

export function drawElement(ctx: CanvasRenderingContext2D, el: WBElement, onImageLoad: () => void) {
  const b = boxOf(el);
  ctx.save();
  ctx.globalAlpha = el.style.opacity;
  if (el.angle) {
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    ctx.rotate(el.angle);
    ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
  }

  switch (el.type) {
    case "draw":
      drawFreehand(ctx, el);
      break;
    case "line":
    case "arrow": {
      const pts = strokeWorldPoints(el);
      const a = pts[0];
      const c = pts[pts.length - 1];
      if (a && c) {
        applyStrokeStyle(ctx, el);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        if (pts.length > 2) {
          // routed connector: rounded polyline through the elbow points
          const r = 10;
          for (let i = 1; i < pts.length - 1; i++) {
            const prev = pts[i - 1]!;
            const cur = pts[i]!;
            const next = pts[i + 1]!;
            const d1 = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
            const d2 = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
            const t1 = Math.min(r, d1 / 2) / d1;
            const t2 = Math.min(r, d2 / 2) / d2;
            ctx.lineTo(cur.x + (prev.x - cur.x) * t1, cur.y + (prev.y - cur.y) * t1);
            ctx.quadraticCurveTo(
              cur.x,
              cur.y,
              cur.x + (next.x - cur.x) * t2,
              cur.y + (next.y - cur.y) * t2,
            );
          }
          ctx.lineTo(c.x, c.y);
        } else {
          ctx.lineTo(c.x, c.y);
        }
        ctx.stroke();
        if (el.type === "arrow") {
          ctx.setLineDash([]);
          const tail = pts[pts.length - 2] ?? a;
          drawArrowHead(ctx, tail.x, tail.y, c.x, c.y, Math.max(10, el.style.strokeWidth * 4));
        }
        if (el.label) {
          const mid = pts[Math.floor(pts.length / 2)] ?? c;
          ctx.save();
          ctx.font = `${el.style.fontSize * 0.8}px ${el.style.fontFamily}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const pad = 4;
          const tw = ctx.measureText(el.label).width;
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(mid.x - tw / 2 - pad, mid.y - 9, tw + pad * 2, 18);
          ctx.fillStyle = el.style.stroke;
          ctx.fillText(el.label, mid.x, mid.y);
          ctx.restore();
        }
      }
      break;
    }

    case "sticky": {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.28)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = el.style.fill;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 6);
      ctx.fill();
      ctx.restore();
      drawText(ctx, el, b, 14);
      break;
    }
    case "text":
      drawText(ctx, el, b, 0);
      break;
    case "image": {
      const img = el.src ? getImage(el.src, onImageLoad) : null;
      if (img) ctx.drawImage(img, b.x, b.y, b.w, b.h);
      else {
        ctx.fillStyle = "rgba(125,125,135,0.25)";
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
      break;
    }
    default: {
      if (el.style.fillStyle === "solid" && el.style.fill !== "transparent") {
        ctx.fillStyle = el.style.fill;
        pathForShape(ctx, el, b);
        ctx.fill();
      } else if (el.style.fillStyle === "hachure" && el.style.fill !== "transparent") {
        hachureFill(ctx, b, el);
      }
      applyStrokeStyle(ctx, el);
      pathForShape(ctx, el, b);
      ctx.stroke();
      if (el.text) drawText(ctx, el, b, 10);
    }
  }
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, o: RenderOptions) {
  if (o.gridMode === "none") return;
  const v = o.viewport;
  let step = 20;
  while (step * v.zoom < 14) step *= 5;
  while (step * v.zoom > 140) step /= 5;
  const world = visibleWorldBox(v, o.width, o.height);
  const startX = Math.floor(world.x / step) * step;
  const startY = Math.floor(world.y / step) * step;

  ctx.save();
  if (o.gridMode === "dots") {
    ctx.fillStyle = o.theme.grid;
    const r = Math.min(1.6, Math.max(0.6, 1 * v.zoom));
    for (let x = startX; x < world.x + world.w + step; x += step) {
      for (let y = startY; y < world.y + world.h + step; y += step) {
        const s = worldToScreen(v, x, y);
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    ctx.lineWidth = 1;
    ctx.strokeStyle = o.theme.grid;
    ctx.beginPath();
    for (let x = startX; x < world.x + world.w + step; x += step) {
      const s = worldToScreen(v, x, 0);
      ctx.moveTo(Math.round(s.x) + 0.5, 0);
      ctx.lineTo(Math.round(s.x) + 0.5, o.height);
    }
    for (let y = startY; y < world.y + world.h + step; y += step) {
      const s = worldToScreen(v, 0, y);
      ctx.moveTo(0, Math.round(s.y) + 0.5);
      ctx.lineTo(o.width, Math.round(s.y) + 0.5);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export interface SceneRenderInput extends RenderOptions {
  elements: WBElement[];
}

/** Draws the full frame: grid, culled elements, selection chrome, overlays. */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  input: SceneRenderInput,
  onImageLoad: () => void,
): number {
  const { viewport: v, width, height, dpr, theme } = input;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = input.pageColor ?? theme.canvas;
  ctx.fillRect(0, 0, width, height);

  // The page fills the viewport, so grid + content are clipped to the sheet.
  ctx.save();
  if (input.pageBox) {
    const tl = worldToScreen(v, 0, 0);
    ctx.beginPath();
    ctx.rect(tl.x, tl.y, input.pageBox.w * v.zoom, input.pageBox.h * v.zoom);
    ctx.clip();
    ctx.fillStyle = input.pageColor ?? theme.canvas;
    ctx.fill();
  }

  drawGrid(ctx, input);

  ctx.save();
  ctx.scale(v.zoom, v.zoom);
  ctx.translate(-v.x, -v.y);


  let drawn = 0;
  for (const el of input.elements) {
    drawElement(ctx, el, onImageLoad);
    drawn++;
  }
  if (input.preview) {
    drawElement(ctx, input.preview, onImageLoad);
    drawn++;
  }
  ctx.restore();
  ctx.restore(); // page clip


  // Selection chrome (screen space so handles stay constant size)
  const sel = input.elements.filter((e) => input.selection.has(e.id));
  if (sel.length) {
    ctx.save();
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1.5;
    for (const el of sel) {
      const b = boxOf(el);
      const tl = worldToScreen(v, b.x, b.y);
      const w = b.w * v.zoom;
      const h = b.h * v.zoom;
      ctx.save();
      if (el.angle) {
        ctx.translate(tl.x + w / 2, tl.y + h / 2);
        ctx.rotate(el.angle);
        ctx.translate(-(tl.x + w / 2), -(tl.y + h / 2));
      }
      ctx.setLineDash(sel.length > 1 ? [4, 3] : []);
      ctx.strokeRect(tl.x - 1, tl.y - 1, w + 2, h + 2);
      ctx.restore();
    }
    if (sel.length === 1) {
      const el = sel[0]!;
      const b = boxOf(el);
      const tl = worldToScreen(v, b.x, b.y);
      const w = b.w * v.zoom,
        h = b.h * v.zoom;
      ctx.setLineDash([]);
      ctx.save();
      if (el.angle) {
        ctx.translate(tl.x + w / 2, tl.y + h / 2);
        ctx.rotate(el.angle);
        ctx.translate(-(tl.x + w / 2), -(tl.y + h / 2));
      }
      const handles: [number, number][] = [
        [tl.x, tl.y],
        [tl.x + w, tl.y],
        [tl.x, tl.y + h],
        [tl.x + w, tl.y + h],
      ];
      ctx.fillStyle = theme.canvas;
      for (const [hx, hy] of handles) {
        ctx.beginPath();
        ctx.rect(hx - 4, hy - 4, 8, 8);
        ctx.fill();
        ctx.stroke();
      }
      // rotation handle
      ctx.beginPath();
      ctx.moveTo(tl.x + w / 2, tl.y);
      ctx.lineTo(tl.x + w / 2, tl.y - 22);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tl.x + w / 2, tl.y - 26, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  if (input.marquee) {
    const m = input.marquee;
    const tl = worldToScreen(v, m.x, m.y);
    ctx.save();
    ctx.fillStyle = theme.selectionFill;
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1;
    ctx.fillRect(tl.x, tl.y, m.w * v.zoom, m.h * v.zoom);
    ctx.strokeRect(tl.x, tl.y, m.w * v.zoom, m.h * v.zoom);
    ctx.restore();
  }

  if (input.snapLines?.length) {
    ctx.save();
    ctx.strokeStyle = "#f43f5e";
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const l of input.snapLines) {
      if (l.x !== undefined) {
        const s = worldToScreen(v, l.x, 0);
        ctx.moveTo(s.x, 0);
        ctx.lineTo(s.x, height);
      }
      if (l.y !== undefined) {
        const s = worldToScreen(v, 0, l.y);
        ctx.moveTo(0, s.y);
        ctx.lineTo(width, s.y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  if (input.lasso && input.lasso.length > 1) {
    ctx.save();
    ctx.strokeStyle = theme.selection;
    ctx.fillStyle = theme.selectionFill;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    input.lasso.forEach((p, i) => {
      const s = worldToScreen(v, p.x, p.y);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (input.laser?.length) {
    // Time-based fade: each point dies `lifetime` ms after it was drawn, so
    // the trail shrinks at a constant speed regardless of frame rate.
    const now = performance.now();
    const lifetime = input.laserLifetime ?? 900;
    const pts = input.laser;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "lighter";
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const c = pts[i]!;
      const age = now - (c.t ?? now);
      const life = Math.max(0, 1 - age / lifetime);
      if (life <= 0) continue;
      const s1 = worldToScreen(v, a.x, a.y);
      const s2 = worldToScreen(v, c.x, c.y);
      // outer glow
      ctx.globalAlpha = life * 0.35;
      ctx.strokeStyle = "#ff2d55";
      ctx.shadowColor = "#ff2d55";
      ctx.shadowBlur = 26 * life;
      ctx.lineWidth = 12 * life + 3;
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
      // hot core
      ctx.globalAlpha = life;
      ctx.shadowBlur = 10 * life;
      ctx.strokeStyle = "#fff1f2";
      ctx.lineWidth = 3.2 * life + 1;
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
    }
    // bright dot at the tip
    const tip = pts[pts.length - 1];
    if (tip) {
      const s = worldToScreen(v, tip.x, tip.y);
      ctx.globalAlpha = 1;
      ctx.shadowColor = "#ff2d55";
      ctx.shadowBlur = 30;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  return drawn;
}
