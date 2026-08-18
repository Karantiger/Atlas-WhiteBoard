import { useState } from "react";
import {
  MousePointer2,
  Hand,
  Lasso,
  Pen,
  Eraser,
  Square,
  Circle,
  Diamond,
  Triangle,
  Star,
  Minus,
  ArrowRight,
  Type,
  StickyNote,
  Spline,
  Undo2,
  Redo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ToolId } from "@/whiteboard/types";
import type { WhiteboardEngine } from "@/whiteboard/engine";
import { cn } from "@/lib/utils";

interface ToolDef {
  id: ToolId;
  label: string;
  icon: LucideIcon;
  key: string;
}

interface ToolGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  tools: ToolDef[];
}

export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: "selection",
    label: "Selection",
    icon: MousePointer2,
    tools: [
      { id: "select", label: "Select", icon: MousePointer2, key: "V" },
      { id: "lasso", label: "Lasso", icon: Lasso, key: "Q" },
      { id: "hand", label: "Pan", icon: Hand, key: "H" },
    ],
  },
  {
    id: "shapes",
    label: "Shapes",
    icon: Square,
    tools: [
      { id: "rect", label: "Rectangle", icon: Square, key: "R" },
      { id: "ellipse", label: "Ellipse", icon: Circle, key: "O" },
      { id: "diamond", label: "Diamond", icon: Diamond, key: "D" },
      { id: "triangle", label: "Triangle", icon: Triangle, key: "G" },
      { id: "star", label: "Star", icon: Star, key: "F" },
    ],
  },
  {
    id: "lines",
    label: "Lines",
    icon: Minus,
    tools: [
      { id: "line", label: "Line", icon: Minus, key: "L" },
      { id: "arrow", label: "Arrow", icon: ArrowRight, key: "A" },
      { id: "connector", label: "Connector", icon: Spline, key: "C" },
    ],
  },
  {
    id: "text",
    label: "Text",
    icon: Type,
    tools: [
      { id: "text", label: "Text", icon: Type, key: "T" },
      { id: "sticky", label: "Sticky", icon: StickyNote, key: "N" },
    ],
  },
];

