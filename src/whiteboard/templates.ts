import { DEFAULT_STYLE, uid } from "./engine";
import type { ElementStyle, ElementType, WBElement } from "./types";

interface Spec {
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  style?: Partial<ElementStyle>;
}

const PALETTE = ["#fbbf24", "#38bdf8", "#34d399", "#f472b6", "#a3e635", "#fb923c"];

function make(spec: Spec, layerId: string): WBElement {
  return {
    id: uid(),
    type: spec.type,
    x: spec.x,
    y: spec.y,
    w: spec.w,
    h: spec.h,
    angle: 0,
    layerId,
    locked: false,
    style: { ...DEFAULT_STYLE, ...spec.style },
    seed: Math.floor(Math.random() * 100000),
    version: 0,
    ...(spec.text !== undefined ? { text: spec.text } : {}),
    ...(spec.type === "line" || spec.type === "arrow"
      ? {
          points: [
            { x: 0, y: 0, p: 1 },
            { x: spec.w, y: spec.h, p: 1 },
          ],
        }
      : {}),
  };
}

const title = (text: string, x: number, y: number): Spec => ({
  type: "text",
  x,
  y,
  w: 420,
  h: 40,
  text,
  style: { fontSize: 30, fontWeight: 700 },
});

const note = (text: string, x: number, y: number, color: string): Spec => ({
  type: "sticky",
  x,
  y,
  w: 180,
  h: 180,
  text,
  style: { fill: color, stroke: "#151007", fontSize: 16, fontWeight: 500 },
});

const card = (text: string, x: number, y: number, w = 220, h = 90): Spec => ({
  type: "rect",
  x,
  y,
  w,
  h,
  text,
  style: {
    fill: "rgba(255,255,255,0.05)",
    stroke: "#8ab4f8",
    fontSize: 16,
    textAlign: "center",
  },
});

const link = (x: number, y: number, w: number, h: number): Spec => ({
  type: "arrow",
  x,
  y,
  w,
  h,
  style: { stroke: "#94a3b8", strokeWidth: 2 },
});

export interface TemplateDef {
  id: string;
  name: string;
  category: string;
  build: () => Spec[];
}

const grid = (cols: string[], rows: number, startX: number, startY: number): Spec[] => {
  const out: Spec[] = [];
  cols.forEach((c, i) => {
    const x = startX + i * 260;
    out.push({
      type: "rect",
      x,
      y: startY,
      w: 230,
      h: 60 + rows * 200,
      style: { fill: "rgba(255,255,255,0.04)", stroke: "#3f4a5c", radius: 16 },
    });
    out.push({
      type: "text",
      x: x + 16,
      y: startY + 16,
      w: 200,
      h: 30,
      text: c,
      style: { fontSize: 20, fontWeight: 700 },
    });
    for (let r = 0; r < rows; r++) {
      out.push(
        note(`Task ${i + 1}.${r + 1}`, x + 24, startY + 70 + r * 200, PALETTE[i % PALETTE.length]!),
      );
    }
  });
  return out;
};

