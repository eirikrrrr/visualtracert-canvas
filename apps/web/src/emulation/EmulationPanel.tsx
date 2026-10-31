// Emulation panel, in sections: the environment (the lab and the emulator),
// its containers grouped by topology (each device, each topology and all of
// them started, stopped or restarted), commands run on its devices (ping,
// traceroute, their addresses, routes and ARP neighbours) and what each one
// printed.
import { devicesOf, isStarted, networkFingerprint, roleOf, ZONE_COLORS, zonesOf, type Device } from "@visual-tracert/model";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

type Action = "start" | "stop" | "restart";

/** start, stop and restart, as three small buttons; the one at work spins */
function Controls({ name, can, onAction, working, title }: {
  name: string;
  can: Record<Action, boolean>;
  onAction: (action: Action) => void;
  working: Action | null;
  title?: string;
}) {
  const t = useT();
  const buttons: { action: Action; icon: string; label: string }[] = [
    { action: "start", icon: "play", label: t("Iniciar {name}", { name }) },
    { action: "stop", icon: "stop", label: t("Detener {name}", { name }) },
    { action: "restart", icon: "restart", label: t("Reiniciar {name}", { name }) },
  ];
  return (
    <span className="emu-controls">
      {buttons.map(({ action, icon, label }) => (
        <button key={action} type="button" className={`icon-button${working === action ? " spinning" : ""}`} disabled={!can[action]}
          aria-label={label} title={!can[action] && title ? title : label}
          onClick={event => { event.preventDefault(); onAction(action); }}>
          <Icon name={icon} size={14} />
        </button>
      ))}
    </span>
  );
}

