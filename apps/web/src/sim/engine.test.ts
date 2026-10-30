import { describe, expect, it } from "vitest";
import { exampleTopology, updateDevice, type Topology } from "@visual-tracert/model";
import { applyLease, simulate, simulatePing } from "./engine";

const path = (_topology: Topology, run: ReturnType<typeof simulatePing>) =>
  run.events.filter(event => event.from).map(event => `${event.protocol} ${event.from}→${event.to}`);

describe("simulatePing", () => {
  it("pings a host of the same LAN through a switch: ARP first, then ICMP", () => {
    const topology = exampleTopology();
    const run = simulatePing(topology, { from: "pc-1", to: "192.168.21.11" });
    expect(run.outcome.ok).toBe(true);
    const hops = path(topology, run);
    // ARP request reaches the switch, is flooded, PC 2 answers
    expect(hops[0]).toBe("ARP pc-1→switch-1");
    expect(hops).toContain("ARP switch-1→pc-2");
    expect(hops).toContain("ARP pc-2→switch-1");
    // the echo and its reply go only to their port once the switch learned them
    expect(hops.filter(hop => hop.startsWith("ICMP"))).toEqual([
      "ICMP pc-1→switch-1", "ICMP switch-1→pc-2", "ICMP pc-2→switch-1", "ICMP switch-1→pc-1",
    ]);
    expect(run.outcome.rtt).toBeGreaterThan(0);
  });

  it("floods an unknown destination but forwards a learned one", () => {
    const run = simulatePing(exampleTopology(), { from: "pc-1", to: "192.168.21.11" });
    const flood = run.events.find(event => event.to === "switch-1" && event.protocol === "ARP");
    expect(flood?.result).toBe("flooded");
    const reply = run.events.find(event => event.to === "switch-1" && event.frame.ip?.icmp?.type === "echo-reply");
    expect(reply?.result).toBe("forwarded");
  });

  it("crosses the router to the other LAN, with the TTL lowered by one", () => {
    const run = simulatePing(exampleTopology(), { from: "pc-1", to: "192.168.31.8" });
    expect(run.outcome.ok).toBe(true);
    const arrived = run.events.find(event => event.to === "laptop-1" && event.frame.ip?.icmp?.type === "echo-request");
    expect(arrived?.frame.ip?.ttl).toBe(63);
    // the router asked for the laptop's MAC on its second LAN
    expect(run.events.some(event => event.from === "router-1" && event.frame.arp?.targetIp === "192.168.31.8")).toBe(true);
    expect(run.outcome.message).toMatch(/Respuesta de 192\.168\.31\.8/);
  });

  it("reaches the ISP through the default route", () => {
    const run = simulatePing(exampleTopology(), { from: "laptop-1", to: "203.0.113.1" });
    expect(run.outcome.ok).toBe(true);
  });

  it("fails without a gateway, before anything leaves the PC", () => {
    const topology = updateDevice(exampleTopology(), "pc-1", device => ({ ...device, gateway: undefined }));
    const run = simulatePing(topology, { from: "pc-1", to: "192.168.31.8" });
    expect(run.outcome.ok).toBe(false);
    expect(run.outcome.message).toMatch(/puerta de enlace/);
    expect(run.events).toHaveLength(1);
  });

  it("reports an unanswered ARP for an address nobody has", () => {
    const run = simulatePing(exampleTopology(), { from: "pc-1", to: "192.168.21.99" });
    expect(run.outcome.ok).toBe(false);
    expect(run.outcome.message).toMatch(/Nadie respondió al ARP/);
  });

  it("gets 'destination unreachable' from a router without a route", () => {
    const topology = updateDevice(exampleTopology(), "router-1", device => ({ ...device, routes: [] }));
    const run = simulatePing(topology, { from: "pc-1", to: "8.8.8.8" });
    expect(run.outcome.ok).toBe(false);
    expect(run.outcome.message).toMatch(/inalcanzable/);
  });

  it("gets 'time exceeded' when the TTL runs out", () => {
    const run = simulatePing(exampleTopology(), { from: "pc-1", to: "203.0.113.1", ttl: 1 });
    expect(run.outcome.ok).toBe(false);
    expect(run.outcome.message).toMatch(/TTL/);
  });

  it("keeps VLANs apart on a switch", () => {
    const topology = updateDevice(exampleTopology(), "switch-1", device => ({
      ...device,
      interfaces: device.interfaces.map(port => port.name === "Fa0/3" ? { ...port, vlan: 20 } : port),
    }));
    const run = simulatePing(topology, { from: "pc-1", to: "192.168.21.11" });
    expect(run.outcome.ok).toBe(false);
    expect(run.events.some(event => event.to === "pc-2")).toBe(false);
  });

  it("does not let a frame leave a port without a cable", () => {
    const topology = { ...exampleTopology(), links: exampleTopology().links.filter(link => link.id !== "l5") };
    const run = simulatePing(topology, { from: "pc-1", to: "192.168.21.11" });
    expect(run.outcome.ok).toBe(false);
    expect(run.events[0].notes.join(" ")).toMatch(/no tiene cable/);
  });
});

