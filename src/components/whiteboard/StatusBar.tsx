import { useState } from "react";
import {
  ChevronRight,
  Minus,
  Plus,
  Maximize2,
  Crosshair,
  Grid3x3,
  Magnet,
} from "lucide-react";
import type { WhiteboardEngine } from "@/whiteboard/engine";
import { cn } from "@/lib/utils";

interface StatusBarProps {
  engine: WhiteboardEngine;
  tick: number;
}

export function StatusBar({ engine, tick }: StatusBarProps) {
  void tick;

  const [open, setOpen] = useState(false);

  const zoomPct = Math.round(engine.viewport.zoom * 100);

  return (
    <div
      className={cn(
        "glass pointer-events-auto flex items-center rounded-2xl text-xs transition-all",
        open ? "gap-1 px-2 py-1.5" : "p-1.5",
      )}
    >
      {/* Toggle */}
      <button
        type="button"
        aria-label={open ? "Collapse status bar" : "Expand status bar"}
        title={open ? "Collapse" : "Expand"}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "tool-btn size-8 shrink-0 transition-transform",
          open && "rotate-180",
        )}
      >
        <ChevronRight className="size-4" />
      </button>

      {open && (
        <>
          {/* Zoom */}
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => engine.setZoom(engine.viewport.zoom / 1.25)}
            className="tool-btn size-8"
          >
            <Minus className="size-4" />
          </button>

          <button
            type="button"
            onClick={() => engine.setZoom(1)}
            title="Reset zoom to 100%"
            className="min-w-14 rounded-md px-1 py-1 font-mono text-xs text-foreground hover:bg-muted"
          >
            {zoomPct}%
          </button>

          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            onClick={() => engine.setZoom(engine.viewport.zoom * 1.25)}
            className="tool-btn size-8"
          >
            <Plus className="size-4" />
          </button>

          <span className="mx-1 h-5 w-px bg-border" />

          {/* View controls */}
          <button
            type="button"
            aria-label="Zoom to fit"
            title="Zoom to fit (Shift+1)"
            onClick={() => engine.zoomToFit()}
            className="tool-btn size-8"
          >
            <Maximize2 className="size-4" />
          </button>

          <button
            type="button"
            aria-label="Zoom to selection"
            title="Zoom to selection (Shift+2)"
            onClick={() => engine.zoomToSelection()}
            className="tool-btn size-8"
          >
            <Crosshair className="size-4" />
          </button>

          {/* Grid */}
          <button
            type="button"
            aria-label="Cycle grid"
            title="Grid mode"
            onClick={() => {
              engine.gridMode =
                engine.gridMode === "dots"
                  ? "lines"
                  : engine.gridMode === "lines"
                    ? "none"
                    : "dots";

              engine.invalidate();
            }}
            className={cn(
              "tool-btn size-8",
              engine.gridMode !== "none" && "tool-btn-active",
            )}
          >
            <Grid3x3 className="size-4" />
          </button>

          {/* Snap */}
          <button
            type="button"
            aria-label="Snap to grid"
            title="Snap to grid"
            onClick={() => {
              engine.snapToGrid = !engine.snapToGrid;
              engine.invalidate();
            }}
            className={cn(
              "tool-btn size-8",
              engine.snapToGrid && "tool-btn-active",
            )}
          >
            <Magnet className="size-4" />
          </button>
        </>
      )}
    </div>
  );
}