// The headers of a simulated frame, layer by layer (Ethernet, ARP, IPv4,
// ICMP), as the simulation panel and the log show them.
import type { SimEvent } from "../sim/engine";

export function FrameHeaders({ event }: { event: SimEvent }) {
  const { frame } = event;
  const rows: [string, [string, string][]][] = [];
  if(frame.dst) rows.push(["Ethernet", [["Origen", frame.src], ["Destino", frame.dst], ["Tipo", frame.ethertype === "ARP" ? "ARP (0x0806)" : "IPv4 (0x0800)"]]]);
  if(frame.arp) rows.push(["ARP", [
    ["Operación", frame.arp.op === "request" ? "Pregunta (1)" : "Respuesta (2)"],
    ["MAC emisor", frame.arp.senderMac], ["IP emisor", frame.arp.senderIp],
    ["MAC objetivo", frame.arp.targetMac], ["IP objetivo", frame.arp.targetIp],
  ]]);
  if(frame.ip){
    rows.push(["IPv4", [["Origen", frame.ip.src], ["Destino", frame.ip.dst], ["TTL", String(frame.ip.ttl)], ["Protocolo", "ICMP (1)"]]]);
    const types = { "echo-request": "Eco (8)", "echo-reply": "Respuesta de eco (0)", "time-exceeded": "Tiempo excedido (11)", "unreachable": "Destino inalcanzable (3)" };
    rows.push(["ICMP", [["Tipo", types[frame.ip.icmp.type]], ["Id", String(frame.ip.icmp.id)], ["Secuencia", String(frame.ip.icmp.seq)]]]);
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
