// Packet simulator: a discrete-event run of one action (a ping, a trace, a
// DHCP request, a DNS lookup or a web request) over a topology. It returns
// every hop as an event (which frame arrived where, at what time, and what
// that device did with it), so the interface can replay it step by step and
// inspect each frame, plus what the action prints on the device's console.
// Pure: no DOM, no React, no clock.
//
// Modelled: Ethernet with MAC learning switches and access VLANs, ARP, IPv4
// with TTL, ICMP (echo, time exceeded, network and port unreachable), end
// devices with a default gateway and a DNS server, routers with connected and
// static routes (longest prefix) and DHCP relay, and the services a device
// can offer: DHCP, DNS and a web server (HTTP over TCP).
import { spanish, type T } from "../i18n";
import { BROADCAST_MAC, inCidr, intToIp, ipToInt, isIp, parseCidr, roleOf, sameSubnet, type Device, type DhcpPool, type Interface, type Link, type Topology } from "@visual-tracert/model";
import {
  LIMITED_BROADCAST, NO_ADDRESS, PORT, protocolOf, summarize,
  type DhcpMessage, type Frame, type IcmpType, type IpPacket, type Protocol, type TcpFlag, type TcpSegment,
} from "./packets";

export * from "./packets";

export type SimRequest =
  | { kind: "ping"; from: string; to: string; ttl?: number }
  | { kind: "traceroute"; from: string; to: string; maxHops?: number }
  | { kind: "dhcp"; from: string; iface?: string }
  | { kind: "dns"; from: string; to: string }
  | { kind: "http"; from: string; to: string };

export type SimKind = SimRequest["kind"];

export type EventResult = "created" | "forwarded" | "flooded" | "answered" | "learned" | "delivered" | "dropped";

export interface SimEvent {
  index: number;
  /** seconds since the action started */
  time: number;
  /** device the frame comes from (null: created here) */
  from: string | null;
  /** device the frame arrives at */
  to: string;
  link: string | null;
  inInterface: string | null;
  protocol: Protocol;
  /** short description of the frame ("ARP ¿Quién tiene 192.168.21.1?") */
  summary: string;
  frame: Frame;
  result: EventResult;
  /** what the device did with it */
  notes: string[];
}

export interface SimOutcome {
  ok: boolean;
  message: string;
  /** round trip time in milliseconds, when it worked */
  rtt?: number;
}

/** The address a DHCP client obtained: the topology takes it after the run. */
export interface Lease {
  device: string;
  iface: string;
  ip: string;
  prefix: number;
  gateway?: string;
  dns?: string;
}

export interface SimRun {
  request: SimRequest;
  events: SimEvent[];
  outcome: SimOutcome;
  /** what the command prints on the origin device */
  console: string[];
  lease?: Lease;
}

/** time a frame takes across a link, in seconds */
export const HOP_SECONDS = 0.001;
/** how long a client waits for an answer, in seconds */
export const TIMEOUT_SECONDS = 2;
const MAX_EVENTS = 1500;
const ECHO_ID = 1;
const TRACE_ID = 2;
const TRACE_MISSES = 3;
const DNS_CLIENT_PORT = 49152;
const TCP_CLIENT_PORT = 49153;
const DHCP_XID = 0x3903f326;
const LEASE_SECONDS = 86400;
const PAGE_BYTES = 1256;
const NOT_FOUND_BYTES = 162;

interface Arrival {
  kind: "frame";
  time: number;
  device: string;
  iface: string;
  frame: Frame;
  from: string;
  link: string;
}

interface Timer {
  kind: "timer";
  time: number;
  fire: (time: number) => void;
}

