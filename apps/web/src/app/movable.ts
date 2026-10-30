// Things the user moves by a grip (the bars over the canvas): their position
// inside the parent, kept in localStorage; null is the place the CSS gives
// them. A double click on the grip puts them back there.
import { useT } from "../i18n";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

const KEY = "visual-tracert.positions";
type Point = { x: number; y: number };

function loadAll(): Record<string, Point> {
  try{
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return saved && typeof saved === "object" ? saved : {};
  }catch(_){
    return {};
  }
}

function save(name: string, point: Point | null) {
  const all = loadAll();
  if(point) all[name] = point; else delete all[name];
  try{ localStorage.setItem(KEY, JSON.stringify(all)); }catch(_){ /* ignore */ }
}

/** Follows the pointer from a pointerdown until it is released. */
export function followPointer(start: ReactPointerEvent, onMove: (dx: number, dy: number) => void, onEnd?: () => void) {
  start.preventDefault();
  const x = start.clientX, y = start.clientY;
  const move = (event: PointerEvent) => onMove(event.clientX - x, event.clientY - y);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    document.body.classList.remove("dragging");
    onEnd?.();
  };
  document.body.classList.add("dragging");
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

export function useMovable<T extends HTMLElement>(name: string) {
  const t = useT();
  const ref = useRef<T>(null);
  const [point, setPoint] = useState<Point | null>(() => loadAll()[name] ?? null);
  const latest = useRef(point);
  latest.current = point;

  const clamp = useCallback((next: Point): Point => {
    const element = ref.current, parent = element?.offsetParent as HTMLElement | null;
    if(!element || !parent) return next;
    return {
      x: Math.round(Math.min(Math.max(0, next.x), Math.max(0, parent.clientWidth - element.offsetWidth))),
      y: Math.round(Math.min(Math.max(0, next.y), Math.max(0, parent.clientHeight - element.offsetHeight))),
    };
  }, []);

  // a smaller window must not leave a bar outside
  useEffect(() => {
    const fit = () => { if(latest.current) setPoint(clamp(latest.current)); };
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [clamp]);

  const grip = {
    onPointerDown: (event: ReactPointerEvent) => {
      const element = ref.current;
      const parent = element?.offsetParent as HTMLElement | null;
      if(!element || !parent || event.button !== 0) return;
      // where it is on screen, centring transforms included
      const box = element.getBoundingClientRect(), frame = parent.getBoundingClientRect();
      const origin = { x: box.left - frame.left - parent.clientLeft, y: box.top - frame.top - parent.clientTop };
      followPointer(event, (dx, dy) => setPoint(clamp({ x: origin.x + dx, y: origin.y + dy })),
        () => { if(latest.current) save(name, latest.current); });
    },
    onDoubleClick: () => { setPoint(null); save(name, null); },
    title: t("Arrastra para mover · doble clic: volver a su sitio"),
  };

  const style: CSSProperties | undefined = point
    ? { left: point.x, top: point.y, right: "auto", bottom: "auto", transform: "none" }
    : undefined;

  return { ref, style, grip, moved: Boolean(point), point };
}
