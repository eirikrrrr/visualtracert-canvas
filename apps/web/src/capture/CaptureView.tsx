// A traffic capture on a device of the emulated lab, in the page: choose a
// port (or all), an optional tcpdump filter, start it, and the packets come
// in live, decoded here (pcap.ts): a list, the layers of the one chosen and
// its bytes. What was captured downloads as a .pcap for Wireshark.
import { linkOf, type Device, type Topology } from "@visual-tracert/model";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n";
import { Icon } from "../editor/icons";
import { emulator } from "../emulation/api";
import { hexDump, PcapReader, type Packet } from "./pcap";

/** packets kept in the list; the .pcap keeps all of them */
const SHOWN = 3000;

type Status = { kind: "idle" } | { kind: "running"; message?: string } | { kind: "stopped"; message?: string; error?: boolean };

export function CaptureView({ lab, device, topology, iface: initial }: { lab: string; device: Device; topology: Topology; iface?: string }) {
  const t = useT();
  const cabled = device.interfaces.filter(iface => linkOf(topology, { device: device.id, interface: iface.name }));
  const [iface, setIface] = useState(initial ?? "any");
  const [filter, setFilter] = useState("");
  const [show, setShow] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [packets, setPackets] = useState<Packet[]>([]);
  const [total, setTotal] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const raw = useRef<Uint8Array[]>([]);
  const list = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

  useEffect(() => { if(initial) setIface(initial); }, [initial]);
  useEffect(() => () => socket.current?.close(), []);
  useEffect(() => { if(follow.current) list.current?.scrollTo({ top: list.current.scrollHeight }); }, [packets]);

  const start = () => {
    socket.current?.close();
    raw.current = [];
    setPackets([]); setTotal(0); setPicked(null);
    const reader = new PcapReader();
    const ws = new WebSocket(emulator.captureUrl(lab, device.id, iface, filter));
    ws.binaryType = "arraybuffer";
    socket.current = ws;
    let failure: string | undefined;
    setStatus({ kind: "running" });
    ws.onmessage = event => {
      if(typeof event.data === "string"){
        try{
          const message = JSON.parse(event.data);
          if(message.type === "error") failure = String(message.message);
          else setStatus({ kind: "running", message: String(message.message) });
        }catch(_){ /* not ours */ }
        return;
      }
      const chunk = new Uint8Array(event.data as ArrayBuffer);
      raw.current.push(chunk);
      try{
        const fresh = reader.push(chunk);
        if(fresh.length){
          setTotal(count => count + fresh.length);
          setPackets(previous => [...previous, ...fresh].slice(-SHOWN));
        }
      }catch(_){ failure = t("La captura no llegó en formato pcap."); ws.close(); }
    };
    ws.onclose = () => {
      if(socket.current === ws) socket.current = null;
      setStatus({ kind: "stopped", message: failure, error: Boolean(failure) });
    };
  };
  const stop = () => socket.current?.close();

  const download = () => {
    const blob = new Blob(raw.current as BlobPart[], { type: "application/vnd.tcpdump.pcap" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${device.id}-${iface.replace(/[^A-Za-z0-9_-]/g, "-")}-${new Date().toISOString().replace(/[:.]/g, "-")}.pcap`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  const shown = useMemo(() => {
    const words = show.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return words.length ? packets.filter(item => words.every(word => `${item.protocol} ${item.src} ${item.dst} ${item.info}`.toLowerCase().includes(word))) : packets;
  }, [packets, show]);
  const current = packets.find(item => item.index === picked);
  const running = status.kind === "running";

  return (
    <div className="capture">
      <div className="capture-tools">
        <select aria-label={t("Interfaz")} value={iface} disabled={running} onChange={event => setIface(event.target.value)}>
          <option value="any">{t("Todas (any)")}</option>
          {cabled.map(item => <option key={item.name} value={item.name}>{item.name}{item.ip ? ` · ${item.ip}` : ""}</option>)}
        </select>
        <input className="mono" aria-label={t("Filtro de captura (tcpdump)")} placeholder={t("Filtro: icmp or arp, port 53…")} value={filter} disabled={running}
          onChange={event => setFilter(event.target.value)} onKeyDown={event => { if(event.key === "Enter" && !running) start(); }} />
        {running
          ? <button type="button" className="danger" onClick={stop}><Icon name="pause" size={15} />{t("Detener")}</button>
          : <button type="button" className="primary" onClick={start}><Icon name="play" size={15} />{t("Capturar")}</button>}
        <button type="button" className="ghost small" disabled={!raw.current.length} onClick={download} title={t("Descargar la captura para Wireshark")}>
          <Icon name="download" size={15} />.pcap
        </button>
      </div>
      <div className="capture-status small">
        <span className={`emu-state ${running ? "on" : "off"}`}>{running ? t("Capturando") : status.kind === "idle" ? t("Sin capturar") : t("Detenida")}</span>
        <span className="muted">{t("{n} paquetes", { n: total })}</span>
        {status.kind !== "idle" && status.message && <span className={status.kind === "stopped" && status.error ? "field-error" : "muted"}>{status.message}</span>}
        <input className="capture-show" aria-label={t("Mostrar solo")} placeholder={t("Mostrar: tcp, 10.0.0.1…")} value={show} onChange={event => setShow(event.target.value)} />
      </div>
      <div className="capture-list" ref={list} role="grid" aria-label={t("Paquetes capturados")}
        onScroll={event => { const box = event.currentTarget; follow.current = box.scrollHeight - box.scrollTop - box.clientHeight < 24; }}>
        <div className="capture-row capture-head" role="row">
          <span>#</span><span>{t("Tiempo")}</span><span>{t("Origen")}</span><span>{t("Destino")}</span><span>{t("Protocolo")}</span><span>{t("Info")}</span>
        </div>
        {!shown.length && <p className="muted small capture-empty">{running ? t("Esperando paquetes… haz un ping o una traza en el laboratorio.") : t("Elige una interfaz y pulsa Capturar.")}</p>}
        {shown.map(item => (
          <div key={item.index} role="row" className={`capture-row proto-${item.protocol.toLowerCase()}${item.index === picked ? " picked" : ""}`} onClick={() => setPicked(item.index)}>
            <span>{item.index}</span><span>{item.time.toFixed(6)}</span><span>{item.src}</span><span>{item.dst}</span><span>{item.protocol}</span><span>{item.info}</span>
          </div>
        ))}
      </div>
      {current && (
        <div className="capture-detail">
          {current.layers.map(layer => (
            <details key={layer.name} open>
              <summary>{layer.name}</summary>
              <dl>{layer.fields.map(([name, value]) => <div key={name}><dt>{t(name)}</dt><dd className="mono">{value}</dd></div>)}</dl>
            </details>
          ))}
          <pre className="capture-hex">{hexDump(current.bytes)}</pre>
        </div>
      )}
    </div>
  );
}
