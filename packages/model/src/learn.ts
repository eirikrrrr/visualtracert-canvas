// Learning around the machines. The Starting Point: four tiers for a
// beginner, from reading to playing: fundamentals, concepts and references
// (each a long guide ending in a quiz, in ./guides) and the first machines. And the tracks: curated paths through the
// machines, each with a goal (the first steps, routing, the CLI…). Texts are
// Spanish keys, translated where they are shown.
import { tx } from "./i18n";
import type { ExerciseLevel } from "./exercises";
import type { GuideTier } from "./guides/types";

export interface Tier {
  id: TierId;
  /** "Tier 0" */
  number: number;
  title: string;
  about: string;
  skills: string[];
  /** its guide (a long document ending in a quiz), in ./guides */
  guide?: GuideTier;
  /** the machines of the tier, by id */
  machines?: string[];
}

export type TierId = GuideTier | "machines";

export const TIERS: Tier[] = [
  {
    id: "fundamentals", number: 0, title: tx("Fundamentos"), guide: "fundamentals",
    about: tx("Una guía completa para empezar desde cero: qué es una red, los medios, los modelos OSI y TCP/IP, la encapsulación, el binario, las direcciones IPv4 y sus máscaras, la puerta de enlace, las direcciones MAC y ARP. Cada concepto con su diagrama, y al final un quiz de todo el nivel."),
    skills: [tx("Explicar las siete capas de OSI y las cuatro de TCP/IP."), tx("Pasar de decimal a binario y leer una máscara."), tx("Calcular la red, la difusión y los equipos de una dirección."), tx("Seguir un paquete de un equipo a otra red, con ARP y la puerta de enlace.")],
  },
  {
    id: "concepts", number: 1, title: tx("Conceptos"), guide: "concepts",
    about: tx("Cómo funciona una red de verdad: el switch y sus tablas, los dominios de difusión, las VLAN, el enrutamiento, los puertos, TCP y UDP a fondo, ICMP, DHCP, DNS y NAT. Cada concepto con su diagrama, y al final un quiz de todo el nivel."),
    skills: [tx("Entender cómo aprende un switch y para qué sirven las VLAN."), tx("Leer una tabla de rutas y elegir la ruta ganadora."), tx("Explicar el saludo de TCP y cuándo conviene UDP."), tx("Seguir una concesión de DHCP, una resolución DNS y una traducción NAT.")],
  },
  {
    id: "references", number: 2, title: tx("Referencias"), guide: "references",
    about: tx("La guía de consulta para tener a mano: las cabeceras de Ethernet, IPv4, TCP y UDP, el subnetting paso a paso, IPv6, los puertos, los comandos de Linux y de MikroTik, el diagnóstico por capas, las capturas y un glosario. Con su quiz al final."),
    skills: [tx("Reconocer cada campo de las cabeceras más comunes."), tx("Dividir una red en subredes con VLSM."), tx("Configurar un equipo Linux o un MikroTik desde su CLI."), tx("Diagnosticar un fallo de abajo arriba.")],
  },
  {
    id: "machines", number: 3, title: tx("Máquinas"),
    about: tx("Lo aprendido, en tus manos: la primera máquina de cada tema, la más sencilla. Supéralas todas y estarás listo para el resto."),
    skills: [tx("Dar una dirección y comprobarla con ping."), tx("Separar equipos con VLAN."), tx("Poner la puerta de enlace."), tx("Servir direcciones por DHCP y nombres por DNS.")],
    machines: ["first-network", "split-vlans", "default-gateway", "dhcp-server", "dns-record"],
  },
];

// --- tracks ---------------------------------------------------------------------

export interface Track {
  id: string;
  title: string;
  summary: string;
  /** what it prepares for: shown on its page */
  goal: string;
  icon: string;
  /** its card's colour */
  color: string;
  level: ExerciseLevel;
  /** the difficulty it is meant for (medium: the CLI track) */
  difficulty: "easy" | "medium";
  /** its machines, in order */
  machines: string[];
  /** not playable yet: why */
  upcoming?: string;
}

export const TRACKS: Track[] = [
  {
    id: "first-steps", title: tx("Primeros pasos en redes"), icon: "pc", color: "#2f9e6b", level: 1, difficulty: "easy",
    summary: tx("De una red vacía a una que sale a Internet."),
    goal: tx("Para quien empieza: direcciones, máscaras, la puerta de enlace y los servicios que hacen la red cómoda."),
    machines: ["first-network", "subnet-mask", "default-gateway", "dhcp-server", "dns-record"],
  },
  {
    id: "switching", title: tx("Switching y VLAN"), icon: "switch", color: "#7b61ff", level: 1, difficulty: "easy",
    summary: tx("Un switch, varias redes."),
    goal: tx("Entender cómo reparte un switch y cómo las VLAN lo parten, y encontrar el puerto mal puesto."),
    machines: ["split-vlans", "wrong-port"],
  },
  {
    id: "routing", title: tx("Enrutamiento estático"), icon: "router", color: "#e07b39", level: 2, difficulty: "easy",
    summary: tx("Que los paquetes encuentren el camino."),
    goal: tx("La puerta de enlace, las rutas estáticas entre oficinas y la ruta por defecto hacia Internet."),
    machines: ["default-gateway", "static-routes", "default-route"],
  },
  {
    id: "services", title: tx("Servicios de red"), icon: "server", color: "#1f8fbf", level: 2, difficulty: "easy",
    summary: tx("DHCP, DNS y web, de punta a punta."),
    goal: tx("Que los equipos reciban su dirección (también desde otra red), resuelvan nombres y lleguen a una web."),
    machines: ["dhcp-server", "dhcp-relay", "dns-record", "reach-web"],
  },
  {
    id: "cli", title: tx("Operador de CLI"), icon: "emulation", color: "#c2410c", level: 2, difficulty: "medium",
    summary: tx("Todo desde la consola, en equipos reales."),
    goal: tx("Las máquinas que tienen modo Medio, resueltas solo con la CLI de cada equipo: como en un trabajo de verdad. Cuentan como verificadas en el ranking."),
    machines: ["first-network", "subnet-mask", "default-gateway", "static-routes", "default-route"],
  },
  {
    id: "troubleshooting", title: tx("Cazador de averías"), icon: "search", color: "#b42318", level: 3, difficulty: "easy",
    summary: tx("Redes rotas, a propósito."),
    goal: tx("Diagnosticar con ping y traza: de un fallo de VLAN a tres averías escondidas a la vez."),
    machines: ["wrong-port", "default-route", "three-faults"],
  },
  {
    id: "dynamic-routing", title: tx("Enrutamiento dinámico"), icon: "globe", color: "#64748b", level: 3, difficulty: "medium",
    summary: tx("OSPF y BGP."), goal: tx("Vecinos, áreas, costes y sistemas autónomos."), machines: [],
    upcoming: tx("Llegará con el enrutamiento dinámico en config y FRR en la emulación."),
  },
];

export const trackById = (id: string) => TRACKS.find(track => track.id === id);
