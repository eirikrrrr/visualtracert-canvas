import { describe, expect, it } from "vitest";
import { parse, serialize, TEMPLATES, templateById, type Topology } from "@visual-tracert/model";
import { applyLease, simulate, simulatePing, type SimRequest } from "./engine";

const open = (id: string) => templateById(id)!.build();
const ok = (topology: Topology, request: SimRequest) => simulate(topology, request).outcome;
/** a DHCP request whose address stays in the topology, as the app does */
const leased = (topology: Topology, from: string) => {
  const run = simulate(topology, { kind: "dhcp", from });
  expect(run.outcome.ok, run.outcome.message).toBe(true);
  return applyLease(topology, run.lease!);
};

describe("templates", () => {
  it("are about ten, with unique ids", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(TEMPLATES.map(item => item.id)).size).toBe(TEMPLATES.length);
  });

  it.each(TEMPLATES.map(item => [item.id, item] as const))("%s is a valid document with unique MACs", (_id, item) => {
    const topology = item.build();
    const parsed = parse(serialize(topology, "yaml"), "yaml");
    expect(parsed.problems).toEqual([]);
    expect(parsed.topology).toEqual(topology);
    const macs = topology.devices.flatMap(device => device.interfaces.map(iface => iface.mac));
    expect(new Set(macs).size).toBe(macs.length);
    expect(topology.description).toMatch(/Qué probar/);
  });

  it("LAN básica: same network, no router", () => {
    expect(ok(open("lan-basica"), { kind: "ping", from: "pc-1", to: "192.168.1.13" }).ok).toBe(true);
    expect(ok(open("lan-basica"), { kind: "ping", from: "pc-1", to: "192.168.1.99" }).message).toMatch(/ARP/);
  });

  it("Dos redes: through the router, TTL 1 expires", () => {
    const topology = open("dos-redes");
    expect(ok(topology, { kind: "ping", from: "pc-a1", to: "192.168.20.11" }).ok).toBe(true);
    expect(ok(topology, { kind: "ping", from: "pc-a1", to: "192.168.20.11", ttl: 1 }).message).toMatch(/TTL/);
  });

  it("VLAN: inside a VLAN yes, across no", () => {
    const topology = open("vlans");
    expect(ok(topology, { kind: "ping", from: "ventas-1", to: "192.168.1.12" }).ok).toBe(true);
    expect(ok(topology, { kind: "ping", from: "ventas-1", to: "192.168.1.21" }).ok).toBe(false);
  });

  it("Inter-VLAN: the router joins them in one hop", () => {
    const topology = open("inter-vlan");
    expect(ok(topology, { kind: "ping", from: "pc-10a", to: "10.10.20.11" }).ok).toBe(true);
    expect(simulate(topology, { kind: "traceroute", from: "pc-10b", to: "10.10.20.50" }).outcome.message).toMatch(/2 saltos/);
  });

  it("Tres routers: the trace shows R1, R2, R3 and the server", () => {
    const run = simulate(open("cadena-routers"), { kind: "traceroute", from: "pc", to: "172.16.3.10" });
    expect(run.outcome.ok).toBe(true);
    expect(run.outcome.message).toMatch(/4 saltos/);
  });

  it("Sucursales: the intranet from a branch, and branch to branch", () => {
    const topology = open("sucursales");
    expect(ok(topology, { kind: "http", from: "pc-norte", to: "intranet.empresa.lan" }).ok).toBe(true);
    expect(ok(topology, { kind: "ping", from: "pc-norte", to: "10.2.0.10" }).ok).toBe(true);
  });

  it("Oficina con DHCP: every device gets a different address", () => {
    let topology = open("oficina-dhcp");
    for(const id of ["pc-1", "pc-2", "laptop", "tablet"]) topology = leased(topology, id);
    const addresses = ["pc-1", "pc-2", "laptop", "tablet"].map(id => topology.devices.find(device => device.id === id)!.interfaces[0].ip);
    expect(addresses).toEqual(["192.168.50.100", "192.168.50.101", "192.168.50.102", "192.168.50.103"]);
    expect(simulatePing(topology, { from: "tablet", to: "192.168.50.100" }).outcome.ok).toBe(true);
  });

  it("DHCP con relay: the clients get an address of their own network", () => {
    const run = simulate(open("dhcp-relay"), { kind: "dhcp", from: "pc-1" });
    expect(run.lease?.ip).toBe("10.30.0.100");
    expect(simulate(open("dhcp-relay"), { kind: "dhcp", from: "admin" }).lease?.ip).toBe("10.20.0.100");
  });

  it("DNS y web: page, NXDOMAIN, 404 and RST", () => {
    const topology = open("dns-web");
    expect(ok(topology, { kind: "http", from: "cliente-1", to: "www.tienda.com" }).ok).toBe(true);
    expect(ok(topology, { kind: "dns", from: "cliente-1", to: "noexiste.tienda.com" }).message).toMatch(/no existe/);
    expect(ok(topology, { kind: "http", from: "cliente-1", to: "api.tienda.com/estado" }).message).toMatch(/404/);
    expect(ok(topology, { kind: "http", from: "cliente-1", to: "dns.tienda.com" }).message).toMatch(/rechazada/);
  });

  it("Casa: the home router hands out the address, then the web works", () => {
    const topology = leased(open("casa"), "laptop");
    expect(topology.devices.find(device => device.id === "laptop")!.dns).toBe("1.1.1.1");
    expect(ok(topology, { kind: "http", from: "laptop", to: "www.noticias.com" }).ok).toBe(true);
  });

  it("Averías: the three faults show, and fixing them works", () => {
    const topology = open("averias");
    expect(ok(topology, { kind: "ping", from: "pc-a1", to: "192.168.20.11" }).ok).toBe(false);
    expect(ok(topology, { kind: "ping", from: "pc-a2", to: "192.168.20.11" }).message).toMatch(/192\.168\.10\.254/);
    expect(ok(topology, { kind: "ping", from: "pc-b1", to: "192.168.20.12" }).ok).toBe(false);
    const fixed: Topology = {
      ...topology,
      devices: topology.devices.map(device =>
        device.id === "r2" ? { ...device, routes: [{ prefix: "192.168.10.0/24", via: "10.9.9.1" }] }
          : device.id === "pc-a2" ? { ...device, gateway: "192.168.10.1" }
          : device.id === "switch-b" ? { ...device, interfaces: device.interfaces.map(iface => ({ ...iface, vlan: undefined })) }
          : device),
    };
    expect(ok(fixed, { kind: "ping", from: "pc-a1", to: "192.168.20.11" }).ok).toBe(true);
    expect(ok(fixed, { kind: "ping", from: "pc-a2", to: "192.168.20.11" }).ok).toBe(true);
    expect(ok(fixed, { kind: "ping", from: "pc-b1", to: "192.168.20.12" }).ok).toBe(true);
  });
});
