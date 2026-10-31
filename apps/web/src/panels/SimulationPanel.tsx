// Simulation panel: choose an action (ping, trace, DHCP, DNS lookup, web
// request), play its events back on the canvas, read what it printed and
// inspect the frame of each event.
import { useEffect, useMemo, useRef } from "react";
import { SPEEDS, useStore } from "../app/store";
import { Icon, type IconName } from "../editor/icons";
import { isIp, roleOf, type Topology } from "@visual-tracert/model";
import { PROTOCOLS, type SimKind, type SimRequest } from "../sim/engine";
import { tx, useT } from "../i18n";
import { FrameHeaders, RESULT_LABEL } from "./FrameHeaders";

interface KindInfo {
  label: string;
  action: string;
  help: string;
  /** label of the destination field (none: the action has no destination) */
  target?: string;
  placeholder?: string;
  /** the command it is, as the console shows it */
  command: (to: string) => string;
}

const KINDS: Record<SimKind, KindInfo> = {
  ping: { label: tx("Ping"), action: tx("Hacer ping"), target: tx("Destino"), placeholder: tx("IP o nombre"),
    help: tx("Un eco ICMP y su respuesta. Con un nombre, primero se pregunta al DNS."), command: to => `ping ${to}` },
  traceroute: { label: tx("Traza"), action: tx("Trazar la ruta"), target: tx("Destino"), placeholder: tx("IP o nombre"),
    help: tx("Ecos con TTL 1, 2, 3…: cada router que lo agota se presenta, hasta llegar."), command: to => `tracert ${to}` },
  dhcp: { label: tx("DHCP"), action: tx("Pedir dirección"),
    help: tx("Discover, Offer, Request y ACK: el equipo obtiene IP, puerta de enlace y DNS."), command: () => "ipconfig /renew" },
  dns: { label: tx("DNS"), action: tx("Resolver"), target: tx("Nombre"), placeholder: "www.ejemplo.com",
    help: tx("Una consulta al servidor DNS del equipo, por UDP al puerto 53."), command: to => `nslookup ${to}` },
  http: { label: tx("Web"), action: tx("Abrir la página"), target: tx("Dirección"), placeholder: "www.ejemplo.com/",
    help: tx("Conexión TCP al puerto 80 (SYN, SYN-ACK, ACK), un GET de HTTP y el cierre (FIN)."), command: to => `curl http://${to}` },
};
const KIND_ORDER: SimKind[] = ["ping", "traceroute", "dhcp", "dns", "http"];

/** what can be written as a destination: every address, and the names the DNS servers know */
function suggestions(topology: Topology, kind: SimKind, from: string) {
  const names = topology.devices.flatMap(device => device.services?.dns ?? []).map(record => ({ value: record.name, label: record.ip }));
  const addresses = topology.devices.filter(device => device.id !== from && (kind !== "http" || device.services?.http))
    .flatMap(device => device.interfaces.filter(iface => iface.ip).map(iface => ({ value: iface.ip!, label: device.name })));
  if(kind === "dns") return names;
  if(kind === "http") return [...names.filter(name => addresses.some(address => address.value === name.label)), ...addresses];
  return [...addresses, ...names];
}

const STEP_MS = 900;

