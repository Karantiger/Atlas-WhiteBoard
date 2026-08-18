import { useEffect, useLayoutEffect, useRef } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Underline,
} from "lucide-react";
import type { WhiteboardEngine } from "@/whiteboard/engine";
import type { WBElement } from "@/whiteboard/types";
import { boxOf } from "@/whiteboard/geometry";
import { cn } from "@/lib/utils";

/**
 * Inline rich-ish text editor for `text` and `sticky` elements.
 * Renders a transparent textarea perfectly aligned with the canvas text,
 * auto-grows the element, and keeps focus while typing.
 */
export function TextEditor({
  engine,
  element,
}: {
  engine: WhiteboardEngine;
  element: WBElement;
  tick: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const zoom = engine.viewport.zoom;
  const s = element.style;
  const pad = (s.padding ?? (element.type === "sticky" ? 14 : 0)) * zoom;
  const b = boxOf(element);
  const tl = engine.worldToScreen(b.x, b.y);
  const width = Math.max(60, b.w * zoom);
  const lineHeight = s.lineHeight ?? 1.35;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The canvas captures the pointer for the click that created this element,
    // so focus can be stolen for a frame — retry until it sticks.
    let frames = 0;
    const focus = () => {
      if (!ref.current) return;
      if (document.activeElement !== ref.current) {
        ref.current.focus({ preventScroll: true });
        const len = ref.current.value.length;
        ref.current.setSelectionRange(len, len);
      }
      if (frames++ < 6) raf = requestAnimationFrame(focus);
    };
    let raf = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(raf);
  }, [element.id]);

  /** Grow the element so the text is never clipped. */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const needed = el.scrollHeight / zoom + (element.type === "sticky" ? 0 : 4);
    if (needed > element.h + 0.5) {
      engine.updateElements([element.id], () => ({ h: needed }), false);
    }
    el.style.height = `${Math.max(el.scrollHeight, (element.h - (s.padding ?? 0) * 0) * zoom)}px`;
  });

  const patchStyle = (patch: Parameters<typeof engine.setStyle>[0]) => {
    engine.updateElements([element.id], (el) => ({ style: { ...el.style, ...patch } }));
    ref.current?.focus();
  };

  const btn = (on: boolean) =>
    cn(
      "flex size-7 items-center justify-center rounded-md transition-colors",
      on
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <>
      {/* Formatting toolbar */}
      <div
        className="glass-strong pointer-events-auto absolute z-30 flex items-center gap-0.5 rounded-xl p-1"
        style={{ left: tl.x, top: Math.max(4, tl.y - 44) }}
        onPointerDown={(e) => e.preventDefault()}
      >
        <button
          type="button"
          aria-label="Bold"
          className={btn(s.fontWeight >= 700)}
          onClick={() => patchStyle({ fontWeight: s.fontWeight >= 700 ? 400 : 700 })}
        >
          <Bold className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Italic"
          className={btn(!!s.italic)}
          onClick={() => patchStyle({ italic: !s.italic })}
        >
          <Italic className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Underline"
          className={btn(!!s.underline)}
          onClick={() => patchStyle({ underline: !s.underline })}
        >
          <Underline className="size-3.5" />
        </button>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <button
          type="button"
          aria-label="Bullet list"
          className={btn(s.listStyle === "bullet")}
          onClick={() => patchStyle({ listStyle: s.listStyle === "bullet" ? "none" : "bullet" })}
        >
          <List className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Numbered list"
          className={btn(s.listStyle === "number")}
          onClick={() => patchStyle({ listStyle: s.listStyle === "number" ? "none" : "number" })}
        >
          <ListOrdered className="size-3.5" />
        </button>
        <span className="mx-0.5 h-5 w-px bg-border" />
        {(["left", "center", "right"] as const).map((a) => {
          const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
          return (
            <button
              key={a}
              type="button"
              aria-label={`Align ${a}`}
              className={btn(s.textAlign === a)}
              onClick={() => patchStyle({ textAlign: a })}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
        <span className="mx-0.5 h-5 w-px bg-border" />
        <input
          type="number"
          min={8}
          max={200}
          aria-label="Font size"
          value={Math.round(s.fontSize)}
          onChange={(e) => patchStyle({ fontSize: Number(e.target.value) || 16 })}
          className="w-12 rounded-md bg-transparent px-1 py-0.5 text-xs outline-none focus:bg-muted"
        />
        <input
          type="color"
          aria-label="Text color"
          value={/^#[0-9a-f]{6}$/i.test(s.stroke) ? s.stroke : "#111827"}
          onChange={(e) => patchStyle({ stroke: e.target.value })}
          className="size-6 cursor-pointer rounded-md border border-border bg-transparent"
        />
      </div>

      <textarea
        ref={ref}
        value={element.text ?? ""}
        spellCheck={false}
        onChange={(e) =>
          engine.updateElements([element.id], () => ({ text: e.target.value }), false)
        }
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            engine.stopEditing();
          }
        }}
        className="absolute z-20 resize-none overflow-hidden rounded-md border border-primary/60 bg-transparent outline-none"

        style={{
          left: tl.x,
          top: tl.y,
          width,
          padding: pad,
          fontSize: s.fontSize * zoom,
          lineHeight,
          fontWeight: s.fontWeight,
          fontStyle: s.italic ? "italic" : "normal",
          textDecoration: s.underline ? "underline" : "none",
          textAlign: s.textAlign,
          letterSpacing: s.letterSpacing ? `${s.letterSpacing * zoom}px` : undefined,
          color: s.stroke,
          fontFamily: s.fontFamily,
          caretColor: s.stroke,
        }}
      />
    </>
  );
}
