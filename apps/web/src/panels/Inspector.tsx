// The inspector: a card over the canvas with the properties of what is
// selected (a device: first the image it runs as, then its name, type,
// topology, addresses, gateway, DNS, VLANs, routes, DHCP relays and the
// services it offers; a topology: name, status, colour, note; a cable: its
// ports), or of the lab when asked (its notes, its topologies). Nothing
// selected, it is not there. A device's properties are also those of its
// window (a double click on it).
import { useId } from "react";
import { deleteSelection, useStore } from "../app/store";
import { Icon } from "../editor/icons";
import { t as translate, tx, useT } from "../i18n";
import { addZone, CATALOG, decorated, DEVICE_STATUSES, devicesOf, GROUPS, isStarted, materialize, moveToZone, setOptions, TOPOLOGY_STATUSES, updateZone, ZONE_COLORS, zoneOf, zonesOf, inCidr, ipToInt, isIp, linkOf, PALETTE, parseCidr, roleOf, updateDevice, type Device, type DeviceType, type DhcpPool, type DnsRecord, type Interface, type Link, type Services, type Topology } from "@visual-tracert/model";
import { addressOf } from "../sim/engine";
import { Field } from "./Field";
import { ImageCard } from "./ImageCard";
import { openCapture } from "../editor/Canvas";
import { STATUS_LABEL } from "../editor/ZoneNode";
import type { DeviceStatus, TopologyStatus, Zone } from "@visual-tracert/model";

const NEW_ZONE = "+new";
const DEVICE_STATUS_LABEL: Record<DeviceStatus, string> = { up: tx("up: se inicia"), down: tx("down: no se inicia") };
const STATUS_HELP: Record<TopologyStatus, string> = {
  up: tx("Se inician todos sus dispositivos."),
  down: tx("No se inicia ninguno de sus dispositivos."),
  hybrid: tx("Solo se inician los dispositivos con status: up."),
};

const checkIp = (value: string) => (!value || isIp(value) ? null : translate("Escribe una dirección IPv4, por ejemplo 192.168.1.1."));

function checkAddress(value: string) {
  if(!value) return null;
  const [ip, prefix] = value.split("/");
  if(!isIp(ip)) return translate("Escribe IP/prefijo, por ejemplo 192.168.1.10/24.");
  if(prefix !== undefined && !(Number.isInteger(Number(prefix)) && Number(prefix) >= 1 && Number(prefix) <= 32)) return translate("El prefijo va de 1 a 32.");
  return null;
}

