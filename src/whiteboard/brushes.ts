import type { BrushKind, ElementStyle } from "./types";

/**
 * Professional pen / pencil / marker / brush library.
 * A preset is a named bundle of rendering parameters; the renderer is
 * driven entirely by `BrushPreset`, so adding a tool never touches the
 * drawing loop.
 */

export type BrushFamily = "pencil" | "pen" | "marker" | "brush";

/** How the stroke is rasterized. */
export type RenderKind =
  | "solid"
  | "pencil"
  | "calligraphy"
  | "chisel"
  | "highlighter"
  | "neon"
  | "airbrush"
  | "chalk"
  | "water"
  | "soft";

export interface BrushPreset {
  id: string;
  name: string;
  family: BrushFamily;
  kind: RenderKind;
  /** Default stroke width in world units. */
  size: number;
  opacity: number;
  /** 0..1 input smoothing / stabilizer strength. */
  smoothing: number;
  /** 0..1 amount of width modulation from pressure. */
  pressure: number;
  /** 0..1 how much the ends thin out. */
  taper: number;
  /** 0..1 grain / scatter intensity. */
  grain: number;
  /** Multiplier applied to the base width. */
  weight: number;
  dash?: "solid" | "dashed" | "dotted";
}

export const BRUSH_PRESETS: BrushPreset[] = [
  // ---- Pencils -----------------------------------------------------
  {
    id: "pencil-hb",
    name: "HB Pencil",
    family: "pencil",
    kind: "pencil",
    size: 2,
    opacity: 0.85,
    smoothing: 0.5,
    pressure: 0.5,
    taper: 0.35,
    grain: 0.35,
    weight: 1,
  },
  {
    id: "pencil-2b",
    name: "2B Pencil",
    family: "pencil",
    kind: "pencil",
    size: 2.6,
    opacity: 0.9,
    smoothing: 0.5,
    pressure: 0.6,
    taper: 0.35,
    grain: 0.5,
    weight: 1.15,
  },
  {
    id: "pencil-4b",
    name: "4B Pencil",
    family: "pencil",
    kind: "pencil",
    size: 3.4,
    opacity: 0.95,
    smoothing: 0.45,
    pressure: 0.7,
    taper: 0.3,
    grain: 0.7,
    weight: 1.3,
  },
  {
    id: "pencil-6b",
    name: "6B Pencil",
    family: "pencil",
    kind: "pencil",
    size: 4.4,
    opacity: 1,
    smoothing: 0.4,
    pressure: 0.8,
    taper: 0.25,
    grain: 0.9,
    weight: 1.5,
  },
  {
    id: "pencil-mech",
    name: "Mechanical",
    family: "pencil",
    kind: "solid",
    size: 1.2,
    opacity: 0.95,
    smoothing: 0.7,
    pressure: 0.15,
    taper: 0.1,
    grain: 0.05,
    weight: 1,
  },
  {
    id: "pencil-sketch",
    name: "Sketch",
    family: "pencil",
    kind: "chalk",
    size: 2.8,
    opacity: 0.7,
    smoothing: 0.3,
    pressure: 0.6,
    taper: 0.4,
    grain: 1,
    weight: 1.1,
  },

  // ---- Pens --------------------------------------------------------
  {
    id: "pen-ball",
    name: "Ball Pen",
    family: "pen",
    kind: "solid",
    size: 2,
    opacity: 1,
    smoothing: 0.6,
    pressure: 0.3,
    taper: 0.2,
    grain: 0,
    weight: 1,
  },
  {
    id: "pen-gel",
    name: "Gel Pen",
    family: "pen",
    kind: "solid",
    size: 3,
    opacity: 1,
    smoothing: 0.65,
    pressure: 0.45,
    taper: 0.3,
    grain: 0,
    weight: 1.1,
  },
  {
    id: "pen-fountain",
    name: "Fountain Pen",
    family: "pen",
    kind: "solid",
    size: 3.2,
    opacity: 1,
    smoothing: 0.7,
    pressure: 0.85,
    taper: 0.7,
    grain: 0,
    weight: 1.2,
  },
  {
    id: "pen-fineliner",
    name: "Fineliner",
    family: "pen",
    kind: "solid",
    size: 1.6,
    opacity: 1,
    smoothing: 0.75,
    pressure: 0.05,
    taper: 0.05,
    grain: 0,
    weight: 1,
  },
  {
    id: "pen-calligraphy",
    name: "Calligraphy",
    family: "pen",
    kind: "calligraphy",
    size: 5,
    opacity: 1,
    smoothing: 0.7,
    pressure: 0.4,
    taper: 0.2,
    grain: 0,
    weight: 1.2,
  },
  {
    id: "pen-technical",
    name: "Technical Pen",
    family: "pen",
    kind: "solid",
    size: 1.4,
    opacity: 1,
    smoothing: 0.85,
    pressure: 0,
    taper: 0,
    grain: 0,
    weight: 1,
  },

  // ---- Markers -----------------------------------------------------
  {
    id: "marker-highlighter",
    name: "Highlighter",
    family: "marker",
    kind: "highlighter",
    size: 14,
    opacity: 0.4,
    smoothing: 0.6,
    pressure: 0,
    taper: 0,
    grain: 0,
    weight: 1,
  },
  {
    id: "marker-permanent",
    name: "Permanent",
    family: "marker",
    kind: "solid",
    size: 7,
    opacity: 1,
    smoothing: 0.6,
    pressure: 0.15,
    taper: 0.1,
    grain: 0,
    weight: 1.1,
  },
  {
    id: "marker-chisel",
    name: "Chisel",
    family: "marker",
    kind: "chisel",
    size: 10,
    opacity: 1,
    smoothing: 0.6,
    pressure: 0.2,
    taper: 0.1,
    grain: 0,
    weight: 1,
  },
  {
    id: "marker-neon",
    name: "Neon",
    family: "marker",
    kind: "neon",
    size: 5,
    opacity: 1,
    smoothing: 0.65,
    pressure: 0.2,
    taper: 0.2,
    grain: 0,
    weight: 1,
  },

  // ---- Brushes -----------------------------------------------------
  {
    id: "brush-soft",
    name: "Soft Brush",
    family: "brush",
    kind: "soft",
    size: 10,
    opacity: 0.85,
    smoothing: 0.6,
    pressure: 0.8,
    taper: 0.6,
    grain: 0.2,
    weight: 1.2,
  },
  {
    id: "brush-hard",
    name: "Hard Brush",
    family: "brush",
    kind: "solid",
    size: 9,
    opacity: 1,
    smoothing: 0.55,
    pressure: 0.7,
    taper: 0.35,
    grain: 0,
    weight: 1.2,
  },
  {
    id: "brush-water",
    name: "Water Brush",
    family: "brush",
    kind: "water",
    size: 12,
    opacity: 0.6,
    smoothing: 0.5,
    pressure: 0.9,
    taper: 0.7,
    grain: 0.25,
    weight: 1.3,
  },
  {
    id: "brush-air",
    name: "Air Brush",
    family: "brush",
    kind: "airbrush",
    size: 16,
    opacity: 0.5,
    smoothing: 0.5,
    pressure: 0.7,
    taper: 0.3,
    grain: 0.8,
    weight: 1,
  },
  {
    id: "brush-chalk",
    name: "Chalk Brush",
    family: "brush",
    kind: "chalk",
    size: 8,
    opacity: 0.9,
    smoothing: 0.4,
    pressure: 0.6,
    taper: 0.3,
    grain: 1,
    weight: 1.2,
  },
];

