// The landing page: what a visitor without a session sees first. What the
// platform is (learning networking by breaking and fixing labs, in the manner
// of a hacking lab), shown more than told: a network whose packets travel on
// its cables, a terminal that solves a machine, the learning path, a few
// machines, the systems the labs run (and those coming), how it works, and
// the way in. It has its own look (always dark) and its own styles, loaded
// with it; motion stops for those who ask for less.
import { EXERCISES, LEVEL_LABEL, PROTOCOLS, BOX_COLOR, type Exercise } from "@visual-tracert/model";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { iconPaths, Icon } from "../editor/icons";
import { LANGS, tx, useLang, useT } from "../i18n";
import { MachineAvatar } from "../practice/MachineAvatar";
import { BRANDS } from "./brands";
import "./landing.css";

const STAGE = __APP_STAGE__;
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** shows its children once they scroll into view */
function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if(!element || typeof IntersectionObserver === "undefined"){ setShown(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if(entry.isIntersecting){ setShown(true); observer.disconnect(); } }, { threshold: 0.15 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`lp-reveal${shown ? " in" : ""} ${className}`} style={{ "--delay": `${delay}ms` } as CSSProperties}>{children}</div>;
}

// --- the network of the hero ------------------------------------------------------

const NODES: { id: string; x: number; y: number; icon: string; label: string }[] = [
  { id: "net", x: 300, y: 48, icon: "cloud", label: "Internet" },
  { id: "r1", x: 300, y: 150, icon: "router", label: "R1" },
  { id: "fw", x: 470, y: 150, icon: "firewall", label: "FW" },
  { id: "sw1", x: 165, y: 255, icon: "switch", label: "SW1" },
  { id: "sw2", x: 435, y: 255, icon: "switch", label: "SW2" },
  { id: "pc1", x: 70, y: 365, icon: "pc", label: "PC1" },
  { id: "pc2", x: 200, y: 380, icon: "laptop", label: "PC2" },
  { id: "srv", x: 400, y: 380, icon: "server", label: "DNS" },
  { id: "pc3", x: 530, y: 365, icon: "pc", label: "PC3" },
];
const at = (id: string) => NODES.find(node => node.id === id)!;
const LINKS: [string, string][] = [["net", "r1"], ["r1", "fw"], ["r1", "sw1"], ["r1", "sw2"], ["sw1", "pc1"], ["sw1", "pc2"], ["sw2", "srv"], ["sw2", "pc3"]];
const route = (...ids: string[]) => ids.map((id, i) => `${i ? "L" : "M"}${at(id).x} ${at(id).y}`).join(" ");
const PACKETS: { path: string; color: string; dur: number; begin: number; label: string }[] = [
  { path: route("pc1", "sw1", "r1", "net"), color: "var(--lp-icmp)", dur: 3.2, begin: 0, label: "ICMP" },
  { path: route("pc3", "sw2", "srv"), color: "var(--lp-dns)", dur: 2.2, begin: 0.8, label: "DNS" },
  { path: route("pc2", "sw1", "r1", "sw2", "srv"), color: "var(--lp-tcp)", dur: 3.6, begin: 1.6, label: "TCP" },
  { path: route("pc1", "sw1", "pc2"), color: "var(--lp-arp)", dur: 1.8, begin: 2.4, label: "ARP" },
  { path: route("net", "r1", "fw"), color: "var(--lp-icmp)", dur: 2.4, begin: 3.1, label: "ICMP" },
  { path: route("srv", "sw2", "pc3"), color: "var(--lp-dns)", dur: 2.2, begin: 3.8, label: "DNS" },
];

