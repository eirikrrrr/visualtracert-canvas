// Packet simulator: a discrete-event run of one ping over a topology. It
// returns every hop as an event (which frame arrived where, at what time, and
// what that device did with it), so the interface can replay it step by step
// and inspect each frame. Pure: no DOM, no React, no clock.
//
// Modelled: Ethernet with MAC learning switches and access VLANs, ARP, IPv4
// with TTL, ICMP echo / reply / time exceeded / unreachable, end devices with
// a default gateway, routers with connected and static routes (longest prefix).
import { roleOf } from "../model/catalog";
import { BROADCAST_MAC, inCidr, parseCidr, sameSubnet } from "../model/net";
import type { Device, Interface, Link, Topology } from "../model/types";

export type Protocol = "ARP" | "ICMP";

export interface ArpPayload {
  op: "request" | "reply";
  senderMac: string;
  senderIp: string;
  targetMac: string;
  targetIp: string;
}

export type IcmpType = "echo-request" | "echo-reply" | "time-exceeded" | "unreachable";

export interface IpPacket {
  src: string;
  dst: string;
  ttl: number;
  protocol: "ICMP";
  icmp: { type: IcmpType; id: number; seq: number };
}

export interface Frame {
  src: string;
  dst: string;
  ethertype: "ARP" | "IPv4";
  arp?: ArpPayload;
  ip?: IpPacket;
}

export type EventResult = "created" | "forwarded" | "flooded" | "answered" | "learned" | "delivered" | "dropped";

export interface SimEvent {
  index: number;
  /** seconds since the ping started */
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

export interface SimRun {
  events: SimEvent[];
  outcome: SimOutcome;
}

export interface PingRequest {
  from: string;
  to: string;
  ttl?: number;
}

/** time a frame takes across a link, in seconds */
export const HOP_SECONDS = 0.001;
const MAX_EVENTS = 500;
const ECHO_ID = 1;

interface Arrival {
  time: number;
  device: string;
  iface: string;
  frame: Frame;
  from: string;
  link: string;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function summarize(frame: Frame): { protocol: Protocol; summary: string } {
  if(frame.ethertype === "ARP" && frame.arp){
    return frame.arp.op === "request"
      ? { protocol: "ARP", summary: `¿Quién tiene ${frame.arp.targetIp}? Responder a ${frame.arp.senderIp}` }
      : { protocol: "ARP", summary: `${frame.arp.senderIp} está en ${frame.arp.senderMac}` };
  }
  const ip = frame.ip!;
  const names: Record<IcmpType, string> = {
    "echo-request": "Eco (ping)",
    "echo-reply": "Respuesta de eco",
    "time-exceeded": "Tiempo excedido",
    "unreachable": "Destino inalcanzable",
  };
  return { protocol: "ICMP", summary: `${names[ip.icmp.type]} ${ip.src} → ${ip.dst} · TTL ${ip.ttl}` };
}

export function simulatePing(topology: Topology, request: PingRequest): SimRun {
  const devices = new Map(topology.devices.map(device => [device.id, device]));
  const events: SimEvent[] = [];
  const queue: Arrival[] = [];
  const arp = new Map<string, Map<string, string>>();
  const macTables = new Map<string, Map<string, string>>();
  // packets waiting for an ARP answer, by device and next hop
  const pending = new Map<string, Map<string, { iface: string; packet: IpPacket }[]>>();
  let outcome: SimOutcome | null = null;
  let current: SimEvent | null = null;
  const note = (text: string) => current?.notes.push(text);

  const source = devices.get(request.from);
  if(!source) return { events, outcome: { ok: false, message: "El equipo de origen no existe." } };
  const nameOf = (id: string) => devices.get(id)?.name ?? id;

  const linkAt = (device: string, iface: string): Link | undefined =>
    topology.links.find(link =>
      (link.a.device === device && link.a.interface === iface) ||
      (link.b.device === device && link.b.interface === iface));

  const ifaceOf = (device: Device, name: string) => device.interfaces.find(iface => iface.name === name);
  const addressed = (device: Device) => device.interfaces.filter(iface => iface.ip && iface.prefix);
  const ownsIp = (device: Device, ip: string) => device.interfaces.some(iface => iface.ip === ip);
  const arpTable = (id: string) => arp.get(id) ?? arp.set(id, new Map()).get(id)!;

  function transmit(device: Device, ifaceName: string, frame: Frame, time: number): boolean {
    const link = linkAt(device.id, ifaceName);
    if(!link){
      note(`${ifaceName} no tiene cable: la trama no sale.`);
      return false;
    }
    const peer = link.a.device === device.id && link.a.interface === ifaceName ? link.b : link.a;
    queue.push({ time: time + HOP_SECONDS, device: peer.device, iface: peer.interface, frame: clone(frame), from: device.id, link: link.id });
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
      return { error: matches.length ? `El siguiente salto de la ruta hacia ${dst} no está en ninguna red conectada.` : `Sin ruta hacia ${dst}.` };
    }
    if(!device.gateway) return { error: `${dst} no está en la red local y ${device.name} no tiene puerta de enlace.` };
    const egress = addressed(device).find(iface => sameSubnet(iface.ip!, device.gateway!, iface.prefix!));
    if(!egress) return { error: `La puerta de enlace ${device.gateway} no está en la red de ninguna interfaz.` };
    return { iface: egress, hop: device.gateway };
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
      note(`Envía por ${iface.name} hacia ${hop}${hop === packet.dst ? "" : " (siguiente salto)"}.`);
      return transmit(device, iface.name, { src: iface.mac, dst: known, ethertype: "IPv4", ip: packet }, time);
    }
    const waiting = pending.get(device.id) ?? pending.set(device.id, new Map()).get(device.id)!;
    const queued = waiting.get(hop);
    if(queued){
      queued.push({ iface: iface.name, packet });
      return true;
    }
    waiting.set(hop, [{ iface: iface.name, packet }]);
    note(`No conoce la MAC de ${hop}: pregunta por ARP en ${iface.name}.`);
    return transmit(device, iface.name, {
      src: iface.mac, dst: BROADCAST_MAC, ethertype: "ARP",
      arp: { op: "request", senderMac: iface.mac, senderIp: iface.ip!, targetMac: "00:00:00:00:00:00", targetIp: hop },
    }, time);
  }

