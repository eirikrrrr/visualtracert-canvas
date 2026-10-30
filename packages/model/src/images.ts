// The container images devices run as in the emulation: what each one is,
// what it brings, where it comes from (its official pages) and how it runs.
// Alpine comes with the app; the others are in the Marketplace, downloaded
// on this server when wanted. A generic device (a PC, a router) runs on
// Alpine: its icon is generic, its system is Alpine's.
import { tx } from "./i18n";

export type ImageId = "alpine" | "ubuntu" | "debian" | "busybox" | "nginx" | "netshoot" | "frr" | "srlinux";

export interface ImageLink {
  label: string;
  url: string;
}

/** a CLI a device of the image can open: its shell, or a router's own */
export interface ImageShell {
  id: string;
  label: string;
  cmd: string[];
}

export interface ImageInfo {
  id: ImageId;
  name: string;
  /** what Docker pulls */
  ref: string;
  version: string;
  publisher: string;
  /** Spanish keys, translated where they are shown */
  description: string;
  base: string;
  shell: string;
  /** the network commands it has */
  tools: string[];
  architectures: string[];
  license: string;
  links: ImageLink[];
  /** with the app (no download from the Marketplace) */
  builtin: boolean;
  /** "sleep": kept running doing nothing (a shell); "image": its own command
   * (a web server, the routing daemons) */
  run: "sleep" | "image";
  /** what it needs beyond NET_ADMIN */
  caps?: string[];
  /** runs privileged: the emulator only allows it when its server says so */
  privileged?: boolean;
  /** its command, user and environment, when not the image's own */
  cmd?: string[];
  user?: string;
  env?: string[];
  /** a network OS configured through its own CLI, not with Linux's ip */
  config?: "srlinux";
  /** memory, in MB (96 when absent) */
  memory?: number;
  /** run inside it once it is wired */
  startup?: string[];
  shells: ImageShell[];
  /** how a profile installs packages on it; null, it cannot */
  packages: "apk" | "apt" | null;
  /** what to know before using it, a Spanish key */
  note?: string;
}

const sh: ImageShell = { id: "sh", label: "sh", cmd: ["/bin/sh", "-l"] };
const bash: ImageShell = { id: "bash", label: "bash", cmd: ["/bin/bash", "-l"] };
const ARCH_ALL = ["amd64", "arm64v8", "arm32v7", "arm32v6", "i386", "ppc64le", "riscv64", "s390x"];