function HeroNetwork() {
  const t = useT();
  const still = reduced();
  return (
    <svg className="lp-net" viewBox="0 0 600 470" role="img" aria-label={t("Una red con routers, switches y equipos, con paquetes viajando por sus cables")}>
      <defs>
        <radialGradient id="lp-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--lp-accent)" stopOpacity=".35" />
          <stop offset="1" stopColor="var(--lp-accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="300" cy="220" r="230" fill="url(#lp-glow)" />
      {LINKS.map(([a, b]) => <line key={a + b} x1={at(a).x} y1={at(a).y} x2={at(b).x} y2={at(b).y} className="lp-cable" />)}
      {!still && PACKETS.map((packet, i) => (
        <g key={i}>
          <circle r="6" fill={packet.color} className="lp-packet">
            <animateMotion path={packet.path} dur={`${packet.dur}s`} begin={`${packet.begin}s`} repeatCount="indefinite" rotate="0" keyPoints="0;1" keyTimes="0;1" calcMode="linear" />
          </circle>
          <circle r="12" fill={packet.color} opacity=".25">
            <animateMotion path={packet.path} dur={`${packet.dur}s`} begin={`${packet.begin}s`} repeatCount="indefinite" />
          </circle>
        </g>
      ))}
      {NODES.map((node, i) => (
        <g key={node.id} className="lp-node" style={{ "--i": i } as CSSProperties}>
          <rect x={node.x - 26} y={node.y - 26} width="52" height="52" rx="14" />
          <g transform={`translate(${node.x - 13} ${node.y - 13}) scale(${26 / 24})`} className="lp-node-icon">
            {iconPaths(node.icon).map(d => <path key={d} d={d} />)}
          </g>
          <text x={node.x} y={node.y + 44} textAnchor="middle">{node.label}</text>
        </g>
      ))}
      <g className="lp-legend">
        {[["ARP", "var(--lp-arp)"], ["ICMP", "var(--lp-icmp)"], ["TCP", "var(--lp-tcp)"], ["DNS", "var(--lp-dns)"]].map(([name, color], i) => (
          <g key={name} transform={`translate(${170 + i * 72} 458)`}><circle r="5" fill={color} /><text x="11" y="4">{name}</text></g>
        ))}
      </g>
    </svg>
  );
}

// --- the terminal that solves a machine --------------------------------------------

const SESSION: { kind: "cmd" | "out" | "bad" | "good" | "win"; text: string }[] = [
  { kind: "cmd", text: "ping -c 2 10.0.0.10" },
  { kind: "bad", text: "connect: Network is unreachable" },
  { kind: "cmd", text: "ip route" },
  { kind: "out", text: "192.168.1.0/24 dev eth0 proto kernel scope link" },
  { kind: "cmd", text: "ip route add default via 192.168.1.1" },
  { kind: "cmd", text: "ping -c 2 10.0.0.10" },
  { kind: "good", text: "64 bytes from 10.0.0.10: icmp_seq=1 ttl=63 time=0.41 ms" },
  { kind: "good", text: "64 bytes from 10.0.0.10: icmp_seq=2 ttl=63 time=0.38 ms" },
  { kind: "win", text: tx("✓ «Puerta Cerrada» superada en Medio · +20 XP") },
];

function Terminal() {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState(reduced() ? SESSION.length : 0);
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if(reduced()) return;
    const element = ref.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    // a command typed letter by letter, its output at once, then the next one; again from the start
    const step = (line: number, chars: number) => {
      if(line >= SESSION.length){ timer = setTimeout(() => { setLines(0); setTyped(0); step(0, 0); }, 4500); return; }
      const current = SESSION[line];
      if(current.kind === "cmd" && chars < current.text.length){
        setLines(line); setTyped(chars + 1);
        timer = setTimeout(() => step(line, chars + 1), 38 + Math.random() * 40);
        return;
      }
      setLines(line + 1); setTyped(0);
      timer = setTimeout(() => step(line + 1, 0), current.kind === "cmd" ? 420 : 260);
    };
    const observer = new IntersectionObserver(([entry]) => { if(entry.isIntersecting && !running){ running = true; step(0, 0); } }, { threshold: 0.3 });
    if(element) observer.observe(element);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, []);
  const shown = SESSION.slice(0, lines);
  const typing = !reduced() && lines < SESSION.length && SESSION[lines]?.kind === "cmd" && typed > 0 ? SESSION[lines].text.slice(0, typed) : null;
  return (
    <div className="lp-terminal" ref={ref} aria-label={t("Una sesión de terminal que resuelve una máquina")}>
      <div className="lp-terminal-bar"><i /><i /><i /><span>root@pc · {t("Puerta Cerrada")} · {t("Medio")}</span></div>
      <pre>
        {shown.map((line, i) => (
          <div key={i} className={`lp-line ${line.kind}`}>{line.kind === "cmd" && <span className="lp-prompt">pc:~# </span>}{line.kind === "win" ? t(line.text) : line.text}</div>
        ))}
        {typing !== null && <div className="lp-line cmd"><span className="lp-prompt">pc:~# </span>{typing}<span className="lp-caret" /></div>}
        {typing === null && lines < SESSION.length && <div className="lp-line cmd"><span className="lp-prompt">pc:~# </span><span className="lp-caret" /></div>}
      </pre>
    </div>
  );
}

// --- the sections -------------------------------------------------------------------

const FEATURES: { icon: string; title: string; text: string; color: string }[] = [
  { icon: "flag", color: "#7dd3fc", title: tx("Starting Point"), text: tx("Tres guías completas, de cero a subnetting, con diagramas, documentos de referencia y un quiz final por nivel.") },
  { icon: "topology", color: "#a3e635", title: tx("Máquinas"), text: tx("Laboratorios con algo roto. En Fácil los arreglas desde la interfaz; en Medio, solo con la CLI de cada equipo.") },
  { icon: "emulation", color: "#fb923c", title: tx("Equipos de verdad"), text: tx("Cada equipo es un contenedor real con Linux, MikroTik RouterOS o Nokia SR Linux, unidos por cables virtuales.") },
  { icon: "layers", color: "#c084fc", title: tx("Tracks"), text: tx("Caminos guiados con un objetivo: switching y VLAN, enrutamiento, servicios de red o la CLI de principio a fin.") },
  { icon: "trophy", color: "#facc15", title: tx("Ranking y seasons"), text: tx("XP, rangos, ranking global y temporadas temáticas. El servidor comprueba cada reto en los equipos reales.") },
  { icon: "users", color: "#f472b6", title: tx("Para aulas"), text: tx("Invitaciones por rol y un panel de alumnos para profesores: quién avanza, qué superó y en cuánto tiempo.") },
];

const TODAY = ["linux", "ubuntu", "debian", "alpinelinux", "mikrotik", "nokia", "docker", "wireshark"];
const SOON = ["huawei", "cisco", "junipernetworks", "fortinet", "openwrt"];

function Brand({ id }: { id: string }) {
  const brand = BRANDS[id];
  return (
    <span className="lp-brand" style={{ "--brand": brand.color } as CSSProperties} title={brand.name}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={brand.path} /></svg>
      <span>{brand.name}</span>
    </span>
  );
}

function MachineCard({ exercise, delay }: { exercise: Exercise; delay: number }) {
  const t = useT();
  return (
    <Reveal delay={delay}>
      <article className="lp-machine" style={{ "--box": BOX_COLOR[exercise.box] } as CSSProperties}>
        <div className="lp-machine-art"><MachineAvatar exercise={exercise} size={92} /></div>
        <h3>{t(exercise.codename)}</h3>
        <span className="lp-machine-meta">{t(LEVEL_LABEL[exercise.level])} · {exercise.protocols.map(id => id.toUpperCase()).join(" · ")}</span>
        <p>{t(exercise.story)}</p>
      </article>
    </Reveal>
  );
}

export function Landing({ onSignIn, onRegister }: { onSignIn: () => void; onRegister: () => void }) {
  const t = useT();
  const lang = useLang(state => state.lang);
  const showcase = ["first-network", "split-vlans", "static-routes", "dns-record"].map(id => EXERCISES.find(item => item.id === id)!).filter(Boolean);
  useEffect(() => { document.title = t("visual-tracert · Aprende redes con laboratorios reales"); }, [t]);
  const stats: [string, string][] = [
    [String(EXERCISES.length), t("máquinas en Fácil y en Medio")],
    ["3", t("guías con diagramas")],
    ["150+", t("preguntas de quiz")],
    [String(PROTOCOLS.length), t("protocolos explicados")],
  ];
  return (
    <div className="lp">
      <div className="lp-bg" aria-hidden="true"><span /><span /><span /></div>
      <header className="lp-nav">
        <a className="lp-logo" href="#top"><span className="brand-mark"><Icon name="logo" size={20} /></span>visual-tracert<span className="lp-stage">{STAGE}</span></a>
        <nav aria-label={t("Secciones")}>
          <a href="#aprende">{t("Aprende")}</a>
          <a href="#laboratorios">{t("Laboratorios")}</a>
          <a href="#equipos">{t("Equipos")}</a>
          <a href="#como">{t("Cómo funciona")}</a>
        </nav>
        <div className="lp-nav-actions">
          <select aria-label={t("Idioma")} value={lang} onChange={event => useLang.getState().setLang(event.target.value as typeof lang)}>
            {LANGS.map(item => <option key={item.id} value={item.id}>{item.short}</option>)}
          </select>
          <button type="button" className="lp-btn ghost" onClick={onSignIn}>{t("Entrar")}</button>
          <button type="button" className="lp-btn" onClick={onRegister}>{t("Crear cuenta")}</button>
        </div>
      </header>

      <main id="top">
        <section className="lp-hero">
          <div className="lp-hero-text">
            <span className="lp-kicker"><i />{t("Retos de networking · laboratorios reales")}</span>
            <h1>{t("Aprende redes")} <span className="lp-grad">{t("rompiendo y arreglando")}</span> {t("laboratorios de verdad.")}</h1>
            <p>{t("Una plataforma de retos al estilo de los laboratorios de hacking, pero de networking: cada máquina es una red con algo roto. Encuentra el fallo, arréglalo desde la CLI de equipos reales y sube en el ranking.")}</p>
            <div className="lp-cta">
              <button type="button" className="lp-btn big" onClick={onRegister}>{t("Empezar ahora")}<Icon name="next" size={18} /></button>
              <button type="button" className="lp-btn big ghost" onClick={onSignIn}>{t("Ya tengo cuenta")}</button>
            </div>
            <dl className="lp-stats">
              {stats.map(([n, label]) => <div key={label}><dt>{n}</dt><dd>{label}</dd></div>)}
            </dl>
          </div>
          <div className="lp-hero-art"><HeroNetwork /></div>
        </section>

        <section className="lp-section lp-split" id="laboratorios">
          <Reveal className="lp-split-text">
            <span className="lp-eyebrow">{t("Así se juega")}</span>
            <h2>{t("Un fallo, una red, tu terminal.")}</h2>
            <p>{t("Despliegas la máquina y tienes unos minutos. En Medio la interfaz se bloquea: solo te quedan los comandos de cada equipo, como en una red de verdad. Cuando crees que está resuelto, el servidor lo comprueba con pings reales.")}</p>
            <ul className="lp-checks">
              <li><Icon name="check" size={16} />{t("Linux con iproute2, MikroTik RouterOS y Nokia SR Linux")}</li>
              <li><Icon name="check" size={16} />{t("DHCP, DNS, web y relay funcionando en los equipos")}</li>
              <li><Icon name="check" size={16} />{t("Capturas de tráfico que se abren en Wireshark")}</li>
              <li><Icon name="check" size={16} />{t("Walkthrough y solución, ocultos hasta que los pidas")}</li>
            </ul>
          </Reveal>
          <Reveal delay={150}><Terminal /></Reveal>
        </section>

        <section className="lp-section" id="aprende">
          <Reveal><span className="lp-eyebrow">{t("Todo en un sitio")}</span><h2>{t("De no saber qué es una IP a resolver averías desde la CLI.")}</h2></Reveal>
          <div className="lp-features">
            {FEATURES.map((feature, i) => (
              <Reveal key={feature.title} delay={i * 80}>
                <article className="lp-feature" style={{ "--c": feature.color } as CSSProperties}>
                  <span className="lp-feature-icon"><Icon name={feature.icon} size={24} /></span>
                  <h3>{t(feature.title)}</h3>
                  <p>{t(feature.text)}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="lp-section">
          <Reveal><span className="lp-eyebrow">{t("Algunas máquinas")}</span><h2>{t("Cada una con su historia, su nivel y sus protocolos.")}</h2></Reveal>
          <div className="lp-machines">{showcase.map((exercise, i) => <MachineCard key={exercise.id} exercise={exercise} delay={i * 90} />)}</div>
        </section>

        <section className="lp-section" id="equipos">
          <Reveal><span className="lp-eyebrow">{t("Equipos")}</span><h2>{t("Los sistemas que te encontrarás en el trabajo.")}</h2></Reveal>
          <Reveal delay={100}>
            <div className="lp-marquee" aria-label={t("Disponibles hoy")}>
              <div className="lp-marquee-track">{[...TODAY, ...TODAY].map((id, i) => <Brand key={`${id}-${i}`} id={id} />)}</div>
            </div>
            <p className="lp-soon-title">{t("En el roadmap")}</p>
            <div className="lp-soon">{SOON.map(id => <Brand key={id} id={id} />)}</div>
            <p className="lp-fine">{t("Las marcas pertenecen a sus dueños y se muestran solo para indicar con qué sistemas se practica o se practicará; ninguno patrocina este proyecto.")}</p>
          </Reveal>
        </section>

        <section className="lp-section" id="como">
          <Reveal><span className="lp-eyebrow">{t("Cómo funciona")}</span><h2>{t("Tres pasos, a tu ritmo.")}</h2></Reveal>
          <ol className="lp-steps">
            {[[tx("Aprende"), tx("Lee las guías del Starting Point, mira cada concepto dibujado y aprueba su quiz."), "book"],
              [tx("Practica"), tx("Juega las máquinas: primero en Fácil, desde la interfaz; después en Medio, desde la CLI."), "emulation"],
              [tx("Compite"), tx("Gana XP, sube de rango, sigue los tracks y entra en las seasons con tu clase o tus amigos."), "trophy"]].map(([title, text, icon], i) => (
              <Reveal key={title} delay={i * 120}>
                <li><span className="lp-step-n">{i + 1}</span><Icon name={icon} size={22} /><h3>{t(title)}</h3><p>{t(text)}</p></li>
              </Reveal>
            ))}
          </ol>
        </section>

        <section className="lp-final">
          <Reveal>
            <h2>{t("¿Listo para tu primera máquina?")}</h2>
            <p>{t("Crea tu cuenta con una invitación y empieza por «Hola, Vecino»: dos PC, un switch y una dirección que falta.")}</p>
            <div className="lp-cta center">
              <button type="button" className="lp-btn big" onClick={onRegister}>{t("Crear cuenta")}<Icon name="next" size={18} /></button>
              <button type="button" className="lp-btn big ghost" onClick={onSignIn}>{t("Entrar")}</button>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="lp-footer">
        <span><span className="brand-mark"><Icon name="logo" size={16} /></span> visual-tracert · v{__APP_VERSION__} {STAGE}</span>
        <span>{t("Hecho para aprender redes.")}</span>
        <span className="lp-fine">{t("Logos de Simple Icons (CC0); el de Debian, CC BY-SA 3.0, de Debian.")}</span>
      </footer>
    </div>
  );
}
