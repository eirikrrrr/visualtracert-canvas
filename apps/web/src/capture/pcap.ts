// A capture as it comes from the emulator (pcap, read as it arrives) and
// each packet decoded in the page: Ethernet (and 802.1Q), ARP, IPv4, IPv6,
// ICMP, UDP, TCP, DNS, DHCP and the first line of HTTP. What each packet is
// summarised in the terms Wireshark uses, so they read the same as there;
// the names of the fields are translated where they are shown.
import { tx } from "../i18n";

export interface Layer {
  name: string;
  fields: [string, string][];
}

export interface Packet {
  index: number;
  /** seconds since the first packet */
  time: number;
  length: number;
  src: string;
  dst: string;
  protocol: string;
  info: string;
  layers: Layer[];
  bytes: Uint8Array;
}

const LINKTYPE_ETHERNET = 1;
const LINKTYPE_LINUX_SLL = 113;

const hex = (value: number, width = 2) => value.toString(16).padStart(width, "0");
const mac = (b: Uint8Array, at: number) => Array.from(b.subarray(at, at + 6), byte => hex(byte)).join(":");
const ipv4 = (b: Uint8Array, at: number) => Array.from(b.subarray(at, at + 4)).join(".");
function ipv6(b: Uint8Array, at: number) {
  const groups = Array.from({ length: 8 }, (_, i) => ((b[at + 2 * i] << 8) | b[at + 2 * i + 1]).toString(16));
  // the longest run of zeros, as ::
  let best = [-1, 0], run = [-1, 0];
  groups.forEach((group, i) => {
    if(group === "0"){ run = run[0] < 0 ? [i, 1] : [run[0], run[1] + 1]; if(run[1] > best[1]) best = [...run]; }
    else run = [-1, 0];
  });
  if(best[1] < 2) return groups.join(":");
  return `${groups.slice(0, best[0]).join(":")}::${groups.slice(best[0] + best[1]).join(":")}`;
}

/** Reads a pcap stream as it arrives: feed it bytes, it gives the packets complete so far. */
export class PcapReader {
  private buffer = new Uint8Array(0);
  private little = true;
  private nano = false;
  private linktype = LINKTYPE_ETHERNET;
  private started = false;
  private first: number | null = null;
  private count = 0;

  push(chunk: Uint8Array): Packet[] {
    const joined = new Uint8Array(this.buffer.length + chunk.length);
    joined.set(this.buffer);
    joined.set(chunk, this.buffer.length);
    this.buffer = joined;
    const out: Packet[] = [];
    let at = 0;
    const view = new DataView(joined.buffer, joined.byteOffset, joined.byteLength);
    if(!this.started){
      if(joined.length < 24) return out;
      const magic = view.getUint32(0, true);
      if(magic === 0xa1b2c3d4 || magic === 0xa1b23c4d) this.little = true;
      else if(magic === 0xd4c3b2a1 || magic === 0x4d3cb2a1) this.little = false;
      else throw new Error("not pcap");
      this.nano = magic === 0xa1b23c4d || magic === 0x4d3cb2a1;
      this.linktype = view.getUint32(20, this.little);
      this.started = true;
      at = 24;
    }
    while(at + 16 <= joined.length){
      const seconds = view.getUint32(at, this.little), fraction = view.getUint32(at + 4, this.little);
      const captured = view.getUint32(at + 8, this.little), length = view.getUint32(at + 12, this.little);
      if(at + 16 + captured > joined.length) break;
      const bytes = joined.slice(at + 16, at + 16 + captured);
      const time = seconds + fraction / (this.nano ? 1e9 : 1e6);
      if(this.first === null) this.first = time;
      out.push(decode(bytes, ++this.count, time - this.first, length, this.linktype));
      at += 16 + captured;
    }
    this.buffer = joined.slice(at);
    return out;
  }
}

