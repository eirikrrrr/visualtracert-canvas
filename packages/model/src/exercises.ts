// Practice: exercises grouped in boxes by topic (IP basics, switching,
// routing, DHCP, DNS and web, troubleshooting…), the boxes laid out as a
// suggested path. Each exercise is a lab to start from (something missing or
// broken), the goals that say it is solved, hints, and its solution (which the
// tests use to prove it can be solved). A goal is checked against the lab
// itself: what it does in the simulation (a ping, a lease, a name resolved, a
// web page) or what it says (a VLAN, a route), so any correct way to solve it
// passes. Texts are Spanish keys, translated where they are shown.
//
// Two difficulties: easy, solved from the interface (the properties, the
// document) and checked in the simulation; medium, solved from each device's
// CLI in the emulation (the interface locked) and checked on the real
// devices. Only the exercises whose goals the emulation can check, with the
// commands its devices have, have a medium one.
import { spanish, tx, type T } from "./i18n";
import { drawLab } from "./templates";
import { updateDevice } from "./topology";
import type { Device, Interface, Topology } from "./types";

export type BoxId = "basics" | "switching" | "routing" | "dhcp" | "services" | "troubleshooting" | "ospf" | "bgp" | "nat";

export interface Box {
  id: BoxId;
  title: string;
  summary: string;
  /** an icon of the app's set */
  icon: string;
  /** not playable yet: why */
  upcoming?: string;
}

/** What a goal checks. A device is named by its id; "to" may also be an IP or a name. */
export type Check =
  | { kind: "ping"; from: string; to: string }
  | { kind: "isolated"; from: string; to: string }
  | { kind: "dhcp"; from: string }
  | { kind: "dns"; from: string; name: string; ip: string }
  | { kind: "http"; from: string; to: string }
  | { kind: "vlan"; device: string; iface: string; vlan: number };

export interface Goal {
  text: string;
  check: Check;
}

export type ExerciseLevel = 1 | 2 | 3;

export interface Exercise {
  id: string;
  box: BoxId;
  level: ExerciseLevel;
  title: string;
  summary: string;
  goals: Goal[];
  hints: string[];
  build: (t?: T) => Topology;
  /** the lab solved: proves the goals can be met */
  solve: (topology: Topology) => Topology;
  /** its "machine" name, to remember it by, and a short story of what happened */
  codename: string;
  story: string;
  /** its avatar: an icon of the app's set */
  icon: string;
  /** its medium difficulty: hints with the CLI's commands */
  cli?: string[];
  /** why it has no medium difficulty */
  cliUnavailable?: string;
}

/** easy: from the interface, checked in the simulation; medium: from the CLI, checked on the real devices */
export type Difficulty = "easy" | "medium";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: tx("Fácil"), medium: tx("Medio") };

/** the points an exercise gives, by level: twice from the CLI */
export const XP: Record<ExerciseLevel, number> = { 1: 10, 2: 20, 3: 40 };
export const xpOf = (exercise: Exercise, difficulty: Difficulty) => XP[exercise.level] * (difficulty === "medium" ? 2 : 1);

/** the ranks, from the points each one starts at */
export const RANKS: { name: string; from: number }[] = [
  { name: tx("Novato"), from: 0 },
  { name: tx("Aprendiz"), from: 40 },
  { name: tx("Técnico"), from: 120 },
  { name: tx("Ingeniero"), from: 240 },
  { name: tx("Arquitecto"), from: 400 },
];

/** the colour of each box, for its exercises' avatars */
export const BOX_COLOR: Record<BoxId, string> = {
  basics: "#22a06b", switching: "#9b6dff", routing: "#e2832b", dhcp: "#0fa5b5",
  services: "#3d7eff", troubleshooting: "#d64545", ospf: "#7a8699", bgp: "#7a8699", nat: "#7a8699",
};

/** the minutes an attempt has: more from the CLI, more the harder the level */
export const TIME_LIMIT: Record<Difficulty, Record<ExerciseLevel, number>> = {
  easy: { 1: 5, 2: 8, 3: 12 },
  medium: { 1: 10, 2: 15, 3: 20 },
};

