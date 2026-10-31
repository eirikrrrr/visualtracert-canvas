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
// Alpine Linux), or as the image of its profile when it has a built one. A
// network OS configures itself: SR Linux through sr_cli once it boots, and a
// virtual machine (RouterOS) through its launcher, from its environment.
// Only the devices their topology starts are built (all of a started one,
// those with status start of a hybrid one), with the cables between them.
import { fnv1a, IMAGES, imageOf, isStarted, networkFingerprint, profileTag, type ImageId, type ImageProfile, parseCidr, roleOf, sameSubnet, spanish, type Device, type Interface, type Role, type T, type Topology } from "@visual-tracert/model";

export const LABELS = {
  lab: "visual-tracert.lab",
  device: "visual-tracert.device",
  fingerprint: "visual-tracert.fingerprint",
  image: "visual-tracert.image",
} as const;

export interface NodePlan {
  device: string;
  name: string;
  role: Role;
  container: string;
  /** what Docker runs it as ("alpine:3.20", or a profile's local image) */
  image: string;
  /** the catalog image it is (a profile's base): how it runs, its shells */
  imageId: ImageId;
  profile?: string;
  /** "sleep": kept alive doing nothing; "image": its own command; "vm": a
   * virtual machine its launcher runs */
  run: "sleep" | "image" | "vm";
  /** capabilities beyond NET_ADMIN */
  caps: string[];
  privileged: boolean;
  /** its command, user and environment, when not the image's own */
  cmd?: string[];
  user?: string;
  env?: string[];
  /** memory, in MB */
  memory: number;
  /** shell commands run inside it once it is wired */
  startup: string[];
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

/** the profiles a lab can use, and whether each one's image is built as it says */
export type ProfileCatalog = Map<string, { profile: ImageProfile; ready: boolean }>;

/** what the server allows: privileged containers (a network OS that needs it) */
export interface PlanOptions {
  allowPrivileged?: boolean;
}

export function planLab(lab: string, topology: Topology, t: T = spanish, profiles: ProfileCatalog = new Map(), options: PlanOptions = {}): Plan {
  // a privileged image runs only where the server allows it
  const refused = topology.devices.filter(device => isStarted(topology, device) && imageOf(device.type).privileged && !options.allowPrivileged);
  const started = topology.devices.filter(device => isStarted(topology, device) && !refused.includes(device));
  const devices = new Map(started.map(device => [device.id, device]));
  const warnings: string[] = [];
  const idle = topology.devices.filter(device => !devices.has(device.id));
  const asleep = idle.filter(device => !refused.includes(device));
  if(asleep.length) warnings.push(t("No se inician por el estado de su topología: {devices}.", { devices: asleep.map(device => device.name).join(", ") }));
  if(refused.length) warnings.push(t("No se inician porque necesitan un contenedor privilegiado y este servidor no lo permite (ALLOW_PRIVILEGED=1 en el emulador): {devices}.", { devices: refused.map(device => device.name).join(", ") }));

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
    const own = imageOf(device.type);
    if(own.config === "srlinux") script.push(...ports.map(({ end }) => `ip link set ${end.ifname} up`));
    // the machine's NICs take the port's frames: Linux stays quiet on it
    else if(own.config === "routeros") script.push(...ports.flatMap(({ end }) => [`sysctl -qw net.ipv6.conf.${end.ifname}.disable_ipv6=1`, `ip link set ${end.ifname} up`]));
    else if(role === "switch") script.push(...bridgeScript(ports.map(port => port.iface), port => ports.find(item => item.iface === port)!.end.ifname));
    else script.push(...addressScript(device, role, ports, warnings, t));
    // its profile, if there is one ready; if not, the image of its type
    const chosen = device.profile ? profiles.get(device.profile) : undefined;
    if(device.profile && !chosen) warnings.push(t("{device}: el perfil \"{profile}\" no existe en este servidor: usa {image}.", { device: device.name, profile: device.profile, image: imageOf(device.type).name }));
    else if(chosen && !chosen.ready) warnings.push(t("{device}: el perfil \"{profile}\" no está construido (o cambió): usa {image}. Constrúyelo en el Marketplace.", { device: device.name, profile: chosen.profile.name, image: imageOf(device.type).name }));
    const profile = chosen?.ready ? chosen.profile : undefined;
    const image = profile ? IMAGES[profile.base] : imageOf(device.type);
    return {
      device: device.id, name: device.name, role, script,
      container: containerName(lab, device.id),
      image: profile ? profileTag(profile.id) : image.ref,
      imageId: image.id,
      ...(profile ? { profile: profile.id } : {}),
      run: image.run,
      caps: image.caps ?? [],
      privileged: Boolean(image.privileged),
      ...(image.cmd ? { cmd: image.cmd } : {}),
      ...(image.user ? { user: image.user } : {}),
      ...(image.env || image.config === "routeros" ? {
        env: [...image.env ?? [], ...(image.config === "routeros" ? routerosEnv(device, role, ifnames.get(device.id)!, ports.map(({ end }) => end.ifname), warnings, t) : [])],
      } : {}),
      memory: image.memory ?? 96,
      startup: [
        ...(image.startup ?? []),
        ...(image.config === "srlinux" ? srlinuxStartup(device, role, ports.map(port => port.iface), warnings, t) : []),
        ...(profile?.startup ?? []),
      ],
      hostname: slug(device.name, 63),
    };
  });

  return { lab, fingerprint: networkFingerprint(topology), nodes, links, warnings };
}

