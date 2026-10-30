// Properties of what is selected: a device (name, type, addresses, gateway,
// VLANs, routes), a cable (its ports), or the lab when nothing is.
import { useStore } from "../app/store";
import { Icon } from "../editor/icons";
import { CATALOG, PALETTE, roleOf } from "../model/catalog";
import { isIp, parseCidr } from "../model/net";
import { linkOf, updateDevice } from "../model/topology";
import type { Device, DeviceType, Interface, Link, Topology } from "../model/types";
import { addressOf } from "../sim/engine";
import { Field } from "./Field";

const checkIp = (value: string) => (!value || isIp(value) ? null : "Escribe una dirección IPv4, por ejemplo 192.168.1.1.");

function checkAddress(value: string) {
  if(!value) return null;
  const [ip, prefix] = value.split("/");
  if(!isIp(ip)) return "Escribe IP/prefijo, por ejemplo 192.168.1.10/24.";
  if(prefix !== undefined && !(Number.isInteger(Number(prefix)) && Number(prefix) >= 1 && Number(prefix) <= 32)) return "El prefijo va de 1 a 32.";
  return null;
}

function DeviceProperties({ device, topology }: { device: Device; topology: Topology }) {
  const role = roleOf(device.type);
  const change = (update: (device: Device) => Device) => {
    const state = useStore.getState();
    state.commit(updateDevice(state.topology, device.id, update));
  };
  const changeIface = (name: string, update: (iface: Interface) => Interface) =>
    change(item => ({ ...item, interfaces: item.interfaces.map(iface => iface.name === name ? update(iface) : iface) }));
  const peerOf = (iface: Interface) => {
    const link = linkOf(topology, { device: device.id, interface: iface.name });
    if(!link) return null;
    const end = link.a.device === device.id && link.a.interface === iface.name ? link.b : link.a;
    const other = topology.devices.find(item => item.id === end.device);
    return `${other?.name ?? end.device} · ${end.interface}`;
  };

  return (
    <div className="props">
      <div className="props-title">
        <span className="props-icon"><Icon name={device.type} size={22} /></span>
        <div><h2>{device.name}</h2><span className="mono muted">{device.id}</span></div>
      </div>

      <Field label="Nombre" value={device.name} onApply={name => change(item => ({ ...item, name: name || item.name }))} />
      <div className="field">
        <label htmlFor="device-type">Tipo</label>
        <select id="device-type" value={device.type}
          onChange={event => change(item => ({ ...item, type: event.target.value as DeviceType }))}>
          {PALETTE.map(type => <option key={type} value={type}>{CATALOG[type].label}</option>)}
        </select>
      </div>
      <Field label="Descripción" value={device.description ?? ""} placeholder="Opcional"
        onApply={description => change(item => ({ ...item, description: description || undefined }))} />
      {role === "host" && (
        <Field label="Puerta de enlace" value={device.gateway ?? ""} placeholder="192.168.1.1" mono check={checkIp}
          hint="El router al que envía lo que no está en su red."
          onApply={gateway => change(item => ({ ...item, gateway: gateway || undefined }))} />
      )}

      <h3>Interfaces</h3>
      <div className="ifaces">
        {device.interfaces.map(iface => {
          const peer = peerOf(iface);
          return (
            <div key={iface.name} className={`iface${peer ? "" : " iface-free"}`}>
              <div className="iface-head">
                <strong className="mono">{iface.name}</strong>
                <span className={peer ? "cable" : "cable none"}>{peer ?? "sin cable"}</span>
              </div>
              {role !== "switch" && (
                <Field label="IP/prefijo" value={iface.ip ? `${iface.ip}/${iface.prefix ?? 24}` : ""} placeholder="Sin dirección" mono check={checkAddress} hint={iface.ip ? undefined : "Ej. 192.168.1.10/24"}
                  onApply={value => changeIface(iface.name, item => {
                    if(!value){ const { ip: _ip, prefix: _prefix, ...rest } = item; return rest; }
                    const [ip, prefix] = value.split("/");
                    return { ...item, ip, prefix: prefix ? Number(prefix) : 24 };
                  })} />
              )}
              {role === "switch" && (
                <Field label="VLAN" value={String(iface.vlan ?? 1)} mono
                  check={value => (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 4094 ? null : "De 1 a 4094.")}
                  onApply={value => changeIface(iface.name, item => ({ ...item, vlan: Number(value) === 1 ? undefined : Number(value) }))} />
              )}
              <span className="mono muted iface-mac">{iface.mac}</span>
            </div>
          );
        })}
      </div>

      {role === "router" && <Routes device={device} change={change} />}

      <div className="props-actions">
        <button type="button" className="primary" disabled={!addressOf(device)}
          title={addressOf(device) ? "Elige el destino en la pestaña Simulación" : "Este equipo no tiene IP"}
          onClick={() => {
            const state = useStore.getState();
            state.setDraft({ from: device.id });
            state.setTab("simulation");
          }}>
          <Icon name="ping" size={17} />Hacer ping desde aquí
        </button>
      </div>
    </div>
  );
}

