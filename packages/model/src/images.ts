// The container images devices run as in the emulation: what each one is,
// what it brings and where it comes from (its official pages), shown in the
// properties of a device. A generic device (a PC, a router) runs on one of
// them too: its icon is generic, its system is this image's.
import { tx } from "./i18n";

export type ImageId = "alpine";

export interface ImageLink {
  label: string;
  url: string;
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
}

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
    architectures: ["amd64", "arm64v8", "arm32v7", "arm32v6", "i386", "ppc64le", "riscv64", "s390x"],
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
  },
};