/** What the command running on the origin device does with what reaches it. */
interface Client {
  icmp?: (packet: IpPacket, time: number) => void;
  udp?: (packet: IpPacket, time: number) => void;
  tcp?: (packet: IpPacket, time: number) => void;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const ms = (seconds: number) => Math.round(seconds * 1000 * 1000) / 1000;
/** bytes of sequence space a segment uses: its data, plus one for SYN or FIN */
const seqLength = (tcp: TcpSegment) => tcp.length + (tcp.flags.includes("SYN") || tcp.flags.includes("FIN") ? 1 : 0);

export function simulate(topology: Topology, request: SimRequest, t: T = spanish): SimRun {
  // a copy: a DHCP client changes its own address during the run
  const devices = new Map(clone(topology.devices).map(device => [device.id, device]));
  const events: SimEvent[] = [];
  const output: string[] = [];
  const queue: (Arrival | Timer)[] = [];
  const arp = new Map<string, Map<string, string>>();
  const macTables = new Map<string, Map<string, string>>();
  // packets waiting for an ARP answer, by device and next hop
  const pending = new Map<string, Map<string, { iface: string; packet: IpPacket }[]>>();
  // addresses a DHCP server handed out in this run, by MAC
  const leases = new Map<string, string>();
  // open TCP connections of the web servers, by device, client and port
  const connections = new Map<string, { seq: number; closing: boolean }>();
  const client: Client = {};
  let outcome: SimOutcome | null = null;
  // reached, but the frames still in flight are shown before it ends
  let settled: SimOutcome | null = null;
  let lease: Lease | undefined;
  let current: SimEvent | null = null;
  const note = (text: string) => current?.notes.push(text);
  const lastNote = (fallback: string) => current?.notes[current.notes.length - 1] ?? fallback;
  const print = (line: string) => output.push(line);

  const finish = (): SimRun => ({ request, events, outcome: outcome!, console: output, ...(lease ? { lease } : {}) });
  const source = devices.get(request.from);
  if(!source){
    outcome = { ok: false, message: t("El equipo de origen no existe.") };
    return finish();
  }
  const nameOf = (id: string) => devices.get(id)?.name ?? id;
  const nameAt = (ip: string) => {
    const owner = [...devices.values()].find(device => device.interfaces.some(iface => iface.ip === ip));
    return owner ? ` (${owner.name})` : "";
  };

  const linkAt = (device: string, iface: string): Link | undefined =>
    topology.links.find(link =>
      (link.a.device === device && link.a.interface === iface) ||
      (link.b.device === device && link.b.interface === iface));

  const ifaceOf = (device: Device, name: string) => device.interfaces.find(iface => iface.name === name);
  const addressed = (device: Device) => device.interfaces.filter(iface => iface.ip && iface.prefix);
  const ownsIp = (device: Device, ip: string) => device.interfaces.some(iface => iface.ip === ip);
  const arpTable = (id: string) => arp.get(id) ?? arp.set(id, new Map()).get(id)!;
  const timer = (time: number, fire: (time: number) => void) => queue.push({ kind: "timer", time, fire });

  function transmit(device: Device, ifaceName: string, frame: Frame, time: number): boolean {
    const link = linkAt(device.id, ifaceName);
    if(!link){
      note(t("{iface} no tiene cable: la trama no sale.", { iface: ifaceName }));
      return false;
    }
    const peer = link.a.device === device.id && link.a.interface === ifaceName ? link.b : link.a;
    queue.push({ kind: "frame", time: time + HOP_SECONDS, device: peer.device, iface: peer.interface, frame: clone(frame), from: device.id, link: link.id });
    return true;
  }

  // next hop and egress interface for a packet leaving a host or a router
  function nextHop(device: Device, dst: string): { iface: Interface; hop: string } | { error: string } {
    const connected = addressed(device).find(iface => sameSubnet(iface.ip!, dst, iface.prefix!));
    if(connected) return { iface: connected, hop: dst };
    if(roleOf(device.type) === "router"){
      const matches = (device.routes ?? [])
        .map(route => ({ route, cidr: parseCidr(route.prefix) }))
        .filter(item => item.cidr && inCidr(dst, item.route.prefix))
        .sort((p, q) => q.cidr!.prefix - p.cidr!.prefix);
      for(const { route } of matches){
        const egress = addressed(device).find(iface => sameSubnet(iface.ip!, route.via, iface.prefix!));
        if(egress) return { iface: egress, hop: route.via };
      }
      return { error: matches.length ? t("El siguiente salto de la ruta hacia {dst} no está en ninguna red conectada.", { dst }) : t("Sin ruta hacia {dst}.", { dst }) };
    }
    if(!addressed(device).length) return { error: t("{device} no tiene dirección IP.", { device: device.name }) };
    if(!device.gateway) return { error: t("{dst} no está en la red local y {device} no tiene puerta de enlace.", { dst, device: device.name }) };
    const egress = addressed(device).find(iface => sameSubnet(iface.ip!, device.gateway!, iface.prefix!));
    if(!egress) return { error: t("La puerta de enlace {gateway} no está en la red de ninguna interfaz.", { gateway: device.gateway }) };
    return { iface: egress, hop: device.gateway };
  }

  /** the address a device sends from towards dst: the one of the egress interface */
  function sourceFor(device: Device, dst: string): string {
    const route = nextHop(device, dst);
    return "iface" in route ? route.iface.ip! : addressed(device)[0]?.ip ?? NO_ADDRESS;
  }

  function sendIp(device: Device, packet: IpPacket, time: number): boolean {
    const route = nextHop(device, packet.dst);
    if("error" in route){
      note(route.error);
      return false;
    }
    const { iface, hop } = route;
    const known = arpTable(device.id).get(hop);
    if(known){
      note(hop === packet.dst ? t("Envía por {iface} hacia {hop}.", { iface: iface.name, hop }) : t("Envía por {iface} hacia {hop} (siguiente salto).", { iface: iface.name, hop }));
      return transmit(device, iface.name, { src: iface.mac, dst: known, ethertype: "IPv4", ip: packet }, time);
    }
    const waiting = pending.get(device.id) ?? pending.set(device.id, new Map()).get(device.id)!;
    const queued = waiting.get(hop);
    if(queued){
      queued.push({ iface: iface.name, packet });
      return true;
    }
    waiting.set(hop, [{ iface: iface.name, packet }]);
    note(t("No conoce la MAC de {hop}: pregunta por ARP en {iface}.", { hop, iface: iface.name }));
    return transmit(device, iface.name, {
      src: iface.mac, dst: BROADCAST_MAC, ethertype: "ARP",
      arp: { op: "request", senderMac: iface.mac, senderIp: iface.ip!, targetMac: "00:00:00:00:00:00", targetIp: hop },
    }, time);
  }

  // a packet a command creates: its own event, at the origin, before it leaves
  function created(device: Device, frame: Frame, time: number, text: string): SimEvent {
    current = {
      index: events.length, time: Math.round(time * 1e6) / 1e6, from: null, to: device.id, link: null, inInterface: null,
      protocol: protocolOf(frame), summary: summarize(frame, t), frame: clone(frame), result: "created", notes: [text],
    };
    events.push(current);
    return current;
  }

  function originate(device: Device, packet: IpPacket, time: number, text: string): boolean {
    created(device, { src: "", dst: "", ethertype: "IPv4", ip: packet }, time, text);
    return sendIp(device, packet, time);
  }

  function learnArp(device: Device, ip: string, mac: string, time: number){
    arpTable(device.id).set(ip, mac);
    const waiting = pending.get(device.id)?.get(ip);
    if(!waiting) return;
    pending.get(device.id)!.delete(ip);
    waiting.forEach(({ iface, packet }) => {
      const out = ifaceOf(device, iface)!;
      note(t("Envía el paquete que esperaba por {iface}.", { iface }));
      transmit(device, iface, { src: out.mac, dst: mac, ethertype: "IPv4", ip: packet }, time);
    });
  }

  function fail(message: string){
    if(!outcome) outcome = { ok: false, message };
  }

  /** when a client gives up: an unanswered ARP explains more than "no answer" */
  function timeoutMessage(fallback: string): string {
    for(const [id, hops] of pending){
      const hop = [...hops.keys()][0];
      if(hop) return t("Nadie respondió al ARP de {device} por {hop}.", { device: nameOf(id), hop });
    }
    return fallback;
  }

  // ICMP error back to the sender of a packet, from the interface it came in by
  function icmpError(device: Device, ingress: Interface | undefined, type: IcmpType, about: IpPacket, time: number, code = 0){
    if(about.icmp && about.icmp.type !== "echo-request") return;
    if(about.src === NO_ADDRESS || about.dst === LIMITED_BROADCAST) return;
    const from = ingress?.ip ?? addressed(device)[0]?.ip;
    if(!from) return;
    const port = about.udp?.dstPort ?? about.tcp?.dstPort;
    sendIp(device, {
      src: from, dst: about.src, ttl: 64, protocol: "ICMP",
      icmp: {
        type, ...(type === "unreachable" ? { code } : {}), id: about.icmp?.id ?? 0, seq: about.icmp?.seq ?? 0,
        original: { src: about.src, dst: about.dst, protocol: about.protocol, ...(port ? { dstPort: port } : {}) },
      },
    }, time);
  }

  // ---- services ---------------------------------------------------------

  function dhcpBroadcast(device: Device, iface: Interface, message: DhcpMessage, time: number, ports: [number, number]){
    return transmit(device, iface.name, {
      src: iface.mac, dst: BROADCAST_MAC, ethertype: "IPv4",
      ip: { src: iface.ip ?? NO_ADDRESS, dst: LIMITED_BROADCAST, ttl: 64, protocol: "UDP", udp: { srcPort: ports[0], dstPort: ports[1], dhcp: message } },
    }, time);
  }

  /** an address of the pool for a client: the one it had, or the first free one */
  function leaseFor(pool: DhcpPool, mac: string): string | null {
    const used = new Set([...devices.values()].flatMap(device => device.interfaces.filter(iface => iface.mac !== mac && iface.ip).map(iface => iface.ip!)));
    const given = new Map([...leases].map(([owner, ip]) => [ip, owner]));
    const free = (ip: string) => !used.has(ip) && (!given.has(ip) || given.get(ip) === mac);
    const inRange = (ip: string) => ipToInt(ip) >= ipToInt(pool.start) && ipToInt(ip) <= ipToInt(pool.end);
    const before = leases.get(mac) ?? topology.devices.flatMap(device => device.interfaces).find(iface => iface.mac === mac)?.ip;
    if(before && inRange(before) && free(before)) return before;
    for(let n = ipToInt(pool.start); n <= ipToInt(pool.end); n++){
      if(free(intToIp(n))) return intToIp(n);
    }
    return null;
  }

  function dhcpServer(device: Device, iface: Interface, packet: IpPacket, time: number, event: SimEvent){
    const message = packet.udp!.dhcp!;
    const relayed = message.giaddr !== NO_ADDRESS;
    const anchor = relayed ? message.giaddr : iface.ip;
    const serverIp = packet.dst === LIMITED_BROADCAST ? iface.ip : packet.dst;
    if(!anchor || !serverIp){
      event.result = "dropped";
      note(t("{iface} no tiene dirección: no puede atender DHCP.", { iface: iface.name }));
      return;
    }
    const pool = device.services!.dhcp!.find(item => inCidr(anchor, item.network));
    if(!pool){
      event.result = "dropped";
      note(t("No tiene un rango DHCP para la red de {ip}: no responde.", { ip: anchor }));
      return;
    }
    const prefix = parseCidr(pool.network)!.prefix;
    const reply = (op: "offer" | "ack" | "nak", yiaddr: string) => {
      const answer: DhcpMessage = {
        op, xid: message.xid, clientMac: message.clientMac, ciaddr: NO_ADDRESS, yiaddr, giaddr: message.giaddr, serverId: serverIp,
        ...(op === "nak" ? {} : { prefix, ...(pool.gateway ? { router: pool.gateway } : {}), ...(pool.dns ? { dns: pool.dns } : {}), leaseSeconds: LEASE_SECONDS }),
      };
      // through a relay: back to it, unicast; on the same LAN: a broadcast the client takes
      if(relayed) sendIp(device, { src: serverIp, dst: message.giaddr, ttl: 64, protocol: "UDP", udp: { srcPort: PORT.dhcpServer, dstPort: PORT.dhcpServer, dhcp: answer } }, time);
      else dhcpBroadcast(device, iface, answer, time, [PORT.dhcpServer, PORT.dhcpClient]);
    };

    if(message.op === "discover"){
      const offered = leaseFor(pool, message.clientMac);
      if(!offered){
        event.result = "dropped";
        note(t("El rango {start}–{end} está agotado: no puede ofrecer nada.", { start: pool.start, end: pool.end }));
        return;
      }
      leases.set(message.clientMac, offered);
      event.result = "answered";
      note(relayed
        ? t("Servidor DHCP (llega por el relay {relay}): ofrece {ip} de su rango {start}–{end}.", { relay: message.giaddr, ip: offered, start: pool.start, end: pool.end })
        : t("Servidor DHCP: ofrece {ip} de su rango {start}–{end}.", { ip: offered, start: pool.start, end: pool.end }));
      reply("offer", offered);
      return;
    }
    if(message.serverId && message.serverId !== serverIp){
      event.result = "dropped";
      note(t("El cliente eligió el servidor {server}: retira su oferta.", { server: message.serverId ?? "" }));
      return;
    }
    const wanted = message.requested ?? message.ciaddr;
    const fits = isIp(wanted) && inCidr(wanted, pool.network) && leaseFor(pool, message.clientMac) !== null && (leases.get(message.clientMac) ?? wanted) === wanted;
    event.result = "answered";
    if(fits){
      leases.set(message.clientMac, wanted);
      note(t("Confirma {ip}/{prefix} para {mac} durante {hours} h (ACK).", { ip: wanted, prefix, mac: message.clientMac, hours: LEASE_SECONDS / 3600 }));
      reply("ack", wanted);
    }else{
      note(t("{ip} no es una dirección que pueda dar: rechaza la petición (NAK).", { ip: wanted ?? "" }));
      reply("nak", NO_ADDRESS);
    }
  }

  function dhcpAtRouterOrServer(device: Device, iface: Interface, packet: IpPacket, time: number, event: SimEvent){
    const message = packet.udp!.dhcp!;
    // an answer of the server, back at the relay that forwarded the question
    if(message.op === "offer" || message.op === "ack" || message.op === "nak"){
      const down = device.interfaces.find(item => item.ip && item.ip === message.giaddr);
      if(!down){
        event.result = "dropped";
        note(t("Es una respuesta DHCP para otro equipo: la ignora."));
        return;
      }
      event.result = "forwarded";
      note(t("Relay DHCP: la devuelve como difusión por {iface}, la red del cliente.", { iface: down.name }));
      dhcpBroadcast(device, down, message, time, [PORT.dhcpServer, PORT.dhcpClient]);
      return;
    }
    if(device.services?.dhcp?.length){
      dhcpServer(device, iface, packet, time, event);
      return;
    }
    if(iface.relay && packet.dst === LIMITED_BROADCAST){
      if(!iface.ip){
        event.result = "dropped";
        note(t("{iface} tiene relay pero no dirección: no puede reenviar.", { iface: iface.name }));
        return;
      }
      event.result = "forwarded";
      note(t("Relay DHCP (ip helper): la reenvía como unicast a {server}, con giaddr {ip}.", { server: iface.relay, ip: iface.ip }));
      const relayed = { ...message, giaddr: message.giaddr === NO_ADDRESS ? iface.ip : message.giaddr };
      if(!sendIp(device, { src: iface.ip, dst: iface.relay, ttl: 64, protocol: "UDP", udp: { srcPort: PORT.dhcpServer, dstPort: PORT.dhcpServer, dhcp: relayed } }, time)){
        event.result = "dropped";
      }
      return;
    }
    event.result = "dropped";
    note(roleOf(device.type) === "router"
      ? t("No es servidor DHCP y {iface} no tiene relay: la difusión termina aquí.", { iface: iface.name })
      : t("No es servidor DHCP: la ignora."));
  }

  function dnsServer(device: Device, packet: IpPacket, time: number, event: SimEvent){
    const udp = packet.udp!;
    const query = udp.dns;
    if(!query || query.response){
      event.result = "dropped";
      return;
    }
    const name = query.name.toLowerCase().replace(/\.$/, "");
    const record = device.services!.dns!.find(item => item.name === name);
    event.result = "answered";
    note(record ? t("Servidor DNS: {name} es {ip}.", { name, ip: record.ip }) : t("Servidor DNS: no tiene ningún registro para {name} (NXDOMAIN).", { name }));
    sendIp(device, {
      src: packet.dst, dst: packet.src, ttl: 64, protocol: "UDP",
      udp: { srcPort: PORT.dns, dstPort: udp.srcPort, dns: { id: query.id, response: true, name: query.name, ...(record ? { answer: record.ip } : {}), rcode: record ? "NOERROR" : "NXDOMAIN" } },
    }, time);
  }

  function reset(device: Device, packet: IpPacket, time: number){
    const tcp = packet.tcp!;
    sendIp(device, {
      src: packet.dst, dst: packet.src, ttl: 64, protocol: "TCP",
      tcp: { srcPort: tcp.dstPort, dstPort: tcp.srcPort, seq: tcp.flags.includes("ACK") ? tcp.ack : 0, ack: tcp.seq + seqLength(tcp), flags: ["RST", "ACK"], length: 0 },
    }, time);
  }

  function webServer(device: Device, packet: IpPacket, time: number, event: SimEvent){
    const tcp = packet.tcp!;
    const key = `${device.id} ${packet.src}:${tcp.srcPort}`;
    const answer = (flags: TcpFlag[], ack: number, length = 0, http?: TcpSegment["http"]) => {
      const connection = connections.get(key)!;
      sendIp(device, {
        src: packet.dst, dst: packet.src, ttl: 64, protocol: "TCP",
        tcp: { srcPort: tcp.dstPort, dstPort: tcp.srcPort, seq: connection.seq, ack, flags, length, ...(http ? { http } : {}) },
      }, time);
      connection.seq += length + (flags.includes("SYN") || flags.includes("FIN") ? 1 : 0);
    };
    if(tcp.flags.includes("SYN")){
      connections.set(key, { seq: 0, closing: false });
      event.result = "answered";
      note(t("Puerto 80 abierto: acepta la conexión (SYN, ACK)."));
      answer(["SYN", "ACK"], tcp.seq + 1);
      return;
    }
    const connection = connections.get(key);
    if(!connection){
      if(tcp.flags.includes("RST")){ event.result = "dropped"; return; }
      event.result = "answered";
      note(t("No hay ninguna conexión abierta con ese cliente: responde RST."));
      reset(device, packet, time);
      return;
    }
    if(tcp.http?.method){
      const found = tcp.http.path === "/" || tcp.http.path === "/index.html";
      const http = found
        ? { status: 200, reason: "OK", bytes: PAGE_BYTES }
        : { status: 404, reason: "Not Found", bytes: NOT_FOUND_BYTES };
      event.result = "answered";
      note(t("Servidor web: GET {path} → {status} {reason}, {bytes} bytes.", { path: tcp.http.path ?? "/", status: http.status, reason: http.reason, bytes: http.bytes }));
      answer(["PSH", "ACK"], tcp.seq + tcp.length, http.bytes, http);
      return;
    }
    if(tcp.flags.includes("FIN")){
      connection.closing = true;
      event.result = "answered";
      note(t("El cliente cierra la conexión: confirma y cierra también (FIN, ACK)."));
      answer(["FIN", "ACK"], tcp.seq + 1);
      return;
    }
    event.result = "delivered";
    if(connection.closing){
      connections.delete(key);
      note(t("Último ACK: la conexión queda cerrada."));
    }else{
      note(t("ACK del cliente: la conexión está establecida."));
    }
  }

  // ---- arrivals ---------------------------------------------------------

  // a packet addressed to this device (or a broadcast it takes)
  function deliver(device: Device, iface: Interface, packet: IpPacket, time: number, event: SimEvent){
    const atOrigin = device.id === request.from;
    if(packet.protocol === "ICMP"){
      const icmp = packet.icmp!;
      if(icmp.type === "echo-request"){
        event.result = "answered";
        note(t("El eco es para {dst}: responde a {src}.", { dst: packet.dst, src: packet.src }));
        sendIp(device, { src: packet.dst, dst: packet.src, ttl: 64, protocol: "ICMP", icmp: { type: "echo-reply", id: icmp.id, seq: icmp.seq } }, time);
        return;
      }
      event.result = "delivered";
      if(atOrigin && client.icmp) client.icmp(packet, time);
      return;
    }

    if(packet.protocol === "UDP"){
      const udp = packet.udp!;
      if(udp.dstPort === PORT.dhcpServer && udp.dhcp){
        dhcpAtRouterOrServer(device, iface, packet, time, event);
        return;
      }
      if(udp.dstPort === PORT.dhcpClient){
        if(atOrigin && client.udp && udp.dhcp?.clientMac === iface.mac){
          event.result = "delivered";
          client.udp(packet, time);
        }else{
          event.result = "dropped";
          note(t("Es una respuesta DHCP para otro equipo: la ignora."));
        }
        return;
      }
      if(udp.dstPort === PORT.dns && device.services?.dns?.length){
        dnsServer(device, packet, time, event);
        return;
      }
      if(atOrigin && udp.dstPort === DNS_CLIENT_PORT && client.udp){
        event.result = "delivered";
        client.udp(packet, time);
        return;
      }
      event.result = "dropped";
      if(packet.dst === LIMITED_BROADCAST){
        note(t("Nadie escucha en el puerto UDP {port}: la ignora.", { port: udp.dstPort }));
        return;
      }
      note(udp.dstPort === PORT.dns
        ? t("Nada escucha en el puerto UDP {port} (no es servidor DNS): avisa con ICMP puerto inalcanzable.", { port: udp.dstPort })
        : t("Nada escucha en el puerto UDP {port}: avisa con ICMP puerto inalcanzable.", { port: udp.dstPort }));
      icmpError(device, iface, "unreachable", packet, time, 3);
      return;
    }

    const tcp = packet.tcp!;
    if(atOrigin && tcp.dstPort === TCP_CLIENT_PORT && client.tcp){
      event.result = "delivered";
      client.tcp(packet, time);
      return;
    }
    if(tcp.dstPort === PORT.http && device.services?.http){
      webServer(device, packet, time, event);
      return;
    }
    if(tcp.flags.includes("RST")){
      event.result = "dropped";
      return;
    }
    event.result = "answered";
    note(tcp.dstPort === PORT.http
      ? t("Nada escucha en el puerto TCP {port} (no es servidor web): responde RST, conexión rechazada.", { port: tcp.dstPort })
      : t("Nada escucha en el puerto TCP {port}: responde RST, conexión rechazada.", { port: tcp.dstPort }));
    reset(device, packet, time);
  }

  function atLayer3(device: Device, arrival: Arrival, event: SimEvent){
    const iface = ifaceOf(device, arrival.iface);
    const frame = arrival.frame;
    if(!iface){ event.result = "dropped"; return; }
    if(frame.dst !== iface.mac && frame.dst !== BROADCAST_MAC){
      event.result = "dropped";
      note(t("La trama no es para este equipo: la descarta."));
      return;
    }
    if(frame.ethertype === "ARP" && frame.arp){
      const message = frame.arp;
      if(message.op === "request"){
        if(!iface.ip || message.targetIp !== iface.ip){
          event.result = "dropped";
          note(t("La pregunta ARP es por {ip}, no por este equipo: la ignora.", { ip: message.targetIp }));
          return;
        }
        event.result = "answered";
        note(t("Es su dirección: responde que {ip} está en {mac}.", { ip: iface.ip, mac: iface.mac }));
        arpTable(device.id).set(message.senderIp, message.senderMac);
        transmit(device, iface.name, {
          src: iface.mac, dst: message.senderMac, ethertype: "ARP",
          arp: { op: "reply", senderMac: iface.mac, senderIp: iface.ip, targetMac: message.senderMac, targetIp: message.senderIp },
        }, arrival.time);
        return;
      }
      event.result = "learned";
      note(t("Aprende que {ip} está en {mac}.", { ip: message.senderIp, mac: message.senderMac }));
      learnArp(device, message.senderIp, message.senderMac, arrival.time);
      return;
    }

    const packet = frame.ip!;
    if(ownsIp(device, packet.dst) || packet.dst === LIMITED_BROADCAST){
      deliver(device, iface, packet, arrival.time, event);
      return;
    }
    if(roleOf(device.type) !== "router"){
      event.result = "dropped";
      note(t("El paquete es para {dst}, no para este equipo: lo descarta.", { dst: packet.dst }));
      return;
    }
    if(packet.ttl <= 1){
      event.result = "dropped";
      note(t("El TTL llega a 0: descarta el paquete y avisa al origen."));
      icmpError(device, iface, "time-exceeded", packet, arrival.time);
      return;
    }
    const forwarded = { ...packet, ttl: packet.ttl - 1 };
    event.result = "forwarded";
    if(!sendIp(device, forwarded, arrival.time)){
      event.result = "dropped";
      icmpError(device, iface, "unreachable", packet, arrival.time);
    }
  }

  function atSwitch(device: Device, arrival: Arrival, event: SimEvent){
    const table = macTables.get(device.id) ?? macTables.set(device.id, new Map()).get(device.id)!;
    const inPort = ifaceOf(device, arrival.iface);
    const vlan = inPort?.vlan ?? 1;
    const frame = arrival.frame;
    if(frame.src !== BROADCAST_MAC) table.set(frame.src, arrival.iface);
    const known = frame.dst === BROADCAST_MAC ? undefined : table.get(frame.dst);
    if(known){
      const outPort = ifaceOf(device, known);
      if(known === arrival.iface){
        event.result = "dropped";
        note(t("{mac} está en el mismo puerto {port}: la descarta.", { mac: frame.dst, port: known }));
        return;
      }
      if((outPort?.vlan ?? 1) !== vlan){
        event.result = "dropped";
        note(t("{mac} está en otra VLAN: la descarta.", { mac: frame.dst }));
        return;
      }
      event.result = "forwarded";
      note(t("Conoce {mac} en {port}: la reenvía por ese puerto.", { mac: frame.dst, port: known }));
      transmit(device, known, frame, arrival.time);
      return;
    }
    const ports = device.interfaces
      .filter(port => port.name !== arrival.iface && (port.vlan ?? 1) === vlan && linkAt(device.id, port.name))
      .map(port => port.name);
    event.result = "flooded";
    const flood = { ports: ports.join(", "), mac: frame.dst, vlan };
    note(!ports.length ? t("No hay otros puertos en su VLAN: la trama termina aquí.")
      : frame.dst === BROADCAST_MAC
        ? (vlan !== 1 ? t("Difusión: la envía por {ports} (VLAN {vlan}).", flood) : t("Difusión: la envía por {ports}.", flood))
        : (vlan !== 1 ? t("No conoce {mac}: la envía por {ports} (VLAN {vlan}).", flood) : t("No conoce {mac}: la envía por {ports}.", flood)));
    ports.forEach(port => transmit(device, port, frame, arrival.time));
  }

  // ---- the commands -----------------------------------------------------

  /** a name to an address, asking the device's DNS server; an address goes as it is */
  function resolve(device: Device, target: string, time: number, then: (ip: string, time: number) => void){
    if(isIp(target)){ then(target, time); return; }
    const server = device.dns;
    if(!server){
      fail(t("{name} es un nombre y {device} no tiene servidor DNS configurado.", { name: target, device: device.name }));
      return;
    }
    const id = events.length + 1;
    const query: IpPacket = {
      src: sourceFor(device, server), dst: server, ttl: 64, protocol: "UDP",
      udp: { srcPort: DNS_CLIENT_PORT, dstPort: PORT.dns, dns: { id, response: false, name: target } },
    };
    if(!originate(device, query, time, t("{device} pregunta a su servidor DNS {server} por {name}.", { device: device.name, server, name: target }))){
      fail(lastNote(t("No se pudo enviar la consulta DNS.")));
      return;
    }
    let done = false;
    client.udp = (packet, at) => {
      const answer = packet.udp?.dns;
      if(done || !answer?.response || answer.id !== id) return;
      done = true;
      if(!answer.answer){
        note(t("{name} no existe para el servidor DNS.", { name: target }));
        print(t("*** {server} no encuentra {name}: Non-existent domain", { server, name: target }));
        fail(t("{name}: el servidor DNS dice que ese nombre no existe.", { name: target }));
        return;
      }
      note(t("Ya sabe que {name} es {ip}.", { name: target, ip: answer.answer }));
      then(answer.answer, at);
    };
    client.icmp = packet => {
      if(done || packet.icmp?.type !== "unreachable" || packet.icmp.original?.protocol !== "UDP") return;
      done = true;
      fail(packet.icmp.code === 3 ? t("{server} no es un servidor DNS: el puerto 53 está cerrado.", { server }) : t("No se llega al servidor DNS {server} (informado por {by}).", { server, by: packet.src }));
    };
    timer(time + TIMEOUT_SECONDS, () => {
      if(done) return;
      done = true;
      fail(timeoutMessage(t("El servidor DNS {server} no respondió.", { server })));
    });
  }

  const resolvedAs = (target: string, ip: string) => (ip === target ? ip : `${target} [${ip}]`);

  function ping(target: string, ttl: number){
    resolve(source!, target, 0, (ip, start) => {
      print(t("Haciendo ping a {target} con 32 bytes de datos:", { target: resolvedAs(target, ip) }));
      if(ownsIp(source!, ip)){
        created(source!, { src: "", dst: "", ethertype: "IPv4", ip: { src: ip, dst: ip, ttl, protocol: "ICMP", icmp: { type: "echo-request", id: ECHO_ID, seq: 1 } } }, start,
          t("{device} hace ping a {target}.", { device: source!.name, target: ip }));
        note(t("Es su propia dirección: responde al instante."));
        print(t("Respuesta desde {ip}: bytes=32 tiempo={rtt}ms TTL={ttl}", { ip, rtt: 0, ttl }));
        outcome = { ok: true, message: t("Respuesta de {ip}: tiempo 0 ms (es el propio equipo).", { ip }), rtt: 0 };
        return;
      }
      const echo: IpPacket = { src: sourceFor(source!, ip), dst: ip, ttl, protocol: "ICMP", icmp: { type: "echo-request", id: ECHO_ID, seq: 1 } };
      if(!originate(source!, echo, start, t("{device} hace ping a {target}.", { device: source!.name, target: resolvedAs(target, ip) }))){
        fail(lastNote(t("No se pudo enviar el paquete.")));
        print(`Error: ${outcome!.message}`);
        return;
      }
      let done = false;
      client.icmp = (packet, at) => {
        const icmp = packet.icmp!;
        if(done || icmp.id !== ECHO_ID) return;
        done = true;
        if(icmp.type === "echo-reply"){
          const rtt = ms(at - start);
          const reply = { ip: packet.src, rtt, ttl: packet.ttl };
          note(t("Respuesta de {ip}: tiempo {rtt} ms, TTL {ttl}.", reply));
          print(t("Respuesta desde {ip}: bytes=32 tiempo={rtt}ms TTL={ttl}", reply));
          outcome = { ok: true, message: t("Respuesta de {ip}: tiempo {rtt} ms, TTL {ttl}.", reply), rtt };
          return;
        }
        const what = icmp.type === "time-exceeded" ? t("Tiempo de vida (TTL) agotado en tránsito") : t("Destino inalcanzable");
        note(t("{what}, informado por {by}.", { what, by: packet.src }));
        print(t("Respuesta desde {ip}: {what}.", { ip: packet.src, what }));
        fail(t("{what} (informado por {by}).", { what, by: packet.src }));
      };
      timer(start + TIMEOUT_SECONDS, () => {
        if(done) return;
        done = true;
        print(t("Tiempo de espera agotado para esta solicitud."));
        fail(timeoutMessage(t("Tiempo agotado: no llegó respuesta de {ip}.", { ip })));
      });
    });
  }

  // like tracert: one echo per hop, with TTL 1, 2, 3… until the destination answers
  function traceroute(target: string, maxHops: number){
    resolve(source!, target, 0, (ip, start) => {
      print(t("Traza a {target} sobre un máximo de {max} saltos:", { target: resolvedAs(target, ip), max: maxHops }));
      let hop = 0;
      let misses = 0;
      let sentAt = start;
      let done = false;
      const end = (result: SimOutcome) => {
        done = true;
        print(result.ok ? t("Traza completa.") : result.message);
        if(!outcome) outcome = result;
      };
      const line = (text: string) => print(`${String(hop).padStart(3)}  ${text}`);
      const probe = (at: number) => {
        hop += 1;
        const thisHop = hop;
        sentAt = at;
        const echo: IpPacket = { src: sourceFor(source!, ip), dst: ip, ttl: thisHop, protocol: "ICMP", icmp: { type: "echo-request", id: TRACE_ID, seq: thisHop } };
        if(!originate(source!, echo, at, t("Sonda {n}: un eco con TTL {n}, para que lo descarte el salto {n}.", { n: thisHop }))){
          end({ ok: false, message: lastNote(t("No se pudo enviar la sonda.")) });
          return;
        }
        timer(at + TIMEOUT_SECONDS, now => {
          if(done || hop !== thisHop) return;
          line(`*        ${t("Tiempo de espera agotado para esta solicitud.")}`);
          misses += 1;
          if(misses >= TRACE_MISSES) end({ ok: false, message: timeoutMessage(t("La traza se detiene: {n} saltos seguidos sin respuesta.", { n: TRACE_MISSES })) });
          else if(thisHop >= maxHops) end({ ok: false, message: t("No se alcanzó {ip} en {max} saltos.", { ip, max: maxHops }) });
          else probe(now);
        });
      };
      client.icmp = (packet, at) => {
        const icmp = packet.icmp!;
        if(done || icmp.id !== TRACE_ID || icmp.seq !== hop) return;
        misses = 0;
        const time = `${ms(at - sentAt)} ms`.padEnd(9);
        if(icmp.type === "time-exceeded"){
          note(t("El salto {n} es {ip}.", { n: hop, ip: `${packet.src}${nameAt(packet.src)}` }));
          line(`${time}${packet.src}${nameAt(packet.src)}`);
          if(hop >= maxHops) end({ ok: false, message: t("No se alcanzó {ip} en {max} saltos.", { ip, max: maxHops }) });
          else probe(at);
          return;
        }
        if(icmp.type === "echo-reply"){
          note(hop === 1 ? t("El destino responde: la traza termina en 1 salto.") : t("El destino responde: la traza termina en {n} saltos.", { n: hop }));
          line(`${time}${packet.src}${nameAt(packet.src)}`);
          end({ ok: true, message: hop === 1 ? t("Traza completa: {ip} está a 1 salto.", { ip }) : t("Traza completa: {ip} está a {n} saltos.", { ip, n: hop }), rtt: ms(at - sentAt) });
          return;
        }
        line(t("{ip} informa: destino inalcanzable.", { ip: `${packet.src}${nameAt(packet.src)}` }));
        end({ ok: false, message: t("Destino inalcanzable en el salto {n} (informado por {by}).", { n: hop, by: packet.src }) });
      };
      probe(start);
    });
  }

  function dhcp(ifaceName: string | undefined){
    const device = source!;
    if(roleOf(device.type) !== "host"){
      fail(t("{device} no es un equipo final: no pide dirección por DHCP.", { device: device.name }));
      return;
    }
    const iface = (ifaceName && ifaceOf(device, ifaceName))
      || device.interfaces.find(item => item.dhcp)
      || device.interfaces.find(item => linkAt(device.id, item.name))
      || device.interfaces[0];
    if(!iface){
      fail(t("{device} no tiene interfaces.", { device: device.name }));
      return;
    }
    // it starts from nothing: the address it had is given up
    delete iface.ip;
    delete iface.prefix;
    print(t("Configuración IP de {iface}: pidiendo una dirección por DHCP…", { iface: iface.name }));
    let state: "selecting" | "requesting" | "bound" = "selecting";
    const message = (op: "discover" | "request", extra: Partial<DhcpMessage> = {}): DhcpMessage =>
      ({ op, xid: DHCP_XID, clientMac: iface.mac, ciaddr: NO_ADDRESS, yiaddr: NO_ADDRESS, giaddr: NO_ADDRESS, ...extra });
    created(device, {
      src: iface.mac, dst: BROADCAST_MAC, ethertype: "IPv4",
      ip: { src: NO_ADDRESS, dst: LIMITED_BROADCAST, ttl: 64, protocol: "UDP", udp: { srcPort: PORT.dhcpClient, dstPort: PORT.dhcpServer, dhcp: message("discover") } },
    }, 0, t("{device} no tiene dirección en {iface}: busca un servidor DHCP con una difusión (Discover).", { device: device.name, iface: iface.name }));
    if(!dhcpBroadcast(device, iface, message("discover"), 0, [PORT.dhcpClient, PORT.dhcpServer])){
      fail(lastNote(t("No se pudo enviar el Discover.")));
      return;
    }
    client.udp = (packet, at) => {
      const answer = packet.udp?.dhcp;
      if(!answer || answer.xid !== DHCP_XID) return;
      if(state === "selecting" && answer.op === "offer"){
        state = "requesting";
        note(t("Acepta la oferta de {server}: pide {ip} (Request, también por difusión).", { server: answer.serverId ?? "", ip: answer.yiaddr }));
        dhcpBroadcast(device, iface, message("request", { requested: answer.yiaddr, serverId: answer.serverId }), at, [PORT.dhcpClient, PORT.dhcpServer]);
        return;
      }
      if(state === "requesting" && answer.op === "ack"){
        state = "bound";
        iface.ip = answer.yiaddr;
        iface.prefix = answer.prefix ?? 24;
        iface.dhcp = true;
        note(t("Se configura con {ip}/{prefix}, puerta de enlace {gateway}, DNS {dns}.", { ip: answer.yiaddr, prefix: iface.prefix, gateway: answer.router ?? t("(ninguna)"), dns: answer.dns ?? t("(ninguno)") }));
        lease = { device: device.id, iface: iface.name, ip: answer.yiaddr, prefix: iface.prefix, ...(answer.router ? { gateway: answer.router } : {}), ...(answer.dns ? { dns: answer.dns } : {}) };
        const field = (label: string, value: string) => print(`   ${(label + " ").padEnd(29, ". ")}: ${value}`);
        field(t("Dirección IPv4"), answer.yiaddr);
        field(t("Prefijo de red"), `/${iface.prefix}`);
        field(t("Puerta de enlace"), answer.router ?? t("(ninguna)"));
        field(t("Servidor DNS"), answer.dns ?? t("(ninguno)"));
        field(t("Servidor DHCP"), answer.serverId ?? "");
        outcome = { ok: true, message: t("{device} obtuvo {ip}/{prefix} del servidor DHCP {server}.", { device: device.name, ip: answer.yiaddr, prefix: iface.prefix, server: answer.serverId ?? "" }) };
        return;
      }
      if(state === "requesting" && answer.op === "nak"){
        note(t("El servidor rechaza la petición (NAK)."));
        fail(t("El servidor DHCP {server} rechazó la petición (NAK).", { server: answer.serverId ?? "" }));
        return;
      }
      note(answer.op === "offer" ? t("Otra oferta: ya eligió una, la ignora.") : t("Respuesta DHCP que no esperaba: la ignora."));
    };
    timer(TIMEOUT_SECONDS, () => {
      if(state === "bound") return;
      const message = state === "selecting" ? t("Ningún servidor DHCP respondió al Discover.") : t("El servidor DHCP no confirmó la dirección.");
      print(message);
      fail(message);
    });
  }

  function lookup(name: string){
    if(isIp(name as unknown)){
      fail(t("{name} ya es una dirección: escribe un nombre (ej. www.ejemplo.com).", { name }));
      return;
    }
    const server = source!.dns;
    print(`${t("Servidor:").padEnd(10)} ${server ? `${server}${nameAt(server)}` : t("(ninguno)")}`);
    resolve(source!, name.toLowerCase(), 0, (ip, at) => {
      print(`${t("Nombre:").padEnd(10)} ${name}`);
      print(`${t("Dirección:").padEnd(10)} ${ip}`);
      outcome = { ok: true, message: t("{name} es {ip} (según {server}).", { name, ip, server: server ?? "" }), rtt: ms(at) };
    });
  }

  function web(target: string){
    const [host, ...rest] = target.replace(/^https?:\/\//i, "").split("/");
    const path = `/${rest.join("/")}`;
    resolve(source!, host.toLowerCase(), 0, (ip, start) => {
      print(`GET http://${host}${path}`);
      const device = source!;
      const from = sourceFor(device, ip);
      let seq = 0;
      let ack = 0;
      let state: "connecting" | "waiting" | "closing" = "connecting";
      let response: TcpSegment["http"];
      let done = false;
      const segment = (flags: TcpFlag[], extra: Partial<TcpSegment> = {}): IpPacket => ({
        src: from, dst: ip, ttl: 64, protocol: "TCP",
        tcp: { srcPort: TCP_CLIENT_PORT, dstPort: PORT.http, seq, ack, flags, length: 0, ...extra },
      });
      if(!originate(device, segment(["SYN"]), start, t("{device} abre una conexión TCP con {ip}, puerto 80 (SYN).", { device: device.name, ip }))){
        fail(lastNote(t("No se pudo abrir la conexión.")));
        return;
      }
      seq = 1;
      client.tcp = (packet, at) => {
        const tcp = packet.tcp!;
        if(done) return;
        if(tcp.flags.includes("RST")){
          done = true;
          note(t("La conexión es rechazada (RST)."));
          print(t("Error: conexión rechazada."));
          fail(t("Conexión rechazada: {ip} no tiene un servidor web en el puerto 80.", { ip }));
          return;
        }
        if(state === "connecting" && tcp.flags.includes("SYN") && tcp.flags.includes("ACK")){
          ack = tcp.seq + 1;
          state = "waiting";
          note(t("Conexión aceptada: confirma con ACK y envía la petición HTTP."));
          sendIp(device, segment(["ACK"]), at);
          const request = `GET ${path} HTTP/1.1\r\nHost: ${host}\r\n\r\n`;
          sendIp(device, segment(["PSH", "ACK"], { length: request.length, http: { method: "GET", path, host } }), at);
          seq += request.length;
          return;
        }
        if(state === "waiting" && tcp.http?.status){
          response = tcp.http;
          ack = tcp.seq + tcp.length;
          state = "closing";
          note(t("Recibe {status} {reason}: confirma y cierra la conexión (FIN).", { status: response.status ?? 0, reason: response.reason ?? "" }));
          print(`HTTP/1.1 ${response.status} ${response.reason} · ${response.bytes} bytes`);
          sendIp(device, segment(["ACK"]), at);
          sendIp(device, segment(["FIN", "ACK"]), at);
          seq += 1;
          return;
        }
        if(state === "closing" && tcp.flags.includes("FIN")){
          done = true;
          ack = tcp.seq + 1;
          note(t("El servidor también cierra: último ACK."));
          sendIp(device, segment(["ACK"]), at);
          const ok = (response?.status ?? 500) < 400;
          const time = ms(at - start);
          print(t("Conexión cerrada en {time} ms.", { time }));
          settled = {
            ok, rtt: time,
            message: ok
              ? t("{host} respondió {status} {reason}: {bytes} bytes en {time} ms.", { host, status: response!.status ?? 0, reason: response!.reason ?? "", bytes: response!.bytes ?? 0, time })
              : t("{host} respondió {status} {reason}: no tiene {path}.", { host, status: response?.status ?? 0, reason: response?.reason ?? "", path }),
          };
        }
      };
      client.icmp = packet => {
        if(done || packet.icmp?.type !== "unreachable") return;
        done = true;
        fail(t("{what} (informado por {by}).", { what: t("Destino inalcanzable"), by: packet.src }));
      };
      timer(start + TIMEOUT_SECONDS * 2, () => {
        if(done) return;
        done = true;
        print(t("Tiempo de espera agotado."));
        fail(timeoutMessage(t("Tiempo agotado: {host} no respondió.", { host })));
      });
    });
  }

  if(roleOf(source.type) === "switch"){
    fail(request.kind === "dhcp" ? t("{device} es un switch: no tiene dirección para pedir una.", { device: source.name }) : t("{device} es un switch: no tiene dirección para enviar paquetes.", { device: source.name }));
  }else if(request.kind !== "dhcp" && !addressed(source).length){
    fail(source.interfaces.some(iface => iface.dhcp)
      ? t("{device} no tiene ninguna interfaz con dirección IP: pide una por DHCP primero.", { device: source.name })
      : t("{device} no tiene ninguna interfaz con dirección IP.", { device: source.name }));
  }else{
    switch(request.kind){
      case "ping": ping(request.to, request.ttl ?? 64); break;
      case "traceroute": traceroute(request.to, request.maxHops ?? 30); break;
      case "dhcp": dhcp(request.iface); break;
      case "dns": lookup(request.to); break;
      case "http": web(request.to); break;
    }
  }

  while(queue.length && events.length < MAX_EVENTS && !outcome){
    if(settled && !queue.some(item => item.kind === "frame")){
      outcome = settled;
      break;
    }
    queue.sort((p, q) => p.time - q.time);
    const next = queue.shift()!;
    if(next.kind === "timer"){
      current = null;
      next.fire(next.time);
      continue;
    }
    const device = devices.get(next.device);
    if(!device) continue;
    current = {
      index: events.length,
      time: Math.round(next.time * 1e6) / 1e6,
      from: next.from,
      to: next.device,
      link: next.link,
      inInterface: next.iface,
      protocol: protocolOf(next.frame),
      summary: summarize(next.frame, t),
      frame: next.frame,
      result: "forwarded",
      notes: [],
    };
    events.push(current);
    if(roleOf(device.type) === "switch") atSwitch(device, next, current);
    else atLayer3(device, next, current);
  }

  if(!outcome && settled) outcome = settled;
  if(!outcome){
    if(events.length >= MAX_EVENTS) fail(t("La simulación se detuvo: demasiados eventos (¿un bucle en la red?)."));
    else fail(timeoutMessage(t("Tiempo agotado: no llegó ninguna respuesta.")));
  }
  return finish();
}

/** One ping: kept for the canvas tool and the tests. */
export function simulatePing(topology: Topology, request: { from: string; to: string; ttl?: number }, t: T = spanish): SimRun {
  return simulate(topology, { kind: "ping", ...request }, t);
}

/** The first address of a device: what a ping to it targets. */
export function addressOf(device: Device | undefined): string | null {
  return device?.interfaces.find(iface => iface.ip)?.ip ?? null;
}

/** The topology with the address a DHCP client obtained. */
export function applyLease(topology: Topology, lease: Lease): Topology {
  return {
    ...topology,
    devices: topology.devices.map(device => device.id !== lease.device ? device : {
      ...device,
      gateway: lease.gateway,
      dns: lease.dns,
      interfaces: device.interfaces.map(iface => iface.name !== lease.iface ? iface : { ...iface, ip: lease.ip, prefix: lease.prefix, dhcp: true }),
    }),
  };
}
