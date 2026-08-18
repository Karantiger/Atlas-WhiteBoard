import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Command,
  Download,
  FileJson,
  Image as ImageIcon,
  LayoutTemplate,
  Maximize,
  Moon,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { WhiteboardEngine, uid } from "@/whiteboard/engine";
import { useEngineState } from "@/whiteboard/useEngineState";
import { Toolbar } from "./Toolbar";
import { BrushPanel } from "./BrushPanel";
import { TextEditor } from "./TextEditor";
import { PageTabs } from "./PageTabs";
import { PageControlsBar } from "./PageControlsBar";
import { Inspector } from "./Inspector";
import { StatusBar } from "./StatusBar";
import { TEMPLATES, buildTemplate } from "@/whiteboard/templates";
import {
  copyImageToClipboard,
  exportImage,
  exportJson,
  exportPdf,
  exportSvg,
  fileToDataUrl,
  importJson,
  loadImageSize,
} from "@/whiteboard/export";
import { loadBoard, saveBoard, flushNow } from "@/whiteboard/persistence";
import { boxOf } from "@/whiteboard/geometry";
import { cursorFor } from "@/whiteboard/cursors";
import type { ToolId, WBElement } from "@/whiteboard/types";
import { cn } from "@/lib/utils";

const THEMES = [
  { id: "dark", label: "Slate dark", cls: "", canvas: "#181c24", grid: "rgba(255,255,255,0.08)" },
  {
    id: "light",
    label: "Daylight",
    cls: "theme-light",
    canvas: "#fbfcfe",
    grid: "rgba(20,25,40,0.1)",
  },
  {
    id: "midnight",
    label: "Midnight",
    cls: "theme-midnight",
    canvas: "#12131f",
    grid: "rgba(160,255,220,0.08)",
  },
  { id: "sand", label: "Sand", cls: "theme-sand", canvas: "#f6f2e9", grid: "rgba(80,60,30,0.12)" },
] as const;

type ThemeId = (typeof THEMES)[number]["id"];

const KEY_TO_TOOL: Record<string, ToolId> = {
  v: "select",
  q: "lasso",
  h: "hand",
  p: "draw",
  e: "eraser",
  r: "rect",
  o: "ellipse",
  d: "diamond",
  g: "triangle",
  f: "star",
  l: "line",
  a: "arrow",
  c: "connector",
  t: "text",
  n: "sticky",
  k: "laser",
};