export function DeviceProperties({ device, topology, windowed = false }: { device: Device; topology: Topology; windowed?: boolean }) {
  const t = useT();
  const typeId = useId();
  const zoneId = useId();
  const statusId = useId();
  const zones = zonesOf(topology);
  const zone = zoneOf(topology, device);
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
      {!windowed && (
        <div className="props-title">
          <span className="props-icon"><Icon name={device.type} size={22} /></span>
          <div><h2>{device.name}</h2><span className="mono muted">{device.id}</span></div>
          <button type="button" className="icon-button props-window" title={t("Abrir en una ventana, con su CLI (doble clic en el dispositivo)")}
            aria-label={t("Abrir en una ventana")} onClick={() => useStore.getState().openWindow(device.id)}>
            <Icon name="undock" size={17} />
          </button>
          <button type="button" className="icon-button" title={t("Abrir en una ventana del navegador, aparte de esta pestaña")}
            aria-label={t("Abrir en una ventana del navegador")} onClick={() => useStore.getState().openWindow(device.id, undefined, true)}>
            <Icon name="external" size={17} />
          </button>
        </div>
      )}

      <ImageCard device={device} />

      <Field label={t("Nombre")} value={device.name} onApply={name => change(item => ({ ...item, name: name || item.name }))} />
      <div className="field">
        <label htmlFor={typeId}>{t("Tipo")}</label>
        <select id={typeId} value={device.type}
          onChange={event => change(item => ({ ...item, type: event.target.value as DeviceType }))}>
          {GROUPS.map(group => (
            <optgroup key={group.id} label={t(group.label)}>
              {PALETTE.filter(type => CATALOG[type].group === group.id).map(type => <option key={type} value={type}>{t(CATALOG[type].label)}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="pair">
        <div className="field">
          <label htmlFor={zoneId}>{t("Topología")}</label>
          <select id={zoneId} value={zone?.id ?? ""} onChange={event => {
            const state = useStore.getState();
            if(event.target.value !== NEW_ZONE){ state.commit(moveToZone(state.topology, device.id, event.target.value)); return; }
            const created = addZone(state.topology, t("Topología {n}", { n: zones.length + 1 }), { x: device.position.x + 260, y: device.position.y });
            state.commit(moveToZone(created.topology, device.id, created.zone.id));
          }}>
            {zones.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            <option value={NEW_ZONE}>{t("+ Nueva topología")}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={statusId}>{t("Estado (status)")}</label>
          <select id={statusId} className="mono" value={device.status ?? ""}
            onChange={event => change(item => ({ ...item, status: (event.target.value || undefined) as DeviceStatus | undefined }))}>
            <option value="">{t("(sin status)")}</option>
            {DEVICE_STATUSES.map(item => <option key={item} value={item}>{t(DEVICE_STATUS_LABEL[item])}</option>)}
          </select>
          <small className="field-hint">
            {zone?.status === "hybrid"
              ? (isStarted(topology, device) ? t("Su topología es híbrida: se inicia.") : t("Su topología es híbrida: sin status: up no se inicia."))
              : t("Solo cuenta si su topología es híbrida (ahora: {status}).", { status: t(STATUS_LABEL[zone?.status ?? "up"]).toLowerCase() })}
          </small>
        </div>
      </div>
      <Field label={t("Descripción")} value={device.description ?? ""} placeholder={t("Opcional")}
        onApply={description => change(item => ({ ...item, description: description || undefined }))} />
      {role === "host" && (
        <Field label={t("Puerta de enlace")} value={device.gateway ?? ""} placeholder="192.168.1.1" mono check={checkIp}
          hint={t("El router al que envía lo que no está en su red.")}
          onApply={gateway => change(item => ({ ...item, gateway: gateway || undefined }))} />
      )}
      {role === "host" && (
        <Field label={t("Servidor DNS")} value={device.dns ?? ""} placeholder="8.8.8.8" mono check={checkIp}
          hint={t("A quién pregunta por los nombres (www.ejemplo.com).")}
          onApply={dns => change(item => ({ ...item, dns: dns || undefined }))} />
      )}

      <h3>{t("Interfaces")}</h3>
      <div className="ifaces">
        {device.interfaces.map(iface => {
          const peer = peerOf(iface);
          return (
            <div key={iface.name} className={`iface${peer ? "" : " iface-free"}`}>
              <div className="iface-head">
                <strong className="mono">{iface.name}</strong>
                <span className={peer ? "cable" : "cable none"}>{peer ?? t("sin cable")}</span>
              </div>
              {role === "host" && (
                <label className="check-row">
                  <input type="checkbox" checked={Boolean(iface.dhcp)}
                    onChange={event => changeIface(iface.name, item => ({ ...item, dhcp: event.target.checked || undefined }))} />
                  {t("Dirección por DHCP")}
                </label>
              )}
              {role !== "switch" && (
                <Field label={iface.dhcp ? t("IP/prefijo (concedida)") : t("IP/prefijo")} value={iface.ip ? `${iface.ip}/${iface.prefix ?? 24}` : ""} placeholder={t("Sin dirección")} mono check={checkAddress} hint={iface.ip ? undefined : t("Ej. 192.168.1.10/24")}
                  onApply={value => changeIface(iface.name, item => {
                    if(!value){ const { ip: _ip, prefix: _prefix, ...rest } = item; return rest; }
                    const [ip, prefix] = value.split("/");
                    return { ...item, ip, prefix: prefix ? Number(prefix) : 24 };
                  })} />
              )}
              {role === "router" && (
                <Field label={t("Relay DHCP")} value={iface.relay ?? ""} placeholder={t("Sin relay")} mono check={checkIp}
                  hint={iface.relay ? undefined : t("IP de un servidor DHCP: las difusiones DHCP de esta red se le reenvían.")}
                  onApply={relay => changeIface(iface.name, item => ({ ...item, relay: relay || undefined }))} />
              )}
              {role === "switch" && (
                <Field label="VLAN" value={String(iface.vlan ?? 1)} mono
                  check={value => (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 4094 ? null : t("De 1 a 4094."))}
                  onApply={value => changeIface(iface.name, item => ({ ...item, vlan: Number(value) === 1 ? undefined : Number(value) }))} />
              )}
              <span className="mono muted iface-mac">{iface.mac}</span>
            </div>
          );
        })}
      </div>

      {role === "router" && <Routes device={device} change={change} />}
      {role !== "switch" && <ServicesEditor device={device} change={change} />}


      <div className="props-actions">
        {role === "host" && device.interfaces.some(iface => iface.dhcp) && (
          <button type="button" className="ghost" onClick={() => useStore.getState().runSim({ kind: "dhcp", from: device.id })}>
            <Icon name="ping" size={17} />{t("Pedir dirección por DHCP")}
          </button>
        )}
        <button type="button" className="primary" disabled={!addressOf(device)}
          title={addressOf(device) ? t("Elige el destino en la pestaña Simulación") : t("Este equipo no tiene IP")}
          onClick={() => {
            const state = useStore.getState();
            state.setDraft({ from: device.id });
            state.setTab("simulation");
          }}>
          <Icon name="ping" size={17} />{t("Hacer ping desde aquí")}
        </button>
      </div>
    </div>
  );
}

function Routes({ device, change }: { device: Device; change: Change }) {
  const t = useT();
  const routes = device.routes ?? [];
  const set = (next: typeof routes) => change(item => ({ ...item, routes: next.length ? next : undefined }));
  return (
    <>
      <h3>{t("Rutas estáticas")}</h3>
      {!routes.length && <p className="muted small">{t("Sin rutas: solo alcanza sus redes conectadas.")}</p>}
      <div className="routes">
        {routes.map((route, index) => (
          <div key={`${route.prefix}-${index}`} className="route">
            <Field label={t("Destino")} value={route.prefix} mono check={value => (parseCidr(value) ? null : t("Ej. 10.0.2.0/24 o 0.0.0.0/0."))}
              onApply={prefix => set(routes.map((item, i) => i === index ? { ...item, prefix } : item))} />
            <Field label={t("Siguiente salto")} value={route.via} mono check={value => (isIp(value) ? null : t("Una dirección IPv4."))}
              onApply={via => set(routes.map((item, i) => i === index ? { ...item, via } : item))} />
            <button type="button" className="icon-button" aria-label={t("Quitar la ruta")} title={t("Quitar la ruta")}
              onClick={() => set(routes.filter((_, i) => i !== index))}><Icon name="close" size={16} /></button>
          </div>
        ))}
      </div>
      <button type="button" className="ghost small" onClick={() => set([...routes, { prefix: "0.0.0.0/0", via: "0.0.0.0" }])}>
        <Icon name="plus" size={15} />{t("Añadir ruta")}
      </button>
    </>
  );
}

type Change = (update: (device: Device) => Device) => void;

/** The services of a device: web server, DHCP ranges, DNS records. */
function ServicesEditor({ device, change }: { device: Device; change: Change }) {
  const t = useT();
  const services = device.services ?? {};
  const set = (next: Services) => change(item => {
    const clean: Services = {
      ...(next.dhcp?.length ? { dhcp: next.dhcp } : {}),
      ...(next.dns?.length ? { dns: next.dns } : {}),
      ...(next.http ? { http: true } : {}),
    };
    return { ...item, services: Object.keys(clean).length ? clean : undefined };
  });
  const pools = services.dhcp ?? [];
  const records = services.dns ?? [];
  const setPool = (index: number, pool: DhcpPool) => set({ ...services, dhcp: pools.map((item, i) => i === index ? pool : item) });
  const setRecord = (index: number, record: DnsRecord) => set({ ...services, dns: records.map((item, i) => i === index ? record : item) });
  const optionalIp = (value: string) => (!value || isIp(value) ? null : t("Una dirección IPv4, o vacío."));

  // a new range: the network of the first interface with an address
  const addPool = () => {
    const iface = device.interfaces.find(item => item.ip && item.prefix);
    const cidr = iface ? parseCidr(`${iface.ip}/${iface.prefix}`) : null;
    const base = cidr ? cidr.network.split(".").slice(0, 3).join(".") : "192.168.1";
    set({ ...services, dhcp: [...pools, {
      network: cidr ? `${cidr.network}/${cidr.prefix}` : "192.168.1.0/24",
      start: `${base}.100`, end: `${base}.199`,
      ...(device.gateway ? { gateway: device.gateway } : iface && roleOf(device.type) === "router" ? { gateway: iface.ip } : {}),
      ...(device.dns ? { dns: device.dns } : {}),
    }] });
  };

  return (
    <>
      <h3>{t("Servicios")}</h3>
      <label className="check-row">
        <input type="checkbox" checked={Boolean(services.http)} onChange={event => set({ ...services, http: event.target.checked })} />
        {t("Servidor web (HTTP, puerto 80)")}
      </label>

      <h4>DHCP</h4>
      {!pools.length && <p className="muted small">{t("No reparte direcciones.")}</p>}
      {pools.map((pool, index) => (
        <div key={index} className="service-card">
          <div className="service-head">
            <strong className="mono">{pool.network}</strong>
            <button type="button" className="icon-button" aria-label={t("Quitar el rango")} title={t("Quitar el rango")}
              onClick={() => set({ ...services, dhcp: pools.filter((_, i) => i !== index) })}><Icon name="close" size={16} /></button>
          </div>
          <Field label={t("Red")} value={pool.network} mono check={value => (parseCidr(value) ? null : t("Ej. 192.168.1.0/24."))}
            onApply={value => { const cidr = parseCidr(value)!; setPool(index, { ...pool, network: `${cidr.network}/${cidr.prefix}` }); }} />
          <div className="pair">
            <Field label={t("Desde")} value={pool.start} mono
              check={value => (isIp(value) && inCidr(value, pool.network) ? (ipToInt(value) <= ipToInt(pool.end) ? null : t("Va antes que Hasta.")) : t("Una dirección de {network}.", { network: pool.network }))}
              onApply={start => setPool(index, { ...pool, start })} />
            <Field label={t("Hasta")} value={pool.end} mono
              check={value => (isIp(value) && inCidr(value, pool.network) ? (ipToInt(value) >= ipToInt(pool.start) ? null : t("Va después de Desde.")) : t("Una dirección de {network}.", { network: pool.network }))}
              onApply={end => setPool(index, { ...pool, end })} />
          </div>
          <div className="pair">
            <Field label={t("Puerta de enlace")} value={pool.gateway ?? ""} placeholder={t("Ninguna")} mono check={optionalIp}
              onApply={gateway => setPool(index, { ...pool, gateway: gateway || undefined })} />
            <Field label="DNS" value={pool.dns ?? ""} placeholder={t("Ninguno")} mono check={optionalIp}
              onApply={dns => setPool(index, { ...pool, dns: dns || undefined })} />
          </div>
        </div>
      ))}
      <button type="button" className="ghost small" onClick={addPool}><Icon name="plus" size={15} />{t("Añadir rango DHCP")}</button>

      <h4>DNS</h4>
      {!records.length && <p className="muted small">{t("No responde consultas DNS.")}</p>}
      <div className="routes">
        {records.map((record, index) => (
          <div key={`${record.name}-${index}`} className="route">
            <Field label={t("Nombre")} value={record.name} mono check={value => (value ? null : t("Escribe un nombre."))}
              onApply={name => setRecord(index, { ...record, name: name.toLowerCase().replace(/\.$/, "") })} />
            <Field label="IP" value={record.ip} mono check={value => (isIp(value) ? null : t("Una dirección IPv4."))}
              onApply={ip => setRecord(index, { ...record, ip })} />
            <button type="button" className="icon-button" aria-label={t("Quitar el registro")} title={t("Quitar el registro")}
              onClick={() => set({ ...services, dns: records.filter((_, i) => i !== index) })}><Icon name="close" size={16} /></button>
          </div>
        ))}
      </div>
      <button type="button" className="ghost small"
        onClick={() => set({ ...services, dns: [...records, { name: t("nombre{n}.lan", { n: records.length + 1 }), ip: device.interfaces.find(item => item.ip)?.ip ?? "0.0.0.0" }] })}>
        <Icon name="plus" size={15} />{t("Añadir registro DNS")}
      </button>
    </>
  );
}

function LinkProperties({ link, topology }: { link: Link; topology: Topology }) {
  const t = useT();
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
      <div className="props-title"><div><h2>{t("Cable {id}", { id: link.id })}</h2><span className="muted small">{t("Cambia el puerto de cada extremo.")}</span></div></div>
      {end("a")}
      {end("b")}
      <div className="props-actions">
        <button type="button" className="ghost" title={t("Captura el tráfico real del cable (en Emulación)")}
          onClick={() => openCapture(link.a.device, link.a.interface)}>
          <Icon name="capture" size={16} />{t("Capturar tráfico en este cable")}
        </button>
      </div>
    </div>
  );
}

function ZoneProperties({ zone, topology }: { zone: Zone; topology: Topology }) {
  const t = useT();
  const statusId = useId();
  const textId = useId();
  const devices = devicesOf(topology, zone.id);
  const started = devices.filter(device => isStarted(topology, device)).length;
  const change = (update: (zone: Zone) => Zone) => {
    const state = useStore.getState();
    state.commit(updateZone(state.topology, zone.id, update));
  };
  const color = zone.color ?? ZONE_COLORS[0];
  return (
    <div className="props">
      <div className="props-title">
        <span className="props-icon zone-swatch" style={{ background: color }} />
        <div><h2>{zone.name}</h2><span className="mono muted">{zone.id}</span></div>
      </div>

      <Field label={t("Nombre")} value={zone.name} onApply={name => change(item => ({ ...item, name: name || item.name }))} />
      <div className="field">
        <label htmlFor={statusId}>{t("Estado (status)")}</label>
        <select id={statusId} value={zone.status} onChange={event => change(item => ({ ...item, status: event.target.value as TopologyStatus }))}>
          {TOPOLOGY_STATUSES.map(item => <option key={item} value={item}>{item} · {t(STATUS_LABEL[item])}</option>)}
        </select>
        <small className="field-hint">{t(STATUS_HELP[zone.status])} {t("En Emulación: {n} de {total} dispositivos se inician.", { n: started, total: devices.length })}</small>
      </div>

      <div className="field">
        <span className="label">{t("Color")}</span>
        <div className="swatches" role="radiogroup" aria-label={t("Color")}>
          {ZONE_COLORS.map(item => (
            <button key={item} type="button" role="radio" aria-checked={color === item} className={`swatch${color === item ? " active" : ""}`}
              style={{ background: item }} title={item} aria-label={item} onClick={() => change(other => ({ ...other, color: item }))} />
          ))}
          <label className="swatch swatch-custom" title={t("Otro color")}>
            <input type="color" value={color} aria-label={t("Otro color")} onChange={event => change(other => ({ ...other, color: event.target.value }))} />
          </label>
        </div>
      </div>

      <div className="field">
        <label htmlFor={textId}>{t("Texto")}</label>
        <textarea id={textId} rows={2} defaultValue={zone.text ?? ""} key={zone.id + (zone.text ?? "")} placeholder={t("Una nota que se ve dentro del rectángulo")}
          onBlur={event => { const text = event.target.value.trim(); if(text !== (zone.text ?? "")) change(item => ({ ...item, text: text || undefined })); }} />
      </div>

      <h3>{t("Dispositivos ({n})", { n: devices.length })}</h3>
      {!devices.length && <p className="muted small">{t("Ninguno: arrastra dispositivos dentro de su rectángulo o elige esta topología en sus propiedades.")}</p>}
      <ul className="zone-devices">
        {devices.map(device => (
          <li key={device.id}>
            <button type="button" className="link" onClick={() => useStore.getState().select({ kind: "device", id: device.id })}>
              <Icon name={device.type} size={16} />{device.name}
            </button>
            <span className={`emu-state ${isStarted(topology, device) ? "on" : "off"}`}>{isStarted(topology, device) ? t("se inicia") : t("no se inicia")}</span>
          </li>
        ))}
      </ul>
      {!decorated(topology) && <p className="emu-note">{t("Las decoraciones están desactivadas (options.decorations): el rectángulo no se dibuja.")}</p>}

      <div className="props-actions">
        <button type="button" className="danger" onClick={() => { useStore.getState().select({ kind: "zone", id: zone.id }); deleteSelection(); }}>
          <Icon name="trash" size={16} />{devices.length ? t("Eliminar la topología y sus dispositivos") : t("Eliminar la topología")}
        </button>
      </div>
    </div>
  );
}

/** A translated line with its keys ([Ctrl]) and bold words (*Añadir*) marked. */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(\[[^\]]+\]|\*[^*]+\*)/).map((part, i) =>
    part.startsWith("[") ? <kbd key={i}>{part.slice(1, -1)}</kbd>
      : part.startsWith("*") ? <strong key={i}>{part.slice(1, -1)}</strong>
      : part)}</>;
}

