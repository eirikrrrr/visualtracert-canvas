// The headers of a simulated frame, layer by layer (Ethernet, ARP, IPv4,
// ICMP, UDP, TCP, DHCP, DNS, HTTP), as the simulation panel and the log show
// them.
import { tx, useT } from "../i18n";
import { icmpName, tcpFlags, type EventResult, type SimEvent } from "../sim/engine";

/** what a device did with a frame, as the event lists name it */
export const RESULT_LABEL: Record<EventResult, string> = {
  created: tx("Creado"),
  forwarded: tx("Reenviado"),
  flooded: tx("Inundado"),
  answered: tx("Respondido"),
  learned: tx("Aprendido"),
  delivered: tx("Entregado"),
  dropped: tx("Descartado"),
};

const IP_PROTOCOL = { ICMP: "ICMP (1)", TCP: "TCP (6)", UDP: "UDP (17)" };
const ICMP_TYPE = { "echo-request": 8, "echo-reply": 0, "time-exceeded": 11, "unreachable": 3 };
const DHCP_TYPE = { discover: "Discover (1)", offer: "Offer (2)", request: "Request (3)", ack: "ACK (5)", nak: "NAK (6)" };

type Fields = [string, string][];
/** only the fields that have a value */
const present = (fields: [string, string | number | undefined][]): Fields =>
  fields.filter((field): field is [string, string | number] => field[1] !== undefined).map(([key, value]) => [key, String(value)]);

export function FrameHeaders({ event }: { event: SimEvent }) {
  const t = useT();
  const { frame } = event;
  const rows: [string, Fields][] = [];
  if(frame.dst) rows.push(["Ethernet", [[t("Origen"), frame.src], [t("Destino"), frame.dst], [t("Tipo"), frame.ethertype === "ARP" ? "ARP (0x0806)" : "IPv4 (0x0800)"]]]);
  if(frame.arp) rows.push(["ARP", [
    [t("Operación"), frame.arp.op === "request" ? t("Pregunta (1)") : t("Respuesta (2)")],
    [t("MAC emisor"), frame.arp.senderMac], [t("IP emisor"), frame.arp.senderIp],
    [t("MAC objetivo"), frame.arp.targetMac], [t("IP objetivo"), frame.arp.targetIp],
  ]]);
  const ip = frame.ip;
  if(ip){
    rows.push(["IPv4", [[t("Origen"), ip.src], [t("Destino"), ip.dst], ["TTL", String(ip.ttl)], [t("Protocolo"), IP_PROTOCOL[ip.protocol]]]]);
    if(ip.icmp){
      const icmp = ip.icmp;
      rows.push(["ICMP", present([
        [t("Tipo"), `${icmpName(icmp, t)} (${ICMP_TYPE[icmp.type]})`],
        [t("Código"), icmp.code],
        ["Id", icmp.id], [t("Secuencia"), icmp.seq],
        [t("Sobre el paquete"), icmp.original && `${icmp.original.src} → ${icmp.original.dst} ${icmp.original.protocol}${icmp.original.dstPort ? `/${icmp.original.dstPort}` : ""}`],
      ])]);
    }
    if(ip.udp) rows.push(["UDP", [[t("Puerto origen"), String(ip.udp.srcPort)], [t("Puerto destino"), String(ip.udp.dstPort)]]]);
    if(ip.tcp){
      const tcp = ip.tcp;
      rows.push(["TCP", [
        [t("Puerto origen"), String(tcp.srcPort)], [t("Puerto destino"), String(tcp.dstPort)],
        ["Flags", tcpFlags(tcp)], [t("Seq (relativo)"), String(tcp.seq)], [t("Ack (relativo)"), tcp.flags.includes("ACK") ? String(tcp.ack) : "—"],
        [t("Datos"), t("{n} bytes", { n: tcp.length })],
      ]]);
    }
    const dhcp = ip.udp?.dhcp;
    if(dhcp) rows.push(["DHCP", present([
      [t("Mensaje"), DHCP_TYPE[dhcp.op]], [t("Transacción"), `0x${dhcp.xid.toString(16)}`], [t("MAC cliente"), dhcp.clientMac],
      ["ciaddr", dhcp.ciaddr], ["yiaddr", dhcp.yiaddr], ["giaddr (relay)", dhcp.giaddr],
      [t("IP pedida"), dhcp.requested], [t("Servidor"), dhcp.serverId], [t("Máscara"), dhcp.prefix && `/${dhcp.prefix}`],
      ["Router", dhcp.router], ["DNS", dhcp.dns], [t("Concesión"), dhcp.leaseSeconds && `${dhcp.leaseSeconds} s`],
    ])]);
    const dns = ip.udp?.dns;
    if(dns) rows.push(["DNS", present([
      ["Id", `0x${dns.id.toString(16).padStart(4, "0")}`], [t("Tipo"), dns.response ? t("Respuesta") : t("Consulta")],
      [t("Pregunta"), `${dns.name} A IN`], [t("Respuesta"), dns.response ? dns.answer ?? "—" : undefined], [t("Código"), dns.rcode],
    ])]);
    const http = ip.tcp?.http;
    if(http) rows.push(["HTTP", http.method
      ? present([[t("Petición"), `${http.method} ${http.path} HTTP/1.1`], ["Host", http.host]])
      : present([[t("Estado"), `HTTP/1.1 ${http.status} ${http.reason}`], ["Content-Type", "text/html"], ["Content-Length", http.bytes]])]);
  }
  return (
    <div className="headers">
      {rows.map(([layer, fields]) => (
        <details key={layer} open>
          <summary>{layer}</summary>
          <dl>{fields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd className="mono">{value}</dd></div>)}</dl>
        </details>
      ))}
    </div>
  );
}
