import { createFileRoute } from "@tanstack/react-router";
import { WhiteboardApp } from "@/components/whiteboard/WhiteboardApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Atlas Whiteboard - Infinite canvas for teams" },
      {
        name: "description",
        content:
          "Atlas is a fast infinite whiteboard: pressure-aware brushes, shapes, sticky notes, layers, templates and instant PNG/SVG/PDF export.",
      },
      { property: "og:title", content: "Atlas Whiteboard — Infinite canvas for teams" },
      {
        property: "og:description",
        content:
          "Draw, diagram and plan on an infinite canvas with layers, templates, smart guides and export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main>
      <h1 className="sr-only">Atlas Whiteboard</h1>
      <WhiteboardApp />
    </main>
  );
}
