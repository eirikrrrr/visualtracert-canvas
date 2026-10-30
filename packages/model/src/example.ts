// The lab the app opens with the first time: an office LAN behind a router,
// with its own DHCP server, a second subnet on the router (served through a
// DHCP relay) and a DNS and web server on the other side of the ISP.
import { spanish, type T } from "./i18n";
import type { Topology } from "./types";

const mac = (n: number) => `02:00:00:00:00:${n.toString(16).padStart(2, "0")}`;

export const exampleTopology = (t: T = spanish): Topology => ({
  version: 1,
  name: t("Oficina con salida a Internet"),
  devices: [
    {
      id: "isp", type: "cloud", name: "ISP", description: t("Proveedor de Internet"),
      position: { x: 520, y: 40 },
      interfaces: [
        { name: "eth0", mac: mac(1), ip: "203.0.113.1", prefix: 30 },
        { name: "eth1", mac: mac(2), ip: "8.8.8.1", prefix: 24 },
      ],
      routes: [{ prefix: "192.168.0.0/16", via: "203.0.113.2" }],
    },
    {
      id: "dns", type: "server", name: t("Servidor DNS"), description: t("DNS y web de ejemplo.com"),
      position: { x: 880, y: 40 },
      interfaces: [{ name: "eth0", mac: mac(3), ip: "8.8.8.8", prefix: 24 }, { name: "eth1", mac: mac(4) }],
      gateway: "8.8.8.1",
      services: {
        dns: [{ name: "www.ejemplo.com", ip: "8.8.8.8" }, { name: "ejemplo.com", ip: "8.8.8.8" }, { name: "servidor.oficina.lan", ip: "192.168.21.2" }],
        http: true,
      },
    },
    {
      id: "router-1", type: "router", name: "Router 1", description: t("Router de la oficina"),
      position: { x: 520, y: 260 },
      interfaces: [
        { name: "Gi0/0", mac: mac(16), ip: "203.0.113.2", prefix: 30 },
        { name: "Gi0/1", mac: mac(17), ip: "192.168.21.1", prefix: 24 },
        { name: "Gi0/2", mac: mac(18), ip: "192.168.31.1", prefix: 24, relay: "192.168.21.2" },
        { name: "Gi0/3", mac: mac(19) },
      ],
      routes: [{ prefix: "0.0.0.0/0", via: "203.0.113.1" }],
    },
    {
      id: "switch-1", type: "switch", name: "Switch 1",
      position: { x: 300, y: 460 },
      interfaces: Array.from({ length: 8 }, (_, i) => ({ name: `Fa0/${i + 1}`, mac: mac(32 + i) })),
    },
    {
      id: "pc-1", type: "pc", name: "PC 1", position: { x: 60, y: 300 },
      interfaces: [{ name: "eth0", mac: mac(64), ip: "192.168.21.10", prefix: 24 }], gateway: "192.168.21.1", dns: "8.8.8.8",
    },
    {
      id: "pc-2", type: "pc", name: "PC 2", position: { x: 60, y: 620 },
      interfaces: [{ name: "eth0", mac: mac(65), ip: "192.168.21.11", prefix: 24 }], gateway: "192.168.21.1", dns: "8.8.8.8",
    },
    {
      id: "server-1", type: "server", name: t("Servidor local"), description: t("DHCP de la oficina"),
      position: { x: 60, y: 460 },
      interfaces: [{ name: "eth0", mac: mac(66), ip: "192.168.21.2", prefix: 24 }, { name: "eth1", mac: mac(67) }],
      gateway: "192.168.21.1", dns: "8.8.8.8",
      services: {
        dhcp: [
          { network: "192.168.21.0/24", start: "192.168.21.100", end: "192.168.21.199", gateway: "192.168.21.1", dns: "8.8.8.8" },
          { network: "192.168.31.0/24", start: "192.168.31.100", end: "192.168.31.199", gateway: "192.168.31.1", dns: "8.8.8.8" },
        ],
      },
    },
    {
      id: "ap-1", type: "ap", name: "AP 1", position: { x: 300, y: 680 },
      interfaces: [{ name: "eth0", mac: mac(80) }, ...Array.from({ length: 4 }, (_, i) => ({ name: `wlan${i}`, mac: mac(81 + i) }))],
    },
    {
      id: "smartphone-1", type: "phone", name: "Smartphone 1", position: { x: 560, y: 680 },
      description: t("Toma su dirección por DHCP"),
      interfaces: [{ name: "wlan0", mac: mac(96), dhcp: true }],
    },
    {
      id: "laptop-1", type: "laptop", name: "Laptop 1", position: { x: 820, y: 460 },
      interfaces: [{ name: "eth0", mac: mac(112), ip: "192.168.31.8", prefix: 24 }], gateway: "192.168.31.1", dns: "8.8.8.8",
    },
  ],
  links: [
    { id: "l1", a: { device: "isp", interface: "eth0" }, b: { device: "router-1", interface: "Gi0/0" } },
    { id: "l2", a: { device: "isp", interface: "eth1" }, b: { device: "dns", interface: "eth0" } },
    { id: "l3", a: { device: "router-1", interface: "Gi0/1" }, b: { device: "switch-1", interface: "Fa0/1" } },
    { id: "l4", a: { device: "router-1", interface: "Gi0/2" }, b: { device: "laptop-1", interface: "eth0" } },
    { id: "l5", a: { device: "switch-1", interface: "Fa0/2" }, b: { device: "pc-1", interface: "eth0" } },
    { id: "l6", a: { device: "switch-1", interface: "Fa0/3" }, b: { device: "pc-2", interface: "eth0" } },
    { id: "l7", a: { device: "switch-1", interface: "Fa0/4" }, b: { device: "ap-1", interface: "eth0" } },
    { id: "l8", a: { device: "ap-1", interface: "wlan0" }, b: { device: "smartphone-1", interface: "wlan0" } },
    { id: "l9", a: { device: "switch-1", interface: "Fa0/5" }, b: { device: "server-1", interface: "eth0" } },
  ],
});
