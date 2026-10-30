// Emulation plan: a topology turned into what Docker and the kernel build —
// one container per device (without a network of its own), one veth pair per
// cable, and the commands that configure each device inside its network
// namespace. Pure: the lab (lab.ts) executes it and the tests read it.
//
// Devices by role: an end device gets its addresses and default gateway; a
// router (or firewall, or ISP) forwards IPv4 and gets its static routes; a
// switch (or access point) is a Linux bridge with each port in its access
// VLAN. DHCP, DNS and web services are not emulated yet: they come back as
// warnings. Each device runs as the image of its type (a generic one, as
// Alpine Linux). Only the devices their topology starts are built (all of a
// started one, those with status start of a hybrid one), with the cables
// between them.
import { fnv1a, imageOf, isStarted, networkFingerprint, parseCidr, roleOf, sameSubnet, spanish, type Device, type Interface, type Role, type T, type Topology } from "@visual-tracert/model";

export const LABELS = {
  lab: "visual-tracert.lab",
  device: "visual-tracert.device",
  fingerprint: "visual-tracert.fingerprint",
} as const;

export interface NodePlan {
  device: string;
  name: string;
  role: Role;
  container: string;
  /** what Docker runs it as ("alpine:3.20") */
  image: string;
  hostname: string;
  /** shell lines run inside the device's network namespace, in order */
  script: string[];
}

export interface LinkEnd {
  device: string;
  /** the port as the topology names it ("Gi0/0") */
  iface: string;
  /** its name inside the container ("Gi0-0") */
  ifname: string;
  /** the name the veth end has before it is moved and renamed */
  temp: string;
}

export interface LinkPlan {
  id: string;
  a: LinkEnd;
  b: LinkEnd;
}

export interface Plan {
  lab: string;
  fingerprint: string;
  nodes: NodePlan[];
  links: LinkPlan[];
  /** what the emulation leaves out, said to the user */
  warnings: string[];
}

const slug = (text: string, max: number) =>
  text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max) || "x";

export const containerName = (lab: string, device: string) => `vt-${slug(lab, 30)}-${slug(device, 30)}`;

/** single-quoted for sh */
const quote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

/** A Linux name for a port: at most 15 characters, none of "/", ":" or spaces. */
export function ifnameOf(name: string, taken: Set<string>): string {
  const base = name.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 15) || "port";
  let candidate = base;
  for(let n = 1; taken.has(candidate) || candidate === "lo" || candidate === "br0"; n++) candidate = `${base.slice(0, 15 - String(n).length)}${n}`;
  taken.add(candidate);
  return candidate;
}

export function planLab(lab: string, topology: Topology, t: T = spanish): Plan {
  const started = topology.devices.filter(device => isStarted(topology, device));
  const devices = new Map(started.map(device => [device.id, device]));
  const warnings: string[] = [];
  const idle = topology.devices.filter(device => !devices.has(device.id));
  if(idle.length) warnings.push(t("No se inician por el estado de su topología: {devices}.", { devices: idle.map(device => device.name).join(", ") }));

  // the Linux name of every port, in the order the device lists them
  const ifnames = new Map(started.map(device => {
    const taken = new Set<string>();
    return [device.id, new Map(device.interfaces.map(iface => [iface.name, ifnameOf(iface.name, taken)]))];
  }));

  const links: LinkPlan[] = [];
  for(const link of topology.links){
    const ends = [link.a, link.b].map(end => ({ end, device: devices.get(end.device) }));
    if(ends.some(({ end, device }) => !device?.interfaces.some(iface => iface.name === end.interface))) continue;
    const temp = `vt${fnv1a(`${lab} ${link.id}`)}`;
    const [a, b] = ends.map(({ end }, i) => ({
      device: end.device, iface: end.interface, ifname: ifnames.get(end.device)!.get(end.interface)!, temp: `${temp}${i ? "b" : "a"}`,
    }));
    links.push({ id: link.id, a, b });
  }
  const endsOf = (device: string) => links.flatMap(link => [link.a, link.b]).filter(end => end.device === device);

  const nodes = started.map((device): NodePlan => {
    const role = roleOf(device.type);
    const ports = endsOf(device.id).map(end => ({ end, iface: device.interfaces.find(iface => iface.name === end.iface)! }));
    const script = ["ip link set lo up"];
    for(const { end, iface } of ports){
      script.push(
        `ip link set ${end.temp} name ${end.ifname}`,
        `ip link set dev ${end.ifname} address ${iface.mac}`,
        `ip link set dev ${end.ifname} alias ${quote(iface.name)}`,
      );
    }
    if(role === "switch") script.push(...bridgeScript(ports.map(port => port.iface), port => ports.find(item => item.iface === port)!.end.ifname));
    else script.push(...addressScript(device, role, ports, warnings, t));
    return {
      device: device.id, name: device.name, role, script,
      container: containerName(lab, device.id),
      image: imageOf(device.type).ref,
      hostname: slug(device.name, 63),
    };
  });

  return { lab, fingerprint: networkFingerprint(topology), nodes, links, warnings };
}

