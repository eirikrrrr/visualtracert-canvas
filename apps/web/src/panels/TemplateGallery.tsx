// Gallery of ready-made labs: search them, filter by level, see a sketch of
// each topology and what it teaches, and open one as a new lab (the lab being
// edited is kept). A modal dialog: Escape or a click outside closes it.
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../app/store";
import { Icon } from "../editor/icons";
import { tx, useT } from "../i18n";
import { roleOf, TEMPLATES, type Level, type Template, type Topology } from "@visual-tracert/model";

const LEVELS: Level[] = [tx("Básico"), tx("Intermedio"), tx("Avanzado")];
const LEVEL_CLASS: Record<Level, string> = { "Básico": "basico", "Intermedio": "intermedio", "Avanzado": "avanzado" };
const plain = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** a small drawing of the topology: cables and devices, coloured by role */
function Sketch({ topology }: { topology: Topology }) {
  const at = new Map(topology.devices.map(device => [device.id, device.position]));
  const xs = topology.devices.map(device => device.position.x), ys = topology.devices.map(device => device.position.y);
  const pad = 50;
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  const width = Math.max(...xs) - x0 + pad + 56, height = Math.max(...ys) - y0 + pad + 56;
  return (
    <svg className="sketch" viewBox={`${x0} ${y0} ${width} ${height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {topology.links.map(link => {
        const a = at.get(link.a.device), b = at.get(link.b.device);
        return a && b ? <line key={link.id} x1={a.x + 28} y1={a.y + 28} x2={b.x + 28} y2={b.y + 28} /> : null;
      })}
      {topology.devices.map(device => (
        <rect key={device.id} className={`sketch-${roleOf(device.type)}`} x={device.position.x} y={device.position.y} width={56} height={56} rx={14} />
      ))}
    </svg>
  );
}

export function TemplateGallery() {
  const open = useStore(state => state.gallery);
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<Level | null>(null);
  const [picked, setPicked] = useState(TEMPLATES[0].id);
  const t = useT();
  const built = useMemo(() => new Map(TEMPLATES.map(item => [item.id, item.build(t)])), [t]);

  useEffect(() => {
    const element = dialog.current;
    if(!element) return;
    if(open && !element.open) element.showModal();
    if(!open && element.open) element.close();
  }, [open]);

  const shown = useMemo(() => {
    const words = plain(query).split(/\s+/).filter(Boolean);
    return TEMPLATES.filter(item => (!level || item.level === level)
      && words.every(word => plain(`${t(item.name)} ${t(item.summary)} ${item.topics.map(topic => t(topic)).join(" ")} ${t(item.level)} ${item.name} ${item.topics.join(" ")}`).includes(word)));
  }, [query, level, t]);
  const current: Template | undefined = shown.find(item => item.id === picked) ?? shown[0];
  const close = () => useStore.getState().setGallery(false);
  const openLab = (id: string) => useStore.getState().openTemplate(id);

  return (
    <dialog ref={dialog} className="gallery" aria-labelledby="gallery-title" onClose={close}
      onClick={event => { if(event.target === dialog.current) close(); }}>
      {open && (
        <div className="gallery-inner">
          <header className="gallery-head">
            <div>
              <h2 id="gallery-title">{t("Plantillas de laboratorio")}</h2>
              <p className="muted small">{t("Redes ya montadas para probar en un momento. Se abren como laboratorio nuevo: el actual no se toca.")}</p>
            </div>
            <button type="button" className="icon-button" aria-label={t("Cerrar")} title={t("Cerrar (Esc)")} onClick={close}><Icon name="close" size={18} /></button>
          </header>
          <div className="gallery-tools">
            <div className="log-search gallery-search">
              <Icon name="search" size={15} />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Buscar: VLAN, DHCP, rutas…")} aria-label={t("Buscar plantillas")} autoFocus />
            </div>
            <div className="filters" role="group" aria-label={t("Nivel")}>
              {[null, ...LEVELS].map(item => (
                <button key={item ?? "all"} type="button" className={`chip${level === item ? " chip-on" : ""}`} aria-pressed={level === item}
                  onClick={() => setLevel(item)}>{item ? t(item) : t("Todos")}</button>
              ))}
            </div>
          </div>

          <div className="gallery-body">
            <div className="gallery-grid" role="listbox" aria-label={t("Plantillas")}>
              {!shown.length && <p className="muted small">{t("Ninguna plantilla coincide con la búsqueda.")}</p>}
              {shown.map(item => (
                <button key={item.id} type="button" role="option" aria-selected={item.id === current?.id}
                  className={`template-card${item.id === current?.id ? " selected" : ""}`}
                  onClick={() => setPicked(item.id)} onDoubleClick={() => openLab(item.id)}>
                  <Sketch topology={built.get(item.id)!} />
                  <span className="template-name">{t(item.name)}</span>
                  <span className={`level level-${LEVEL_CLASS[item.level]}`}>{t(item.level)}</span>
                  <span className="template-topics">{item.topics.map(topic => t(topic)).join(" · ")}</span>
                </button>
              ))}
            </div>

            {current && (
              <aside className="gallery-detail" aria-label={t(current.name)}>
                <Sketch topology={built.get(current.id)!} />
                <h3>{t(current.name)}</h3>
                <p className="small">{t(current.summary)}</p>
                <p className="muted small">{t("{devices} dispositivos · {links} cables", { devices: built.get(current.id)!.devices.length, links: built.get(current.id)!.links.length })}</p>
                <h4>{t("Qué probar")}</h4>
                <ol className="try">{current.tryThis.map(step => <li key={step}>{t(step)}</li>)}</ol>
                <button type="button" className="primary" onClick={() => openLab(current.id)}>
                  <Icon name="plus" size={16} />{t("Abrir este laboratorio")}
                </button>
              </aside>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