// SR Linux: its ports are e1-N (ethernet-1/N in its CLI); its addresses and
// routes go in through sr_cli once it has booted and sees its ports
export const srlinuxPort = (name: string) => name.match(/^e(\d+)-(\d+)$/)?.slice(1).join("/");

export function srlinuxConfig(device: Device, role: Role, ports: Interface[], warnings: string[], t: T): string[] {
  const lines = ["enter candidate"];
  for(const iface of ports){
    const port = srlinuxPort(iface.name);
    if(!port){ warnings.push(t("{device}: {iface} no es un puerto de SR Linux (e1-1, e1-2…): no se configura.", { device: device.name, iface: iface.name })); continue; }
    if(!iface.ip || !iface.prefix) continue;
    const name = `ethernet-${port}`;
    lines.push(
      `set / interface ${name} admin-state enable`,
      `set / interface ${name} subinterface 0 ipv4 admin-state enable`,
      `set / interface ${name} subinterface 0 ipv4 address ${iface.ip}/${iface.prefix}`,
      `set / network-instance default interface ${name}.0`,
    );
  }
  if(role === "router"){
    (device.routes ?? []).forEach((route, i) => {
      const cidr = parseCidr(route.prefix)!;
      lines.push(
        `set / network-instance default next-hop-groups group vt-${i + 1} nexthop 1 ip-address ${route.via}`,
        `set / network-instance default static-routes route ${cidr.network}/${cidr.prefix} next-hop-group vt-${i + 1}`,
      );
    });
  }
  lines.push("commit now");
  return lines;
}

function srlinuxStartup(device: Device, role: Role, ports: Interface[], warnings: string[], t: T): string[] {
  const config = srlinuxConfig(device, role, ports, warnings, t);
  if(config.length <= 2) return [];
  const first = ports.map(iface => srlinuxPort(iface.name)).find(Boolean);
  return [
    "cat > /tmp/visual-tracert.cfg <<'VTCFG'",
    ...config,
    "VTCFG",
    // booted: its CLI answers, and it sees its first port
    "for i in $(seq 1 120); do sr_cli -c 'show version' 2>/dev/null | grep -q 'Software Version *: v' && break; sleep 2; done",
    ...(first ? [`for i in $(seq 1 60); do sr_cli -c 'show interface ethernet-${first}' 2>/dev/null | grep -q 'is up\\|is down' && break; sleep 2; done`] : []),
    "sr_cli source /tmp/visual-tracert.cfg > /tmp/visual-tracert.log 2>&1",
  ];
}

// RouterOS: its launcher (vrnetlab) gives it one NIC per port, in order
// (ether1, ether2…), waits for the cabled ones and applies its configuration
const routerosQuote = (text: string) => `"${text.replace(/[\\"$]/g, "\\$&")}"`;

export function routerosConfig(device: Device, role: Role, warnings: string[], t: T): string[] {
  const lines = [`/system identity set name=${routerosQuote(device.name)}`];
  const names = device.interfaces.map((iface, i) => {
    const own = `ether${i + 1}`;
    if(iface.name !== own) lines.push(`/interface ethernet set [find default-name=${own}] name=${routerosQuote(iface.name)}`);
    return routerosQuote(iface.name);
  });
  device.interfaces.forEach((iface, i) => {
    if(iface.ip && iface.prefix) lines.push(`/ip address add address=${iface.ip}/${iface.prefix} interface=${names[i]}`);
    else if(iface.dhcp) lines.push(`/ip dhcp-client add interface=${names[i]}`);
  });
  if(role === "router"){
    for(const route of device.routes ?? []){
      const cidr = parseCidr(route.prefix)!;
      lines.push(`/ip route add dst-address=${cidr.network}/${cidr.prefix} gateway=${route.via}`);
    }
  }else if(device.gateway) lines.push(`/ip route add dst-address=0.0.0.0/0 gateway=${device.gateway}`);
  const services = device.services;
  if(services && (services.dhcp?.length || services.dns?.length || services.http)){
    warnings.push(t("{device}: sus servicios (DHCP, DNS, web) aún no se emulan.", { device: device.name }));
  }
  return lines;
}

function routerosEnv(device: Device, role: Role, ifnames: Map<string, string>, cabled: string[], warnings: string[], t: T): string[] {
  return [
    `VR_PORTS=${device.interfaces.map(iface => `${ifnames.get(iface.name)}=${iface.mac}`).join(" ")}`,
    `VR_WAIT=${cabled.join(" ")}`,
    `VR_CONFIG=${Buffer.from(routerosConfig(device, role, warnings, t).join("\n")).toString("base64")}`,
    // with less, a RouterOS with eight ports spends its time reclaiming memory
    "VR_MEMORY=512",
  ];
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
