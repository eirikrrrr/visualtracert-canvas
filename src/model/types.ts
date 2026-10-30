// The topology: what the canvas draws, what the document (YAML/JSON) says and
// what the simulator runs. One object, the single source of truth.

export type DeviceType =
  | "router"
  | "switch"
  | "firewall"
  | "pc"
  | "laptop"
  | "server"
  | "phone"
  | "ap"
  | "iot"
  | "cloud";

export interface Interface {
  name: string;
  mac: string;
  /** IPv4 address, without the prefix */
  ip?: string;
  /** prefix length, e.g. 24 for /24 */
  prefix?: number;
  /** access VLAN of a switch port (1 when absent) */
  vlan?: number;
}

export interface Route {
  /** destination network, e.g. "10.0.2.0/24"; "0.0.0.0/0" is the default route */
  prefix: string;
  /** next hop address */
  via: string;
}

export interface Device {
  id: string;
  type: DeviceType;
  name: string;
  position: { x: number; y: number };
  interfaces: Interface[];
  /** default gateway of an end device */
  gateway?: string;
  /** static routes of a router or firewall */
  routes?: Route[];
  description?: string;
}

export interface Endpoint {
  device: string;
  interface: string;
}

export interface Link {
  id: string;
  a: Endpoint;
  b: Endpoint;
}

export interface Topology {
  version: 1;
  name: string;
  devices: Device[];
  links: Link[];
}