export function WhiteboardApp() {
  const [engine] = useState(() => new WhiteboardEngine("board-main", "Atlas board"));
  const tick = useEngineState(engine);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [themeId, setThemeId] = useState<ThemeId>("dark");
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [brushPanelOpen, setBrushPanelOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];

  /* Canvas lifecycle ------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    engine.attach(canvas);
    const ro = new ResizeObserver(() => engine.resize());
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      engine.detach();
    };
  }, [engine]);

  useEffect(() => {
    engine.setTheme({
      canvas: theme.canvas,
      grid: theme.grid,
      gridStrong: theme.grid,
      selection: "#38bdf8",
      selectionFill: "rgba(56,189,248,0.12)",
      text: "#e7e9ee",
    });
  }, [engine, theme]);

  /* Wheel: native, non-passive --------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      engine.wheel(e, canvas.getBoundingClientRect());
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [engine]);

  /* Persistence ------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    loadBoard("board-main").then((snap) => {
      if (snap && !cancelled) engine.loadSnapshot(snap);
      engine.hydrated = true;
    });
    return () => {
      cancelled = true;
    };
  }, [engine]);

  useEffect(() => {
    if (!engine.hydrated) return;
    const t = setTimeout(() => {
      void saveBoard(engine.toSnapshot());
    }, 700);
    return () => clearTimeout(t);
  }, [engine, tick]);

  useEffect(() => {
    const handleSaveAndFlush = () => {
      if (engine.hydrated) {
        void saveBoard(engine.toSnapshot());
        void flushNow();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") handleSaveAndFlush();
    };
    window.addEventListener("beforeunload", handleSaveAndFlush);
    window.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleSaveAndFlush);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [engine]);

  /* Keyboard ---------------------------------------------------------- */
  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        engine.setSpace(true);
        setSpaceDown(true);
      }
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) engine.redo();
        else engine.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        engine.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        engine.selectAll();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        engine.duplicateSelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        engine.copySelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "x") {
        e.preventDefault();
        engine.copySelection(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        if (engine.clipboard.length) {
          e.preventDefault();
          engine.paste();
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) engine.ungroup();
        else engine.group();
        return;
      }
      if (e.key === "Enter" && engine.selection.size === 1) {
        const id = [...engine.selection][0]!;
        const el = engine.elements.get(id);
        if (el && (el.type === "text" || el.type === "sticky")) {
          e.preventDefault();
          engine.startEditing(id);
          return;
        }
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        engine.deleteSelection();
        return;
      }
      if (e.key === "Escape") {
        engine.stopEditing();
        engine.clearSelection();
        setPalette(false);
        setTemplatesOpen(false);
        setExportOpen(false);
        setMenu(null);
        setPresenting(false);
        return;
      }
      if (e.key === "F11") {
        e.preventDefault();
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => {});
        return;
      }
      if (e.shiftKey && e.key === "!") {
        engine.zoomToFit();
        return;
      }
      if (e.shiftKey && e.key === "@") {
        engine.zoomToSelection();
        return;
      }
      if (e.key.startsWith("Arrow")) {
        const step = e.shiftKey ? 10 : 1;
        e.preventDefault();
        engine.nudge(
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
        );
        return;
      }
      const tool = KEY_TO_TOOL[e.key.toLowerCase()];
      if (tool && !mod) engine.setTool(tool);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        engine.setSpace(false);
        setSpaceDown(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [engine]);

  /* Pointer ----------------------------------------------------------- */
  const rel = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  /* Images: paste + drop ---------------------------------------------- */
  const insertImage = useCallback(
    async (file: File, sx?: number, sy?: number) => {
      const src = await fileToDataUrl(file);
      const size = await loadImageSize(src);
      const scale = Math.min(1, 520 / Math.max(size.w, size.h));
      const world = engine.screenToWorld(
        sx ?? engine.viewportSize.w / 2,
        sy ?? engine.viewportSize.h / 2,
      );
      const el: WBElement = {
        ...engine.createElement("image", world.x, world.y, size.w * scale, size.h * scale),
        id: uid(),
        src,
      };
      engine.insertElements([el]);
    },
    [engine],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) void insertImage(file);
          return;
        }
      }
      const text = e.clipboardData?.getData("text/plain");
      if (text) {
        const world = engine.screenToWorld(engine.viewportSize.w / 2, engine.viewportSize.h / 2);
        const el = engine.createElement("text", world.x, world.y, 320, 40);
        el.text = text;
        engine.insertElements([el]);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [engine, insertImage]);

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    for (const file of Array.from(e.dataTransfer.files)) {
      if (file.type.startsWith("image/")) {
        await insertImage(file, e.clientX - rect.left, e.clientY - rect.top);
      } else if (file.name.endsWith(".json")) {
        const snap = importJson(await file.text());
        if (snap) engine.loadSnapshot(snap);
      }
    }
  };

  /* Text editing overlay ---------------------------------------------- */
  const editing = engine.editingId ? engine.elements.get(engine.editingId) : null;

  /* Commands ---------------------------------------------------------- */
  const commands = useMemo(
    () => [
      { id: "undo", label: "Undo", run: () => engine.undo() },
      { id: "redo", label: "Redo", run: () => engine.redo() },
      { id: "fit", label: "Zoom to fit", run: () => engine.zoomToFit() },
      { id: "selection", label: "Zoom to selection", run: () => engine.zoomToSelection() },
      { id: "select-all", label: "Select all", run: () => engine.selectAll() },
      { id: "duplicate", label: "Duplicate selection", run: () => engine.duplicateSelection() },
      { id: "delete", label: "Delete selection", run: () => engine.deleteSelection() },
      { id: "front", label: "Bring to front", run: () => engine.reorder("front") },
      { id: "back", label: "Send to back", run: () => engine.reorder("back") },
      { id: "distribute-x", label: "Distribute horizontally", run: () => engine.distribute("x") },
      { id: "distribute-y", label: "Distribute vertically", run: () => engine.distribute("y") },
      {
        id: "grid",
        label: "Toggle grid",
        run: () => {
          engine.gridMode = engine.gridMode === "none" ? "dots" : "none";
          engine.invalidate();
        },
      },
      {
        id: "snap",
        label: "Toggle snap to grid",
        run: () => {
          engine.snapToGrid = !engine.snapToGrid;
          engine.invalidate();
        },
      },
      { id: "png", label: "Export PNG", run: () => void exportImage(engine, "png") },
      { id: "svg", label: "Export SVG", run: () => exportSvg(engine) },
      { id: "json", label: "Export JSON", run: () => exportJson(engine) },
      { id: "pdf", label: "Export PDF", run: () => exportPdf(engine) },
      {
        id: "copy-img",
        label: "Copy board as image",
        run: () => void copyImageToClipboard(engine),
      },
      { id: "templates", label: "Insert template…", run: () => setTemplatesOpen(true) },
      { id: "present", label: "Presentation mode", run: () => setPresenting(true) },
      ...THEMES.map((t) => ({
        id: `theme-${t.id}`,
        label: `Theme: ${t.label}`,
        run: () => setThemeId(t.id),
      })),
      ...TEMPLATES.map((t) => ({
        id: `tpl-${t.id}`,
        label: `Template: ${t.name}`,
        run: () => insertTemplate(t.id),
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine],
  );

  function insertTemplate(id: string) {
    const world = engine.screenToWorld(120, 120);
    engine.insertElements(buildTemplate(id, engine.activeLayer, world.x, world.y));
    setTemplatesOpen(false);
  }

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div
      className={cn("relative h-screen w-screen overflow-hidden bg-background isolate", theme.cls)}
      ref={wrapRef}
      style={{ isolation: 'isolate' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 size-full touch-none overflow-hidden pointer-events-auto"
        style={{
          cursor: cursorFor(engine.tool, engine.brushFamily, { spaceDown }),
          contain: 'layout paint',
        }}
        onPointerDown={(e) => {
          setMenu(null);
          engine.userDirty = true;
          if (engine.editingId) {
            engine.stopEditing();
          }
          const p = rel(e);
          engine.pointerDown(p.x, p.y, e.nativeEvent);
        }}
        onPointerMove={(e) => {
          const p = rel(e);
          engine.pointerMove(p.x, p.y, e.nativeEvent);
        }}
        onPointerUp={(e) => engine.pointerUp(e.nativeEvent)}
        onPointerCancel={(e) => engine.pointerUp(e.nativeEvent)}
        onDoubleClick={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const w = engine.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
          const hit = engine.elementAt(w.x, w.y);
          if (hit && hit.type !== "draw" && hit.type !== "image") {
            engine.startEditing(hit.id);
          } else if (!hit) {
            const el = engine.createElement("text", w.x, w.y, 260, 32);
            engine.addElement(el);
            engine.startEditing(el.id);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        aria-label="Whiteboard canvas"
        role="application"
      />

      {editing ? <TextEditor engine={engine} element={editing} tick={tick} /> : null}

      {/* Top bar */}
      {!presenting && (
        <header 
          className="pointer-events-none absolute inset-x-0 top-0 z-[100] flex items-start justify-between gap-3 p-3"
          style={{ isolation: 'isolate' }}
        >
          <div className="glass pointer-events-auto flex items-center gap-2 rounded-2xl px-3 py-2">
            <span className="text-sm font-bold tracking-tight">Atlas</span>
            <input
              defaultValue={engine.boardName}
              aria-label="Board name"
              onChange={(e) => {
                engine.boardName = e.target.value;
              }}
              className="w-40 rounded-md bg-transparent px-1 text-xs text-muted-foreground outline-none focus:bg-muted focus:text-foreground"
            />
          </div>

          <div className="flex items-start gap-2">
            <div className="glass pointer-events-auto flex items-center gap-1 rounded-2xl px-2 py-1.5">
              <button
                type="button"
                onClick={() => setPalette(true)}
                aria-label="Command palette"
                title="Command palette"
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Command className="size-4" />
              </button>

              <button
                type="button"
                aria-label="Inspector"
                title="Inspector"
                onClick={() => setInspectorOpen((open) => !open)}
                className={cn("tool-btn size-8", inspectorOpen && "tool-btn-active")}
              >
                <SlidersHorizontal className="size-4" />
              </button>

              <button
                type="button"
                aria-label="Templates"
                title="Templates"
                onClick={() => setTemplatesOpen(true)}
                className="tool-btn size-8"
              >
                <LayoutTemplate className="size-4" />
              </button>

              <button
                type="button"
                aria-label="Import file"
                title="Import image or JSON"
                onClick={() => fileRef.current?.click()}
                className="tool-btn size-8"
              >
                <ImageIcon className="size-4" />
              </button>

              <button
                type="button"
                aria-label="Export"
                title="Export"
                onClick={() => setExportOpen((v) => !v)}
                className="tool-btn size-8"
              >
                <Download className="size-4" />
              </button>

              <button
                type="button"
                aria-label="Cycle theme"
                title="Cycle theme"
                onClick={() => {
                  const i = THEMES.findIndex((t) => t.id === themeId);
                  setThemeId(THEMES[(i + 1) % THEMES.length]!.id);
                }}
                className="tool-btn size-8"
              >
                {themeId === "light" || themeId === "sand" ? (
                  <Sun className="size-4" />
                ) : (
                  <Moon className="size-4" />
                )}
              </button>

              <button
                type="button"
                aria-label="Presentation mode"
                title="Presentation mode"
                onClick={() => setPresenting(true)}
                className="tool-btn size-8"
              >
                <Maximize className="size-4" />
              </button>
            </div>
          </div>
        </header>
      )}

      {!presenting && inspectorOpen && (
        <div 
          className="pointer-events-none absolute right-3 top-16 z-[100]"
          style={{ isolation: 'isolate' }}
        >
          <div className="pointer-events-auto">
            <Inspector engine={engine} tick={tick} />
          </div>
        </div>
      )}

      {exportOpen && !presenting && (
        <div 
          className="glass-strong absolute right-3 top-16 z-[105] w-48 rounded-xl p-1.5 text-sm"
          style={{ isolation: 'isolate' }}
        >
          {[
            { label: "PNG image", run: () => void exportImage(engine, "png") },
            { label: "JPG image", run: () => void exportImage(engine, "jpeg") },
            { label: "WEBP image", run: () => void exportImage(engine, "webp") },
            { label: "SVG vector", run: () => exportSvg(engine) },
            { label: "PDF (print)", run: () => exportPdf(engine) },
            { label: "JSON project", run: () => exportJson(engine) },
            { label: "Copy to clipboard", run: () => void copyImageToClipboard(engine) },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => {
                o.run();
                setExportOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <FileJson className="size-3.5" /> {o.label}
            </button>
          ))}
        </div>
      )}

      {/* Bottom center toolbar */}
      {!presenting && (
        <>
          {/* Brush Panel - opens above toolbar */}
          {brushPanelOpen &&
            (engine.tool === "draw" || engine.tool === "eraser") && (
              <div 
                className="pointer-events-none absolute bottom-20 left-1/2 z-[110] -translate-x-1/2"
                style={{ isolation: 'isolate' }}
              >
                <div className="pointer-events-auto">
                  <BrushPanel 
                    engine={engine} 
                    tick={tick} 
                    onClose={() => setBrushPanelOpen(false)}
                  />
                </div>
              </div>
            )}
          
          {/* Toolbar - bottom center */}
          <div 
            className="pointer-events-none absolute bottom-4 left-1/2 z-[100] -translate-x-1/2"
            style={{ isolation: 'isolate' }}
          >
            <div className="pointer-events-auto">
              <Toolbar
                tool={engine.tool}
                onSelect={(t) => {
                  if (t === "draw" || t === "eraser") {
                    if (engine.tool === t) {
                      setBrushPanelOpen((open) => !open);
                    } else {
                      engine.setTool(t);
                      setBrushPanelOpen(true);
                    }
                    return;
                  }
                  engine.setTool(t);
                  setBrushPanelOpen(false);
                }}
                engine={engine}
              />
            </div>
          </div>
        </>
      )}

      {/* Bottom bar */}
      {!presenting && (
        <>
          <div 
            className="pointer-events-none absolute inset-x-0 top-3 z-[100] flex justify-center"
            style={{ isolation: 'isolate' }}
          >
            <div className="pointer-events-auto">
              <PageTabs engine={engine} tick={tick} />
            </div>
          </div>

          <div 
            className="pointer-events-none absolute bottom-3 left-3 z-[100]"
            style={{ isolation: 'isolate' }}
          >
            <StatusBar engine={engine} tick={tick} />
          </div>

          <div 
            className="pointer-events-none absolute bottom-3 right-3 z-[100] flex items-end gap-2"
            style={{ isolation: 'isolate' }}
          >
            <PageControlsBar engine={engine} tick={tick} />
          </div>
        </>
      )}

      {presenting && (
        <button
          type="button"
          onClick={() => setPresenting(false)}
          className="glass absolute right-3 top-3 z-[100] rounded-xl px-3 py-2 text-xs"
        >
          Exit presentation (Esc)
        </button>
      )}

      {/* Context menu */}
      {menu && (
        <div
          className="glass-strong absolute z-[120] w-52 rounded-xl p-1.5"
          style={{ left: menu.x, top: menu.y, isolation: 'isolate' }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {[
            { label: "Duplicate", run: () => engine.duplicateSelection() },
            { label: "Delete", run: () => engine.deleteSelection() },
            { label: "Bring to front", run: () => engine.reorder("front") },
            { label: "Send to back", run: () => engine.reorder("back") },
            { label: "Lock / unlock", run: () => engine.toggleLock() },
            { label: "Select all", run: () => engine.selectAll() },
            { label: "Zoom to fit", run: () => engine.zoomToFit() },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                item.run();
                setMenu(null);
              }}
              className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Templates */}
      {templatesOpen && (
        <div
          className="absolute inset-0 z-[130] flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm"
          onClick={() => setTemplatesOpen(false)}
        >
          <div
            className="glass-strong w-full max-w-2xl rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">Templates</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Insert a ready-made framework at the current viewport.
            </p>
            <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => insertTemplate(t.id)}
                  className="rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted"
                >
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground">{t.category}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Command palette */}
      {palette && (
        <div
          className="absolute inset-0 z-[140] flex items-start justify-center bg-background/60 p-4 pt-24 backdrop-blur-sm"
          onClick={() => setPalette(false)}
        >
          <div
            className="glass-strong w-full max-w-lg overflow-hidden rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtered[0]) {
                  filtered[0].run();
                  setPalette(false);
                  setQuery("");
                }
              }}
              placeholder="Search commands…"
              aria-label="Search commands"
              className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none"
            />
            <div className="max-h-80 overflow-y-auto p-1.5">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    c.run();
                    setPalette(false);
                    setQuery("");
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {c.label}
                </button>
              ))}
              {!filtered.length && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No commands found
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/json"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.type.startsWith("image/")) await insertImage(file);
          else {
            const snap = importJson(await file.text());
            if (snap) engine.loadSnapshot(snap);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}