function Control({ icon, label, onClick, disabled, primary }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button type="button" className={`control${primary ? " primary" : ""}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={18} />
    </button>
  );
}

export function SimulationPanel() {
  const topology = useStore(state => state.topology);
  const run = useStore(state => state.run);
  const step = useStore(state => state.step);
  const playing = useStore(state => state.playing);
  const filters = useStore(state => state.filters);
  const draft = useStore(state => state.draft);
  const speed = useStore(state => state.speed);
  const t = useT();
  const listRef = useRef<HTMLDivElement>(null);
  const name = (id: string | null) => (id ? topology.devices.find(device => device.id === id)?.name ?? id : "—");

  const kind = draft.kind;
  const info = KINDS[kind];
  // DHCP is asked by an end device that may have no address yet; the rest need one
  const sources = topology.devices.filter(device => kind === "dhcp"
    ? roleOf(device.type) === "host" && device.interfaces.length > 0
    : roleOf(device.type) !== "switch" && device.interfaces.some(iface => iface.ip));
  const from = sources.some(device => device.id === draft.from) ? draft.from : sources[0]?.id ?? "";
  const options = useMemo(() => suggestions(topology, kind, from), [topology, kind, from]);
  const to = draft.targets[kind] ?? options[0]?.value ?? "";
  const request: SimRequest | null = !from ? null
    : kind === "dhcp" ? { kind, from }
    : !to.trim() ? null
    : kind === "ping" ? { kind, from, to: to.trim(), ttl: draft.ttl }
    : kind === "traceroute" ? { kind, from, to: to.trim(), maxHops: draft.maxHops }
    : { kind, from, to: to.trim() };
  const setTarget = (value: string) => useStore.getState().setDraft({ targets: { ...draft.targets, [kind]: value } });

  // the events the filters let through, in order
  const visible = useMemo(() => (run?.events ?? []).filter(event => filters[event.protocol]), [run, filters]);
  const position = visible.findIndex(event => event.index === step);
  const go = (index: number) => {
    const target = visible[Math.max(0, Math.min(index, visible.length - 1))];
    if(target) useStore.getState().setStep(target.index);
  };

  // playback
  useEffect(() => {
    if(!playing) return;
    if(position >= visible.length - 1){ useStore.getState().setPlaying(false); return; }
    // real time: straight to the end
    if(speed === "realtime"){ go(visible.length - 1); useStore.getState().setPlaying(false); return; }
    const timer = setTimeout(() => go(position + 1), STEP_MS / speed);
    return () => clearTimeout(timer);
  });

  // keep the current row in view
  useEffect(() => {
    listRef.current?.querySelector(".event.current")?.scrollIntoView({ block: "nearest" });
  }, [step]);

  const current = run && step >= 0 ? run.events[step] : null;

  return (
    <div className="sim">
      <div className="sim-kinds" role="group" aria-label={t("Acción")}>
        {KIND_ORDER.map(item => (
          <button key={item} type="button" aria-pressed={item === kind} className={item === kind ? "active" : ""}
            onClick={() => useStore.getState().setDraft({ kind: item })}>{t(KINDS[item].label)}</button>
        ))}
      </div>
      <p className="muted small sim-help">{t(info.help)}</p>
      <form className="sim-form" aria-label={t(info.label)}
        onSubmit={event => { event.preventDefault(); if(request) useStore.getState().runSim(request); }}>
        <div className="field">
          <label htmlFor="sim-from">{t("Origen")}</label>
          <select id="sim-from" value={from} onChange={event => useStore.getState().setDraft({ from: event.target.value })}>
            {sources.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}
          </select>
        </div>
        {info.target && (
          <div className="field">
            <label htmlFor="sim-to">{t(info.target)}</label>
            <input id="sim-to" className="mono" list="sim-to-options" value={to} placeholder={info.placeholder && t(info.placeholder)}
              autoComplete="off" spellCheck={false} onChange={event => setTarget(event.target.value)} />
            <datalist id="sim-to-options">
              {options.map(option => <option key={`${option.value}-${option.label}`} value={option.value}>{option.label}</option>)}
            </datalist>
          </div>
        )}
        {kind === "ping" && (
          <div className="field ttl">
            <label htmlFor="sim-ttl">TTL</label>
            <input id="sim-ttl" type="number" min={1} max={255} value={draft.ttl}
              onChange={event => useStore.getState().setDraft({ ttl: Math.max(1, Math.min(255, Number(event.target.value) || 64)) })} />
          </div>
        )}
        {kind === "traceroute" && (
          <div className="field ttl">
            <label htmlFor="sim-hops">{t("Saltos máximos")}</label>
            <input id="sim-hops" type="number" min={1} max={64} value={draft.maxHops}
              onChange={event => useStore.getState().setDraft({ maxHops: Math.max(1, Math.min(64, Number(event.target.value) || 30)) })} />
          </div>
        )}
        <button type="submit" className="primary" disabled={!request}>
          <Icon name="ping" size={17} />{t(info.action)}
        </button>
      </form>

      {!sources.length && (
        <p className="muted small">{kind === "dhcp" ? t("Añade un equipo final para que pida dirección.") : t("Pon una dirección IP a algún equipo (o pídela por DHCP) para poder lanzar esta acción.")}</p>
      )}
      {kind !== "dhcp" && to && !isIp(to) && from && !topology.devices.find(device => device.id === from)?.dns && (
        <p className="muted small">{t("El origen no tiene servidor DNS: para usar nombres, ponle uno en Propiedades.")}</p>
      )}

      {run && (
        <>
          <div className={`outcome ${run.outcome.ok ? "ok" : "fail"}`} role="status">{run.outcome.message}</div>
          {run.console.length > 0 && (
            <pre className="console" aria-label={t("Salida de la consola")}>
              <span className="console-prompt">{name(run.request.from)}&gt; {KINDS[run.request.kind].command("to" in run.request ? run.request.to : "")}</span>
              {"\n"}{run.console.join("\n")}
            </pre>
          )}

          <div className="controls">
            <Control icon="first" label={t("Al principio")} onClick={() => go(0)} disabled={position <= 0} />
            <Control icon="prev" label={t("Evento anterior")} onClick={() => go(position - 1)} disabled={position <= 0} />
            <Control icon={playing ? "pause" : "play"} label={playing ? t("Pausa") : t("Reproducir")} primary
              onClick={() => {
                const state = useStore.getState();
                if(!playing && position >= visible.length - 1) go(0);
                state.setPlaying(!playing);
              }} disabled={visible.length < 2} />
            <Control icon="next" label={t("Evento siguiente")} onClick={() => go(position + 1)} disabled={position >= visible.length - 1} />
            <Control icon="last" label={t("Al final")} onClick={() => go(visible.length - 1)} disabled={position >= visible.length - 1} />
            <select className="speed" aria-label={t("Velocidad")} value={speed}
              onChange={event => useStore.getState().setSpeed(event.target.value === "realtime" ? "realtime" : Number(event.target.value) as typeof speed)}>
              {SPEEDS.map(value => <option key={value} value={value}>{value === "realtime" ? t("Tiempo real") : `${value}×`}</option>)}
            </select>
          </div>
          {speed === "realtime" && <p className="muted small">{t("Tiempo real: se muestra el resultado al instante. Elige una velocidad (1×, 2×…) para verlo paso a paso.")}</p>}

          <div className="events-head">
            <h3>{t("Eventos")} <span className="muted">{position + 1}/{visible.length}</span></h3>
            <div className="filters" role="group" aria-label={t("Filtrar por protocolo")}>
              {PROTOCOLS.filter(protocol => run.events.some(event => event.protocol === protocol)).map(protocol => (
                <label key={protocol} className={`chip chip-${protocol.toLowerCase()}`}>
                  <input type="checkbox" checked={filters[protocol]} onChange={() => useStore.getState().toggleFilter(protocol)} />
                  {protocol}
                </label>
              ))}
            </div>
          </div>
          <div className="events" ref={listRef} role="listbox" aria-label={t("Eventos de la simulación")}>
            <div className="event event-head" aria-hidden="true">
              <span>{t("Tiempo (s)")}</span><span>{t("Desde")}</span><span>{t("En")}</span><span>{t("Tipo")}</span><span>{t("Resultado")}</span>
            </div>
            {visible.map(event => (
              <button key={event.index} type="button" role="option" aria-selected={event.index === step}
                className={`event${event.index === step ? " current" : ""}${event.result === "dropped" ? " is-dropped" : ""}`}
                onClick={() => { useStore.getState().setPlaying(false); useStore.getState().setStep(event.index); }}>
                <span className="mono">{event.time.toFixed(3)}</span>
                <span>{name(event.from)}</span>
                <span>{name(event.to)}</span>
                <span className={`proto proto-${event.protocol.toLowerCase()}`}>{event.protocol}</span>
                <span className="result">{t(RESULT_LABEL[event.result])}</span>
              </button>
            ))}
          </div>

          {current && (
            <section className="event-detail" aria-label={t("Evento actual")}>
              <h3>{current.summary}</h3>
              <p className="muted small">
                {current.from ? `${name(current.from)} → ${name(current.to)}${current.inInterface ? ` (${current.inInterface})` : ""}` : t("En {device}", { device: name(current.to) })}
                {" · "}{current.time.toFixed(3)} s
              </p>
              <ul className="notes">{current.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>
              <FrameHeaders event={current} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
