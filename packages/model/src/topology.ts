// Pure operations on a topology: every one returns a new topology, so the
// editor can keep an undo history of plain snapshots.
import { spanish, type T } from "./i18n";
import { CATALOG } from "./catalog";
import { isStarted } from "./zones";
import { randomMac } from "./net";
import type { Device, DeviceType, Endpoint, Link, Topology } from "./types";

export const emptyTopology = (name = spanish("Laboratorio sin título")): Topology => ({ version: 3, name, devices: [], links: [] });

function uniqueId(base: string, taken: Set<string>): string {
  const slug = base.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "device";
  if(!taken.has(slug)) return slug;
  let n = 2;
  while(taken.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

function nextName(topology: Topology, type: DeviceType, t: T): string {
  const prefix = t(CATALOG[type].namePrefix);
  const names = new Set(topology.devices.map(device => device.name));
  let n = 1;
  while(names.has(`${prefix} ${n}`)) n++;
  return `${prefix} ${n}`;
}

/** A new device of a type; in a topology, when one is given. */
export function addDevice(topology: Topology, type: DeviceType, position: { x: number; y: number }, t: T = spanish, zone?: string): { topology: Topology; device: Device } {
  const name = nextName(topology, type, t);
  const device: Device = {
    id: uniqueId(name, new Set(topology.devices.map(item => item.id))),
    type,
    name,
    ...(zone ? { zone } : {}),
    position: { x: Math.round(position.x), y: Math.round(position.y) },
    interfaces: CATALOG[type].ports.map(port => ({ name: port, mac: randomMac() })),
  };
  return { topology: { ...topology, devices: [...topology.devices, device] }, device };
}

export function updateDevice(topology: Topology, id: string, change: (device: Device) => Device): Topology {
  return { ...topology, devices: topology.devices.map(device => device.id === id ? change(device) : device) };
}

export function moveDevices(topology: Topology, positions: Map<string, { x: number; y: number }>): Topology {
  return {
    ...topology,
    devices: topology.devices.map(device => {
      const position = positions.get(device.id);
      return position ? { ...device, position: { x: Math.round(position.x), y: Math.round(position.y) } } : device;
    }),
  };
}

export function removeDevices(topology: Topology, ids: Set<string>): Topology {
  return {
    ...topology,
    devices: topology.devices.filter(device => !ids.has(device.id)),
    links: topology.links.filter(link => !ids.has(link.a.device) && !ids.has(link.b.device)),
  };
}

export function removeLinks(topology: Topology, ids: Set<string>): Topology {
  return { ...topology, links: topology.links.filter(link => !ids.has(link.id)) };
}

const sameEndpoint = (p: Endpoint, q: Endpoint) => p.device === q.device && p.interface === q.interface;

export function linkOf(topology: Topology, endpoint: Endpoint): Link | undefined {
  return topology.links.find(link => sameEndpoint(link.a, endpoint) || sameEndpoint(link.b, endpoint));
}

/** The first port of a device without a cable */
export function freeInterface(topology: Topology, deviceId: string): string | null {
  const device = topology.devices.find(item => item.id === deviceId);
  const free = device?.interfaces.find(iface => !linkOf(topology, { device: deviceId, interface: iface.name }));
  return free ? free.name : null;
}

export type LinkResult = { topology: Topology; link: Link } | { error: string };

/** Cables two devices on free ports (the given ones, or the first free ones). */
export function connect(topology: Topology, source: string, target: string, ports: { a?: string; b?: string } = {}, t: T = spanish): LinkResult {
  if(source === target) return { error: t("Un dispositivo no se puede conectar consigo mismo.") };
  const a = ports.a ?? freeInterface(topology, source);
  const b = ports.b ?? freeInterface(topology, target);
  const nameOf = (id: string) => topology.devices.find(device => device.id === id)?.name ?? id;
  if(!a) return { error: t("{device} no tiene puertos libres.", { device: nameOf(source) }) };
  if(!b) return { error: t("{device} no tiene puertos libres.", { device: nameOf(target) }) };
  if(linkOf(topology, { device: source, interface: a }) || linkOf(topology, { device: target, interface: b })) {
    return { error: t("Ese puerto ya tiene un cable.") };
  }
  const taken = new Set(topology.links.map(link => link.id));
  let n = topology.links.length + 1;
  while(taken.has(`l${n}`)) n++;
  const link: Link = { id: `l${n}`, a: { device: source, interface: a }, b: { device: target, interface: b } };
  return { topology: { ...topology, links: [...topology.links, link] }, link };
}

/** FNV-1a, 32 bits, as 8 hex digits: a short name for a text. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for(let i = 0; i < text.length; i++){
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * What the network is, without the drawing: two topologies with the same
 * fingerprint build the same network (positions, names and notes aside).
 * The emulator keeps the one it deployed, so a change can be noticed.
 */
export function networkFingerprint(topology: Topology): string {
  const devices = [...topology.devices].sort((p, q) => p.id.localeCompare(q.id)).map(device => [
    device.id, device.type, device.gateway ?? "", device.dns ?? "",
    device.interfaces.map(iface => [iface.name, iface.mac, iface.ip ?? "", iface.prefix ?? 0, iface.vlan ?? 1, iface.dhcp ? 1 : 0, iface.relay ?? ""]),
    (device.routes ?? []).map(route => [route.prefix, route.via]),
    device.services ?? null,
    isStarted(topology, device),
  ]);
  const links = topology.links.map(link => [link.a.device, link.a.interface, link.b.device, link.b.interface].join(" ")).sort();
  return fnv1a(JSON.stringify([devices, links]));
}
