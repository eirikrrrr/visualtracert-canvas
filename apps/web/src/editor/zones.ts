// Where each topology of the lab is drawn: a rectangle around its devices (or,
// while it has none, one of a fixed size where it was left), and which
// topology a point of the canvas falls in.
import { devicesOf, zonesOf, type Device, type Topology, type Zone } from "@visual-tracert/model";

/** room around the devices, and for the title on top and the note below */
export const ZONE_PAD = 30;
export const ZONE_HEAD = 34;
export const ZONE_NOTE = 24;
export const ZONE_EMPTY = { width: 320, height: 180 };
/** a device on the canvas before it is measured: its tile and its name beside it */
export const DEVICE_BOX = { width: 180, height: 56 };

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ZoneRect extends Box {
  zone: Zone;
  empty: boolean;
}

const approximate = (device: Device): Box => ({ ...device.position, ...DEVICE_BOX });

export function zoneRects(topology: Topology, boxOf: (device: Device) => Box = approximate, emptyAt?: (zone: Zone) => { x: number; y: number } | undefined): ZoneRect[] {
  return zonesOf(topology).map(zone => {
    const boxes = devicesOf(topology, zone.id).map(boxOf);
    if(!boxes.length){
      const at = emptyAt?.(zone) ?? zone.position ?? { x: 0, y: 0 };
      return { zone, empty: true, ...at, ...ZONE_EMPTY };
    }
    const left = Math.min(...boxes.map(box => box.x)), top = Math.min(...boxes.map(box => box.y));
    const right = Math.max(...boxes.map(box => box.x + box.width)), bottom = Math.max(...boxes.map(box => box.y + box.height));
    const x = left - ZONE_PAD, y = top - ZONE_PAD - ZONE_HEAD;
    return { zone, empty: false, x, y, width: right - x + ZONE_PAD, height: bottom - y + ZONE_PAD + (zone.text ? ZONE_NOTE : 0) };
  });
}

const inside = (rect: Box, point: { x: number; y: number }) =>
  point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;

/** the smallest rectangle the point is in */
export function zoneAt(rects: ZoneRect[], point: { x: number; y: number }): ZoneRect | undefined {
  return rects.filter(rect => inside(rect, point)).sort((p, q) => p.width * p.height - q.width * q.height)[0];
}

function nearest(rects: ZoneRect[], point: { x: number; y: number }): ZoneRect | undefined {
  const distance = (rect: Box) => Math.hypot(
    Math.max(rect.x - point.x, 0, point.x - rect.x - rect.width),
    Math.max(rect.y - point.y, 0, point.y - rect.y - rect.height));
  return [...rects].sort((p, q) => distance(p) - distance(q))[0];
}

/** The topology a device added at a point goes to: the one it falls in, the
 * one being worked on (selected), or the nearest. */
export function zoneForNew(topology: Topology, point: { x: number; y: number }, selected?: string): string | undefined {
  const rects = zoneRects(topology);
  return (zoneAt(rects, point) ?? rects.find(rect => rect.zone.id === selected) ?? nearest(rects, point))?.zone.id;
}
