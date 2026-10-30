// Bottom bar of the canvas. "Añadir dispositivo" opens a list of the device
// types with a search box: click, Enter or drag one onto the canvas to add it.
// The list floats over the canvas on the side of the bar with more room, so
// it stays in view wherever the bar was moved. The bar has room for more tools.
import { useReactFlow } from "@xyflow/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useMovable } from "../app/movable";
import { useStore } from "../app/store";
import { useT } from "../i18n";
import { DEVICE_DRAG_TYPE } from "../editor/Canvas";
import { TILE } from "../editor/DeviceNode";
import { Icon } from "../editor/icons";
import { Grip } from "./Grip";
import { addDevice, CATALOG, PALETTE, type DeviceType } from "@visual-tracert/model";

const GAP = 8;
const MARGIN = 12;
const PANEL_WIDTH = 400;

/** where the list fits: above or below the bar, as tall and as centred as the canvas allows */
function placePanel(bar: HTMLElement): CSSProperties {
  const area = (bar.offsetParent as HTMLElement | null)?.getBoundingClientRect();
  const box = bar.getBoundingClientRect();
  if(!area) return {};
  const above = box.top - area.top - GAP - MARGIN;
  const below = area.bottom - box.bottom - GAP - MARGIN;
  const width = Math.min(PANEL_WIDTH, area.width - 2 * MARGIN);
  // centred on the bar, pushed back inside the canvas near its edges
  const centred = box.left + box.width / 2 - width / 2;
  const left = Math.min(Math.max(centred, area.left + MARGIN), area.right - MARGIN - width) - box.left;
  const vertical = above >= below ? { bottom: `calc(100% + ${GAP}px)` } : { top: `calc(100% + ${GAP}px)` };
  return { ...vertical, left, width, maxHeight: Math.max(160, Math.max(above, below)) };
}

const plain = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function Palette() {
  const open = useStore(state => state.adding);
  const logShown = useStore(state => state.logLayout.dock !== "hidden");
  const frames = useStore(state => state.log.reduce((sum, item) => sum + item.events.length, 0));
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const movable = useMovable<HTMLDivElement>("bottom-bar");
  const root = movable.ref;
  const [placement, setPlacement] = useState<CSSProperties>({});
  const t = useT();
  const search = useRef<HTMLInputElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const setOpen = (value: boolean) => useStore.getState().setAdding(value);

  const matches = useMemo(() => {
    const words = plain(query).split(/\s+/).filter(Boolean);
    return PALETTE.filter(type => {
      const kind = CATALOG[type];
      // in the language shown and in Spanish, the words most labs use
      const text = plain(`${t(kind.label)} ${type} ${t(kind.description)} ${t(kind.keywords)} ${kind.label} ${kind.keywords}`);
      return words.every(word => text.includes(word));
    });
  }, [query, t]);

  useEffect(() => { setActive(0); }, [query]);
  // measured before it is painted, and again when the window changes size
  useLayoutEffect(() => {
    if(!open || !root.current) return;
    const place = () => root.current && setPlacement(placePanel(root.current));
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, movable.point]);

  useEffect(() => {
    if(!open){ setQuery(""); return; }
    search.current?.focus();
    const outside = (event: PointerEvent) => { if(!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const add = (type: DeviceType) => {
    const canvas = document.querySelector(".canvas")?.getBoundingClientRect();
    const centre = canvas
      ? screenToFlowPosition({ x: canvas.left + canvas.width / 2, y: canvas.top + canvas.height / 2 })
      : { x: 0, y: 0 };
    const state = useStore.getState();
    // a little apart from the last one added there
    const offset = (state.topology.devices.length % 5) * 24;
    const { topology, device } = addDevice(state.topology, type, { x: centre.x - TILE / 2 + offset, y: centre.y - TILE / 2 + offset }, t);
    state.commit(topology);
    state.select({ kind: "device", id: device.id });
    setOpen(false);
  };

  return (
    <div className="bottom-bar" ref={root} style={movable.style}>
      {open && (
        <div className="add-panel" role="dialog" aria-label={t("Añadir dispositivo")} style={placement}>
          <div className="add-search">
            <Icon name="search" size={17} />
            <input ref={search} value={query} placeholder={t("Buscar: router, wifi, servidor…")} aria-label={t("Buscar dispositivo")}
              aria-controls="device-list" aria-activedescendant={matches[active] ? `device-${matches[active]}` : undefined}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if(event.key === "Escape"){ event.preventDefault(); setOpen(false); }
                else if(event.key === "ArrowDown"){ event.preventDefault(); setActive(Math.min(active + 1, matches.length - 1)); }
                else if(event.key === "ArrowUp"){ event.preventDefault(); setActive(Math.max(active - 1, 0)); }
                else if(event.key === "Enter" && matches[active]){ event.preventDefault(); add(matches[active]); }
              }} />
          </div>
          <div className="add-list" id="device-list" role="listbox" aria-label={t("Dispositivos")}>
            {matches.map((type, index) => (
              <button key={type} id={`device-${type}`} type="button" role="option" aria-selected={index === active}
                className={`add-item${index === active ? " active" : ""}`} draggable
                title={t("Haz clic para añadirlo en el centro, o arrástralo al lienzo")}
                onMouseEnter={() => setActive(index)}
                onDragStart={event => {
                  event.dataTransfer.setData(DEVICE_DRAG_TYPE, type);
                  event.dataTransfer.effectAllowed = "copy";
                }}
                onDragEnd={() => setOpen(false)}
                onClick={() => add(type)}>
                <span className="add-icon"><Icon name={type} size={22} /></span>
                <span className="add-text"><strong>{t(CATALOG[type].label)}</strong><small>{t(CATALOG[type].description)}</small></span>
              </button>
            ))}
            {!matches.length && <p className="muted small add-empty">{t("Ningún dispositivo coincide con «{query}».", { query })}</p>}
          </div>
          <p className="add-hint muted small"><kbd>↑</kbd><kbd>↓</kbd> {t("elegir")} · <kbd>Enter</kbd> {t("añadir")} · {t("o arrástralo al lienzo")}</p>
        </div>
      )}
      <div className="bar" role="toolbar" aria-label={t("Lienzo")}>
        <Grip vertical {...movable.grip} label={t("Mover la barra")} />
        <button type="button" className={`bar-button${open ? " active" : ""}`} aria-expanded={open} aria-haspopup="dialog"
          title={t("Añadir dispositivo (A)")} onClick={() => setOpen(!open)}>
          <Icon name="plus" size={18} />{t("Añadir dispositivo")}
        </button>
        <span className="bar-sep" aria-hidden="true" />
        <button type="button" className={`bar-button${logShown ? " active" : ""}`} aria-pressed={logShown}
          title={t("Registro de paquetes (L)")} onClick={() => useStore.getState().toggleLog()}>
          <Icon name="log" size={18} />{t("Registro")}{frames > 0 && <span className="badge">{frames}</span>}
        </button>
      </div>
    </div>
  );
}
