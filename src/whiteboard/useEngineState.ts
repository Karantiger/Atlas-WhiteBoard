import { useSyncExternalStore } from "react";
import type { WhiteboardEngine } from "@/whiteboard/engine";

/** Re-renders the component whenever the engine emits a UI change. */
export function useEngineState(engine: WhiteboardEngine) {
  return useSyncExternalStore(
    engine.subscribe,
    () => engine.version,
    () => 0,
  );
}
