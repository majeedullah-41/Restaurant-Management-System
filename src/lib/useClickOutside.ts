import { useEffect, useRef } from "react";

export function useClickOutside<T extends HTMLElement = HTMLDivElement>(
  onOutside: () => void
) {
  const ref = useRef<T | null>(null);
  const callbackRef = useRef(onOutside);
  callbackRef.current = onOutside;

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent | PointerEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) {
        callbackRef.current();
      }
    };
    // Capture phase + pointerdown so clicks are caught even if another
    // handler stops propagation, and before focus/blur events race.
    window.addEventListener("pointerdown", handler, true);
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      window.removeEventListener("pointerdown", handler, true);
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  return ref;
}
