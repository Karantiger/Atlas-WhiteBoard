import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Settings,
  Trash2,
  Copy,
  CheckSquare,
  Square,
  X,
  Check,
  Sparkles,
  Maximize2,
  Minimize2,
  StickyNote,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { PageState, WhiteboardEngine } from "@/whiteboard/engine";
import { renderScene } from "@/whiteboard/renderer";
import { cn } from "@/lib/utils";

interface PageControlsBarProps {
  engine: WhiteboardEngine;
  tick: number;
}

function PageThumbnail({
  page,
  engine,
}: {
  page: PageState;
  engine: WhiteboardEngine;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = 200;
    const height = 125;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const els = Array.from(page.elements.values());
    const pageSize = page.size ?? { w: 1920, h: 1080 };
    const bbox = { x: 0, y: 0, w: pageSize.w, h: pageSize.h };
    const scale = Math.min(width / bbox.w, height / bbox.h);
    const vp = {
      x: bbox.x - (width / scale - bbox.w) / 2,
      y: bbox.y - (height / scale - bbox.h) / 2,
      zoom: scale,
    };

    renderScene(
      ctx,
      {
        viewport: vp,
        width,
        height,
        dpr,
        theme: {
          canvas: "#141824",
          grid: "rgba(255,255,255,0.06)",
          gridStrong: "rgba(255,255,255,0.12)",
          selection: "#38bdf8",
          selectionFill: "transparent",
          text: "#e7e9ee",
        },
        gridMode: page.background.grid,
        selection: new Set(),
        elements: els,
        pageBox: pageSize,
        pageColor: page.background.color,
      },
      () => {},
    );
  }, [page, engine.version]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%" }}
      className="block rounded-lg object-cover"
    />
  );
}

const PAGE_SIZE_PRESETS = [
  { id: "a4_portrait", label: "A4 Portrait (794 × 1123)", w: 794, h: 1123 },
  { id: "a4_landscape", label: "A4 Landscape (1123 × 794)", w: 1123, h: 794 },
  { id: "16_9", label: "16:9 Screen (1920 × 1080)", w: 1920, h: 1080 },
  { id: "4_3", label: "4:3 Screen (1024 × 768)", w: 1024, h: 768 },
  { id: "square", label: "Square (1080 × 1080)", w: 1080, h: 1080 },
];

