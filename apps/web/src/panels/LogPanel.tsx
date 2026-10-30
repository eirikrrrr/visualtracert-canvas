// Packet log: every frame of every action (ping, trace, DHCP…) of the
// session, like an event list or a capture. Docked under the canvas (its
// height dragged from the top edge), floating over it (dragged by its header,
// resized from the corner) or hidden.
import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { labelOf, useStore, type LogRun } from "../app/store";
import { Icon } from "../editor/icons";
import { PROTOCOLS, type Protocol } from "../sim/engine";
import { useT, type T } from "../i18n";
import { FrameHeaders, RESULT_LABEL } from "./FrameHeaders";

const MIN_HEIGHT = 140;

type Row = LogRun["events"][number];
const clock = (time: number) => new Date(time).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function asText(log: LogRun[], t: T): string {
  const lines = [[t("Acción"), t("N.º"), t("Tiempo (s)"), t("Origen"), t("Destino"), t("Protocolo"), t("Info"), t("Resultado")].join("\t")];
  log.forEach(run => run.events.forEach(event => lines.push([
    `#${run.id} ${labelOf(run, t)}`, event.index + 1, event.time.toFixed(3), event.fromName,
    `${event.toName}${event.inInterface ? ` (${event.inInterface})` : ""}`, event.protocol, event.summary, t(RESULT_LABEL[event.result]),
  ].join("\t"))));
  return lines.join("\n");
}