export const DEFAULT_PRESET_ID = "pen-gel";

const byId = new Map(BRUSH_PRESETS.map((p) => [p.id, p]));

/** Legacy `BrushKind` -> preset, so old boards keep rendering. */
const LEGACY: Record<BrushKind, string> = {
  pen: "pen-gel",
  pencil: "pencil-2b",
  marker: "marker-permanent",
  highlighter: "marker-highlighter",
  calligraphy: "pen-calligraphy",
  neon: "marker-neon",
};

export function getPreset(id: string | undefined): BrushPreset | undefined {
  return id ? byId.get(id) : undefined;
}

export function resolvePreset(style: ElementStyle): BrushPreset {
  return (
    getPreset(style.brushPreset) ?? getPreset(LEGACY[style.brush]) ?? byId.get(DEFAULT_PRESET_ID)!
  );
}

export const FAMILY_LABEL: Record<BrushFamily, string> = {
  pencil: "Pencils",
  pen: "Pens",
  marker: "Markers",
  brush: "Brushes",
};

/** Style patch applied when the user picks a preset. */
export function presetStyle(p: BrushPreset): Partial<ElementStyle> {
  return {
    brushPreset: p.id,
    brush: (LEGACY_REVERSE[p.kind] ?? "pen") as BrushKind,
    strokeWidth: p.size,
    opacity: p.opacity,
    smoothing: p.smoothing,
    ...(p.dash ? { strokeStyle: p.dash } : {}),
  };
}

const LEGACY_REVERSE: Partial<Record<RenderKind, BrushKind>> = {
  solid: "pen",
  pencil: "pencil",
  calligraphy: "calligraphy",
  chisel: "calligraphy",
  highlighter: "highlighter",
  neon: "neon",
  chalk: "pencil",
  soft: "marker",
  water: "marker",
  airbrush: "marker",
};
