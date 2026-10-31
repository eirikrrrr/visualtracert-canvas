// Learning around the machines. The Starting Point: four tiers for a
// beginner, from reading to playing: fundamentals and concepts (short lessons,
// each one done by answering its question), references (sheets to come back
// to) and the first machines. And the tracks: curated paths through the
// machines, each with a goal (the first steps, routing, the CLI…). Texts are
// Spanish keys, translated where they are shown.
import { tx } from "./i18n";
import type { ExerciseLevel } from "./exercises";

export interface Question {
  text: string;
  options: string[];
  /** the right option's index */
  answer: number;
  /** why it is that one: shown once answered */
  why: string;
}

export interface Lesson {
  id: string;
  title: string;
  /** an icon of the app's set */
  icon: string;
  /** minutes to read it */
  minutes: number;
  /** its paragraphs */
  body: string[];
  question: Question;
}

/** a sheet to come back to: rows of a term (a command, a prefix) and what it means */
export interface Reference {
  id: string;
  title: string;
  icon: string;
  summary: string;
  /** the first column is code (a command, a number), shown as such */
  columns: [string, string];
  rows: [string, string][];
}

export type TierId = "fundamentals" | "concepts" | "references" | "machines";

export interface Tier {
  id: TierId;
  /** "Tier 0" */
  number: number;
  title: string;
  about: string;
  skills: string[];
  lessons?: Lesson[];
  references?: Reference[];
  /** the machines of the tier, by id */
  machines?: string[];
}