function decode(bytes: Uint8Array, index: number, time: number, length: number, linktype: number): Packet {
  const packet: Packet = { index, time, length, src: "", dst: "", protocol: "?", info: "", layers: [], bytes };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try{
    let at: number, type: number;
    if(linktype === LINKTYPE_LINUX_SLL){
      // the "any" pseudo-interface: no Ethernet header, its own
      type = view.getUint16(14);
      packet.layers.push({ name: "Linux cooked capture", fields: [[tx("Tipo"), `0x${hex(type, 4)}`]] });
      at = 16;
    }else{
      packet.src = mac(bytes, 6);
      packet.dst = mac(bytes, 0);
      type = view.getUint16(12);
      at = 14;
      const fields: [string, string][] = [[tx("Destino"), packet.dst], [tx("Origen"), packet.src]];
      // 802.1Q: a VLAN tag before the type
      while(type === 0x8100 && at + 4 <= bytes.length){
        const tag = view.getUint16(at);
        fields.push([tx("VLAN"), String(tag & 0x0fff)]);
        type = view.getUint16(at + 2);
        at += 4;
      }
      fields.push([tx("Tipo"), `0x${hex(type, 4)}`]);
      packet.layers.push({ name: "Ethernet II", fields });
      packet.protocol = "Ethernet";
    }
    if(type === 0x0806) arp(packet, bytes, view, at);
    else if(type === 0x0800) ip4(packet, bytes, view, at);
    else if(type === 0x86dd) ip6(packet, bytes, view, at);
    else if(type === 0x88cc){ packet.protocol = "LLDP"; packet.info = "LLDP"; }
    else packet.info = `EtherType 0x${hex(type, 4)}`;
  }catch(_){
    packet.info ||= "[Malformed Packet]";
  }
  return packet;
}

function arp(packet: Packet, b: Uint8Array, v: DataView, at: number) {
  const op = v.getUint16(at + 6);
  const sha = mac(b, at + 8), spa = ipv4(b, at + 14), tpa = ipv4(b, at + 24);
  packet.protocol = "ARP";
  packet.info = op === 1 ? `Who has ${tpa}? Tell ${spa}` : op === 2 ? `${spa} is at ${sha}` : `ARP op ${op}`;
  packet.layers.push({ name: "Address Resolution Protocol", fields: [[tx("Operación"), op === 1 ? "request (1)" : op === 2 ? "reply (2)" : String(op)], [tx("MAC origen"), sha], [tx("IP origen"), spa], [tx("MAC destino"), mac(b, at + 18)], [tx("IP destino"), tpa]] });
}

const ICMP_TYPES: Record<number, string> = { 0: "Echo (ping) reply", 3: "Destination unreachable", 5: "Redirect", 8: "Echo (ping) request", 11: "Time-to-live exceeded" };
const UNREACHABLE: Record<number, string> = { 0: "Network unreachable", 1: "Host unreachable", 3: "Port unreachable", 4: "Fragmentation needed" };

function ip4(packet: Packet, b: Uint8Array, v: DataView, at: number) {
  const header = (b[at] & 0x0f) * 4;
  const total = v.getUint16(at + 2), ttl = b[at + 8], proto = b[at + 9];
  packet.src = ipv4(b, at + 12);
  packet.dst = ipv4(b, at + 16);
  packet.protocol = "IPv4";
  packet.layers.push({ name: "Internet Protocol Version 4", fields: [[tx("Origen"), packet.src], [tx("Destino"), packet.dst], [tx("TTL"), String(ttl)], [tx("Protocolo"), String(proto)], [tx("Longitud"), String(total)], [tx("Id"), `0x${hex(v.getUint16(at + 4), 4)}`]] });
  transport(packet, b, v, at + header, proto, ttl);
}

function ip6(packet: Packet, b: Uint8Array, v: DataView, at: number) {
  const next = b[at + 6], hops = b[at + 7];
  packet.src = ipv6(b, at + 8);
  packet.dst = ipv6(b, at + 24);
  packet.protocol = "IPv6";
  packet.layers.push({ name: "Internet Protocol Version 6", fields: [[tx("Origen"), packet.src], [tx("Destino"), packet.dst], [tx("Hop limit"), String(hops)], [tx("Siguiente cabecera"), String(next)]] });
  transport(packet, b, v, at + 40, next, hops);
}