export const IMAGES: Record<ImageId, ImageInfo> = {
  alpine: {
    id: "alpine",
    name: "Alpine Linux",
    ref: "alpine:3.20",
    version: "3.20",
    publisher: tx("Imagen oficial de Docker (Docker Official Image), mantenida por el equipo de Alpine Linux"),
    description: tx("Distribución Linux mínima (unos pocos MB) pensada para contenedores: musl libc y BusyBox, con el gestor de paquetes apk."),
    base: "musl libc + BusyBox 1.36",
    shell: "/bin/sh (BusyBox ash)",
    tools: ["ip", "ping", "traceroute", "nslookup", "arp", "route", "ifconfig", "netstat", "nc", "wget", "udhcpc", "vi"],
    architectures: ARCH_ALL,
    license: tx("Imagen: MIT (Dockerfile). El sistema: licencias de cada paquete (BusyBox, GPL-2.0)."),
    links: [
      { label: tx("Docker Hub (imagen oficial)"), url: "https://hub.docker.com/_/alpine" },
      { label: tx("Código de la imagen (Dockerfile)"), url: "https://github.com/alpinelinux/docker-alpine" },
      { label: tx("Definición en Docker Official Images"), url: "https://github.com/docker-library/official-images/blob/master/library/alpine" },
      { label: tx("Web oficial de Alpine Linux"), url: "https://alpinelinux.org" },
      { label: tx("Notas de la versión 3.20"), url: "https://alpinelinux.org/posts/Alpine-3.20.0-released.html" },
      { label: tx("Paquetes de la versión 3.20"), url: "https://pkgs.alpinelinux.org/packages?branch=v3.20" },
      { label: tx("Wiki de Alpine Linux"), url: "https://wiki.alpinelinux.org" },
      { label: "BusyBox", url: "https://busybox.net" },
      { label: tx("Logo oficial (fuente del icono)"), url: "https://alpinelinux.org/alpinelinux-logo.svg" },
    ],
    builtin: true, run: "sleep", shells: [sh], packages: "apk",
  },
  ubuntu: {
    id: "ubuntu",
    name: "Ubuntu",
    ref: "ubuntu:24.04",
    version: "24.04 LTS (Noble Numbat)",
    publisher: tx("Imagen oficial de Docker (Docker Official Image), mantenida por Canonical"),
    description: tx("Ubuntu mínimo: glibc, bash y apt. Viene sin herramientas de red: instálalas con un perfil (iproute2, iputils-ping, traceroute)."),
    base: "glibc + GNU coreutils",
    shell: "/bin/bash",
    tools: [],
    architectures: ["amd64", "arm64v8", "arm32v7", "ppc64le", "riscv64", "s390x"],
    license: tx("Las licencias de cada paquete de Ubuntu (sobre todo GPL)."),
    links: [
      { label: tx("Docker Hub (imagen oficial)"), url: "https://hub.docker.com/_/ubuntu" },
      { label: tx("Código de la imagen"), url: "https://git.launchpad.net/cloud-images/+oci/ubuntu-base" },
      { label: tx("Web oficial de Ubuntu"), url: "https://ubuntu.com" },
      { label: tx("Notas de la versión 24.04"), url: "https://documentation.ubuntu.com/release-notes/24.04/" },
      { label: tx("Paquetes de la versión 24.04"), url: "https://packages.ubuntu.com/noble" },
      { label: tx("Logo (Simple Icons)"), url: "https://simpleicons.org/?q=ubuntu" },
    ],
    builtin: false, run: "sleep", shells: [bash, sh], packages: "apt",
    note: tx("Sin ip ni ping: crea un perfil con iproute2 e iputils-ping para usarlo en la red."),
  },
  debian: {
    id: "debian",
    name: "Debian",
    ref: "debian:12-slim",
    version: "12 (bookworm), slim",
    publisher: tx("Imagen oficial de Docker (Docker Official Image), mantenida por la comunidad de Debian"),
    description: tx("Debian estable en su variante reducida: glibc, bash y apt. Sin herramientas de red de serie."),
    base: "glibc + GNU coreutils",
    shell: "/bin/bash",
    tools: [],
    architectures: ["amd64", "arm64v8", "arm32v7", "arm32v5", "i386", "ppc64le", "s390x"],
    license: tx("Las licencias de cada paquete de Debian (software libre, DFSG)."),
    links: [
      { label: tx("Docker Hub (imagen oficial)"), url: "https://hub.docker.com/_/debian" },
      { label: tx("Código de la imagen"), url: "https://github.com/debuerreotype/docker-debian-artifacts" },
      { label: tx("Web de la versión 12"), url: "https://www.debian.org/releases/bookworm/" },
      { label: tx("Paquetes de la versión 12"), url: "https://packages.debian.org/bookworm/" },
      { label: tx("Logo (Simple Icons)"), url: "https://simpleicons.org/?q=debian" },
    ],
    builtin: false, run: "sleep", shells: [bash, sh], packages: "apt",
    note: tx("Sin ip ni ping: crea un perfil con iproute2 e iputils-ping para usarlo en la red."),
  },
  busybox: {
    id: "busybox",
    name: "BusyBox",
    ref: "busybox:1.37",
    version: "1.37",
    publisher: tx("Imagen oficial de Docker (Docker Official Image)"),
    description: tx("Lo mínimo posible (unos 2 MB): un solo binario con sh, ip, ping, traceroute y nslookup. Sin gestor de paquetes."),
    base: "BusyBox (uclibc/glibc)",
    shell: "/bin/sh (BusyBox ash)",
    tools: ["ip", "ping", "traceroute", "nslookup", "arp", "route", "ifconfig", "netstat", "nc", "wget", "udhcpc"],
    architectures: ARCH_ALL,
    license: "GPL-2.0",
    links: [
      { label: tx("Docker Hub (imagen oficial)"), url: "https://hub.docker.com/_/busybox" },
      { label: tx("Código de la imagen (Dockerfile)"), url: "https://github.com/docker-library/busybox" },
      { label: tx("Web oficial de BusyBox"), url: "https://busybox.net" },
    ],
    builtin: false, run: "sleep", shells: [sh], packages: null,
  },
  nginx: {
    id: "nginx",
    name: "NGINX",
    ref: "nginx:1.27-alpine",
    version: "1.27 (Alpine)",
    publisher: tx("Imagen oficial de Docker (Docker Official Image), mantenida por NGINX (F5)"),
    description: tx("Servidor web NGINX sobre Alpine: arranca sirviendo su página de bienvenida en el puerto 80."),
    base: "Alpine Linux + NGINX",
    shell: "/bin/sh (BusyBox ash)",
    tools: ["ip", "ping", "traceroute", "nslookup", "wget", "nginx"],
    architectures: ARCH_ALL,
    license: "BSD-2-Clause",
    links: [
      { label: tx("Docker Hub (imagen oficial)"), url: "https://hub.docker.com/_/nginx" },
      { label: tx("Código de la imagen (Dockerfile)"), url: "https://github.com/nginxinc/docker-nginx" },
      { label: tx("Web oficial de NGINX"), url: "https://nginx.org" },
      { label: tx("Logo (Simple Icons)"), url: "https://simpleicons.org/?q=nginx" },
    ],
    builtin: false, run: "image", shells: [sh], packages: "apk",
  },
  netshoot: {
    id: "netshoot",
    name: "netshoot",
    ref: "nicolaka/netshoot:v0.13",
    version: "0.13",
    publisher: tx("Proyecto de la comunidad (Nicola Kabar), no es una imagen oficial de Docker"),
    description: tx("La navaja suiza de redes en un contenedor: tcpdump, mtr, iperf3, nmap, dig, curl, iproute2 y muchas más."),
    base: "Alpine Linux",
    shell: "/bin/zsh, /bin/bash",
    tools: ["ip", "ping", "traceroute", "mtr", "tcpdump", "iperf3", "nmap", "dig", "curl", "ss", "tshark", "netcat"],
    architectures: ["amd64", "arm64"],
    license: "Apache-2.0",
    links: [
      { label: "Docker Hub", url: "https://hub.docker.com/r/nicolaka/netshoot" },
      { label: tx("Código (GitHub)"), url: "https://github.com/nicolaka/netshoot" },
    ],
    builtin: false, run: "sleep", shells: [{ id: "zsh", label: "zsh", cmd: ["/bin/zsh", "-l"] }, bash, sh], packages: "apk",
  },
  frr: {
    id: "frr",
    name: "FRRouting",
    ref: "quay.io/frrouting/frr:10.2.1",
    version: "10.2.1",
    publisher: tx("Imagen oficial del proyecto FRRouting (en quay.io)"),
    description: tx("Router de verdad: zebra, staticd y los demás demonios de FRR (OSPF, BGP, RIP, IS-IS…), con la CLI vtysh al estilo de Cisco."),
    base: "Alpine Linux + FRR",
    shell: "vtysh, /bin/bash",
    tools: ["vtysh", "ip", "ping", "traceroute"],
    architectures: ["amd64", "arm64", "arm32v7", "ppc64le", "s390x"],
    license: "GPL-2.0-or-later",
    links: [
      { label: tx("Imagen oficial (quay.io)"), url: "https://quay.io/repository/frrouting/frr" },
      { label: tx("Web oficial de FRRouting"), url: "https://frrouting.org" },
      { label: tx("Documentación"), url: "https://docs.frrouting.org" },
      { label: tx("Código (GitHub)"), url: "https://github.com/FRRouting/frr" },
    ],
    builtin: false, run: "image", caps: ["SYS_ADMIN"], memory: 160,
    startup: ["touch /etc/frr/vtysh.conf"],
    shells: [{ id: "vtysh", label: "vtysh", cmd: ["vtysh"] }, bash, sh], packages: "apk",
    note: tx("Necesita SYS_ADMIN dentro de su contenedor. Solo arrancan zebra, staticd y mgmtd: activa OSPF o BGP con un perfil (en /etc/frr/daemons)."),
  },
  srlinux: {
    id: "srlinux",
    name: "Nokia SR Linux",
    ref: "ghcr.io/nokia/srlinux:24.10.1",
    version: "24.10.1",
    publisher: tx("Nokia: la imagen de contenedor oficial y pública de su sistema de red"),
    description: tx("El sistema operativo de los routers y switches de centro de datos de Nokia, en un contenedor: CLI sr_cli, configuración por modelos (YANG), BGP, OSPF, IS-IS, EVPN."),
    base: "Linux + SR Linux NOS",
    shell: "sr_cli, /bin/bash",
    tools: ["sr_cli", "ping", "traceroute", "tcptraceroute"],
    architectures: ["amd64", "arm64"],
    license: tx("Propietaria de Nokia; la imagen de contenedor se puede usar libremente en laboratorios."),
    links: [
      { label: tx("Imagen oficial (GitHub Container Registry)"), url: "https://github.com/nokia/srlinux-container-image" },
      { label: tx("Aprender SR Linux (Nokia)"), url: "https://learn.srlinux.dev" },
      { label: tx("Cómo lo arranca containerlab"), url: "https://containerlab.dev/manual/kinds/srl/" },
    ],
    builtin: false, run: "image", privileged: true, memory: 2048,
    cmd: ["sudo", "bash", "-c", "touch /.dockerenv && /opt/srlinux/bin/sr_linux"], user: "0", env: ["SRLINUX=1"],
    config: "srlinux",
    shells: [{ id: "sr_cli", label: "sr_cli", cmd: ["sr_cli"] }, bash], packages: null,
    note: tx("Necesita un contenedor privilegiado (el servidor debe permitirlo: ALLOW_PRIVILEGED=1 en el emulador), unos 1,5 GB de memoria y medio minuto para arrancar. Sus puertos son e1-1… (ethernet-1/1…); las direcciones y rutas se le aplican con sr_cli."),
  },
};

