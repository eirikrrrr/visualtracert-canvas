// The topology as a document (YAML or JSON) and back. Parsing validates the
// whole structure and reports problems with a line when it can, so an
// invalid document never replaces the topology on the canvas.
import { isMap, isSeq, LineCounter, parseDocument, stringify } from "yaml";
import { CATALOG } from "./catalog";
import { isIp, isMac, parseCidr, randomMac } from "./net";
import type { Device, DeviceType, Interface, Link, Route, Topology } from "./types";

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
    devices: topology.devices.map(device => ({
      id: device.id,
      type: device.type,
      name: device.name,
      ...(device.description ? { description: device.description } : {}),
      position: device.position,
      ...(device.gateway ? { gateway: device.gateway } : {}),
      interfaces: device.interfaces.map(iface => ({
        name: iface.name,
        mac: iface.mac,
        ...(iface.ip ? { ip: `${iface.ip}/${iface.prefix ?? 24}` } : {}),
        ...(iface.vlan && iface.vlan !== 1 ? { vlan: iface.vlan } : {}),
      })),
      ...(device.routes && device.routes.length ? { routes: device.routes } : {}),
    })),
    links: topology.links.map(link => ({
      id: link.id,
      a: `${link.a.device}:${link.a.interface}`,
      b: `${link.b.device}:${link.b.interface}`,
    })),
  };
}

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