export function Toolbar({
  tool,
  onSelect,
  orientation = "horizontal",
  engine,
}: {
  tool: ToolId;
  onSelect: (t: ToolId) => void;
  orientation?: "vertical" | "horizontal";
  engine?: WhiteboardEngine;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const findActiveGroup = (toolId: ToolId): string | null => {
    for (const group of TOOL_GROUPS) {
      if (group.tools.some((t) => t.id === toolId)) {
        return group.id;
      }
    }
    return null;
  };

  const activeGroupId = findActiveGroup(tool);

  return (
      <div
        role="toolbar"
        aria-label="Drawing tools"
        aria-orientation="horizontal"
        className="glass pointer-events-auto flex items-center gap-0.5 rounded-2xl p-1 shadow-xl"
        style={{
          willChange: 'transform, opacity',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitTransform: 'translateZ(0)',
          WebkitBackfaceVisibility: 'hidden',
          isolation: 'isolate',
          contain: 'layout paint',
        }}
      >
      {/* Undo */}
      <button
        type="button"
        aria-label="Undo"
        title="Undo (⌘Z)"
        onClick={() => engine?.undo()}
        className="flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:bg-muted/70"
      >
        <Undo2 className="size-5" strokeWidth={1.9} />
      </button>

      {/* Redo */}
      <button
        type="button"
        aria-label="Redo"
        title="Redo (⇧⌘Z)"
        onClick={() => engine?.redo()}
        className="flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:bg-muted/70"
      >
        <Redo2 className="size-5" strokeWidth={1.9} />
      </button>

      {/* Divider */}
      <div className="mx-1 h-8 w-px bg-border" />

      {/* Selection Group */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setOpenGroup(openGroup === "selection" ? null : "selection");
          }}
          aria-label="Selection tools"
          title="Selection Tools"
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:bg-muted/70",
            activeGroupId === "selection" && "bg-primary/10",
          )}
        >
          <MousePointer2 
            className={cn(
              "size-5",
              activeGroupId === "selection" ? "text-primary" : "text-muted-foreground",
            )} 
            strokeWidth={activeGroupId === "selection" ? 2.4 : 1.9} 
          />
        </button>
        
        {openGroup === "selection" && (
          <DropdownPanel 
            group={TOOL_GROUPS[0]!} 
            tool={tool} 
            onSelect={onSelect} 
            onClose={() => setOpenGroup(null)}
            direction="up"
          />
        )}
      </div>

      {/* Divider */}
      <div className="mx-1 h-8 w-px bg-border" />

      {/* Pen - Standalone */}
      <ToolButton id="draw" label="Pen" tool={tool} onSelect={onSelect}>
        <Pen className="size-5" strokeWidth={tool === "draw" ? 2.4 : 1.9} />
      </ToolButton>

      {/* Eraser - Standalone */}
      <ToolButton id="eraser" label="Eraser" tool={tool} onSelect={onSelect}>
        <Eraser className="size-5" strokeWidth={tool === "eraser" ? 2.4 : 1.9} />
      </ToolButton>

      {/* Divider */}
      <div className="mx-1 h-8 w-px bg-border" />

      {/* Shapes Group */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setOpenGroup(openGroup === "shapes" ? null : "shapes");
          }}
          aria-label="Shape tools"
          title="Shapes"
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:bg-muted/70",
            activeGroupId === "shapes" && "bg-primary/10",
          )}
        >
          <Square 
            className={cn(
              "size-5",
              activeGroupId === "shapes" ? "text-primary" : "text-muted-foreground",
            )} 
            strokeWidth={activeGroupId === "shapes" ? 2.4 : 1.9} 
          />
        </button>
        
        {openGroup === "shapes" && (
          <DropdownPanel 
            group={TOOL_GROUPS[1]!} 
            tool={tool} 
            onSelect={onSelect} 
            onClose={() => setOpenGroup(null)}
            direction="up"
          />
        )}
      </div>

      {/* Lines Group */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setOpenGroup(openGroup === "lines" ? null : "lines");
          }}
          aria-label="Line tools"
          title="Lines"
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:bg-muted/70",
            activeGroupId === "lines" && "bg-primary/10",
          )}
        >
          <Minus 
            className={cn(
              "size-5",
              activeGroupId === "lines" ? "text-primary" : "text-muted-foreground",
            )} 
            strokeWidth={activeGroupId === "lines" ? 2.4 : 1.9} 
          />
        </button>
        
        {openGroup === "lines" && (
          <DropdownPanel 
            group={TOOL_GROUPS[2]!} 
            tool={tool} 
            onSelect={onSelect} 
            onClose={() => setOpenGroup(null)}
            direction="up"
          />
        )}
      </div>

      {/* Text Group */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setOpenGroup(openGroup === "text" ? null : "text");
          }}
          aria-label="Text tools"
          title="Text"
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:bg-muted/70",
            activeGroupId === "text" && "bg-primary/10",
          )}
        >
          <Type 
            className={cn(
              "size-5",
              activeGroupId === "text" ? "text-primary" : "text-muted-foreground",
            )} 
            strokeWidth={activeGroupId === "text" ? 2.4 : 1.9} 
          />
        </button>
        
        {openGroup === "text" && (
          <DropdownPanel 
            group={TOOL_GROUPS[3]!} 
            tool={tool} 
            onSelect={onSelect} 
            onClose={() => setOpenGroup(null)}
            direction="up"
          />
        )}
      </div>
    </div>
  );
}

// Helper Components
function ToolButton({
  id,
  label,
  tool,
  onSelect,
  children,
}: {
  id: ToolId;
  label: string;
  tool: ToolId;
  onSelect: (t: ToolId) => void;
  children: React.ReactNode;
}) {
  const active = tool === id;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:bg-muted/70",
        active && "bg-primary/10",
      )}
    >
      {children}
    </button>
  );
}

function DropdownPanel({
  group,
  tool,
  onSelect,
  onClose,
  direction = "up",
}: {
  group: ToolGroup;
  tool: ToolId;
  onSelect: (t: ToolId) => void;
  onClose: () => void;
  direction?: "up" | "down";
}) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      
      {/* Panel - Opens upward */}
      <div
        className={cn(
          "absolute left-0 z-50 w-44 rounded-xl border border-border bg-background/95 p-1 shadow-2xl backdrop-blur-sm",
          direction === "up" ? "bottom-full mb-1" : "top-full mt-1",
        )}
      >
        {/* Panel header */}
        <div className="flex items-center gap-1.5 border-b border-border/50 px-2 py-1.5">
          <group.icon className="size-3.5 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label}
          </span>
        </div>
        
        {/* Tools */}
        <div className="mt-0.5 flex flex-col">
          {group.tools.map((t) => {
            const Icon = t.icon;
            const active = tool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onSelect(t.id);
                  onClose();
                }}
                aria-label={`${t.label} (${t.key})`}
                aria-pressed={active}
                title={`${t.label} - ${t.key}`}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all hover:bg-muted/60",
                  active && "bg-primary/10 hover:bg-primary/15",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                  strokeWidth={active ? 2.4 : 1.9}
                />
                <span
                  className={cn(
                    "flex-1 text-xs",
                    active ? "font-semibold text-primary" : "text-muted-foreground",
                  )}
                >
                  {t.label}
                </span>
                <kbd
                  className={cn(
                    "rounded bg-muted px-1 text-[9px] font-mono",
                    active ? "text-primary" : "text-muted-foreground/50",
                  )}
                >
                  {t.key}
                </kbd>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}