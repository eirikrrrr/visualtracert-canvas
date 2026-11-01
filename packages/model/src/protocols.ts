// The protocols the machines use, each with a page of its own: a machine shows
// its protocols as tags, and a tag opens the protocol's page. What a page is
// made of is the same in every language and lives here (its layer, how it
// travels, the sections of the guides that explain it, its standards); its
// texts (name, summary, the content of its own) are in each language's guides
// module (./guides), as the guides' are.
import type { GuideTier } from "./guides/types";

export type ProtocolId = "ethernet" | "arp" | "ipv4" | "icmp" | "vlan" | "routing" | "tcp" | "udp" | "dhcp" | "dns" | "http";

export interface Protocol {
  id: ProtocolId;
  /** its layer in the OSI model */
  layer: 2 | 3 | 4 | 7;
  /** how it travels: "UDP 67/68", "IP 1"…; none for Ethernet */
  carrier?: string;
  icon: string;
  color: string;
  /** the guides' sections that explain it, in reading order */
  sections: [GuideTier, string][];
  /** its standards and manuals */
  references: { title: string; url: string }[];
}

const rfc = (n: number, title: string) => ({ title: `RFC ${n} — ${title}`, url: `https://www.rfc-editor.org/rfc/rfc${n}` });

export const PROTOCOLS: Protocol[] = [
  {
    id: "ethernet", layer: 2, icon: "switch", color: "#c9902a",
    sections: [["fundamentals", "mac"], ["references", "ethernet-frame"], ["concepts", "switching"], ["concepts", "domains"]],
    references: [{ title: "IEEE 802.3 — Ethernet (Wikipedia)", url: "https://en.wikipedia.org/wiki/IEEE_802.3" }, { title: "Ethernet frame (Wikipedia)", url: "https://en.wikipedia.org/wiki/Ethernet_frame" }],
  },
  {
    id: "arp", layer: 2, carrier: "Ethernet 0x0806", icon: "switch", color: "#e0a12b",
    sections: [["fundamentals", "arp"], ["fundamentals", "journey"]],
    references: [rfc(826, "An Ethernet Address Resolution Protocol"), rfc(5227, "IPv4 Address Conflict Detection")],
  },
  {
    id: "ipv4", layer: 3, carrier: "Ethernet 0x0800", icon: "topology", color: "#3d7eff",
    sections: [["fundamentals", "ipv4"], ["fundamentals", "masks"], ["references", "ipv4-header"], ["references", "subnetting"]],
    references: [rfc(791, "Internet Protocol"), rfc(1918, "Address Allocation for Private Internets"), rfc(4632, "Classless Inter-domain Routing (CIDR)")],
  },
  {
    id: "icmp", layer: 3, carrier: "IP 1", icon: "ping", color: "#4f8cff",
    sections: [["concepts", "icmp"], ["references", "troubleshooting"]],
    references: [rfc(792, "Internet Control Message Protocol"), { title: "ping(8)", url: "https://man7.org/linux/man-pages/man8/ping.8.html" }],
  },
  {
    id: "vlan", layer: 2, carrier: "Ethernet 0x8100", icon: "switch", color: "#9b6dff",
    sections: [["concepts", "vlan"], ["concepts", "domains"]],
    references: [{ title: "IEEE 802.1Q (Wikipedia)", url: "https://en.wikipedia.org/wiki/IEEE_802.1Q" }, { title: "bridge(8) — VLAN filtering on Linux", url: "https://man7.org/linux/man-pages/man8/bridge.8.html" }],
  },
  {
    id: "routing", layer: 3, icon: "router", color: "#e2832b",
    sections: [["fundamentals", "gateway"], ["concepts", "routing"], ["references", "linux"], ["references", "routeros"]],
    references: [rfc(1812, "Requirements for IP Version 4 Routers"), { title: "ip-route(8)", url: "https://man7.org/linux/man-pages/man8/ip-route.8.html" }],
  },
  {
    id: "tcp", layer: 4, carrier: "IP 6", icon: "emulation", color: "#ff8f5a",
    sections: [["concepts", "ports"], ["concepts", "tcp"], ["concepts", "tcp-reliable"], ["concepts", "tcp-close"], ["references", "tcp-header"]],
    references: [rfc(9293, "Transmission Control Protocol"), rfc(7323, "TCP Extensions for High Performance")],
  },
  {
    id: "udp", layer: 4, carrier: "IP 17", icon: "emulation", color: "#ff8f5a",
    sections: [["concepts", "ports"], ["concepts", "udp"], ["references", "udp-header"]],
    references: [rfc(768, "User Datagram Protocol"), rfc(8085, "UDP Usage Guidelines")],
  },
  {
    id: "dhcp", layer: 7, carrier: "UDP 67/68", icon: "server", color: "#0fa5b5",
    sections: [["concepts", "dhcp"]],
    references: [rfc(2131, "Dynamic Host Configuration Protocol"), rfc(2132, "DHCP Options and BOOTP Vendor Extensions"), { title: "dnsmasq — manual", url: "https://thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html" }],
  },
  {
    id: "dns", layer: 7, carrier: "UDP/TCP 53", icon: "globe", color: "#33c9c9",
    sections: [["concepts", "dns"]],
    references: [rfc(1034, "Domain Names — Concepts and Facilities"), rfc(1035, "Domain Names — Implementation and Specification"), { title: "dig and nslookup (BIND 9 manual pages)", url: "https://bind9.readthedocs.io/en/latest/manpages.html" }],
  },
  {
    id: "http", layer: 7, carrier: "TCP 80 / 443", icon: "globe", color: "#f06fb0",
    sections: [["concepts", "ports"], ["concepts", "tcp"]],
    references: [rfc(9110, "HTTP Semantics"), rfc(9112, "HTTP/1.1"), { title: "HTTP (MDN Web Docs)", url: "https://developer.mozilla.org/docs/Web/HTTP" }],
  },
];

export const protocolById = (id: string) => PROTOCOLS.find(item => item.id === id);