export const TIERS: Tier[] = [
  {
    id: "fundamentals", number: 0, title: tx("Fundamentos"),
    about: tx("Lo mínimo para entender una red: qué es, cómo se nombran los equipos y cómo saben si otro está cerca o lejos. Cinco lecturas cortas, cada una con una pregunta para darla por hecha."),
    skills: [tx("Leer una dirección IP y su prefijo."), tx("Saber si dos equipos están en la misma red."), tx("Entender para qué sirve la puerta de enlace."), tx("Distinguir una MAC de una IP.")],
    lessons: [
      {
        id: "what-is-a-network", title: tx("Qué es una red"), icon: "topology", minutes: 2,
        body: [
          tx("Una red son equipos unidos para intercambiar datos: PC, servidores, teléfonos, routers. Los datos viajan en trozos pequeños llamados paquetes, cada uno con su origen y su destino escritos, como un sobre."),
          tx("Los equipos se unen por cables (o por radio, en el Wi-Fi) a un switch, que reparte los paquetes dentro de la red local. Para salir a otras redes, los paquetes pasan por un router."),
          tx("En este laboratorio verás las dos cosas: en Simulación, cada paquete se mueve por el lienzo paso a paso; en Emulación, los equipos son contenedores reales y los paquetes, de verdad."),
        ],
        question: {
          text: tx("¿Qué equipo une redes distintas y decide por dónde sigue un paquete?"),
          options: [tx("Un switch"), tx("Un router"), tx("Un PC")],
          answer: 1,
          why: tx("El switch reparte dentro de una red; el router conecta redes y elige el camino."),
        },
      },
      {
        id: "ip-addresses", title: tx("Direcciones IP"), icon: "pc", minutes: 3,
        body: [
          tx("Cada equipo de una red IP tiene una dirección, como 192.168.1.10: cuatro números de 0 a 255 separados por puntos. Dos equipos de la misma red no pueden tener la misma, o los paquetes no sabrían a cuál ir (un conflicto de IP)."),
          tx("Hay rangos privados, para las redes de casa y de las empresas, que no salen tal cual a Internet: 10.0.0.0/8, 172.16.0.0/12 y 192.168.0.0/16. La dirección 127.0.0.1 es el propio equipo."),
          tx("Una dirección se pone a mano (estática) o la da un servidor DHCP al conectarse. En los retos harás las dos cosas."),
        ],
        question: {
          text: tx("¿Cuál de estas direcciones es privada?"),
          options: ["8.8.8.8", "192.168.4.20", "203.0.113.5"],
          answer: 1,
          why: tx("192.168.0.0/16 es un rango privado; las otras dos son públicas."),
        },
      },
      {
        id: "masks", title: tx("Máscara y prefijo"), icon: "settings", minutes: 3,
        body: [
          tx("La dirección no basta: hace falta saber qué parte es la red y qué parte el equipo. Eso dice el prefijo: en 192.168.1.10/24, los primeros 24 bits (192.168.1) son la red y el último número, el equipo."),
          tx("La máscara dice lo mismo con otra forma: /24 es 255.255.255.0; /16 es 255.255.0.0; /30 es 255.255.255.252, una red de solo dos equipos, típica entre dos routers."),
          tx("Dos equipos están en la misma red si su parte de red coincide. 192.168.1.10/24 y 192.168.1.20/24 sí; 192.168.1.10/24 y 192.168.2.10/24 no, aunque se parezcan: para hablar necesitan un router."),
        ],
        question: {
          text: tx("¿Están en la misma red 10.0.5.1/24 y 10.0.6.1/24?"),
          options: [tx("Sí, empiezan igual"), tx("No: con /24, su red es 10.0.5 y 10.0.6"), tx("Depende del switch")],
          answer: 1,
          why: tx("Con /24 la red son los tres primeros números: 10.0.5 y 10.0.6 son redes distintas."),
        },
      },
      {
        id: "gateway", title: tx("La puerta de enlace"), icon: "router", minutes: 2,
        body: [
          tx("Cuando un equipo quiere hablar con otro de su red, se lo envía directamente. Cuando el destino está en otra red, se lo entrega a su puerta de enlace: el router de su red, que sabe seguir."),
          tx("La puerta de enlace es una dirección de la propia red del equipo (por ejemplo 192.168.1.1 para 192.168.1.10/24). Si falta, o es de otra red, el equipo solo llega a sus vecinos."),
          tx("Es el fallo más común en los retos de enrutamiento: todo parece bien, pero el ping a otra red no sale."),
        ],
        question: {
          text: tx("PC A (192.168.1.10/24) quiere llegar a 10.0.0.5. ¿A quién envía el paquete?"),
          options: [tx("Directamente a 10.0.0.5"), tx("A su puerta de enlace"), tx("A todos los equipos de su red")],
          answer: 1,
          why: tx("10.0.0.5 no está en su red: el paquete va a la puerta de enlace, que lo lleva más allá."),
        },
      },
      {
        id: "mac-arp", title: tx("MAC y ARP"), icon: "switch", minutes: 3,
        body: [
          tx("Además de la IP, cada tarjeta de red tiene una dirección MAC, como 02:65:00:00:00:09, grabada de fábrica (o inventada, en los contenedores). El switch reparte las tramas por la MAC, no por la IP."),
          tx("Para enviar algo a una IP de su red, el equipo necesita su MAC. La pregunta en voz alta a toda la red, «¿quién tiene 192.168.1.20?», es ARP; el dueño responde con su MAC y el equipo la recuerda un rato."),
          tx("En Simulación verás esa pregunta y su respuesta antes del primer ping; en Emulación, ip neigh muestra lo que el equipo ha aprendido."),
        ],
        question: {
          text: tx("¿Para qué sirve ARP?"),
          options: [tx("Para dar direcciones IP"), tx("Para averiguar la MAC de una IP de la red local"), tx("Para resolver nombres como ejemplo.com")],
          answer: 1,
          why: tx("ARP traduce una IP de la red local a su MAC. Las IP las da DHCP; los nombres, DNS."),
        },
      },
    ],
  },
  {
    id: "concepts", number: 1, title: tx("Conceptos"),
    about: tx("Lo que hace funcionar una red de verdad: switches y VLAN, la tabla de rutas, DHCP y DNS. Cada concepto tiene sus máquinas para practicarlo después."),
    skills: [tx("Partir un switch en redes con VLAN."), tx("Leer una tabla de rutas."), tx("Entender cómo un equipo recibe su dirección."), tx("Seguir la resolución de un nombre.")],
    lessons: [
      {
        id: "switching", title: tx("El switch y la difusión"), icon: "switch", minutes: 3,
        body: [
          tx("Un switch aprende en qué puerto está cada MAC mirando las tramas que llegan, y así envía cada una solo por el puerto de su destino. Si aún no conoce el destino, la envía por todos (la inunda)."),
          tx("Algunas tramas van a todos a propósito: las de difusión, como la pregunta de ARP. Todos los equipos que reciben esas tramas forman un dominio de difusión: sin VLAN, todo el switch."),
          tx("Un router no deja pasar la difusión: separa dominios. Por eso, en redes grandes, se parte la red en trozos."),
        ],
        question: {
          text: tx("Un switch recibe una trama para una MAC que aún no conoce. ¿Qué hace?"),
          options: [tx("La descarta"), tx("La envía por todos los puertos menos por el que llegó"), tx("Se la pasa al router")],
          answer: 1,
          why: tx("La inunda: cuando el destino responda, el switch aprenderá su puerto."),
        },
      },
      {
        id: "vlans", title: tx("VLAN"), icon: "switch", minutes: 3,
        body: [
          tx("Una VLAN parte un switch en varios switches lógicos: los puertos de la VLAN 10 solo hablan entre ellos, y los de la VLAN 20 entre ellos. Cada VLAN es su propio dominio de difusión y, normalmente, su propia red IP."),
          tx("Un puerto de acceso pertenece a una VLAN. Para pasar varias VLAN por un mismo cable (de switch a switch, o al router), el puerto es troncal y marca cada trama con su número (802.1Q)."),
          tx("Para que dos VLAN hablen hace falta un router: lo que separa la VLAN, solo lo une el enrutamiento."),
        ],
        question: {
          text: tx("Dos PC en el mismo switch, uno en la VLAN 10 y otro en la 20, con direcciones de la misma red. ¿Se hacen ping?"),
          options: [tx("Sí, están en la misma red IP"), tx("No: las VLAN los separan como si fueran switches distintos"), tx("Solo si el switch es nuevo")],
          answer: 1,
          why: tx("La VLAN aísla los puertos aunque las direcciones coincidan: su trama nunca llega al otro."),
        },
      },
      {
        id: "routing-table", title: tx("La tabla de rutas"), icon: "router", minutes: 3,
        body: [
          tx("Cada router (y cada equipo) tiene una tabla de rutas: para cada red de destino, por dónde seguir. Las redes que tiene conectadas las conoce solo; las demás hay que enseñárselas, a mano (rutas estáticas) o con un protocolo (OSPF, BGP)."),
          tx("Una ruta dice: «para 192.168.2.0/24, envía a 10.0.0.2», el siguiente salto, que debe estar en una red conectada. La ruta 0.0.0.0/0 es la ruta por defecto: todo lo que no tenga una ruta mejor."),
          tx("Gana la ruta más concreta: con una ruta a 10.0.0.0/8 y otra a 10.1.0.0/16, un paquete a 10.1.2.3 sigue la segunda. Y el camino de vuelta también necesita su ruta."),
        ],
        question: {
          text: tx("R1 tiene rutas a 10.0.0.0/8 y a 10.1.0.0/16. ¿Cuál usa para 10.1.2.3?"),
          options: ["10.0.0.0/8", "10.1.0.0/16", tx("La primera que se escribió")],
          answer: 1,
          why: tx("Gana el prefijo más largo, la ruta más concreta: /16 antes que /8."),
        },
      },
      {
        id: "dhcp", title: tx("DHCP"), icon: "server", minutes: 3,
        body: [
          tx("Con DHCP, un equipo recibe su dirección, su máscara, su puerta de enlace y su DNS al conectarse, sin escribirlos. Son cuatro mensajes: Discover, Offer, Request y Ack (DORA)."),
          tx("El Discover es una difusión: el equipo aún no tiene dirección y no sabe quién es el servidor. Por eso no cruza un router, salvo que el router haga de relay y lo reenvíe al servidor de otra red."),
          tx("El servidor da direcciones de un rango (pool) que no debe chocar con las puestas a mano."),
        ],
        question: {
          text: tx("El servidor DHCP está en otra red. ¿Qué hace falta para que los equipos reciban dirección?"),
          options: [tx("Nada, el Discover llega solo"), tx("Un relay DHCP en el router de su red"), tx("Un switch más grande")],
          answer: 1,
          why: tx("El Discover es difusión y no cruza el router: el relay lo reenvía al servidor."),
        },
      },
      {
        id: "dns", title: tx("DNS"), icon: "globe", minutes: 2,
        body: [
          tx("Las personas recuerdan nombres (ejemplo.com); los equipos, direcciones. DNS traduce de uno a otro: el equipo pregunta a su servidor DNS y recibe la dirección (un registro A)."),
          tx("Si el nombre no se resuelve, el navegador no llega aunque la red funcione: «ping a la IP sí, al nombre no» es un problema de DNS, no de enrutamiento."),
          tx("Cada equipo debe tener configurado un servidor DNS al que llegue, a mano o por DHCP."),
        ],
        question: {
          text: tx("El ping a 10.0.0.80 funciona, pero el ping a web.lab falla. ¿Qué miras primero?"),
          options: [tx("Las rutas"), tx("El DNS: el servidor y su registro de web.lab"), tx("Los cables")],
          answer: 1,
          why: tx("Si la IP llega, la red funciona: lo que falla es traducir el nombre."),
        },
      },
    ],
  },
  {
    id: "references", number: 2, title: tx("Referencias"),
    about: tx("Hojas para tener a mano mientras juegas: los comandos de la CLI de cada equipo, el cálculo de subredes y los puertos más comunes."),
    skills: [tx("Configurar un equipo Linux desde su CLI."), tx("Hacer lo mismo en un MikroTik."), tx("Calcular cuántos equipos caben en una red."), tx("Reconocer un servicio por su puerto.")],
    references: [
      {
        id: "linux-ip", title: tx("CLI de Linux: ip"), icon: "alpine", summary: tx("Los equipos Alpine, Ubuntu y Debian de los retos en Medio."),
        columns: [tx("Comando"), tx("Qué hace")],
        rows: [
          ["ip addr", tx("Las direcciones de cada interfaz")],
          ["ip addr add 192.168.1.20/24 dev eth0", tx("Pone una dirección a eth0")],
          ["ip addr del 192.168.1.20/24 dev eth0", tx("La quita")],
          ["ip link set eth0 up", tx("Enciende la interfaz")],
          ["ip route", tx("La tabla de rutas")],
          ["ip route add default via 192.168.1.1", tx("La puerta de enlace (ruta por defecto)")],
          ["ip route add 10.2.0.0/24 via 10.0.0.2", tx("Una ruta estática")],
          ["ip neigh", tx("Lo aprendido por ARP: IP y MAC de los vecinos")],
          ["ping -c 4 10.0.0.1", tx("Cuatro pings")],
          ["traceroute -n 8.8.8.8", tx("Los saltos hasta un destino")],
          ["sysctl -w net.ipv4.ip_forward=1", tx("Que un Linux enrute entre sus interfaces")],
        ],
      },
      {
        id: "routeros", title: tx("CLI de MikroTik RouterOS"), icon: "routeros", summary: tx("El router de MikroTik (CHR) de la emulación; usuario admin, contraseña admin."),
        columns: [tx("Comando"), tx("Qué hace")],
        rows: [
          ["/ip address print", tx("Las direcciones")],
          ["/ip address add address=192.168.1.1/24 interface=ether2", tx("Pone una dirección a ether2")],
          ["/ip route print", tx("La tabla de rutas")],
          ["/ip route add dst-address=10.2.0.0/24 gateway=10.0.0.2", tx("Una ruta estática")],
          ["/ip route add dst-address=0.0.0.0/0 gateway=10.0.0.1", tx("La ruta por defecto")],
          ["/interface print", tx("Las interfaces y su estado")],
          ["/ip arp print", tx("Lo aprendido por ARP")],
          ["/ping 10.0.0.1 count=4", tx("Cuatro pings")],
          ["/tool traceroute 8.8.8.8", tx("Los saltos hasta un destino")],
        ],
      },
      {
        id: "subnets", title: tx("Subredes de un vistazo"), icon: "topology", summary: tx("Cada prefijo con su máscara y cuántos equipos caben (sin la dirección de red ni la de difusión)."),
        columns: [tx("Prefijo"), tx("Máscara · equipos")],
        rows: [
          ["/8", "255.0.0.0 · 16 777 214"],
          ["/16", "255.255.0.0 · 65 534"],
          ["/24", "255.255.255.0 · 254"],
          ["/25", "255.255.255.128 · 126"],
          ["/26", "255.255.255.192 · 62"],
          ["/27", "255.255.255.224 · 30"],
          ["/28", "255.255.255.240 · 14"],
          ["/29", "255.255.255.248 · 6"],
          ["/30", tx("255.255.255.252 · 2 (enlace entre routers)")],
          ["/32", tx("255.255.255.255 · un solo equipo")],
        ],
      },
      {
        id: "ports", title: tx("Puertos y protocolos"), icon: "server", summary: tx("Los servicios más comunes y el puerto en que escuchan."),
        columns: [tx("Puerto"), tx("Servicio")],
        rows: [
          ["22/tcp", tx("SSH: consola remota cifrada")],
          ["23/tcp", tx("Telnet: consola remota sin cifrar")],
          ["53/udp", tx("DNS: resolver nombres")],
          ["67-68/udp", tx("DHCP: servidor y cliente")],
          ["80/tcp", tx("HTTP: web")],
          ["443/tcp", tx("HTTPS: web cifrada")],
          ["161/udp", tx("SNMP: supervisión")],
          ["179/tcp", tx("BGP: rutas entre sistemas autónomos")],
          ["89 (IP)", tx("OSPF: va directamente sobre IP, sin puerto")],
        ],
      },
    ],
  },
  {
    id: "machines", number: 3, title: tx("Máquinas"),
    about: tx("Lo aprendido, en tus manos: la primera máquina de cada tema, la más sencilla. Supéralas todas y estarás listo para el resto."),
    skills: [tx("Dar una dirección y comprobarla con ping."), tx("Separar equipos con VLAN."), tx("Poner la puerta de enlace."), tx("Servir direcciones por DHCP y nombres por DNS.")],
    machines: ["first-network", "split-vlans", "default-gateway", "dhcp-server", "dns-record"],
  },
];

export const lessonById = (id: string) => TIERS.flatMap(tier => tier.lessons ?? []).find(lesson => lesson.id === id);

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
