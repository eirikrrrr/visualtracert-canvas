// The topology as a document (YAML or JSON) and back. Parsing validates the
// whole structure and reports problems with a line when it can, so an
// invalid document never replaces the topology on the canvas.
//
// Version 4 keeps three things apart: what each device is (its type and its
// ports, as hardware), how it is configured (its `config`) and how it is drawn:
//   topology: [{ id, name, status, devices: [{ id, type, name,
//     interfaces: [{ name, mac }],
//     config: { interfaces: { port: { ip, dhcp, vlan, relay } }, gateway, dns, routes, services } }] }]
//   links: [...]
//   canvas: { decorations, topologies: { id: { color, text } }, positions: { id: { x, y } } }
// Version 3 (the configuration inside the ports and at the device), version 2
// (colours, notes and positions inside the topologies and devices,
// `options.decorations`) and version 1 (`devices` at the root, a single
// topology) are still read.
import { Document, isMap, isSeq, LineCounter, parseDocument } from "yaml";
import { spanish, type T } from "./i18n";
import { CATALOG } from "./catalog";
import { inCidr, ipToInt, isIp, isMac, parseCidr, randomMac } from "./net";
import type { Device, DeviceType, DhcpPool, DnsRecord, Interface, Link, Route, Services, Topology, Zone } from "./types";
import { PROFILE_ID } from "./profiles";
import { decorated, devicesOf, readStatus, zonesOf } from "./zones";

export type DocFormat = "yaml" | "json";

export interface DocProblem {
  message: string;
  line?: number;
}

/** A device's configuration as the document writes it; none when it has none. */
function configPlain(device: Device) {
  const ports = device.interfaces.map(iface => [iface.name, {
    ...(iface.dhcp ? { dhcp: true } : {}),
    ...(iface.ip ? { ip: `${iface.ip}/${iface.prefix ?? 24}` } : {}),
    ...(iface.vlan && iface.vlan !== 1 ? { vlan: iface.vlan } : {}),
    ...(iface.relay ? { relay: iface.relay } : {}),
  }] as const).filter(([, port]) => Object.keys(port).length);
  const config = {
    ...(ports.length ? { interfaces: Object.fromEntries(ports) } : {}),
    ...(device.gateway ? { gateway: device.gateway } : {}),
    ...(device.dns ? { dns: device.dns } : {}),
    ...(device.routes && device.routes.length ? { routes: device.routes } : {}),
    ...(hasServices(device.services) ? { services: device.services } : {}),
  };
  return Object.keys(config).length ? { config } : {};
}

/** The document form: no empty optional fields, a stable key order. */
function devicePlain(device: Device) {
  return {
    id: device.id,
    type: device.type,
    name: device.name,
    ...(device.status ? { status: device.status } : {}),
    ...(device.profile ? { profile: device.profile } : {}),
    ...(device.description ? { description: device.description } : {}),
    interfaces: device.interfaces.map(iface => ({ name: iface.name, mac: iface.mac })),
    ...configPlain(device),
  };
}

function toPlain(topology: Topology) {
  const zones = zonesOf(topology);
  const styles = zones.map(zone => [zone.id, {
    ...(zone.color ? { color: zone.color } : {}),
    ...(zone.text ? { text: zone.text } : {}),
    ...(!devicesOf(topology, zone.id).length && zone.position ? { position: zone.position } : {}),
  }] as const).filter(([, style]) => Object.keys(style).length);
  return {
    version: 4,
    name: topology.name,
    ...(topology.description ? { description: topology.description } : {}),
    topology: zones.map(zone => ({
      id: zone.id,
      name: zone.name,
      status: zone.status,
      devices: devicesOf(topology, zone.id).map(devicePlain),
    })),
    links: topology.links.map(link => ({
      id: link.id,
      a: `${link.a.device}:${link.a.interface}`,
      b: `${link.b.device}:${link.b.interface}`,
    })),
    canvas: {
      decorations: decorated(topology),
      ...(styles.length ? { topologies: Object.fromEntries(styles) } : {}),
      positions: Object.fromEntries(topology.devices.map(device => [device.id, device.position])),
    },
  };
}

const hasServices = (services: Services | undefined): services is Services =>
  Boolean(services && (services.dhcp?.length || services.dns?.length || services.http));