export function parse(text: string, format: DocFormat): ParseResult {
  let data: unknown;
  if(format === "json"){
    try{
      data = JSON.parse(text);
    }catch(error){
      return { topology: null, problems: [{ message: `JSON inválido: ${(error as Error).message}` }] };
    }
  }else{
    const lineCounter = new LineCounter();
    const doc = parseDocument(text, { lineCounter });
    if(doc.errors.length){
      return {
        topology: null,
        problems: doc.errors.map(error => ({ message: `YAML inválido: ${error.message.split("\n")[0]}`, line: lineCounter.linePos(error.pos[0]).line })),
      };
    }
    data = doc.toJS();
  }

  const lineOf = lineLocator(text, format);
  const problems: DocProblem[] = [];
  const problem = (message: string, path: (string | number)[]) => problems.push({ message, line: lineOf(path) });

  const root = (data ?? {}) as Record<string, unknown>;
  if(typeof root !== "object" || Array.isArray(root)) return { topology: null, problems: [{ message: "El documento debe ser un objeto con devices y links." }] };
  const rawDevices = Array.isArray(root.devices) ? root.devices : [];
  const rawLinks = Array.isArray(root.links) ? root.links : [];
  if(root.devices !== undefined && !Array.isArray(root.devices)) problem("devices debe ser una lista.", ["devices"]);
  if(root.links !== undefined && !Array.isArray(root.links)) problem("links debe ser una lista.", ["links"]);

  const devices: Device[] = [];
  const ids = new Set<string>();
  rawDevices.forEach((raw, index) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const at = (...rest: (string | number)[]) => ["devices", index, ...rest];
    const id = String(item.id ?? "").trim();
    if(!id){ problem(`El dispositivo ${index + 1} no tiene id.`, at()); return; }
    if(ids.has(id)) problem(`El id "${id}" está repetido.`, at("id"));
    ids.add(id);
    const type = String(item.type ?? "") as DeviceType;
    if(!CATALOG[type]) problem(`"${id}": el tipo "${item.type}" no existe. Tipos: ${Object.keys(CATALOG).join(", ")}.`, at("type"));
    const position = (item.position ?? {}) as Record<string, unknown>;
    const interfaces: Interface[] = [];
    const ifaceNames = new Set<string>();
    (Array.isArray(item.interfaces) ? item.interfaces : []).forEach((rawIface, j) => {
      const iface = (rawIface ?? {}) as Record<string, unknown>;
      const name = String(iface.name ?? "").trim();
      if(!name){ problem(`"${id}": la interfaz ${j + 1} no tiene nombre.`, at("interfaces", j)); return; }
      if(ifaceNames.has(name)) problem(`"${id}": la interfaz "${name}" está repetida.`, at("interfaces", j, "name"));
      ifaceNames.add(name);
      const mac = iface.mac === undefined ? randomMac() : String(iface.mac).toLowerCase();
      if(!isMac(mac)) problem(`"${id}" ${name}: la MAC "${iface.mac}" no es válida.`, at("interfaces", j, "mac"));
      const out: Interface = { name, mac };
      if(iface.ip !== undefined && iface.ip !== null && iface.ip !== ""){
        const [ip, length] = String(iface.ip).split("/");
        const prefix = length === undefined ? 24 : Number(length);
        if(!isIp(ip) || !Number.isInteger(prefix) || prefix < 1 || prefix > 32) problem(`"${id}" ${name}: "${iface.ip}" no es una dirección válida (ej. 192.168.1.10/24).`, at("interfaces", j, "ip"));
        else{ out.ip = ip; out.prefix = prefix; }
      }
      if(iface.vlan !== undefined){
        const vlan = Number(iface.vlan);
        if(!Number.isInteger(vlan) || vlan < 1 || vlan > 4094) problem(`"${id}" ${name}: la VLAN debe estar entre 1 y 4094.`, at("interfaces", j, "vlan"));
        else out.vlan = vlan;
      }
      interfaces.push(out);
    });
    const routes: Route[] = [];
    (Array.isArray(item.routes) ? item.routes : []).forEach((rawRoute, j) => {
      const route = (rawRoute ?? {}) as Record<string, unknown>;
      const prefix = String(route.prefix ?? "");
      const via = String(route.via ?? "");
      if(!parseCidr(prefix)) problem(`"${id}": la ruta ${j + 1} tiene un destino inválido "${prefix}" (ej. 10.0.2.0/24).`, at("routes", j, "prefix"));
      else if(!isIp(via)) problem(`"${id}": la ruta ${j + 1} tiene un siguiente salto inválido "${via}".`, at("routes", j, "via"));
      else routes.push({ prefix, via });
    });
    const gateway = item.gateway === undefined || item.gateway === "" ? undefined : String(item.gateway);
    if(gateway && !isIp(gateway)) problem(`"${id}": la puerta de enlace "${gateway}" no es válida.`, at("gateway"));
    devices.push({
      id,
      type: CATALOG[type] ? type : "pc",
      name: String(item.name ?? id),
      position: { x: Number(position.x) || 0, y: Number(position.y) || 0 },
      interfaces,
      ...(gateway && isIp(gateway) ? { gateway } : {}),
      ...(routes.length ? { routes } : {}),
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
    if(linkIds.has(id)) problem(`El enlace "${id}" está repetido.`, at("id"));
    linkIds.add(id);
    const ends = (["a", "b"] as const).map(side => {
      const [device, iface] = String(item[side] ?? "").split(":");
      const owner = devices.find(d => d.id === device);
      if(!owner){ problem(`Enlace "${id}": "${item[side]}" no corresponde a ningún dispositivo (formato dispositivo:interfaz).`, at(side)); return null; }
      if(!owner.interfaces.some(i => i.name === iface)){ problem(`Enlace "${id}": ${device} no tiene la interfaz "${iface}".`, at(side)); return null; }
      const key = `${device}:${iface}`;
      if(cabled.has(key)){ problem(`Enlace "${id}": ${key} ya tiene otro cable.`, at(side)); return null; }
      cabled.add(key);
      return { device, interface: iface };
    });
    if(ends[0] && ends[1]) links.push({ id, a: ends[0], b: ends[1] });
  });

  if(problems.length) return { topology: null, problems };
  return {
    topology: { version: 1, name: String(root.name ?? "Laboratorio sin título"), devices, links },
    problems: [],
  };
}
