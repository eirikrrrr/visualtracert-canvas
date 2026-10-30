// Ready-made labs to open from the gallery: each one shows a topic (a LAN,
// VLANs, static routing, DHCP, DNS…) and says what to try in it, so a lab can
// be explored without writing a topology first. Written with a small builder
// so each one reads as the network it is. Texts are Spanish keys: the gallery
// shows them translated, and a lab is built in the language it is opened in.
import { spanish, tx, type T } from "./i18n";
import { CATALOG } from "./catalog";
import { exampleTopology } from "./example";
import type { Device, DeviceType, Interface, Link, Route, Services, Topology } from "./types";

export type Level = "Básico" | "Intermedio" | "Avanzado";

export interface Template {
  id: string;
  name: string;
  summary: string;
  level: Level;
  topics: string[];
  /** what to try once it is open */
  tryThis: string[];
  build: (t?: T) => Topology;
}

/** "10.0.0.1/24" or, for a router port, its address and a DHCP relay */
type PortSpec = string | { ip?: string; relay?: string };

interface HostSpec {
  ip?: string;
  gateway?: string;
  dns?: string;
  dhcp?: boolean;
  services?: Services;
  description?: string;
}

function lab(seed: number, name: string) {
  let count = 0;
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  // a fixed MAC per lab and port: the documents do not change between openings
  const mac = () => { count += 1; return `02:${hex(seed)}:00:00:${hex(count >> 8)}:${hex(count & 255)}`; };
  const devices: Device[] = [];
  const links: Link[] = [];
  const address = (spec: string | undefined): Partial<Interface> => {
    if(!spec) return {};
    const [ip, prefix] = spec.split("/");
    return { ip, prefix: Number(prefix ?? 24) };
  };
  const ports = (type: DeviceType) => CATALOG[type].ports;

  return {
    /** an end device: its first port gets the address (or DHCP) */
    host(id: string, type: DeviceType, label: string, x: number, y: number, spec: HostSpec = {}) {
      devices.push({
        id, type, name: label, position: { x, y },
        ...(spec.description ? { description: spec.description } : {}),
        interfaces: ports(type).map((port, i) => ({
          name: port, mac: mac(), ...(i === 0 ? { ...address(spec.ip), ...(spec.dhcp ? { dhcp: true } : {}) } : {}),
        })),
        ...(spec.gateway ? { gateway: spec.gateway } : {}),
        ...(spec.dns ? { dns: spec.dns } : {}),
        ...(spec.services ? { services: spec.services } : {}),
      });
    },
    router(id: string, label: string, x: number, y: number, addresses: Record<string, PortSpec>, routes: [string, string][] = [],
      extra: { type?: DeviceType; services?: Services; description?: string } = {}) {
      const type = extra.type ?? "router";
      devices.push({
        id, type, name: label, position: { x, y },
        ...(extra.description ? { description: extra.description } : {}),
        interfaces: ports(type).map(port => {
          const spec = addresses[port];
          const detail = typeof spec === "string" ? { ip: spec } : spec ?? {};
          return { name: port, mac: mac(), ...address(detail.ip), ...(detail.relay ? { relay: detail.relay } : {}) };
        }),
        ...(routes.length ? { routes: routes.map(([prefix, via]): Route => ({ prefix, via })) } : {}),
        ...(extra.services ? { services: extra.services } : {}),
      });
    },
    /** a switch (or access point); vlans gives the access VLAN of some ports */
    switch(id: string, label: string, x: number, y: number, vlans: Record<string, number> = {}, type: DeviceType = "switch") {
      devices.push({
        id, type, name: label, position: { x, y },
        interfaces: ports(type).map(port => ({ name: port, mac: mac(), ...(vlans[port] && vlans[port] !== 1 ? { vlan: vlans[port] } : {}) })),
      });
    },
    /** a cable: "device:port" to "device:port" */
    link(a: string, b: string) {
      const end = (text: string) => { const [device, iface] = text.split(":"); return { device, interface: iface }; };
      links.push({ id: `l${links.length + 1}`, a: end(a), b: end(b) });
    },
    done(description: string): Topology {
      return { version: 1, name, description, devices, links };
    },
  };
}