/** The description of a lab: paragraphs, and "- " lines as a list. */
function LabNotes({ text }: { text: string }) {
  return (
    <div className="lab-notes">
      {text.split(/\n\s*\n/).map((block, i) => {
        const lines = block.split("\n");
        const items = lines.filter(line => line.startsWith("- "));
        const heading = lines.filter(line => !line.startsWith("- ")).join(" ");
        return (
          <div key={i}>
            {heading && (items.length ? <h4>{heading.replace(/:$/, "")}</h4> : <p className="small">{heading}</p>)}
            {items.length > 0 && <ol className="try">{items.map(item => <li key={item}>{item.slice(2)}</li>)}</ol>}
          </div>
        );
      })}
    </div>
  );
}

function LabSummary({ topology }: { topology: Topology }) {
  const t = useT();
  const count = (role: string) => topology.devices.filter(device => roleOf(device.type) === role).length;
  return (
    <div className="props">
      <div className="props-title"><div><h2>{topology.name}</h2><span className="muted small">{t("El laboratorio y sus topologías")}</span></div></div>
      {topology.description && <LabNotes text={topology.description} />}
      <div className="stats">
        <div><strong>{count("host")}</strong><span>{t("equipos")}</span></div>
        <div><strong>{count("switch")}</strong><span>{t("switches")}</span></div>
        <div><strong>{count("router")}</strong><span>{t("routers")}</span></div>
        <div><strong>{topology.links.length}</strong><span>{t("cables")}</span></div>
      </div>
      <h3>{t("Topologías")}</h3>
      <ul className="zone-list">
        {zonesOf(topology).map(zone => (
          <li key={zone.id}>
            <button type="button" className="link" onClick={() => {
              const state = useStore.getState();
              // the implicit one becomes real when it is chosen
              if(!state.topology.zones?.length) state.commit(materialize(state.topology));
              state.select({ kind: "zone", id: zone.id });
            }}>
              <span className="zone-swatch small" style={{ background: zone.color ?? ZONE_COLORS[0] }} />{zone.name}
            </button>
            <span className="muted small">{t(STATUS_LABEL[zone.status])} · {devicesOf(topology, zone.id).length}</span>
          </li>
        ))}
      </ul>
      <label className="check-row">
        <input type="checkbox" checked={decorated(topology)}
          onChange={event => { const state = useStore.getState(); state.commit(setOptions(state.topology, { decorations: event.target.checked })); }} />
        {t("Dibujar los rectángulos de las topologías (options.decorations)")}
      </label>

      <button type="button" className="ghost gallery-open" onClick={() => useStore.getState().setGallery(true)}>
        <Icon name="logo" size={16} />{t("Abrir una plantilla de laboratorio")}
      </button>
    </div>
  );
}

