import type { Box, StrokePoint, WBElement } from "./types";

export const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);

export function boxOf(el: WBElement): Box {
  const x = Math.min(el.x, el.x + el.w);
  const y = Math.min(el.y, el.y + el.h);
  return { x, y, w: Math.abs(el.w), h: Math.abs(el.h) };
}

export function expand(b: Box, pad: number): Box {
  return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
}

export function boxesIntersect(a: Box, b: Box) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

export function boxContains(outer: Box, inner: Box) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export function unionBoxes(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Rotate a point around a center by `angle` radians. */
export function rotatePoint(px: number, py: number, cx: number, cy: number, angle: number) {
  if (!angle) return { x: px, y: py };
  const s = Math.sin(angle),
    c = Math.cos(angle);
  const dx = px - cx,
    dy = py - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

/** Convert a world point into an element's un-rotated local frame. */
export function toLocal(el: WBElement, px: number, py: number) {
  const b = boxOf(el);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return rotatePoint(px, py, cx, cy, -el.angle);
}

export function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const dx = x2 - x1,
    dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
  const ex = x1 + t * dx,
    ey = y1 + t * dy;
  return Math.hypot(px - ex, py - ey);
}

/** Hit test in world space, tolerance in world units. */
export function hitTest(el: WBElement, px: number, py: number, tol: number) {
  const l = toLocal(el, px, py);
  const b = boxOf(el);
  if (el.type === "draw" || el.type === "line" || el.type === "arrow") {
    const pts = strokeWorldPoints(el);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const c = pts[i]!;
      if (distToSegment(l.x, l.y, a.x, a.y, c.x, c.y) <= tol + el.style.strokeWidth / 2)
        return true;
    }

    return false;
  }
  const inside =
    l.x >= b.x - tol && l.x <= b.x + b.w + tol && l.y >= b.y - tol && l.y <= b.y + b.h + tol;
  if (!inside) return false;
  if (el.style.fill !== "transparent" && el.style.fillStyle !== "none") return true;
  if (el.type === "text" || el.type === "sticky" || el.type === "image") return true;
  // hollow shape: only near the border
  const innerOk =
    l.x > b.x + tol + el.style.strokeWidth &&
    l.x < b.x + b.w - tol - el.style.strokeWidth &&
    l.y > b.y + tol + el.style.strokeWidth &&
    l.y < b.y + b.h - tol - el.style.strokeWidth;
  return !innerOk;
}

/** Freehand/line points resolved into (un-rotated) world coordinates. */
export function strokeWorldPoints(el: WBElement): StrokePoint[] {
  const pts = el.points ?? [];
  return pts.map((p) => ({ x: el.x + p.x, y: el.y + p.y, p: p.p }));
}

/** Chaikin-style smoothing used by the stabilizer. */
export function smoothPoints(points: StrokePoint[], strength: number) {
  if (points.length < 3 || strength <= 0) return points;
  const out: StrokePoint[] = [points[0]!];
  const t = clamp(strength, 0, 1) * 0.25;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!,
      b = points[i]!,
      c = points[i + 1]!;
    out.push({
      x: b.x + (a.x + c.x - 2 * b.x) * t,
      y: b.y + (a.y + c.y - 2 * b.y) * t,
      p: b.p,
    });
  }
  out.push(points[points.length - 1]!);

  return out;
}

/** Deterministic pseudo-random generator so re-renders are stable. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** Ray-casting point-in-polygon test (world space). */
export function pointInPolygon(x: number, y: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1e-9) + a.x)
      inside = !inside;
  }
  return inside;
}

/* -------------------------------------------------------------------- */
/* Connector routing                                                     */
/* -------------------------------------------------------------------- */

export type Pt = { x: number; y: number };

/** Point on the border of `b` in the direction of (tx, ty). */
export function anchorOn(b: Box, tx: number, ty: number): Pt {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const hw = Math.max(b.w, 1) / 2;
  const hh = Math.max(b.h, 1) / 2;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/** Orthogonal (elbow) polyline between two points. */
function elbow(a: Pt, b: Pt): Pt[] {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx < 1 || dy < 1) return [a, b];
  return dx > dy
    ? [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b]
    : [a, { x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }, b];
}

/** Sampled cubic curve between two points (bulges along the dominant axis). */
function curve(a: Pt, b: Pt): Pt[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const k = 0.45;
  const c1 = horizontal ? { x: a.x + dx * k, y: a.y } : { x: a.x, y: a.y + dy * k };
  const c2 = horizontal ? { x: b.x - dx * k, y: b.y } : { x: b.x, y: b.y - dy * k };
  const out: Pt[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    });
  }
  return out;
}

/**
 * Computes the world-space polyline for a connector between two anchors.
 * `from` / `to` are boxes when the endpoint is bound to an element.
 */
export function routeConnector(
  from: { box?: Box | null; point: Pt },
  to: { box?: Box | null; point: Pt },
  routing: "straight" | "orthogonal" | "curved" = "orthogonal",
): Pt[] {
  const aCenter = from.box
    ? { x: from.box.x + from.box.w / 2, y: from.box.y + from.box.h / 2 }
    : from.point;
  const bCenter = to.box ? { x: to.box.x + to.box.w / 2, y: to.box.y + to.box.h / 2 } : to.point;
  const a = from.box ? anchorOn(expand(from.box, 4), bCenter.x, bCenter.y) : from.point;
  const b = to.box ? anchorOn(expand(to.box, 4), aCenter.x, aCenter.y) : to.point;
  if (routing === "straight") return [a, b];
  if (routing === "curved") return curve(a, b);
  return elbow(a, b);
}