function Routes({ device, change }: { device: Device; change: (update: (device: Device) => Device) => void }) {
  const routes = device.routes ?? [];
  const set = (next: typeof routes) => change(item => ({ ...item, routes: next.length ? next : undefined }));
  return (
    <>
      <h3>Rutas estáticas</h3>
      {!routes.length && <p className="muted small">Sin rutas: solo alcanza sus redes conectadas.</p>}
      <div className="routes">
        {routes.map((route, index) => (
          <div key={`${route.prefix}-${index}`} className="route">
            <Field label="Destino" value={route.prefix} mono check={value => (parseCidr(value) ? null : "Ej. 10.0.2.0/24 o 0.0.0.0/0.")}
              onApply={prefix => set(routes.map((item, i) => i === index ? { ...item, prefix } : item))} />
            <Field label="Siguiente salto" value={route.via} mono check={value => (isIp(value) ? null : "Una dirección IPv4.")}
              onApply={via => set(routes.map((item, i) => i === index ? { ...item, via } : item))} />
            <button type="button" className="icon-button" aria-label="Quitar la ruta" title="Quitar la ruta"
              onClick={() => set(routes.filter((_, i) => i !== index))}><Icon name="close" size={16} /></button>
          </div>
        ))}
      </div>
      <button type="button" className="ghost small" onClick={() => set([...routes, { prefix: "0.0.0.0/0", via: "0.0.0.0" }])}>
        <Icon name="plus" size={15} />Añadir ruta
      </button>
    </>
  );
}

function LinkProperties({ link, topology }: { link: Link; topology: Topology }) {
  const end = (side: "a" | "b") => {
    const endpoint = link[side];
    const device = topology.devices.find(item => item.id === endpoint.device);
    const options = device?.interfaces.filter(iface =>
      iface.name === endpoint.interface || !linkOf(topology, { device: endpoint.device, interface: iface.name })) ?? [];
    return (
      <div className="field">
        <label htmlFor={`end-${side}`}>{device?.name ?? endpoint.device}</label>
        <select id={`end-${side}`} value={endpoint.interface} onChange={event => {
          const state = useStore.getState();
          state.commit({
            ...state.topology,
            links: state.topology.links.map(item => item.id === link.id ? { ...item, [side]: { ...endpoint, interface: event.target.value } } : item),
          });
        }}>
          {options.map(iface => <option key={iface.name} value={iface.name}>{iface.name}{iface.ip ? ` · ${iface.ip}/${iface.prefix}` : ""}</option>)}
        </select>
      </div>
    );
  };
  return (
    <div className="props">
      <div className="props-title"><div><h2>Cable {link.id}</h2><span className="muted small">Cambia el puerto de cada extremo.</span></div></div>
      {end("a")}
      {end("b")}
    </div>
  );
}

function LabSummary({ topology }: { topology: Topology }) {
  const count = (role: string) => topology.devices.filter(device => roleOf(device.type) === role).length;
  return (
    <div className="props">
      <div className="props-title"><div><h2>{topology.name}</h2><span className="muted small">Nada seleccionado</span></div></div>
      <div className="stats">
        <div><strong>{count("host")}</strong><span>equipos</span></div>
        <div><strong>{count("switch")}</strong><span>switches</span></div>
        <div><strong>{count("router")}</strong><span>routers</span></div>
        <div><strong>{topology.links.length}</strong><span>cables</span></div>
      </div>
      <h3>Cómo se usa</h3>
      <ul className="help">
        <li>Pulsa <strong>Añadir dispositivo</strong> (<kbd>A</kbd>) en la barra de abajo, busca el que quieras y haz clic, pulsa <kbd>Enter</kbd> o arrástralo al lienzo.</li>
        <li>Para cablear, arrastra desde el borde de un dispositivo hasta otro: se usan sus primeros puertos libres.</li>
        <li>Selecciona un dispositivo para poner sus direcciones, su puerta de enlace o sus rutas.</li>
        <li>Con la herramienta de ping (P), haz clic en el origen y luego en el destino.</li>
        <li><kbd>Supr</kbd> elimina, <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshace, <kbd>F</kbd> encuadra.</li>
        <li>Este panel: su borde izquierdo cambia el ancho; arriba a la derecha se desacopla como ventana flotante o se abre a pantalla completa (<kbd>Esc</kbd> vuelve).</li>
        <li>Las barras del lienzo se mueven arrastrando sus puntos (⋮⋮); doble clic en ellos las devuelve a su sitio. <kbd>L</kbd> muestra el registro de paquetes.</li>
      </ul>
    </div>
  );
}

export function PropertiesPanel() {
  const topology = useStore(state => state.topology);
  const selection = useStore(state => state.selection);
  if(selection?.kind === "device"){
    const device = topology.devices.find(item => item.id === selection.id);
    if(device) return <DeviceProperties device={device} topology={topology} />;
  }
  if(selection?.kind === "link"){
    const link = topology.links.find(item => item.id === selection.id);
    if(link) return <LinkProperties link={link} topology={topology} />;
  }
  return <LabSummary topology={topology} />;
}