describe("DHCP", () => {
  it("gets an address from the server of its LAN: Discover, Offer, Request, ACK", () => {
    const run = simulate(exampleTopology(), { kind: "dhcp", from: "smartphone-1" });
    expect(run.outcome.ok).toBe(true);
    expect(run.lease).toEqual({ device: "smartphone-1", iface: "wlan0", ip: "192.168.21.100", prefix: 24, gateway: "192.168.21.1", dns: "8.8.8.8" });
    const ops = run.events.filter(event => event.protocol === "DHCP" && (event.to === "server-1" || event.to === "smartphone-1"))
      .map(event => event.frame.ip!.udp!.dhcp!.op);
    expect(ops).toEqual(["discover", "discover", "offer", "request", "ack"]);
    // the discover is a broadcast: the switch floods it, the other hosts ignore it
    expect(run.events.some(event => event.to === "pc-1" && event.protocol === "DHCP" && event.result === "dropped")).toBe(true);
    expect(run.console.join("\n")).toMatch(/192\.168\.21\.100/);
  });

  it("crosses a router with a relay (ip helper) and gets an address of its own network", () => {
    const run = simulate(exampleTopology(), { kind: "dhcp", from: "laptop-1" });
    expect(run.outcome.ok).toBe(true);
    expect(run.lease?.ip).toBe("192.168.31.100");
    expect(run.lease?.gateway).toBe("192.168.31.1");
    const relayed = run.events.find(event => event.to === "server-1" && event.frame.ip?.udp?.dhcp?.op === "discover");
    expect(relayed?.frame.ip?.udp?.dhcp?.giaddr).toBe("192.168.31.1");
    expect(relayed?.frame.ip?.dst).toBe("192.168.21.2");
  });

  it("stops at a router without a relay", () => {
    const topology = updateDevice(exampleTopology(), "router-1", device => ({
      ...device, interfaces: device.interfaces.map(iface => ({ ...iface, relay: undefined })),
    }));
    const run = simulate(topology, { kind: "dhcp", from: "laptop-1" });
    expect(run.outcome.ok).toBe(false);
    expect(run.outcome.message).toMatch(/Ningún servidor DHCP/);
    expect(run.events.find(event => event.to === "router-1")?.notes.join(" ")).toMatch(/no tiene relay/);
  });

  it("does not hand out an address that is already in use", () => {
    const topology = updateDevice(exampleTopology(), "pc-2", device => ({
      ...device, interfaces: device.interfaces.map(iface => ({ ...iface, ip: "192.168.21.100" })),
    }));
    expect(simulate(topology, { kind: "dhcp", from: "smartphone-1" }).lease?.ip).toBe("192.168.21.101");
  });

  it("puts the lease into the topology, after which the device can ping", () => {
    const first = exampleTopology();
    expect(simulatePing(first, { from: "smartphone-1", to: "192.168.21.10" }).outcome.message).toMatch(/DHCP/);
    const run = simulate(first, { kind: "dhcp", from: "smartphone-1" });
    const leased = applyLease(first, run.lease!);
    expect(simulatePing(leased, { from: "smartphone-1", to: "192.168.21.10" }).outcome.ok).toBe(true);
  });
});

