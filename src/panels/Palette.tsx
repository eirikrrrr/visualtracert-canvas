// Bottom bar of the canvas. "Añadir dispositivo" opens a list of the device
// types with a search box: click, Enter or drag one onto the canvas to add it.
// The bar has room for more tools.
import { useReactFlow } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMovable } from "../app/movable";
import { useStore } from "../app/store";
import { DEVICE_DRAG_TYPE } from "../editor/Canvas";
import { TILE } from "../editor/DeviceNode";
import { Icon } from "../editor/icons";
import { Grip } from "./Grip";
import { CATALOG, PALETTE } from "../model/catalog";
import { addDevice } from "../model/topology";
import type { DeviceType } from "../model/types";

const plain = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function Palette() {
  const open = useStore(state => state.adding);
  const logShown = useStore(state => state.logLayout.dock !== "hidden");
  const frames = useStore(state => state.log.reduce((sum, item) => sum + item.events.length, 0));
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const movable = useMovable<HTMLDivElement>("bottom-bar");
  const root = movable.ref;
  // moved near the top, the list opens below the bar so it stays in view
  const below = Boolean(movable.point && movable.point.y < 460);
  const search = useRef<HTMLInputElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const setOpen = (value: boolean) => useStore.getState().setAdding(value);

  const matches = useMemo(() => {
    const words = plain(query).split(/\s+/).filter(Boolean);
    return PALETTE.filter(type => {
      const kind = CATALOG[type];
      const text = plain(`${kind.label} ${type} ${kind.description} ${kind.keywords}`);
      return words.every(word => text.includes(word));
    });
  }, [query]);

  useEffect(() => { setActive(0); }, [query]);
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
    const { topology, device } = addDevice(state.topology, type, { x: centre.x - TILE / 2 + offset, y: centre.y - TILE / 2 + offset });
    state.commit(topology);
    state.select({ kind: "device", id: device.id });
    setOpen(false);
  };

  return (
    <div className={`bottom-bar${below ? " below" : ""}`} ref={root} style={movable.style}>
      {open && (
        <div className="add-panel" role="dialog" aria-label="Añadir dispositivo">
          <div className="add-search">
            <Icon name="search" size={17} />
            <input ref={search} value={query} placeholder="Buscar: router, wifi, servidor…" aria-label="Buscar dispositivo"
              aria-controls="device-list" aria-activedescendant={matches[active] ? `device-${matches[active]}` : undefined}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if(event.key === "Escape"){ event.preventDefault(); setOpen(false); }
                else if(event.key === "ArrowDown"){ event.preventDefault(); setActive(Math.min(active + 1, matches.length - 1)); }
                else if(event.key === "ArrowUp"){ event.preventDefault(); setActive(Math.max(active - 1, 0)); }
                else if(event.key === "Enter" && matches[active]){ event.preventDefault(); add(matches[active]); }
              }} />
          </div>
          <div className="add-list" id="device-list" role="listbox" aria-label="Dispositivos">
            {matches.map((type, index) => (
              <button key={type} id={`device-${type}`} type="button" role="option" aria-selected={index === active}
                className={`add-item${index === active ? " active" : ""}`} draggable
                title="Haz clic para añadirlo en el centro, o arrástralo al lienzo"
                onMouseEnter={() => setActive(index)}
                onDragStart={event => {
                  event.dataTransfer.setData(DEVICE_DRAG_TYPE, type);
                  event.dataTransfer.effectAllowed = "copy";
                }}
                onDragEnd={() => setOpen(false)}
                onClick={() => add(type)}>
                <span className="add-icon"><Icon name={type} size={22} /></span>
                <span className="add-text"><strong>{CATALOG[type].label}</strong><small>{CATALOG[type].description}</small></span>
              </button>
            ))}
            {!matches.length && <p className="muted small add-empty">Ningún dispositivo coincide con «{query}».</p>}
          </div>
          <p className="add-hint muted small"><kbd>↑</kbd><kbd>↓</kbd> elegir · <kbd>Enter</kbd> añadir · o arrástralo al lienzo</p>
        </div>
      )}
      <div className="bar" role="toolbar" aria-label="Lienzo">
        <Grip vertical {...movable.grip} label="Mover la barra" />
        <button type="button" className={`bar-button${open ? " active" : ""}`} aria-expanded={open} aria-haspopup="dialog"
          title="Añadir dispositivo (A)" onClick={() => setOpen(!open)}>
          <Icon name="plus" size={18} />Añadir dispositivo
        </button>
        <span className="bar-sep" aria-hidden="true" />
        <button type="button" className={`bar-button${logShown ? " active" : ""}`} aria-pressed={logShown}
          title="Registro de paquetes (L)" onClick={() => useStore.getState().toggleLog()}>
          <Icon name="log" size={18} />Registro{frames > 0 && <span className="badge">{frames}</span>}
        </button>
      </div>
    </div>
  );
}
