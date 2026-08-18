import { BRUSH_PRESETS, FAMILY_LABEL, presetStyle, resolvePreset } from "@/whiteboard/brushes";
import type { BrushFamily } from "@/whiteboard/brushes";
import type { WhiteboardEngine } from "@/whiteboard/engine";
import type { EraserMode } from "@/whiteboard/types";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

const FAMILIES: BrushFamily[] = ["pencil", "pen", "marker", "brush"];

const ERASERS: { id: EraserMode; label: string; hint: string }[] = [
  { id: "object", label: "Object", hint: "Removes the whole object under the cursor" },
  { id: "stroke", label: "Stroke", hint: "Removes only freehand strokes and lines" },
  { id: "pixel", label: "Partial", hint: "Erases just the part of a stroke you touch" },
  { id: "smart", label: "Smart", hint: "Erases only inside the current selection" },
];

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="flex min-w-[124px] flex-1 flex-col gap-1">
      <span className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
        <span className="font-mono text-[10px] text-foreground">
          {format ? format(value) : value.toFixed(2)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
    </label>
  );
}

/** Floating panel with the pen/brush library or the eraser options. */
export function BrushPanel({ 
  engine, 
  tick, 
  onClose 
}: { 
  engine: WhiteboardEngine; 
  tick: number;
  onClose?: () => void;
}) {
  void tick; // Keep tick prop for future use

  if (engine.tool === "eraser") {
    return (
      <div 
        className="glass pointer-events-auto w-[300px] rounded-2xl p-3"
        style={{
          willChange: 'transform',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitTransform: 'translateZ(0)',
          isolation: 'isolate',
          contain: 'layout paint',
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Eraser
          </p>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close eraser panel"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        
        {/* 4 columns for erasers */}
        <div className="mb-3 grid grid-cols-4 gap-1">
          {ERASERS.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.hint}
              aria-pressed={engine.eraserMode === m.id}
              onClick={() => {
                engine.setEraser({ mode: m.id });
                onClose?.(); // Auto-collapse after selection
              }}
              className={cn(
                "rounded-lg px-2 py-2 text-[11px] text-center transition-colors",
                engine.eraserMode === m.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        
        <Slider
          label="Size"
          min={6}
          max={160}
          step={1}
          value={engine.eraserSize}
          format={(v) => `${Math.round(v)}px`}
          onChange={(v) => engine.setEraser({ size: v })}
        />
      </div>
    );
  }

  if (engine.tool !== "draw") return null;

  const active = resolvePreset(engine.style);
  const s = engine.style;

  return (
      <div 
        className="glass pointer-events-auto w-[340px] rounded-2xl p-3"
        style={{
          willChange: 'transform',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitTransform: 'translateZ(0)',
          isolation: 'isolate',
          contain: 'layout paint',
        }}
      >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Pen & Brush
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close pen panel"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
        {FAMILIES.map((family) => (
          <div key={family}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {FAMILY_LABEL[family]}
            </p>
            {/* 3 columns for brushes */}
            <div className="grid grid-cols-3 gap-1">
              {BRUSH_PRESETS.filter((p) => p.family === family).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active.id === p.id}
                  onClick={() => {
                    engine.setStyle(presetStyle(p));
                    onClose?.(); // Auto-collapse after selection
                  }}
                  className={cn(
                    "rounded-lg px-2 py-2 text-center text-[11px] transition-colors",
                    active.id === p.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 border-t border-border pt-3">
        <Slider
          label="Size"
          min={0.5}
          max={60}
          step={0.5}
          value={s.strokeWidth}
          format={(v) => `${v}px`}
          onChange={(v) => engine.setStyle({ strokeWidth: v })}
        />
        <Slider
          label="Opacity"
          min={0.05}
          max={1}
          step={0.05}
          value={s.opacity}
          onChange={(v) => engine.setStyle({ opacity: v })}
        />
        <Slider
          label="Smoothing"
          min={0}
          max={0.95}
          step={0.05}
          value={s.smoothing}
          onChange={(v) => engine.setStyle({ smoothing: v })}
        />
        <label className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          Color
          <input
            type="color"
            aria-label="Stroke color"
            value={/^#[0-9a-f]{6}$/i.test(s.stroke) ? s.stroke : "#e7e9ee"}
            onChange={(e) => engine.setStyle({ stroke: e.target.value })}
            className="size-7 cursor-pointer rounded-md border border-border bg-transparent"
          />
        </label>
      </div>
    </div>
  );
}