function transport(packet: Packet, b: Uint8Array, v: DataView, at: number, proto: number, ttl: number) {
  if(proto === 1 || proto === 58){
    const type = b[at], code = b[at + 1];
    packet.protocol = proto === 1 ? "ICMP" : "ICMPv6";
    const name = proto === 1 ? ICMP_TYPES[type] : ({ 128: "Echo (ping) request", 129: "Echo (ping) reply", 133: "Router Solicitation", 134: "Router Advertisement", 135: "Neighbor Solicitation", 136: "Neighbor Advertisement" } as Record<number, string>)[type];
    const echo = (proto === 1 && (type === 0 || type === 8)) || (proto === 58 && (type === 128 || type === 129));
    packet.info = (name ?? `Type ${type}`) + (proto === 1 && type === 3 ? ` (${UNREACHABLE[code] ?? `code ${code}`})` : "")
      + (echo ? `  id=0x${hex(v.getUint16(at + 4), 4)}, seq=${v.getUint16(at + 6)}, ttl=${ttl}` : "");
    packet.layers.push({ name: proto === 1 ? "Internet Control Message Protocol" : "ICMPv6", fields: [[tx("Tipo"), `${type}${name ? ` (${name})` : ""}`], [tx("Código"), String(code)]] });
    return;
  }
  if(proto === 17){
    const sport = v.getUint16(at), dport = v.getUint16(at + 2), size = v.getUint16(at + 4);
    packet.protocol = "UDP";
    packet.info = `${sport} → ${dport}  Len=${size - 8}`;
    packet.layers.push({ name: "User Datagram Protocol", fields: [[tx("Puerto origen"), String(sport)], [tx("Puerto destino"), String(dport)], [tx("Longitud"), String(size)]] });
    const payload = at + 8;
    if(sport === 53 || dport === 53) dns(packet, b, v, payload);
    else if([67, 68].includes(sport) && [67, 68].includes(dport)) dhcp(packet, b, payload);
    return;
  }
  if(proto === 6){
    const sport = v.getUint16(at), dport = v.getUint16(at + 2);
    const seq = v.getUint32(at + 4), ack = v.getUint32(at + 8);
    const offset = (b[at + 12] >> 4) * 4, flags = b[at + 13], window = v.getUint16(at + 14);
    const names = [[0x02, "SYN"], [0x10, "ACK"], [0x01, "FIN"], [0x04, "RST"], [0x08, "PSH"], [0x20, "URG"]].filter(([bit]) => flags & (bit as number)).map(([, name]) => name);
    packet.protocol = "TCP";
    packet.info = `${sport} → ${dport} [${names.join(", ")}] Seq=${seq}${flags & 0x10 ? ` Ack=${ack}` : ""} Win=${window}`;
    packet.layers.push({ name: "Transmission Control Protocol", fields: [[tx("Puerto origen"), String(sport)], [tx("Puerto destino"), String(dport)], [tx("Seq"), String(seq)], [tx("Ack"), String(ack)], [tx("Flags"), names.join(", ")], [tx("Ventana"), String(window)]] });
    const payload = b.subarray(at + offset);
    if(payload.length && (sport === 80 || dport === 80 || sport === 8080 || dport === 8080)){
      const line = new TextDecoder().decode(payload.subarray(0, 200)).split("\r\n")[0];
      if(/^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH) |^HTTP\/1/.test(line)){
        packet.protocol = "HTTP";
        packet.info = line;
        packet.layers.push({ name: "Hypertext Transfer Protocol", fields: [[tx("Línea"), line]] });
      }
    }
    return;
  }
  packet.info = `IP protocol ${proto}`;
}

function dnsName(b: Uint8Array, at: number, depth = 0): [string, number] {
  const labels: string[] = [];
  let next = -1;
  while(at < b.length && depth < 10){
    const size = b[at];
    if(size === 0){ at += 1; break; }
    if((size & 0xc0) === 0xc0){
      if(next < 0) next = at + 2;
      at = ((size & 0x3f) << 8) | b[at + 1];
      depth++;
      continue;
    }
    labels.push(new TextDecoder().decode(b.subarray(at + 1, at + 1 + size)));
    at += 1 + size;
  }
  return [labels.join("."), next >= 0 ? next : at];
}