/** How the editor is used: the help of the dashboard. */
export function HelpList() {
  const t = useT();
  return (
    <ul className="help">
      {[
        t("Pulsa *Añadir dispositivo* ([A]) en la barra de abajo, busca el que quieras y haz clic, pulsa [Enter] o arrástralo al lienzo."),
        t("Para cablear, arrastra desde el borde de un dispositivo hasta otro: se usan sus primeros puertos libres."),
        t("Haz clic en un dispositivo, un cable o una topología: el inspector muestra sus propiedades. [Esc] lo cierra."),
        t("*Nueva topología* crea un grupo de dispositivos con su rectángulo; arrástralo por su título y suelta dispositivos dentro para moverlos a él."),
        t("Doble clic en un dispositivo abre su ventana: sus propiedades, su imagen y su CLI (en Emulación)."),
        t("Con la herramienta de ping ([P]), haz clic en el origen y luego en el destino."),
        t("En la pestaña Simulación hay más acciones: traza (tracert), DHCP, consultas DNS y páginas web por TCP."),
        t("[Supr] elimina, [Ctrl]+[Z] deshace, [F] encuadra."),
        t("El panel lateral: su borde izquierdo cambia el ancho; arriba a la derecha se desacopla como ventana flotante o se abre a pantalla completa ([Esc] vuelve)."),
        t("Las barras del lienzo se mueven arrastrando sus puntos (⋮⋮); doble clic en ellos las devuelve a su sitio. [L] muestra el registro de paquetes."),
      ].map(line => <li key={line}><Rich text={line} /></li>)}
    </ul>
  );
}

