// Device types: how each one is shown, how it behaves in the simulation and
// which ports it is created with.
import { tx } from "./i18n";
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
  /** what it is, for the "add a device" list (label, description, prefix and
   * keywords are Spanish keys, translated where they are shown) */
  description: string;
  /** other words it is searched by */
  keywords: string;
}

const range = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

export const CATALOG: Record<DeviceType, DeviceKind> = {
  router: { type: "router", label: tx("Router"), role: "router", ports: range("Gi0/", 0, 3), namePrefix: tx("Router"),
    description: tx("Enruta entre redes con rutas estáticas."), keywords: tx("enrutador gateway capa 3 l3") },
  switch: { type: "switch", label: tx("Switch"), role: "switch", ports: range("Fa0/", 1, 8), namePrefix: tx("Switch"),
    description: tx("Conecta equipos de una LAN; aprende MACs y separa VLANs."), keywords: tx("conmutador capa 2 l2 lan vlan") },
  firewall: { type: "firewall", label: tx("Firewall"), role: "router", ports: range("eth", 0, 3), namePrefix: tx("Firewall"),
    description: tx("Separa redes y reenvía entre ellas, como un router."), keywords: tx("cortafuegos seguridad fw") },
  pc: { type: "pc", label: tx("PC"), role: "host", ports: ["eth0"], namePrefix: tx("PC"),
    description: tx("Ordenador de escritorio con una interfaz."), keywords: tx("ordenador computadora equipo host escritorio") },
  laptop: { type: "laptop", label: tx("Laptop"), role: "host", ports: ["eth0"], namePrefix: tx("Laptop"),
    description: tx("Portátil con una interfaz."), keywords: tx("portatil notebook equipo host") },
  server: { type: "server", label: tx("Servidor"), role: "host", ports: ["eth0", "eth1"], namePrefix: tx("Servidor"),
    description: tx("Servidor con dos interfaces."), keywords: tx("servidor dns web host") },
  phone: { type: "phone", label: tx("Smartphone"), role: "host", ports: ["wlan0"], namePrefix: tx("Smartphone"),
    description: tx("Teléfono con Wi-Fi."), keywords: tx("smartphone telefono movil celular wifi inalambrico") },
  ap: { type: "ap", label: tx("Access Point"), role: "switch", ports: ["eth0", ...range("wlan", 0, 3)], namePrefix: tx("AP"),
    description: tx("Punto de acceso Wi-Fi: un switch con puertos inalámbricos."), keywords: tx("access point wifi inalambrico wlan") },
  iot: { type: "iot", label: tx("IoT"), role: "host", ports: ["eth0"], namePrefix: tx("IoT"),
    description: tx("Sensor o dispositivo conectado."), keywords: tx("sensor camara internet de las cosas") },
  cloud: { type: "cloud", label: tx("Internet / ISP"), role: "router", ports: range("eth", 0, 1), namePrefix: tx("ISP"),
    description: tx("Proveedor de Internet: un router con dos interfaces."), keywords: tx("isp internet nube proveedor wan") },
};

/** The order of the device palette */
export const PALETTE: DeviceType[] = ["pc", "laptop", "server", "phone", "iot", "switch", "ap", "router", "firewall", "cloud"];

export const roleOf = (type: DeviceType): Role => CATALOG[type]?.role ?? "host";
