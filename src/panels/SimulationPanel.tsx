// Simulation panel: choose a ping, play its events back on the canvas and
// inspect the frame of each one.
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../app/store";
import { Icon, type IconName } from "../editor/icons";
import { roleOf } from "../model/catalog";
import type { Protocol, SimEvent } from "../sim/engine";
import { FrameHeaders } from "./FrameHeaders";

const PROTOCOLS: Protocol[] = ["ARP", "ICMP"];
const SPEEDS = [0.5, 1, 2, 4];
const STEP_MS = 900;

const RESULT_LABEL: Record<SimEvent["result"], string> = {
  created: "Creado",
  forwarded: "Reenviado",
  flooded: "Inundado",
  answered: "Respondido",
  learned: "Aprendido",
  delivered: "Entregado",
  dropped: "Descartado",
};

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
  const mode = useStore(state => state.mode);
  const [speed, setSpeed] = useState(1);
  const listRef = useRef<HTMLDivElement>(null);
  const name = (id: string | null) => (id ? topology.devices.find(device => device.id === id)?.name ?? id : "—");

  const sources = topology.devices.filter(device => roleOf(device.type) !== "switch" && device.interfaces.some(iface => iface.ip));
  const targets = topology.devices.flatMap(device => device.interfaces.filter(iface => iface.ip).map(iface => ({ device, iface })));
  const from = sources.some(device => device.id === draft.from) ? draft.from : sources[0]?.id ?? "";
  const to = targets.some(item => item.iface.ip === draft.to) ? draft.to : targets.find(item => item.device.id !== from)?.iface.ip ?? "";

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
      <section className="sim-form" aria-label="Ping">
        <div className="field">
          <label htmlFor="ping-from">Origen</label>
          <select id="ping-from" value={from} onChange={event => useStore.getState().setDraft({ from: event.target.value })}>
            {sources.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ping-to">Destino</label>
          <select id="ping-to" value={to} onChange={event => useStore.getState().setDraft({ to: event.target.value })}>
            {targets.map(({ device, iface }) => <option key={`${device.id}-${iface.name}`} value={iface.ip}>{iface.ip} · {device.name}</option>)}
          </select>
        </div>
        <div className="field ttl">
          <label htmlFor="ping-ttl">TTL</label>
          <input id="ping-ttl" type="number" min={1} max={255} value={draft.ttl}
            onChange={event => useStore.getState().setDraft({ ttl: Math.max(1, Math.min(255, Number(event.target.value) || 64)) })} />
        </div>
        <button type="button" className="primary" disabled={!from || !to}
          onClick={() => useStore.getState().runPing(from, to, draft.ttl)}>
          <Icon name="ping" size={17} />Hacer ping
        </button>
      </section>

      {!sources.length && <p className="muted small">Pon una dirección IP a algún equipo para poder hacer ping.</p>}

      {run && (
        <>
          <div className={`outcome ${run.outcome.ok ? "ok" : "fail"}`} role="status">{run.outcome.message}</div>

          <div className="controls">
            <Control icon="first" label="Al principio" onClick={() => go(0)} disabled={position <= 0} />
            <Control icon="prev" label="Evento anterior" onClick={() => go(position - 1)} disabled={position <= 0} />
            <Control icon={playing ? "pause" : "play"} label={playing ? "Pausa" : "Reproducir"} primary
              onClick={() => {
                const state = useStore.getState();
                if(!playing && position >= visible.length - 1) go(0);
                state.setPlaying(!playing);
              }} disabled={visible.length < 2} />
            <Control icon="next" label="Evento siguiente" onClick={() => go(position + 1)} disabled={position >= visible.length - 1} />
            <Control icon="last" label="Al final" onClick={() => go(visible.length - 1)} disabled={position >= visible.length - 1} />
            <select className="speed" aria-label="Velocidad" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
              {SPEEDS.map(value => <option key={value} value={value}>{value}×</option>)}
            </select>
          </div>
          {mode === "realtime" && <p className="muted small">En tiempo real se muestra el resultado; cambia a Simulación para verlo paso a paso.</p>}

          <div className="events-head">
            <h3>Eventos <span className="muted">{position + 1}/{visible.length}</span></h3>
            <div className="filters" role="group" aria-label="Filtrar por protocolo">
              {PROTOCOLS.map(protocol => (
                <label key={protocol} className={`chip chip-${protocol.toLowerCase()}`}>
                  <input type="checkbox" checked={filters[protocol]} onChange={() => useStore.getState().toggleFilter(protocol)} />
                  {protocol}
                </label>
              ))}
            </div>
          </div>
          <div className="events" ref={listRef} role="listbox" aria-label="Eventos de la simulación">
            <div className="event event-head" aria-hidden="true">
              <span>Tiempo (s)</span><span>Desde</span><span>En</span><span>Tipo</span><span>Resultado</span>
            </div>
            {visible.map(event => (
              <button key={event.index} type="button" role="option" aria-selected={event.index === step}
                className={`event${event.index === step ? " current" : ""}${event.result === "dropped" ? " is-dropped" : ""}`}
                onClick={() => { useStore.getState().setPlaying(false); useStore.getState().setStep(event.index); }}>
                <span className="mono">{event.time.toFixed(3)}</span>
                <span>{name(event.from)}</span>
                <span>{name(event.to)}</span>
                <span className={`proto proto-${event.protocol.toLowerCase()}`}>{event.protocol}</span>
                <span className="result">{RESULT_LABEL[event.result]}</span>
              </button>
            ))}
          </div>

          {current && (
            <section className="inspector" aria-label="Evento actual">
              <h3>{current.summary}</h3>
              <p className="muted small">
                {current.from ? `${name(current.from)} → ${name(current.to)}${current.inInterface ? ` (${current.inInterface})` : ""}` : `En ${name(current.to)}`}
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
