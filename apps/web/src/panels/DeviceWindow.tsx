// The windows of devices (a double click on one): over the canvas, moved by
// their title, resized by their corner, one per device; or each in a window
// of the browser of its own, to look at several devices side by side. Each
// has the device's properties (with its image) and its CLI: the shell of its
// container, in the emulated lab. The CLI stays open while the other tab is
// shown.
import { CATALOG, GROUPS, imageOf, isStarted, networkFingerprint, zoneOf, type Device } from "@visual-tracert/model";
import { useEffect, useId, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { runningImage, useImages } from "../emulation/images";
import { followPointer } from "../app/movable";
import { useStore, type DeviceWindow as WindowState } from "../app/store";
import { Icon } from "../editor/icons";
import { DeviceShell } from "../emulation/DeviceShell";
import { useEmulation } from "../emulation/store";
import { useT } from "../i18n";
import { DeviceProperties } from "./PropertiesPanel";
import { Popup } from "./Popup";
import { CaptureView } from "../capture/CaptureView";

export function DeviceWindows() {
  const windows = useStore(state => state.windows);
  const topology = useStore(state => state.topology);
  // drawn in a fixed order (a terminal is not moved around the page); the
  // last one raised goes on top
  const sorted = [...windows].sort((p, q) => p.device.localeCompare(q.device));
  return (
    <>
      {sorted.map(item => {
        const device = topology.devices.find(other => other.id === item.device);
        return device ? <DeviceWindowView key={item.device} state={item} device={device} layer={windows.indexOf(item)} /> : null;
      })}
    </>
  );
}

function DeviceWindowView({ state, device, layer }: { state: WindowState; device: Device; layer: number }) {
  const t = useT();
  const topology = useStore(store => store.topology);
  // the CLI starts the first time its tab is shown, and stays
  const [cliShown, setCliShown] = useState(state.tab === "cli");
  const [captureShown, setCaptureShown] = useState(state.tab === "capture");
  useEffect(() => {
    if(state.tab === "cli") setCliShown(true);
    if(state.tab === "capture") setCaptureShown(true);
  }, [state.tab]);
  const store = useStore.getState;
  const kind = CATALOG[device.type];
  const group = GROUPS.find(item => item.id === kind.group)!;

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    if(event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    const element = event.currentTarget.closest<HTMLElement>(".device-window")!;
    const parent = element.offsetParent as HTMLElement | null;
    const origin = { x: state.x, y: state.y };
    followPointer(event, (dx, dy) => {
      const maxX = (parent?.clientWidth ?? 1200) - 120;
      const maxY = (parent?.clientHeight ?? 800) - 44;
      store().raiseWindow(device.id, {
        x: Math.round(Math.min(Math.max(-element.offsetWidth + 120, origin.x + dx), maxX)),
        y: Math.round(Math.min(Math.max(0, origin.y + dy), maxY)),
      });
    });
  };

  const tabs: { id: WindowState["tab"]; label: string }[] = [
    { id: "properties", label: t("Propiedades") },
    { id: "cli", label: t("CLI") },
    { id: "capture", label: t("Captura") },
  ];

  const detached = Boolean(state.detached);
  const view = (
    <section className={`device-window${detached ? " detached" : ""}`} role="dialog" aria-label={t("{device}: propiedades y CLI", { device: device.name })}
      style={detached ? undefined : { left: state.x, top: state.y, zIndex: 20 + layer }}
      onPointerDownCapture={() => { if(!detached && layer !== store().windows.length - 1) store().raiseWindow(device.id); }}>
      <header className="dw-head" onPointerDown={detached ? undefined : move} title={detached ? undefined : t("Arrastra para mover la ventana")}>
        <span className="dw-icon"><Icon name={device.type} size={20} /></span>
        <div className="dw-title">
          <strong>{device.name}</strong>
          <span className="muted small">{t(kind.label)} · <span className="mono">{imageOf(device.type).ref}</span></span>
        </div>
        <span className={`tag tag-${group.id}`}>{t(group.label)}</span>
        <button type="button" className="icon-button" onClick={() => store().raiseWindow(device.id, { detached: !detached })}
          aria-label={detached ? t("Devolver a la página") : t("Abrir en una ventana del navegador")}
          title={detached ? t("Devolver a la página (sobre el lienzo)") : t("Abrir en una ventana del navegador, aparte de esta pestaña")}>
          <Icon name={detached ? "dock" : "external"} size={17} />
        </button>
        <button type="button" className="icon-button" aria-label={t("Cerrar")} title={t("Cerrar (cierra también su CLI)")}
          onClick={() => store().closeWindow(device.id)}>
          <Icon name="close" size={17} />
        </button>
      </header>
      <div className="tabs dw-tabs" role="tablist" aria-label={t("Ventana del dispositivo")}>
        {tabs.map(item => (
          <button key={item.id} type="button" role="tab" aria-selected={state.tab === item.id} className={state.tab === item.id ? "active" : ""}
            onClick={() => store().raiseWindow(device.id, { tab: item.id })}>
            {item.id === "cli" && <Icon name="emulation" size={15} />}{item.id === "capture" && <Icon name="capture" size={15} />}{item.label}
          </button>
        ))}
      </div>
      <div className="dw-body" hidden={state.tab !== "properties"}>
        <DeviceProperties device={device} topology={topology} windowed />
      </div>
      <div className="dw-body dw-cli" hidden={state.tab !== "cli"}>
        {cliShown && <DeviceCli device={device} />}
      </div>
      <div className="dw-body dw-cli" hidden={state.tab !== "capture"}>
        {captureShown && <DeviceCli device={device} capture={state.capture ?? ""} />}
      </div>
    </section>
  );
  if(!detached) return view;
  return (
    <Popup name={`visual-tracert-${device.id}`} title={`${device.name} · visual-tracert`} onClose={() => store().closeWindow(device.id)}>
      {view}
    </Popup>
  );
}

/** the CLI (or a capture), or what it takes to have one: the emulation, the lab deployed */
function DeviceCli({ device, capture }: { device: Device; capture?: string }) {
  const t = useT();
  const mode = useStore(state => state.mode);
  const labId = useStore(state => state.labId);
  const topology = useStore(state => state.topology);
  const { lab, busy, reachable, error } = useEmulation();
  const fingerprint = useMemo(() => networkFingerprint(topology), [topology]);
  const emulating = mode === "emulation";

  useEffect(() => { if(emulating) void useEmulation.getState().refresh(labId); }, [emulating, labId]);

  const deployed = Boolean(lab?.deployed && lab.lab === labId);
  const running = deployed && lab!.devices.some(item => item.device === device.id && item.state === "running");
  const profiles = useImages(state => state.profiles);
  const image = runningImage(imageOf(device.type).id, device.profile, profiles);
  const [shell, setShell] = useState(image.shells[0].id);
  const shellId = useId();
  const chosenShell = image.shells.some(item => item.id === shell) ? shell : image.shells[0].id;

  if(!emulating){
    return (
      <div className="dw-note">
        <p>{t("La CLI es la del contenedor real del dispositivo ({image}): funciona en el modo Emulación.", { image: image.ref })}</p>
        <button type="button" className="primary" onClick={() => useStore.getState().setMode("emulation")}>
          <Icon name="emulation" size={16} />{t("Cambiar a Emulación")}
        </button>
      </div>
    );
  }
  // its topology does not start it: no container, no CLI
  if(!isStarted(topology, device)){
    const zone = zoneOf(topology, device);
    return (
      <div className="dw-note">
        <p>{zone?.status === "hybrid"
          ? t("{device} no se inicia: su topología «{zone}» es híbrida y solo inicia los dispositivos con status: up.", { device: device.name, zone: zone.name })
          : t("{device} no se inicia: su topología «{zone}» está detenida (status: down).", { device: device.name, zone: zone?.name ?? "" })}</p>
        <button type="button" className="ghost" onClick={() => useStore.getState().select({ kind: "device", id: device.id })}>
          {t("Ver sus propiedades")}
        </button>
      </div>
    );
  }
  if(!running){
    return (
      <div className="dw-note">
        {reachable === false && <div className="outcome fail" role="alert">{t("No se puede conectar con el emulador.")}</div>}
        <p>{deployed ? t("{device} no está en marcha: vuelve a desplegar el laboratorio.", { device: device.name }) : t("Despliega el laboratorio para abrir la CLI de {device}.", { device: device.name })}</p>
        {error && <div className="outcome fail" role="alert">{error}</div>}
        <button type="button" className="primary" disabled={busy !== null || reachable === false}
          onClick={() => useEmulation.getState().deploy(labId, useStore.getState().topology)}>
          <Icon name="emulation" size={16} />
          {busy === "deploy" ? t("Desplegando…") : deployed ? t("Volver a desplegar") : t("Desplegar")}
        </button>
      </div>
    );
  }
  // the same conditions, and the capture instead of the shell
  if(capture !== undefined) return <CaptureView lab={labId} device={device} topology={topology} iface={capture || undefined} />;
  return (
    <>
      <p className="muted small dw-cli-help">
        {CATALOG[device.type].group === "generic"
          ? t("Equipo genérico: su CLI es la de {image} ({shell}).", { image: image.name, shell: image.shell })
          : t("Su CLI: {shell}.", { shell: image.shell })}
        {" "}{image.hint ? t(image.hint) : t("Prueba: ip addr, ip route, ping, traceroute.")}
      </p>
      {lab?.fingerprint !== fingerprint && <p className="emu-note">{t("La topología cambió desde el despliegue: vuelve a desplegar para aplicar los cambios.")}</p>}
      {image.shells.length > 1 && (
        <div className="shell-pick">
          <label htmlFor={shellId} className="muted small">{t("CLI")}</label>
          <select id={shellId} className="mono" value={chosenShell} onChange={event => setShell(event.target.value)}>
            {image.shells.map(item => <option key={item.id} value={item.id}>{t(item.label)}</option>)}
          </select>
        </div>
      )}
      <DeviceShell lab={labId} device={device.id} shell={chosenShell} />
    </>
  );
}
