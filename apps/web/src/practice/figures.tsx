// The diagrams of the Starting Point's guides, drawn as SVG from the theme's
// colours (so they follow light and dark) and labelled in the interface's
// language. A guide names a figure by its id; FIGURES has one for each. They
// share a small kit: devices (the app's icons in a tile), arrows, labels,
// sequence diagrams and the bit grids of the protocol headers.
import type { CSSProperties, ReactNode } from "react";
import { iconPaths } from "../editor/icons";
import { tx, useT } from "../i18n";

const W = 640;

function Svg({ h, label, children }: { h: number; label: string; children: ReactNode }) {
  return <svg className="fig-svg" viewBox={`0 0 ${W} ${h}`} role="img" aria-label={label}>{children}</svg>;
}

/** a label: centred by default; small (s), code (m), bold (b), muted (dim), in a colour (c) */
function T({ x, y, children, a = "middle", s, m, b, dim, c, halo }: {
  x: number; y: number; children: ReactNode; a?: "start" | "middle" | "end"; s?: boolean; m?: boolean; b?: boolean; dim?: boolean; c?: string; halo?: boolean;
}) {
  const cls = ["f-t", s && "f-small", m && "f-mono", b && "f-bold", dim && "f-dim", halo && "f-halo"].filter(Boolean).join(" ");
  return <text x={x} y={y} textAnchor={a} className={cls} style={c ? { fill: c } : undefined}>{children}</text>;
}

/** a device: its icon in a tile, its name under it and, below, a detail (an address) */
function Dev({ x, y, icon, label, sub, c }: { x: number; y: number; icon: string; label?: string; sub?: string; c?: string }) {
  return (
    <g>
      <rect x={x - 24} y={y - 24} width={48} height={48} rx={12} className="f-node" style={c ? { stroke: c } : undefined} />
      <g transform={`translate(${x - 13} ${y - 13}) scale(${26 / 24})`} className="f-icon" style={c ? { stroke: c } : undefined}>
        {iconPaths(icon).map(d => <path key={d} d={d} />)}
      </g>
      {label && <T x={x} y={y + 40} b s>{label}</T>}
      {sub && <T x={x} y={y + 54} s m dim>{sub}</T>}
    </g>
  );
}

const head = (x: number, y: number, angle: number, size = 9) =>
  `${x},${y} ${x - size * Math.cos(angle - 0.42)},${y - size * Math.sin(angle - 0.42)} ${x - size * Math.cos(angle + 0.42)},${y - size * Math.sin(angle + 0.42)}`;

/** an arrow from one point to another: dashed for a broadcast or a loss */
function Arrow({ x1, y1, x2, y2, c = "var(--ink-2)", dash, w = 1.8, noHead }: { x1: number; y1: number; x2: number; y2: number; c?: string; dash?: boolean; w?: number; noHead?: boolean }) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  return (
    <g style={{ color: c }}>
      <line x1={x1} y1={y1} x2={x2 - (noHead ? 0 : 6 * Math.cos(angle))} y2={y2 - (noHead ? 0 : 6 * Math.sin(angle))} stroke="currentColor" strokeWidth={w} strokeDasharray={dash ? "6 5" : undefined} />
      {!noHead && <polygon points={head(x2, y2, angle)} fill="currentColor" />}
    </g>
  );
}