const NO_BRIDGE = tx("Los switches genéricos no traen el comando bridge para cambiar la VLAN de un puerto desde su CLI.");
const NO_SERVICES = tx("DHCP, DNS y web aún no se emulan: este reto solo se comprueba en la simulación.");

export const LEVEL_LABEL: Record<ExerciseLevel, string> = { 1: tx("Básico"), 2: tx("Intermedio"), 3: tx("Avanzado") };

export const BOXES: Box[] = [
  { id: "basics", title: tx("Fundamentos IP"), summary: tx("Direcciones, máscaras y la primera red: quién está en la misma red y quién no."), icon: "pc" },
  { id: "switching", title: tx("Switching y VLAN"), summary: tx("Un switch reparte tramas; las VLAN lo parten en redes separadas."), icon: "switch" },
  { id: "routing", title: tx("Enrutamiento"), summary: tx("Puertas de enlace, rutas estáticas y la ruta por defecto hacia Internet."), icon: "router" },
  { id: "dhcp", title: tx("DHCP"), summary: tx("Que los equipos reciban su dirección solos, también a través de un router."), icon: "server" },
  { id: "services", title: tx("DNS y web"), summary: tx("Nombres que se resuelven y páginas que llegan, por encima de IP."), icon: "globe" },
  { id: "troubleshooting", title: tx("Diagnóstico"), summary: tx("Redes con averías escondidas: encuéntralas con ping y traza."), icon: "search" },
  { id: "ospf", title: "OSPF", summary: tx("Enrutamiento dinámico dentro de una organización: áreas, vecinos y costes."), icon: "router",
    upcoming: tx("Llegará con el enrutamiento dinámico en config y FRR en la emulación.") },
  { id: "bgp", title: "BGP", summary: tx("El enrutamiento entre proveedores: sistemas autónomos y anuncios."), icon: "globe",
    upcoming: tx("Llegará con el enrutamiento dinámico en config y FRR en la emulación.") },
  { id: "nat", title: "NAT", summary: tx("Muchas direcciones privadas detrás de una pública."), icon: "firewall",
    upcoming: tx("Llegará cuando la simulación traduzca direcciones.") },
];

// small helpers for the solutions
const port = (topology: Topology, device: string, iface: string, change: Partial<Interface>) =>
  updateDevice(topology, device, item => ({ ...item, interfaces: item.interfaces.map(each => each.name === iface ? { ...each, ...change } : each) }));
const device = (topology: Topology, id: string, change: Partial<Device>) => updateDevice(topology, id, item => ({ ...item, ...change }));

/** an exercise drawn with the labs' builder */
function exercise(seed: number, meta: Omit<Exercise, "build">, draw: (net: ReturnType<typeof drawLab>, t: T) => void): Exercise {
  return {
    ...meta,
    build: (t = spanish) => {
      const net = drawLab(seed, t(meta.title));
      draw(net, t);
      return net.done(t(meta.summary));
    },
  };
}