// a switch: one bridge, every cabled port in it, in its access VLAN
function bridgeScript(ports: Interface[], ifname: (iface: Interface) => string): string[] {
  const script = ["ip link add br0 type bridge vlan_filtering 1", "ip link set br0 up"];
  for(const iface of ports){
    const name = ifname(iface);
    script.push(`ip link set ${name} master br0`, `ip link set ${name} up`);
    const vlan = iface.vlan ?? 1;
    if(vlan !== 1) script.push(`bridge vlan del vid 1 dev ${name}`, `bridge vlan add vid ${vlan} dev ${name} pvid untagged`);
  }
  return script;
}

// an end device or a router: addresses, then its gateway or its routes
function addressScript(device: Device, role: Role, ports: { end: LinkEnd; iface: Interface }[], warnings: string[], t: T): string[] {
  const script: string[] = [];
  for(const { end, iface } of ports){
    if(iface.ip && iface.prefix) script.push(`ip addr add ${iface.ip}/${iface.prefix} dev ${end.ifname}`);
    else if(iface.dhcp) warnings.push(t("{device}: {iface} toma su dirección por DHCP, que aún no se emula: queda sin dirección.", { device: device.name, iface: iface.name }));
    script.push(`ip link set ${end.ifname} up`);
  }
  // a next hop only works on a network that is cabled and addressed
  const connected = ports.map(port => port.iface).filter(iface => iface.ip && iface.prefix);
  const reachable = (ip: string) => connected.some(iface => sameSubnet(iface.ip!, ip, iface.prefix!));

  if(role === "router"){
    script.push("sysctl -qw net.ipv4.ip_forward=1");
    for(const route of device.routes ?? []){
      const cidr = parseCidr(route.prefix)!;
      if(!reachable(route.via)){
        warnings.push(t("{device}: la ruta hacia {prefix} sale por {via}, que no está en ninguna red cableada: no se aplica.", { device: device.name, prefix: route.prefix, via: route.via }));
        continue;
      }
      script.push(`ip route replace ${cidr.prefix === 0 ? "default" : `${cidr.network}/${cidr.prefix}`} via ${route.via}`);
    }
    for(const iface of device.interfaces.filter(item => item.relay)){
      warnings.push(t("{device}: el relay DHCP de {iface} aún no se emula.", { device: device.name, iface: iface.name }));
    }
  }else if(device.gateway){
    if(reachable(device.gateway)) script.push(`ip route replace default via ${device.gateway}`);
    else warnings.push(t("{device}: la puerta de enlace {gateway} no está en ninguna red cableada: no se aplica.", { device: device.name, gateway: device.gateway }));
  }
  const services = device.services;
  if(services && (services.dhcp?.length || services.dns?.length || services.http)){
    warnings.push(t("{device}: sus servicios (DHCP, DNS, web) aún no se emulan.", { device: device.name }));
  }
  return script;
}
