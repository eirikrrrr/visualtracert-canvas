// Device types: how each one is shown, how it behaves in the simulation,
// which ports it is created with, its group in the palette and the image it
// runs as in the emulation.
import { tx } from "./i18n";
import { IMAGES, type ImageId, type ImageInfo } from "./images";
import type { DeviceType } from "./types";

/** host: ends traffic; switch: forwards frames; router: forwards packets */
export type Role = "host" | "switch" | "router";

/** images: a real image, with its official icon; generic: a generic icon */
export type DeviceGroup = "images" | "generic";

export const GROUPS: { id: DeviceGroup; label: string; description: string }[] = [
  { id: "images", label: tx("Imágenes oficiales"), description: tx("Contenedores de una imagen real, con su icono oficial.") },
  { id: "generic", label: tx("Genéricos"), description: tx("Iconos genéricos: en Emulación corren sobre Alpine Linux.") },
];

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
  group: DeviceGroup;
  /** the image it runs as in the emulation */
  image: ImageId;
}

const range = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

const generic = { group: "generic", image: "alpine" } as const;

export const CATALOG: Record<DeviceType, DeviceKind> = {
  alpine: { type: "alpine", label: tx("Alpine Linux"), role: "host", ports: range("eth", 0, 3), namePrefix: tx("Alpine"),
    description: tx("Contenedor Alpine Linux real: shell, ip, ping y traceroute de BusyBox."), keywords: tx("alpine linux contenedor docker imagen oficial busybox shell"),
    group: "images", image: "alpine" },
  router: { type: "router", label: tx("Router"), role: "router", ports: range("Gi0/", 0, 3), namePrefix: tx("Router"),
    description: tx("Enruta entre redes con rutas estáticas."), keywords: tx("enrutador gateway capa 3 l3"), ...generic },
  switch: { type: "switch", label: tx("Switch"), role: "switch", ports: range("Fa0/", 1, 8), namePrefix: tx("Switch"),
    description: tx("Conecta equipos de una LAN; aprende MACs y separa VLANs."), keywords: tx("conmutador capa 2 l2 lan vlan"), ...generic },
  firewall: { type: "firewall", label: tx("Firewall"), role: "router", ports: range("eth", 0, 3), namePrefix: tx("Firewall"),
    description: tx("Separa redes y reenvía entre ellas, como un router."), keywords: tx("cortafuegos seguridad fw"), ...generic },
  pc: { type: "pc", label: tx("PC"), role: "host", ports: ["eth0"], namePrefix: tx("PC"),
    description: tx("Ordenador de escritorio con una interfaz."), keywords: tx("ordenador computadora equipo host escritorio"), ...generic },
  laptop: { type: "laptop", label: tx("Laptop"), role: "host", ports: ["eth0"], namePrefix: tx("Laptop"),
    description: tx("Portátil con una interfaz."), keywords: tx("portatil notebook equipo host"), ...generic },
  server: { type: "server", label: tx("Servidor"), role: "host", ports: ["eth0", "eth1"], namePrefix: tx("Servidor"),
    description: tx("Servidor con dos interfaces."), keywords: tx("servidor dns web host"), ...generic },
  phone: { type: "phone", label: tx("Smartphone"), role: "host", ports: ["wlan0"], namePrefix: tx("Smartphone"),
    description: tx("Teléfono con Wi-Fi."), keywords: tx("smartphone telefono movil celular wifi inalambrico"), ...generic },
  ap: { type: "ap", label: tx("Access Point"), role: "switch", ports: ["eth0", ...range("wlan", 0, 3)], namePrefix: tx("AP"),
    description: tx("Punto de acceso Wi-Fi: un switch con puertos inalámbricos."), keywords: tx("access point wifi inalambrico wlan"), ...generic },
  iot: { type: "iot", label: tx("IoT"), role: "host", ports: ["eth0"], namePrefix: tx("IoT"),
    description: tx("Sensor o dispositivo conectado."), keywords: tx("sensor camara internet de las cosas"), ...generic },
  cloud: { type: "cloud", label: tx("Internet / ISP"), role: "router", ports: range("eth", 0, 1), namePrefix: tx("ISP"),
    description: tx("Proveedor de Internet: un router con dos interfaces."), keywords: tx("isp internet nube proveedor wan"), ...generic },
};

/** The order of the device palette */
export const PALETTE: DeviceType[] = ["alpine", "pc", "laptop", "server", "phone", "iot", "switch", "ap", "router", "firewall", "cloud"];

export const roleOf = (type: DeviceType): Role => CATALOG[type]?.role ?? "host";

export const imageOf = (type: DeviceType): ImageInfo => IMAGES[CATALOG[type]?.image ?? "alpine"];