export function serialize(topology: Topology, format: DocFormat): string {
  const plain = toPlain(topology);
  if(format === "json") return JSON.stringify(plain, null, 2) + "\n";
  // one line for each position ({ x: 60, y: 300 }), port ({ name: eth0, mac: … }),
  // port's configuration (eth0: { ip: 10.0.0.1/24 }), route and DNS record
  const doc = new Document(plain);
  const flow = (node: unknown) => { if(isMap(node)) node.flow = true; };
  const positions = doc.getIn(["canvas", "positions"]);
  if(isMap(positions)) for(const pair of positions.items) flow(pair.value);
  const zones = doc.get("topology");
  for(const zone of isSeq(zones) ? zones.items : []){
    const devices = isMap(zone) ? zone.get("devices") : undefined;
    for(const device of isSeq(devices) ? devices.items : []){
      if(!isMap(device)) continue;
      const ports = device.get("interfaces");
      if(isSeq(ports)) ports.items.forEach(flow);
      const configured = device.getIn(["config", "interfaces"]);
      if(isMap(configured)) for(const pair of configured.items) flow(pair.value);
      for(const path of [["config", "routes"], ["config", "services", "dns"]]){
        const list = device.getIn(path);
        if(isSeq(list)) list.items.forEach(flow);
      }
    }
  }
  return doc.toString({ indent: 2, lineWidth: 0 });
}

/** #rrggbb (or #rgb), lower case; undefined when it is not a colour */
function colorOf(value: unknown): string | undefined {
  const raw = String(value).trim();
  const short = raw.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase() : /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : undefined;
}