export const EXERCISES: Exercise[] = [
  // --- IP basics ---------------------------------------------------------------
  exercise(101, {
    id: "first-network", box: "basics", level: 1,
    title: tx("Tu primera red"),
    codename: tx("Hola, Vecino"), icon: "pc",
    story: tx("PC 2 acaba de mudarse al barrio y nadie sabe su dirección. Dale una casa en la red para que PC 1 pueda saludarle."),
    cli: [
      tx("Haz doble clic en PC 2 y abre su pestaña CLI."),
      tx("ip addr add 192.168.1.20/24 dev eth0 (ip addr muestra sus interfaces)."),
    ],
    summary: tx("Dos PC en el mismo switch, pero PC 2 aún no tiene dirección. Dale una de la red de PC 1."),
    goals: [{ text: tx("PC 1 hace ping a PC 2"), check: { kind: "ping", from: "pc-1", to: "pc-2" } }],
    hints: [
      tx("Selecciona PC 2 y escribe una dirección en su interfaz eth0."),
      tx("PC 1 es 192.168.1.10/24: cualquier 192.168.1.x/24 libre sirve, por ejemplo 192.168.1.20/24."),
    ],
    solve: topology => port(topology, "pc-2", "eth0", { ip: "192.168.1.20", prefix: 24 }),
  }, net => {
    net.switch("switch", "Switch", 340, 260);
    net.host("pc-1", "pc", "PC 1", 80, 120, { ip: "192.168.1.10/24" });
    net.host("pc-2", "pc", "PC 2", 600, 120);
    net.link("switch:Fa0/1", "pc-1:eth0");
    net.link("switch:Fa0/2", "pc-2:eth0");
  }),
  exercise(102, {
    id: "subnet-mask", box: "basics", level: 2,
    title: tx("La máscara importa"),
    codename: tx("Máscara Rota"), icon: "pc",
    story: tx("PC 2 lleva una máscara que no le queda: oye a PC 1, pero no sabe contestarle. Ajústale la máscara."),
    cli: [
      tx("En la CLI de PC 2, ip addr muestra su dirección y su máscara."),
      tx("ip addr del 192.168.1.130/25 dev eth0 y después ip addr add 192.168.1.130/24 dev eth0."),
    ],
    summary: tx("PC 1 llega a PC 2, pero la respuesta no vuelve: una máscara no es la que debería."),
    goals: [
      { text: tx("PC 1 hace ping a PC 2"), check: { kind: "ping", from: "pc-1", to: "pc-2" } },
      { text: tx("PC 2 hace ping a PC 1"), check: { kind: "ping", from: "pc-2", to: "pc-1" } },
    ],
    hints: [
      tx("Compara las máscaras de los dos PC: ¿qué red cree cada uno que tiene?"),
      tx("Con /25, PC 2 (192.168.1.130) está en 192.168.1.128/25 y cree que PC 1 está en otra red."),
    ],
    solve: topology => port(topology, "pc-2", "eth0", { prefix: 24 }),
  }, net => {
    net.switch("switch", "Switch", 340, 260);
    net.host("pc-1", "pc", "PC 1", 80, 120, { ip: "192.168.1.10/24" });
    net.host("pc-2", "pc", "PC 2", 600, 120, { ip: "192.168.1.130/25" });
    net.link("switch:Fa0/1", "pc-1:eth0");
    net.link("switch:Fa0/2", "pc-2:eth0");
  }),

  // --- switching ---------------------------------------------------------------
  exercise(103, {
    id: "split-vlans", box: "switching", level: 1,
    title: tx("Separa la red en VLAN"),
    codename: tx("Muro Invisible"), icon: "switch",
    story: tx("Ventas y Almacén se pasan el día espiándose por el mismo switch. Levanta un muro invisible entre ellos."),
    cliUnavailable: NO_BRIDGE,
    summary: tx("Ventas (A1, A2) y Almacén (B1, B2) comparten switch y red. Sepáralos con VLAN sin tocar sus direcciones."),
    goals: [
      { text: tx("A1 hace ping a A2"), check: { kind: "ping", from: "a1", to: "a2" } },
      { text: tx("B1 hace ping a B2"), check: { kind: "ping", from: "b1", to: "b2" } },
      { text: tx("A1 ya no llega a B1"), check: { kind: "isolated", from: "a1", to: "b1" } },
    ],
    hints: [
      tx("Cada puerto del switch tiene una VLAN de acceso: selecciona el switch."),
      tx("Deja los puertos de Ventas en la VLAN 10 y pon los de Almacén en la 20, por ejemplo."),
    ],
    solve: topology => ["Fa0/3", "Fa0/4"].reduce((lab, iface) => port(lab, "switch", iface, { vlan: 20 }), topology),
  }, (net, t) => {
    net.switch("switch", "Switch", 380, 300);
    net.host("a1", "pc", "A1", 80, 100, { ip: "10.0.0.11/24", description: t("Ventas") });
    net.host("a2", "pc", "A2", 80, 500, { ip: "10.0.0.12/24", description: t("Ventas") });
    net.host("b1", "pc", "B1", 700, 100, { ip: "10.0.0.21/24", description: t("Almacén") });
    net.host("b2", "pc", "B2", 700, 500, { ip: "10.0.0.22/24", description: t("Almacén") });
    net.link("switch:Fa0/1", "a1:eth0");
    net.link("switch:Fa0/2", "a2:eth0");
    net.link("switch:Fa0/3", "b1:eth0");
    net.link("switch:Fa0/4", "b2:eth0");
  }),
  exercise(104, {
    id: "wrong-port", box: "switching", level: 2,
    title: tx("Un puerto en la VLAN equivocada"),
    codename: tx("El Infiltrado"), icon: "switch",
    story: tx("Alguien de Almacén se ha colado en la VLAN de Ventas. Descubre qué puerto le abrió la puerta."),
    cliUnavailable: NO_BRIDGE,
    summary: tx("Las VLAN ya están hechas, pero B2 no habla con B1 y en cambio ve a Ventas. Encuentra el puerto mal puesto."),
    goals: [
      { text: tx("B1 hace ping a B2"), check: { kind: "ping", from: "b1", to: "b2" } },
      { text: tx("A1 no llega a B2"), check: { kind: "isolated", from: "a1", to: "b2" } },
      { text: tx("El puerto de B2 está en la VLAN de Almacén (20)"), check: { kind: "vlan", device: "switch", iface: "Fa0/4", vlan: 20 } },
    ],
    hints: [
      tx("Mira la VLAN de cada puerto del switch: ¿cuál no encaja con su equipo?"),
      tx("Fa0/4, el puerto de B2, está en la VLAN 10 (Ventas)."),
    ],
    solve: topology => port(topology, "switch", "Fa0/4", { vlan: 20 }),
  }, (net, t) => {
    net.switch("switch", "Switch", 380, 300, { "Fa0/1": 10, "Fa0/2": 10, "Fa0/3": 20, "Fa0/4": 10 });
    net.host("a1", "pc", "A1", 80, 100, { ip: "10.0.0.11/24", description: t("Ventas") });
    net.host("a2", "pc", "A2", 80, 500, { ip: "10.0.0.12/24", description: t("Ventas") });
    net.host("b1", "pc", "B1", 700, 100, { ip: "10.0.0.21/24", description: t("Almacén") });
    net.host("b2", "pc", "B2", 700, 500, { ip: "10.0.0.22/24", description: t("Almacén") });
    net.link("switch:Fa0/1", "a1:eth0");
    net.link("switch:Fa0/2", "a2:eth0");
    net.link("switch:Fa0/3", "b1:eth0");
    net.link("switch:Fa0/4", "b2:eth0");
  }),

  // --- routing -----------------------------------------------------------------
  exercise(105, {
    id: "default-gateway", box: "routing", level: 1,
    title: tx("La puerta de enlace"),
    codename: tx("Puerta Cerrada"), icon: "router",
    story: tx("El PC quiere salir de su red, pero no sabe por qué puerta. Dile dónde está la salida."),
    cli: [
      tx("En la CLI del PC, ip route muestra sus rutas: no tiene ninguna por defecto."),
      tx("ip route add default via 192.168.1.1"),
    ],
    summary: tx("El PC está en una red y el servidor en otra, con un router entre ellas. Al PC le falta saber por dónde salir."),
    goals: [{ text: tx("El PC hace ping al servidor"), check: { kind: "ping", from: "pc", to: "server" } }],
    hints: [
      tx("Un equipo manda a su puerta de enlace todo lo que no es de su red."),
      tx("La puerta de enlace del PC es la dirección del router en su red: 192.168.1.1."),
    ],
    solve: topology => device(topology, "pc", { gateway: "192.168.1.1" }),
  }, (net, t) => {
    net.host("pc", "pc", "PC", 60, 260, { ip: "192.168.1.10/24" });
    net.router("router", "Router", 360, 260, { "Gi0/0": "192.168.1.1/24", "Gi0/1": "10.0.0.1/24" });
    net.host("server", "server", t("Servidor"), 660, 260, { ip: "10.0.0.10/24", gateway: "10.0.0.1" });
    net.link("pc:eth0", "router:Gi0/0");
    net.link("router:Gi0/1", "server:eth0");
  }),
  exercise(106, {
    id: "static-routes", box: "routing", level: 2,
    title: tx("Rutas estáticas"),
    codename: tx("Puente Entre Islas"), icon: "router",
    story: tx("Dos oficinas aisladas, cada una con su router, que no saben llegar a la otra. Tiende el puente."),
    cli: [
      tx("En la CLI de R1, ip route muestra solo sus redes conectadas."),
      tx("En R1: ip route add 192.168.2.0/24 via 10.0.0.2. En R2: ip route add 192.168.1.0/24 via 10.0.0.1."),
    ],
    summary: tx("Dos oficinas, cada una con su router, unidas por un enlace. Cada router solo conoce sus redes: enséñales la del otro."),
    goals: [
      { text: tx("PC A hace ping a PC B"), check: { kind: "ping", from: "pc-a", to: "pc-b" } },
      { text: tx("PC B hace ping a PC A"), check: { kind: "ping", from: "pc-b", to: "pc-a" } },
    ],
    hints: [
      tx("R1 necesita una ruta hacia 192.168.2.0/24 y R2 otra hacia 192.168.1.0/24."),
      tx("El siguiente salto es el otro router en el enlace: 10.0.0.2 desde R1 y 10.0.0.1 desde R2."),
    ],
    solve: topology => device(device(topology, "r1", { routes: [{ prefix: "192.168.2.0/24", via: "10.0.0.2" }] }),
      "r2", { routes: [{ prefix: "192.168.1.0/24", via: "10.0.0.1" }] }),
  }, net => {
    net.host("pc-a", "pc", "PC A", 40, 260, { ip: "192.168.1.10/24", gateway: "192.168.1.1" });
    net.router("r1", "R1", 300, 260, { "Gi0/0": "192.168.1.1/24", "Gi0/1": "10.0.0.1/30" });
    net.router("r2", "R2", 560, 260, { "Gi0/0": "10.0.0.2/30", "Gi0/1": "192.168.2.1/24" });
    net.host("pc-b", "pc", "PC B", 820, 260, { ip: "192.168.2.10/24", gateway: "192.168.2.1" });
    net.link("pc-a:eth0", "r1:Gi0/0");
    net.link("r1:Gi0/1", "r2:Gi0/0");
    net.link("r2:Gi0/1", "pc-b:eth0");
  }),
  exercise(107, {
    id: "default-route", box: "routing", level: 3,
    title: tx("La ruta por defecto"),
    codename: tx("Rumbo a Internet"), icon: "cloud",
    story: tx("La oficina quiere ver el mundo, pero su router no sabe por dónde queda. Marca el rumbo por defecto."),
    cli: [
      tx("En la CLI del router de la oficina, ip route no tiene ruta por defecto."),
      tx("ip route add default via 203.0.113.1"),
    ],
    summary: tx("La oficina sale a Internet por su proveedor. El router de la oficina no sabe adónde mandar lo que no conoce."),
    goals: [{ text: tx("El PC hace ping a 8.8.8.8"), check: { kind: "ping", from: "pc", to: "8.8.8.8" } }],
    hints: [
      tx("Lo que no es de ninguna red conocida va por la ruta por defecto: 0.0.0.0/0."),
      tx("En el router de la oficina, una ruta 0.0.0.0/0 con siguiente salto el ISP: 203.0.113.1."),
    ],
    solve: topology => device(topology, "office", { routes: [{ prefix: "0.0.0.0/0", via: "203.0.113.1" }] }),
  }, (net, t) => {
    net.host("pc", "pc", "PC", 40, 260, { ip: "192.168.1.10/24", gateway: "192.168.1.1" });
    net.router("office", t("Router oficina"), 300, 260, { "Gi0/0": "192.168.1.1/24", "Gi0/1": "203.0.113.2/30" });
    net.router("isp", "ISP", 560, 260, { eth0: "203.0.113.1/30", eth1: "8.8.8.1/24" }, [["192.168.1.0/24", "203.0.113.2"]], { type: "cloud" });
    net.host("internet", "server", t("Servidor en Internet"), 820, 260, { ip: "8.8.8.8/24", gateway: "8.8.8.1" });
    net.link("pc:eth0", "office:Gi0/0");
    net.link("office:Gi0/1", "isp:eth0");
    net.link("isp:eth1", "internet:eth0");
  }),

  // --- DHCP --------------------------------------------------------------------
  exercise(108, {
    id: "dhcp-server", box: "dhcp", level: 1,
    title: tx("Un servidor DHCP"),
    codename: tx("Reparto Vacío"), icon: "server",
    story: tx("El servidor DHCP abre la tienda… sin nada que repartir. Dale un rango de direcciones."),
    cliUnavailable: NO_SERVICES,
    summary: tx("El PC pide su dirección por DHCP, pero el servidor no tiene ningún rango que repartir."),
    goals: [{ text: tx("El PC recibe una dirección por DHCP"), check: { kind: "dhcp", from: "pc" } }],
    hints: [
      tx("Selecciona el servidor y añade un rango DHCP en sus servicios."),
      tx("Por ejemplo: red 192.168.1.0/24, de 192.168.1.100 a 192.168.1.150."),
    ],
    solve: topology => device(topology, "dhcp", { services: { dhcp: [{ network: "192.168.1.0/24", start: "192.168.1.100", end: "192.168.1.150", gateway: "192.168.1.1" }] } }),
  }, (net, t) => {
    net.switch("switch", "Switch", 360, 260);
    net.host("dhcp", "server", t("Servidor DHCP"), 80, 120, { ip: "192.168.1.2/24" });
    net.host("pc", "pc", "PC", 640, 120, { dhcp: true });
    net.link("switch:Fa0/1", "dhcp:eth0");
    net.link("switch:Fa0/2", "pc:eth0");
  }),
  exercise(109, {
    id: "dhcp-relay", box: "dhcp", level: 2,
    title: tx("DHCP a través de un router"),
    codename: tx("El Mensajero"), icon: "server",
    story: tx("El grito del PC pidiendo dirección se pierde en el router. Convierte al router en mensajero."),
    cliUnavailable: NO_SERVICES,
    summary: tx("El servidor DHCP está en otra red y la difusión del PC muere en el router. Haz que el router la reenvíe."),
    goals: [{ text: tx("El PC recibe una dirección por DHCP"), check: { kind: "dhcp", from: "pc" } }],
    hints: [
      tx("Un router no deja pasar difusiones; un relay DHCP (ip helper) las convierte en unicast."),
      tx("Pon el relay en la interfaz del router de la red del PC (Gi0/1), apuntando al servidor: 10.20.0.5."),
    ],
    solve: topology => port(topology, "router", "Gi0/1", { relay: "10.20.0.5" }),
  }, (net, t) => {
    net.host("dhcp", "server", t("Servidor DHCP"), 40, 260, {
      ip: "10.20.0.5/24", gateway: "10.20.0.1",
      services: { dhcp: [{ network: "10.30.0.0/24", start: "10.30.0.100", end: "10.30.0.199", gateway: "10.30.0.1" }] },
    });
    net.router("router", "Router", 360, 260, { "Gi0/0": "10.20.0.1/24", "Gi0/1": "10.30.0.1/24" });
    net.host("pc", "pc", "PC", 680, 260, { dhcp: true });
    net.link("dhcp:eth0", "router:Gi0/0");
    net.link("router:Gi0/1", "pc:eth0");
  }),

  // --- DNS and web -------------------------------------------------------------
  exercise(110, {
    id: "dns-record", box: "services", level: 1,
    title: tx("Resuelve un nombre"),
    codename: tx("Guía Telefónica"), icon: "globe",
    story: tx("El cliente busca www.ejemplo.com en la guía y la página está en blanco. Escribe la entrada que falta."),
    cliUnavailable: NO_SERVICES,
    summary: tx("El cliente pregunta al DNS por www.ejemplo.com, pero el servidor DNS no tiene ese nombre."),
    goals: [{ text: tx("El cliente resuelve www.ejemplo.com a 172.20.0.80"), check: { kind: "dns", from: "client", name: "www.ejemplo.com", ip: "172.20.0.80" } }],
    hints: [
      tx("Selecciona el servidor DNS y añade un registro en sus servicios."),
      tx("Nombre www.ejemplo.com, dirección 172.20.0.80 (el servidor web)."),
    ],
    solve: topology => device(topology, "dns", { services: { dns: [{ name: "www.ejemplo.com", ip: "172.20.0.80" }] } }),
  }, (net, t) => {
    net.host("client", "pc", t("Cliente"), 40, 260, { ip: "192.168.1.10/24", gateway: "192.168.1.1", dns: "172.20.0.53" });
    net.router("router", "Router", 300, 260, { "Gi0/0": "192.168.1.1/24", "Gi0/1": "172.20.0.1/24" });
    net.switch("switch", "Switch", 560, 260);
    net.host("dns", "server", "DNS", 820, 100, { ip: "172.20.0.53/24", gateway: "172.20.0.1", services: { dns: [{ name: "ejemplo.com", ip: "172.20.0.80" }] } });
    net.host("web", "server", "Web", 820, 420, { ip: "172.20.0.80/24", gateway: "172.20.0.1", services: { http: true } });
    net.link("client:eth0", "router:Gi0/0");
    net.link("router:Gi0/1", "switch:Fa0/1");
    net.link("switch:Fa0/2", "dns:eth0");
    net.link("switch:Fa0/3", "web:eth0");
  }),
  exercise(111, {
    id: "reach-web", box: "services", level: 2,
    title: tx("Llega a la web"),
    codename: tx("Web Perdida"), icon: "globe",
    story: tx("Todo funciona, pero el cliente no sabe a quién preguntar por los nombres. Dale su guía."),
    cliUnavailable: NO_SERVICES,
    summary: tx("El DNS y el servidor web funcionan, pero el cliente no sabe a quién preguntar por los nombres."),
    goals: [{ text: tx("El cliente abre http://www.ejemplo.com"), check: { kind: "http", from: "client", to: "www.ejemplo.com" } }],
    hints: [
      tx("Para abrir un nombre, el cliente primero lo resuelve con su servidor DNS."),
      tx("Pon 172.20.0.53 como servidor DNS del cliente."),
    ],
    solve: topology => device(topology, "client", { dns: "172.20.0.53" }),
  }, (net, t) => {
    net.host("client", "pc", t("Cliente"), 40, 260, { ip: "192.168.1.10/24", gateway: "192.168.1.1" });
    net.router("router", "Router", 300, 260, { "Gi0/0": "192.168.1.1/24", "Gi0/1": "172.20.0.1/24" });
    net.switch("switch", "Switch", 560, 260);
    net.host("dns", "server", "DNS", 820, 100, { ip: "172.20.0.53/24", gateway: "172.20.0.1", services: { dns: [{ name: "www.ejemplo.com", ip: "172.20.0.80" }] } });
    net.host("web", "server", "Web", 820, 420, { ip: "172.20.0.80/24", gateway: "172.20.0.1", services: { http: true } });
    net.link("client:eth0", "router:Gi0/0");
    net.link("router:Gi0/1", "switch:Fa0/1");
    net.link("switch:Fa0/2", "dns:eth0");
    net.link("switch:Fa0/3", "web:eth0");
  }),

  // --- troubleshooting ---------------------------------------------------------
  exercise(112, {
    id: "three-faults", box: "troubleshooting", level: 3,
    title: tx("Tres averías"),
    codename: tx("Triple Avería"), icon: "search",
    story: tx("Tres fallos escondidos en dos oficinas. Ponte el casco de detective y encuéntralos uno a uno."),
    cliUnavailable: NO_BRIDGE,
    summary: tx("Dos oficinas unidas por dos routers, y solo PC A1 llega a su router. Hay tres averías: una ruta, una puerta de enlace y una VLAN."),
    goals: [
      { text: tx("PC A1 hace ping a PC B1"), check: { kind: "ping", from: "pc-a1", to: "pc-b1" } },
      { text: tx("PC A2 hace ping a PC B1"), check: { kind: "ping", from: "pc-a2", to: "pc-b1" } },
      { text: tx("PC B1 hace ping a PC B2"), check: { kind: "ping", from: "pc-b1", to: "pc-b2" } },
    ],
    hints: [
      tx("Ping de PC A1 a PC B1: el eco llega, la respuesta no vuelve. ¿Qué le falta a R2?"),
      tx("Ping de PC A2 a PC B1: mira a quién pregunta por ARP PC A2."),
      tx("Ping de PC B1 a PC B2: el switch B no la deja pasar. Revisa sus puertos."),
    ],
    solve: topology => port(device(device(topology, "r2", { routes: [{ prefix: "192.168.10.0/24", via: "10.9.9.1" }] }),
      "pc-a2", { gateway: "192.168.10.1" }), "switch-b", "Fa0/3", { vlan: undefined }),
  }, net => {
    net.switch("switch-a", "Switch A", 180, 300);
    net.host("pc-a1", "pc", "PC A1", 40, 80, { ip: "192.168.10.11/24", gateway: "192.168.10.1" });
    net.host("pc-a2", "pc", "PC A2", 40, 520, { ip: "192.168.10.12/24", gateway: "192.168.10.254" });
    net.router("r1", "R1", 420, 300, { "Gi0/0": "192.168.10.1/24", "Gi0/1": "10.9.9.1/30" }, [["192.168.20.0/24", "10.9.9.2"]]);
    net.router("r2", "R2", 640, 300, { "Gi0/0": "10.9.9.2/30", "Gi0/1": "192.168.20.1/24" });
    net.switch("switch-b", "Switch B", 880, 300, { "Fa0/3": 30 });
    net.host("pc-b1", "pc", "PC B1", 1040, 80, { ip: "192.168.20.11/24", gateway: "192.168.20.1" });
    net.host("pc-b2", "laptop", "PC B2", 1040, 520, { ip: "192.168.20.12/24", gateway: "192.168.20.1" });
    net.link("switch-a:Fa0/1", "pc-a1:eth0");
    net.link("switch-a:Fa0/2", "pc-a2:eth0");
    net.link("switch-a:Fa0/3", "r1:Gi0/0");
    net.link("r1:Gi0/1", "r2:Gi0/0");
    net.link("r2:Gi0/1", "switch-b:Fa0/1");
    net.link("switch-b:Fa0/2", "pc-b1:eth0");
    net.link("switch-b:Fa0/3", "pc-b2:eth0");
  }),
];

