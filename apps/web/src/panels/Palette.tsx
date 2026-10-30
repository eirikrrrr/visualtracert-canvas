// Bottom bar of the canvas. "Añadir dispositivo" opens a list of the device
// types, by group (official images first, then the generic ones), each group
// closed until it is opened (a search opens those with matches), with a
// search box: click, Enter or drag one onto the canvas to add it. It goes to
// the topology it lands in. "Nueva topología" adds an empty one.
// The list floats over the canvas on the side of the bar with more room, so
// it stays in view wherever the bar was moved. The bar has room for more tools.
import { useReactFlow } from "@xyflow/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useMovable } from "../app/movable";
import { selectedZone, useStore } from "../app/store";
import { useT } from "../i18n";
import { DEVICE_DRAG_TYPE } from "../editor/Canvas";
import { TILE } from "../editor/DeviceNode";
import { Icon } from "../editor/icons";
import { Grip } from "./Grip";
import { addDevice, addZone, CATALOG, GROUPS, PALETTE, zonesOf, type DeviceGroup, type DeviceType } from "@visual-tracert/model";
import { ZONE_EMPTY, zoneForNew } from "../editor/zones";

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
  // the groups opened by hand; while searching, those with matches are open
  const [opened, setOpened] = useState<Set<DeviceGroup>>(new Set());
  const movable = useMovable<HTMLDivElement>("bottom-bar");
  const root = movable.ref;
  const [placement, setPlacement] = useState<CSSProperties>({});
  const t = useT();
  const search = useRef<HTMLInputElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const setOpen = (value: boolean) => useStore.getState().setAdding(value);

  const matches = useMemo(() => {
    const words = plain(query).split(/\s+/).filter(Boolean);
    const found = PALETTE.filter(type => {
      const kind = CATALOG[type];
      const group = GROUPS.find(item => item.id === kind.group)!;
      // in the language shown and in Spanish, the words most labs use
      const text = plain(`${t(kind.label)} ${type} ${t(kind.description)} ${t(kind.keywords)} ${kind.label} ${kind.keywords} ${t(group.label)} ${group.label}`);
      return words.every(word => text.includes(word));
    });
    // in the order the groups are shown, so the arrows go down the list
    return GROUPS.flatMap(group => found.filter(type => CATALOG[type].group === group.id));
  }, [query, t]);
  const searching = query.trim() !== "";
  const isOpen = (group: DeviceGroup) => searching || opened.has(group);
  const toggle = (group: DeviceGroup) => setOpened(previous => {
    const next = new Set(previous);
    if(next.has(group)) next.delete(group); else next.add(group);
    return next;
  });
  // what the arrows go through: the devices in sight
  const visible = useMemo(() => matches.filter(type => isOpen(CATALOG[type].group)), [matches, searching, opened]);

  useEffect(() => { setActive(0); }, [query, opened]);
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

  const centre = () => {
    const canvas = document.querySelector(".canvas")?.getBoundingClientRect();
    return canvas
      ? screenToFlowPosition({ x: canvas.left + canvas.width / 2, y: canvas.top + canvas.height / 2 })
      : { x: 0, y: 0 };
  };

  const add = (type: DeviceType) => {
    const state = useStore.getState();
    // a little apart from the last one added there
    const offset = (state.topology.devices.length % 5) * 24;
    const at = { x: centre().x - TILE / 2 + offset, y: centre().y - TILE / 2 + offset };
    const { topology, device } = addDevice(state.topology, type, at, t, zoneForNew(state.topology, at, selectedZone(state)));
    state.commit(topology);
    state.select({ kind: "device", id: device.id });
    setOpen(false);
  };

  const addTopology = () => {
    const state = useStore.getState();
    const at = centre();
    const { topology, zone } = addZone(state.topology, t("Topología {n}", { n: zonesOf(state.topology).length + 1 }),
      { x: at.x - ZONE_EMPTY.width / 2, y: at.y - ZONE_EMPTY.height / 2 });
    state.commit(topology);
    state.select({ kind: "zone", id: zone.id });
    setOpen(false);
  };

  return (
    <div className="bottom-bar" ref={root} style={movable.style}>
      {open && (
        <div className="add-panel" role="dialog" aria-label={t("Añadir dispositivo")} style={placement}>
          <div className="add-search">
            <Icon name="search" size={17} />
            <input ref={search} value={query} placeholder={t("Buscar: router, wifi, servidor…")} aria-label={t("Buscar dispositivo")}
              aria-controls="device-list" aria-activedescendant={visible[active] ? `device-${visible[active]}` : undefined}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if(event.key === "Escape"){ event.preventDefault(); setOpen(false); }
                else if(event.key === "ArrowDown"){ event.preventDefault(); setActive(Math.min(active + 1, visible.length - 1)); }
                else if(event.key === "ArrowUp"){ event.preventDefault(); setActive(Math.max(active - 1, 0)); }
                else if(event.key === "Enter" && visible[active]){ event.preventDefault(); add(visible[active]); }
              }} />
          </div>
          <div className="add-list" id="device-list" role="listbox" aria-label={t("Dispositivos")}>
            {GROUPS.map(group => {
              const items = matches.filter(type => CATALOG[type].group === group.id);
              if(!items.length) return null;
              const expanded = isOpen(group.id);
              return (
                <div key={group.id} className="add-group" role="group" aria-labelledby={`group-${group.id}`}>
                  <button type="button" className="add-group-head" id={`group-${group.id}`} aria-expanded={expanded} disabled={searching}
                    title={searching ? t(group.description) : expanded ? t("Cerrar el grupo") : t("Abrir el grupo")} onClick={() => toggle(group.id)}>
                    <span className={`add-group-chevron${expanded ? " open" : ""}`} aria-hidden="true"><Icon name="chevron" size={15} /></span>
                    <span className={`tag tag-${group.id}`}>{t(group.label)}</span>
                    <small className="muted">{t(group.description)}</small>
                    <span className="add-group-count">{items.length}</span>
                  </button>
                  {expanded && items.map(type => {
                    const index = visible.indexOf(type);
                    return (
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
                        <span className={`add-icon add-icon-${group.id}`}><Icon name={type} size={22} /></span>
                        <span className="add-text"><strong>{t(CATALOG[type].label)}</strong><small>{t(CATALOG[type].description)}</small></span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
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
        <button type="button" className="bar-button" title={t("Nueva topología: un grupo de dispositivos con su rectángulo")} onClick={addTopology}>
          <Icon name="topology" size={18} />{t("Nueva topología")}
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