/** a curved arrow (a quadratic curve through a control point) */
function Curve({ x1, y1, cx, cy, x2, y2, c = "var(--ink-2)", dash }: { x1: number; y1: number; cx: number; cy: number; x2: number; y2: number; c?: string; dash?: boolean }) {
  return (
    <g style={{ color: c }}>
      <path d={`M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeDasharray={dash ? "6 5" : undefined} />
      <polygon points={head(x2, y2, Math.atan2(y2 - cy, x2 - cx))} fill="currentColor" />
    </g>
  );
}

const Line = ({ x1, y1, x2, y2, c, w = 1.6 }: { x1: number; y1: number; x2: number; y2: number; c?: string; w?: number }) =>
  <line x1={x1} y1={y1} x2={x2} y2={y2} className="f-line" style={c ? { stroke: c } : undefined} strokeWidth={w} />;

/** a box tinted with a colour, with a label in it */
function Box({ x, y, w, h, c = "var(--accent)", children, m, s, rx = 8, solid }: { x: number; y: number; w: number; h: number; c?: string; children?: ReactNode; m?: boolean; s?: boolean; rx?: number; solid?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={rx} className={solid ? "f-solid" : "f-tint"} style={{ "--c": c } as CSSProperties} />
      {children !== undefined && <T x={x + w / 2} y={y + h / 2 + 4.5} m={m} s={s}>{children}</T>}
    </g>
  );
}

/** a dashed area around a network, with its name */
function Zone({ x, y, w, h, label, c = "var(--accent)", below }: { x: number; y: number; w: number; h: number; label: string; c?: string; below?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={16} className="f-zone" style={{ "--c": c } as CSSProperties} />
      <T x={x + 14} y={below ? y + h - 12 : y + 22} a="start" s b c={c}>{label}</T>
    </g>
  );
}

/** a bracket under (or over) a span, with its label */
function Brace({ x1, x2, y, label, c = "var(--ink-2)", up }: { x1: number; x2: number; y: number; label: string; c?: string; up?: boolean }) {
  const d = up ? -8 : 8;
  return (
    <g>
      <path d={`M${x1} ${y} v${d} H${x2} v${-d}`} fill="none" stroke={c} strokeWidth={1.5} />
      <T x={(x1 + x2) / 2} y={up ? y - 16 : y + 26} s c={c}>{label}</T>
    </g>
  );
}

interface Msg { label: string; to: "right" | "left"; c?: string; dash?: boolean; lost?: boolean }

/** a sequence diagram: two lifelines and the messages between them, top to bottom */
function Seq({ left, right, x1 = 130, x2 = 510, top = 30, step = 48, msgs, notesLeft = [], notesRight = [], bottom, boxW = 120 }: {
  left: string; right: string; x1?: number; x2?: number; top?: number; step?: number; msgs: Msg[]; boxW?: number;
  notesLeft?: [number, string][]; notesRight?: [number, string][]; bottom: number;
}) {
  const y0 = top + 34;
  return (
    <g>
      <Box x={x1 - boxW / 2} y={top} w={boxW} h={28} solid>{left}</Box>
      <Box x={x2 - boxW / 2} y={top} w={boxW} h={28} solid>{right}</Box>
      <line x1={x1} y1={top + 28} x2={x1} y2={bottom} className="f-life" />
      <line x1={x2} y1={top + 28} x2={x2} y2={bottom} className="f-life" />
      {msgs.map((msg, i) => {
        const y = y0 + 14 + i * step;
        const [from, to] = msg.to === "right" ? [x1, x2] : [x2, x1];
        const end = msg.lost ? from + (to - from) * 0.6 : to;
        const endY = msg.lost ? y + (step - 14) * 0.6 : y + step - 14;
        return (
          <g key={i}>
            <Arrow x1={from} y1={y} x2={end} y2={endY} c={msg.c ?? "var(--accent)"} dash={msg.dash || msg.lost} noHead={msg.lost} />
            {msg.lost && <T x={end + (msg.to === "right" ? 8 : -8)} y={endY + 5} b c="var(--danger)">✕</T>}
            <T x={(x1 + x2) / 2} y={y + (step - 14) / 2 - 4} s m halo>{msg.label}</T>
          </g>
        );
      })}
      {notesLeft.map(([i, text]) => <T key={`l${i}`} x={x1 - 10} y={y0 + 18 + i * step} a="end" s m dim>{text}</T>)}
      {notesRight.map(([i, text]) => <T key={`r${i}`} x={x2 + 10} y={y0 + 18 + i * step} a="start" s m dim>{text}</T>)}
    </g>
  );
}

/** a protocol header as rows of 32 bits: each field as wide as its bits */
function Fields({ rows, top = 34, mark = [] }: { rows: [string, number][][]; top?: number; mark?: string[] }) {
  const x0 = 32, unit = 576 / 32, h = 40;
  return (
    <g>
      {[0, 8, 16, 24, 31].map(bit => <T key={bit} x={x0 + bit * unit + unit / 2} y={top - 8} s m dim>{bit}</T>)}
      {rows.map((row, r) => {
        let bit = 0;
        return row.map(([label, bits]) => {
          const x = x0 + bit * unit;
          bit += bits;
          return (
            <Box key={`${r}-${label}`} x={x} y={top + r * h} w={bits * unit} h={h} rx={0} s
              c={mark.includes(label) ? "var(--accent)" : "var(--ink-3)"}>{label}</Box>
          );
        });
      })}
    </g>
  );
}

// --- fundamentals -------------------------------------------------------------

function Network() {
  const t = useT();
  return (
    <Svg h={262} label={t("Una red local con su switch y su router hacia Internet")}>
      <Zone x={16} y={14} w={390} h={236} label={t("LAN · 192.168.1.0/24")} />
      {[[80, 78], [80, 190], [330, 78], [330, 190]].map(([x, y]) => <Line key={`${x}${y}`} x1={210} y1={134} x2={x} y2={y} />)}
      <Line x1={210} y1={134} x2={480} y2={134} />
      <Line x1={480} y1={134} x2={580} y2={134} />
      <Dev x={80} y={78} icon="pc" label={t("PC")} />
      <Dev x={80} y={190} icon="laptop" label={t("Portátil")} />
      <Dev x={330} y={78} icon="server" label={t("Servidor")} />
      <Dev x={330} y={190} icon="phone" label={t("Teléfono")} />
      <Dev x={210} y={134} icon="switch" label={t("Switch")} c="var(--accent)" />
      <Dev x={480} y={134} icon="router" label={t("Router")} c="var(--accent)" />
      <Dev x={585} y={134} icon="cloud" label={t("Internet")} sub={t("otras redes")} />
    </Svg>
  );
}

function Topologies() {
  const t = useT();
  const node = (x: number, y: number, key: string) => <circle key={key} cx={x} cy={y} r={9} className="f-dot" />;
  const panels = [tx("Bus"), tx("Anillo"), tx("Estrella"), tx("Malla")];
  return (
    <Svg h={196} label={t("Topologías: bus, anillo, estrella y malla")}>
      {panels.map((name, i) => {
        const x = 10 + i * 158, cx = x + 75, cy = 92;
        let body: ReactNode = null;
        if(i === 0) body = <>
          <Line x1={x + 12} y1={120} x2={x + 138} y2={120} w={3} />
          {[30, 60, 90, 120].map(dx => <g key={dx}><Line x1={x + dx} y1={70} x2={x + dx} y2={120} />{node(x + dx, 70, `b${dx}`)}</g>)}
        </>;
        else if(i === 1){
          const pts = Array.from({ length: 6 }, (_, k) => [cx + 46 * Math.cos(k * Math.PI / 3 - Math.PI / 2), cy + 46 * Math.sin(k * Math.PI / 3 - Math.PI / 2)]);
          body = <><circle cx={cx} cy={cy} r={46} className="f-line" fill="none" />{pts.map(([px, py], k) => node(px, py, `r${k}`))}</>;
        }else if(i === 2){
          const pts = Array.from({ length: 5 }, (_, k) => [cx + 52 * Math.cos(k * 2 * Math.PI / 5 - Math.PI / 2), cy + 52 * Math.sin(k * 2 * Math.PI / 5 - Math.PI / 2)]);
          body = <>{pts.map(([px, py], k) => <Line key={`s${k}`} x1={cx} y1={cy} x2={px} y2={py} />)}{pts.map(([px, py], k) => node(px, py, `sn${k}`))}
            <rect x={cx - 13} y={cy - 9} width={26} height={18} rx={4} className="f-solid" style={{ "--c": "var(--accent)" } as CSSProperties} /></>;
        }else{
          const pts = Array.from({ length: 5 }, (_, k) => [cx + 50 * Math.cos(k * 2 * Math.PI / 5 - Math.PI / 2), cy + 50 * Math.sin(k * 2 * Math.PI / 5 - Math.PI / 2)]);
          body = <>{pts.flatMap(([ax, ay], a) => pts.slice(a + 1).map(([bx, by], b) => <Line key={`m${a}-${b}`} x1={ax} y1={ay} x2={bx} y2={by} />))}{pts.map(([px, py], k) => node(px, py, `mn${k}`))}</>;
        }
        return <g key={name}>{body}<T x={cx} y={180} b>{t(name)}</T></g>;
      })}
    </Svg>
  );
}

function Media() {
  const t = useT();
  const wave = (y: number, phase: number) => {
    let d = `M200 ${y}`;
    for(let x = 200; x <= 400; x += 4) d += ` L${x} ${y + 8 * Math.sin((x + phase) / 14)}`;
    return d;
  };
  const rows: [string, string, string][] = [
    [tx("Cobre · par trenzado"), tx("Pulsos eléctricos"), tx("hasta 100 m · 1–10 Gb/s")],
    [tx("Fibra óptica"), tx("Pulsos de luz"), tx("de cientos de m a decenas de km")],
    [tx("Inalámbrico"), tx("Ondas de radio"), tx("decenas de m (Wi-Fi)")],
  ];
  return (
    <Svg h={222} label={t("Los medios: cobre, fibra e inalámbrico")}>
      {rows.map(([name, signal, reach], i) => {
        const y = 42 + i * 70;
        return (
          <g key={name}>
            <T x={20} y={y - 4} a="start" b>{t(name)}</T>
            <T x={20} y={y + 14} a="start" s dim>{t(signal)}</T>
            <T x={620} y={y + 5} a="end" s m>{t(reach)}</T>
          </g>
        );
      })}
      <path d={wave(42, 0)} className="f-line" fill="none" style={{ stroke: "var(--tcp)" }} strokeWidth={2.2} />
      <path d={wave(42, 44)} className="f-line" fill="none" strokeWidth={2.2} />
      <rect x={200} y={100} width={200} height={24} rx={12} className="f-tint" style={{ "--c": "var(--ink-3)" } as CSSProperties} />
      <path d="M204 112 L236 102 L268 122 L300 102 L332 122 L364 102 L396 112" fill="none" stroke="var(--arp)" strokeWidth={2.2} />
      <Dev x={226} y={182} icon="ap" />
      {[22, 36, 50].map(r => <path key={r} d={`M${256 + r * 0.2} ${182 - r * 0.7} A ${r} ${r} 0 0 1 ${256 + r * 0.2} ${182 + r * 0.7}`} fill="none" stroke="var(--icmp)" strokeWidth={2} />)}
      <Dev x={376} y={182} icon="laptop" />
    </Svg>
  );
}

function Packet() {
  const t = useT();
  return (
    <Svg h={186} label={t("Un paquete: cabecera y carga útil")}>
      <T x={170} y={24} b c="var(--accent)">{t("Cabecera")}</T>
      <T x={460} y={24} b>{t("Carga útil (datos)")}</T>
      <Box x={40} y={36} w={260} h={126} rx={14} />
      <rect x={300} y={36} width={300} height={126} rx={14} className="f-tint" style={{ "--c": "var(--ink-3)" } as CSSProperties} />
      <T x={60} y={70} a="start" s>{t("Origen")}: <tspan className="f-mono">192.168.1.10</tspan></T>
      <T x={60} y={100} a="start" s>{t("Destino")}: <tspan className="f-mono">10.0.0.5</tspan></T>
      <T x={60} y={130} a="start" s dim>{t("Protocolo, longitud, TTL…")}</T>
      <T x={320} y={74} a="start" s m dim>GET /index.html HTTP/1.1</T>
      <T x={320} y={100} a="start" s m dim>Host: www.ejemplo.com</T>
      <T x={320} y={126} a="start" s m dim>…</T>
    </Svg>
  );
}

const OSI: [number, string, string, string, string][] = [
  [7, tx("Aplicación"), tx("Datos"), "HTTP · DNS · SSH", "var(--http)"],
  [6, tx("Presentación"), tx("Datos"), "TLS · UTF-8 · JPEG", "var(--dhcp)"],
  [5, tx("Sesión"), tx("Datos"), "RPC · NetBIOS", "var(--accent)"],
  [4, tx("Transporte"), tx("Segmento"), "TCP · UDP", "var(--tcp)"],
  [3, tx("Red"), tx("Paquete"), tx("IP · ICMP · router"), "var(--icmp)"],
  [2, tx("Enlace de datos"), tx("Trama"), tx("Ethernet · ARP · switch"), "var(--arp)"],
  [1, tx("Física"), tx("Bits"), tx("cable · fibra · radio"), "var(--ok)"],
];

function Osi() {
  const t = useT();
  return (
    <Svg h={330} label={t("Las siete capas del modelo OSI")}>
      <T x={70} y={20} a="start" s dim>{t("Capa")}</T>
      <T x={290} y={20} a="start" s dim>{t("Datos (PDU)")}</T>
      <T x={420} y={20} a="start" s dim>{t("Ejemplos")}</T>
      {OSI.map(([n, name, pdu, examples, c], i) => {
        const y = 30 + i * 42;
        return (
          <g key={n}>
            <rect x={20} y={y} width={600} height={38} rx={9} className="f-tint" style={{ "--c": c } as CSSProperties} />
            <circle cx={44} cy={y + 19} r={12} fill={c} />
            <T x={44} y={y + 24} b c="var(--surface)">{n}</T>
            <T x={70} y={y + 24} a="start" b>{t(name)}</T>
            <T x={290} y={y + 24} a="start" s>{t(pdu)}</T>
            <T x={420} y={y + 24} a="start" s m>{t(examples)}</T>
          </g>
        );
      })}
    </Svg>
  );
}

function Encapsulation() {
  const t = useT();
  const rows: [string, [string, number, number, string][]][] = [
    [tx("Datos"), [[tx("Datos"), 380, 140, "var(--http)"]]],
    [tx("Segmento"), [["TCP", 300, 80, "var(--tcp)"], [tx("Datos"), 380, 140, "var(--http)"]]],
    [tx("Paquete"), [["IP", 220, 80, "var(--icmp)"], ["TCP", 300, 80, "var(--tcp)"], [tx("Datos"), 380, 140, "var(--http)"]]],
    [tx("Trama"), [["Ethernet", 140, 80, "var(--arp)"], ["IP", 220, 80, "var(--icmp)"], ["TCP", 300, 80, "var(--tcp)"], [tx("Datos"), 380, 140, "var(--http)"], ["FCS", 520, 50, "var(--arp)"]]],
  ];
  const layers = [tx("Aplicación"), tx("Transporte"), tx("Red"), tx("Enlace")];
  return (
    <Svg h={300} label={t("Encapsulación: cada capa añade su cabecera")}>
      {rows.map(([pdu, boxes], i) => {
        const y = 22 + i * 56;
        return (
          <g key={pdu}>
            <T x={20} y={y + 16} a="start" b s>{t(layers[i])}</T>
            <T x={20} y={y + 32} a="start" s dim>{t(pdu)}</T>
            {boxes.map(([label, x, w, c]) => <Box key={label} x={x} y={y} w={w - 3} h={38} c={c} s>{t(label)}</Box>)}
          </g>
        );
      })}
      <T x={20} y={260} a="start" b s>{t("Física")}</T>
      <T x={20} y={276} a="start" s dim>{t("Bits")}</T>
      <T x={140} y={272} a="start" m s c="var(--ok)">01000101 00000000 00110100 11011010 10100001 0110…</T>
      <Arrow x1={606} y1={26} x2={606} y2={270} c="var(--ink-3)" />
      <T x={598} y={150} a="end" s dim>{t("bajar")}</T>
    </Svg>
  );
}

function TcpIp() {
  const t = useT();
  const spans: [string, number, number, string][] = [
    [tx("Aplicación"), 0, 3, "var(--http)"],
    [tx("Transporte"), 3, 1, "var(--tcp)"],
    [tx("Internet"), 4, 1, "var(--icmp)"],
    [tx("Acceso a la red"), 5, 2, "var(--arp)"],
  ];
  return (
    <Svg h={330} label={t("Las capas de TCP/IP frente a las de OSI")}>
      <T x={155} y={20} b>OSI</T>
      <T x={485} y={20} b>TCP/IP</T>
      {OSI.map(([n, name, , , c], i) => <Box key={n} x={40} y={30 + i * 42} w={230} h={38} c={c} s>{`${n} · ${t(name)}`}</Box>)}
      {spans.map(([name, from, count, c]) => {
        const y = 30 + from * 42, h = count * 42 - 4;
        return (
          <g key={name}>
            <polygon points={`270,${y} 370,${y} 370,${y + h} 270,${y + h}`} className="f-tint" style={{ "--c": c, opacity: 0.45 } as CSSProperties} />
            <Box x={370} y={y} w={230} h={h} c={c}>{t(name)}</Box>
          </g>
        );
      })}
    </Svg>
  );
}

function Binary() {
  const t = useT();
  const bits = [1, 1, 0, 0, 0, 0, 0, 0];
  return (
    <Svg h={176} label={t("El octeto 11000000 vale 192")}>
      {bits.map((bit, i) => {
        const x = 42 + i * 72;
        return (
          <g key={i}>
            <T x={x + 30} y={36} s m dim>{2 ** (7 - i)}</T>
            <Box x={x} y={48} w={60} h={56} c={bit ? "var(--accent)" : "var(--ink-3)"} solid={Boolean(bit)} />
            <T x={x + 30} y={84} m b c={bit ? "var(--accent-ink)" : undefined}>{bit}</T>
          </g>
        );
      })}
      <T x={320} y={146} m b>11000000 = 128 + 64 = 192</T>
    </Svg>
  );
}

function Ipv4() {
  const t = useT();
  const octets = [["192", "11000000"], ["168", "10101000"], ["1", "00000001"], ["10", "00001010"]];
  return (
    <Svg h={212} label={t("Una dirección IPv4: parte de red y parte de equipo")}>
      <T x={320} y={22} m b>192.168.1.10/24</T>
      {octets.map(([dec, bin], i) => {
        const x = 40 + i * 145, c = i < 3 ? "var(--accent)" : "var(--ok)";
        return (
          <g key={i}>
            <Box x={x} y={38} w={130} h={40} c={c} m>{dec}</Box>
            <Box x={x} y={92} w={130} h={40} c={c} m s>{bin}</Box>
            {i < 3 && <T x={x + 137} y={66} b>.</T>}
          </g>
        );
      })}
      <Brace x1={40} x2={460} y={146} label={t("Red · 24 bits")} c="var(--accent)" />
      <Brace x1={475} x2={605} y={146} label={t("Equipo · 8 bits")} c="var(--ok)" />
    </Svg>
  );
}

function Mask() {
  const t = useT();
  const rows: [string, string[], string, boolean][] = [
    [tx("Dirección"), ["11000000", "10101000", "00000001", "00001010"], "192.168.1.10", false],
    [tx("Máscara"), ["11111111", "11111111", "11111111", "00000000"], "255.255.255.0", false],
    [tx("Red (AND)"), ["11000000", "10101000", "00000001", "00000000"], "192.168.1.0", true],
  ];
  return (
    <Svg h={200} label={t("El AND entre la dirección y la máscara da la red")}>
      {rows.map(([name, bins, dec, result], r) => {
        const y = 44 + r * 52 + (result ? 12 : 0);
        return (
          <g key={name}>
            <T x={20} y={y} a="start" b s>{t(name)}</T>
            {bins.map((bin, i) => <T key={i} x={190 + i * 98} y={y} m c={result ? (i < 3 ? "var(--accent)" : "var(--ink-3)") : undefined}>{bin}</T>)}
            <T x={620} y={y} a="end" m b={result} c={result ? "var(--accent)" : undefined}>{dec}</T>
          </g>
        );
      })}
      <Line x1={130} y1={130} x2={620} y2={130} />
      <T x={130} y={122} a="start" s dim>AND</T>
    </Svg>
  );
}

function Gateway() {
  const t = useT();
  return (
    <Svg h={276} label={t("Directo dentro de la red; por la puerta de enlace hacia otra red")}>
      <Zone x={16} y={14} w={320} h={250} label={t("Red 192.168.1.0/24")} />
      <Zone x={478} y={14} w={146} h={250} label="10.0.0.0/24" c="var(--ok)" />
      <Line x1={80} y1={92} x2={210} y2={150} />
      <Line x1={80} y1={200} x2={210} y2={150} />
      <Line x1={210} y1={150} x2={405} y2={150} />
      <Line x1={405} y1={150} x2={552} y2={150} />
      <Dev x={80} y={92} icon="pc" label="PC A" sub="192.168.1.10" />
      <Dev x={80} y={200} icon="pc" label="PC B" sub="192.168.1.20" />
      <Dev x={210} y={150} icon="switch" />
      <Dev x={405} y={150} icon="router" label={t("Router")} sub="192.168.1.1" c="var(--accent)" />
      <Dev x={552} y={150} icon="server" label={t("Servidor")} sub="10.0.0.5" />
      <Arrow x1={36} y1={104} x2={36} y2={188} c="var(--ok)" w={2.2} />
      <g transform="translate(28 150) rotate(-90)"><T x={0} y={0} s b c="var(--ok)">{t("directo")}</T></g>
      <path d="M104 74 Q 250 40 390 112" fill="none" stroke="var(--accent)" strokeWidth={2.2} strokeDasharray="6 5" />
      <Curve x1={420} y1={124} cx={480} cy={96} x2={534} y2={130} c="var(--accent)" dash />
      <T x={250} y={50} s b c="var(--accent)" halo>{t("otra red: a la puerta de enlace")}</T>
    </Svg>
  );
}

function Mac() {
  const t = useT();
  const bytes = ["02", "42", "AC", "11", "00", "02"];
  return (
    <Svg h={176} label={t("Una dirección MAC: fabricante y tarjeta")}>
      <T x={320} y={24} s dim>{t("48 bits = 6 bytes en hexadecimal")}</T>
      {bytes.map((byte, i) => (
        <g key={i}>
          <Box x={52 + i * 92} y={42} w={80} h={50} c={i < 3 ? "var(--accent)" : "var(--ok)"} m>{byte}</Box>
          {i < 5 && <T x={52 + i * 92 + 86} y={72} b>:</T>}
        </g>
      ))}
      <Brace x1={52} x2={316} y={104} label={t("OUI · el fabricante")} c="var(--accent)" />
      <Brace x1={328} x2={592} y={104} label={t("La tarjeta concreta")} c="var(--ok)" />
    </Svg>
  );
}

function Arp() {
  const t = useT();
  return (
    <Svg h={306} label={t("ARP: petición por difusión y respuesta directa")}>
      <Line x1={90} y1={160} x2={320} y2={160} />
      <Line x1={320} y1={160} x2={550} y2={84} />
      <Line x1={320} y1={160} x2={550} y2={226} />
      <Dev x={90} y={160} icon="pc" label="PC A" sub="192.168.1.10" />
      <Dev x={320} y={160} icon="switch" />
      <Dev x={550} y={84} icon="pc" label="PC B" sub="192.168.1.20" c="var(--ok)" />
      <Dev x={550} y={226} icon="pc" label="PC C" sub="192.168.1.30" />
      <Arrow x1={120} y1={176} x2={292} y2={176} c="var(--arp)" dash />
      <Arrow x1={346} y1={176} x2={524} y2={116} c="var(--arp)" dash />
      <Arrow x1={346} y1={182} x2={524} y2={236} c="var(--arp)" dash />
      <T x={206} y={206} s b c="var(--arp)">{t("① ¿Quién tiene 192.168.1.20?")}</T>
      <T x={206} y={222} s dim>{t("difusión a ff:ff:ff:ff:ff:ff")}</T>
      <Curve x1={526} y1={64} cx={300} cy={10} x2={110} y2={134} c="var(--ok)" />
      <T x={300} y={44} s b c="var(--ok)" halo>{t("② Es mía: 02:42:ac:11:00:14 (unicast)")}</T>
      <T x={550} y={298} s dim>{t("PC C la ignora")}</T>
    </Svg>
  );
}

function Journey() {
  const t = useT();
  return (
    <Svg h={250} label={t("El viaje de un ping: las IP no cambian, las MAC sí")}>
      <Box x={60} y={20} w={500} h={30} c="var(--icmp)" s>{t("Paquete IP 192.168.1.10 → 10.0.0.5 (igual en todo el viaje)")}</Box>
      <Line x1={60} y1={120} x2={560} y2={120} />
      <Dev x={60} y={120} icon="pc" label="PC A" />
      <Dev x={200} y={120} icon="switch" />
      <Dev x={360} y={120} icon="router" label={t("Router")} c="var(--accent)" />
      <Dev x={560} y={120} icon="server" label={t("Servidor")} />
      <Box x={60} y={186} w={296} h={30} c="var(--arp)" s>{t("Trama 1: MAC A → MAC del router")}</Box>
      <Box x={364} y={186} w={196} h={30} c="var(--arp)" s>{t("Trama 2: router → servidor")}</Box>
      <T x={360} y={236} s m dim>TTL 64 → 63</T>
    </Svg>
  );
}

// --- concepts -----------------------------------------------------------------

function SwitchTable() {
  const t = useT();
  return (
    <Svg h={262} label={t("La tabla MAC de un switch")}>
      <Line x1={80} y1={56} x2={220} y2={130} />
      <Line x1={80} y1={206} x2={220} y2={130} />
      <Line x1={360} y1={206} x2={220} y2={130} />
      <Dev x={80} y={56} icon="pc" label="A" sub="MAC aa:aa" />
      <Dev x={80} y={206} icon="pc" label="B" sub="MAC bb:bb" />
      <Dev x={360} y={206} icon="pc" label="C" sub="MAC cc:cc" />
      <Dev x={220} y={130} icon="switch" c="var(--accent)" />
      <T x={178} y={100} s m dim>1</T><T x={178} y={176} s m dim>2</T><T x={266} y={176} s m dim>3</T>
      <Arrow x1={104} y1={52} x2={196} y2={102} c="var(--arp)" />
      <T x={170} y={46} a="start" s c="var(--arp)">{t("aa:aa → bb:bb")}</T>
      <Arrow x1={194} y1={156} x2={110} y2={204} c="var(--ok)" />
      <rect x={420} y={30} width={200} height={170} rx={12} className="f-node" />
      <T x={520} y={54} b s>{t("Tabla MAC")}</T>
      <T x={450} y={80} a="start" s dim>MAC</T><T x={560} y={80} a="start" s dim>{t("Puerto")}</T>
      <Line x1={432} y1={88} x2={608} y2={88} />
      <T x={450} y={112} a="start" s m c="var(--accent)">aa:aa</T><T x={560} y={112} a="start" s m c="var(--accent)">1</T>
      <T x={450} y={140} a="start" s m>bb:bb</T><T x={560} y={140} a="start" s m>2</T>
      <T x={450} y={168} a="start" s m dim>cc:cc</T><T x={560} y={168} a="start" s m dim>—</T>
      <T x={520} y={222} s c="var(--accent)">{t("aprende el origen")}</T>
      <T x={520} y={240} s c="var(--ok)">{t("reenvía solo por el puerto del destino")}</T>
    </Svg>
  );
}

function Domains() {
  const t = useT();
  const side = (x0: number, sw: number) => [0, 1, 2].map(i => {
    const x = x0 + i * 90;
    return (
      <g key={x}>
        <ellipse cx={x} cy={112} rx={38} ry={66} className="f-zone" style={{ "--c": "var(--accent)" } as CSSProperties} />
        <Line x1={x} y1={70} x2={sw} y2={170} />
        <Dev x={x} y={70} icon="pc" />
      </g>
    );
  });
  return (
    <Svg h={262} label={t("Dominios de colisión y de difusión")}>
      <Zone x={10} y={16} w={290} h={236} label={t("Dominio de difusión 1")} c="var(--dhcp)" below />
      <Zone x={380} y={16} w={250} h={236} label={t("Dominio de difusión 2")} c="var(--dhcp)" below />
      {side(60, 150)}
      {[0, 1].map(i => <g key={i}><Line x1={460 + i * 90} y1={70} x2={505} y2={170} />
        <ellipse cx={460 + i * 90} cy={112} rx={38} ry={66} className="f-zone" style={{ "--c": "var(--accent)" } as CSSProperties} />
        <Dev x={460 + i * 90} y={70} icon="pc" /></g>)}
      <Line x1={150} y1={170} x2={505} y2={170} />
      <Dev x={150} y={170} icon="switch" />
      <Dev x={505} y={170} icon="switch" />
      <Dev x={340} y={170} icon="router" c="var(--accent)" />
      <T x={340} y={214} s b>{t("Router")}</T>
      <T x={340} y={124} s c="var(--accent)">{t("cada óvalo:")}</T>
      <T x={340} y={140} s c="var(--accent)">{t("un dominio de colisión")}</T>
    </Svg>
  );
}

function Vlan() {
  const t = useT();
  const v10 = "var(--icmp)", v20 = "var(--tcp)";
  return (
    <Svg h={290} label={t("Dos VLAN en dos switches unidos por un troncal")}>
      <Line x1={84} y1={66} x2={200} y2={150} c={v10} w={2.4} />
      <Line x1={84} y1={234} x2={200} y2={150} c={v20} w={2.4} />
      <Line x1={556} y1={66} x2={440} y2={150} c={v10} w={2.4} />
      <Line x1={556} y1={234} x2={440} y2={150} c={v20} w={2.4} />
      <Line x1={200} y1={146} x2={440} y2={146} c={v10} w={2.4} />
      <Line x1={200} y1={154} x2={440} y2={154} c={v20} w={2.4} />
      <Dev x={84} y={66} icon="pc" label="PC" sub="VLAN 10" c={v10} />
      <Dev x={84} y={234} icon="pc" label="PC" sub="VLAN 20" c={v20} />
      <Dev x={556} y={66} icon="pc" label="PC" sub="VLAN 10" c={v10} />
      <Dev x={556} y={234} icon="pc" label="PC" sub="VLAN 20" c={v20} />
      <Dev x={200} y={150} icon="switch" label="SW1" />
      <Dev x={440} y={150} icon="switch" label="SW2" />
      <T x={320} y={132} s b>{t("Troncal 802.1Q")}</T>
      <rect x={262} y={168} width={36} height={24} rx={4} className="f-solid" style={{ "--c": v10 } as CSSProperties} />
      <rect x={298} y={168} width={80} height={24} rx={4} className="f-tint" style={{ "--c": "var(--ink-3)" } as CSSProperties} />
      <T x={280} y={185} s m b c="var(--surface)">10</T>
      <T x={338} y={185} s>{t("trama")}</T>
      <T x={320} y={212} s dim>{t("cada trama lleva su VLAN")}</T>
      <T x={84} y={22} s dim>{t("puertos de acceso")}</T>
    </Svg>
  );
}

function RoutingTable() {
  const t = useT();
  const rows: [string, string, string, string, boolean][] = [
    ["192.168.1.0/24", tx("conectada"), "ether1", tx("No"), false],
    ["10.0.0.0/8", "192.0.2.1", "ether2", tx("Sí · /8"), false],
    ["10.1.0.0/16", "192.0.2.2", "ether2", tx("Sí · /16 → gana"), true],
    ["0.0.0.0/0", "203.0.113.1", "ether3", tx("Sí · /0"), false],
  ];
  const cols = [30, 200, 340, 450];
  return (
    <Svg h={254} label={t("Una tabla de rutas y la ruta ganadora")}>
      <T x={30} y={24} a="start" b>{t("Tabla de rutas de R1 · paquete hacia 10.1.2.3")}</T>
      {[tx("Destino"), tx("Siguiente salto"), tx("Interfaz"), tx("¿Coincide?")].map((head, i) => <T key={head} x={cols[i]} y={56} a="start" s dim>{t(head)}</T>)}
      {rows.map(([dst, via, dev, match, win], r) => {
        const y = 66 + r * 40;
        return (
          <g key={dst}>
            {win && <rect x={20} y={y} width={600} height={34} rx={8} className="f-tint" style={{ "--c": "var(--ok)" } as CSSProperties} />}
            <T x={cols[0]} y={y + 22} a="start" m s>{dst}</T>
            <T x={cols[1]} y={y + 22} a="start" m s>{t(via)}</T>
            <T x={cols[2]} y={y + 22} a="start" m s>{dev}</T>
            <T x={cols[3]} y={y + 22} a="start" s b={win} c={win ? "var(--ok)" : r === 0 ? "var(--ink-3)" : undefined}>{t(match)}</T>
          </g>
        );
      })}
      <T x={320} y={242} s>{t("Gana la coincidencia de prefijo más largo: la ruta más concreta.")}</T>
    </Svg>
  );
}

function Ports() {
  const t = useT();
  return (
    <Svg h={226} label={t("Dos conexiones a dos servicios del mismo servidor")}>
      <Dev x={80} y={112} icon="pc" label="PC" sub="192.168.1.10" />
      <rect x={400} y={20} width={222} height={190} rx={16} className="f-node" />
      <T x={511} y={44} s b>{t("Servidor 203.0.113.20")}</T>
      <Box x={430} y={66} w={160} h={40} c="var(--http)">{t("Web · :443")}</Box>
      <Box x={430} y={140} w={160} h={40} c="var(--ok)">{t("SSH · :22")}</Box>
      <Arrow x1={108} y1={100} x2={428} y2={86} c="var(--http)" />
      <Arrow x1={108} y1={124} x2={428} y2={160} c="var(--ok)" />
      <T x={262} y={80} s m halo>:51514 → :443</T>
      <T x={262} y={160} s m halo>:51515 → :22</T>
    </Svg>
  );
}

function TcpHandshake() {
  const t = useT();
  return (
    <Svg h={290} label={t("El saludo en tres pasos de TCP")}>
      <Seq left={t("Cliente")} right={t("Servidor")} bottom={280} msgs={[
        { label: "SYN · seq=100", to: "right" },
        { label: "SYN-ACK · seq=300 ack=101", to: "left" },
        { label: "ACK · ack=301", to: "right" },
        { label: t("datos"), to: "right", c: "var(--http)" },
      ]} notesLeft={[[0, "SYN_SENT"], [2, "ESTABLISHED"]]} notesRight={[[0, "LISTEN"], [1, "SYN_RCVD"], [3, "ESTABLISHED"]]} />
    </Svg>
  );
}

function TcpReliability() {
  const t = useT();
  return (
    <Svg h={384} label={t("Una pérdida y su retransmisión en TCP")}>
      <Seq left={t("Emisor")} right={t("Receptor")} step={46} bottom={376} msgs={[
        { label: "seq=1 · 1000 B", to: "right" },
        { label: "ACK 1001", to: "left", c: "var(--ok)" },
        { label: "seq=1001 · 1000 B", to: "right", lost: true },
        { label: "seq=2001 · 1000 B", to: "right" },
        { label: t("ACK 1001 (repetido)"), to: "left", c: "var(--arp)" },
        { label: t("seq=1001 · otra vez"), to: "right", c: "var(--tcp)" },
        { label: "ACK 3001", to: "left", c: "var(--ok)" },
      ]} notesLeft={[[5, t("retransmite")]]} notesRight={[[2, t("perdido")]]} />
    </Svg>
  );
}

function TcpClose() {
  const t = useT();
  return (
    <Svg h={290} label={t("El cierre de una conexión TCP")}>
      <Seq left={t("Cliente")} right={t("Servidor")} bottom={280} msgs={[
        { label: "FIN", to: "right", c: "var(--tcp)" },
        { label: "ACK", to: "left", c: "var(--ok)" },
        { label: "FIN", to: "left", c: "var(--tcp)" },
        { label: "ACK", to: "right", c: "var(--ok)" },
      ]} notesLeft={[[0, "FIN_WAIT_1"], [1, "FIN_WAIT_2"], [3, "TIME_WAIT"]]} notesRight={[[0, "CLOSE_WAIT"], [2, "LAST_ACK"], [3, "CLOSED"]]} />
    </Svg>
  );
}

function Udp() {
  const t = useT();
  return (
    <Svg h={320} label={t("TCP frente a UDP")}>
      <T x={165} y={18} b>TCP</T>
      <T x={475} y={18} b>UDP</T>
      <Seq left={t("Cliente")} right={t("Servidor")} x1={70} x2={260} top={30} boxW={96} step={44} bottom={310} msgs={[
        { label: "SYN", to: "right" }, { label: "SYN-ACK", to: "left" }, { label: "ACK", to: "right" },
        { label: t("datos"), to: "right", c: "var(--http)" }, { label: "ACK", to: "left", c: "var(--ok)" },
      ]} />
      <Seq left={t("Cliente")} right={t("Servidor")} x1={380} x2={570} top={30} boxW={96} step={44} bottom={310} msgs={[
        { label: t("datos 1"), to: "right", c: "var(--http)" }, { label: t("datos 2"), to: "right", c: "var(--http)" },
        { label: t("datos 3"), to: "right", lost: true }, { label: t("datos 4"), to: "right", c: "var(--http)" },
      ]} />
    </Svg>
  );
}

function Traceroute() {
  const t = useT();
  const xs = [60, 220, 380, 560];
  return (
    <Svg h={290} label={t("traceroute: cada TTL descubre un salto")}>
      <Line x1={60} y1={56} x2={560} y2={56} />
      <Dev x={60} y={56} icon="pc" label="PC" />
      <Dev x={220} y={56} icon="router" label="R1" />
      <Dev x={380} y={56} icon="router" label="R2" />
      <Dev x={560} y={56} icon="server" label={t("Destino")} />
      {[1, 2, 3].map(ttl => {
        const y = 120 + (ttl - 1) * 58, end = xs[ttl];
        const last = ttl === 3;
        return (
          <g key={ttl}>
            <Arrow x1={64} y1={y} x2={end - 4} y2={y} c="var(--icmp)" />
            <T x={70} y={y - 6} a="start" s m c="var(--icmp)">TTL={ttl}</T>
            <Arrow x1={end - 4} y1={y + 16} x2={64} y2={y + 16} c={last ? "var(--ok)" : "var(--arp)"} dash />
            <T x={end - 10} y={y + 32} a="end" s c={last ? "var(--ok)" : "var(--arp)"}>{last ? t("respuesta del destino") : t("Time Exceeded desde R{n}", { n: ttl })}</T>
          </g>
        );
      })}
    </Svg>
  );
}

function Dhcp() {
  const t = useT();
  const c = "var(--dhcp)";
  return (
    <Svg h={290} label={t("El intercambio DORA de DHCP")}>
      <Seq left={t("Cliente")} right={t("Servidor DHCP")} bottom={280} msgs={[
        { label: t("Discover · difusión"), to: "right", c, dash: true },
        { label: t("Offer · 192.168.1.50"), to: "left", c },
        { label: t("Request · difusión"), to: "right", c, dash: true },
        { label: t("Ack · concesión de 24 h"), to: "left", c: "var(--ok)" },
      ]} notesLeft={[[0, "0.0.0.0"], [3, "192.168.1.50/24"]]} notesRight={[[0, ":67"]]} />
    </Svg>
  );
}

function Dns() {
  const t = useT();
  const res = [250, 160];
  const servers: [number, string, string][] = [[54, t("Raíz"), "."], [160, "TLD", ".com"], [266, t("Autoritativo"), "ejemplo.com"]];
  return (
    <Svg h={320} label={t("La resolución de un nombre DNS")}>
      <Line x1={60} y1={160} x2={250} y2={160} />
      <Dev x={60} y={160} icon="pc" label="PC" />
      <Dev x={250} y={160} icon="server" label={t("Resolvedor")} c="var(--dns)" />
      <Arrow x1={88} y1={148} x2={222} y2={148} c="var(--dns)" />
      <Arrow x1={222} y1={172} x2={88} y2={172} c="var(--ok)" />
      <T x={155} y={140} s m halo>① www.ejemplo.com?</T>
      <T x={155} y={190} s m halo c="var(--ok)">⑧ 93.184.216.34</T>
      {servers.map(([y, name, zone], i) => (
        <g key={zone}>
          <Dev x={540} y={y} icon="globe" label={name} sub={zone} />
          <Arrow x1={278} y1={res[1] - 8 + (i - 1) * 6} x2={512} y2={y - 8} c="var(--dns)" />
          <Arrow x1={512} y1={y + 8} x2={278} y2={res[1] + 8 + (i - 1) * 6} c={i === 2 ? "var(--ok)" : "var(--ink-3)"} dash={i < 2} />
          <T x={400} y={(y + res[1]) / 2 - 14 + (i === 1 ? -6 : 0)} s halo c={i === 2 ? "var(--ok)" : undefined}>
            {i === 0 ? t("②③ pregunta a .com") : i === 1 ? t("④⑤ pregunta a ejemplo.com") : t("⑥⑦ A 93.184.216.34")}
          </T>
        </g>
      ))}
    </Svg>
  );
}

function Nat() {
  const t = useT();
  return (
    <Svg h={270} label={t("NAT: el router cambia la dirección privada por la pública")}>
      <Zone x={16} y={14} w={340} h={146} label={t("Red privada")} />
      <Line x1={70} y1={96} x2={570} y2={96} />
      <Dev x={70} y={96} icon="pc" label="PC" sub="192.168.1.10" />
      <Dev x={330} y={96} icon="router" label={t("Router")} sub="203.0.113.7" c="var(--accent)" />
      <Dev x={570} y={96} icon="server" label={t("Servidor web")} sub="93.184.216.34" />
      <T x={200} y={78} s m halo>192.168.1.10:51514</T>
      <T x={450} y={78} s m halo c="var(--accent)">203.0.113.7:40001</T>
      <rect x={150} y={190} width={340} height={66} rx={12} className="f-node" />
      <T x={320} y={212} s b>{t("Tabla NAT del router")}</T>
      <T x={320} y={238} s m>192.168.1.10:51514 ↔ 203.0.113.7:40001</T>
    </Svg>
  );
}

// --- references ---------------------------------------------------------------

function EthernetFrame() {
  const t = useT();
  const fields: [string, string, number, string][] = [
    [tx("MAC destino"), "6 B", 104, "var(--arp)"], [tx("MAC origen"), "6 B", 104, "var(--arp)"], [tx("Tipo"), "2 B", 64, "var(--arp)"],
    [tx("Carga útil"), "46–1500 B", 250, "var(--icmp)"], ["FCS", "4 B", 68, "var(--arp)"],
  ];
  let x = 25;
  return (
    <Svg h={160} label={t("Los campos de una trama Ethernet")}>
      <Brace x1={25} x2={293} y={42} label={t("Cabecera · 14 bytes")} up c="var(--arp)" />
      <Brace x1={545} x2={613} y={42} label={t("Cola")} up c="var(--arp)" />
      {fields.map(([name, size, w, c]) => {
        const at = x;
        x += w;
        return <g key={name}><Box x={at} y={50} w={w - 2} h={54} c={c} s>{t(name)}</Box><T x={at + w / 2} y={128} s m dim>{size}</T></g>;
      })}
    </Svg>
  );
}

function Ipv4Header() {
  const t = useT();
  const rows: [string, number][][] = [
    [[tx("Versión"), 4], ["IHL", 4], ["DSCP/ECN", 8], [tx("Longitud total"), 16]],
    [[tx("Identificación"), 16], ["Flags", 3], [tx("Desplazamiento"), 13]],
    [["TTL", 8], [tx("Protocolo"), 8], [tx("Suma de comprobación"), 16]],
    [[tx("IP de origen"), 32]],
    [[tx("IP de destino"), 32]],
  ];
  return (
    <Svg h={244} label={t("La cabecera IPv4")}>
      <Fields rows={rows.map(row => row.map(([label, bits]) => [t(label), bits]))} mark={["TTL", t("Protocolo"), t("IP de origen"), t("IP de destino")]} />
    </Svg>
  );
}

function TcpHeader() {
  const t = useT();
  const rows: [string, number][][] = [
    [[tx("Puerto de origen"), 16], [tx("Puerto de destino"), 16]],
    [[tx("Número de secuencia"), 32]],
    [[tx("Número de confirmación"), 32]],
    [[tx("Long."), 4], ["Res.", 3], ["Flags", 9], [tx("Ventana"), 16]],
    [[tx("Suma de comprobación"), 16], [tx("Puntero urgente"), 16]],
  ];
  return (
    <Svg h={244} label={t("La cabecera TCP")}>
      <Fields rows={rows.map(row => row.map(([label, bits]) => [t(label), bits]))} mark={[t("Puerto de origen"), t("Puerto de destino"), "Flags", t("Número de secuencia"), t("Número de confirmación"), t("Ventana")]} />
    </Svg>
  );
}

function UdpHeader() {
  const t = useT();
  const rows: [string, number][][] = [
    [[tx("Puerto de origen"), 16], [tx("Puerto de destino"), 16]],
    [[tx("Longitud"), 16], [tx("Suma de comprobación"), 16]],
  ];
  return (
    <Svg h={160} label={t("La cabecera UDP")}>
      <Fields rows={rows.map(row => row.map(([label, bits]) => [t(label), bits]))} mark={[t("Puerto de origen"), t("Puerto de destino"), t("Longitud"), t("Suma de comprobación")]} />
      <T x={320} y={146} s dim>{t("8 bytes, y después los datos")}</T>
    </Svg>
  );
}

function Subnetting() {
  const t = useT();
  const colors = ["var(--accent)", "var(--ok)", "var(--tcp)", "var(--dhcp)"];
  return (
    <Svg h={206} label={t("Una /24 dividida en cuatro /26")}>
      <Box x={40} y={24} w={560} h={40} c="var(--ink-3)" m s>{t("192.168.1.0/24 · 256 direcciones")}</Box>
      {[0, 1, 2, 3].map(i => {
        const x = 40 + i * 140;
        return (
          <g key={i}>
            <Line x1={x + 70} y1={64} x2={x + 70} y2={96} />
            <Box x={x + 2} y={96} w={136} h={52} c={colors[i]} />
            <T x={x + 70} y={118} m s b>{`.${i * 64}/26`}</T>
            <T x={x + 70} y={136} m s dim>{`.${i * 64 + 1}–.${i * 64 + 62}`}</T>
          </g>
        );
      })}
      {[0, 64, 128, 192, 255].map((n, i) => <T key={n} x={40 + i * 140} y={176} s m dim a={i === 0 ? "start" : i === 4 ? "end" : "middle"}>{n}</T>)}
      <T x={320} y={198} s>{t("Cada /26: 64 direcciones, 62 para equipos")}</T>
    </Svg>
  );
}

function Ipv6() {
  const t = useT();
  const groups = ["2001", "0db8", "0000", "0000", "0000", "0000", "0000", "0001"];
  return (
    <Svg h={206} label={t("Una dirección IPv6 y su forma abreviada")}>
      {groups.map((group, i) => (
        <g key={i}>
          <Box x={24 + i * 74} y={30} w={64} h={40} c={i < 4 ? "var(--accent)" : "var(--ok)"} m s>{group}</Box>
          {i < 7 && <T x={24 + i * 74 + 69} y={56} b>:</T>}
        </g>
      ))}
      <Brace x1={24} x2={310} y={80} label={t("Prefijo de red · 64 bits")} c="var(--accent)" />
      <Brace x1={320} x2={606} y={80} label={t("Interfaz · 64 bits")} c="var(--ok)" />
      <Box x={170} y={146} w={300} h={42} c="var(--accent)" m solid />
      <T x={320} y={173} m b c="var(--accent-ink)">2001:db8::1</T>
      <T x={160} y={173} a="end" s dim>{t("abreviada")}</T>
    </Svg>
  );
}

function Troubleshoot() {
  const t = useT();
  const steps: [string, string][] = [
    [tx("Enlace: ¿interfaz activa?"), "ip link"],
    [tx("Dirección: ¿IP y máscara?"), "ip addr"],
    [tx("Red local: ¿responde un vecino?"), "ping 192.168.1.20"],
    [tx("Puerta de enlace: ¿responde?"), "ping 192.168.1.1"],
    [tx("Rutas: ¿ida y vuelta?"), "traceroute -n"],
    [tx("Nombres: ¿resuelve?"), "nslookup web.lab"],
    [tx("Servicio: ¿escucha?"), "ss -tulpn"],
  ];
  const colors = ["var(--ok)", "var(--arp)", "var(--arp)", "var(--icmp)", "var(--icmp)", "var(--dns)", "var(--http)"];
  return (
    <Svg h={372} label={t("Diagnóstico por capas, de abajo arriba")}>
      {steps.map(([name, cmd], i) => {
        const y = 322 - i * 48;
        return (
          <g key={name}>
            <rect x={56} y={y} width={564} height={40} rx={10} className="f-tint" style={{ "--c": colors[i] } as CSSProperties} />
            <T x={76} y={y + 25} a="start" b s>{`${i + 1}. ${t(name)}`}</T>
            <T x={604} y={y + 25} a="end" m s>{cmd}</T>
          </g>
        );
      })}
      <Arrow x1={30} y1={356} x2={30} y2={26} c="var(--ink-3)" />
    </Svg>
  );
}

export const FIGURES: Record<string, () => ReactNode> = {
  network: Network, topologies: Topologies, media: Media, packet: Packet, osi: Osi, encapsulation: Encapsulation, tcpip: TcpIp,
  binary: Binary, ipv4: Ipv4, mask: Mask, gateway: Gateway, mac: Mac, arp: Arp, journey: Journey,
  "switch-table": SwitchTable, domains: Domains, vlan: Vlan, "routing-table": RoutingTable, ports: Ports,
  "tcp-handshake": TcpHandshake, "tcp-reliability": TcpReliability, "tcp-close": TcpClose, udp: Udp, traceroute: Traceroute,
  dhcp: Dhcp, dns: Dns, nat: Nat,
  "ethernet-frame": EthernetFrame, "ipv4-header": Ipv4Header, "tcp-header": TcpHeader, "udp-header": UdpHeader,
  subnetting: Subnetting, ipv6: Ipv6, troubleshoot: Troubleshoot,
};