type Builder = ReturnType<typeof lab>;

/** the lab's description: its summary and what to try, as a list */
const describe = (meta: Omit<Template, "build">, t: T) =>
  `${t(meta.summary)}\n\n${t("Qué probar")}:\n${meta.tryThis.map(item => `- ${t(item)}`).join("\n")}`;

/** a template drawn with the builder (or, for the example, a ready topology) */
function template(seed: number, meta: Omit<Template, "build">, draw: (net: Builder, t: T) => Topology | void): Template {
  return {
    ...meta,
    build: (t = spanish) => {
      const net = lab(seed, t(meta.name));
      const drawn = draw(net, t);
      return drawn ? { ...drawn, name: t(meta.name), description: describe(meta, t) } : net.done(describe(meta, t));
    },
  };
}

export const TEMPLATES: Template[] = [
  template(1, {
    id: "lan-basica", name: tx("LAN básica"), level: "Básico", topics: [tx("Switch"), "ARP", "ICMP"],
    summary: tx("Cuatro equipos y un servidor en el mismo switch, todos en 192.168.1.0/24. Sin routers: todo es la misma red."),
    tryThis: [
      tx("Ping de PC 1 a PC 3: el ARP sale por difusión y el switch lo inunda por todos sus puertos."),
      tx("Repite el ping: el switch ya aprendió las MAC y solo reenvía por el puerto correcto."),
      tx("Ping a 192.168.1.99, una dirección que nadie tiene: el ARP se queda sin respuesta."),
    ],
  }, (net, t) => {
    net.switch("switch", "Switch", 420, 320);
    net.host("pc-1", "pc", "PC 1", 120, 120, { ip: "192.168.1.11/24" });
    net.host("pc-2", "pc", "PC 2", 420, 80, { ip: "192.168.1.12/24" });
    net.host("pc-3", "pc", "PC 3", 720, 120, { ip: "192.168.1.13/24" });
    net.host("laptop", "laptop", "Laptop", 720, 540, { ip: "192.168.1.14/24" });
    net.host("server", "server", t("Servidor"), 120, 540, { ip: "192.168.1.20/24" });
    ["pc-1", "pc-2", "pc-3", "laptop", "server"].forEach((id, i) => net.link(`switch:Fa0/${i + 1}`, `${id}:eth0`));
  }),

  template(2, {
    id: "dos-redes", name: tx("Dos redes y un router"), level: "Básico", topics: [tx("Router"), tx("Puerta de enlace"), "TTL"],
    summary: tx("Dos LAN (192.168.10.0/24 y 192.168.20.0/24) unidas por un router. Cada equipo usa el router como puerta de enlace."),
    tryThis: [
      tx("Ping de PC A1 a PC B1: el PC pregunta por ARP la MAC del router, no la del destino."),
      tx("Fíjate en el TTL de la respuesta: el router lo baja en uno al reenviar."),
      tx("Ping con TTL 1: el router lo descarta y responde «tiempo excedido»."),
      tx("Quita la puerta de enlace de PC A2 e intenta salir de su red."),
    ],
  }, net => {
    net.router("router", "Router", 420, 60, { "Gi0/0": "192.168.10.1/24", "Gi0/1": "192.168.20.1/24" });
    net.switch("switch-a", "Switch A", 180, 300);
    net.switch("switch-b", "Switch B", 660, 300);
    net.host("pc-a1", "pc", "PC A1", 60, 540, { ip: "192.168.10.11/24", gateway: "192.168.10.1" });
    net.host("pc-a2", "pc", "PC A2", 300, 540, { ip: "192.168.10.12/24", gateway: "192.168.10.1" });
    net.host("pc-b1", "pc", "PC B1", 540, 540, { ip: "192.168.20.11/24", gateway: "192.168.20.1" });
    net.host("pc-b2", "laptop", "Laptop B2", 780, 540, { ip: "192.168.20.12/24", gateway: "192.168.20.1" });
    net.link("router:Gi0/0", "switch-a:Fa0/1");
    net.link("router:Gi0/1", "switch-b:Fa0/1");
    net.link("switch-a:Fa0/2", "pc-a1:eth0");
    net.link("switch-a:Fa0/3", "pc-a2:eth0");
    net.link("switch-b:Fa0/2", "pc-b1:eth0");
    net.link("switch-b:Fa0/3", "pc-b2:eth0");
  }),

  template(3, {
    id: "vlans", name: tx("VLAN en un switch"), level: "Básico", topics: ["VLAN", tx("Difusión")],
    summary: tx("Un solo switch partido en dos VLAN: Ventas (VLAN 10) y Contabilidad (VLAN 20). Todos los equipos están en 192.168.1.0/24, pero las VLAN los separan."),
    tryThis: [
      tx("Ping de Ventas 1 a Ventas 2: funciona, están en la misma VLAN."),
      tx("Ping de Ventas 1 a Conta 1: el ARP no cruza a la otra VLAN y nadie responde."),
      tx("Cambia la VLAN del puerto de Conta 1 a 10 (selecciona el switch) y repite."),
    ],
  }, (net, t) => {
    net.switch("switch", "Switch", 420, 300, { "Fa0/1": 10, "Fa0/2": 10, "Fa0/3": 20, "Fa0/4": 20 });
    net.host("ventas-1", "pc", t("Ventas 1"), 100, 80, { ip: "192.168.1.11/24", description: "VLAN 10" });
    net.host("ventas-2", "laptop", t("Ventas 2"), 100, 520, { ip: "192.168.1.12/24", description: "VLAN 10" });
    net.host("conta-1", "pc", t("Conta 1"), 740, 80, { ip: "192.168.1.21/24", description: "VLAN 20" });
    net.host("conta-2", "pc", t("Conta 2"), 740, 520, { ip: "192.168.1.22/24", description: "VLAN 20" });
    net.link("switch:Fa0/1", "ventas-1:eth0");
    net.link("switch:Fa0/2", "ventas-2:eth0");
    net.link("switch:Fa0/3", "conta-1:eth0");
    net.link("switch:Fa0/4", "conta-2:eth0");
  }),

  template(4, {
    id: "inter-vlan", name: tx("Enrutamiento entre VLAN"), level: "Intermedio", topics: ["VLAN", tx("Router"), tx("Subredes")],
    summary: tx("Las VLAN 10 y 20 del switch tienen cada una su subred (10.10.10.0/24 y 10.10.20.0/24) y un puerto del router: el router las comunica."),
    tryThis: [
      tx("Ping de PC 10-A a PC 20-A: cruza el router, que entra por una VLAN y sale por la otra."),
      tx("Traza de PC 10-B a Servidor 20: el único salto intermedio es el router."),
      tx("Desconecta el cable del router en la VLAN 20 y repite el ping."),
    ],
  }, (net, t) => {
    net.router("router", "Router", 420, 40, { "Gi0/0": "10.10.10.1/24", "Gi0/1": "10.10.20.1/24" });
    net.switch("switch", "Switch", 420, 300, { "Fa0/1": 10, "Fa0/2": 10, "Fa0/3": 10, "Fa0/4": 20, "Fa0/5": 20, "Fa0/6": 20 });
    net.host("pc-10a", "pc", "PC 10-A", 80, 200, { ip: "10.10.10.11/24", gateway: "10.10.10.1", description: "VLAN 10" });
    net.host("pc-10b", "laptop", "PC 10-B", 160, 540, { ip: "10.10.10.12/24", gateway: "10.10.10.1", description: "VLAN 10" });
    net.host("pc-20a", "pc", "PC 20-A", 760, 200, { ip: "10.10.20.11/24", gateway: "10.10.20.1", description: "VLAN 20" });
    net.host("server-20", "server", t("Servidor 20"), 680, 540, { ip: "10.10.20.50/24", gateway: "10.10.20.1", description: "VLAN 20" });
    net.link("router:Gi0/0", "switch:Fa0/1");
    net.link("router:Gi0/1", "switch:Fa0/4");
    net.link("switch:Fa0/2", "pc-10a:eth0");
    net.link("switch:Fa0/3", "pc-10b:eth0");
    net.link("switch:Fa0/5", "pc-20a:eth0");
    net.link("switch:Fa0/6", "server-20:eth0");
  }),

  template(5, {
    id: "cadena-routers", name: tx("Tres routers en cadena"), level: "Intermedio", topics: [tx("Rutas estáticas"), tx("Ruta por defecto"), "Traceroute"],
    summary: tx("Un PC y un servidor separados por tres routers unidos con enlaces /30. R1 y R2 tienen rutas concretas; R3 usa una ruta por defecto."),
    tryThis: [
      tx("Traza del PC al servidor: aparecen R1, R2 y R3, cada uno con la dirección por la que entró la sonda."),
      tx("Borra la ruta hacia 172.16.3.0/24 en R2: el ping recibe «destino inalcanzable» de R2."),
      tx("Borra la ruta por defecto de R3: el eco llega, pero la respuesta no sabe volver."),
    ],
  }, (net, t) => {
    net.host("pc", "pc", "PC", 40, 300, { ip: "172.16.1.10/24", gateway: "172.16.1.1" });
    net.router("r1", "R1", 260, 300, { "Gi0/0": "172.16.1.1/24", "Gi0/1": "10.0.12.1/30" },
      [["172.16.3.0/24", "10.0.12.2"], ["10.0.23.0/30", "10.0.12.2"]]);
    net.router("r2", "R2", 500, 300, { "Gi0/0": "10.0.12.2/30", "Gi0/1": "10.0.23.1/30" },
      [["172.16.1.0/24", "10.0.12.1"], ["172.16.3.0/24", "10.0.23.2"]]);
    net.router("r3", "R3", 740, 300, { "Gi0/0": "10.0.23.2/30", "Gi0/1": "172.16.3.1/24" }, [["0.0.0.0/0", "10.0.23.1"]]);
    net.host("server", "server", t("Servidor"), 980, 300, { ip: "172.16.3.10/24", gateway: "172.16.3.1" });
    net.link("pc:eth0", "r1:Gi0/0");
    net.link("r1:Gi0/1", "r2:Gi0/0");
    net.link("r2:Gi0/1", "r3:Gi0/0");
    net.link("r3:Gi0/1", "server:eth0");
  }),

  template(6, {
    id: "sucursales", name: tx("Central y tres sucursales"), level: "Intermedio", topics: ["Hub and spoke", tx("Rutas estáticas"), "Intranet"],
    summary: tx("Un router central con la intranet y tres sucursales. Cada sucursal sale por una ruta por defecto hacia la central; la central conoce las tres redes."),
    tryThis: [
      tx("Web desde PC Norte a intranet.empresa.lan: DNS, conexión TCP y página, todo en la central."),
      tx("Traza de PC Norte a PC Sur: el tráfico entre sucursales pasa por la central."),
      tx("Quita en la central la ruta hacia 10.3.0.0/24 y prueba a llegar a PC Este."),
    ],
  }, (net, t) => {
    net.host("intranet", "server", "Intranet", 500, 20, {
      ip: "10.0.0.10/24", gateway: "10.0.0.1", dns: "10.0.0.10", description: t("DNS y web de la empresa"),
      services: { dns: [{ name: "intranet.empresa.lan", ip: "10.0.0.10" }], http: true },
    });
    net.router("central", t("Central"), 500, 260, {
      "Gi0/0": "10.0.0.1/24", "Gi0/1": "172.31.0.1/30", "Gi0/2": "172.31.0.5/30", "Gi0/3": "172.31.0.9/30",
    }, [["10.1.0.0/24", "172.31.0.2"], ["10.2.0.0/24", "172.31.0.6"], ["10.3.0.0/24", "172.31.0.10"]]);
    const branches = [["norte", t("Norte"), 140, "172.31.0.2/30", "172.31.0.1"], ["sur", t("Sur"), 500, "172.31.0.6/30", "172.31.0.5"], ["este", t("Este"), 860, "172.31.0.10/30", "172.31.0.9"]] as const;
    branches.forEach(([id, label, x, wan, via], i) => {
      net.router(`r-${id}`, `R ${label}`, x, 500, { "Gi0/0": wan, "Gi0/1": `10.${i + 1}.0.1/24` }, [["0.0.0.0/0", via]]);
      net.host(`pc-${id}`, "pc", `PC ${label}`, x, 740, { ip: `10.${i + 1}.0.10/24`, gateway: `10.${i + 1}.0.1`, dns: "10.0.0.10" });
      net.link(`central:Gi0/${i + 1}`, `r-${id}:Gi0/0`);
      net.link(`r-${id}:Gi0/1`, `pc-${id}:eth0`);
    });
    net.link("central:Gi0/0", "intranet:eth0");
  }),

  template(7, {
    id: "oficina-dhcp", name: tx("Oficina con DHCP"), level: "Básico", topics: ["DHCP", "Wi-Fi"],
    summary: tx("Un servidor DHCP reparte 192.168.50.100–150 a los equipos de la oficina, con el router como puerta de enlace. Los equipos empiezan sin dirección."),
    tryThis: [
      tx("En Simulación, elige DHCP y pide dirección para PC 1: Discover, Offer, Request y ACK, todo por difusión."),
      tx("Pide dirección para los demás: el servidor no repite direcciones ya dadas."),
      tx("Con las direcciones puestas, haz ping de la Tablet a PC 1."),
    ],
  }, (net, t) => {
    net.router("router", "Router", 440, 40, { "Gi0/0": "192.168.50.1/24" });
    net.switch("switch", "Switch", 440, 280);
    net.host("dhcp", "server", t("Servidor DHCP"), 80, 120, {
      ip: "192.168.50.2/24", gateway: "192.168.50.1",
      services: { dhcp: [{ network: "192.168.50.0/24", start: "192.168.50.100", end: "192.168.50.150", gateway: "192.168.50.1" }] },
    });
    net.host("pc-1", "pc", "PC 1", 80, 420, { dhcp: true });
    net.host("pc-2", "pc", "PC 2", 300, 540, { dhcp: true });
    net.host("laptop", "laptop", "Laptop", 580, 540, { dhcp: true });
    net.switch("ap", "AP", 800, 280, {}, "ap");
    net.host("tablet", "phone", "Tablet", 820, 520, { dhcp: true });
    net.link("router:Gi0/0", "switch:Fa0/1");
    net.link("switch:Fa0/2", "dhcp:eth0");
    net.link("switch:Fa0/3", "pc-1:eth0");
    net.link("switch:Fa0/4", "pc-2:eth0");
    net.link("switch:Fa0/5", "laptop:eth0");
    net.link("switch:Fa0/6", "ap:eth0");
    net.link("ap:wlan0", "tablet:wlan0");
  }),

  template(8, {
    id: "dhcp-relay", name: tx("DHCP a través de un router"), level: "Intermedio", topics: ["DHCP", "Relay", "ip helper"],
    summary: tx("El servidor DHCP está en la red de servidores y los clientes en otra. El router tiene un relay (ip helper) en la interfaz de los clientes."),
    tryThis: [
      tx("Pide dirección para PC 1: el router convierte la difusión en unicast hacia el servidor (mira giaddr en las cabeceras DHCP)."),
      tx("El servidor elige el rango por giaddr: los clientes reciben 10.30.0.x, no 10.20.0.x."),
      tx("Borra el relay de Gi0/1 en el router y vuelve a pedir: la difusión muere en el router."),
    ],
  }, (net, t) => {
    net.switch("switch-srv", t("Switch servidores"), 160, 300);
    net.host("dhcp", "server", t("Servidor DHCP"), 160, 40, {
      ip: "10.20.0.5/24", gateway: "10.20.0.1",
      services: { dhcp: [
        { network: "10.20.0.0/24", start: "10.20.0.100", end: "10.20.0.199", gateway: "10.20.0.1" },
        { network: "10.30.0.0/24", start: "10.30.0.100", end: "10.30.0.199", gateway: "10.30.0.1" },
      ] },
    });
    net.host("admin", "laptop", "Admin", 160, 560, { dhcp: true, description: t("Red de servidores") });
    net.router("router", "Router", 440, 300, { "Gi0/0": "10.20.0.1/24", "Gi0/1": { ip: "10.30.0.1/24", relay: "10.20.0.5" } });
    net.switch("switch-cli", t("Switch clientes"), 720, 300);
    net.host("pc-1", "pc", "PC 1", 940, 120, { dhcp: true });
    net.host("pc-2", "pc", "PC 2", 940, 300, { dhcp: true });
    net.host("pc-3", "pc", "PC 3", 940, 480, { dhcp: true });
    net.link("switch-srv:Fa0/1", "dhcp:eth0");
    net.link("switch-srv:Fa0/2", "admin:eth0");
    net.link("switch-srv:Fa0/3", "router:Gi0/0");
    net.link("router:Gi0/1", "switch-cli:Fa0/1");
    net.link("switch-cli:Fa0/2", "pc-1:eth0");
    net.link("switch-cli:Fa0/3", "pc-2:eth0");
    net.link("switch-cli:Fa0/4", "pc-3:eth0");
  }),

  template(9, {
    id: "dns-web", name: tx("Centro de datos: DNS y web"), level: "Intermedio", topics: ["DNS", "HTTP", "TCP"],
    summary: tx("Los clientes de la oficina usan un DNS del centro de datos, que resuelve los nombres de la tienda. Hay un servidor web y una API."),
    tryThis: [
      tx("Web desde Cliente 1 a www.tienda.com: consulta DNS, saludo TCP (SYN, SYN-ACK, ACK), GET, respuesta y cierre."),
      tx("DNS de noexiste.tienda.com: el servidor responde NXDOMAIN."),
      tx("Web a api.tienda.com/estado: el servidor responde 404."),
      tx("Web a dns.tienda.com: el servidor DNS no tiene web y rechaza la conexión (RST)."),
    ],
  }, (net, t) => {
    net.switch("switch-of", t("Switch oficina"), 200, 300);
    net.host("cliente-1", "pc", t("Cliente 1"), 40, 100, { ip: "192.168.100.11/24", gateway: "192.168.100.1", dns: "172.20.0.53" });
    net.host("cliente-2", "laptop", t("Cliente 2"), 40, 500, { ip: "192.168.100.12/24", gateway: "192.168.100.1", dns: "172.20.0.53" });
    net.router("router", "Router", 460, 300, { "Gi0/0": "192.168.100.1/24", "Gi0/1": "172.20.0.1/24" });
    net.switch("switch-dc", t("Switch CPD"), 720, 300);
    net.host("dns", "server", "DNS", 960, 80, {
      ip: "172.20.0.53/24", gateway: "172.20.0.1",
      services: { dns: [
        { name: "www.tienda.com", ip: "172.20.0.80" }, { name: "tienda.com", ip: "172.20.0.80" },
        { name: "api.tienda.com", ip: "172.20.0.81" }, { name: "dns.tienda.com", ip: "172.20.0.53" },
      ] },
    });
    net.host("web", "server", "Web", 960, 300, { ip: "172.20.0.80/24", gateway: "172.20.0.1", services: { http: true } });
    net.host("api", "server", "API", 960, 520, { ip: "172.20.0.81/24", gateway: "172.20.0.1", services: { http: true } });
    net.link("switch-of:Fa0/1", "cliente-1:eth0");
    net.link("switch-of:Fa0/2", "cliente-2:eth0");
    net.link("switch-of:Fa0/3", "router:Gi0/0");
    net.link("router:Gi0/1", "switch-dc:Fa0/1");
    net.link("switch-dc:Fa0/2", "dns:eth0");
    net.link("switch-dc:Fa0/3", "web:eth0");
    net.link("switch-dc:Fa0/4", "api:eth0");
  }),

  template(10, {
    id: "casa", name: tx("Casa con Internet"), level: "Básico", topics: ["Wi-Fi", "DHCP", "ISP", "Web"],
    summary: tx("La red de una casa: el router de casa reparte direcciones por DHCP y sale a Internet por el ISP, donde hay un servidor público de DNS y web."),
    tryThis: [
      tx("Pide dirección por DHCP para el Laptop: aquí el servidor DHCP es el propio router."),
      tx("Con dirección, abre www.noticias.com desde el Laptop."),
      tx("Traza desde el Smartphone a 1.1.1.1 (tras pedir su dirección)."),
    ],
  }, (net, t) => {
    net.host("public", "server", t("Servidor público"), 900, 40, {
      ip: "1.1.1.1/24", gateway: "1.1.1.254", description: t("DNS y web en Internet"),
      services: { dns: [{ name: "www.noticias.com", ip: "1.1.1.1" }, { name: "noticias.com", ip: "1.1.1.1" }], http: true },
    });
    net.router("isp", "ISP", 600, 40, { eth0: "100.64.10.1/30", eth1: "1.1.1.254/24" }, [["192.168.1.0/24", "100.64.10.2"]],
      { type: "cloud", description: t("Proveedor de Internet") });
    net.router("home", t("Router de casa"), 300, 220, { "Gi0/0": "100.64.10.2/30", "Gi0/1": "192.168.1.1/24" }, [["0.0.0.0/0", "100.64.10.1"]],
      { services: { dhcp: [{ network: "192.168.1.0/24", start: "192.168.1.100", end: "192.168.1.150", gateway: "192.168.1.1", dns: "1.1.1.1" }] }, description: t("Router Wi-Fi con DHCP") });
    net.switch("ap", "Wi-Fi", 300, 460, {}, "ap");
    net.host("laptop", "laptop", "Laptop", 40, 640, { dhcp: true });
    net.host("phone", "phone", "Smartphone", 300, 700, { dhcp: true });
    net.host("tv", "iot", "Smart TV", 560, 640, { dhcp: true });
    net.link("public:eth0", "isp:eth1");
    net.link("isp:eth0", "home:Gi0/0");
    net.link("home:Gi0/1", "ap:eth0");
    net.link("ap:wlan0", "laptop:eth0");
    net.link("ap:wlan1", "phone:wlan0");
    net.link("ap:wlan2", "tv:eth0");
  }),

  template(11, {
    id: "averias", name: tx("Red con averías"), level: "Avanzado", topics: [tx("Diagnóstico"), tx("Puerta de enlace"), "VLAN", tx("Rutas")],
    summary: tx("Dos oficinas unidas por dos routers, pero algo falla: solo PC A1 llega a su router. Hay tres averías escondidas."),
    tryThis: [
      tx("Ping de PC A1 a PC B1: el eco llega, la respuesta no vuelve. ¿Qué le falta a R2?"),
      tx("Ping de PC A2 a PC B1: mira a quién pregunta por ARP PC A2."),
      tx("Ping de PC B1 a PC B2: el switch B no la deja pasar. Revisa sus puertos."),
      tx("Pista: las tres averías están en las propiedades (puerta de enlace, rutas y VLAN)."),
    ],
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

  template(12, {
    id: "oficina", name: tx("Oficina con salida a Internet"), level: "Avanzado", topics: [tx("Todo junto"), "DHCP", "DNS", "Web"],
    summary: tx("El laboratorio de ejemplo: una oficina con dos redes, servidor DHCP local con relay en el router, y DNS y web al otro lado del ISP."),
    tryThis: [
      tx("Pide dirección por DHCP para el Smartphone, que empieza sin ella."),
      tx("Pide dirección para el Laptop 1: llega por el relay del router."),
      tx("Web desde PC 1 a www.ejemplo.com y traza a 8.8.8.8."),
    ],
  }, (_net, t) => exampleTopology(t)),
];

export const templateById = (id: string) => TEMPLATES.find(item => item.id === id);
