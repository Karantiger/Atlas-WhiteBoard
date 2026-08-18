import { boxOf, unionBoxes } from "./geometry";
import { drawElement } from "./renderer";
import type { WhiteboardEngine } from "./engine";
import type { BoardSnapshot, WBElement } from "./types";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export interface ExportOptions {
  scale?: number;
  padding?: number;
  background?: string | null | undefined;
  selectionOnly?: boolean;
}

function targetElements(engine: WhiteboardEngine, selectionOnly?: boolean) {
  const all = engine.getElements();
  return selectionOnly ? all.filter((e) => engine.selection.has(e.id)) : all;
}

export function renderToCanvas(
  engine: WhiteboardEngine,
  opts: ExportOptions = {},
): HTMLCanvasElement | null {
  const { scale = 2, padding = 32, background = "#0d1016", selectionOnly } = opts;
  const els = targetElements(engine, selectionOnly);
  const box = unionBoxes(els.map(boxOf));
  if (!box || !els.length) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil((box.w + padding * 2) * scale));
  canvas.height = Math.max(1, Math.ceil((box.h + padding * 2) * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.scale(scale, scale);
  ctx.translate(-box.x + padding, -box.y + padding);
  for (const el of els) drawElement(ctx, el, () => {});
  return canvas;
}

export async function exportImage(
  engine: WhiteboardEngine,
  format: "png" | "jpeg" | "webp",
  opts: ExportOptions = {},
) {
  const canvas = renderToCanvas(engine, {
    ...opts,
    background: format === "jpeg" ? (opts.background ?? "#0d1016") : opts.background,
  });
  if (!canvas) return false;
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, `image/${format}`, 0.95),
  );
  if (!blob) return false;
  download(blob, `${engine.boardName || "board"}.${format === "jpeg" ? "jpg" : format}`);
  return true;
}

export async function copyImageToClipboard(engine: WhiteboardEngine) {
  const canvas = renderToCanvas(engine, { scale: 2 });
  if (!canvas || !navigator.clipboard || typeof ClipboardItem === "undefined") return false;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return false;
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  return true;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function elementToSvg(el: WBElement): string {
  const b = boxOf(el);
  const s = el.style;
  const transform = el.angle
    ? ` transform="rotate(${(el.angle * 180) / Math.PI} ${b.x + b.w / 2} ${b.y + b.h / 2})"`
    : "";
  const strokeAttrs = `stroke="${s.stroke}" stroke-width="${s.strokeWidth}" fill="${
    s.fillStyle === "none" ? "none" : s.fill
  }" opacity="${s.opacity}" stroke-linecap="round" stroke-linejoin="round"${
    s.strokeStyle === "dashed"
      ? ` stroke-dasharray="${s.strokeWidth * 3} ${s.strokeWidth * 2}"`
      : s.strokeStyle === "dotted"
        ? ` stroke-dasharray="0.1 ${s.strokeWidth * 2.2}"`
        : ""
  }`;
  switch (el.type) {
    case "draw":
    case "line":
    case "arrow": {
      const pts = (el.points ?? []).map((p) => `${el.x + p.x},${el.y + p.y}`).join(" ");
      return `<polyline points="${pts}" fill="none" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" opacity="${s.opacity}" stroke-linecap="round" stroke-linejoin="round"${transform}/>`;
    }
    case "ellipse":
      return `<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2}" ry="${b.h / 2}" ${strokeAttrs}${transform}/>`;
    case "diamond":
      return `<polygon points="${b.x + b.w / 2},${b.y} ${b.x + b.w},${b.y + b.h / 2} ${b.x + b.w / 2},${b.y + b.h} ${b.x},${b.y + b.h / 2}" ${strokeAttrs}${transform}/>`;
    case "triangle":
      return `<polygon points="${b.x + b.w / 2},${b.y} ${b.x + b.w},${b.y + b.h} ${b.x},${b.y + b.h}" ${strokeAttrs}${transform}/>`;
    case "text":
    case "sticky": {
      const bg =
        el.type === "sticky"
          ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6" fill="${s.fill}" opacity="${s.opacity}"/>`
          : "";
      const lines = (el.text ?? "").split("\n");
      const pad = el.type === "sticky" ? 14 : 0;
      const text = lines
        .map(
          (line, i) =>
            `<tspan x="${b.x + pad}" dy="${i === 0 ? s.fontSize : s.fontSize * 1.35}">${esc(line)}</tspan>`,
        )
        .join("");
      return `${bg}<text x="${b.x + pad}" y="${b.y + pad}" font-family="${s.fontFamily}" font-size="${s.fontSize}" font-weight="${s.fontWeight}" fill="${s.stroke}" opacity="${s.opacity}"${transform}>${text}</text>`;
    }
    case "image":
      return `<image href="${el.src ?? ""}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" opacity="${s.opacity}"${transform}/>`;
    default:
      return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${s.radius}" ${strokeAttrs}${transform}/>`;
  }
}

export function exportSvgString(engine: WhiteboardEngine, opts: ExportOptions = {}) {
  const { padding = 32, background = "#0d1016", selectionOnly } = opts;
  const els = targetElements(engine, selectionOnly);
  const box = unionBoxes(els.map(boxOf));
  if (!box) return null;
  const w = box.w + padding * 2;
  const h = box.h + padding * 2;
  const body = els.map(elementToSvg).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${box.x - padding} ${box.y - padding} ${w} ${h}">
  ${background ? `<rect x="${box.x - padding}" y="${box.y - padding}" width="${w}" height="${h}" fill="${background}"/>` : ""}
  ${body}
</svg>`;
}

export function exportSvg(engine: WhiteboardEngine, opts: ExportOptions = {}) {
  const svg = exportSvgString(engine, opts);
  if (!svg) return false;
  download(new Blob([svg], { type: "image/svg+xml" }), `${engine.boardName || "board"}.svg`);
  return true;
}

export function exportJson(engine: WhiteboardEngine) {
  const snap = engine.toSnapshot();
  download(
    new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" }),
    `${engine.boardName || "board"}.json`,
  );
  return true;
}

/** Vector PDF-ish export: prints the SVG through a hidden print window. */
export function exportPdf(engine: WhiteboardEngine) {
  const svg = exportSvgString(engine, { background: "#ffffff" });
  if (!svg) return false;
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(
    `<html><head><title>${engine.boardName}</title><style>@page{margin:12mm}body{margin:0;display:flex;align-items:center;justify-content:center}svg{max-width:100%;height:auto}</style></head><body>${svg}<script>window.onload=()=>{window.focus();window.print();}<\/script></body></html>`,
  );
  win.document.close();
  return true;
}

export function importJson(text: string): BoardSnapshot | null {
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data?.elements)) return data as BoardSnapshot;
    return null;
  } catch {
    return null;
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function loadImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 320, h: 240 });
    img.src = src;
  });
}
