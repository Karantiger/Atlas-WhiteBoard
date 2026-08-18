import { ChevronLeft, ChevronRight } from "lucide-react";
import type { WhiteboardEngine } from "@/whiteboard/engine";

interface PageTabsProps {
  engine: WhiteboardEngine;
  tick: number;
}

export function PageTabs({ engine, tick: _tick }: PageTabsProps) {
  const activeIndex = engine.pages.findIndex(
    (page) => page.id === engine.activePageId,
  );

  const currentPage = activeIndex + 1;
  const totalPages = engine.pages.length;

  const isFirstPage = activeIndex <= 0;
  const isLastPage = activeIndex >= totalPages - 1;

  const goToPreviousPage = () => {
    if (isFirstPage) return;

    const previousPage = engine.pages[activeIndex - 1];

    if (previousPage) {
      engine.setActivePage(previousPage.id);
    }
  };

  const goToNextPage = () => {
    const nextPage = engine.pages[activeIndex + 1];

    if (nextPage) {
      engine.setActivePage(nextPage.id);
      return;
    }

    engine.addPage();
  };

  return (
    <nav
      aria-label="Page navigation"
      className="glass pointer-events-auto flex items-center gap-1.5 rounded-2xl px-2 py-1.5"
    >
      <button
        type="button"
        aria-label="Previous page"
        title="Previous page"
        onClick={goToPreviousPage}
        disabled={isFirstPage}
        className="tool-btn size-7 shrink-0 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft className="size-4" />
      </button>

      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Pages
        </span>

        <span
          aria-live="polite"
          className="min-w-[38px] text-center text-xs font-semibold tabular-nums text-foreground"
        >
          {currentPage}
          <span className="mx-0.5 text-muted-foreground">/</span>
          {totalPages}
        </span>
      </div>

      <button
        type="button"
        aria-label={isLastPage ? "Create next page" : "Next page"}
        title={isLastPage ? "Create next page" : "Next page"}
        onClick={goToNextPage}
        className="tool-btn size-7 shrink-0"
      >
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}