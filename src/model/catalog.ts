// Device types: how each one is shown, how it behaves in the simulation and
// which ports it is created with.
import type { DeviceType } from "./types";

/** host: ends traffic; switch: forwards frames; router: forwards packets */
export type Role = "host" | "switch" | "router";

export interface DeviceKind {
  type: DeviceType;
  label: string;
  role: Role;
  /** ports a new device of this type gets */
  ports: string[];
  /** prefix of the name of a new device ("Router 1") */
  namePrefix: string;
  /** what it is, for the "add a device" list */
  description: string;
  /** other words it is searched by */
  keywords: string;
}

const range = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

export const CATALOG: Record<DeviceType, DeviceKind> = {
  router: { type: "router", label: "Router", role: "router", ports: range("Gi0/", 0, 3), namePrefix: "Router",
    description: "Enruta entre redes con rutas estáticas.", keywords: "enrutador gateway capa 3 l3" },
  switch: { type: "switch", label: "Switch", role: "switch", ports: range("Fa0/", 1, 8), namePrefix: "Switch",
    description: "Conecta equipos de una LAN; aprende MACs y separa VLANs.", keywords: "conmutador capa 2 l2 lan vlan" },
  firewall: { type: "firewall", label: "Firewall", role: "router", ports: range("eth", 0, 3), namePrefix: "Firewall",
    description: "Separa redes y reenvía entre ellas, como un router.", keywords: "cortafuegos seguridad fw" },
  pc: { type: "pc", label: "PC", role: "host", ports: ["eth0"], namePrefix: "PC",
    description: "Ordenador de escritorio con una interfaz.", keywords: "ordenador computadora equipo host escritorio" },
  laptop: { type: "laptop", label: "Laptop", role: "host", ports: ["eth0"], namePrefix: "Laptop",
    description: "Portátil con una interfaz.", keywords: "portatil notebook equipo host" },
  server: { type: "server", label: "Servidor", role: "host", ports: ["eth0", "eth1"], namePrefix: "Servidor",
    description: "Servidor con dos interfaces.", keywords: "servidor dns web host" },
  phone: { type: "phone", label: "Smartphone", role: "host", ports: ["wlan0"], namePrefix: "Smartphone",
    description: "Teléfono con Wi-Fi.", keywords: "smartphone telefono movil celular wifi inalambrico" },
  ap: { type: "ap", label: "Access Point", role: "switch", ports: ["eth0", ...range("wlan", 0, 3)], namePrefix: "AP",
    description: "Punto de acceso Wi-Fi: un switch con puertos inalámbricos.", keywords: "access point wifi inalambrico wlan" },
  iot: { type: "iot", label: "IoT", role: "host", ports: ["eth0"], namePrefix: "IoT",
    description: "Sensor o dispositivo conectado.", keywords: "sensor camara internet de las cosas" },
  cloud: { type: "cloud", label: "Internet / ISP", role: "router", ports: range("eth", 0, 1), namePrefix: "ISP",
    description: "Proveedor de Internet: un router con dos interfaces.", keywords: "isp internet nube proveedor wan" },
};

/** The order of the device palette */
export const PALETTE: DeviceType[] = ["pc", "laptop", "server", "phone", "iot", "switch", "ap", "router", "firewall", "cloud"];

export const roleOf = (type: DeviceType): Role => CATALOG[type]?.role ?? "host";