export const exerciseById = (id: string) => EXERCISES.find(item => item.id === id);
export const exercisesOf = (box: BoxId) => EXERCISES.filter(item => item.box === box).sort((p, q) => p.level - q.level);

/** the points of what was solved (its keys: solvedKey), and the rank they make */
export function rankOf(solved: Solved): { xp: number; rank: string; level: number; next?: { name: string; from: number }; progress: number } {
  const xp = EXERCISES.reduce((sum, exercise) =>
    sum + (["easy", "medium"] as const).reduce((part, difficulty) => part + (solved[solvedKey(exercise.id, difficulty)] ? xpOf(exercise, difficulty) : 0), 0), 0);
  const index = RANKS.reduce((found, rank, i) => xp >= rank.from ? i : found, 0);
  const next = RANKS[index + 1];
  const progress = next ? (xp - RANKS[index].from) / (next.from - RANKS[index].from) : 1;
  return { xp, rank: RANKS[index].name, level: index + 1, ...(next ? { next } : {}), progress };
}

/** what the user has solved: its key (solvedKey) → when */
export type Solved = Record<string, number>;

/** an exercise solved in a difficulty: its id (easy), or id:medium */
export const solvedKey = (id: string, difficulty: Difficulty = "easy") => difficulty === "easy" ? id : `${id}:${difficulty}`;

/** whether it can be played in a difficulty */
export const hasDifficulty = (exercise: Exercise, difficulty: Difficulty) => difficulty === "easy" || Boolean(exercise.cli);

/** a box's levels open one after another (those of the difficulty); the first is always open */
export const isUnlocked = (exercise: Exercise, solved: Solved, difficulty: Difficulty = "easy") =>
  exercisesOf(exercise.box).filter(item => item.level < exercise.level && hasDifficulty(item, difficulty))
    .every(item => solved[solvedKey(item.id, difficulty)]);

/** the exercises of the boxes that can be played, in a difficulty */
export const playableExercises = (difficulty: Difficulty = "easy") =>
  EXERCISES.filter(item => !BOXES.find(box => box.id === item.box)?.upcoming && hasDifficulty(item, difficulty));

/** the next exercise of the path in a difficulty: the first open one not solved yet */
export function nextExercise(solved: Solved, difficulty: Difficulty = "easy"): Exercise | undefined {
  for(const box of BOXES.filter(item => !item.upcoming)){
    const open = exercisesOf(box.id).find(item => hasDifficulty(item, difficulty) && !solved[solvedKey(item.id, difficulty)] && isUnlocked(item, solved, difficulty));
    if(open) return open;
  }
  return undefined;
}