export function PageControlsBar({ engine, tick }: PageControlsBarProps) {
  void tick;

  const [previewsOpen, setPreviewsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const currentSize = engine.pageSize ?? { w: 1920, h: 1080 };
  
  const [customWidth, setCustomWidth] = useState<number>(currentSize.w);
  const [customHeight, setCustomHeight] = useState<number>(currentSize.h);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);

  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (engine.pageSize) {
      setCustomWidth(engine.pageSize.w);
      setCustomHeight(engine.pageSize.h);
    }
  }, [engine.pageSize?.w, engine.pageSize?.h]);

  // Close previews on outside click
  useEffect(() => {
    if (!previewsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-page-previews]')) {
        setPreviewsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [previewsOpen]);

  const openSelectionModal = () => {
    setSelectedPageIds([]);
    setSelectionOpen(true);
  };

  const toggleSelectPage = (id: string) => {
    setSelectedPageIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const selectAllPages = () => {
    if (selectedPageIds.length === engine.pages.length) {
      setSelectedPageIds([]);
    } else {
      setSelectedPageIds(engine.pages.map((p) => p.id));
    }
  };

  const handleDeleteSelectedPages = () => {
    if (selectedPageIds.length === 0) return;
    if (selectedPageIds.length >= engine.pages.length) {
      alert("At least one page must remain on the board.");
      return;
    }

    for (const id of selectedPageIds) {
      engine.removePage(id);
    }
    setSelectedPageIds([]);
    setSelectionOpen(false);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* fullscreen denied */
    }
  };

  return (
    <>
      <div className="relative flex items-center gap-1">
        {previewsOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setPreviewsOpen(false)}
            />
            
            <div 
              data-page-previews
              className="absolute bottom-full right-0 z-50 mb-2 w-[360px] overflow-hidden rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur-sm"
            >
              <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <StickyNote className="size-4 text-primary" />
                  <span className="text-xs font-bold">Pages ({engine.pages.length})</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => engine.addPage()}
                    className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="size-3" /> Add
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewsOpen(false);
                    }}
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Close pages panel"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>

              <div className="max-h-[45vh] overflow-y-auto p-2.5">
                <div className="space-y-1.5">
                  {engine.pages.map((page, index) => {
                    const isActive = page.id === engine.activePageId;
                    const elementCount = page.elements.size;
                    const pageSize = page.size ?? { w: 1920, h: 1080 };

                    return (
                      <div
                        key={page.id}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-lg border p-2 transition-all cursor-pointer",
                          isActive
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-muted/50",
                        )}
                        onClick={() => {
                          engine.setActivePage(page.id);
                          setPreviewsOpen(false);
                        }}
                      >
                        <div className="relative h-[50px] w-[80px] shrink-0 overflow-hidden rounded-md border border-border/60 bg-black/40">
                          <PageThumbnail page={page} engine={engine} />
                          {isActive && (
                            <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-bold text-primary-foreground">
                              <Sparkles className="size-2" /> Active
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-[9px] font-bold text-muted-foreground">
                              {index + 1}
                            </span>
                            <p className="truncate text-xs font-semibold text-foreground">
                              {page.name}
                            </p>
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {elementCount} elements · {pageSize.w}×{pageSize.h}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            title="Duplicate Page"
                            onClick={(e) => {
                              e.stopPropagation();
                              engine.duplicatePage(page.id);
                            }}
                            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/20 hover:text-primary"
                          >
                            <Copy className="size-3.5" />
                          </button>
                          {engine.pages.length > 1 && (
                            <button
                              type="button"
                              title="Delete Page"
                              onClick={(e) => {
                                e.stopPropagation();
                                engine.removePage(page.id);
                              }}
                              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Main Bar - More compact */}
        <div
          className="glass pointer-events-auto flex items-center gap-0.5 rounded-2xl p-1 shadow-2xl transition-all duration-300"
          style={{
            isolation: 'isolate',
            willChange: 'transform',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {/* Expand/Collapse Toggle */}
          <button
            type="button"
            title={expanded ? "Collapse" : "Expand"}
            aria-label={expanded ? "Collapse controls" : "Expand controls"}
            onClick={() => setExpanded((v) => !v)}
            className="tool-btn flex size-8 items-center justify-center rounded-lg transition-all"
          >
            {expanded ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </button>

          {expanded && (
            <>
              <span className="h-5 w-px bg-border" />

              <button
                type="button"
                title="Page Previews"
                aria-label="Page Previews"
                onClick={() => setPreviewsOpen((v) => !v)}
                className={cn(
                  "tool-btn relative flex size-8 items-center justify-center rounded-lg transition-all",
                  previewsOpen && "tool-btn-active",
                )}
              >
                <StickyNote className="size-4" />
                <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground shadow-sm">
                  {engine.pages.length}
                </span>
              </button>

              <button
                type="button"
                title="Add New Page"
                aria-label="Add Page"
                onClick={() => engine.addPage()}
                className="tool-btn flex size-8 items-center justify-center rounded-lg transition-all hover:bg-primary/20 hover:text-primary"
              >
                <Plus className="size-4" />
              </button>

              <button
                type="button"
                title="Page Settings"
                aria-label="Page Settings"
                onClick={() => {
                  setCustomWidth(currentSize.w);
                  setCustomHeight(currentSize.h);
                  setSettingsOpen(true);
                }}
                className={cn(
                  "tool-btn flex size-8 items-center justify-center rounded-lg transition-all",
                  settingsOpen && "tool-btn-active",
                )}
              >
                <Settings className="size-4" />
              </button>

              <button
                type="button"
                title={full ? "Exit fullscreen" : "Fullscreen"}
                aria-label="Toggle fullscreen"
                onClick={() => void toggleFullscreen()}
                className={cn(
                  "tool-btn flex size-8 items-center justify-center rounded-lg transition-all",
                  full && "tool-btn-active",
                )}
              >
                {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </button>

              <span className="mx-0.5 h-5 w-px bg-border" />

              <button
                type="button"
                title="Select & Delete Multiple Pages"
                aria-label="Page Selection Tool"
                onClick={openSelectionModal}
                className={cn(
                  "tool-btn flex size-8 items-center justify-center rounded-lg transition-all hover:bg-destructive/20 hover:text-destructive",
                  selectionOpen && "tool-btn-active",
                )}
              >
                <CheckSquare className="size-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* MODAL: Page Settings */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 pointer-events-auto flex items-center justify-center bg-background/70 p-4 backdrop-blur-md"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="glass-strong w-full max-w-md rounded-3xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="size-5 text-primary" />
                <h2 className="text-base font-bold">Page Canvas Settings</h2>
              </div>
              <button 
                type="button" 
                onClick={() => setSettingsOpen(false)} 
                className="tool-btn size-8"
                aria-label="Close settings"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mb-4 space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Canvas Size Presets</label>
              <div className="grid grid-cols-1 gap-1.5">
                {PAGE_SIZE_PRESETS.map((preset) => {
                  const isSelected = currentSize.w === preset.w && currentSize.h === preset.h;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        engine.setPageSize({ w: preset.w, h: preset.h });
                        setCustomWidth(preset.w);
                        setCustomHeight(preset.h);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs transition-all",
                        isSelected
                          ? "border-primary bg-primary/10 font-bold text-primary"
                          : "border-border/60 hover:bg-muted/60 text-foreground",
                      )}
                    >
                      <span>{preset.label}</span>
                      {isSelected && <Check className="size-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-muted/30 p-3.5">
              <label className="mb-2 block text-xs font-semibold">Custom Page Dimensions</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] text-muted-foreground">Width (px)</span>
                  <input
                    type="number"
                    min="100"
                    max="10000"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Height (px)</span>
                  <input
                    type="number"
                    min="100"
                    max="10000"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (customWidth > 0 && customHeight > 0) {
                    engine.setPageSize({ w: customWidth, h: customHeight });
                    setSettingsOpen(false);
                  }
                }}
                className="mt-3 w-full rounded-xl bg-primary py-2 text-xs font-semibold text-primary-foreground"
              >
                Apply Custom Size
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Multi-Page Delete */}
      {selectionOpen && (
        <div
          className="fixed inset-0 z-50 pointer-events-auto flex items-center justify-center bg-background/70 p-4 backdrop-blur-md"
          onClick={() => setSelectionOpen(false)}
        >
          <div
            className="glass-strong flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="size-5 text-destructive" />
                <div>
                  <h2 className="text-base font-bold">Select Pages to Delete</h2>
                  <p className="text-xs text-muted-foreground">Select multiple pages to remove.</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectionOpen(false)} 
                className="tool-btn size-8"
                aria-label="Close selection"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mb-3 flex items-center justify-between bg-muted/40 rounded-xl p-2.5">
              <button type="button" onClick={selectAllPages} className="flex items-center gap-2 text-xs font-semibold hover:text-primary">
                {selectedPageIds.length === engine.pages.length ? (
                  <CheckSquare className="size-4 text-primary" />
                ) : (
                  <Square className="size-4 text-muted-foreground" />
                )}
                Select All ({selectedPageIds.length}/{engine.pages.length})
              </button>
              <button
                type="button"
                disabled={selectedPageIds.length === 0}
                onClick={handleDeleteSelectedPages}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold",
                  selectedPageIds.length > 0
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-muted text-muted-foreground cursor-not-allowed opacity-50",
                )}
              >
                <Trash2 className="size-3.5" /> Delete ({selectedPageIds.length})
              </button>
            </div>

            <div className="grid max-h-[50vh] flex-1 grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
              {engine.pages.map((page, index) => {
                const isSelected = selectedPageIds.includes(page.id);
                const isActive = page.id === engine.activePageId;
                const pageSize = page.size ?? { w: 1920, h: 1080 };

                return (
                  <div
                    key={page.id}
                    onClick={() => toggleSelectPage(page.id)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all",
                      isSelected
                        ? "border-destructive bg-destructive/10 ring-2 ring-destructive/30"
                        : "border-border bg-background/30 hover:bg-muted/30",
                    )}
                  >
                    <div className={cn(
                      "flex size-5 items-center justify-center rounded-md border",
                      isSelected ? "border-destructive bg-destructive text-destructive-foreground" : "border-border bg-background",
                    )}>
                      {isSelected && <Check className="size-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="flex size-4 items-center justify-center rounded bg-muted text-[9px] font-bold">
                          {index + 1}
                        </span>
                        <p className="truncate text-xs font-semibold">{page.name}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {page.elements.size} objects · {pageSize.w}×{pageSize.h} {isActive && "· Active"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}