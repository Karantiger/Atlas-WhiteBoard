import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  FlipHorizontal,
  FlipVertical,
  Lock,
  Palette,
  Trash2,
  Unlock,
} from "lucide-react";

import type { WhiteboardEngine } from "@/whiteboard/engine";
import type { ElementStyle } from "@/whiteboard/types";
import { cn } from "@/lib/utils";

const STROKES = [
  "#e7e9ee",
  "#0f172a",
  "#38bdf8",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#a78bfa",
  "#fb923c",
];

const FILLS = [
  "transparent",
  "#1e293b",
  "#38bdf8",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#a78bfa",
  "#f8fafc",
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-medium text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function Swatches({
  colors,
  value,
  onChange,
}: {
  colors: string[];
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="grid grid-cols-9 gap-1.5">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Color ${color}`}
          title={color === "transparent" ? "Transparent" : color}
          onClick={() => onChange(color)}
          className={cn(
            "aspect-square w-full rounded-lg border border-border/60 transition-transform hover:scale-110",
            value === color && "ring-2 ring-primary ring-offset-1",
          )}
          style={{
            background:
              color === "transparent"
                ? "repeating-conic-gradient(rgba(140,140,150,.6) 0% 25%, transparent 0% 50%) 50%/8px 8px"
                : color,
          }}
        />
      ))}

      <label className="flex aspect-square w-full cursor-pointer items-center justify-center rounded-lg border border-border/60 hover:bg-muted">
        <Palette className="size-3.5 text-muted-foreground" />
        <input
          type="color"
          className="sr-only"
          aria-label="Custom color"
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-xs text-foreground/80">
          {Math.round(value * 100) / 100}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function Inspector({
  engine,
  tick,
}: {
  engine: WhiteboardEngine;
  tick: number;
}) {
  void tick;

  const selected = engine
    .getElements()
    .filter((element) => engine.selection.has(element.id));

  const style: ElementStyle = selected[0]?.style ?? engine.style;

  const set = (patch: Partial<ElementStyle>) => {
    engine.setStyle(patch);
  };

  return (
    <aside className="glass pointer-events-auto w-[280px] overflow-y-auto rounded-2xl p-5">
      <div className="space-y-6">
        {/* Stroke */}
        <Section title="Stroke">
          <Swatches
            colors={STROKES}
            value={style.stroke}
            onChange={(stroke) => set({ stroke })}
          />
        </Section>

        {/* Fill */}
        <Section title="Fill">
          <Swatches
            colors={FILLS}
            value={style.fill}
            onChange={(fill) => set({ fill })}
          />
          <div className="grid grid-cols-3 gap-1.5">
            {(["solid", "hachure", "none"] as const).map((fillStyle) => (
              <button
                key={fillStyle}
                type="button"
                onClick={() => set({ fillStyle })}
                className={cn(
                  "rounded-lg py-1.5 text-xs capitalize text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  style.fillStyle === fillStyle && "bg-muted text-foreground",
                )}
              >
                {fillStyle}
              </button>
            ))}
          </div>
        </Section>

        {/* Stroke Style */}
        <Section title="Stroke style">
          <div className="grid grid-cols-3 gap-1.5">
            {(["solid", "dashed", "dotted"] as const).map(
              (strokeStyle) => (
                <button
                  key={strokeStyle}
                  type="button"
                  onClick={() => set({ strokeStyle })}
                  className={cn(
                    "rounded-lg py-1.5 text-xs capitalize text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    style.strokeStyle === strokeStyle && "bg-muted text-foreground",
                  )}
                >
                  {strokeStyle}
                </button>
              ),
            )}
          </div>
        </Section>

        {/* Dimensions */}
        <div className="grid gap-4">
          <Slider
            label="Stroke width"
            value={style.strokeWidth}
            min={0.5}
            max={40}
            step={0.5}
            onChange={(strokeWidth) => set({ strokeWidth })}
          />
          <Slider
            label="Opacity"
            value={style.opacity}
            min={0.05}
            max={1}
            step={0.05}
            onChange={(opacity) => set({ opacity })}
          />
          <Slider
            label="Corner radius"
            value={style.radius}
            min={0}
            max={80}
            onChange={(radius) => set({ radius })}
          />
        </div>

        {/* Text */}
        <Section title="Text">
          <Slider
            label="Font size"
            value={style.fontSize}
            min={8}
            max={160}
            onChange={(fontSize) => set({ fontSize })}
          />
          <div className="flex gap-1">
            <IconButton
              label="Align left"
              active={style.textAlign === "left"}
              onClick={() => set({ textAlign: "left" })}
            >
              <AlignLeft className="size-4" />
            </IconButton>
            <IconButton
              label="Align center"
              active={style.textAlign === "center"}
              onClick={() => set({ textAlign: "center" })}
            >
              <AlignCenter className="size-4" />
            </IconButton>
            <IconButton
              label="Align right"
              active={style.textAlign === "right"}
              onClick={() => set({ textAlign: "right" })}
            >
              <AlignRight className="size-4" />
            </IconButton>
            <div className="w-px bg-border mx-1" />
            <IconButton
              label="Bold"
              active={style.fontWeight >= 700}
              onClick={() =>
                set({
                  fontWeight: style.fontWeight >= 700 ? 500 : 800,
                })
              }
            >
              <span className="text-sm font-extrabold">B</span>
            </IconButton>
          </div>
        </Section>

        {/* Arrange */}
        <Section title={`Arrange · ${selected.length} selected`}>
          <div className="flex flex-wrap gap-1">
            <IconButton
              label="Bring to front"
              onClick={() => engine.reorder("front")}
            >
              <ArrowUpToLine className="size-4" />
            </IconButton>
            <IconButton
              label="Send to back"
              onClick={() => engine.reorder("back")}
            >
              <ArrowDownToLine className="size-4" />
            </IconButton>
            
            <div className="w-px bg-border mx-1" />
            
            <IconButton
              label="Align left"
              onClick={() => engine.align("left")}
            >
              <AlignLeft className="size-4" />
            </IconButton>
            <IconButton
              label="Align horizontal centers"
              onClick={() => engine.align("center-x")}
            >
              <AlignHorizontalJustifyCenter className="size-4" />
            </IconButton>
            <IconButton
              label="Align vertical centers"
              onClick={() => engine.align("center-y")}
            >
              <AlignVerticalJustifyCenter className="size-4" />
            </IconButton>
            
            <div className="w-px bg-border mx-1" />
            
            <IconButton
              label="Flip horizontally"
              onClick={() => engine.flip("x")}
            >
              <FlipHorizontal className="size-4" />
            </IconButton>
            <IconButton
              label="Flip vertically"
              onClick={() => engine.flip("y")}
            >
              <FlipVertical className="size-4" />
            </IconButton>
            <IconButton
              label="Duplicate"
              onClick={() => engine.duplicateSelection()}
            >
              <Copy className="size-4" />
            </IconButton>
            <IconButton
              label="Lock / unlock"
              onClick={() => engine.toggleLock()}
            >
              {selected[0]?.locked ? (
                <Lock className="size-4" />
              ) : (
                <Unlock className="size-4" />
              )}
            </IconButton>
            
            <div className="w-px bg-border mx-1" />
            
            <IconButton
              label="Delete"
              onClick={() => engine.deleteSelection()}
            >
              <Trash2 className="size-4 text-red-500" />
            </IconButton>
          </div>
        </Section>
      </div>
    </aside>
  );
}