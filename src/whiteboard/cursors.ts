import type { BrushFamily } from "./brushes";
import type { ToolId } from "./types";

/**
 * Real tool cursors, generated as inline SVG data URIs so the pointer
 * changes instantly (no network fetch, no flicker) when a tool is picked.
 */

const svg = (body: string, size = 28) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 28 28'>${body}</svg>`,
  )}")`;

/** Shared drop-shadow-ish outline so cursors read on any background. */
const shell = (inner: string) =>
  `<g fill='none' stroke='#111827' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'>${inner}</g><g fill='none' stroke='#ffffff' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'>${inner}</g>`;

const PENCIL = shell(
  "<path d='M3 25l1.6-5.2L18 6.4l3.6 3.6L8.2 23.4 3 25z'/><path d='M16.4 8l3.6 3.6'/>",
);
const PEN = shell(
  "<path d='M3 25l1.4-5L19 5.4a2.4 2.4 0 013.4 3.4L7.9 23.6 3 25z'/><path d='M17.4 7l3.6 3.6'/>",
);
const MARKER = shell(
  "<path d='M3 25l.8-5.4L16.6 6.8l5.2 5.2L9 24.6 3 25z'/><path d='M14 9.4l5.2 5.2'/>",
);
const BRUSH = shell(
  "<path d='M20.6 4.4c-3 1-8.4 5.4-11 9.6l4.8 4.8c4-2.6 8.6-8 9.6-11 .6-2-1.4-4-3.4-3.4z'/><path d='M9.4 16.6c-2.4.6-3.4 2.4-4 5.6 3.4-.4 5.2-1.4 5.8-3.8z'/>",
);
const ERASER = shell(
  "<path d='M9 23h13'/><path d='M6.6 20.4l-2.2-2.2a2 2 0 010-2.8L15 4.8a2 2 0 012.8 0l4.6 4.6a2 2 0 010 2.8L13.6 21H9.4z'/>",
);
const SELECT = shell("<path d='M6 3.4l13.6 9.4-6 1.2 3.4 7.4-2.6 1.2-3.4-7.4-4.2 4z'/>");
const LASSO = shell(
  "<path d='M14 4.6c5.6 0 10 3 10 6.8s-4.4 6.8-10 6.8c-2 0-3.8-.4-5.4-1'/><path d='M8.6 17.2C6 16 4 13.8 4 11.4c0-2.4 1.8-4.6 4.6-5.8'/><path d='M9 18.4c0 2.6-1 3.4-1 5.2'/>",
);
const HAND = shell(
  "<path d='M9 13V6.6a1.8 1.8 0 013.6 0V12m0-1.4a1.8 1.8 0 013.6 0V12m0-.6a1.8 1.8 0 013.6 0v6.2c0 3.4-2.6 6-6 6h-1.4c-2 0-3.4-.8-4.6-2.4L5 16.6a1.8 1.8 0 012.8-2.2z'/>",
);

const HOTSPOT: Record<string, [number, number]> = {
  pencil: [2, 26],
  pen: [2, 26],
  marker: [2, 26],
  brush: [2, 26],
  eraser: [5, 22],
  select: [5, 3],
  lasso: [4, 22],
};

const cur = (body: string, key: string, fallback = "crosshair") => {
  const [hx, hy] = HOTSPOT[key] ?? [14, 14];
  return `${svg(body)} ${hx} ${hy}, ${fallback}`;
};

export const FAMILY_CURSOR: Record<BrushFamily, string> = {
  pencil: cur(PENCIL, "pencil"),
  pen: cur(PEN, "pen"),
  marker: cur(MARKER, "marker"),
  brush: cur(BRUSH, "brush"),
};

export function cursorFor(
  tool: ToolId,
  family: BrushFamily,
  opts: { panning?: boolean; spaceDown?: boolean } = {},
): string {
  if (opts.panning) return "grabbing";
  if (opts.spaceDown) return "grab";
  switch (tool) {
    case "hand":
      return `${svg(HAND)} 14 14, grab`;
    case "draw":
      return FAMILY_CURSOR[family];
    case "eraser":
      return cur(ERASER, "eraser");
    case "text":
      return "text";
    case "select":
      return cur(SELECT, "select", "default");
    case "lasso":
      return cur(LASSO, "lasso");
    case "connector":
      return "crosshair";
    case "sticky":
      return "copy";
    case "laser":
      return "crosshair";
    default:
      return "crosshair";
  }
}