  function learnArp(device: Device, ip: string, mac: string, time: number){
    arpTable(device.id).set(ip, mac);
    const waiting = pending.get(device.id)?.get(ip);
    if(!waiting) return;
    pending.get(device.id)!.delete(ip);
    waiting.forEach(({ iface, packet }) => {
      const out = ifaceOf(device, iface)!;
      note(`Envía el paquete que esperaba por ${iface}.`);
      transmit(device, iface, { src: out.mac, dst: mac, ethertype: "IPv4", ip: packet }, time);
    });
  }

  function fail(message: string){
    if(!outcome) outcome = { ok: false, message };
  }

  // ICMP error back to the sender of a packet
  function icmpError(device: Device, type: IcmpType, about: IpPacket, time: number){
    const from = addressed(device)[0];
    if(!from || about.icmp.type !== "echo-request") return;
    sendIp(device, { src: from.ip!, dst: about.src, ttl: 64, protocol: "ICMP", icmp: { type, id: about.icmp.id, seq: about.icmp.seq } }, time);
  }

  function atLayer3(device: Device, arrival: Arrival, event: SimEvent){
    const iface = ifaceOf(device, arrival.iface);
    const frame = arrival.frame;
    if(!iface){ event.result = "dropped"; return; }
    if(frame.dst !== iface.mac && frame.dst !== BROADCAST_MAC){
      event.result = "dropped";
      note("La trama no es para este equipo: la descarta.");
      return;
    }
    if(frame.ethertype === "ARP" && frame.arp){
      const message = frame.arp;
      if(message.op === "request"){
        if(message.targetIp !== iface.ip){
          event.result = "dropped";
          note(`La pregunta ARP es por ${message.targetIp}, no por este equipo: la ignora.`);
          return;
        }
        event.result = "answered";
        note(`Es su dirección: responde que ${iface.ip} está en ${iface.mac}.`);
        arpTable(device.id).set(message.senderIp, message.senderMac);
        transmit(device, iface.name, {
          src: iface.mac, dst: message.senderMac, ethertype: "ARP",
          arp: { op: "reply", senderMac: iface.mac, senderIp: iface.ip!, targetMac: message.senderMac, targetIp: message.senderIp },
        }, arrival.time);
        return;
      }
      event.result = "learned";
      note(`Aprende que ${message.senderIp} está en ${message.senderMac}.`);
      learnArp(device, message.senderIp, message.senderMac, arrival.time);
      return;
    }

    const packet = frame.ip!;
    if(ownsIp(device, packet.dst)){
      const { type } = packet.icmp;
      if(type === "echo-request"){
        event.result = "answered";
        note(`El eco es para ${packet.dst}: responde a ${packet.src}.`);
        sendIp(device, { src: packet.dst, dst: packet.src, ttl: 64, protocol: "ICMP", icmp: { type: "echo-reply", id: packet.icmp.id, seq: packet.icmp.seq } }, arrival.time);
        return;
      }
      event.result = "delivered";
      if(device.id === request.from && packet.icmp.id === ECHO_ID){
        if(type === "echo-reply"){
          const rtt = Math.round(arrival.time * 1000 * 1000) / 1000;
          note(`Respuesta de ${packet.src}: tiempo ${rtt} ms, TTL ${packet.ttl}.`);
          if(!outcome) outcome = { ok: true, message: `Respuesta de ${packet.src}: tiempo ${rtt} ms, TTL ${packet.ttl}.`, rtt };
        }else{
          const what = type === "time-exceeded" ? "Tiempo de vida (TTL) agotado en tránsito" : "Destino inalcanzable";
          note(`${what}, informado por ${packet.src}.`);
          fail(`${what} (informado por ${packet.src}).`);
        }
      }
      return;
    }

    if(roleOf(device.type) !== "router"){
      event.result = "dropped";
      note(`El paquete es para ${packet.dst}, no para este equipo: lo descarta.`);
      return;
    }
    if(packet.ttl <= 1){
      event.result = "dropped";
      note("El TTL llega a 0: descarta el paquete y avisa al origen.");
      icmpError(device, "time-exceeded", packet, arrival.time);
      return;
    }
    const forwarded = { ...packet, ttl: packet.ttl - 1 };
    event.result = "forwarded";
    if(!sendIp(device, forwarded, arrival.time)){
      event.result = "dropped";
      icmpError(device, "unreachable", packet, arrival.time);
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
        note(`${frame.dst} está en el mismo puerto ${known}: la descarta.`);
        return;
      }
      if((outPort?.vlan ?? 1) !== vlan){
        event.result = "dropped";
        note(`${frame.dst} está en otra VLAN: la descarta.`);
        return;
      }
      event.result = "forwarded";
      note(`Conoce ${frame.dst} en ${known}: la reenvía por ese puerto.`);
      transmit(device, known, frame, arrival.time);
      return;
    }
    const ports = device.interfaces
      .filter(port => port.name !== arrival.iface && (port.vlan ?? 1) === vlan && linkAt(device.id, port.name))
      .map(port => port.name);
    event.result = "flooded";
    note(ports.length
      ? `${frame.dst === BROADCAST_MAC ? "Difusión" : `No conoce ${frame.dst}`}: la envía por ${ports.join(", ")}${vlan !== 1 ? ` (VLAN ${vlan})` : ""}.`
      : "No hay otros puertos en su VLAN: la trama termina aquí.");
    ports.forEach(port => transmit(device, port, frame, arrival.time));
  }

  // the ping itself
  const target = request.to;
  const origin = addressed(source)[0];
  const echo: IpPacket = {
    src: origin?.ip ?? "0.0.0.0", dst: target, ttl: request.ttl ?? 64, protocol: "ICMP",
    icmp: { type: "echo-request", id: ECHO_ID, seq: 1 },
  };
  current = {
    index: 0, time: 0, from: null, to: source.id, link: null, inInterface: null,
    ...summarize({ src: origin?.mac ?? "", dst: "", ethertype: "IPv4", ip: echo }),
    frame: { src: origin?.mac ?? "", dst: "", ethertype: "IPv4", ip: clone(echo) },
    result: "created", notes: [`${source.name} hace ping a ${target}.`],
  };
  events.push(current);
  if(roleOf(source.type) === "switch") fail(`${source.name} es un switch: no tiene dirección para hacer ping.`);
  else if(!origin) fail(`${source.name} no tiene ninguna interfaz con dirección IP.`);
  else if(ownsIp(source, target)){
    note("Es su propia dirección: responde al instante.");
    outcome = { ok: true, message: `Respuesta de ${target}: tiempo 0 ms (es el propio equipo).`, rtt: 0 };
  }else if(!sendIp(source, echo, 0)){
    fail(current.notes[current.notes.length - 1] ?? "No se pudo enviar el paquete.");
  }

  while(queue.length && events.length < MAX_EVENTS && !outcome){
    queue.sort((p, q) => p.time - q.time);
    const arrival = queue.shift()!;
    const device = devices.get(arrival.device);
    if(!device) continue;
    current = {
      index: events.length,
      time: Math.round(arrival.time * 1e6) / 1e6,
      from: arrival.from,
      to: arrival.device,
      link: arrival.link,
      inInterface: arrival.iface,
      ...summarize(arrival.frame),
      frame: arrival.frame,
      result: "forwarded",
      notes: [],
    };
    events.push(current);
    if(roleOf(device.type) === "switch") atSwitch(device, arrival, current);
    else atLayer3(device, arrival, current);
  }

  if(!outcome){
    const waitingFor = [...pending.entries()].flatMap(([id, hops]) => [...hops.keys()].map(hop => ({ id, hop })));
    if(events.length >= MAX_EVENTS) fail("La simulación se detuvo: demasiados eventos (¿un bucle en la red?).");
    else if(waitingFor.length) fail(`Nadie respondió al ARP de ${nameOf(waitingFor[0].id)} por ${waitingFor[0].hop}.`);
    else fail(`Tiempo agotado: no llegó respuesta de ${target}.`);
  }
  return { events, outcome: outcome! };
}

/** The first address of a device: what a ping to it targets. */
export function addressOf(device: Device | undefined): string | null {
  return device?.interfaces.find(iface => iface.ip)?.ip ?? null;
}