export function EmulationPanel() {
  const t = useT();
  const labId = useStore(state => state.labId);
  const topology = useStore(state => state.topology);
  const { reachable, lab, warnings, busy, pending, health, error, console } = useEmulation();
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
  useEffect(() => { void actions().checkHealth(); }, [actions, reachable]);

  useEffect(() => { output.current?.scrollTo({ top: output.current.scrollHeight }); }, [console.length]);

  const deployed = Boolean(lab?.deployed && lab.lab === labId);
  const fingerprint = useMemo(() => networkFingerprint(topology), [topology]);
  const changed = deployed && lab?.fingerprint !== fingerprint;
  const states = new Map((deployed ? lab!.devices : []).map(item => [item.device, item.state]));
  const containerOf = new Map((deployed ? lab!.devices : []).map(item => [item.device, item.container]));
  const isRunning = (id: string) => states.get(id) === "running";
  const running = topology.devices.filter(item => isRunning(item.id));
  const sources = running.filter(item => roleOf(item.type) !== "switch");
  const from = sources.some(item => item.id === device) ? device : sources[0]?.id ?? "";
  const nameOf = (id: string) => topology.devices.find(item => item.id === id)?.name ?? id;
  const needsTarget = COMMANDS.find(item => item.id === command)!.target;
  const addresses = topology.devices.flatMap(item => item.interfaces.filter(iface => iface.ip).map(iface => ({ ip: iface.ip!, name: item.name })));
  const orphans = deployed ? lab!.devices.filter(item => !topology.devices.some(other => other.id === item.device)) : [];

  // some devices: started, stopped or restarted, the rest left running. While
  // the topology differs from what runs, only stopping is: the whole lab
  // restarted applies it
  const ready = busy === null && reachable !== false;
  const changedTitle = changed ? t("La topología cambió desde el despliegue: «Reiniciar todo» la aplica.") : undefined;
  const working = (ids: string[]): Action | null =>
    busy === "start" || busy === "stop" || busy === "restart" ? (ids.some(id => pending.includes(id)) ? busy : null) : null;
  const canFor = (ids: string[]): Record<Action, boolean> => ({
    start: ready && !changed && ids.some(id => !isRunning(id)),
    stop: ready && ids.some(isRunning),
    restart: ready && !changed && ids.some(isRunning),
  });
  const act = (action: Action, ids: string[]) =>
    actions().devices(action, labId, topology, action === "start" ? ids.filter(id => !isRunning(id)) : ids.filter(isRunning));

  // the whole lab: what its topologies start; deployed anew when nothing runs,
  // when it changed, or to restart it
  const starting = topology.devices.filter(item => isStarted(topology, item)).map(item => item.id);
  const allCan: Record<Action, boolean> = {
    start: ready && topology.devices.length > 0 && (!deployed || changed || starting.some(id => !isRunning(id))),
    stop: ready && deployed,
    restart: ready && deployed,
  };
  const actAll = (action: Action) => {
    if(action === "stop") void actions().destroy(labId);
    else if(action === "restart" || !deployed || changed) void actions().deploy(labId, topology);
    else void act("start", starting);
  };
  const allWorking: Action | null = busy === "deploy" ? (deployed ? "restart" : "start") : busy === "destroy" ? "stop" : null;

  const stateOf = (item: Device) => {
    if(pending.includes(item.id) && (busy === "start" || busy === "stop" || busy === "restart")){
      return { text: busy === "start" ? t("iniciando…") : busy === "stop" ? t("deteniendo…") : t("reiniciando…"), kind: "" };
    }
    const state = states.get(item.id);
    if(state === "running") return { text: t("en marcha"), kind: "on" };
    if(state) return { text: state, kind: "off" };
    return { text: t("detenido"), kind: "idle" };
  };

  const info: [string, string][] = [
    [t("Laboratorio"), deployed ? t("Desplegado") : t("Sin desplegar")],
    [t("Equipos en marcha"), t("{n} de {total}", { n: running.length, total: topology.devices.length })],
    [t("Topologías y cables"), t("{zones} topologías · {links} cables", { zones: zonesOf(topology).length, links: topology.links.length })],
    [t("Emulador"), reachable === false ? t("sin conexión") : health ? `${health.version} · ${health.docker ? t("Docker conectado") : t("Docker sin conexión")}` : "…"],
    [t("Máquinas virtuales"), health?.kvm === undefined ? "…" : health.kvm ? t("con KVM (velocidad casi nativa)") : t("sin KVM (emuladas, lentas)")],
    [t("Contenedores privilegiados"), health?.privileged === undefined ? "…" : health.privileged ? t("permitidos") : t("no permitidos")],
  ];

  return (
    <div className="sim emu">
      {reachable === false && (
        <div className="outcome fail" role="alert">{t("No se puede conectar con el emulador. Comprueba que el servicio «emulator» está en marcha (docker compose up -d).")}</div>
      )}

      <section className="emu-section" aria-labelledby="emu-env">
        <h3 id="emu-env">{t("Entorno")}</h3>
        <dl className="emu-info">
          {info.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
        {changed && <p className="emu-note">{t("La topología cambió desde el despliegue: «Reiniciar todo» la aplica.")}</p>}
        {deployed && lab!.devices.some(item => item.outdated) && (
          <p className="emu-note">{t("Corren una versión anterior de su imagen: reinícialos para actualizarlos ({devices}).", { devices: lab!.devices.filter(item => item.outdated).map(item => nameOf(item.device)).join(", ") })}</p>
        )}
        {error && <div className="outcome fail" role="alert">{error}</div>}
        {deployed && warnings.length > 0 && (
          <details className="emu-warnings" open>
            <summary>{t("Lo que aún no se emula ({n})", { n: warnings.length })}</summary>
            <ul>{warnings.map(item => <li key={item}>{item}</li>)}</ul>
          </details>
        )}
      </section>

      <section className="emu-section" aria-labelledby="emu-containers">
        <div className="events-head">
          <h3 id="emu-containers">{t("Contenedores")}</h3>
          <Controls name={t("todo")} can={allCan} onAction={actAll} working={allWorking} />
        </div>
        {zonesOf(topology).map(zone => {
          const members = devicesOf(topology, zone.id);
          const ids = members.map(item => item.id);
          return (
            <details key={zone.id} className="emu-zone" open style={{ "--zone": zone.color ?? ZONE_COLORS[0] } as CSSProperties}>
              <summary>
                <span className="zone-dot" aria-hidden="true" />
                <strong>{zone.name}</strong>
                <span className="muted small">{t("{n} de {total} en marcha", { n: ids.filter(isRunning).length, total: ids.length })}</span>
                <Controls name={zone.name} can={canFor(ids)} onAction={action => act(action, ids)} working={working(ids)} title={changedTitle} />
              </summary>
              <ul className="emu-devices">
                {members.map(item => {
                  const state = stateOf(item);
                  return (
                    <li key={item.id}>
                      <span>{item.name}</span>
                      <span className="mono muted">{containerOf.get(item.id) ?? ""}</span>
                      <span className={`emu-state ${state.kind}`} title={!isStarted(topology, item) && !isRunning(item.id) ? t("Su topología no lo inicia: «Iniciar» lo arranca igualmente.") : undefined}>{state.text}</span>
                      <Controls name={item.name} can={canFor([item.id])} onAction={action => act(action, [item.id])} working={working([item.id])} title={changedTitle} />
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
        {orphans.length > 0 && (
          <details className="emu-zone" open>
            <summary><strong>{t("Fuera de la topología")}</strong></summary>
            <ul className="emu-devices">
              {orphans.map(item => (
                <li key={item.device}>
                  <span>{item.device}</span>
                  <span className="mono muted">{item.container}</span>
                  <span className={`emu-state ${item.state === "running" ? "on" : "off"}`}>{item.state === "running" ? t("en marcha") : item.state}</span>
                  <span />
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {sources.length > 0 && (
        <section className="emu-section" aria-labelledby="emu-commands">
          <h3 id="emu-commands">{t("Comandos")}</h3>
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
        </section>
      )}

      {console.length > 0 && (
        <section className="emu-section" aria-labelledby="emu-console">
          <div className="events-head">
            <h3 id="emu-console">{t("Consola")}</h3>
            <button type="button" className="ghost small" onClick={() => actions().clearConsole()}>{t("Limpiar")}</button>
          </div>
          <pre className="console emu-console" ref={output} aria-label={t("Salida de la consola")} aria-live="polite">
            {console.map(entry => (
              <span key={entry.id} className={entry.exitCode ? "emu-failed" : undefined}>
                <span className="console-prompt">{nameOf(entry.device)}$ {entry.command}</span>{"\n"}{entry.output.trimEnd()}{"\n\n"}
              </span>
            ))}
          </pre>
        </section>
      )}
    </div>
  );
}
