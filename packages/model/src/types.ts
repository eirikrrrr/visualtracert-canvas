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
  /** the address is obtained by DHCP (ip/prefix hold the current lease) */
  dhcp?: boolean;
  /** DHCP relay of a router interface: the server its broadcasts are sent to */
  relay?: string;
}

export interface Route {
  /** destination network, e.g. "10.0.2.0/24"; "0.0.0.0/0" is the default route */
  prefix: string;
  /** next hop address */
  via: string;
}

/** Addresses a DHCP server hands out on one network. */
export interface DhcpPool {
  /** the network it serves, e.g. "192.168.21.0/24" */
  network: string;
  start: string;
  end: string;
  gateway?: string;
  dns?: string;
}

/** A name a DNS server answers for (an A record). */
export interface DnsRecord {
  name: string;
  ip: string;
}

/** What a device serves to the others. */
export interface Services {
  dhcp?: DhcpPool[];
  dns?: DnsRecord[];
  /** web server on TCP port 80 */
  http?: boolean;
}

export interface Device {
  id: string;
  type: DeviceType;
  name: string;
  position: { x: number; y: number };
  interfaces: Interface[];
  /** default gateway of an end device */
  gateway?: string;
  /** DNS server of an end device */
  dns?: string;
  /** static routes of a router or firewall */
  routes?: Route[];
  services?: Services;
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
  /** what the lab is about and what to try in it */
  description?: string;
  devices: Device[];
  links: Link[];
}
