import { useEffect, useRef } from "react";
import { boxOf } from "@/whiteboard/geometry";
import type { WhiteboardEngine } from "@/whiteboard/engine";

/** Live overview of the board with a draggable viewport rectangle. */
export function Minimap({ engine, tick }: { engine: WhiteboardEngine; tick: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const els = engine.getElements();
    const size = engine.viewportSize;
    const view = {
      x: engine.viewport.x,
      y: engine.viewport.y,
      w: size.w / engine.viewport.zoom,
      h: size.h / engine.viewport.zoom,
    };
    let minX = view.x,
      minY = view.y,
      maxX = view.x + view.w,
      maxY = view.y + view.h;
    for (const el of els) {
      const b = boxOf(el);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    const pad = 40;
    const scale = Math.min(w / (maxX - minX + pad * 2), h / (maxY - minY + pad * 2));
    const ox = -minX * scale + pad * scale;
    const oy = -minY * scale + pad * scale;

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (const el of els) {
      const b = boxOf(el);
      ctx.fillRect(
        b.x * scale + ox,
        b.y * scale + oy,
        Math.max(1.5, b.w * scale),
        Math.max(1.5, b.h * scale),
      );
    }
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(view.x * scale + ox, view.y * scale + oy, view.w * scale, view.h * scale);
    canvas.dataset["scale"] = String(scale);
    canvas.dataset["ox"] = String(ox);
    canvas.dataset["oy"] = String(oy);
  }, [engine, tick]);

  const jump = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = Number(canvas.dataset["scale"] ?? 1);
    const ox = Number(canvas.dataset["ox"] ?? 0);
    const oy = Number(canvas.dataset["oy"] ?? 0);
    const wx = (e.clientX - rect.left - ox) / scale;
    const wy = (e.clientY - rect.top - oy) / scale;
    const size = engine.viewportSize;
    engine.viewport = {
      ...engine.viewport,
      x: wx - size.w / 2 / engine.viewport.zoom,
      y: wy - size.h / 2 / engine.viewport.zoom,
    };
    engine.invalidate();
  };

  return (
    <canvas
      ref={ref}
      onPointerDown={jump}
      aria-label="Board minimap"
      className="h-28 w-48 cursor-crosshair rounded-xl"
    />
  );
}