export function LogPanel() {
  const log = useStore(state => state.log);
  const layout = useStore(state => state.logLayout);
  const run = useStore(state => state.run);
  const step = useStore(state => state.step);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(() => Object.fromEntries(PROTOCOLS.map(protocol => [protocol, true])) as Record<Protocol, boolean>);
  const [selected, setSelected] = useState<{ run: number; index: number } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const store = useStore.getState;
  const t = useT();

  // the run on the canvas is the last one logged, while it is not cleared
  const currentRun = run ? log[log.length - 1]?.id ?? null : null;

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return log.map(item => ({
      run: item,
      events: item.events.filter(event => shown[event.protocol] && words.every(word =>
        `${event.fromName} ${event.toName} ${event.summary} ${event.frame.src} ${event.frame.dst} ${event.inInterface ?? ""}`.toLowerCase().includes(word))),
    })).filter(item => item.events.length || !words.length);
  }, [log, query, shown]);
  const total = log.reduce((sum, item) => sum + item.events.length, 0);

  // new runs scroll the log to the end; playback keeps the current frame in view
  useEffect(() => { body.current?.scrollTo({ top: body.current.scrollHeight }); }, [log.length]);
  useEffect(() => { body.current?.querySelector(".log-row.current")?.scrollIntoView({ block: "nearest" }); }, [step]);

  const detail = selected && log.find(item => item.id === selected.run)?.events[selected.index];

  const pick = (item: LogRun, event: Row) => {
    setSelected({ run: item.id, index: event.index });
    if(item.id === currentRun){ store().setPlaying(false); store().setStep(event.index); }
  };

  // docked: the top edge changes the height
  const resizeDocked = (start: ReactPointerEvent) => {
    start.preventDefault();
    const y = start.clientY, height = layout.height;
    const move = (event: PointerEvent) => {
      const max = Math.max(MIN_HEIGHT, (root.current?.parentElement?.clientHeight ?? 600) - 160);
      store().setLogLayout({ height: Math.round(Math.min(max, Math.max(MIN_HEIGHT, height - (event.clientY - y)))) });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.classList.remove("resizing-y"); };
    document.body.classList.add("resizing-y");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // floating: the header moves the window, inside the stage
  const moveFloating = (start: ReactPointerEvent) => {
    if(layout.dock !== "floating" || (start.target as HTMLElement).closest("button, input, label")) return;
    start.preventDefault();
    const { x, y } = layout.float;
    const sx = start.clientX, sy = start.clientY;
    const stage = root.current?.parentElement?.getBoundingClientRect();
    const box = root.current?.getBoundingClientRect();
    const move = (event: PointerEvent) => {
      const nx = x + event.clientX - sx, ny = y + event.clientY - sy;
      const maxX = (stage?.width ?? 1000) - (box?.width ?? 400), maxY = (stage?.height ?? 600) - 44;
      store().setLogLayout({ float: { ...store().logLayout.float, x: Math.round(Math.min(Math.max(0, nx), Math.max(0, maxX))), y: Math.round(Math.min(Math.max(0, ny), Math.max(0, maxY))) } });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.classList.remove("dragging"); };
    document.body.classList.add("dragging");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // the corner of a floating window resizes it (CSS resize): keep its size
  useEffect(() => {
    const element = root.current;
    if(layout.dock !== "floating" || !element || !window.ResizeObserver) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const { width, height } = element.getBoundingClientRect();
        const float = store().logLayout.float;
        if(Math.round(width) !== float.width || Math.round(height) !== float.height){
          store().setLogLayout({ float: { ...float, width: Math.round(width), height: Math.round(height) } });
        }
      }, 150);
    });
    observer.observe(element);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [layout.dock]);

  if(layout.dock === "hidden") return null;
  const floating = layout.dock === "floating";
  const style = floating
    ? { left: layout.float.x, top: layout.float.y, width: layout.float.width, height: layout.float.height }
    : { height: layout.height };

  return (
    <section ref={root} className={`log log-${layout.dock}`} style={style} aria-label={t("Registro de paquetes")}>
      {!floating && <div className="log-resizer" role="separator" aria-orientation="horizontal" aria-label={t("Alto del registro")} onPointerDown={resizeDocked} />}
      <header className="log-head" onPointerDown={moveFloating}>
        <strong>{t("Registro de paquetes")}</strong>
        <span className="muted small">{t("{n} tramas", { n: total })} · {log.length === 1 ? t("1 acción") : t("{n} acciones", { n: log.length })}</span>
        <div className="log-search">
          <Icon name="search" size={15} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Filtrar: IP, MAC, equipo…")} aria-label={t("Filtrar el registro")} />
        </div>
        <div className="filters" role="group" aria-label={t("Protocolos")}>
          {PROTOCOLS.map(protocol => (
            <label key={protocol} className={`chip chip-${protocol.toLowerCase()}`}>
              <input type="checkbox" checked={shown[protocol]} onChange={() => setShown({ ...shown, [protocol]: !shown[protocol] })} />{protocol}
            </label>
          ))}
        </div>
        <div className="log-actions">
          <button type="button" className="icon-button" title={t("Copiar el registro (texto con tabuladores)")} aria-label={t("Copiar el registro")} disabled={!total}
            onClick={async () => {
              try{ await navigator.clipboard.writeText(asText(log, t)); store().notify(t("Registro copiado: se pega como tabla en una hoja de cálculo."), "ok"); }
              catch(_){ store().notify(t("No se pudo copiar al portapapeles."), "error"); }
            }}><Icon name="copy" size={17} /></button>
          <button type="button" className="icon-button" title={t("Vaciar el registro")} aria-label={t("Vaciar el registro")} disabled={!log.length}
            onClick={() => { store().clearLog(); setSelected(null); }}><Icon name="trash" size={17} /></button>
          <button type="button" className="icon-button" title={floating ? t("Acoplar bajo el lienzo") : t("Desacoplar (ventana flotante)")}
            aria-label={floating ? t("Acoplar") : t("Desacoplar")}
            onClick={() => store().setLogLayout({ dock: floating ? "docked" : "floating" })}><Icon name={floating ? "dock" : "undock"} size={17} /></button>
          <button type="button" className="icon-button" title={t("Ocultar el registro (L)")} aria-label={t("Ocultar el registro")}
            onClick={() => store().setLogLayout({ dock: "hidden" })}><Icon name="close" size={17} /></button>
        </div>
      </header>

      <div className="log-main">
        <div className="log-body" ref={body} role="grid" aria-label={t("Tramas")}>
          {!log.length && (
            <p className="log-empty muted">{t("Todavía no hay paquetes. Haz un ping (herramienta P) o lanza una acción en la pestaña Simulación y sus tramas aparecerán aquí.")}</p>
          )}
          {!!log.length && (
            <div className="log-row log-columns" role="row">
              <span>{t("N.º")}</span><span>{t("Tiempo (s)")}</span><span>{t("Origen")}</span><span>{t("Destino")}</span><span>{t("Protocolo")}</span><span>{t("Info")}</span><span>{t("Resultado")}</span>
            </div>
          )}
          {visible.map(({ run: item, events }) => (
            <Fragment key={item.id}>
              <div className={`log-run ${item.outcome.ok ? "ok" : "fail"}`} role="row">
                <span className="mono">#{item.id}</span>
                <strong>{labelOf(item, t)}</strong>
                <span className="muted">{clock(item.at)}</span>
                <span className="log-outcome">{item.outcome.message}</span>
                {item.id === currentRun && <span className="badge">{t("en el lienzo")}</span>}
              </div>
              {events.map(event => {
                const isCurrent = item.id === currentRun && event.index === step;
                const isSelected = selected?.run === item.id && selected.index === event.index;
                return (
                  <button key={event.index} type="button" role="row"
                    className={`log-row${isCurrent ? " current" : ""}${isSelected ? " selected" : ""}${event.result === "dropped" ? " is-dropped" : ""}`}
                    onClick={() => pick(item, event)}>
                    <span className="mono">{event.index + 1}</span>
                    <span className="mono">{event.time.toFixed(3)}</span>
                    <span>{event.fromName}</span>
                    <span>{event.toName}{event.inInterface ? <span className="muted"> · {event.inInterface}</span> : null}</span>
                    <span className={`proto proto-${event.protocol.toLowerCase()}`}>{event.protocol}</span>
                    <span className="log-info">{event.summary}</span>
                    <span className="result">{t(RESULT_LABEL[event.result])}</span>
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
        {detail && (
          <aside className="log-detail" aria-label={t("Detalle de la trama")}>
            <div className="log-detail-head">
              <strong>{detail.summary}</strong>
              <button type="button" className="icon-button" aria-label={t("Cerrar el detalle")} onClick={() => setSelected(null)}><Icon name="close" size={15} /></button>
            </div>
            <ul className="notes">{detail.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>
            <FrameHeaders event={detail} />
          </aside>
        )}
      </div>
    </section>
  );
}
