// Properties of what is selected: a device (name, type, addresses, gateway,
// DNS, VLANs, routes, DHCP relays and the services it offers), a cable (its
// ports), or the lab when nothing is.
import { useStore } from "../app/store";
import { Icon } from "../editor/icons";
import { t as translate, useT } from "../i18n";
import { CATALOG, inCidr, ipToInt, isIp, linkOf, PALETTE, parseCidr, roleOf, updateDevice, type Device, type DeviceType, type DhcpPool, type DnsRecord, type Interface, type Link, type Services, type Topology } from "@visual-tracert/model";
import { addressOf } from "../sim/engine";
import { Field } from "./Field";

const checkIp = (value: string) => (!value || isIp(value) ? null : translate("Escribe una dirección IPv4, por ejemplo 192.168.1.1."));

function checkAddress(value: string) {
  if(!value) return null;
  const [ip, prefix] = value.split("/");
  if(!isIp(ip)) return translate("Escribe IP/prefijo, por ejemplo 192.168.1.10/24.");
  if(prefix !== undefined && !(Number.isInteger(Number(prefix)) && Number(prefix) >= 1 && Number(prefix) <= 32)) return translate("El prefijo va de 1 a 32.");
  return null;
}

function DeviceProperties({ device, topology }: { device: Device; topology: Topology }) {
  const t = useT();
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

      <Field label={t("Nombre")} value={device.name} onApply={name => change(item => ({ ...item, name: name || item.name }))} />
      <div className="field">
        <label htmlFor="device-type">{t("Tipo")}</label>
        <select id="device-type" value={device.type}
          onChange={event => change(item => ({ ...item, type: event.target.value as DeviceType }))}>
          {PALETTE.map(type => <option key={type} value={type}>{t(CATALOG[type].label)}</option>)}
        </select>
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
      <div className="props-title"><div><h2>{topology.name}</h2><span className="muted small">{t("Nada seleccionado")}</span></div></div>
      {topology.description && <LabNotes text={topology.description} />}
      <div className="stats">
        <div><strong>{count("host")}</strong><span>{t("equipos")}</span></div>
        <div><strong>{count("switch")}</strong><span>{t("switches")}</span></div>
        <div><strong>{count("router")}</strong><span>{t("routers")}</span></div>
        <div><strong>{topology.links.length}</strong><span>{t("cables")}</span></div>
      </div>
      <button type="button" className="ghost gallery-open" onClick={() => useStore.getState().setGallery(true)}>
        <Icon name="logo" size={16} />{t("Abrir una plantilla de laboratorio")}
      </button>
      <h3>{t("Cómo se usa")}</h3>
      <ul className="help">
        {[
          t("Pulsa *Añadir dispositivo* ([A]) en la barra de abajo, busca el que quieras y haz clic, pulsa [Enter] o arrástralo al lienzo."),
          t("Para cablear, arrastra desde el borde de un dispositivo hasta otro: se usan sus primeros puertos libres."),
          t("Selecciona un dispositivo para poner sus direcciones, su puerta de enlace o sus rutas."),
          t("Con la herramienta de ping ([P]), haz clic en el origen y luego en el destino."),
          t("En la pestaña Simulación hay más acciones: traza (tracert), DHCP, consultas DNS y páginas web por TCP."),
          t("[Supr] elimina, [Ctrl]+[Z] deshace, [F] encuadra."),
          t("Este panel: su borde izquierdo cambia el ancho; arriba a la derecha se desacopla como ventana flotante o se abre a pantalla completa ([Esc] vuelve)."),
          t("Las barras del lienzo se mueven arrastrando sus puntos (⋮⋮); doble clic en ellos las devuelve a su sitio. [L] muestra el registro de paquetes."),
        ].map(line => <li key={line}><Rich text={line} /></li>)}
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