/** the images the Marketplace offers, in its order */
export const MARKETPLACE: ImageId[] = ["frr", "srlinux", "netshoot", "nginx", "ubuntu", "debian", "busybox"];

/** A network OS of a vendor that cannot be offered here: its images are not
 * public (an account, a licence) or they are virtual machines. Shown in the
 * Marketplace with the official way to get one. */
export interface VendorSystem {
  id: string;
  vendor: string;
  name: string;
  /** what the image is, and why it is not downloadable here (Spanish keys) */
  form: string;
  why: string;
  links: ImageLink[];
}

export const VENDORS: VendorSystem[] = [
  { id: "cisco", vendor: "Cisco", name: "IOL · IOS XRd · IOSv",
    form: tx("IOL y XRd son contenedores; IOSv y CSR, máquinas virtuales."),
    why: tx("Sus imágenes no son públicas: vienen con Cisco Modeling Labs o una cuenta de Cisco, y son para x86_64."),
    links: [
      { label: "Cisco Modeling Labs", url: "https://www.cisco.com/c/en/us/products/cloud-systems-management/modeling-labs/index.html" },
      { label: tx("XRd: cómo conseguir la imagen"), url: "https://xrdocs.io/virtual-routing/" },
      { label: "containerlab: cisco_iol", url: "https://containerlab.dev/manual/kinds/cisco_iol/" },
      { label: "containerlab: xrd", url: "https://containerlab.dev/manual/kinds/xrd/" },
    ] },
  { id: "juniper", vendor: "Juniper", name: "cRPD · vJunos",
    form: tx("cRPD es un contenedor (solo el plano de control); vJunos, máquinas virtuales."),
    why: tx("Se descargan con una cuenta de Juniper (cRPD tiene prueba gratuita) y algunas funciones piden licencia."),
    links: [
      { label: "Juniper cRPD", url: "https://www.juniper.net/us/en/products/routers/containerized-routing-protocol-daemon-crpd.html" },
      { label: "containerlab: crpd", url: "https://containerlab.dev/manual/kinds/crpd/" },
    ] },
  { id: "arista", vendor: "Arista", name: "cEOS-lab",
    form: tx("Un contenedor con EOS completo."),
    why: tx("Es gratuito, pero se descarga con una cuenta de Arista: no está en ningún registro público."),
    links: [
      { label: tx("Descargas de Arista"), url: "https://www.arista.com/en/support/software-download" },
      { label: "containerlab: ceos", url: "https://containerlab.dev/manual/kinds/ceos/" },
    ] },
  { id: "mikrotik", vendor: "MikroTik", name: "RouterOS CHR",
    form: tx("Una máquina virtual (Cloud Hosted Router), también para ARM64."),
    why: tx("La imagen es pública y gratuita, pero es una máquina virtual: necesita QEMU dentro del contenedor (este servidor tiene KVM). Aún no se emula."),
    links: [
      { label: tx("Descargas de MikroTik"), url: "https://mikrotik.com/download" },
      { label: "Cloud Hosted Router", url: "https://help.mikrotik.com/docs/spaces/ROS/pages/18350234/Cloud+Hosted+Router+CHR" },
      { label: "containerlab: vr-ros", url: "https://containerlab.dev/manual/kinds/vr-ros/" },
    ] },
  { id: "huawei", vendor: "Huawei", name: "VRP (NE40E, CE)",
    form: tx("Máquinas virtuales."),
    why: tx("Sus imágenes no son públicas: se consiguen a través de Huawei o sus socios."),
    links: [
      { label: tx("Routers de Huawei"), url: "https://e.huawei.com/en/products/routers" },
      { label: "containerlab: huawei_vrp", url: "https://containerlab.dev/manual/kinds/huawei_vrp/" },
    ] },
  { id: "dell", vendor: "Dell", name: "Enterprise SONiC",
    form: tx("Máquinas virtuales; SONiC de la comunidad tiene una versión en contenedor (sonic-vs) para x86_64."),
    why: tx("Enterprise SONiC se descarga con una cuenta de Dell; sonic-vs se compila desde el proyecto SONiC."),
    links: [
      { label: "Dell Enterprise SONiC", url: "https://www.dell.com/en-us/shop/povw/sonic" },
      { label: tx("Proyecto SONiC"), url: "https://github.com/sonic-net/SONiC" },
      { label: "containerlab: dell_sonic", url: "https://containerlab.dev/manual/kinds/dell_sonic/" },
    ] },
];
