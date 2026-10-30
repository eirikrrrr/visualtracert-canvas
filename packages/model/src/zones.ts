// The topologies of a lab ("topology" in the document; zones here, so as not
// to be confused with the whole lab): groups of devices, each drawn as a
// coloured rectangle, each brought up in the emulation as its status says.
// A lab without any has a single one, around every device, named as the lab:
// it becomes a real one the first time it is changed.
import type { Device, DeviceStatus, Topology, TopologyStatus, Zone } from "./types";

/** the colours offered for a topology; any other #rrggbb is valid too */
export const ZONE_COLORS = ["#3d7eff", "#22a06b", "#e2832b", "#d64545", "#9b6dff", "#0fa5b5", "#d4a017", "#7a8699"];

export const TOPOLOGY_STATUSES: TopologyStatus[] = ["up", "down", "hybrid"];
export const DEVICE_STATUSES: DeviceStatus[] = ["up", "down"];

// what the document may write for each: up/down, on/off, true/false (a YAML
// boolean too), and start/stop as earlier versions wrote them
const UP = ["up", "on", "true", "yes", "start"];
const DOWN = ["down", "off", "false", "no", "stop"];

/** A status as written in the document, as one of ours; undefined if it is none. */
export function readStatus(value: unknown, hybrid: true): TopologyStatus | undefined;
export function readStatus(value: unknown, hybrid: false): DeviceStatus | undefined;
export function readStatus(value: unknown, hybrid: boolean): TopologyStatus | undefined {
  const text = String(value).trim().toLowerCase();
  if(UP.includes(text)) return "up";
  if(DOWN.includes(text)) return "down";
  return hybrid && text === "hybrid" ? "hybrid" : undefined;
}

const IMPLICIT = "topology-1";

/** The topologies as they are drawn and written: the implicit one, if that. */
export function zonesOf(topology: Topology): Zone[] {
  if(topology.zones?.length) return topology.zones;
  return topology.devices.length ? [{ id: IMPLICIT, name: topology.name, status: "up" }] : [];
}

/** The topology a device belongs to: its own, or the first one. */
export function zoneOf(topology: Topology, device: Device): Zone | undefined {
  const zones = zonesOf(topology);
  return zones.find(zone => zone.id === device.zone) ?? zones[0];
}

export const devicesOf = (topology: Topology, zone: string): Device[] =>
  topology.devices.filter(device => zoneOf(topology, device)?.id === zone);

/** Every topology explicit, and every device in one: before changing them. */
export function materialize(topology: Topology): Topology {
  const zones = zonesOf(topology);
  return { ...topology, zones, devices: topology.devices.map(device => ({ ...device, zone: zoneOf(topology, device)?.id })) };
}

/** Whether the emulation brings the device up. */
export function isStarted(topology: Topology, device: Device): boolean {
  const status = zoneOf(topology, device)?.status ?? "up";
  return status === "up" || (status === "hybrid" && device.status === "up");
}

export const decorated = (topology: Topology): boolean => topology.options?.decorations !== false;

export function setOptions(topology: Topology, options: Topology["options"]): Topology {
  return { ...topology, options: { ...topology.options, ...options } };
}

function freeZoneId(topology: Topology): string {
  const taken = new Set(zonesOf(topology).map(zone => zone.id));
  let n = taken.size + 1;
  while(taken.has(`topology-${n}`)) n++;
  return `topology-${n}`;
}

/** A new, empty topology, with the next free colour. */
export function addZone(topology: Topology, name: string, position: { x: number; y: number }): { topology: Topology; zone: Zone } {
  const base = materialize(topology);
  const used = new Set(base.zones!.map(zone => zone.color));
  const zone: Zone = {
    id: freeZoneId(base), name, status: "up",
    color: ZONE_COLORS.find(color => !used.has(color)) ?? ZONE_COLORS[base.zones!.length % ZONE_COLORS.length],
    position: { x: Math.round(position.x), y: Math.round(position.y) },
  };
  return { topology: { ...base, zones: [...base.zones!, zone] }, zone };
}

export function updateZone(topology: Topology, id: string, change: (zone: Zone) => Zone): Topology {
  const base = materialize(topology);
  return { ...base, zones: base.zones!.map(zone => zone.id === id ? change(zone) : zone) };
}

/** Removes a topology with its devices and their cables. */
export function removeZone(topology: Topology, id: string): Topology {
  const base = materialize(topology);
  const gone = new Set(base.devices.filter(device => device.zone === id).map(device => device.id));
  return {
    ...base,
    zones: base.zones!.filter(zone => zone.id !== id),
    devices: base.devices.filter(device => !gone.has(device.id)),
    links: base.links.filter(link => !gone.has(link.a.device) && !gone.has(link.b.device)),
  };
}

/** Moves a device to another topology; one left empty stays where it was. */
export function moveToZone(topology: Topology, deviceId: string, zoneId: string): Topology {
  const base = materialize(topology);
  const device = base.devices.find(item => item.id === deviceId);
  if(!device || device.zone === zoneId || !base.zones!.some(zone => zone.id === zoneId)) return topology;
  const emptied = base.devices.every(item => item.id === deviceId || item.zone !== device.zone);
  return {
    ...base,
    zones: base.zones!.map(zone => zone.id === device.zone && emptied ? { ...zone, position: zone.position ?? device.position } : zone),
    devices: base.devices.map(item => item.id === deviceId ? { ...item, zone: zoneId } : item),
  };
}
