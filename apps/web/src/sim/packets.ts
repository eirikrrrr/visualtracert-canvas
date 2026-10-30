// What travels through the simulated network: Ethernet frames and what they
// carry (ARP, IPv4 with ICMP, UDP or TCP, and DHCP, DNS or HTTP inside), and
// the one-line description each frame gets in the event lists.
import { spanish, tx, type T } from "../i18n";

export type Protocol = "ARP" | "ICMP" | "DHCP" | "DNS" | "TCP" | "HTTP";

/** The order of the protocol filters */
export const PROTOCOLS: Protocol[] = ["ARP", "ICMP", "DHCP", "DNS", "TCP", "HTTP"];

export const LIMITED_BROADCAST = "255.255.255.255";
export const NO_ADDRESS = "0.0.0.0";
export const PORT = { dhcpServer: 67, dhcpClient: 68, dns: 53, http: 80 } as const;

export interface ArpPayload {
  op: "request" | "reply";
  senderMac: string;
  senderIp: string;
  targetMac: string;
  targetIp: string;
}

export type IcmpType = "echo-request" | "echo-reply" | "time-exceeded" | "unreachable";

export interface IcmpMessage {
  type: IcmpType;
  /** of an unreachable: 0 network, 3 port */
  code?: number;
  id: number;
  seq: number;
  /** an error carries the start of the packet it is about */
  original?: { src: string; dst: string; protocol: IpPacket["protocol"]; dstPort?: number };
}

export type DhcpOp = "discover" | "offer" | "request" | "ack" | "nak";

export interface DhcpMessage {
  op: DhcpOp;
  /** transaction id: the client matches the answers with it */
  xid: number;
  clientMac: string;
  /** the client's address (0.0.0.0 while it has none) */
  ciaddr: string;
  /** the address offered or assigned */
  yiaddr: string;
  /** the relay that forwarded it (0.0.0.0 when none) */
  giaddr: string;
  /** options: what the client asks for, who answers, the network settings */
  requested?: string;
  serverId?: string;
  prefix?: number;
  router?: string;
  dns?: string;
  leaseSeconds?: number;
}

export interface DnsMessage {
  id: number;
  response: boolean;
  name: string;
  answer?: string;
  rcode?: "NOERROR" | "NXDOMAIN";
}

export interface UdpSegment {
  srcPort: number;
  dstPort: number;
  dhcp?: DhcpMessage;
  dns?: DnsMessage;
}

export type TcpFlag = "SYN" | "ACK" | "PSH" | "FIN" | "RST";

export interface HttpMessage {
  method?: "GET";
  path?: string;
  host?: string;
  status?: number;
  reason?: string;
  /** size of the page in the response */
  bytes?: number;
}

export interface TcpSegment {
  srcPort: number;
  dstPort: number;
  /** relative sequence numbers, as Wireshark shows them */
  seq: number;
  ack: number;
  flags: TcpFlag[];
  /** bytes of data it carries */
  length: number;
  http?: HttpMessage;
}

export interface IpPacket {
  src: string;
  dst: string;
  ttl: number;
  protocol: "ICMP" | "UDP" | "TCP";
  icmp?: IcmpMessage;
  udp?: UdpSegment;
  tcp?: TcpSegment;
}

export interface Frame {
  src: string;
  dst: string;
  ethertype: "ARP" | "IPv4";
  arp?: ArpPayload;
  ip?: IpPacket;
}

/** The protocol a frame is shown and filtered as: the highest one it carries. */
export function protocolOf(frame: Frame): Protocol {
  const ip = frame.ip;
  if(!ip) return "ARP";
  if(ip.udp?.dhcp) return "DHCP";
  if(ip.udp?.dns) return "DNS";
  if(ip.tcp) return ip.tcp.http ? "HTTP" : "TCP";
  return "ICMP";
}

const ICMP_NAMES: Record<IcmpType, string> = {
  "echo-request": tx("Eco (ping)"),
  "echo-reply": tx("Respuesta de eco"),
  "time-exceeded": tx("Tiempo excedido"),
  "unreachable": tx("Destino inalcanzable"),
};

export const icmpName = (icmp: IcmpMessage, t: T = spanish) =>
  icmp.type === "unreachable" && icmp.code === 3 ? t("Puerto inalcanzable") : t(ICMP_NAMES[icmp.type]);

export const tcpFlags = (tcp: TcpSegment) => `[${tcp.flags.join(", ")}]`;

/** "DHCP Offer 192.168.21.100", "TCP 49153 → 80 [SYN] Seq=0"… */
export function summarize(frame: Frame, t: T = spanish): string {
  if(frame.arp){
    return frame.arp.op === "request"
      ? t("¿Quién tiene {target}? Responder a {sender}", { target: frame.arp.targetIp, sender: frame.arp.senderIp })
      : t("{ip} está en {mac}", { ip: frame.arp.senderIp, mac: frame.arp.senderMac });
  }
  const ip = frame.ip!;
  const dhcp = ip.udp?.dhcp;
  if(dhcp){
    const what = {
      discover: () => t("Discover: ¿hay algún servidor? ({mac})", { mac: dhcp.clientMac }),
      offer: () => t("Offer: ofrece {ip}", { ip: dhcp.yiaddr }),
      request: () => t("Request: pide {ip}", { ip: dhcp.requested ?? dhcp.yiaddr }),
      ack: () => t("ACK: {ip} asignada", { ip: dhcp.yiaddr }),
      nak: () => t("NAK: rechaza {ip}", { ip: dhcp.requested ?? "" }),
    }[dhcp.op]();
    return `DHCP ${what} · ${ip.src} → ${ip.dst}`;
  }
  const dns = ip.udp?.dns;
  if(dns){
    if(!dns.response) return t("DNS Consulta A {name} · {src} → {dst}", { name: dns.name, src: ip.src, dst: ip.dst });
    return dns.answer ? t("DNS Respuesta {name} → {ip}", { name: dns.name, ip: dns.answer }) : t("DNS Respuesta: {name} no existe", { name: dns.name });
  }
  const tcp = ip.tcp;
  if(tcp?.http){
    const http = tcp.http;
    return http.method ? `HTTP ${http.method} ${http.path} · Host: ${http.host}` : `HTTP ${http.status} ${http.reason} (${http.bytes} bytes)`;
  }
  if(tcp){
    return `TCP ${tcp.srcPort} → ${tcp.dstPort} ${tcpFlags(tcp)} Seq=${tcp.seq}${tcp.flags.includes("ACK") ? ` Ack=${tcp.ack}` : ""} Len=${tcp.length}`;
  }
  return `${icmpName(ip.icmp!, t)} ${ip.src} → ${ip.dst} · TTL ${ip.ttl}`;
}