const KIND_LABEL = { device: tx("Dispositivo"), zone: tx("Topología"), link: tx("Cable"), lab: tx("Laboratorio") } as const;

export function Inspector() {
  const t = useT();
  const topology = useStore(state => state.topology);
  const selection = useStore(state => state.selection);
  const inspectLab = useStore(state => state.inspectLab);
  let kind: keyof typeof KIND_LABEL | null = null;
  let content = null;
  if(selection?.kind === "device"){
    const device = topology.devices.find(item => item.id === selection.id);
    if(device){ kind = "device"; content = <DeviceProperties device={device} topology={topology} />; }
  }else if(selection?.kind === "zone"){
    const zone = zonesOf(topology).find(item => item.id === selection.id);
    if(zone){ kind = "zone"; content = <ZoneProperties zone={zone} topology={topology} />; }
  }else if(selection?.kind === "link"){
    const link = topology.links.find(item => item.id === selection.id);
    if(link){ kind = "link"; content = <LinkProperties link={link} topology={topology} />; }
  }
  if(!content && inspectLab){ kind = "lab"; content = <LabSummary topology={topology} />; }
  if(!content || !kind) return null;
  const close = () => { const state = useStore.getState(); state.select(null); state.setInspectLab(false); };
  return (
    <aside className="inspector" aria-label={t("Inspector: {kind}", { kind: t(KIND_LABEL[kind]) })}>
      <header className="inspector-head">
        <span className="inspector-kind">{t(KIND_LABEL[kind])}</span>
        <button type="button" className="icon-button" aria-label={t("Cerrar")} title={t("Cerrar (Esc)")} onClick={close}>
          <Icon name="close" size={16} />
        </button>
      </header>
      {/* a new key, a new card: it slides in again for each thing selected */}
      <div className="inspector-body" key={`${kind}:${selection?.id ?? ""}`}>{content}</div>
    </aside>
  );
}