const DNS_TYPES: Record<number, string> = { 1: "A", 2: "NS", 5: "CNAME", 6: "SOA", 12: "PTR", 15: "MX", 16: "TXT", 28: "AAAA", 33: "SRV" };

function dns(packet: Packet, b: Uint8Array, v: DataView, at: number) {
  const id = v.getUint16(at), flags = v.getUint16(at + 2), questions = v.getUint16(at + 4), answers = v.getUint16(at + 6);
  const response = Boolean(flags & 0x8000);
  let cursor = at + 12;
  const asked: string[] = [];
  for(let i = 0; i < questions; i++){
    const [name, end] = dnsName(b, cursor);
    asked.push(`${DNS_TYPES[v.getUint16(end)] ?? v.getUint16(end)} ${name}`);
    cursor = end + 4;
  }
  const found: string[] = [];
  for(let i = 0; i < answers && cursor < b.length; i++){
    const [, end] = dnsName(b, cursor);
    const type = v.getUint16(end), size = v.getUint16(end + 8);
    if(type === 1 && size === 4) found.push(`A ${ipv4(b, end + 10)}`);
    else if(type === 28 && size === 16) found.push(`AAAA ${ipv6(b, end + 10)}`);
    else found.push(DNS_TYPES[type] ?? String(type));
    cursor = end + 10 + size;
  }
  packet.protocol = "DNS";
  const code = flags & 0x000f;
  packet.info = `Standard query${response ? " response" : ""} 0x${hex(id, 4)} ${asked.join(" ")}${code ? ` ${code === 3 ? "No such name" : `rcode ${code}`}` : ""}${found.length ? ` ${found.join(" ")}` : ""}`;
  packet.layers.push({ name: "Domain Name System", fields: [[tx("Id"), `0x${hex(id, 4)}`], [tx("Tipo"), response ? tx("respuesta") : tx("consulta")], [tx("Preguntas"), asked.join(", ")], [tx("Respuestas"), found.join(", ") || "—"]] });
}

const DHCP_TYPES: Record<number, string> = { 1: "Discover", 2: "Offer", 3: "Request", 4: "Decline", 5: "ACK", 6: "NAK", 7: "Release", 8: "Inform" };

function dhcp(packet: Packet, b: Uint8Array, at: number) {
  const xid = Array.from(b.subarray(at + 4, at + 8), byte => hex(byte)).join("");
  const yiaddr = ipv4(b, at + 16);
  let type = 0;
  // the options, after the magic cookie
  for(let cursor = at + 240; cursor < b.length && b[cursor] !== 255;){
    const option = b[cursor];
    if(option === 0){ cursor++; continue; }
    if(option === 53) type = b[cursor + 2];
    cursor += 2 + b[cursor + 1];
  }
  packet.protocol = "DHCP";
  packet.info = `DHCP ${DHCP_TYPES[type] ?? "?"} - Transaction ID 0x${xid}${yiaddr !== "0.0.0.0" ? ` (${yiaddr})` : ""}`;
  packet.layers.push({ name: "Dynamic Host Configuration Protocol", fields: [[tx("Mensaje"), DHCP_TYPES[type] ?? String(type)], [tx("Transacción"), `0x${xid}`], [tx("Tu IP (yiaddr)"), yiaddr], [tx("MAC del cliente"), mac(b, at + 28)]] });
}

/** the bytes of a packet as a hex dump: offset, hex and text */
export function hexDump(bytes: Uint8Array): string {
  const lines: string[] = [];
  for(let at = 0; at < bytes.length; at += 16){
    const row = bytes.subarray(at, at + 16);
    const text = Array.from(row, byte => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ".")).join("");
    lines.push(`${hex(at, 4)}  ${Array.from(row, byte => hex(byte)).join(" ").padEnd(47)}  ${text}`);
  }
  return lines.join("\n");
}
