/**
 * Core document model for the whiteboard.
 * Everything on the canvas is a `WBElement`, stored in a `Scene`.
 */

export type ElementType =
  | "draw"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "star"
  | "text"
  | "sticky"
  | "image";

export type FillStyle = "solid" | "hachure" | "none";
export type StrokeStyle = "solid" | "dashed" | "dotted";
export type BrushKind = "pen" | "pencil" | "marker" | "highlighter" | "calligraphy" | "neon";

export interface ElementStyle {
  stroke: string;
  fill: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  opacity: number;
  roughness: number;
  radius: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  textAlign: "left" | "center" | "right";
  brush: BrushKind;
  smoothing: number;
  /** Id of a `BrushPreset` from `brushes.ts` (drives freehand rendering). */
  brushPreset?: string;
  /** Extra line height multiplier for text/sticky content. */
  lineHeight?: number;
  /** Inner padding for text/sticky content. */
  padding?: number;
  letterSpacing?: number;
  italic?: boolean;
  underline?: boolean;
  listStyle?: "none" | "bullet" | "number";
}

export type EraserMode = "object" | "stroke" | "pixel" | "smart";

export interface StrokePoint {
  x: number;
  y: number;
  /** Normalized pressure 0..1 (simulated from velocity when unavailable). */
  p: number;
  /** Optional timestamp (ms) — used by the laser pointer trail. */
  t?: number;
}

/** Connector endpoint: bound to an element, or a free world point. */
export interface Binding {
  elementId?: string;
  /** Normalized anchor inside the element (0..1); omitted = auto nearest edge. */
  ax?: number;
  ay?: number;
}

export type ConnectorRouting = "straight" | "orthogonal" | "curved";

export interface WBElement {
  id: string;
  type: ElementType;
  /** Axis-aligned position/size in world (scene) space. */
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  layerId: string;
  locked: boolean;
  style: ElementStyle;
  /** Freehand strokes: local-space points relative to (x, y). */
  points?: StrokePoint[];
  /** Text / sticky content. */
  text?: string;
  /** Image data URL. */
  src?: string;
  seed: number;
  version: number;
  /** Elements sharing a groupId are selected and transformed together. */
  groupId?: string;
  /** Connector bindings (line / arrow elements only). */
  startBind?: Binding;
  endBind?: Binding;
  routing?: ConnectorRouting;
  /** Label rendered at the middle of a connector. */
  label?: string;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export type GridMode = "none" | "dots" | "lines";

/** Per-page paper settings. */
export interface PageBackground {
  /** Canvas colour override; falls back to the theme colour when absent. */
  color?: string;
  grid: GridMode;
}

/** A serialized page inside a board. */
export interface PageSnapshot {
  id: string;
  name: string;
  elements: WBElement[];
  order: string[];
  layers: Layer[];
  viewport: Viewport;
  background: PageBackground;
  /** Fixed page dimensions in world units, or null for an infinite canvas. */
  size: { w: number; h: number } | null;
}

export interface BoardSnapshot {
  id: string;
  name: string;
  pages: PageSnapshot[];
  activePageId: string;
  updatedAt: number;
  /** Legacy single-page fields (v1 boards). */
  elements?: WBElement[];
  order?: string[];
  layers?: Layer[];
  viewport?: Viewport;
}

export type ToolId =
  | "select"
  | "lasso"
  | "hand"
  | "draw"
  | "eraser"
  | "rect"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "star"
  | "line"
  | "arrow"
  | "connector"
  | "text"
  | "sticky"
  | "laser";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