const pointOf = (value: unknown): { x: number; y: number } | undefined => {
  if(!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { x, y } = value as Record<string, unknown>;
  return Number.isFinite(Number(x)) && Number.isFinite(Number(y)) ? { x: Number(x), y: Number(y) } : undefined;
};

export type ParseResult = { topology: Topology; problems: [] } | { topology: null; problems: DocProblem[] };

/** Line of a path inside a YAML document, for the error messages. */
function lineLocator(text: string, format: DocFormat) {
  if(format === "json") return () => undefined;
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  return (path: (string | number)[]) => {
    let node: unknown = doc.contents;
    for(const key of path){
      if(isMap(node)) node = node.get(key, true);
      else if(isSeq(node)) node = node.get(key as number, true);
      else return undefined;
    }
    const range = (node as { range?: [number, number, number] } | undefined)?.range;
    return range ? lineCounter.linePos(range[0]).line : undefined;
  };
}

function parseServices(raw: unknown, id: string, problem: (message: string, ...path: (string | number)[]) => void, t: T): Services | undefined {
  if(raw === undefined || raw === null) return undefined;
  if(typeof raw !== "object" || Array.isArray(raw)){ problem(t("\"{id}\": services debe ser un objeto (dhcp, dns, http).", { id })); return undefined; }
  const item = raw as Record<string, unknown>;
  const services: Services = {};
  const dhcp: DhcpPool[] = [];
  (Array.isArray(item.dhcp) ? item.dhcp : []).forEach((rawPool, j) => {
    const pool = (rawPool ?? {}) as Record<string, unknown>;
    const network = String(pool.network ?? "");
    const cidr = parseCidr(network);
    if(!cidr){ problem(t("\"{id}\": el rango DHCP {n} tiene una red inválida \"{network}\" (ej. 192.168.1.0/24).", { id, n: j + 1, network }), "dhcp", j, "network"); return; }
    const ends = (["start", "end"] as const).map(key => String(pool[key] ?? ""));
    if(!ends.every(ip => isIp(ip) && inCidr(ip, network))){ problem(t("\"{id}\": start y end del rango DHCP {n} deben ser direcciones de {network}.", { id, n: j + 1, network }), "dhcp", j); return; }
    if(ipToInt(ends[0]) > ipToInt(ends[1])){ problem(t("\"{id}\": en el rango DHCP {n}, start va antes que end.", { id, n: j + 1 }), "dhcp", j); return; }
    const optional = (key: "gateway" | "dns") => {
      const value = pool[key];
      if(value === undefined || value === "") return {};
      if(!isIp(value)){ problem(t("\"{id}\": {key} del rango DHCP {n} no es una dirección IPv4.", { id, key, n: j + 1 }), "dhcp", j, key); return {}; }
      return { [key]: value };
    };
    dhcp.push({ network: `${cidr.network}/${cidr.prefix}`, start: ends[0], end: ends[1], ...optional("gateway"), ...optional("dns") });
  });
  if(item.dhcp !== undefined && !Array.isArray(item.dhcp)) problem(t("\"{id}\": services.dhcp debe ser una lista de rangos.", { id }), "dhcp");
  const dns: DnsRecord[] = [];
  (Array.isArray(item.dns) ? item.dns : []).forEach((rawRecord, j) => {
    const record = (rawRecord ?? {}) as Record<string, unknown>;
    const name = String(record.name ?? "").trim().toLowerCase().replace(/\.$/, "");
    if(!name){ problem(t("\"{id}\": el registro DNS {n} no tiene nombre.", { id, n: j + 1 }), "dns", j); return; }
    if(!isIp(record.ip)){ problem(t("\"{id}\": el registro DNS \"{name}\" necesita una ip válida.", { id, name }), "dns", j, "ip"); return; }
    dns.push({ name, ip: record.ip });
  });
  if(item.dns !== undefined && !Array.isArray(item.dns)) problem(t("\"{id}\": services.dns debe ser una lista de registros (name, ip).", { id }), "dns");
  if(dhcp.length) services.dhcp = dhcp;
  if(dns.length) services.dns = dns;
  if(item.http === true) services.http = true;
  return hasServices(services) ? services : undefined;
}

export function parse(text: string, format: DocFormat, t: T = spanish): ParseResult {
  let data: unknown;
  if(format === "json"){
    try{
      data = JSON.parse(text);
    }catch(error){
      return { topology: null, problems: [{ message: t("JSON inválido: {error}", { error: (error as Error).message }) }] };
    }
  }else{
    const lineCounter = new LineCounter();
    const doc = parseDocument(text, { lineCounter });
    if(doc.errors.length){
      return {
        topology: null,
        problems: doc.errors.map(error => ({ message: t("YAML inválido: {error}", { error: error.message.split("\n")[0] }), line: lineCounter.linePos(error.pos[0]).line })),
      };
    }
    data = doc.toJS();
  }

  const lineOf = lineLocator(text, format);
  const problems: DocProblem[] = [];
  const problem = (message: string, path: (string | number)[]) => problems.push({ message, line: lineOf(path) });

  const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const root = (data ?? {}) as Record<string, unknown>;
  if(typeof root !== "object" || Array.isArray(root)) return { topology: null, problems: [{ message: t("El documento debe ser un objeto con topology y links.") }] };
  const rawLinks = Array.isArray(root.links) ? root.links : [];
  if(root.links !== undefined && !Array.isArray(root.links)) problem(t("links debe ser una lista."), ["links"]);

  const devices: Device[] = [];
  const ids = new Set<string>();
  type Path = (...rest: (string | number)[]) => (string | number)[];
  const parseDevice = (raw: unknown, at: Path, index: number, zone: string | undefined) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const id = String(item.id ?? "").trim();
    if(!id){ problem(t("El dispositivo {n} no tiene id.", { n: index + 1 }), at()); return; }
    if(ids.has(id)) problem(t("El id \"{id}\" está repetido.", { id }), at("id"));
    ids.add(id);
    const type = String(item.type ?? "") as DeviceType;
    if(!CATALOG[type]) problem(t("\"{id}\": el tipo \"{type}\" no existe. Tipos: {types}.", { id, type: String(item.type), types: Object.keys(CATALOG).join(", ") }), at("type"));
    const position = (item.position ?? {}) as Record<string, unknown>;
    // a port's configuration: its address (or DHCP), access VLAN and DHCP relay
    const configurePort = (out: Interface, raw: Record<string, unknown>, path: Path) => {
      const name = out.name;
      if(raw.ip !== undefined && raw.ip !== null && raw.ip !== ""){
        const [ip, length] = String(raw.ip).split("/");
        const prefix = length === undefined ? 24 : Number(length);
        if(!isIp(ip) || !Number.isInteger(prefix) || prefix < 1 || prefix > 32) problem(t("\"{id}\" {name}: \"{ip}\" no es una dirección válida (ej. 192.168.1.10/24).", { id, name, ip: String(raw.ip) }), path("ip"));
        else{ out.ip = ip; out.prefix = prefix; }
      }
      if(raw.vlan !== undefined){
        const vlan = Number(raw.vlan);
        if(!Number.isInteger(vlan) || vlan < 1 || vlan > 4094) problem(t("\"{id}\" {name}: la VLAN debe estar entre 1 y 4094.", { id, name }), path("vlan"));
        else out.vlan = vlan;
      }
      if(raw.dhcp === true) out.dhcp = true;
      else if(raw.dhcp !== undefined && raw.dhcp !== false) problem(t("\"{id}\" {name}: dhcp es true o false.", { id, name }), path("dhcp"));
      if(raw.relay !== undefined && raw.relay !== ""){
        if(!isIp(raw.relay)) problem(t("\"{id}\" {name}: el relay DHCP \"{relay}\" no es una dirección IPv4.", { id, name, relay: String(raw.relay) }), path("relay"));
        else out.relay = String(raw.relay);
      }
    };
    const interfaces: Interface[] = [];
    const ifaceNames = new Set<string>();
    (Array.isArray(item.interfaces) ? item.interfaces : []).forEach((rawIface, j) => {
      const iface = (rawIface ?? {}) as Record<string, unknown>;
      const name = String(iface.name ?? "").trim();
      if(!name){ problem(t("\"{id}\": la interfaz {n} no tiene nombre.", { id, n: j + 1 }), at("interfaces", j)); return; }
      if(ifaceNames.has(name)) problem(t("\"{id}\": la interfaz \"{name}\" está repetida.", { id, name }), at("interfaces", j, "name"));
      ifaceNames.add(name);
      const mac = iface.mac === undefined ? randomMac() : String(iface.mac).toLowerCase();
      if(!isMac(mac)) problem(t("\"{id}\" {name}: la MAC \"{mac}\" no es válida.", { id, name, mac: String(iface.mac) }), at("interfaces", j, "mac"));
      const out: Interface = { name, mac };
      // version 3: its configuration here
      configurePort(out, iface, (...rest) => at("interfaces", j, ...rest));
      interfaces.push(out);
    });
    // its configuration: config (version 4), or at the device (version 3)
    if(item.config !== undefined && !isObject(item.config)) problem(t("\"{id}\": config debe ser un objeto (interfaces, gateway, dns, routes, services).", { id }), at("config"));
    const config = isObject(item.config) ? item.config : {};
    const ports = config.interfaces;
    if(ports !== undefined && !isObject(ports)) problem(t("\"{id}\": config.interfaces debe ser un objeto: nombre del puerto → {ip, dhcp, vlan, relay}.", { id }), at("config", "interfaces"));
    for(const [name, value] of Object.entries(isObject(ports) ? ports : {})){
      const path: Path = (...rest) => at("config", "interfaces", name, ...rest);
      const port = interfaces.find(iface => iface.name === name);
      if(!port) problem(t("\"{id}\": config.interfaces: \"{name}\" no es ningún puerto suyo (interfaces).", { id, name }), path());
      else if(!isObject(value)) problem(t("\"{id}\" {name}: su configuración debe ser un objeto (ip, dhcp, vlan, relay).", { id, name }), path());
      else configurePort(port, value, path);
    }
    const field = (key: string): [unknown, Path] => config[key] !== undefined
      ? [config[key], (...rest) => at("config", key, ...rest)]
      : [item[key], (...rest) => at(key, ...rest)];
    const [rawRoutes, routesAt] = field("routes");
    const routes: Route[] = [];
    (Array.isArray(rawRoutes) ? rawRoutes : []).forEach((rawRoute, j) => {
      const route = (rawRoute ?? {}) as Record<string, unknown>;
      const prefix = String(route.prefix ?? "");
      const via = String(route.via ?? "");
      if(!parseCidr(prefix)) problem(t("\"{id}\": la ruta {n} tiene un destino inválido \"{prefix}\" (ej. 10.0.2.0/24).", { id, n: j + 1, prefix }), routesAt(j, "prefix"));
      else if(!isIp(via)) problem(t("\"{id}\": la ruta {n} tiene un siguiente salto inválido \"{via}\".", { id, n: j + 1, via }), routesAt(j, "via"));
      else routes.push({ prefix, via });
    });
    const [rawGateway, gatewayAt] = field("gateway");
    const gateway = rawGateway === undefined || rawGateway === "" ? undefined : String(rawGateway);
    if(gateway && !isIp(gateway)) problem(t("\"{id}\": la puerta de enlace \"{gateway}\" no es válida.", { id, gateway }), gatewayAt());
    const [rawDns, dnsAt] = field("dns");
    const dns = rawDns === undefined || rawDns === "" ? undefined : String(rawDns);
    if(dns && !isIp(dns)) problem(t("\"{id}\": el servidor DNS \"{dns}\" no es válido.", { id, dns }), dnsAt());
    const [rawServices, servicesAt] = field("services");
    const services = parseServices(rawServices, id, (message, ...rest) => problem(message, servicesAt(...rest)), t);
    const status = item.status === undefined || item.status === "" ? undefined : readStatus(item.status, false);
    if(item.status !== undefined && item.status !== "" && !status) problem(t("\"{id}\": status es up o down (también on/off o true/false).", { id }), at("status"));
    const profile = item.profile === undefined || item.profile === "" ? undefined : String(item.profile);
    if(profile && !PROFILE_ID.test(profile)) problem(t("\"{id}\": el perfil \"{profile}\" no es un id de perfil válido.", { id, profile }), at("profile"));
    devices.push({
      id,
      type: CATALOG[type] ? type : "pc",
      name: String(item.name ?? id),
      ...(zone ? { zone } : {}),
      ...(status ? { status } : {}),
      ...(profile && PROFILE_ID.test(profile) ? { profile } : {}),
      position: { x: Number(position.x) || 0, y: Number(position.y) || 0 },
      interfaces,
      ...(gateway && isIp(gateway) ? { gateway } : {}),
      ...(dns && isIp(dns) ? { dns } : {}),
      ...(routes.length ? { routes } : {}),
      ...(services ? { services } : {}),
      ...(item.description ? { description: String(item.description) } : {}),
    });
  };

  // the topologies, each with its devices
  const zones: Zone[] = [];
  const zoneIds = new Set<string>();
  if(root.topology !== undefined && !Array.isArray(root.topology)) problem(t("topology debe ser una lista de topologías."), ["topology"]);
  (Array.isArray(root.topology) ? root.topology : []).forEach((raw, i) => {
    const at: Path = (...rest) => ["topology", i, ...rest];
    if(!raw || typeof raw !== "object" || Array.isArray(raw)){ problem(t("La topología {n} debe ser un objeto (id, name, status, devices).", { n: i + 1 }), at()); return; }
    const item = raw as Record<string, unknown>;
    const id = String(item.id ?? `topology-${i + 1}`).trim();
    if(zoneIds.has(id)) problem(t("La topología \"{id}\" está repetida.", { id }), at("id"));
    zoneIds.add(id);
    const status = item.status === undefined ? "up" : readStatus(item.status, true);
    if(!status) problem(t("Topología \"{id}\": status es up, down o hybrid (también on/off o true/false).", { id }), at("status"));
    // version 2: its colour and note here
    let color: string | undefined;
    if(item.color !== undefined && item.color !== ""){
      color = colorOf(item.color);
      if(!color) problem(t("Topología \"{id}\": el color \"{color}\" no es válido (ej. #3d7eff).", { id, color: String(item.color) }), at("color"));
    }
    const position = item.position as Record<string, unknown> | undefined;
    if(item.devices !== undefined && !Array.isArray(item.devices)) problem(t("Topología \"{id}\": devices debe ser una lista.", { id }), at("devices"));
    (Array.isArray(item.devices) ? item.devices : []).forEach((device, j) => parseDevice(device, (...rest) => at("devices", j, ...rest), j, id));
    zones.push({
      id, name: String(item.name ?? id).trim() || id,
      status: status ?? "up",
      ...(color ? { color } : {}),
      ...(item.text ? { text: String(item.text) } : {}),
      ...(position && typeof position === "object" ? { position: { x: Number(position.x) || 0, y: Number(position.y) || 0 } } : {}),
    });
  });
  // the first version: the devices at the root, in a single topology
  if(root.devices !== undefined && !Array.isArray(root.devices)) problem(t("devices debe ser una lista."), ["devices"]);
  (Array.isArray(root.devices) ? root.devices : []).forEach((raw, index) => parseDevice(raw, (...rest) => ["devices", index, ...rest], index, undefined));

  // how it is drawn: canvas (versions 3 and 4), or options (version 2)
  const options = root.options as Record<string, unknown> | undefined;
  if(options !== undefined && !isObject(options)) problem(t("options debe ser un objeto (decorations)."), ["options"]);
  const canvas = root.canvas;
  if(canvas !== undefined && !isObject(canvas)) problem(t("canvas debe ser un objeto (decorations, topologies, positions)."), ["canvas"]);
  const view = isObject(canvas) ? canvas : {};
  const decorations = view.decorations ?? (isObject(options) ? options.decorations : undefined);
  if(decorations !== undefined && typeof decorations !== "boolean") problem(t("canvas.decorations es true o false."), view.decorations !== undefined ? ["canvas", "decorations"] : ["options", "decorations"]);

  const positions = view.positions;
  if(positions !== undefined && !isObject(positions)) problem(t("canvas.positions debe ser un objeto: id del dispositivo → {x, y}."), ["canvas", "positions"]);
  for(const [id, value] of Object.entries(isObject(positions) ? positions : {})){
    const device = devices.find(item => item.id === id);
    const point = pointOf(value);
    if(!device) problem(t("canvas.positions: \"{id}\" no es ningún dispositivo.", { id }), ["canvas", "positions", id]);
    else if(!point) problem(t("canvas.positions: la posición de \"{id}\" es {x, y}.", { id }), ["canvas", "positions", id]);
    else device.position = point;
  }

  const styles = view.topologies;
  if(styles !== undefined && !isObject(styles)) problem(t("canvas.topologies debe ser un objeto: id de la topología → {color, text}."), ["canvas", "topologies"]);
  for(const [id, value] of Object.entries(isObject(styles) ? styles : {})){
    const index = zones.findIndex(zone => zone.id === id);
    const at = ["canvas", "topologies", id];
    if(index < 0){ problem(t("canvas.topologies: \"{id}\" no es ninguna topología.", { id }), at); continue; }
    if(!isObject(value)){ problem(t("canvas.topologies: \"{id}\" debe ser un objeto (color, text).", { id }), at); continue; }
    const zone = { ...zones[index] };
    if(value.color !== undefined && value.color !== ""){
      const color = colorOf(value.color);
      if(color) zone.color = color;
      else problem(t("Topología \"{id}\": el color \"{color}\" no es válido (ej. #3d7eff).", { id, color: String(value.color) }), [...at, "color"]);
    }
    if(value.text !== undefined) zone.text = String(value.text) || undefined;
    if(!zone.text) delete zone.text;
    const point = pointOf(value.position);
    if(point) zone.position = point;
    zones[index] = zone;
  }

  const links: Link[] = [];
  const linkIds = new Set<string>();
  const cabled = new Set<string>();
  rawLinks.forEach((raw, index) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const at = (...rest: (string | number)[]) => ["links", index, ...rest];
    const id = String(item.id ?? `l${index + 1}`);
    if(linkIds.has(id)) problem(t("El enlace \"{id}\" está repetido.", { id }), at("id"));
    linkIds.add(id);
    const ends = (["a", "b"] as const).map(side => {
      const [device, iface] = String(item[side] ?? "").split(":");
      const owner = devices.find(d => d.id === device);
      if(!owner){ problem(t("Enlace \"{id}\": \"{end}\" no corresponde a ningún dispositivo (formato dispositivo:interfaz).", { id, end: String(item[side]) }), at(side)); return null; }
      if(!owner.interfaces.some(i => i.name === iface)){ problem(t("Enlace \"{id}\": {device} no tiene la interfaz \"{iface}\".", { id, device, iface }), at(side)); return null; }
      const key = `${device}:${iface}`;
      if(cabled.has(key)){ problem(t("Enlace \"{id}\": {port} ya tiene otro cable.", { id, port: key }), at(side)); return null; }
      cabled.add(key);
      return { device, interface: iface };
    });
    if(ends[0] && ends[1]) links.push({ id, a: ends[0], b: ends[1] });
  });

  if(problems.length) return { topology: null, problems };
  return {
    topology: {
      version: 4, name: String(root.name ?? t("Laboratorio sin título")),
      ...(root.description ? { description: String(root.description) } : {}),
      ...(decorations === false ? { options: { decorations: false } } : {}),
      ...(zones.length ? { zones } : {}),
      devices, links,
    },
    problems: [],
  };
}
