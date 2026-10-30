// Emulation panel: deploy the lab as real containers joined by veth cables,
// stop it, and run real commands on its devices (ping, traceroute, their
// addresses, routes and ARP neighbours), with what each one printed.
import { networkFingerprint, roleOf } from "@visual-tracert/model";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../app/store";
import { Icon } from "../editor/icons";
import { tx, useT } from "../i18n";
import type { Command } from "./api";
import { useEmulation } from "./store";

const REFRESH_MS = 5000;

const COMMANDS: { id: Command; label: string; target: boolean }[] = [
  { id: "ping", label: tx("Ping"), target: true },
  { id: "traceroute", label: tx("Traza"), target: true },
  { id: "addresses", label: tx("Direcciones IP"), target: false },
  { id: "routes", label: tx("Rutas"), target: false },
  { id: "neighbours", label: tx("Vecinos (ARP)"), target: false },
];

export function EmulationPanel() {
  const t = useT();
  const labId = useStore(state => state.labId);
  const topology = useStore(state => state.topology);
  const { reachable, lab, warnings, busy, error, console } = useEmulation();
  const [device, setDevice] = useState("");
  const [command, setCommand] = useState<Command>("ping");
  const [target, setTarget] = useState("");
  const output = useRef<HTMLPreElement>(null);
  const actions = useEmulation.getState;

  // what is running, asked again every few seconds while the panel is open
  useEffect(() => {
    actions().refresh(labId);
    const timer = setInterval(() => actions().refresh(labId), REFRESH_MS);
    return () => clearInterval(timer);
  }, [labId, actions]);

  useEffect(() => { output.current?.scrollTo({ top: output.current.scrollHeight }); }, [console.length]);

  const deployed = Boolean(lab?.deployed && lab.lab === labId);
  const fingerprint = useMemo(() => networkFingerprint(topology), [topology]);
  const changed = deployed && lab?.fingerprint !== fingerprint;
  const states = new Map((deployed ? lab!.devices : []).map(item => [item.device, item.state]));
  const running = topology.devices.filter(item => states.get(item.id) === "running");
  const sources = running.filter(item => roleOf(item.type) !== "switch");
  const from = sources.some(item => item.id === device) ? device : sources[0]?.id ?? "";
  const nameOf = (id: string) => topology.devices.find(item => item.id === id)?.name ?? id;
  const needsTarget = COMMANDS.find(item => item.id === command)!.target;
  const addresses = topology.devices.flatMap(item => item.interfaces.filter(iface => iface.ip).map(iface => ({ ip: iface.ip!, name: item.name })));

  return (
    <div className="sim emu">
      <p className="muted small sim-help">{t("Cada equipo es un contenedor real y cada cable, un enlace virtual entre ellos: los comandos se ejecutan de verdad.")}</p>

      {reachable === false && (
        <div className="outcome fail" role="alert">{t("No se puede conectar con el emulador. Comprueba que el servicio «emulator» está en marcha (docker compose up -d).")}</div>
      )}

      <section className="emu-status" aria-label={t("Estado")}>
        <div>
          <strong>{deployed ? t("Desplegado") : t("Sin desplegar")}</strong>
          <span className="muted small">
            {deployed ? t("{n} de {total} equipos en marcha", { n: running.length, total: lab!.devices.length }) : t("Ningún contenedor de este laboratorio está en marcha.")}
          </span>
        </div>
        <div className="emu-actions">
          <button type="button" className="primary" disabled={busy !== null || reachable === false || !topology.devices.length}
            onClick={() => actions().deploy(labId, topology)}>
            <Icon name="emulation" size={16} />
            {busy === "deploy" ? t("Desplegando…") : deployed ? t("Volver a desplegar") : t("Desplegar")}
          </button>
          {deployed && (
            <button type="button" className="ghost" disabled={busy !== null} onClick={() => actions().stop(labId)}>
              {busy === "stop" ? t("Deteniendo…") : t("Detener")}
            </button>
          )}
        </div>
      </section>

      {changed && <p className="emu-note">{t("La topología cambió desde el despliegue: vuelve a desplegar para aplicar los cambios.")}</p>}
      {error && <div className="outcome fail" role="alert">{error}</div>}

      {deployed && warnings.length > 0 && (
        <details className="emu-warnings" open>
          <summary>{t("Lo que aún no se emula ({n})", { n: warnings.length })}</summary>
          <ul>{warnings.map(item => <li key={item}>{item}</li>)}</ul>
        </details>
      )}

      {deployed && (
        <form className="sim-form" aria-label={t("Comando")}
          onSubmit={event => { event.preventDefault(); if(from) actions().run(labId, from, command, needsTarget ? target.trim() : undefined); }}>
          <div className="field">
            <label htmlFor="emu-device">{t("Equipo")}</label>
            <select id="emu-device" value={from} onChange={event => setDevice(event.target.value)}>
              {sources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="emu-command">{t("Comando")}</label>
            <select id="emu-command" value={command} onChange={event => setCommand(event.target.value as Command)}>
              {COMMANDS.map(item => <option key={item.id} value={item.id}>{t(item.label)}</option>)}
            </select>
          </div>
          {needsTarget && (
            <div className="field">
              <label htmlFor="emu-target">{t("Destino")}</label>
              <input id="emu-target" className="mono" list="emu-targets" value={target} placeholder={t("IP")}
                autoComplete="off" spellCheck={false} onChange={event => setTarget(event.target.value)} />
              <datalist id="emu-targets">
                {addresses.map(item => <option key={`${item.ip}-${item.name}`} value={item.ip}>{item.name}</option>)}
              </datalist>
            </div>
          )}
          <button type="submit" className="primary" disabled={busy !== null || !from || (needsTarget && !target.trim())}>
            <Icon name="play" size={16} />{busy === "run" ? t("Ejecutando…") : t("Ejecutar")}
          </button>
        </form>
      )}

      {console.length > 0 && (
        <>
          <div className="events-head">
            <h3>{t("Consola")}</h3>
            <button type="button" className="ghost small" onClick={() => actions().clearConsole()}>{t("Limpiar")}</button>
          </div>
          <pre className="console emu-console" ref={output} aria-label={t("Salida de la consola")} aria-live="polite">
            {console.map(entry => (
              <span key={entry.id} className={entry.exitCode ? "emu-failed" : undefined}>
                <span className="console-prompt">{nameOf(entry.device)}$ {entry.command}</span>{"\n"}{entry.output.trimEnd()}{"\n\n"}
              </span>
            ))}
          </pre>
        </>
      )}

      {deployed && (
        <>
          <h3>{t("Contenedores")}</h3>
          <ul className="emu-devices">
            {lab!.devices.map(item => (
              <li key={item.device}>
                <span>{nameOf(item.device)}</span>
                <span className="mono muted">{item.container}</span>
                <span className={`emu-state ${item.state === "running" ? "on" : "off"}`}>{item.state === "running" ? t("en marcha") : item.state}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
