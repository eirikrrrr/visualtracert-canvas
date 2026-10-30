// The topology as a document (YAML or JSON) and back. Parsing validates the
// whole structure and reports problems with a line when it can, so an
// invalid document never replaces the topology on the canvas.
import { isMap, isSeq, LineCounter, parseDocument, stringify } from "yaml";
import { spanish, type T } from "./i18n";
import { CATALOG } from "./catalog";
import { inCidr, ipToInt, isIp, isMac, parseCidr, randomMac } from "./net";
import type { Device, DeviceType, DhcpPool, DnsRecord, Interface, Link, Route, Services, Topology } from "./types";

export type DocFormat = "yaml" | "json";

export interface DocProblem {
  message: string;
  line?: number;
}

/** The document form: no empty optional fields, a stable key order. */
function toPlain(topology: Topology) {
  return {
    version: topology.version,
    name: topology.name,
    ...(topology.description ? { description: topology.description } : {}),
    devices: topology.devices.map(device => ({
      id: device.id,
      type: device.type,
      name: device.name,
      ...(device.description ? { description: device.description } : {}),
      position: device.position,
      ...(device.gateway ? { gateway: device.gateway } : {}),
      ...(device.dns ? { dns: device.dns } : {}),
      interfaces: device.interfaces.map(iface => ({
        name: iface.name,
        mac: iface.mac,
        ...(iface.dhcp ? { dhcp: true } : {}),
        ...(iface.ip ? { ip: `${iface.ip}/${iface.prefix ?? 24}` } : {}),
        ...(iface.vlan && iface.vlan !== 1 ? { vlan: iface.vlan } : {}),
        ...(iface.relay ? { relay: iface.relay } : {}),
      })),
      ...(device.routes && device.routes.length ? { routes: device.routes } : {}),
      ...(hasServices(device.services) ? { services: device.services } : {}),
    })),
    links: topology.links.map(link => ({
      id: link.id,
      a: `${link.a.device}:${link.a.interface}`,
      b: `${link.b.device}:${link.b.interface}`,
    })),
  };
}

const hasServices = (services: Services | undefined): services is Services =>
  Boolean(services && (services.dhcp?.length || services.dns?.length || services.http));

export function serialize(topology: Topology, format: DocFormat): string {
  const plain = toPlain(topology);
  if(format === "json") return JSON.stringify(plain, null, 2) + "\n";
  return stringify(plain, { indent: 2, lineWidth: 0, flowCollectionPadding: false });
}

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

  const root = (data ?? {}) as Record<string, unknown>;
  if(typeof root !== "object" || Array.isArray(root)) return { topology: null, problems: [{ message: t("El documento debe ser un objeto con devices y links.") }] };
  const rawDevices = Array.isArray(root.devices) ? root.devices : [];
  const rawLinks = Array.isArray(root.links) ? root.links : [];
  if(root.devices !== undefined && !Array.isArray(root.devices)) problem(t("devices debe ser una lista."), ["devices"]);
  if(root.links !== undefined && !Array.isArray(root.links)) problem(t("links debe ser una lista."), ["links"]);

  const devices: Device[] = [];
  const ids = new Set<string>();
  rawDevices.forEach((raw, index) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const at = (...rest: (string | number)[]) => ["devices", index, ...rest];
    const id = String(item.id ?? "").trim();
    if(!id){ problem(t("El dispositivo {n} no tiene id.", { n: index + 1 }), at()); return; }
    if(ids.has(id)) problem(t("El id \"{id}\" está repetido.", { id }), at("id"));
    ids.add(id);
    const type = String(item.type ?? "") as DeviceType;
    if(!CATALOG[type]) problem(t("\"{id}\": el tipo \"{type}\" no existe. Tipos: {types}.", { id, type: String(item.type), types: Object.keys(CATALOG).join(", ") }), at("type"));
    const position = (item.position ?? {}) as Record<string, unknown>;
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
      if(iface.ip !== undefined && iface.ip !== null && iface.ip !== ""){
        const [ip, length] = String(iface.ip).split("/");
        const prefix = length === undefined ? 24 : Number(length);
        if(!isIp(ip) || !Number.isInteger(prefix) || prefix < 1 || prefix > 32) problem(t("\"{id}\" {name}: \"{ip}\" no es una dirección válida (ej. 192.168.1.10/24).", { id, name, ip: String(iface.ip) }), at("interfaces", j, "ip"));
        else{ out.ip = ip; out.prefix = prefix; }
      }
      if(iface.vlan !== undefined){
        const vlan = Number(iface.vlan);
        if(!Number.isInteger(vlan) || vlan < 1 || vlan > 4094) problem(t("\"{id}\" {name}: la VLAN debe estar entre 1 y 4094.", { id, name }), at("interfaces", j, "vlan"));
        else out.vlan = vlan;
      }
      if(iface.dhcp === true) out.dhcp = true;
      else if(iface.dhcp !== undefined && iface.dhcp !== false) problem(t("\"{id}\" {name}: dhcp es true o false.", { id, name }), at("interfaces", j, "dhcp"));
      if(iface.relay !== undefined && iface.relay !== ""){
        if(!isIp(iface.relay)) problem(t("\"{id}\" {name}: el relay DHCP \"{relay}\" no es una dirección IPv4.", { id, name, relay: String(iface.relay) }), at("interfaces", j, "relay"));
        else out.relay = String(iface.relay);
      }
      interfaces.push(out);
    });
    const routes: Route[] = [];
    (Array.isArray(item.routes) ? item.routes : []).forEach((rawRoute, j) => {
      const route = (rawRoute ?? {}) as Record<string, unknown>;
      const prefix = String(route.prefix ?? "");
      const via = String(route.via ?? "");
      if(!parseCidr(prefix)) problem(t("\"{id}\": la ruta {n} tiene un destino inválido \"{prefix}\" (ej. 10.0.2.0/24).", { id, n: j + 1, prefix }), at("routes", j, "prefix"));
      else if(!isIp(via)) problem(t("\"{id}\": la ruta {n} tiene un siguiente salto inválido \"{via}\".", { id, n: j + 1, via }), at("routes", j, "via"));
      else routes.push({ prefix, via });
    });
    const gateway = item.gateway === undefined || item.gateway === "" ? undefined : String(item.gateway);
    if(gateway && !isIp(gateway)) problem(t("\"{id}\": la puerta de enlace \"{gateway}\" no es válida.", { id, gateway }), at("gateway"));
    const dns = item.dns === undefined || item.dns === "" ? undefined : String(item.dns);
    if(dns && !isIp(dns)) problem(t("\"{id}\": el servidor DNS \"{dns}\" no es válido.", { id, dns }), at("dns"));
    const services = parseServices(item.services, id, (message, ...rest) => problem(message, at("services", ...rest)), t);
    devices.push({
      id,
      type: CATALOG[type] ? type : "pc",
      name: String(item.name ?? id),
      position: { x: Number(position.x) || 0, y: Number(position.y) || 0 },
      interfaces,
      ...(gateway && isIp(gateway) ? { gateway } : {}),
      ...(dns && isIp(dns) ? { dns } : {}),
      ...(routes.length ? { routes } : {}),
      ...(services ? { services } : {}),
      ...(item.description ? { description: String(item.description) } : {}),
    });
  });

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
      version: 1, name: String(root.name ?? t("Laboratorio sin título")),
      ...(root.description ? { description: String(root.description) } : {}),
      devices, links,
    },
    problems: [],
  };
}