export const TEMPLATES: TemplateDef[] = [
  {
    id: "kanban",
    name: "Kanban board",
    category: "Planning",
    build: () => [
      title("Sprint board", 0, -70),
      ...grid(["Backlog", "In progress", "Review", "Done"], 2, 0, 0),
    ],
  },
  {
    id: "mindmap",
    name: "Mind map",
    category: "Ideation",
    build: () => {
      const out: Spec[] = [
        {
          type: "ellipse",
          x: 380,
          y: 260,
          w: 240,
          h: 120,
          text: "Central idea",
          style: {
            fill: "#38bdf8",
            stroke: "#04202e",
            textAlign: "center",
            fontSize: 20,
            fontWeight: 700,
          },
        },
      ];
      const spokes = [
        [60, 40],
        [760, 40],
        [60, 500],
        [760, 500],
      ];
      spokes.forEach(([x, y], i) => {
        out.push(card(`Branch ${i + 1}`, x!, y!, 220, 90));
        out.push(link(x! + 110, y! + 45, 500 - x! - 110 + (i % 2 === 1 ? -80 : 80), 320 - y! - 45));
      });
      return out;
    },
  },
  {
    id: "flowchart",
    name: "Flowchart",
    category: "Diagrams",
    build: () => [
      title("Process flow", 0, -70),
      {
        type: "ellipse",
        x: 60,
        y: 0,
        w: 200,
        h: 80,
        text: "Start",
        style: { fill: "#34d399", stroke: "#052e21", textAlign: "center" },
      },
      link(160, 80, 0, 80),
      card("Collect input", 50, 160, 220, 90),
      link(160, 250, 0, 80),
      {
        type: "diamond",
        x: 40,
        y: 330,
        w: 240,
        h: 160,
        text: "Valid?",
        style: { fill: "rgba(251,191,36,0.15)", stroke: "#fbbf24", textAlign: "center" },
      },
      link(280, 410, 180, 0),
      card("Handle error", 460, 365, 220, 90),
      link(160, 490, 0, 90),
      {
        type: "ellipse",
        x: 60,
        y: 580,
        w: 200,
        h: 80,
        text: "Done",
        style: { fill: "#f472b6", stroke: "#2e0418", textAlign: "center" },
      },
    ],
  },
  {
    id: "swot",
    name: "SWOT analysis",
    category: "Strategy",
    build: () => {
      const labels = ["Strengths", "Weaknesses", "Opportunities", "Threats"];
      const colors = ["#34d399", "#f87171", "#38bdf8", "#fbbf24"];
      return [
        title("SWOT", 0, -70),
        ...labels.map((label, i) => ({
          type: "rect" as ElementType,
          x: (i % 2) * 420,
          y: Math.floor(i / 2) * 320,
          w: 400,
          h: 300,
          text: label,
          style: {
            fill: `${colors[i]}22`,
            stroke: colors[i]!,
            radius: 18,
            fontSize: 22,
            fontWeight: 700,
            textAlign: "center" as const,
          },
        })),
      ];
    },
  },
  {
    id: "retro",
    name: "Retrospective",
    category: "Planning",
    build: () => [title("Retro", 0, -70), ...grid(["Went well", "To improve", "Actions"], 2, 0, 0)],
  },
  {
    id: "timeline",
    name: "Timeline / roadmap",
    category: "Planning",
    build: () => {
      const out: Spec[] = [
        title("Roadmap", 0, -70),
        { type: "line", x: 0, y: 200, w: 1100, h: 0, style: { stroke: "#64748b", strokeWidth: 3 } },
      ];
      ["Q1", "Q2", "Q3", "Q4"].forEach((q, i) => {
        out.push({
          type: "ellipse",
          x: i * 280 - 10,
          y: 186,
          w: 28,
          h: 28,
          style: { fill: "#38bdf8", stroke: "#38bdf8" },
        });
        out.push(note(`${q} goals`, i * 280 - 70, i % 2 === 0 ? 20 : 260, PALETTE[i]!));
      });
      return out;
    },
  },
  {
    id: "bmc",
    name: "Business model canvas",
    category: "Strategy",
    build: () => {
      const cells: [string, number, number, number, number][] = [
        ["Key partners", 0, 0, 220, 300],
        ["Key activities", 230, 0, 220, 145],
        ["Key resources", 230, 155, 220, 145],
        ["Value proposition", 460, 0, 220, 300],
        ["Customer relationships", 690, 0, 220, 145],
        ["Channels", 690, 155, 220, 145],
        ["Customer segments", 920, 0, 220, 300],
        ["Cost structure", 0, 310, 560, 160],
        ["Revenue streams", 580, 310, 560, 160],
      ];
      return [
        title("Business model canvas", 0, -70),
        ...cells.map(([label, x, y, w, h]) => ({
          type: "rect" as ElementType,
          x,
          y,
          w,
          h,
          text: label,
          style: {
            fill: "rgba(255,255,255,0.04)",
            stroke: "#475569",
            radius: 14,
            fontSize: 16,
            fontWeight: 600,
            textAlign: "center" as const,
          },
        })),
      ];
    },
  },
  {
    id: "orgchart",
    name: "Org chart",
    category: "Diagrams",
    build: () => {
      const out: Spec[] = [card("CEO", 440, 0, 220, 80)];
      ["CTO", "COO", "CFO"].forEach((role, i) => {
        out.push(card(role, i * 320 + 120, 220, 220, 80));
        out.push(link(550, 80, i * 320 + 230 - 550, 140));
      });
      return out;
    },
  },
];

export function buildTemplate(
  templateId: string,
  layerId: string,
  offsetX: number,
  offsetY: number,
): WBElement[] {
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return [];
  return tpl
    .build()
    .map((spec) => make({ ...spec, x: spec.x + offsetX, y: spec.y + offsetY }, layerId));
}