describe("DNS", () => {
  it("resolves a name with the DNS server across the network", () => {
    const run = simulate(exampleTopology(), { kind: "dns", from: "pc-1", to: "www.ejemplo.com" });
    expect(run.outcome.ok).toBe(true);
    expect(run.outcome.message).toMatch(/8\.8\.8\.8/);
    const answer = run.events.find(event => event.to === "pc-1" && event.frame.ip?.udp?.dns?.response);
    expect(answer?.frame.ip?.udp?.dns?.answer).toBe("8.8.8.8");
  });

  it("says when a name does not exist", () => {
    const run = simulate(exampleTopology(), { kind: "dns", from: "pc-1", to: "nada.ejemplo.com" });
    expect(run.outcome.ok).toBe(false);
    expect(run.outcome.message).toMatch(/no existe/);
  });

  it("gets 'port unreachable' from a host that is not a DNS server", () => {
    const topology = updateDevice(exampleTopology(), "pc-1", device => ({ ...device, dns: "192.168.21.11" }));
    const run = simulate(topology, { kind: "dns", from: "pc-1", to: "www.ejemplo.com" });
    expect(run.outcome.ok).toBe(false);
    expect(run.outcome.message).toMatch(/no es un servidor DNS/);
    expect(run.events.some(event => event.frame.ip?.icmp?.type === "unreachable" && event.frame.ip.icmp.code === 3)).toBe(true);
  });

  it("lets ping use a name", () => {
    const run = simulatePing(exampleTopology(), { from: "pc-1", to: "www.ejemplo.com" });
    expect(run.outcome.ok).toBe(true);
    expect(run.events[0].protocol).toBe("DNS");
    expect(run.console[0]).toMatch(/www\.ejemplo\.com \[8\.8\.8\.8\]/);
  });

  it("needs a DNS server to use names", () => {
    const topology = updateDevice(exampleTopology(), "pc-1", device => ({ ...device, dns: undefined }));
    expect(simulatePing(topology, { from: "pc-1", to: "www.ejemplo.com" }).outcome.message).toMatch(/no tiene servidor DNS/);
  });
});

describe("traceroute", () => {
  it("lists every router up to the destination", () => {
    const run = simulate(exampleTopology(), { kind: "traceroute", from: "pc-1", to: "8.8.8.8" });
    expect(run.outcome.ok).toBe(true);
    const hops = run.console.slice(1).filter(line => /^\s+\d/.test(line));
    expect(hops).toHaveLength(3);
    // each router answers from the interface the probe came in by
    expect(hops[0]).toMatch(/192\.168\.21\.1 \(Router 1\)/);
    expect(hops[1]).toMatch(/203\.0\.113\.1 \(ISP\)/);
    expect(hops[2]).toMatch(/8\.8\.8\.8/);
  });

  it("marks hops that do not answer and gives up", () => {
    const run = simulate(exampleTopology(), { kind: "traceroute", from: "pc-1", to: "192.168.21.99" });
    expect(run.outcome.ok).toBe(false);
    expect(run.outcome.message).toMatch(/ARP/);
    expect(run.console.filter(line => line.includes("*"))).toHaveLength(3);
  });
});

describe("HTTP over TCP", () => {
  it("opens a connection, gets the page and closes it", () => {
    const run = simulate(exampleTopology(), { kind: "http", from: "pc-1", to: "www.ejemplo.com" });
    expect(run.outcome.ok).toBe(true);
    expect(run.outcome.message).toMatch(/200 OK/);
    const atServer = run.events.filter(event => event.to === "dns" && event.frame.ip?.tcp).map(event => event.frame.ip!.tcp!.flags.join(","));
    expect(atServer).toEqual(["SYN", "ACK", "PSH,ACK", "ACK", "FIN,ACK", "ACK"]);
    // the last ACK reaches the server before the run ends
    expect(run.events[run.events.length - 1].notes.join(" ")).toMatch(/conexión queda cerrada/);
  });

  it("is refused (RST) by a host without a web server", () => {
    const run = simulate(exampleTopology(), { kind: "http", from: "pc-1", to: "192.168.21.11" });
    expect(run.outcome.ok).toBe(false);
    expect(run.outcome.message).toMatch(/rechazada/);
  });

  it("gets 404 for a page that does not exist", () => {
    const run = simulate(exampleTopology(), { kind: "http", from: "pc-1", to: "www.ejemplo.com/nada" });
    expect(run.outcome.ok).toBe(false);
    expect(run.outcome.message).toMatch(/404/);
  });
});
